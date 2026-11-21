//! Crafting: what the log says of the player's tradeskill combines (fork #6). Compact aggregates
//! only, no per-combine list: one row per item combined, the runs of combines (spans, for pace),
//! what merchants were paid and paid back, and the depot stock the game last stated. Fishing and
//! forage outcomes ride in the same snapshot (`crafting_gather.rs`).
//!
//! Measured on the owner's archive (MEASURED.md, "Combines in detail"):
//! - A combine's line never names its tradeskill. A raise printed in the combine's second does,
//!   before the line or after it, and a failed combine can raise too. The pairing is Wiki Gaps'
//!   own (`gaps_craft.rs` `Combines`), shared rather than written twice.
//! - `You can no longer advance your skill from making this item.` prints before a trivial
//!   combine, made or failed, in its second or the one before.
//! - A skill line can restate the level it already gave (`skills.rs`): that is not a raise.
//! - `Sorry, but you don't have everything you need for this recipe ...` is a refused attempt and
//!   the by-product line (`... create an alternate product: Bottle.`) rides on a combine already
//!   counted. Neither is a combine. The by-product line prints in its combine's second (4 of 4,
//!   each after a failed Brewing combine) and is counted on that combine's item.

use super::crafting_gather::Gather;
use super::crafting_money::{consumed_of, Money};
use super::crafting_spans::Spans;
use super::gaps::craft::{alternate_product_of, failed_combine_of, is_tradeskill, Combines};
use crate::event::{Event, Key, Kind};
use crate::message_overlay::message_text_of;
use crate::EqModule;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

const TRIVIAL_NOTICE: &str = "You can no longer advance your skill from making this item.";
/// The notice belongs to a combine in its second or the next one.
const TRIVIAL_WINDOW_MS: i64 = 1_000;
/// A by-product line belongs to the combine of its second or the one before.
const BY_PRODUCT_WINDOW_MS: i64 = 1_000;

fn is_zero(n: &i64) -> bool {
    *n == 0
}

/// Rows by name, in the order the log first named them.
pub(super) struct Rows<T> {
    list: Vec<T>,
    at: HashMap<String, usize>,
}

impl<T> Default for Rows<T> {
    fn default() -> Self {
        Rows { list: Vec::new(), at: HashMap::new() }
    }
}

impl<T> Rows<T> {
    /// The row filed under `name`, made by `make` when the log had not named it yet.
    pub(super) fn entry(&mut self, name: &str, make: impl FnOnce() -> T) -> &mut T {
        let at = match self.at.get(name) {
            Some(at) => *at,
            None => {
                self.at.insert(name.to_string(), self.list.len());
                self.list.push(make());
                self.list.len() - 1
            }
        };
        &mut self.list[at]
    }

    pub(super) fn get_mut(&mut self, name: &str) -> Option<&mut T> {
        self.at.get(name).map(|at| &mut self.list[*at])
    }

    pub(super) fn list(&self) -> &[T] {
        &self.list
    }

    pub(super) fn is_empty(&self) -> bool {
        self.list.is_empty()
    }

    pub(super) fn clear(&mut self) {
        self.list.clear();
        self.at.clear();
    }
}

/// One item the player combined, as the game names it.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemRow {
    pub item: String,
    pub made: i64,
    pub failed: i64,
    /// By-product lines its combines printed (`... create an alternate product: Bottle.`);
    /// absent when none did.
    #[serde(skip_serializing_if = "is_zero")]
    pub by_products: i64,
    /// Combines the game's trivial notice preceded; 0 when it was never printed for the item.
    pub trivial: i64,
    /// The newest such combine.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trivial_ts: Option<i64>,
    /// Raises paired with a combine of the item.
    pub raises: i64,
    /// The level its first and its newest raise stated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_raise: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_raise: Option<i64>,
    /// The client's spelling, once a skill line named it; absent for an item that never raised.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tradeskill: Option<String>,
    pub first_ts: i64,
    pub last_ts: i64,
    /// The same counts since the newest offline gap.
    pub session_made: i64,
    pub session_failed: i64,
    pub session_raises: i64,
}

