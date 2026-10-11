//! Your spells that met another effect: a cast that did not take hold (with what blocked it, when
//! the game says) and a buff of yours on someone that was overwritten.
//!
//! The parser has no kind for these lines, so they arrive as `unknown` and are read here, anchored
//! at the start of the message so chat quoting one is never a row.
//!
//! The current session only: a login or an epoch clears it. At most `CAPACITY` rows, the least
//! recently seen evicted first.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::EqModule;
use eqlog::names::id_key;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};

const CAPACITY: usize = 64;

/// One (what happened, spell, blocker, target), counted.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRow {
    /// `blocked` (did not take hold) or `overwritten`.
    pub kind: &'static str,
    pub spell: String,
    /// What the game named as the blocker; absent when the line names none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    /// Who the spell was cast on; absent when it was you.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    pub count: i64,
    pub first_ts: i64,
    pub last_ts: i64,
    #[serde(skip)]
    key: String,
}

pub struct BuffConflictsModule {
    overwritten: Regex,
    blocked: Regex,
    /// Most recently seen first.
    rows: Vec<ConflictRow>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl Default for BuffConflictsModule {
    fn default() -> Self {
        BuffConflictsModule {
            overwritten: Regex::new(r"^Your (.+?) spell on (.+) has been overwritten\.\s*$").unwrap(),
            blocked: Regex::new(
                r"^Your (.+?) spell did not take hold(?: on (.+?))?\.(?: \(Blocked by (.+)\.\))?\s*$",
            )
            .unwrap(),
            rows: Vec::new(),
            seq: 0,
            announce: crate::announce::Announce::default(),
        }
    }
}

impl BuffConflictsModule {
    pub fn new() -> Self {
        Self::default()
    }

    /// The row a line states, or `None` for any other line.
    fn read(&self, text: &str, ts: i64) -> Option<ConflictRow> {
        if !text.starts_with("Your ") {
            return None;
        }
        let (kind, m) = match self.overwritten.captures(text) {
            Some(m) => ("overwritten", m),
            None => ("blocked", self.blocked.captures(text)?),
        };
        let spell = m[1].to_string();
        let target = m.get(2).map(|t| t.as_str().to_string());
        let blocked_by = m.get(3).map(|b| b.as_str().to_string());
        let key = format!(
            "{kind}|{}|{}|{}",
            spell.to_lowercase(),
            blocked_by.as_deref().unwrap_or("").to_lowercase(),
            target.as_deref().map(id_key).unwrap_or_default()
        );
        Some(ConflictRow {
            kind,
            spell,
            blocked_by,
            target,
            count: 1,
            first_ts: ts,
            last_ts: ts,
            key,
        })
    }

    fn record(&mut self, mut row: ConflictRow) {
        if let Some(at) = self.rows.iter().position(|r| r.key == row.key) {
            let old = self.rows.remove(at);
            row.count += old.count;
            row.first_ts = old.first_ts;
        }
        self.rows.insert(0, row);
        self.rows.truncate(CAPACITY);
    }

    fn clear(&mut self) {
        if !self.rows.is_empty() {
            self.rows.clear();
            self.announce.changed(self.seq);
        }
    }
}

impl EqModule for BuffConflictsModule {
    fn id(&self) -> &'static str {
        "buffConflicts"
    }

    fn reset(&mut self) {
        self.rows.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        match ev.kind() {
            "epoch" | "sessionStart" => self.clear(),
            "unknown" => {
                if let Some(row) = self.read(message_text_of(ev.raw()), ev.ts()) {
                    self.record(row);
                    self.announce.changed(self.seq);
                }
            }
            _ => {}
        }
    }

