//! `met`: what the player's own log shows they met — every mob killed, looted from or conned, every
//! item looted, every zone entered — plus the raid roster's kill records. The era verdicts read the
//! names (`shared/metInLog.ts`, owner ruling 2026-10-17) and the always-mounted boss celebration
//! reads `bosses`.
//!
//! WHY ITS OWN MODULE (perf review 2026-10-20 #1; second pass #2). The renderer built these from
//! `kills`, `loot`, `consider` and `progression`, which kept all four watched on every tab: each
//! kill or loot re-sent the 1.4 MB loot ledger and the kills map. This cursor moves only when a name
//! is new, a roster boss dies, or a rebirth clears the world.
//!
//! THE SAME EVIDENCE. Loot and con lines are read as the loot and consider modules read them, zone
//! lines as progression does, and a loot or con also stamps the last zone line's zone, which a
//! rebirth keeps as those two modules keep it. A kill is the kills module's own decision (counted, not a friendly death), handed over in a shared
//! [`MetSlot`] when it records one; this module is registered after it, so it drains the slot on the
//! same event. Names are kept raw (the app keys them) and for the whole log: the con ring (50) and
//! the zone timeline (4,000) no longer age evidence out. A rebirth clears everything, as all four do.
//!
//! `bosses` is the kills map cut to the roster (`bosses.json` `match` names, article-insensitive as
//! `bossStatus.ts matchKey` reads them), so a roster status folded from it equals one folded from
//! the whole map.

use super::consider::mob_key;
use super::resist::catalog::BOSSES_JSON;
use crate::event::{Event, Kind};
use crate::jsmap::JsMap;
use crate::EqModule;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;
use std::sync::OnceLock;

/// What the kills module hands over as it records a kill.
#[derive(Default)]
pub struct MetSlot {
    /// The display spelling of each mob counted for the first time.
    killed: Vec<String>,
    /// A roster boss's kill record after the kill, under the kills map's key.
    bosses: Vec<(String, Value)>,
}

/// One slot, cloned into `kills` and `met`.
pub type SharedMet = Rc<RefCell<MetSlot>>;

impl MetSlot {
    /// A counted kill under `key`; `first` is its spelling when the key is new to the kills map.
    pub(crate) fn note_kill<T: Serialize>(&mut self, key: &str, first: Option<&str>, record: &T) {
        if let Some(name) = first {
            self.killed.push(name.to_string());
        }
        if roster_keys().contains(&match_key(key)) {
            if let Ok(v) = serde_json::to_value(record) {
                self.bosses.push((key.to_string(), v));
            }
        }
    }
}

/// `bossStatus.ts matchKey`: lowercase, then one leading article off, then trimmed.
fn match_key(name: &str) -> String {
    let lower = name.to_lowercase();
    let rest = ["a ", "an ", "the "]
        .iter()
        .find_map(|p| lower.strip_prefix(p))
        .unwrap_or(&lower);
    rest.trim().to_string()
}

#[derive(Deserialize)]
struct RosterTarget {
    #[serde(rename = "match", default)]
    names: Vec<String>,
}

#[derive(Deserialize)]
struct Roster {
    #[serde(default)]
    targets: Vec<RosterTarget>,
}

/// Every roster `match` name, as a match key.
fn roster_keys() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        let roster: Roster = serde_json::from_str(BOSSES_JSON).unwrap_or(Roster {
            targets: Vec::new(),
        });
        roster
            .targets
            .iter()
            .flat_map(|t| t.names.iter().map(|n| match_key(n)))
            .collect()
    })
}

/// One kind of evidence: each spelling once.
#[derive(Default)]
struct Names(HashSet<String>);

impl Names {
    /// True when `name` is new; an empty name is no evidence.
    fn add(&mut self, name: &str) -> bool {
        !name.is_empty() && !self.0.contains(name) && self.0.insert(name.to_string())
    }

    fn sorted(&self) -> Vec<&str> {
        let mut v: Vec<&str> = self.0.iter().map(String::as_str).collect();
        v.sort_unstable();
        v
    }
}

pub struct MetModule {
    slot: SharedMet,
    mobs: Names,
    items: Names,
    zones: Names,
    bosses: JsMap<Value>,
    /// The last zone line, which a loot or con is stamped with. World state: a rebirth keeps it.
    zone: Option<String>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl MetModule {
    pub fn new(slot: SharedMet) -> Self {
        Self {
            slot,
            mobs: Names::default(),
            items: Names::default(),
            zones: Names::default(),
            bosses: JsMap::new(),
            zone: None,
            seq: 0,
            announce: crate::announce::Announce::default(),
        }
    }

    fn clear(&mut self) {
        self.mobs = Names::default();
        self.items = Names::default();
        self.zones = Names::default();
        self.bosses.clear();
        *self.slot.borrow_mut() = MetSlot::default();
    }

    /// A loot, con or zone line; true when it named something new.
    fn line(&mut self, ev: &Event) -> bool {
        match ev.kind_of() {
            Kind::Zone => {
                self.zone = ev.str("zone").map(str::to_string);
                self.zones.add(ev.str("zone").unwrap_or_default())
            }
            Kind::Loot => {
                let item = self.items.add(ev.str("item").unwrap_or_default());
                let mob = self.mobs.add(ev.str("source").unwrap_or_default());
                self.stamped() || mob || item
            }
            Kind::Consider => {
                let mob = ev.str("mob").unwrap_or_default();
                !mob_key(mob).is_empty() && (self.mobs.add(mob) | self.stamped())
            }
            _ => false,
        }
    }

    /// The zone a loot or con row is stamped with: new only after a rebirth emptied the zones.
    fn stamped(&mut self) -> bool {
        let zone = self.zone.clone().unwrap_or_default();
        self.zones.add(&zone)
    }

    /// What the kills module handed over on this event; true when anything moved.
    fn drain(&mut self) -> bool {
        let slot = std::mem::take(&mut *self.slot.borrow_mut());
        let mut moved = false;
        for name in &slot.killed {
            moved |= self.mobs.add(name);
        }
        for (key, record) in slot.bosses {
            self.bosses.insert(key, record);
            moved = true;
        }
        moved
    }
}

impl EqModule for MetModule {
    fn id(&self) -> &'static str {
        "met"
    }

    fn reset(&mut self) {
        self.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        if ev.kind_of() == Kind::Epoch {
            self.clear();
            self.announce.changed(self.seq);
            return;
        }
        let named = self.line(ev);
        if self.drain() || named {
            self.announce.changed(self.seq);
        }
    }

    /// Moves on a new name, a roster boss's kill, or a rebirth. See [`crate::announce`].
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    /// `{ mobs, items, zones }` sorted by codepoint, and `bosses` keyed as the kills map is.
    fn snapshot(&self) -> Value {
        json!({
            "seq": self.seq,
            "state": {
                "mobs": self.mobs.sorted(),
                "items": self.items.sorted(),
                "zones": self.zones.sorted(),
                "bosses": self.bosses,
            }
        })
    }
}

#[cfg(test)]
#[path = "met_tests.rs"]
mod tests;
