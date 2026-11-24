//! A mob held on your mez is still in the fight (owner, 2026-11-23, `meter-dps-clock.md`): the wait
//! counts in the fight clock and the zone clock. Before, the idle fallback ended a fight after 60 s
//! with no damage and no crowd-control line, so a Dazzle left to run (74 to 136 s in the fixtures,
//! `tests/fixtures/w63-dazzle-break-vs-full.log`) split the pull in two and lost the wait from both
//! clocks.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

fn fold(lines: &[&str]) -> CombatEngine {
    let parser = Parser::new(
        Clock::new(Tz::America__Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, None);
    }
    engine
}

fn selected(e: &CombatEngine, id: &str) -> Value {
    let opts = SnapshotOpts {
        selected_id: Some(id.to_string()),
        ..SnapshotOpts::full()
    };
    e.snapshot(0, &opts, None)["selected"].clone()
}

/// The fights the engine holds, finished and open: one entry per fight id.
fn fight_ids(e: &CombatEngine) -> Vec<String> {
    let snap = e.snapshot(0, &SnapshotOpts::full(), None);
    let segs = snap["segments"].as_array().expect("segments").clone();
    segs.iter()
        .filter(|s| s["kind"] != "zone")
        .map(|s| s["id"].as_str().expect("id").to_string())
        .collect()
}

/// You hit the gnoll, Dazzle the second one, wait out 100 s with nothing else in the log, and kill
/// it when the mez wears off. One fight, 120 s long, and the zone clock and your own clock agree.
#[test]
fn a_dazzle_left_to_run_keeps_the_fight_and_its_wait() {
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:05 2026] You begin casting Dazzle IV.",
        "[Tue Nov 17 12:00:08 2026] a gnoll pup has been mesmerized.",
        "[Tue Nov 17 12:00:10 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:10 2026] You have slain a gnoll!",
        "[Tue Nov 17 12:01:50 2026] Your Dazzle spell has worn off of a gnoll pup.",
        "[Tue Nov 17 12:02:00 2026] You slash a gnoll pup for 50 points of damage.",
    ]);
    assert_eq!(
        fight_ids(&e).len(),
        1,
        "one fight, not two: {:?}",
        fight_ids(&e)
    );
    let fight = selected(&e, "e1");
    assert_eq!(fight["durationSec"], 120.0);
    assert_eq!(fight["selfSec"], 120.0);
    let zone = selected(&e, "zone");
    assert_eq!(zone["durationSec"], 120.0);
    assert_eq!(zone["selfSec"], 120.0);
}

/// A mez with no wear-off line at all does not hold the fight forever: past the hold's bound the
/// fallback ends it as before, and the next swing is a new fight.
#[test]
fn a_mez_never_seen_to_end_lets_the_fight_close_after_its_bound() {
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:05 2026] You begin casting Dazzle IV.",
        "[Tue Nov 17 12:00:08 2026] a gnoll pup has been mesmerized.",
        "[Tue Nov 17 12:10:00 2026] You slash a gnoll pup for 50 points of damage.",
    ]);
    assert_eq!(fight_ids(&e).len(), 2, "{:?}", fight_ids(&e));
}

/// The held mob dying ends its hold: with nothing else in the fight, the quiet after it closes the
/// fight at the idle fallback as before.
#[test]
fn the_held_mob_dying_ends_the_hold() {
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:05 2026] You begin casting Dazzle IV.",
        "[Tue Nov 17 12:00:08 2026] a gnoll pup has been mesmerized.",
        "[Tue Nov 17 12:00:10 2026] a gnoll pup has been slain by Malkil!",
        "[Tue Nov 17 12:01:30 2026] You slash a gnoll for 50 points of damage.",
    ]);
    assert_eq!(fight_ids(&e).len(), 2, "{:?}", fight_ids(&e));
}

/// A root is not a hold: a mob ensnared and left alone still lets the quiet fight close.
#[test]
fn a_root_does_not_hold_the_fight() {
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:05 2026] You begin casting Ensnare.",
        "[Tue Nov 17 12:00:08 2026] a gnoll pup has been ensnared.",
        "[Tue Nov 17 12:01:30 2026] You slash a gnoll pup for 50 points of damage.",
    ]);
    assert_eq!(fight_ids(&e).len(), 2, "{:?}", fight_ids(&e));
}

/// A Dazzle IV runs past the 120 s CC hold (136 s measured): the held mob still vetoes the
/// death-close after that hold has run out, so a line in the wait does not end the fight.
#[test]
fn a_mez_longer_than_the_cc_hold_still_holds_the_fight() {
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:05 2026] You begin casting Dazzle IV.",
        "[Tue Nov 17 12:00:08 2026] a gnoll pup has been mesmerized.",
        "[Tue Nov 17 12:00:10 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:10 2026] You have slain a gnoll!",
        "[Tue Nov 17 12:02:15 2026] You begin casting Tashania.",
        "[Tue Nov 17 12:02:24 2026] Your Dazzle spell has worn off of a gnoll pup.",
        "[Tue Nov 17 12:02:30 2026] You slash a gnoll pup for 50 points of damage.",
    ]);
    assert_eq!(fight_ids(&e).len(), 1, "{:?}", fight_ids(&e));
    assert_eq!(selected(&e, "e1")["durationSec"], 150.0);
}
