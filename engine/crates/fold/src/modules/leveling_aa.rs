//! The leveling module's two kinds of AA ownership evidence that are not purchase lines: the
//! character's latest `/alt list` run, and the AAs the log shows the player activating.
//!
//! THE RUN (MEASURED.md, "Alternate advancement"). Each AA prints a three-line block (`aaList` events:
//! header `value`+`ability`, then `text`, then `cost`), every block of one run inside about a second.
//! A header more than `RUN_GAP_MS` after the run's last line starts a new run, and so does the run's
//! FIRST id coming round again (every measured run opens on `#1`), unless it is back to back (an AA
//! owned but not maxed prints current and next rank as two blocks in a row). Any other repeated id
//! stays in the run: a list taken right after a purchase printed Pottery Mastery's two blocks and,
//! seventy blocks later, a third (owner's 15:44 list, MEASURED.md). A new run replaces the old whole.
//! Reading a rank out of a block is the app's (`src/shared/aaList.ts`), which holds the AA table.
//!
//! The run also records the last zone-in before it (`zoneBefore`): a list is stale until a zone or a
//! loadout swap after a purchase (MEASURED.md), so the app lets a purchase with no zone-in between
//! it and the run beat the run.
//!
//! USED: what the player's own lines show them using, every name, AA or not (the app keeps only
//! names its AA table has; `Skull Bash` is a skill): `You activate X.` (`aaActivate`); `You begin
//! casting X II.` (`castBegin`, rank from the numeral); `You can use the ability X again in ...`,
//! `You disable X.`, `Your X combat ability is interrupted.` (`aaOwned`); and `(Finishing Blow)` on
//! the player's own melee hit. The first stamp per name, and the highest rank a line named.
//! A name seen only in casts with no numeral is marked `castOnly`: an AA's cast carries its numeral
//! (`Divine Aura I`), a spell of the same name (a Cleric's level-1 Divine Aura) does not.
//!
//! No last stamp is published: a repeat announces nothing (Heroic Leap's reuse line, 20,000 in the
//! owner's log, and every cast of a spell already seen), so a field a repeat moved would change the
//! published state under an unmoved cursor. Clients and the engine's kept answer both trust that
//! cursor; until 2026-11-27 a `last` stamp moved on every repeat and both served it stale.

use crate::event::{Event, Key, Kind};
use eqlog::names::{spell_rank, strip_rank_tail};
use serde::Serialize;

/// Lines of one run further apart than this belong to two runs (one run prints in about 1 s).
const RUN_GAP_MS: i64 = 2_000;

