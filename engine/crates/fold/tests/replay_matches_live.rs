//! The meters read the same live and after a restart. A restart replays the log with no meter
//! reads in between, so a fight that had ended stayed open until the next damage line, and a miss,
//! a resisted spell or a heal that came first was booked in it: the finished fight's own clock ran
//! on into the next pull and its DPS fell (bug hunt, 2026-11-19). Live, a meter read had already
//! closed it. Every line now closes a finished fight on the log's own clock before it is booked.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::{json, Value};

/// Each line as the parser's event, in its JSON spelling.
fn parsed(lines: &[&str]) -> Vec<String> {
    let me = Some("Primitive".to_string());
    let parser = Parser::new(Clock::new(Tz::America__Los_Angeles), None, me);
    let mut out = Vec::new();
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        out.push(ev.finish().to_string());
    }
    out
}

fn engine() -> CombatEngine {
    let mut e = CombatEngine::new();
    e.set_player_name("Primitive");
    e
}

/// The log read at start-up: no meter read until the tail takes over.
fn replayed(lines: &[&str]) -> CombatEngine {
    let mut e = engine();
    for json in parsed(lines) {
        let ev = Event::from_json(&json).expect("a JSON object");
        e.on_event(&ev, false, None);
    }
    e.set_live();
    e
}

/// The same lines as they were written, with a meter read every second in between.
fn live(lines: &[&str]) -> CombatEngine {
    let mut e = engine();
    let mut last: Option<i64> = None;
    for json in parsed(lines) {
        let ev = Event::from_json(&json).expect("a JSON object");
        let mut now = last.unwrap_or(ev.ts());
        while now < ev.ts() {
            now += 1_000;
            e.live_rows(now.min(ev.ts()));
        }
        e.on_event(&ev, true, None);
        last = Some(ev.ts());
    }
    e
}

/// Everything a player can open: the fight list, the zone sessions and every scope's own view.
fn everything(e: &CombatEngine, now: i64) -> Value {
    let snap = e.snapshot(now, &SnapshotOpts::full(), None);
    json!({
        "segments": snap["segments"],
        "zoneSessions": snap["zoneSessions"],
        "scopes": e.walk_scopes(now, None),
    })
}

/// A read long after the last line, when every fight has ended either way.
const LATER: i64 = 4_102_444_800_000;

fn scope(e: &CombatEngine, id: &str) -> Value {
    let opts = SnapshotOpts {
        selected_id: Some(id.to_string()),
        ..SnapshotOpts::full()
    };
    e.snapshot(LATER, &opts, None)["selected"].clone()
}

fn you(seg: &Value) -> &Value {
    seg["entities"]
        .as_array()
        .expect("entities")
        .iter()
        .find(|r| r["id"] == "you")
        .expect("your row")
}

/// A bat killed in ten seconds, then the next pull opens twenty seconds later with a miss.
const MISS_OPENS: [&str; 5] = [
    "[Tue Nov 17 12:00:00 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You have slain a bat!",
    "[Tue Nov 17 12:00:30 2026] You try to slash a skeleton, but miss!",
    "[Tue Nov 17 12:00:31 2026] You slash a skeleton for 50 points of damage.",
];

/// The same, the next pull four minutes on: the wait is no part of anybody's clock.
const MISS_OPENS_LATE: [&str; 5] = [
    "[Tue Nov 17 12:00:00 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You have slain a bat!",
    "[Tue Nov 17 12:04:30 2026] You try to slash a skeleton, but miss!",
    "[Tue Nov 17 12:04:31 2026] You slash a skeleton for 50 points of damage.",
];

/// The next pull opens with a resisted spell.
const RESIST_OPENS: [&str; 5] = [
    "[Tue Nov 17 12:00:00 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You have slain a bat!",
    "[Tue Nov 17 12:00:30 2026] A skeleton resisted your Burst of Flame!",
    "[Tue Nov 17 12:00:31 2026] You slash a skeleton for 50 points of damage.",
];

