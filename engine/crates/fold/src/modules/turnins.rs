//! `src/main/modules/turnins.ts` — completed NPC trades / quest turn-ins.
//!
//! Offers accumulate per NPC until the matching "complete the trade" line closes the group. A trade
//! with a DIFFERENT npc than the open offer group records nothing and still drops the group, which
//! is the TS's exact shape (its `pendingOffer = null` sits outside the `if`).
//!
//! `given` is what the trade really took, for the log-only item count (fork #2): each offer with
//! its stack count, less a cancel (every open offer) and an NPC's refusal (its last offer, as
//! `gaps_quest_log.rs` reads them). `items` keeps every offer as before; Sky quest crediting reads
//! `given` (`turnInCelebration.ts`), so a cancelled or refused offer is no turn-in there either.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::gaps::quests::{refused_here, trade_cancelled, REFUSAL, REFUSE_MS};
use crate::modules::gaps_players::speaker_of;
use crate::EqModule;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize)]
pub struct Given {
    item: String,
    count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TurnInRow {
    ts: i64,
    npc: String,
    items: Vec<String>,
    given: Vec<Given>,
}

struct PendingOffer {
    npc: String,
    items: Vec<String>,
    /// (offered at, what) — the instant places a refusal on its offer.
    given: Vec<(i64, Given)>,
}

#[derive(Default)]
pub struct TurnInsModule {
    turn_ins: Vec<TurnInRow>,
    pending_offer: Option<PendingOffer>,
    seq: i64,
    /// The log's character: a refusal naming someone else hands back their item, not ours.
    player: Option<String>,
    /// The announce cursor — see [`crate::announce`]. `pending_offer` is not published state: a
    /// handed-over item is a half-formed group nobody can read until the trade closes it.
    announce: crate::announce::Announce,
}

impl TurnInsModule {
    pub fn new(player: Option<&str>) -> Self {
        Self {
            player: player.map(str::to_string),
            ..Self::default()
        }
    }

    /// A cancel or a refusal while a trade is open: what it takes back from `given`.
    fn line(&mut self, ev: &Event) {
        let Some(open) = self.pending_offer.as_mut() else {
            return;
        };
        let text = message_text_of(ev.raw());
        if trade_cancelled(text) {
            open.given.clear();
            return;
        }
        let Some(name) = speaker_of(text) else { return };
        if !text.contains(REFUSAL)
            || !open.npc.eq_ignore_ascii_case(name)
            || !refused_here(text, self.player.as_deref())
        {
            return;
        }
        let ts = ev.ts();
        if let Some(i) = open.given.iter().rposition(|(at, _)| ts - at <= REFUSE_MS) {
            open.given.remove(i);
        }
    }

    fn offer(&mut self, ev: &Event) {
        let npc = ev.str("npc").unwrap_or_default().to_string();
        let item = ev.str("item").unwrap_or_default().to_string();
        let given = Given {
            item: item.clone(),
            count: ev.int("count").unwrap_or(1),
        };
        match self.pending_offer.as_mut() {
            Some(open) if open.npc == npc => {
                open.items.push(item);
                open.given.push((ev.ts(), given));
            }
            _ => {
                self.pending_offer = Some(PendingOffer {
                    npc,
                    items: vec![item],
                    given: vec![(ev.ts(), given)],
                })
            }
        }
    }
}

impl EqModule for TurnInsModule {
    fn id(&self) -> &'static str {
        "turnins"
    }

    fn reset(&mut self) {
        self.turn_ins.clear();
        self.pending_offer = None;
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        match ev.kind() {
            // Character rebirth. A half-formed offer group goes with it.
            "epoch" => {
                self.turn_ins.clear();
                self.pending_offer = None;
                self.announce.changed(self.seq);
            }
            // An offer publishes nothing: it opens or extends the pending group, which is not in
            // `snapshot()`. Handing items to an NPC and walking away leaves the ledger as it was.
            "offer" => self.offer(ev),
            "unknown" => self.line(ev),
            "trade" => {
                let npc = ev.str("npc").unwrap_or_default();
                if let Some(open) = self.pending_offer.take() {
                    if open.npc == npc {
                        self.turn_ins.push(TurnInRow {
                            ts: ev.ts(),
                            npc: open.npc,
                            items: open.items,
                            given: open.given.into_iter().map(|(_, g)| g).collect(),
                        });
                        self.announce.changed(self.seq);
                    }
                }
            }
            _ => {}
        }
    }

    /// Moves on the trade that CLOSED a group, not on every line that passed by. See `announce`.
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        json!({ "seq": self.seq, "state": self.turn_ins })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fold(m: &mut TurnInsModule, line: &str) {
        m.on_event(&Event::from_json(line).expect("object"), false);
    }

    fn given_of(m: &TurnInsModule) -> Value {
        m.snapshot()["state"][0]["given"].clone()
    }

    #[test]
    fn a_stack_goes_over_with_its_count() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(&mut m, r#"{"kind":"offer","seq":0,"ts":1,"raw":"o","item":"Wind Rune Kala","npc":"Kizdean Gix","count":5}"#);
        fold(&mut m, r#"{"kind":"trade","seq":1,"ts":2,"raw":"t","npc":"Kizdean Gix"}"#);
        assert_eq!(given_of(&m), json!([{ "item": "Wind Rune Kala", "count": 5 }]));
    }

    #[test]
    fn a_cancelled_trade_gives_nothing_and_items_keep_their_old_reading() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(&mut m, r#"{"kind":"offer","seq":0,"ts":1,"raw":"o","item":"Mushroom","npc":"a froglok"}"#);
        fold(&mut m, r#"{"kind":"unknown","seq":1,"ts":2,"raw":"[Thu Oct 22 23:28:58 2026] You have cancelled the trade."}"#);
        fold(&mut m, r#"{"kind":"offer","seq":2,"ts":3,"raw":"o","item":"Bone Chips","npc":"a froglok"}"#);
        fold(&mut m, r#"{"kind":"trade","seq":3,"ts":4,"raw":"t","npc":"a froglok"}"#);
        let row = &m.snapshot()["state"][0];
        assert_eq!(row["items"], json!(["Mushroom", "Bone Chips"]));
        assert_eq!(row["given"], json!([{ "item": "Bone Chips", "count": 1 }]));
    }

    #[test]
    fn a_refusal_hands_back_the_last_offer_and_only_ours() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(&mut m, r#"{"kind":"offer","seq":0,"ts":1000,"raw":"o","item":"Wind Rune","npc":"Lord Ollix Everling"}"#);
        fold(&mut m, r#"{"kind":"offer","seq":1,"ts":2000,"raw":"o","item":"Jenni's Robe","npc":"Lord Ollix Everling"}"#);
        fold(&mut m, r#"{"kind":"unknown","seq":2,"ts":3000,"raw":"[x] Lord Ollix Everling says, 'I have no need for this, Bacon. You can have it back.'"}"#);
        fold(&mut m, r#"{"kind":"unknown","seq":3,"ts":3000,"raw":"[x] Lord Ollix Everling says, 'I have no need for this, Drywrought. You can have it back.'"}"#);
        fold(&mut m, r#"{"kind":"trade","seq":4,"ts":3000,"raw":"t","npc":"Lord Ollix Everling"}"#);
        assert_eq!(given_of(&m), json!([{ "item": "Wind Rune", "count": 1 }]));
    }
}
