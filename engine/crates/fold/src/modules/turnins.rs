//! `src/main/modules/turnins.ts` — completed NPC trades / quest turn-ins.
//!
//! Offers accumulate per NPC until the matching "complete the trade" line closes the group. A trade
//! with a DIFFERENT npc than the open offer group records nothing and still drops the group, which
//! is the TS's exact shape (its `pendingOffer = null` sits outside the `if`).
//!
//! `given` is what the trade really took, for the log-only item count (fork #2): each offer with
//! its stack count, less a cancel (every open offer), an NPC's refusal (its last offer, as
//! `gaps_quest_log.rs` reads them) and an offer older than `TRADE_MS` when the next one comes (its
//! trade never completed). `items` keeps every offer as before; Sky quest crediting reads
//! `given` (`turnInCelebration.ts`), so a cancelled or refused offer is no turn-in there either.
//!
//! `back` is what the refusals took out. The log never names the item an NPC hands back, so "its
//! last offer" is a guess, and on the owner's log it was wrong: Holwin (2026-09-20) was offered the
//! three Test of Fists items with a wrong rune among them, returned the rune, and completed the
//! quest. `settleRefusals` (`turnInCelebration.ts`) puts such a row right from the quest list,
//! which this crate does not have. The field is absent on a trade with no refusal, so such a row
//! is what it always was, and a row from an older archive simply has none.

use crate::event::{Event, Kind};
use crate::message_overlay::message_text_of;
use crate::modules::gaps::quests::{refused_here, trade_cancelled, REFUSAL, TRADE_MS};
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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    back: Vec<Given>,
}

