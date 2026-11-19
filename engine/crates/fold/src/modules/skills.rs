//! Skill levels: one row per skill the log has seen go up, at the newest level it stated, with
//! the raises of the current session (since the newest offline gap).
//!
//! Two measured traps. The game can repeat the level it already stated (a capped skill printed
//! the same line 37 times in 7 minutes), so a line is a raise only when the level differs. And a
//! level can go down between lines, so the level kept is the newest stated, never the maximum.

use crate::event::{Event, Key, Kind};
use crate::EqModule;
use serde::Serialize;
use serde_json::{json, Value};

/// One skill, as the client spells it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRow {
    pub skill: String,
    pub value: i64,
    pub last_ts: i64,
    pub session_ups: i64,
    /// This session's first raise; absent when the session has none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_first_ts: Option<i64>,
}

#[derive(Default)]
pub struct SkillsModule {
    /// In the order the log first raised them.
    rows: Vec<SkillRow>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl SkillsModule {
    pub fn new() -> Self {
        Self::default()
    }

    /// File a skill-up line. False when it repeats the stored level, which changes nothing.
    fn raised(&mut self, skill: &str, value: i64, ts: i64) -> bool {
        let Some(row) = self.rows.iter_mut().find(|r| r.skill == skill) else {
            self.rows.push(SkillRow {
                skill: skill.to_string(),
                value,
                last_ts: ts,
                session_ups: 1,
                session_first_ts: Some(ts),
            });
            return true;
        };
        if row.value == value {
            return false;
        }
        row.value = value;
        row.last_ts = ts;
        row.session_ups += 1;
        row.session_first_ts.get_or_insert(ts);
        true
    }

    /// Zero the session columns. True when any row had some.
    fn end_session(&mut self) -> bool {
        let mut changed = false;
        for row in &mut self.rows {
            if row.session_ups != 0 || row.session_first_ts.is_some() {
                row.session_ups = 0;
                row.session_first_ts = None;
                changed = true;
            }
        }
        changed
    }
}

impl EqModule for SkillsModule {
    fn id(&self) -> &'static str {
        "skills"
    }

    fn reset(&mut self) {
        self.rows.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        let changed = match ev.kind_of() {
            Kind::Epoch => {
                let had = !self.rows.is_empty();
                self.rows.clear();
                had
            }
            Kind::OfflineGap => self.end_session(),
            Kind::SkillUp => match (ev.str(Key::Skill), ev.int(Key::Value)) {
                (Some(skill), Some(value)) => self.raised(skill, value, ev.ts()),
                _ => false,
            },
            _ => false,
        };
        if changed {
            self.announce.changed(self.seq);
        }
    }

    /// Moves only on a raise, a session end that zeroed something, or an epoch that emptied rows.
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

    fn event(v: Value) -> Event<'static> {
        Event::from_json(&v.to_string()).expect("a JSON event")
    }

    fn up(ts: i64, skill: &str, value: i64) -> Event<'static> {
        event(json!({ "kind": "skillUp", "seq": ts, "ts": ts, "skill": skill, "value": value }))
    }

    fn bare(kind: &str, ts: i64) -> Event<'static> {
        event(json!({ "kind": kind, "seq": ts, "ts": ts }))
    }

    fn fold(events: &[Event<'static>]) -> SkillsModule {
        let mut m = SkillsModule::new();
        for ev in events {
            m.on_event(ev, false);
        }
        m
    }

    fn rows(m: &SkillsModule) -> Value {
        m.snapshot()["state"]["rows"].clone()
    }

    #[test]
    fn a_first_skill_up_files_the_skill_at_its_level() {
        let m = fold(&[up(10, "Fishing", 127)]);
        assert_eq!(
            rows(&m),
            json!([{ "skill": "Fishing", "value": 127, "lastTs": 10,
                     "sessionUps": 1, "sessionFirstTs": 10 }])
        );
        assert_eq!(m.snapshot()["seq"], json!(10));
    }

    #[test]
    fn a_second_raise_keeps_the_first_session_stamp() {
        let m = fold(&[
            up(10, "Fishing", 127),
            up(20, "Baking", 4),
            up(30, "Fishing", 128),
        ]);
        assert_eq!(
            rows(&m),
            json!([
                { "skill": "Fishing", "value": 128, "lastTs": 30,
                  "sessionUps": 2, "sessionFirstTs": 10 },
                { "skill": "Baking", "value": 4, "lastTs": 20,
                  "sessionUps": 1, "sessionFirstTs": 20 }
            ])
        );
    }

    #[test]
    fn a_line_repeating_the_stored_level_changes_nothing_and_does_not_announce() {
        let mut m = fold(&[up(10, "Specialize Evocation", 50)]);
        let (before, cursor) = (rows(&m), m.published_seq());
        m.on_event(&up(20, "Specialize Evocation", 50), false);
        assert_eq!(rows(&m), before);
        assert_eq!(m.published_seq(), cursor);
    }

    #[test]
    fn a_lower_level_replaces_the_stored_one() {
        let m = fold(&[up(10, "Forage", 52), up(20, "Forage", 50)]);
        assert_eq!(
            rows(&m),
            json!([{ "skill": "Forage", "value": 50, "lastTs": 20,
                     "sessionUps": 2, "sessionFirstTs": 10 }])
        );
    }

    #[test]
    fn an_offline_gap_zeroes_the_session_columns_and_keeps_the_level() {
        let mut m = fold(&[up(10, "Fishing", 127), bare("offlineGap", 500)]);
        assert_eq!(
            rows(&m),
            json!([{ "skill": "Fishing", "value": 127, "lastTs": 10, "sessionUps": 0 }])
        );
        assert_eq!(m.published_seq(), Some(501));
        // A second gap has nothing left to zero.
        m.on_event(&bare("offlineGap", 600), false);
        assert_eq!(m.published_seq(), Some(501));
        m.on_event(&up(700, "Fishing", 128), false);
        assert_eq!(
            rows(&m),
            json!([{ "skill": "Fishing", "value": 128, "lastTs": 700,
                     "sessionUps": 1, "sessionFirstTs": 700 }])
        );
    }

    #[test]
    fn an_epoch_empties_the_rows() {
        let m = fold(&[up(10, "Fishing", 127), bare("epoch", 20)]);
        assert_eq!(rows(&m), json!([]));
        assert_eq!(m.published_seq(), Some(21));
        assert_eq!(fold(&[bare("epoch", 20)]).published_seq(), Some(0));
    }

    #[test]
    fn a_skill_up_with_no_value_is_ignored() {
        let m = fold(&[event(
            json!({ "kind": "skillUp", "seq": 1, "ts": 1, "skill": "Fishing" }),
        )]);
        assert_eq!(rows(&m), json!([]));
        assert_eq!(m.published_seq(), Some(0));
    }

    /// The real parser, on the game's line: the skill and its level arrive as the module reads them.
    #[test]
    fn the_real_parser_hands_the_line_over_with_its_level() {
        use eqlog::event::Ev;
        let parser = eqlog::parser_for("Drywrought", eqlog::Tz::UTC);
        let mut ev = Ev::new();
        let line = "[Sat Aug 15 00:15:14 2026] You have become better at Fishing! (127)";
        assert!(parser.parse_event(line, 1, &mut ev));
        assert_eq!(ev.payload().kind(), Kind::SkillUp);
        let mut m = SkillsModule::new();
        m.on_event(&Event::typed(ev.payload()), false);
        let r = rows(&m);
        assert_eq!(
            (r[0]["skill"].clone(), r[0]["value"].clone()),
            (json!("Fishing"), json!(127))
        );
    }
}