/// One tradeskill's level as this log stated it. The first line is kept apart because the fold
/// counts it as a raise, having nothing to compare it with; only a join with an older log can
/// tell it repeated that log's level (`mergeCrafting.ts`).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelRow {
    pub skill: String,
    pub value: i64,
    pub first_value: i64,
    pub first_ts: i64,
    /// The item that first line's raise was credited to, when it paired with a combine.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_item: Option<String>,
    /// No offline gap has followed the first line: the session columns still count it.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub first_in_session: bool,
}

/// The newest tradeskill line, waiting for the combine of its second.
struct Tick {
    value: i64,
    /// False when it restated the stored level.
    raise: bool,
    /// The skill's first line in this log.
    first: bool,
}

#[derive(Default)]
pub struct CraftingModule {
    items: Rows<ItemRow>,
    levels: Rows<LevelRow>,
    spans: Spans,
    money: Money,
    gather: Gather,
    /// The last tradeskill line and the last combine, each waiting for the other in its second.
    pairing: Combines,
    tick: Option<Tick>,
    /// When the trivial notice was last printed and not yet claimed by a combine.
    trivial_at: Option<i64>,
    /// The newest combine, for the by-product line that may follow it.
    last_combine: Option<(i64, String)>,
    zone: Option<String>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl CraftingModule {
    pub fn new() -> Self {
        Self::default()
    }

    /// A same-name rebirth: everything counted belongs to the character before it. True when
    /// there was anything.
    fn clear(&mut self) -> bool {
        let had = !(self.items.is_empty() && self.levels.is_empty() && self.money.is_empty() && self.gather.is_empty());
        self.gather.clear();
        self.items.clear();
        self.levels.clear();
        self.spans.clear();
        self.money.clear();
        self.pairing.clear();
        self.tick = None;
        self.trivial_at = None;
        self.last_combine = None;
        had
    }

    /// Zero the session columns. True when any row had some.
    fn end_session(&mut self) -> bool {
        let mut changed = false;
        for row in &mut self.items.list {
            if row.session_made != 0 || row.session_failed != 0 || row.session_raises != 0 {
                (row.session_made, row.session_failed, row.session_raises) = (0, 0, 0);
                changed = true;
            }
        }
        for level in &mut self.levels.list {
            changed |= std::mem::take(&mut level.first_in_session);
        }
        changed | self.gather.end_session()
    }

    /// A combine of `item`, made or failed. Always a change.
    fn combine(&mut self, item: &str, made: bool, ts: i64) -> bool {
        let trivial = self.trivial_at.take().is_some_and(|at| (0..=TRIVIAL_WINDOW_MS).contains(&(ts - at)));
        let row = self.items.entry(item, || ItemRow { item: item.to_string(), first_ts: ts, ..ItemRow::default() });
        row.last_ts = ts;
        if made {
            row.made += 1;
            row.session_made += 1;
        } else {
            row.failed += 1;
            row.session_failed += 1;
        }
        if trivial {
            row.trivial += 1;
            row.trivial_ts = Some(ts);
        }
        self.spans.combine(ts, made);
        self.last_combine = Some((ts, item.to_string()));
        if let Some(skill) = self.pairing.combined(ts, item.to_string()) {
            if let Some(tick) = self.tick.take() {
                self.credit(item, &skill, &tick);
            }
        }
        true
    }

    /// A skill line. Only a tradeskill's is read; true when it changed what is served.
    fn skill_line(&mut self, ev: &Event) -> bool {
        let (Some(skill), Some(value)) = (ev.str(Key::Skill).filter(|s| is_tradeskill(s)), ev.int(Key::Value)) else {
            return false;
        };
        let ts = ev.ts();
        let tick = match self.levels.get_mut(skill) {
            Some(level) => {
                let raise = level.value != value;
                level.value = value;
                Tick { value, raise, first: false }
            }
            None => {
                let make = || LevelRow { skill: skill.to_string(), value, first_value: value, first_ts: ts, first_item: None, first_in_session: true };
                self.levels.entry(skill, make);
                Tick { value, raise: true, first: true }
            }
        };
        let changed = tick.raise;
        match self.pairing.skill_up(ts, skill) {
            Some(item) => self.credit(&item, skill, &tick) | changed,
            None => {
                self.tick = Some(tick);
                changed
            }
        }
    }

    /// The tradeskill line `tick` belongs to a combine of `item`: the item learns its tradeskill,
    /// and a real raise is counted on the item and on the span the combine is in.
    fn credit(&mut self, item: &str, skill: &str, tick: &Tick) -> bool {
        let Some(row) = self.items.get_mut(item) else {
            return false;
        };
        let named = row.tradeskill.as_deref() != Some(skill);
        if named {
            row.tradeskill = Some(skill.to_string());
        }
        if !tick.raise {
            return named;
        }
        row.raises += 1;
        row.session_raises += 1;
        row.first_raise.get_or_insert(tick.value);
        row.last_raise = Some(tick.value);
        self.spans.raise(skill);
        if tick.first {
            if let Some(level) = self.levels.get_mut(skill) {
                level.first_item = Some(item.to_string());
            }
        }
        true
    }

    /// A by-product line: counted on the item of the combine it rode on, and on nothing when no
    /// combine is that near. Never a combine of its own.
    fn by_product(&mut self, ts: i64) -> bool {
        let near = |at: &i64| (0..=BY_PRODUCT_WINDOW_MS).contains(&(ts - at));
        let Some((_, item)) = self.last_combine.as_ref().filter(|(at, _)| near(at)) else {
            return false;
        };
        let Some(row) = self.items.get_mut(item) else {
            return false;
        };
        row.by_products += 1;
        true
    }

    /// The lines the parser leaves unknown: a failed combine, the trivial notice, a depot draw,
    /// a combine's by-product, a fishing or a forage line.
    fn line(&mut self, text: &str, ts: i64) -> bool {
        if let Some(item) = failed_combine_of(text) {
            return self.combine(item, false, ts);
        }
        if text == TRIVIAL_NOTICE {
            self.trivial_at = Some(ts);
            return false;
        }
        if let Some(c) = consumed_of(text) {
            return self.money.consumed(&c, ts);
        }
        if alternate_product_of(text).is_some() {
            return self.by_product(ts);
        }
        self.gather.line(text, ts)
    }
}

impl EqModule for CraftingModule {
    fn id(&self) -> &'static str {
        "crafting"
    }

