//! A zone you only passed through is not a zone session. Another player's hit near the zone line
//! is recorded on its own row, and that row alone used to keep the stay: the Overall picker listed
//! the zone with no start time, a one second length and the stranger's whole total as its DPS, and
//! each one took a slot a real session needed (bug hunt, 2026-11-19). A stay is kept when it holds
//! anything of yours: a row of you, your pet or a group mate, or damage you took.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::{json, Value};

fn fold(lines: &[&str]) -> CombatEngine {
    let parser = Parser::new(
        Clock::new(Tz::get("America/Los_Angeles").unwrap()),
        None,
        None,
    );
    let mut engine = CombatEngine::new();
    engine.set_player_name("Primitive");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, None);
    }
    engine
}

/// The finished zone sessions, the live one left out.
fn finished(e: &CombatEngine) -> Vec<Value> {
    let snap = e.snapshot(0, &SnapshotOpts::full(), None);
    let all = snap["zoneSessions"].as_array().expect("zoneSessions");
    all.iter().filter(|z| z["live"] == false).cloned().collect()
}

const ENTER_HATE: &str = "[Tue Nov 17 12:00:00 2026] You have entered The Plane of Hate.";
const STRANGER: &str =
    "[Tue Nov 17 12:00:05 2026] Scooba slashes a gnoll for 9000 points of damage.";
const ENTER_NEXT: &str = "[Tue Nov 17 12:01:00 2026] You have entered The Feerrott.";

#[test]
fn a_stay_where_only_a_stranger_fought_is_not_kept() {
    let e = fold(&[ENTER_HATE, STRANGER, ENTER_NEXT]);
    assert_eq!(finished(&e), Vec::<Value>::new());
}

/// The same stay with one hit of yours is a session, the stranger's row and all.
#[test]
fn a_stay_with_a_hit_of_yours_is_kept() {
    let mine = "[Tue Nov 17 12:00:07 2026] You slash a gnoll for 50 points of damage.";
    let e = fold(&[ENTER_HATE, STRANGER, mine, ENTER_NEXT]);
    let kept = finished(&e);
    assert_eq!(kept.len(), 1, "{kept:?}");
    assert_eq!(kept[0]["zone"], json!("The Plane of Hate"));
    assert_eq!(kept[0]["total"], json!(9050));
    assert_ne!(kept[0]["startTs"], json!(0));
}

/// A fall is damage you took: the stay is kept, so a death by it stays with its own stay.
#[test]
fn a_stay_where_you_only_took_a_fall_is_kept() {
    let fall = "[Tue Nov 17 12:00:07 2026] You were hit by non-melee for 40 damage.";
    let e = fold(&[ENTER_HATE, STRANGER, fall, ENTER_NEXT]);
    assert_eq!(finished(&e).len(), 1);
}

/// Your own swing that missed is yours too: kept, as before.
#[test]
fn a_stay_where_you_only_missed_is_kept() {
    let miss = "[Tue Nov 17 12:00:07 2026] You try to slash a gnoll, but miss!";
    let e = fold(&[ENTER_HATE, miss, ENTER_NEXT]);
    assert_eq!(finished(&e).len(), 1);
}

/// "New session" closes a stay the same way: a stranger's damage alone mints no session.
#[test]
fn a_session_mark_over_a_strangers_damage_mints_nothing() {
    let mut e = fold(&[ENTER_HATE, STRANGER]);
    e.set_live();
    assert!(e.session_mark(1_800_000_000_000));
    assert_eq!(finished(&e), Vec::<Value>::new());
}
