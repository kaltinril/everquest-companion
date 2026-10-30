//! The swing timer's input off a real fight: `tests/fixtures/swing-timer.log` is the owner's SK
//! slashing a black bear with a two-hander (chat removed), spells and taunts in between. The swing
//! seconds the engine serves must equal `tests/fixtures/swing-rounds.json`, which the renderer's
//! cadence test reads too.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

const LOG: &str = include_str!("../../../../tests/fixtures/swing-timer.log");
const EXPECTED: &str = include_str!("../../../../tests/fixtures/swing-rounds.json");

fn swing_rounds() -> Value {
    let mut engine = CombatEngine::new();
    engine.set_player_name("Valtari");
    let parser = Parser::new(Clock::new(Tz::America__Los_Angeles), None, None);
    for (seq, raw) in LOG.lines().enumerate() {
        let mut ev = Ev::new();
        if !parser.parse_event(raw, seq as i64, &mut ev) {
            continue;
        }
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, None);
    }
    engine.snapshot(0, &SnapshotOpts::full(), None)["swingRounds"].clone()
}

#[test]
fn every_slash_second_landed_or_missed_and_no_spell() {
    let rounds = swing_rounds();
    let expected: Value = serde_json::from_str(EXPECTED).expect("the fixture is JSON");
    assert_eq!(rounds, expected, "{rounds}");
    // Twenty seconds with a slash in them: the misses count, the Lifetap and Spike lines do not.
    assert_eq!(rounds.as_array().map(Vec::len), Some(20));
}

#[test]
fn nothing_swung_no_key() {
    let engine = CombatEngine::new();
    let snap = engine.snapshot(0, &SnapshotOpts::full(), None);
    assert!(snap.get("swingRounds").is_none());
}