/// A heal on yourself between the kill and the next pull.
const HEAL_BETWEEN: [&str; 5] = [
    "[Tue Nov 17 12:00:00 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You have slain a bat!",
    "[Tue Nov 17 12:00:30 2026] You healed Primitive for 120 hit points by Light Healing.",
    "[Tue Nov 17 12:00:41 2026] You slash a skeleton for 50 points of damage.",
];

/// Another player fights nearby between two pulls of yours, and misses once.
const STRANGER_BETWEEN: [&str; 7] = [
    "[Tue Nov 17 12:00:00 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You have slain a bat!",
    "[Tue Nov 17 12:00:20 2026] Scooba slashes a gnoll for 900 points of damage.",
    "[Tue Nov 17 12:00:40 2026] Scooba tries to slash a gnoll, but misses!",
    "[Tue Nov 17 12:01:30 2026] You slash a skeleton for 50 points of damage.",
    "[Tue Nov 17 12:01:31 2026] You have slain a skeleton!",
];

/// A pet that fought two pulls beside you as another combatant, claimed during the second.
const PET_CLAIMED_LATE: [&str; 8] = [
    "[Tue Nov 17 12:00:00 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:02 2026] Gobekn bites a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:10 2026] You slash a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:12 2026] Gobekn bites a bat for 50 points of damage.",
    "[Tue Nov 17 12:00:12 2026] You have slain a bat!",
    "[Tue Nov 17 12:00:40 2026] You slash a skeleton for 50 points of damage.",
    "[Tue Nov 17 12:00:48 2026] Gobekn bites a skeleton for 50 points of damage.",
    "[Tue Nov 17 12:00:49 2026] Gobekn says, 'My leader is Primitive.'",
];

/// The replayed fight is its own ten seconds: the miss that opened the next pull is not in it.
#[test]
fn a_miss_that_opens_the_next_pull_is_not_booked_in_the_fight_that_ended() {
    let e = replayed(&MISS_OPENS);
    let bat = scope(&e, "e1");
    assert_eq!(you(&bat)["ownSec"], json!(10.0), "{}", you(&bat));
    assert_eq!(you(&bat)["misses"], json!(0));
    assert_eq!(you(&bat)["dps"], json!(10.0));
    assert_eq!(bat["selfSec"], json!(10.0));
    // The stay: the bat's ten seconds, a second for the loose miss, a second for the skeleton.
    let zone = scope(&e, "zone");
    assert_eq!(you(&zone)["misses"], json!(1));
    assert_eq!(zone["selfSec"], json!(12.0));
}

/// A resisted spell that opens the next pull is kept out the same way.
#[test]
fn a_resist_that_opens_the_next_pull_is_not_booked_in_the_fight_that_ended() {
    let e = replayed(&RESIST_OPENS);
    let bat = scope(&e, "e1");
    assert_eq!(you(&bat)["ownSec"], json!(10.0), "{}", you(&bat));
    assert_eq!(you(&bat)["resists"], json!(0));
}

/// A heal cast after the kill is healing of the stay, not of the fight that ended.
#[test]
fn a_heal_after_the_kill_is_not_booked_in_the_fight_that_ended() {
    let e = replayed(&HEAL_BETWEEN);
    assert_eq!(scope(&e, "e1")["healing"]["total"], json!(0));
    assert_eq!(scope(&e, "zone")["healing"]["total"], json!(120));
}

/// The promise itself: every list and every scope, the same from a replay as from the live tail.
#[test]
fn the_same_lines_read_the_same_live_and_replayed() {
    let cases: [(&str, &[&str]); 6] = [
        ("a miss opens the next pull", &MISS_OPENS),
        ("a miss opens a pull minutes later", &MISS_OPENS_LATE),
        ("a resist opens the next pull", &RESIST_OPENS),
        ("a heal between two pulls", &HEAL_BETWEEN),
        ("another player fights between two pulls", &STRANGER_BETWEEN),
        ("a pet claimed during its second pull", &PET_CLAIMED_LATE),
    ];
    for (name, lines) in cases {
        let (was_live, restarted) = (live(lines), replayed(lines));
        assert_eq!(
            everything(&was_live, LATER),
            everything(&restarted, LATER),
            "{name}"
        );
    }
}
