//! Crafting's gathering: what the log says of fishing and forage (fork #6: "Fishing and Foraging
//! also come to mind"). Line counts for the whole log and for the session, and one row per item
//! caught or scrounged.
//!
//! Measured on the owner's logs (MEASURED.md, "Fishing and forage outcomes"):
//! - A cast prints `You cast your line.` and, 11 to 30 s later, its outcome: `You caught <X>!`,
//!   `You caught something...` (a catch the game does not name) or `You didn't catch anything.`
//!   An interrupted cast prints no outcome (13 of 203), and an outcome can print with no cast
//!   line before it (4), so casts and outcomes are counted apart: a rate is taken over the
//!   outcomes, and a cast with none is never a failure.
//! - `You lost your bait!`, `You spill your beer while bringing in your line.` and `Your fishing
//!   pole broke!` were each followed, in their second, by `You didn't catch anything.` (32 of
//!   32): they say more about a cast `nothing` already counts and are not outcomes of their own.
//! - A forage prints `You have scrounged up <X>.` or `You fail to locate any food nearby.`; a
//!   refused attempt (`You must wait longer before you can forage.`) prints neither.
//! - The parser types none of these lines. The two that name an item are read by Wiki Gaps' own
//!   readers (`gaps_players.rs`), so both features spell the item the same way.
//!
//! NOT BOUNDED, and it needs no bound: a row is one distinct item name, and what a zone's water
//! or ground gives is a short list (the owner's three logs: 5 fished names, 15 to 26 foraged).

use super::crafting::Rows;
use super::gaps_players::{caught_of, forage_of};
use serde::Serialize;
use serde_json::{json, Value};

const CAST: &str = "You cast your line.";
const CAUGHT_UNNAMED: &str = "You caught something...";
const NOTHING: &str = "You didn't catch anything.";
const LOST_BAIT: &str = "You lost your bait!";
const SPILLED: &str = "You spill your beer while bringing in your line.";
const POLE_BROKE: &str = "Your fishing pole broke!";
const FORAGE_FAILED: &str = "You fail to locate any food nearby.";

/// Fishing lines, counted one by one.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FishCounts {
    pub casts: i64,
    /// Catches, the ones the game did not name included.
    pub caught: i64,
    /// `You didn't catch anything.`: the three below are among these casts.
    pub nothing: i64,
    pub lost_bait: i64,
    pub spilled: i64,
    pub pole_broke: i64,
}

/// Forage lines, counted one by one.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForageCounts {
    pub found: i64,
    pub failed: i64,
}

/// One item caught or scrounged, as the game names it (a forage's leading article dropped).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatheredRow {
    pub item: String,
    pub count: i64,
    pub last_ts: i64,
}

/// One activity's counts: the whole log, the session, and its items.
#[derive(Default)]
struct Tally<C> {
    total: C,
    session: C,
    items: Rows<GatheredRow>,
}

impl<C: Default + PartialEq + Serialize> Tally<C> {
    fn is_empty(&self) -> bool {
        self.total == C::default()
    }

    /// One line counted, on the log and on the session.
    fn count(&mut self, bump: impl Fn(&mut C)) -> bool {
        bump(&mut self.total);
        bump(&mut self.session);
        true
    }

    fn item(&mut self, item: &str, ts: i64) {
        let row = self.items.entry(item, || GatheredRow { item: item.to_string(), ..GatheredRow::default() });
        row.count += 1;
        row.last_ts = ts;
    }

    /// Zero the session. True when it held anything.
    fn end_session(&mut self) -> bool {
        std::mem::take(&mut self.session) != C::default()
    }

    /// The counts, with `session` and `items` beside them; nothing when the log had no line.
    fn served(&self) -> Option<Value> {
        if self.is_empty() {
            return None;
        }
        let mut state = json!(self.total);
        state["session"] = json!(self.session);
        state["items"] = json!(self.items.list());
        Some(state)
    }
}

#[derive(Default)]
pub struct Gather {
    fishing: Tally<FishCounts>,
    forage: Tally<ForageCounts>,
}

impl Gather {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    pub fn is_empty(&self) -> bool {
        self.fishing.is_empty() && self.forage.is_empty()
    }

    /// Zero both sessions. True when either held anything.
    pub fn end_session(&mut self) -> bool {
        self.fishing.end_session() | self.forage.end_session()
    }

    /// A line the parser left unknown. True when it was a fishing or a forage line.
    pub fn line(&mut self, text: &str, ts: i64) -> bool {
        // Every shape opens with `You`; most unknown lines do not.
        if !text.starts_with("You") {
            return false;
        }
        self.fished(text, ts) || self.foraged(text, ts)
    }

    fn fished(&mut self, text: &str, ts: i64) -> bool {
        let fishing = &mut self.fishing;
        if let Some(item) = caught_of(text) {
            fishing.item(item, ts);
            return fishing.count(|c| c.caught += 1);
        }
        match text {
            CAST => fishing.count(|c| c.casts += 1),
            CAUGHT_UNNAMED => fishing.count(|c| c.caught += 1),
            NOTHING => fishing.count(|c| c.nothing += 1),
            LOST_BAIT => fishing.count(|c| c.lost_bait += 1),
            SPILLED => fishing.count(|c| c.spilled += 1),
            POLE_BROKE => fishing.count(|c| c.pole_broke += 1),
            _ => false,
        }
    }

    fn foraged(&mut self, text: &str, ts: i64) -> bool {
        if let Some(item) = forage_of(text) {
            self.forage.item(item, ts);
            return self.forage.count(|c| c.found += 1);
        }
        text == FORAGE_FAILED && self.forage.count(|c| c.failed += 1)
    }

    pub fn fishing(&self) -> Option<Value> {
        self.fishing.served()
    }

    pub fn forage(&self) -> Option<Value> {
        self.forage.served()
    }
}
