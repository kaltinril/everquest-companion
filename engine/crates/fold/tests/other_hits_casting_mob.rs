//! A group-mate the roster has not learned still gets a row for hitting a proper-named mob that casts.
//!
//! The record-everything ladder drops a recorded combatant's hit on a friendly. Its defender test
//! used to include the ally model's caster set, which takes every player-shaped name seen casting,
//! and a proper-named mob casts too. So one `Undertow begins casting Immobilize.` and every hit
//! Malkil landed on Undertow vanished from the meter (owner, 2026-11-23: "Where is Malkil's
//! damage?").

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

/// Folded as the live tail does, then the stay you are in.
fn fold(lines: &[&str]) -> Value {
    let parser = Parser::new(
        Clock::new(Tz::get("America/Los_Angeles").unwrap()),
        None,
        Some("Drywrought".to_string()),
    );
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    let mut now = 0;
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        now = ev.ts();
        engine.on_event(&ev, true, None);
    }
    let opts = SnapshotOpts {
        selected_id: Some("zone".to_string()),
        ..SnapshotOpts::full()
    };
    engine.snapshot(now, &opts, None)
}

/// The total of the row with this name, if there is one.
fn total_of(snap: &Value, name: &str) -> Option<i64> {
    let entities = snap["selected"]["entities"].as_array().expect("entities");
    (entities.iter())
        .find(|r| r["name"].as_str() == Some(name))
        .map(|r| r["total"].as_i64().unwrap())
}

const CASTS: &str =
    "[Mon Nov 23 22:25:04 2026] Undertow begins casting Elnerick's Entombment of Ice.";
const SPELL: &str = "[Mon Nov 23 22:25:07 2026] Malkil hit Undertow for 633 points of magic damage by Garrison's Mighty Mana Shock X.";
const MINE: &str = "[Mon Nov 23 22:25:16 2026] You punch Undertow for 284 points of damage.";
const SHOT: &str = "[Mon Nov 23 22:25:17 2026] Malkil shoots Undertow for 656 points of damage. (Critical Double Bow Shot)";

#[test]
fn a_hit_on_a_proper_named_mob_that_cast_a_spell_is_booked() {
    let snap = fold(&[CASTS, SPELL, MINE, SHOT]);
    assert_eq!(total_of(&snap, "Malkil"), Some(633 + 656), "{snap}");
}

#[test]
fn the_same_hits_on_a_mob_that_never_cast_were_always_booked() {
    let snap = fold(&[SPELL, MINE, SHOT]);
    assert_eq!(total_of(&snap, "Malkil"), Some(633 + 656));
}