    /// Moves only on a conflict line or a clear that emptied something.
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        json!({ "seq": self.seq, "state": { "rows": self.rows } })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(kind: &str, ts: i64, text: &str) -> Event<'static> {
        let raw = format!("[Sat Oct 10 20:00:00 2026] {text}");
        let v = json!({ "kind": kind, "seq": ts, "ts": ts, "raw": raw });
        Event::from_json(&v.to_string()).expect("a JSON event")
    }

    fn fold(texts: &[&str]) -> BuffConflictsModule {
        let mut m = BuffConflictsModule::new();
        for (i, t) in texts.iter().enumerate() {
            m.on_event(&line("unknown", i as i64 + 1, t), false);
        }
        m
    }

    fn rows(m: &BuffConflictsModule) -> Value {
        m.snapshot()["state"]["rows"].clone()
    }

    #[test]
    fn an_overwritten_buff_names_the_spell_and_the_target() {
        let m = fold(&["Your Resist Fire spell on Malkil has been overwritten."]);
        assert_eq!(
            rows(&m),
            json!([{ "kind": "overwritten", "spell": "Resist Fire", "target": "Malkil",
                     "count": 1, "firstTs": 1, "lastTs": 1 }])
        );
    }

    #[test]
    fn a_blocked_cast_on_you_names_the_blocker_and_no_target() {
        let m = fold(&[
            "Your Journeyman Boots spell did not take hold. (Blocked by Illusion Benefit Dena.)",
            "Your Journeyman Boots spell did not take hold. (Blocked by Illusion Benefit Dena.)",
        ]);
        assert_eq!(
            rows(&m),
            json!([{ "kind": "blocked", "spell": "Journeyman Boots",
                     "blockedBy": "Illusion Benefit Dena", "count": 2, "firstTs": 1, "lastTs": 2 }])
        );
    }

    #[test]
    fn a_blocked_cast_on_someone_keeps_names_with_backticks_and_apostrophes() {
        let m = fold(&[
            "Your Spirit of Bih`Li spell did not take hold on Malkil. (Blocked by Form of the Great Wolf.)",
            "Your Talisman of Altuna spell did not take hold on Grynn's warder. (Blocked by Rune IV.)",
        ]);
        let r = rows(&m);
        assert_eq!(r[0]["spell"], "Talisman of Altuna");
        assert_eq!(r[0]["target"], "Grynn's warder");
        assert_eq!(r[0]["blockedBy"], "Rune IV");
        assert_eq!(r[1]["spell"], "Spirit of Bih`Li");
        assert_eq!(r[1]["target"], "Malkil");
        assert_eq!(r[1]["blockedBy"], "Form of the Great Wolf");
    }

    #[test]
    fn a_line_with_no_reason_has_no_blocker() {
        let m = fold(&[
            "Your Alacrity spell did not take hold on Malkil.",
            "Your Rune IV spell did not take hold.",
        ]);
        assert_eq!(
            rows(&m),
            json!([
                { "kind": "blocked", "spell": "Rune IV", "count": 1, "firstTs": 2, "lastTs": 2 },
                { "kind": "blocked", "spell": "Alacrity", "target": "Malkil",
                  "count": 1, "firstTs": 1, "lastTs": 1 }
            ])
        );
    }

    #[test]
    fn chat_that_quotes_the_line_and_other_lines_are_nothing() {
        let m = fold(&[
            "You tell your party, 'you alacrity spell did not take hold on Malkil.'",
            "Malkil tells the group, 'Your Rune IV spell did not take hold.'",
            "Your target is too far away, get closer!",
        ]);
        assert_eq!(rows(&m), json!([]));
        assert_eq!(m.published_seq(), Some(0));
    }

    #[test]
    fn a_parsed_kind_is_never_read_even_with_the_same_words() {
        let mut m = BuffConflictsModule::new();
        m.on_event(
            &line("say", 1, "Your Rune IV spell did not take hold."),
            false,
        );
        assert_eq!(rows(&m), json!([]));
    }

    #[test]
    fn the_newest_row_is_first_and_a_repeat_moves_to_the_front() {
        let m = fold(&[
            "Your Resist Fire spell on Malkil has been overwritten.",
            "Your Alacrity spell did not take hold on Malkil.",
            "Your Resist Fire spell on malkil has been overwritten.",
        ]);
        let r = rows(&m);
        assert_eq!(r[0]["spell"], "Resist Fire");
        assert_eq!(
            (r[0]["count"].clone(), r[0]["firstTs"].clone()),
            (json!(2), json!(1))
        );
        assert_eq!(r[1]["spell"], "Alacrity");
    }

    #[test]
    fn a_login_clears_the_session_and_the_rows_stay_bounded() {
        let mut m = BuffConflictsModule::new();
        for i in 0..(CAPACITY as i64 + 10) {
            let text = format!("Your Resist Fire spell on Pet{i} has been overwritten.");
            m.on_event(&line("unknown", i + 1, &text), false);
        }
        assert_eq!(rows(&m).as_array().unwrap().len(), CAPACITY);
        m.on_event(
            &line("sessionStart", 500, "Welcome to EverQuest Legends!"),
            false,
        );
        assert_eq!(rows(&m), json!([]));
        assert_eq!(m.published_seq(), Some(501));
    }
}