#[derive(Debug, Clone, Serialize)]
pub struct AaListBlock {
    id: i64,
    name: String,
    description: String,
    cost: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AaListRun {
    /// The first header's stamp.
    ts: i64,
    blocks: Vec<AaListBlock>,
    /// The last zone-in before the run; null when the log showed none.
    zone_before: Option<i64>,
    /// The run's last line, for the gap test. Not published.
    #[serde(skip)]
    last_ts: i64,
}

impl AaListRun {
    fn continues(&self, ts: i64, id: i64) -> bool {
        if ts - self.last_ts > RUN_GAP_MS {
            return false;
        }
        let first = self.blocks.first().map(|b| b.id);
        let prev = self.blocks.last().map(|b| b.id);
        first != Some(id) || prev == Some(id)
    }
}

/// Folds one `aaList` line into the latest run (`zone`: the last zone-in so far). Returns whether the
/// published run changed.
pub fn fold_list_line(run: &mut Option<AaListRun>, ev: &Event, zone: Option<i64>) -> bool {
    let ts = ev.ts();
    if let Some(id) = ev.int(Key::Value) {
        let name = ev.str(Key::Ability).unwrap_or_default().to_string();
        let block = AaListBlock {
            id,
            name,
            description: String::new(),
            cost: None,
        };
        match run {
            Some(r) if r.continues(ts, id) => {
                r.blocks.push(block);
                r.last_ts = ts;
            }
            _ => {
                *run = Some(AaListRun {
                    ts,
                    blocks: vec![block],
                    zone_before: zone,
                    last_ts: ts,
                })
            }
        }
        return true;
    }
    // A description or cost line belongs to the header just before it, in the same run.
    let Some(r) = run.as_mut().filter(|r| ts - r.last_ts <= RUN_GAP_MS) else {
        return false;
    };
    let Some(block) = r.blocks.last_mut() else {
        return false;
    };
    if let Some(text) = ev.str(Key::Text) {
        if !block.description.is_empty() {
            return false;
        }
        block.description = text.to_string();
    } else if let Some(cost) = ev.int(Key::Cost) {
        if block.cost.is_some() {
            return false;
        }
        block.cost = Some(cost);
    } else {
        return false;
    }
    r.last_ts = ts;
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct AaActivation {
    name: String,
    first: i64,
    /// The highest rank a line named (`Rampage II`); absent when none did.
    #[serde(skip_serializing_if = "Option::is_none")]
    rank: Option<i64>,
    /// Every line so far was a cast with no numeral (`You begin casting Divine Aura.`): a spell may
    /// share the name (the app drops these for its AA names that are spells). Published only while true.
    #[serde(rename = "castOnly", skip_serializing_if = "std::ops::Not::not")]
    cast_only: bool,
}

const FINISHING_BLOW: &str = "Finishing Blow";

/// The name (and rank) a line shows the player using, or None. A damage line counts only when it is
/// the player's own melee hit carrying `(Finishing Blow)`: the raw tail is the cheap gate, as this is
/// asked of every hit.
fn used(ev: &Event) -> Option<(String, Option<i64>)> {
    match ev.kind_of() {
        Kind::AaActivate | Kind::AaOwned => Some((ev.str(Key::Name)?.to_string(), None)),
        Kind::CastBegin => {
            let spell = ev.str(Key::Spell)?;
            let rank = spell_rank(spell);
            let name = strip_rank_tail(spell.trim()).trim().to_string();
            Some((name, (rank > 0).then_some(rank)))
        }
        Kind::Damage if ev.raw().ends_with("Finishing Blow)") => {
            let own = ev.str(Key::Attacker) == Some("You") && ev.str(Key::Dtype) == Some("melee");
            let fb = ev.arr_str(Key::Modifiers).contains(&FINISHING_BLOW);
            (own && fb).then(|| (FINISHING_BLOW.to_string(), None))
        }
        _ => None,
    }
}

/// Folds one line that may show the player using something. Returns true only for a name not seen
/// before, a higher rank, or a bare cast proved by another line; nothing else changes the published
/// entry, so a repeat (Heroic Leap's reuse line, 20,000 in the owner's log) never refetches the whole
/// history and never moves the state behind the cursor's back.
pub fn fold_used(seen: &mut Vec<AaActivation>, ev: &Event) -> bool {
    let Some((name, rank)) = used(ev).filter(|(n, _)| !n.is_empty()) else {
        return false;
    };
    let ts = ev.ts();
    let bare = rank.is_none() && ev.kind_of() == Kind::CastBegin;
    if let Some(a) = seen.iter_mut().find(|a| a.name == name) {
        let higher = rank > a.rank;
        if higher {
            a.rank = rank;
        }
        let proved = a.cast_only && !bare;
        if proved {
            a.cast_only = false;
        }
        return higher || proved;
    }
    seen.push(AaActivation {
        name,
        first: ts,
        rank,
        cast_only: bare,
    });
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(json: &str) -> Event<'static> {
        Event::from_json(json).expect("event")
    }

    fn header(ts: i64, id: i64, name: &str) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"aaList","seq":1,"ts":{ts},"raw":"h","value":{id},"ability":"{name}"}}"#
        ))
    }

    fn text(ts: i64, t: &str) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"aaList","seq":1,"ts":{ts},"raw":"d","text":"{t}"}}"#
        ))
    }

    fn cost(ts: i64, c: i64) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"aaList","seq":1,"ts":{ts},"raw":"c","cost":{c}}}"#
        ))
    }

    fn block(run: &mut Option<AaListRun>, ts: i64, id: i64, name: &str, t: &str, c: i64) {
        assert!(fold_list_line(run, &header(ts, id, name), None));
        assert!(fold_list_line(run, &text(ts, t), None));
        assert!(fold_list_line(run, &cost(ts, c), None));
    }

    #[test]
    fn a_run_joins_its_blocks_and_keeps_a_current_and_next_rank_pair() {
        let mut run = None;
        block(&mut run, 1000, 40, "Combat Fury", "by 5%.", 4);
        block(&mut run, 1000, 15073, "Banestrike", "by 2%.", 0);
        block(&mut run, 1000, 15073, "Banestrike", "by 4%.", 0);
        let r = run.as_ref().unwrap();
        assert_eq!(r.blocks.len(), 3);
        assert_eq!(r.blocks[0].name, "Combat Fury");
        assert_eq!(r.blocks[0].description, "by 5%.");
        assert_eq!(r.blocks[0].cost, Some(4));
        assert_eq!(r.blocks[2].description, "by 4%.");
    }

    #[test]
    fn a_later_run_replaces_the_earlier_one_on_a_gap_or_its_first_id_again() {
        let mut run = None;
        block(&mut run, 1000, 40, "Combat Fury", "by 1%.", 1);
        block(&mut run, 1000, 4, "Quick Buff", "q", 5);
        // Two seconds later is still the same run; more is a new one.
        block(&mut run, 5000, 40, "Combat Fury", "by 5%.", 4);
        let r = run.as_ref().unwrap();
        assert_eq!((r.ts, r.blocks.len(), r.blocks[0].cost), (5000, 1, Some(4)));
        // Within the second, the run's first id again (not back to back) starts a new run.
        block(&mut run, 5000, 4, "Quick Buff", "q", 5);
        block(&mut run, 5000, 40, "Combat Fury", "by 2%.", 2);
        let r = run.as_ref().unwrap();
        assert_eq!(r.blocks.len(), 1);
        assert_eq!(r.blocks[0].description, "by 2%.");
    }

    #[test]
    fn a_repeated_id_further_into_the_run_stays_in_it() {
        // The stale-list shape: Pottery's current and next blocks, other AAs, then a third Pottery.
        let mut run = None;
        block(&mut run, 1000, 1, "Innate Eminence", "by 10 points.", 3);
        block(&mut run, 1000, 328, "Pottery Mastery", "by 25%.", 4);
        block(&mut run, 1000, 328, "Pottery Mastery", "by 50%.", 6);
        block(&mut run, 1000, 329, "Tailoring Mastery", "by 50%.", 6);
        block(
            &mut run,
            1000,
            328,
            "Pottery Mastery",
            "by 50% and 5 points.",
            20,
        );
        assert_eq!(run.unwrap().blocks.len(), 5);
    }

    #[test]
    fn a_stray_description_or_cost_line_changes_nothing() {
        let mut run = None;
        assert!(!fold_list_line(&mut run, &text(1000, "lone"), None));
        block(&mut run, 1000, 40, "Combat Fury", "by 5%.", 4);
        assert!(!fold_list_line(&mut run, &text(9000, "late"), None));
        assert!(!fold_list_line(&mut run, &cost(1000, 9), None));
        assert_eq!(run.unwrap().blocks[0].cost, Some(4));
    }

    #[test]
    fn an_activation_is_new_once_and_then_changes_nothing() {
        let mut seen = Vec::new();
        let act = |ts: i64, n: &str| {
            ev(&format!(
                r#"{{"kind":"aaActivate","seq":1,"ts":{ts},"raw":"a","name":"{n}"}}"#
            ))
        };
        assert!(fold_used(&mut seen, &act(1000, "Quick Buff")));
        assert!(!fold_used(&mut seen, &act(9000, "Quick Buff")));
        assert!(fold_used(&mut seen, &act(9500, "Skull Bash")));
        assert_eq!(seen[0].first, 1000);
        assert_eq!(seen.len(), 2);
    }

    #[test]
    fn a_run_records_the_last_zone_in_before_it() {
        let mut run = None;
        assert!(fold_list_line(
            &mut run,
            &header(5000, 1, "Innate Eminence"),
            Some(1200)
        ));
        assert_eq!(run.unwrap().zone_before, Some(1200));
    }

    #[test]
    fn a_cast_names_its_rank_and_a_higher_one_announces_again() {
        let mut seen = Vec::new();
        let cast = |ts: i64, spell: &str| {
            ev(&format!(
                r#"{{"kind":"castBegin","seq":1,"ts":{ts},"raw":"c","spell":"{spell}"}}"#
            ))
        };
        assert!(fold_used(&mut seen, &cast(1000, "Rampage I")));
        assert!(!fold_used(&mut seen, &cast(2000, "Rampage I")));
        assert!(fold_used(&mut seen, &cast(3000, "Rampage II")));
        assert!(!fold_used(&mut seen, &cast(4000, "Rampage I")));
        assert_eq!(
            (seen[0].name.as_str(), seen[0].rank, seen[0].first),
            ("Rampage", Some(2), 1000)
        );
        assert!(fold_used(&mut seen, &cast(5000, "Origin")));
        assert_eq!(seen[1].rank, None);
    }

    #[test]
    fn the_reuse_line_counts_and_twenty_thousand_of_it_announce_once() {
        let mut seen = Vec::new();
        let reuse = |ts: i64| {
            ev(&format!(
                r#"{{"kind":"aaOwned","seq":1,"ts":{ts},"raw":"r","name":"Heroic Leap"}}"#
            ))
        };
        let announced = (0..20_000)
            .filter(|i| fold_used(&mut seen, &reuse(*i)))
            .count();
        assert_eq!((announced, seen.len()), (1, 1));
    }

    #[test]
    fn finishing_blow_counts_only_on_the_players_own_melee_hit() {
        let mut seen = Vec::new();
        let hit = |attacker: &str| {
            ev(&format!(
                r#"{{"kind":"damage","seq":1,"ts":1,"raw":"{attacker} punch a rock golem for 9 points of damage. (Finishing Blow)","attacker":"{attacker}","target":"a rock golem","amount":9,"dtype":"melee","modifiers":["Finishing Blow"]}}"#
            ))
        };
        assert!(!fold_used(&mut seen, &hit("Malkil")));
        assert!(fold_used(&mut seen, &hit("You")));
        assert_eq!(seen[0].name, "Finishing Blow");
    }

    /// The announce contract the engine's kept answer and every client rely on: a line that does not
    /// announce leaves the published entries exactly as they were. A `last` stamp once moved on every
    /// repeat without announcing, and the kept `leveling` answer went stale (2026-11-27).
    #[test]
    fn a_line_that_does_not_announce_leaves_the_published_entries_unchanged() {
        let line = |kind: &str, field: &str, ts: i64, value: &str| {
            ev(&format!(
                r#"{{"kind":"{kind}","seq":1,"ts":{ts},"raw":"x","{field}":"{value}"}}"#
            ))
        };
        let stream = [
            ("castBegin", "spell", "Divine Aura"),
            ("aaOwned", "name", "Heroic Leap"),
            ("castBegin", "spell", "Rampage I"),
            ("castBegin", "spell", "Divine Aura"),
            ("aaOwned", "name", "Heroic Leap"),
            ("aaActivate", "name", "Divine Aura"),
            ("castBegin", "spell", "Rampage II"),
            ("castBegin", "spell", "Rampage I"),
            ("aaActivate", "name", "Heroic Leap"),
            ("castBegin", "spell", "Divine Aura"),
        ];
        let mut seen = Vec::new();
        let mut quiet = 0;
        for (i, (kind, field, value)) in stream.iter().enumerate() {
            let before = serde_json::to_value(&seen).unwrap();
            let ts = 1000 * (i64::try_from(i).unwrap() + 1);
            if !fold_used(&mut seen, &line(kind, field, ts, value)) {
                quiet += 1;
                assert_eq!(
                    serde_json::to_value(&seen).unwrap(),
                    before,
                    "{kind} {value} at {ts} announced nothing but moved the published entries"
                );
            }
        }
        assert_eq!(quiet, 5, "the stream holds five repeats");
    }

    #[test]
    fn a_name_seen_only_in_a_bare_cast_is_cast_only_until_another_line_names_it() {
        let mut seen = Vec::new();
        let cast = |ts: i64, spell: &str| {
            ev(&format!(
                r#"{{"kind":"castBegin","seq":1,"ts":{ts},"raw":"c","spell":"{spell}"}}"#
            ))
        };
        let act = |ts: i64, n: &str| {
            ev(&format!(
                r#"{{"kind":"aaActivate","seq":1,"ts":{ts},"raw":"a","name":"{n}"}}"#
            ))
        };
        // A Cleric's level-1 spell: seen, but only as a cast with no numeral.
        assert!(fold_used(&mut seen, &cast(1000, "Divine Aura")));
        assert!(seen[0].cast_only);
        assert!(!fold_used(&mut seen, &cast(2000, "Divine Aura")));
        // `You activate Divine Aura.` proves it, and announces.
        assert!(fold_used(&mut seen, &act(3000, "Divine Aura")));
        assert!(!seen[0].cast_only);
        // A bare cast after that does not take it back.
        assert!(!fold_used(&mut seen, &cast(4000, "Divine Aura")));
        assert!(!seen[0].cast_only);
        // A ranked cast is never cast-only, and clears a bare one.
        assert!(fold_used(&mut seen, &cast(5000, "Rampage I")));
        assert!(!seen[1].cast_only);
        assert!(fold_used(&mut seen, &cast(6000, "Stoicism")));
        assert!(fold_used(&mut seen, &cast(7000, "Stoicism II")));
        assert!(!seen[2].cast_only);
        // Published as `castOnly`, only while true.
        let json = serde_json::to_value(&seen).unwrap();
        assert_eq!(json[0].get("castOnly"), None);
        let mut bare = Vec::new();
        fold_used(&mut bare, &cast(1, "Divine Aura"));
        assert_eq!(serde_json::to_value(&bare).unwrap()[0]["castOnly"], true);
    }
}
