//! A pet's `My leader is ...` line reaches the zone stays already closed (owner, 2026-11-20).
//!
//! Malkil's Zarartik fought through three stays before anyone asked it who its leader was. The line
//! moved its damage in every fight and in the stay you were in, but the closed stays kept it as
//! "owner unknown", a row the Group view hides: 162k of its 204k was missing from them.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, RosterSnap, RosterSource, SnapshotOpts};
use fold::event::Event;

struct Group;

impl RosterSource for Group {
    fn snap(&self) -> RosterSnap {
        RosterSnap::empty()
    }
    fn members(&self) -> Vec<String> {
        vec!["malkil".to_string()]
    }
    fn admitted(&self) -> Vec<String> {
        vec!["malkil".to_string()]
    }
}

/// (kind, name, total) of every damage row in the stay `id`.
fn stay(lines: &[&str], id: &str) -> Vec<(String, String, i64)> {
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
        engine.on_event(&ev, false, Some(&Group));
    }
    let opts = SnapshotOpts {
        selected_id: Some(id.to_string()),
        ..SnapshotOpts::full()
    };
    let snap = engine.snapshot(0, &opts, Some(&Group));
    (snap["selected"]["entities"].as_array().expect("entities"))
        .iter()
        .map(|r| {
            (
                r["kind"].as_str().unwrap().to_string(),
                r["name"].as_str().unwrap().to_string(),
                r["total"].as_i64().unwrap(),
            )
        })
        .collect()
}

fn row(kind: &str, name: &str, total: i64) -> (String, String, i64) {
    (kind.to_string(), name.to_string(), total)
}

const ZONE_A: &str = "[Fri Nov 20 20:00:00 2026] You have entered Kerra Isle.";
const MINE_A: &str = "[Fri Nov 20 20:00:10 2026] You slash a rock golem for 50 points of damage.";
const PET_A: &str =
    "[Fri Nov 20 20:00:12 2026] Zarartik slashes a rock golem for 300 points of damage.";
const PET_DIES: &str = "[Fri Nov 20 20:00:40 2026] Zarartik has been slain by a rock golem!";
const ZONE_B: &str = "[Fri Nov 20 21:00:00 2026] You have entered The Ruins of Old Paineel.";
const MINE_B: &str = "[Fri Nov 20 21:00:10 2026] You slash a rock golem for 60 points of damage.";
const PET_B: &str =
    "[Fri Nov 20 21:00:12 2026] Zarartik slashes a rock golem for 400 points of damage.";
const ZONE_C: &str = "[Fri Nov 20 22:00:00 2026] You have entered The Ruins of Old Paineel.";
const MINE_C: &str = "[Fri Nov 20 22:00:10 2026] You slash a rock golem for 70 points of damage.";
const LEADER: &str = "[Fri Nov 20 22:00:20 2026] Zarartik says, 'My leader is Malkil.'";
const CLAIM: &str = "[Fri Nov 20 22:00:20 2026] Zarartik says, 'My leader is Drywrought.'";

#[test]
fn a_leader_line_moves_the_pets_damage_in_every_closed_stay_it_fought_in() {
    let lines = [
        ZONE_A, MINE_A, PET_A, ZONE_B, MINE_B, PET_B, ZONE_C, MINE_C, LEADER,
    ];
    for (id, total) in [("zs1", 300), ("zs2", 400)] {
        let rows = stay(&lines, id);
        assert!(
            rows.contains(&row("allyPet", "Pet (Zarartik) - Malkil", total)),
            "{id}: {rows:?}"
        );
        assert!(rows.iter().all(|r| r.0 != "other"), "{id}: {rows:?}");
    }
}

#[test]
fn a_stay_from_before_an_earlier_pet_of_that_name_died_is_left_alone() {
    let lines = [
        ZONE_A, MINE_A, PET_A, PET_DIES, ZONE_B, MINE_B, PET_B, ZONE_C, MINE_C, LEADER,
    ];
    let older = stay(&lines, "zs1");
    assert!(
        older.contains(&row("other", "Pet (Zarartik) - owner unknown", 300)),
        "{older:?}"
    );
    let newer = stay(&lines, "zs2");
    assert!(
        newer.contains(&row("allyPet", "Pet (Zarartik) - Malkil", 400)),
        "{newer:?}"
    );
}

#[test]
fn the_pet_naming_you_moves_its_closed_stays_to_your_pet() {
    let lines = [ZONE_B, MINE_B, PET_B, ZONE_C, MINE_C, CLAIM];
    let rows = stay(&lines, "zs1");
    let mine: i64 = (rows.iter())
        .filter(|r| r.0 == "pet" && r.1.contains("Zarartik"))
        .map(|r| r.2)
        .sum();
    assert_eq!(mine, 400, "{rows:?}");
    assert!(rows.iter().all(|r| r.0 != "other"), "{rows:?}");
}

#[test]
fn a_guess_settled_by_a_leader_line_moves_in_the_closed_stay_too() {
    let summon = "[Fri Nov 20 20:59:00 2026] Malkil begins casting Kintaz's Animation.";
    let says_kamas = "[Fri Nov 20 22:00:20 2026] Zarartik says, 'My leader is Kamas.'";
    let lines = [summon, ZONE_B, MINE_B, PET_B, ZONE_C, MINE_C, says_kamas];
    let rows = stay(&lines, "zs1");
    assert!(
        rows.contains(&row("allyPet", "Pet (Zarartik) - Kamas", 400)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| !r.1.contains("Malkil (guessed)")), "{rows:?}");
}

const BOUND: &str = "[Fri Nov 20 21:00:00 2026] Zarartik says, 'My leader is Malkil.'";
const HIT_1: &str =
    "[Fri Nov 20 21:00:10 2026] Zarartik slashes a rock golem for 100 points of damage.";
const LIFETAP: &str =
    "[Fri Nov 20 21:00:20 2026] Zarartik hit Zarartik for 6 points of magic damage by Lifebite.";
const HIT_2: &str =
    "[Fri Nov 20 21:00:30 2026] Zarartik slashes a rock golem for 40 points of damage.";
const BOUND_AGAIN: &str = "[Fri Nov 20 21:00:35 2026] Zarartik says, 'My leader is Malkil.'";
const HIT_3: &str =
    "[Fri Nov 20 21:00:40 2026] Zarartik slashes a rock golem for 2 points of damage.";

/// The owner's screenshot, 2026-11-20: one Lifebite on itself and Malkil's pet left every meter,
/// through any number of `/pet leader`.
#[test]
fn a_pets_lifetap_on_itself_does_not_take_it_off_the_meter() {
    let rows = stay(&[ZONE_B, MINE_B, BOUND, HIT_1, LIFETAP, HIT_2, BOUND_AGAIN, HIT_3], "zone");
    assert!(
        rows.contains(&row("allyPet", "Pet (Zarartik) - Malkil", 142)),
        "the three swings, and not the 6 it did to itself: {rows:?}"
    );
}

/// The rule the lifetap was caught by stays for what it is for: a SWING at its own name is a second
/// creature with that name, and which one landed cannot be told.
#[test]
fn a_melee_swing_at_its_own_name_is_still_a_twin() {
    let twin = "[Fri Nov 20 21:00:20 2026] Zarartik slashes Zarartik for 6 points of damage.";
    let rows = stay(&[ZONE_B, MINE_B, BOUND, HIT_1, twin, HIT_2], "zone");
    let pet: i64 = (rows.iter())
        .filter(|r| r.0 == "allyPet")
        .map(|r| r.2)
        .sum();
    assert_eq!(pet, 100, "nothing after the twin line is credited: {rows:?}");
}
