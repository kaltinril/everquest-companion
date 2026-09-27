//! WHAT A `/who` ROW SAID ABOUT SOMEBODY ELSE — the classes a group-mate is running.
//!
//! EQ Legends runs up to three classes at once and the only line that states them outright is a
//! `/who` row: `[50 WAR/NEC/ENC] Grynn (Werewolf)  ZONE: New Sebilis Expedition (newsebexp)`. The
//! parser claims the tailed character's OWN row (`selfWho`) and declines every other, on purpose: a
//! `/who` prints every stranger in the zone and none of them is the player's loadout. So another
//! player's row reaches the fold as `unknown`, with the line intact, and this file reads it there.
//! The parser and its parity surface are untouched.
//!
//! THE ROSTER DECIDES WHO IS PUBLISHED. This is a memory of what rows said, keyed by name, and it
//! is never a membership signal: standing in the same zone as somebody who typed `/who` is not
//! being grouped with them. `roster.rs` joins it to the members it already has, at snapshot time,
//! so a row seen BEFORE the join line still answers once the join arrives.
//!
//! BOUNDED, AND NEVER PERSISTED. A `/who all` in a city is hundreds of strangers; the memory holds
//! the newest `CAPACITY` names and lives only as long as the fold does.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use eqlog::names::id_key;
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};

/// How many names are remembered. A group is five other players; this is room for the zone around
/// them, so a row read an hour before the invite is still there when the join line lands.
const CAPACITY: usize = 512;

/// What one player's latest `/who` row stated.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoStated {
    /// The class codes in row order, e.g. `["WAR","NEC","ENC"]`.
    pub classes: Vec<String>,
    /// The bracketed level — the minimum over the loadout's class levels.
    pub level: i64,
    /// When the row was printed. A loadout can be swapped at any time and nothing says so, so a
    /// reader has to be able to tell a row from tonight from one three weeks old.
    pub classes_ts: i64,
}

pub struct WhoSeen {
    row: Regex,
    corpse_suffix: Regex,
    stated: HashMap<String, WhoStated>,
    /// Keys in first-seen order, for eviction.
    order: VecDeque<String>,
}

impl Default for WhoSeen {
    fn default() -> Self {
        WhoSeen {
            // `eqlog::parse::who`'s own row shape, so the two readers agree about what a row is.
            row: Regex::new(
                r"^\s*(?:\* RIP \*\s*)?(?:AFK\s+)?\[([0-9]+) ([A-Z]{3}(?:/[A-Z]{3})*)\] (.+?)(?: \(([^)]*)\))?(?: <([^>]*)>)?\s+ZONE: ",
            )
            .unwrap(),
            corpse_suffix: Regex::new(r"['`\u{2019}]s corpse$").unwrap(),
            stated: HashMap::new(),
            order: VecDeque::new(),
        }
    }
}

impl WhoSeen {
    /// Read one event. Answers the canonical key of the player a `/who` row named, so the caller
    /// can tell whether a member it publishes was restated.
    pub fn observe(&mut self, ev: &Event) -> Option<String> {
        if ev.kind() != "unknown" || !ev.raw().contains("ZONE: ") {
            return None;
        }
        let m = self.row.captures(message_text_of(ev.raw()))?;
        let name = self.corpse_suffix.replace(m[3].trim(), "").to_string();
        let key = id_key(&name);
        if key.is_empty() {
            return None;
        }
        let said = WhoStated {
            classes: m[2].split('/').map(str::to_string).collect(),
            level: m[1].parse().unwrap_or(0),
            classes_ts: ev.ts(),
        };
        if self.stated.insert(key.clone(), said).is_none() {
            self.order.push_back(key.clone());
            if self.order.len() > CAPACITY {
                if let Some(oldest) = self.order.pop_front() {
                    self.stated.remove(&oldest);
                }
            }
        }
        Some(key)
    }

