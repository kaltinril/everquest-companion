//! A summoned pet is not yours until it says so (`/pet leader`, a tell, a pet buff), so it fights
//! first as another combatant and its row moves to you at the claim. The row brought its damage
//! into the You scope but not its swing time, so the You headline divided your and the pet's damage
//! by your own seconds alone and read many times too high (bug hunt, 2026-11-19). The claim now
//! brings the time too: one fight's two clocks count as their hull, in the fight and in the stay.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::{json, Value};

fn fold(lines: &[&str]) -> CombatEngine {
    let parser = Parser::new(
        Clock::new(Tz::get("America/Los_Angeles").unwrap()),
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

/// The You scope's seconds for one fight or the stay (`SegmentView.selfSec`).
fn self_sec(e: &CombatEngine, id: &str) -> Value {
    let opts = SnapshotOpts {
        selected_id: Some(id.to_string()),
        ..SnapshotOpts::full()
    };
    e.snapshot(0, &opts, None)["selected"]["selfSec"].clone()
}

const CLAIM: &str = "Gobekn says, 'My leader is Drywrought.'";

/// You swing once and the pet fights on for fifteen seconds before it is claimed.
#[test]
fn a_claim_brings_the_pets_swing_time_into_the_you_scope() {
    let claim = format!("[Tue Nov 17 12:00:16 2026] {CLAIM}");
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:01 2026] Gobekn bites a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:15 2026] Gobekn bites a gnoll for 50 points of damage.",
        &claim,
    ]);
    // First swing (yours) to last swing (the pet's), not your lone second.
    assert_eq!(self_sec(&e, "e1"), json!(15.0));
    assert_eq!(self_sec(&e, "zone"), json!(15.0));
}

/// The pet fought alone, with no fight of yours open: its time is the stay's You time.
#[test]
fn a_pet_that_fought_alone_before_its_claim_brings_its_time() {
    let claim = format!("[Tue Nov 17 12:00:21 2026] {CLAIM}");
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] Gobekn bites a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:20 2026] Gobekn bites a gnoll for 50 points of damage.",
        &claim,
    ]);
    assert_eq!(self_sec(&e, "zone"), json!(20.0));
}

/// Two fights you and the pet both swung in, claimed during the second. Each fight is its hull,
/// and the stay is the two hulls: your seconds and the pet's are not added on top of each other.
#[test]
fn a_late_claim_counts_each_finished_fight_once() {
    let claim = format!("[Tue Nov 17 12:05:09 2026] {CLAIM}");
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:02 2026] Gobekn bites a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:10 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:12 2026] Gobekn bites a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:12 2026] You have slain a gnoll!",
        "[Tue Nov 17 12:05:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:05:08 2026] Gobekn bites a gnoll for 50 points of damage.",
        &claim,
    ]);
    assert_eq!(self_sec(&e, "e1"), json!(12.0));
    assert_eq!(self_sec(&e, "e2"), json!(8.0));
    assert_eq!(self_sec(&e, "zone"), json!(20.0));
}

/// A group-mate's pet is not in the You scope: its leader line moves no time into it.
#[test]
fn another_players_pet_leaves_the_you_scope_alone() {
    let e = fold(&[
        "[Tue Nov 17 12:00:00 2026] You slash a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:01 2026] Jeber bites a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:20 2026] Jeber bites a gnoll for 50 points of damage.",
        "[Tue Nov 17 12:00:21 2026] Jeber says, 'My leader is Malkil.'",
    ]);
    assert_eq!(self_sec(&e, "e1"), json!(1.0));
}
