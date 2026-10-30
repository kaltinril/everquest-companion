//! The death recap off a real death: `tests/fixtures/death-recap.log` is the owner's SK dying to a
//! tree snake and a black bear (chat lines removed). The recap the engine hands the Combat tab must
//! equal `tests/fixtures/death-recap.json`, which the renderer's grouping test reads too, so the two
//! ends cannot drift apart.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

const LOG: &str = include_str!("../../../../tests/fixtures/death-recap.log");
const EXPECTED: &str = include_str!("../../../../tests/fixtures/death-recap.json");

fn folded() -> CombatEngine {
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
    engine
}

fn snapshot(engine: &CombatEngine, selected: Option<&str>) -> Value {
    let opts = SnapshotOpts {
        selected_id: selected.map(str::to_string),
        ..SnapshotOpts::full()
    };
    engine.snapshot(0, &opts, None)
}

#[test]
fn the_fight_you_died_in_carries_the_recap() {
    let engine = folded();
    let snap = snapshot(&engine, None);
    let deaths = &snap["selected"]["deaths"];
    let expected: Value = serde_json::from_str(EXPECTED).expect("the fixture is JSON");
    assert_eq!(
        deaths,
        &expected,
        "{}",
        serde_json::to_string_pretty(deaths).unwrap()
    );
}

#[test]
fn the_window_is_the_fifteen_seconds_before_the_death() {
    let snap = snapshot(&folded(), None);
    let d = &snap["selected"]["deaths"][0];
    let death = d["ts"].as_i64().unwrap();
    let hits = d["hits"].as_array().unwrap();
    assert!(!hits.is_empty());
    assert!(hits
        .iter()
        .all(|h| (death - 15_000..=death).contains(&h["ts"].as_i64().unwrap())));
    assert_eq!(d["killer"], "a tree snake");
    // The self-heal names you by name (`You healed Valtari`) and still counts.
    assert!(!d["heals"].as_array().unwrap().is_empty());
}

#[test]
fn the_zone_stay_carries_it_and_a_quiet_segment_does_not() {
    let engine = folded();
    let zone = snapshot(&engine, Some("zone"));
    assert_eq!(zone["selected"]["deaths"].as_array().map(Vec::len), Some(1));
    // No death, no key: a segment without one keeps its exact prior shape.
    let mut quiet = CombatEngine::new();
    quiet.set_player_name("Valtari");
    assert!(snapshot(&quiet, Some("zone"))["selected"]
        .get("deaths")
        .is_none());
}