    /// What the latest row said about this canonical key.
    pub fn stated(&self, key: &str) -> Option<&WhoStated> {
        self.stated.get(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unknown(ts: i64, raw: &str) -> Event<'static> {
        let line = serde_json::json!({ "kind": "unknown", "seq": 1, "ts": ts, "raw": raw });
        Event::from_json(&line.to_string()).expect("a JSON event")
    }

    #[test]
    fn a_who_row_states_a_players_classes_and_level() {
        let mut who = WhoSeen::default();
        let key = who.observe(&unknown(
            1000,
            "[Mon Sep 21 23:31:00 2026] [50 WAR/NEC/ENC] Grynn (Werewolf)  ZONE: New Sebilis Expedition (newsebexp)  ",
        ));
        assert_eq!(key.as_deref(), Some("grynn"));
        let said = who.stated("grynn").expect("remembered");
        assert_eq!(said.classes, ["WAR", "NEC", "ENC"]);
        assert_eq!((said.level, said.classes_ts), (50, 1000));
    }

    #[test]
    fn the_guild_tag_the_afk_prefix_and_a_two_class_row_are_all_rows() {
        let mut who = WhoSeen::default();
        who.observe(&unknown(
            1,
            "[Mon Sep 21 23:31:00 2026] [50 SHD/WIZ/ENC] Rodrigo (Wood Elf) <M E S S> ZONE: New Sebilis Expedition (newsebexp)  ",
        ));
        who.observe(&unknown(
            2,
            "[Mon Sep 21 23:31:00 2026]  AFK [8 WAR/MNK] Newbie (Human)  ZONE: Qeynos Hills (qeytoqrg)",
        ));
        assert_eq!(
            who.stated("rodrigo").unwrap().classes,
            ["SHD", "WIZ", "ENC"]
        );
        assert_eq!(who.stated("newbie").unwrap().classes, ["WAR", "MNK"]);
    }

    #[test]
    fn a_row_that_states_no_classes_and_a_line_that_is_not_a_row_are_nothing() {
        let mut who = WhoSeen::default();
        for raw in [
            "[Mon Sep 21 23:31:00 2026] [ANONYMOUS] Hidden  ZONE: Halas (halas)",
            "[Mon Sep 21 23:31:00 2026] Players in EverQuest Legends:",
            "[Mon Sep 21 23:31:00 2026] Grynn tells the group, '[50 WAR/NEC/ENC] is my ZONE: build'",
        ] {
            assert_eq!(who.observe(&unknown(1, raw)), None, "{raw}");
        }
    }

    #[test]
    fn only_an_unknown_line_is_read() {
        let mut who = WhoSeen::default();
        let line = serde_json::json!({
            "kind": "selfWho", "seq": 1, "ts": 1,
            "raw": "[Mon Sep 21 23:31:00 2026] [50 WAR/MNK/SHM] Drywrought (Iksar)  ZONE: Halas (halas)",
            "level": 50, "classes": ["WAR", "MNK", "SHM"]
        });
        let ev = Event::from_json(&line.to_string()).expect("a JSON event");
        assert_eq!(who.observe(&ev), None);
    }

    #[test]
    fn the_latest_row_wins() {
        let mut who = WhoSeen::default();
        let row = |classes: &str| {
            format!(
                "[Mon Sep 21 23:31:00 2026] [50 {classes}] Malkil (Halfling)  ZONE: Halas (halas)"
            )
        };
        who.observe(&unknown(1, &row("DRU/RNG/MAG")));
        // The same statement again moves the instant to the newer row.
        who.observe(&unknown(2, &row("DRU/RNG/MAG")));
        assert_eq!(who.stated("malkil").unwrap().classes_ts, 2);
        who.observe(&unknown(3, &row("DRU/RNG/ENC")));
        assert_eq!(who.stated("malkil").unwrap().classes, ["DRU", "RNG", "ENC"]);
    }

    #[test]
    fn the_memory_is_bounded_and_forgets_the_oldest_name_first() {
        let mut who = WhoSeen::default();
        for i in 0..=CAPACITY {
            let name: String = format!("P{i}")
                .chars()
                .map(|c| {
                    if c.is_ascii_digit() {
                        (b'a' + (c as u8 - b'0')) as char
                    } else {
                        c
                    }
                })
                .collect();
            who.observe(&unknown(
                i as i64,
                &format!("[Mon Sep 21 23:31:00 2026] [50 WAR] {name} (Human)  ZONE: Halas (halas)"),
            ));
        }
        assert_eq!(who.stated.len(), CAPACITY);
        assert!(
            who.stated("pa").is_none(),
            "the first name seen is the one forgotten"
        );
        assert!(who.stated("pb").is_some());
    }
}