struct PendingOffer {
    npc: String,
    items: Vec<String>,
    /// (offered at, what) — the instant places a refusal on its offer.
    given: Vec<(i64, Given)>,
    /// What refusals took out of `given`, oldest refusal first.
    back: Vec<(i64, Given)>,
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
            open.back.clear();
            return;
        }
        let Some(name) = speaker_of(text) else { return };
        if !text.contains(REFUSAL)
            || !open.npc.eq_ignore_ascii_case(name)
            || !refused_here(text, self.player.as_deref())
        {
            return;
        }
        // Refusals print with the trade, at any age of the offer (every one of the owner's, to
        // 2026-11-23, within a second of its trade line), so no window applies here.
        if let Some(refused) = open.given.pop() {
            open.back.push(refused);
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
                // An offer whose trade never completed went back to the bags (`gaps_quests.rs`
                // `offered` has the same rule): it is not part of the trade that closes later.
                let ts = ev.ts();
                open.given.retain(|(at, _)| ts - at <= TRADE_MS);
                open.back.retain(|(at, _)| ts - at <= TRADE_MS);
                open.items.push(item);
                open.given.push((ts, given));
            }
            _ => {
                self.pending_offer = Some(PendingOffer {
                    npc,
                    items: vec![item],
                    given: vec![(ev.ts(), given)],
                    back: Vec::new(),
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
        match ev.kind_of() {
            // Character rebirth. A half-formed offer group goes with it.
            Kind::Epoch => {
                self.turn_ins.clear();
                self.pending_offer = None;
                self.announce.changed(self.seq);
            }
            // An offer publishes nothing: it opens or extends the pending group, which is not in
            // `snapshot()`. Handing items to an NPC and walking away leaves the ledger as it was.
            Kind::Offer => self.offer(ev),
            Kind::Unknown => self.line(ev),
            Kind::Trade => {
                let npc = ev.str("npc").unwrap_or_default();
                if let Some(open) = self.pending_offer.take() {
                    if open.npc == npc {
                        self.turn_ins.push(TurnInRow {
                            ts: ev.ts(),
                            npc: open.npc,
                            items: open.items,
                            given: open.given.into_iter().map(|(_, g)| g).collect(),
                            back: open.back.into_iter().map(|(_, g)| g).collect(),
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

    /// The owner's log, 2026-09-20: refusal lines print with the trade, however long ago the offers
    /// were made, so a refused offer leaves `given` at any age.
    #[test]
    fn a_slow_trade_refused_whole_gives_nothing() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(
            &mut m,
            r#"{"kind":"offer","seq":0,"ts":0,"raw":"o","item":"A","npc":"Sir Mollin"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"offer","seq":1,"ts":5000,"raw":"o","item":"B","npc":"Sir Mollin"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"offer","seq":2,"ts":15000,"raw":"o","item":"C","npc":"Sir Mollin"}"#,
        );
        for seq in 3..6 {
            let line = format!(
                r#"{{"kind":"unknown","seq":{seq},"ts":20000,"raw":"[x] Sir Mollin says, 'I have no need for this, Drywrought. You can have it back.'"}}"#
            );
            fold(&mut m, &line);
        }
        fold(
            &mut m,
            r#"{"kind":"trade","seq":6,"ts":20000,"raw":"t","npc":"Sir Mollin"}"#,
        );
        assert_eq!(given_of(&m), json!([]));
    }

    /// The log does not say WHICH offer a refusal handed back, so the row keeps what it took out:
    /// Holwin, 2026-09-20, kept the three Fists items and returned the wrong rune offered before them.
    #[test]
    fn a_refusal_keeps_what_it_took_out_on_the_row() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        for (seq, item) in [
            "Nebulous Sapphire",
            "Brass Knuckles",
            "Wind Rune Izah",
            "Wind Rune Neza",
        ]
        .iter()
        .enumerate()
        {
            let line = format!(
                r#"{{"kind":"offer","seq":{seq},"ts":{},"raw":"o","item":"{item}","npc":"Holwin"}}"#,
                1000 * seq
            );
            fold(&mut m, &line);
        }
        fold(
            &mut m,
            r#"{"kind":"unknown","seq":4,"ts":4000,"raw":"[x] Holwin says, 'I have no need for this, Drywrought. You can have it back.'"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"trade","seq":5,"ts":4000,"raw":"t","npc":"Holwin"}"#,
        );
        let row = &m.snapshot()["state"][0];
        assert_eq!(
            row["back"],
            json!([{ "item": "Wind Rune Neza", "count": 1 }])
        );
        assert_eq!(row["given"].as_array().map(Vec::len), Some(3));
    }

    /// An archive reads this row back: with no refusal it has exactly the fields it always had.
    #[test]
    fn a_trade_with_no_refusal_has_no_back_field() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(
            &mut m,
            r#"{"kind":"offer","seq":0,"ts":1,"raw":"o","item":"A","npc":"Holwin"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"trade","seq":1,"ts":2,"raw":"t","npc":"Holwin"}"#,
        );
        assert!(m.snapshot()["state"][0].get("back").is_none());
    }

    #[test]
    fn a_cancel_clears_what_a_refusal_took_out() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(
            &mut m,
            r#"{"kind":"offer","seq":0,"ts":1000,"raw":"o","item":"A","npc":"Holwin"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"unknown","seq":1,"ts":2000,"raw":"[x] Holwin says, 'I have no need for this, Drywrought. You can have it back.'"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"unknown","seq":2,"ts":3000,"raw":"[x] You have cancelled the trade."}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"offer","seq":3,"ts":4000,"raw":"o","item":"B","npc":"Holwin"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"trade","seq":4,"ts":5000,"raw":"t","npc":"Holwin"}"#,
        );
        assert!(m.snapshot()["state"][0].get("back").is_none());
    }

    /// The owner's log: `You must turn in all quest items at once` leaves the offers in the window.
    /// Tumpy Irontoe took a Kiola Nut, bounced it, then completed when only the Water Flask was added.
    #[test]
    fn a_bounce_leaves_the_offers_in_the_trade() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(
            &mut m,
            r#"{"kind":"offer","seq":0,"ts":0,"raw":"o","item":"Kiola Nut","npc":"Tumpy Irontoe"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"unknown","seq":1,"ts":1000,"raw":"[x] You must turn in all quest items at once in order to complete this quest."}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"offer","seq":2,"ts":3000,"raw":"o","item":"Water Flask","npc":"Tumpy Irontoe"}"#,
        );
        fold(
            &mut m,
            r#"{"kind":"trade","seq":3,"ts":5000,"raw":"t","npc":"Tumpy Irontoe"}"#,
        );
        assert_eq!(
            given_of(&m),
            json!([{ "item": "Kiola Nut", "count": 1 }, { "item": "Water Flask", "count": 1 }])
        );
    }

    #[test]
    fn an_offer_whose_trade_never_completed_is_not_given_later() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        // The giver bounced the lone rune (`You must turn in all quest items at once ...`): no trade line.
        fold(&mut m, r#"{"kind":"offer","seq":0,"ts":1000,"raw":"o","item":"Wind Rune","npc":"Kizdean Gix"}"#);
        fold(&mut m, r#"{"kind":"offer","seq":1,"ts":401000,"raw":"o","item":"Wind Rune","npc":"Kizdean Gix"}"#);
        fold(&mut m, r#"{"kind":"offer","seq":2,"ts":402000,"raw":"o","item":"Sphinx Claw","npc":"Kizdean Gix"}"#);
        fold(&mut m, r#"{"kind":"trade","seq":3,"ts":403000,"raw":"t","npc":"Kizdean Gix"}"#);
        let row = &m.snapshot()["state"][0];
        assert_eq!(
            row["given"],
            json!([{ "item": "Wind Rune", "count": 1 }, { "item": "Sphinx Claw", "count": 1 }])
        );
        assert_eq!(row["items"], json!(["Wind Rune", "Wind Rune", "Sphinx Claw"]));
    }

    #[test]
    fn offers_inside_the_trade_window_all_go_over() {
        let mut m = TurnInsModule::new(Some("Drywrought"));
        fold(&mut m, r#"{"kind":"offer","seq":0,"ts":1000,"raw":"o","item":"Wind Rune","npc":"Kizdean Gix"}"#);
        fold(&mut m, r#"{"kind":"offer","seq":1,"ts":301000,"raw":"o","item":"Sphinx Claw","npc":"Kizdean Gix"}"#);
        fold(&mut m, r#"{"kind":"trade","seq":2,"ts":302000,"raw":"t","npc":"Kizdean Gix"}"#);
        assert_eq!(
            given_of(&m),
            json!([{ "item": "Wind Rune", "count": 1 }, { "item": "Sphinx Claw", "count": 1 }])
        );
    }
}
