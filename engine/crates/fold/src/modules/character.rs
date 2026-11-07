//! `src/main/modules/character.ts` — the active CharacterRef, the current zone and the current
//! level, on one transport.
//!
//! The ref is pushed in, not folded: a construction input (`ClusterDeps::character`) derived from
//! the log's filename, so it states a fact about the RUN rather than about the log's contents.
//! `reset()` keeps it; everything log-derived clears.
//!
//! The level is the latest statement with `/who` breaking a tie, and it never enters the ding
//! series — a `/who` row is not a level-up, and the chart, the per-level history and the projection
//! are all anchored on that series.
//!
//! `seq` is this module's own revision, monotonic and never reset: state here moves without a log
//! event (`set_character`), and `useModule` dedupes with `d.seq <= knownSeq`.

use crate::event::{Event, Kind};
use crate::message_overlay::message_text_of;
use crate::modules::gaps_locs::loc_of;
use crate::EqModule;
use serde::Serialize;
use serde_json::{json, Value};

/// `shared/currentLevel.ts LevelStatement`.
#[derive(Debug, Clone, Serialize)]
pub struct LevelStatement {
    level: i64,
    /// LOG timestamp of the line that stated it (not a wall clock).
    ts: i64,
    source: &'static str,
}

/// `laterStatement` — latest wins, `/who` breaks a tie. Total, so the winner is decided by the rule
/// rather than by arrival order.
fn next_wins(held: &LevelStatement, next: &LevelStatement) -> bool {
    if next.ts > held.ts {
        return true;
    }
    if next.ts < held.ts {
        return false;
    }
    next.source == "who"
}

/// `shared/characterTypes.ts LoggedLoc` — one `Your Location is` line (EQ Legends writes `/loc`
/// to the log), in `/loc`'s own order: north/south, west/east, elevation.
#[derive(Debug, Clone, Serialize)]
pub struct LoggedLoc {
    ns: f64,
    ew: f64,
    z: f64,
    /// LOG timestamp of the line.
    ts: i64,
}

/// How many logged positions are kept: the Maps tab's marker and the one before it (its heading).
const LOCS_KEPT: usize = 2;

#[derive(Default)]
pub struct CharacterModule {
    /// The `CharacterRef` as JSON, or `None` for the null the snapshot publishes.
    character: Option<Value>,
    zone: Option<String>,
    /// The current zone's last logged positions, oldest first; a zone line empties it.
    locs: Vec<LoggedLoc>,
    level: Option<LevelStatement>,
    /// The module's own revision, monotonic for the life of the process. See the header.
    rev: i64,
    /// The ref waiting for the first reset. The double option is the point: the outer is "has
    /// `set_character` been called yet", the inner is the ref it was called with — and the call
    /// itself moves the revision, so a `None` ref and no call at all publish different seqs.
    pending: Option<Option<Value>>,
}

impl CharacterModule {
    pub fn new(character: Option<Value>) -> Self {
        CharacterModule {
            character: None,
            zone: None,
            locs: Vec::new(),
            level: None,
            rev: 0,
            pending: Some(character),
        }
    }

    /// `setCharacter` — called by index.ts when the tailed character changes.
    pub fn set_character(&mut self, character: Option<Value>) {
        self.character = character;
        self.rev += 1;
    }

    /// Fold one statement in. A row restating a level you already dinged to still moves the
    /// revision: the age of the statement is part of the fact, and the surfaces hedge on it.
    fn state_level(&mut self, next: LevelStatement) {
        if let Some(held) = &self.level {
            if !next_wins(held, &next) {
                return;
            }
        }
        self.level = Some(next);
        self.rev += 1;
    }

    /// A `/loc` line: kept as the zone's newest position, the oldest past `LOCS_KEPT` dropped.
    fn logged_loc(&mut self, ev: &Event) {
        let Some([ns, ew, z]) = loc_of(message_text_of(ev.raw())) else {
            return;
        };
        self.locs.push(LoggedLoc {
            ns,
            ew,
            z,
            ts: ev.ts(),
        });
        if self.locs.len() > LOCS_KEPT {
            self.locs.remove(0);
        }
        self.rev += 1;
    }
}