    fn reset(&mut self) {
        self.clear();
        self.zone = None;
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        let changed = match ev.kind_of() {
            Kind::Epoch => self.clear(),
            Kind::OfflineGap => self.end_session(),
            Kind::Zone => {
                self.zone = ev.str(Key::Zone).map(str::to_string);
                false
            }
            Kind::SkillUp => self.skill_line(ev),
            Kind::ItemReceived => match (ev.str(Key::Via), ev.str(Key::Item)) {
                (Some("fashioned"), Some(item)) => self.combine(item, true, ev.ts()),
                _ => false,
            },
            Kind::Purchase => self.money.bought(ev, self.zone.as_deref()),
            Kind::Coin => self.money.sold(ev),
            Kind::Unknown => self.line(message_text_of(ev.raw()), ev.ts()),
            _ => false,
        };
        if changed {
            self.announce.changed(self.seq);
        }
    }

    /// Moves on a combine, a by-product counted on one, a credited or first-stated raise, a
    /// merchant line, a depot draw, a fishing or forage line, a session end that zeroed something,
    /// or an epoch that emptied the tables.
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        let mut state = json!({
            "items": self.items.list(),
            "levels": self.levels.list(),
            "spans": self.spans.recent(),
            "bought": self.money.bought_rows(),
            "sold": self.money.sold_rows(),
            "depot": self.money.depot_rows(),
        });
        if let Some(older) = self.spans.older() {
            state["olderSpans"] = json!(older);
        }
        // Absent until the log has a line of the kind: most characters never fish.
        if let Some(fishing) = self.gather.fishing() {
            state["fishing"] = fishing;
        }
        if let Some(forage) = self.gather.forage() {
            state["forage"] = forage;
        }
        json!({ "seq": self.seq, "state": state })
    }
}
