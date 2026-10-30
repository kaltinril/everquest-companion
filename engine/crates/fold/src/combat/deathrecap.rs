//! Death recap: what hit you, and what healed you, in the seconds before you died.
//!
//! Two short rings of raw facts — every landed hit on you and every heal on you — kept only for the
//! last `RECAP_WINDOW_MS` of log time. Your death line freezes both into one recap, stamped with the
//! fight it happened in (if one was open) and the zone stay. Grouping and totals are the renderer's
//! (`src/shared/deathRecap.ts`); this file only remembers.
//!
//! Every hit on you is kept, whoever the engine credited it to: the recap answers "what killed me",
//! and that includes damage no meter row owns (a fall, a tick from a mob the fight forgot).

use crate::combat::aggregate::DamageEvent;
use crate::combat::routing::HealLine;
use crate::combat::state::EngineState;
use eqlog::names::id_key_ref;
use serde::Serialize;
use std::collections::VecDeque;

/// How far back a recap reaches from the death line.
pub const RECAP_WINDOW_MS: i64 = 15_000;
/// How many deaths are remembered. A memory bound: the Combat tab shows the selected fight's.
pub const RECAP_CAP: usize = 40;

/// One landed hit on you. `source` is the attacker as the log printed it, or `Environment`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapHit {
    pub ts: i64,
    pub source: String,
    pub ability: String,
    pub amount: i64,
    pub crit: bool,
}

/// One heal on you. `spell` is absent when the line named none.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapHeal {
    pub ts: i64,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spell: Option<String>,
    pub amount: i64,
}

/// One of your deaths and the window before it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathRecap {
    pub ts: i64,
    /// Absent for the killerless `You died.` (a damage-over-time tick landed the blow).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub killer: Option<String>,
    pub window_ms: i64,
    pub hits: Vec<RecapHit>,
    pub heals: Vec<RecapHeal>,
    /// The fight open at the death, which is how the Combat tab finds it.
    #[serde(skip)]
    pub fight_id: Option<String>,
    /// The zone stay's sequence number: the live stay is `zone_seq + 1`, a finalized one `zs<n>`.
    #[serde(skip)]
    pub zone_stay: u64,
}

/// Where a death happened: the fight open at the time and the zone stay.
pub struct DeathPlace {
    pub fight_id: Option<String>,
    pub zone_stay: u64,
}

#[derive(Debug, Default)]
pub struct DeathRecaps {
    hits: VecDeque<RecapHit>,
    heals: VecDeque<RecapHeal>,
    deaths: VecDeque<DeathRecap>,
}

impl DeathRecaps {
    pub fn hit(&mut self, hit: RecapHit) {
        let ts = hit.ts;
        self.hits.push_back(hit);
        self.prune(ts);
    }

    pub fn heal(&mut self, heal: RecapHeal) {
        let ts = heal.ts;
        self.heals.push_back(heal);
        self.prune(ts);
    }

    /// Your death line: freeze the window into a recap and start the rings over.
    pub fn died(&mut self, ts: i64, killer: Option<String>, place: DeathPlace) {
        self.prune(ts);
        self.deaths.push_back(DeathRecap {
            ts,
            killer,
            window_ms: RECAP_WINDOW_MS,
            hits: self.hits.drain(..).collect(),
            heals: self.heals.drain(..).collect(),
            fight_id: place.fight_id,
            zone_stay: place.zone_stay,
        });
        if self.deaths.len() > RECAP_CAP {
            self.deaths.pop_front();
        }
    }

    /// The deaths inside one selection: a fight id (`e<n>`), the live stay (`zone`) or a finalized
    /// stay (`zs<n>`). Oldest first.
    pub fn for_selection(&self, selected: &str, live_stay: u64) -> Vec<&DeathRecap> {
        let stay = match selected {
            "zone" => Some(live_stay),
            s => s.strip_prefix("zs").and_then(|n| n.parse::<u64>().ok()),
        };
        self.deaths
            .iter()
            .filter(|d| match stay {
                Some(n) => d.zone_stay == n,
                None => d.fight_id.as_deref() == Some(selected),
            })
            .collect()
    }

    fn prune(&mut self, now: i64) {
        let floor = now - RECAP_WINDOW_MS;
        while self.hits.front().is_some_and(|h| h.ts < floor) {
            self.hits.pop_front();
        }
        while self.heals.front().is_some_and(|h| h.ts < floor) {
            self.heals.pop_front();
        }
    }
}

/// A landed hit, kept when it landed on you.
pub fn note_hit(st: &mut EngineState, ev: &DamageEvent<'_>) {
    if ev.amount <= 0 || id_key_ref(ev.target) != "you" {
        return;
    }
    st.recaps.hit(RecapHit {
        ts: ev.ts,
        source: ev.attacker.to_string(),
        ability: ev.skill.to_string(),
        amount: ev.amount,
        crit: ev.crit,
    });
}

/// A heal, kept when it landed on you (`You` or your own name).
pub fn note_heal(st: &mut EngineState, ev: &HealLine) {
    let target = id_key_ref(&ev.target);
    let on_you = target == "you" || st.player_key.as_deref() == Some(target.as_ref());
    if ev.amount <= 0 || !on_you {
        return;
    }
    st.recaps.heal(RecapHeal {
        ts: ev.ts,
        source: ev.healer.clone().unwrap_or_else(|| "Unknown".to_string()),
        spell: ev.spell.clone(),
        amount: ev.amount,
    });
}

/// Your death line.
pub fn note_death(st: &mut EngineState, ts: i64, killer: Option<&str>) {
    let place = DeathPlace {
        fight_id: st
            .fresh_encounter_id(ts)
            .then(|| st.current.as_ref().map(|e| e.id.clone()))
            .flatten(),
        zone_stay: st.zone_seq + 1,
    };
    st.recaps.died(ts, killer.map(str::to_string), place);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(ts: i64, amount: i64) -> RecapHit {
        RecapHit {
            ts,
            source: "a tree snake".into(),
            ability: "Bite".into(),
            amount,
            crit: false,
        }
    }

    fn place(fight: &str, stay: u64) -> DeathPlace {
        DeathPlace {
            fight_id: Some(fight.into()),
            zone_stay: stay,
        }
    }

    #[test]
    fn a_recap_keeps_only_the_window_before_the_death() {
        let mut r = DeathRecaps::default();
        r.hit(hit(1_000, 5));
        r.hit(hit(20_000, 7));
        r.died(30_000, Some("a tree snake".into()), place("e3", 1));
        let d = r.for_selection("e3", 1);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].hits.len(), 1);
        assert_eq!(d[0].hits[0].amount, 7);
        // The rings start over: the next death does not inherit this one's hits.
        r.died(31_000, None, place("e4", 1));
        assert!(r.for_selection("e4", 1)[0].hits.is_empty());
    }

    #[test]
    fn a_selection_finds_its_fight_or_its_zone_stay() {
        let mut r = DeathRecaps::default();
        r.died(1_000, None, place("e1", 1));
        r.died(2_000, None, place("e2", 2));
        assert_eq!(r.for_selection("e2", 2).len(), 1);
        assert_eq!(r.for_selection("zs1", 2).len(), 1);
        assert_eq!(r.for_selection("zone", 2)[0].ts, 2_000);
        assert!(r.for_selection("e9", 2).is_empty());
    }
}