impl EqModule for CharacterModule {
    fn id(&self) -> &'static str {
        "character"
    }

    fn reset(&mut self) {
        // The ref survives; see the header.
        self.zone = None;
        self.locs.clear();
        self.level = None;
        self.rev += 1;
        // The construction ref lands here, once: `rev` IS the published `seq`, so the ORDER of the
        // two bumps is observable, and the composition root spends them as reset-then-setCharacter.
        // A cluster built before `Fold::new` resets it would spend them the other way round.
        if let Some(character) = self.pending.take() {
            self.set_character(character);
        }
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        match ev.kind_of() {
            Kind::Epoch => {
                // Character rebirth: the wiped character's level and zone say nothing about this
                // one. The ref is pushed in and stays.
                self.zone = None;
                self.locs.clear();
                self.level = None;
                self.rev += 1;
            }
            Kind::Zone => {
                let zone = ev.str("zone").map(str::to_string);
                // Any zone line, the same zone again included: a position from before it is not
                // where you are now.
                let had_locs = !self.locs.is_empty();
                self.locs.clear();
                if zone != self.zone || had_locs {
                    self.zone = zone;
                    self.rev += 1;
                }
            }
            Kind::Unknown => self.logged_loc(ev),
            Kind::Level => self.state_level(LevelStatement {
                level: ev.int("level").unwrap_or(0),
                ts: ev.ts(),
                source: "ding",
            }),
            Kind::SelfWho => self.state_level(LevelStatement {
                level: ev.int("level").unwrap_or(0),
                ts: ev.ts(),
                source: "who",
            }),
            _ => {}
        }
    }

    /// The same cursor `snapshot` publishes, without building the state to read it.
    fn published_seq(&self) -> Option<i64> {
        Some(self.rev)
    }

    fn snapshot(&self) -> Value {
        // Three fields, two different absences: `character` publishes null (the TS field is
        // `CharacterRef | null`) while `zone`/`level` are `undefined` and `JSON.stringify` drops
        // them.
        let mut state = serde_json::Map::new();
        state.insert(
            "character".to_string(),
            self.character.clone().unwrap_or(Value::Null),
        );
        if let Some(zone) = &self.zone {
            state.insert("zone".to_string(), json!(zone));
        }
        if let Some(level) = &self.level {
            state.insert("level".to_string(), serde_json::to_value(level).expect("a"));
        }
        // Absent, like `zone`, until a `/loc` line in this zone.
        if !self.locs.is_empty() {
            state.insert(
                "locs".to_string(),
                serde_json::to_value(&self.locs).expect("a"),
            );
        }
        json!({ "seq": self.rev, "state": Value::Object(state) })
    }
}

#[cfg(test)]
mod tests {
    use super::CharacterModule;
    use crate::event::Event;
    use crate::EqModule;

    fn ev(json: &str) -> Event<'static> {
        Event::from_json(json).expect("json")
    }

    fn loc(text: &str, ts: i64) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"unknown","ts":{ts},"seq":1,"raw":"[Sun Oct 18 20:02:54 2026] {text}"}}"#
        ))
    }

    fn zone(name: &str, ts: i64) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"zone","ts":{ts},"seq":1,"zone":"{name}"}}"#
        ))
    }

    #[test]
    fn the_zone_keeps_its_last_two_logged_locs_and_a_zone_line_empties_them() {
        let mut m = CharacterModule::new(None);
        m.reset();
        m.on_event(&zone("Crushbone", 0), false);
        assert!(
            m.snapshot()["state"].get("locs").is_none(),
            "absent before any /loc"
        );
        m.on_event(&loc("Your Location is 1.00, 2.00, 3.00", 1_000), false);
        m.on_event(&loc("You say, 'Hail, a gnoll'", 1_500), false);
        m.on_event(&loc("Your Location is 4.50, -5.25, 6.00", 2_000), false);
        let seq = m.snapshot()["seq"].clone();
        m.on_event(&loc("Your Location is -7.00, 8.00, 9.00", 3_000), false);
        let snap = m.snapshot();
        assert_ne!(snap["seq"], seq, "a /loc moves the revision");
        assert_eq!(
            snap["state"]["locs"],
            serde_json::json!([
                { "ns": 4.5, "ew": -5.25, "z": 6.0, "ts": 2_000 },
                { "ns": -7.0, "ew": 8.0, "z": 9.0, "ts": 3_000 }
            ]),
            "the two newest, oldest first, in /loc order"
        );
        m.on_event(&zone("Crushbone", 4_000), false);
        assert!(
            m.snapshot()["state"].get("locs").is_none(),
            "any zone line, the same zone too, forgets them"
        );
    }
}
