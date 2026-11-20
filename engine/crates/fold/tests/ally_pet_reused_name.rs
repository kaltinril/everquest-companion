//! A group mate's pet that rolled a name YOUR pet once had is still the group mate's pet.
//!
//! Summoned pets are named from a small pool, so names come round again. The engine keeps every
//! name that was ever your pet (`ever_pet`) so a retired pet is never taken for a player, and the
//! leader line's refusal ("your own pet is yours, whatever a broadcast says") read that set: a pet
//! named like one you had weeks ago could not be bound to its real owner, and its damage was shown
//! nowhere (owner, 2026-11-19: Malkil's Xabantik; the owner's own pet was Xabantik on the 13th).
//!
//! The refusal now protects the pet you have NOW. A name that is only in the past binds to the
//! leader it names.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

/// Folded as the live tail does.
fn fold(lines: &[&str]) -> Value {
    let parser = Parser::new(
        Clock::new(Tz::America__Los_Angeles),
        None,
        Some("Primitive".to_string()),
    );
    let mut engine = CombatEngine::new();
    engine.set_player_name("Primitive");
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

/// (kind, name, total) of every damage row in the stay you are in.
fn rows(snap: &Value) -> Vec<(String, String, i64)> {
    let entities = snap["selected"]["entities"].as_array().expect("entities");
    let cell = |r: &Value, k: &str| r[k].as_str().unwrap().to_string();
    (entities.iter())
        .map(|r| {
            (
                cell(r, "kind"),
                cell(r, "name"),
                r["total"].as_i64().unwrap(),
            )
        })
        .collect()
}

const ENTER: &str = "[Fri Nov 13 12:00:00 2026] You have entered The Plane of Hate.";
const MY_CLAIM: &str = "[Fri Nov 13 12:00:02 2026] Xabantik says, 'My leader is Primitive.'";
const MY_PET_HITS: &str =
    "[Fri Nov 13 12:00:05 2026] Xabantik slashes a gnoll for 100 points of damage.";
const MY_PET_DIES: &str = "[Fri Nov 13 12:00:30 2026] Xabantik has been slain by a gnoll!";
const LATER_ZONE: &str = "[Thu Nov 19 22:35:15 2026] You have entered The Ruins of Old Paineel.";
const MINE: &str = "[Thu Nov 19 22:58:00 2026] You slash a rock golem for 50 points of damage.";
const THEIR_CLAIM: &str = "[Thu Nov 19 23:04:39 2026] Xabantik says, 'My leader is Malkil.'";
const THEIR_PET_HITS: &str =
    "[Thu Nov 19 23:04:45 2026] Xabantik slashes a rock golem for 300 points of damage.";

#[test]
fn a_group_mates_pet_with_a_name_your_dead_pet_had_is_credited_to_them() {
    let snap = fold(&[
        ENTER,
        MY_CLAIM,
        MY_PET_HITS,
        MY_PET_DIES,
        LATER_ZONE,
        MINE,
        THEIR_CLAIM,
        THEIR_PET_HITS,
    ]);
    let rows = rows(&snap);
    let theirs = (
        "allyPet".to_string(),
        "Pet (Xabantik) - Malkil".to_string(),
        300,
    );
    assert!(rows.contains(&theirs), "{rows:?}");
}

/// The refusal that matters stays: the pet you have NOW is yours, whatever a line in /say claims.
#[test]
fn your_live_pet_is_not_handed_to_whoever_a_say_line_names() {
    let snap = fold(&[
        ENTER,
        MY_CLAIM,
        MY_PET_HITS,
        "[Fri Nov 13 12:00:06 2026] Xabantik says, 'My leader is Malkil.'",
        "[Fri Nov 13 12:00:08 2026] Xabantik slashes a gnoll for 200 points of damage.",
    ]);
    let rows = rows(&snap);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
    let mine: i64 = (rows.iter())
        .filter(|r| r.1.contains("Xabantik"))
        .map(|r| r.2)
        .sum();
    assert_eq!(mine, 300, "{rows:?}");
}
