//! Whose pet is it, when it has not said? (requirements/pet-rules.md, rule 3; 2026-11-20.)
//!
//! A group mate's summoned pet was credited only from its `My leader is ...` line, which most
//! players never trigger. The log does say one thing sooner: `<Name> begins casting <a pet
//! summon>.` When exactly one group mate's summon is waiting for a name and a name from the game's
//! pet-name table then acts for the first time against something the group is fighting, the pet is
//! taken to be theirs, and the row says it is a guess. Two summons waiting at once (two group
//! mates, or a group mate and you) is no guess at all. A leader line or a claim replaces the guess
//! and takes the damage with it.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, RosterSnap, RosterSource, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

/// A roster that admitted the names it holds.
struct Group(Vec<String>);

impl RosterSource for Group {
    fn snap(&self) -> RosterSnap {
        RosterSnap::empty()
    }
    fn members(&self) -> Vec<String> {
        self.0.clone()
    }
    fn admitted(&self) -> Vec<String> {
        self.0.clone()
    }
}

/// Fold `lines` with Malkil and Kamas in the group.
fn fold(lines: &[&str]) -> Vec<(String, String, i64)> {
    let parser = Parser::new(
        Clock::new(Tz::get("America/Los_Angeles").unwrap()),
        None,
        Some("Drywrought".to_string()),
    );
    let roster = Group(vec!["malkil".to_string(), "kamas".to_string()]);
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, Some(&roster));
    }
    let opts = SnapshotOpts {
        selected_id: Some("zone".to_string()),
        ..SnapshotOpts::full()
    };
    let snap: Value = engine.snapshot(0, &opts, Some(&roster));
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

const MALKIL_SUMMONS: &str = "[Sat Oct 10 18:13:30 2026] Malkil begins casting Kintaz's Animation.";
const KAMAS_SUMMONS: &str = "[Sat Oct 10 18:13:32 2026] Kamas begins casting Kintaz's Animation.";
const I_SUMMON: &str = "[Sat Oct 10 18:13:34 2026] You begin casting Kintaz's Animation.";
const I_ENGAGE: &str = "[Sat Oct 10 18:13:50 2026] You slash a gnoll for 50 points of damage.";
const PET_HITS: &str = "[Sat Oct 10 18:13:52 2026] Jeber bites a gnoll for 70 points of damage.";
const PET_HITS_AGAIN: &str =
    "[Sat Oct 10 18:13:55 2026] Jeber bites a gnoll for 30 points of damage.";

#[test]
fn one_group_mate_summoned_and_a_new_pet_joins_the_fight_it_is_theirs_and_marked_a_guess() {
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, PET_HITS]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil (guessed)", 70)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| r.0 != "other"), "{rows:?}");
}

#[test]
fn what_the_pet_did_before_the_group_engaged_moves_to_the_guessed_row() {
    // The pet lands the first blow: nothing is engaged yet, so it is recorded with no owner. Your
    // swing engages the gnoll, and the pet's next swing is the one the guess is made on.
    let early = "[Sat Oct 10 18:13:48 2026] Jeber bites a gnoll for 40 points of damage.";
    let before = fold(&[MALKIL_SUMMONS, early]);
    assert!(
        before.contains(&row("other", "Pet (Jeber) - owner unknown", 40)),
        "{before:?}"
    );
    let rows = fold(&[MALKIL_SUMMONS, early, I_ENGAGE, PET_HITS]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil (guessed)", 110)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| r.0 != "other"), "{rows:?}");
}

#[test]
fn a_miss_makes_the_guess_too() {
    let miss = "[Sat Oct 10 18:13:51 2026] Jeber tries to bite a gnoll, but misses!";
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, miss, PET_HITS]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil (guessed)", 70)),
        "{rows:?}"
    );
}

#[test]
fn two_group_mates_summoned_so_nobody_is_guessed() {
    let rows = fold(&[MALKIL_SUMMONS, KAMAS_SUMMONS, I_ENGAGE, PET_HITS]);
    assert!(
        rows.contains(&row("other", "Pet (Jeber) - owner unknown", 70)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}

#[test]
fn you_summoned_as_well_so_the_new_pet_may_be_yours_and_nobody_is_guessed() {
    let rows = fold(&[MALKIL_SUMMONS, I_SUMMON, I_ENGAGE, PET_HITS]);
    assert!(
        rows.contains(&row("other", "Pet (Jeber) - owner unknown", 70)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}

#[test]
fn a_summon_by_someone_outside_the_group_guesses_nothing() {
    let stranger = "[Sat Oct 10 18:13:30 2026] Zebuxoruk begins casting Kintaz's Animation.";
    let rows = fold(&[stranger, I_ENGAGE, PET_HITS]);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
    assert!(
        rows.contains(&row("other", "Pet (Jeber) - owner unknown", 70)),
        "{rows:?}"
    );
}

#[test]
fn a_pet_already_fighting_before_the_summon_is_not_that_summons_pet() {
    let before = "[Sat Oct 10 18:13:20 2026] Jeber bites a bat for 20 points of damage.";
    let rows = fold(&[before, MALKIL_SUMMONS, I_ENGAGE, PET_HITS]);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
    assert!(
        rows.contains(&row("other", "Pet (Jeber) - owner unknown", 90)),
        "{rows:?}"
    );
}

#[test]
fn a_pet_that_acts_before_the_cast_could_have_finished_is_not_guessed() {
    let at_once = "[Sat Oct 10 18:13:31 2026] Jeber bites a gnoll for 70 points of damage.";
    let engage = "[Sat Oct 10 18:13:30 2026] You slash a gnoll for 50 points of damage.";
    let rows = fold(&[engage, MALKIL_SUMMONS, at_once]);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}

#[test]
fn a_summon_more_than_ten_minutes_old_is_no_longer_waited_on() {
    let engage = "[Sat Oct 10 18:24:00 2026] You slash a gnoll for 50 points of damage.";
    let late = "[Sat Oct 10 18:24:02 2026] Jeber bites a gnoll for 70 points of damage.";
    let rows = fold(&[MALKIL_SUMMONS, engage, late]);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}

#[test]
fn a_pet_that_swings_at_something_the_group_is_not_fighting_is_not_guessed() {
    let elsewhere = "[Sat Oct 10 18:13:52 2026] Jeber bites a bat for 70 points of damage.";
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, elsewhere]);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}

#[test]
fn one_summon_explains_one_pet() {
    let second = "[Sat Oct 10 18:13:56 2026] Gebarn bites a gnoll for 25 points of damage.";
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, PET_HITS, second]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil (guessed)", 70)),
        "{rows:?}"
    );
    assert!(
        rows.contains(&row("other", "Pet (Gebarn) - owner unknown", 25)),
        "{rows:?}"
    );
}

#[test]
fn a_leader_line_naming_the_guessed_owner_takes_the_mark_off() {
    let says = "[Sat Oct 10 18:13:54 2026] Jeber says, 'My leader is Malkil.'";
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, PET_HITS, says, PET_HITS_AGAIN]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil", 100)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| !r.1.contains("guessed")), "{rows:?}");
}

#[test]
fn a_leader_line_naming_someone_else_moves_everything_to_them() {
    let says = "[Sat Oct 10 18:13:54 2026] Jeber says, 'My leader is Kamas.'";
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, PET_HITS, says, PET_HITS_AGAIN]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Kamas", 100)),
        "{rows:?}"
    );
    assert!(rows.iter().all(|r| !r.1.contains("Malkil")), "{rows:?}");
}

#[test]
fn the_pet_naming_you_takes_the_guessed_damage_into_your_pets_row() {
    let says = "[Sat Oct 10 18:13:54 2026] Jeber says, 'My leader is Drywrought.'";
    let rows = fold(&[MALKIL_SUMMONS, I_ENGAGE, PET_HITS, says, PET_HITS_AGAIN]);
    let mine: i64 = (rows.iter())
        .filter(|r| r.0 == "pet" && r.1.contains("Jeber"))
        .map(|r| r.2)
        .sum();
    assert_eq!(mine, 100, "{rows:?}");
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}

#[test]
fn a_group_mate_who_summons_again_gets_the_new_pet_and_the_old_guess_ends() {
    let again = "[Sat Oct 10 18:15:00 2026] Malkil begins casting Kintaz's Animation.";
    let new_pet = "[Sat Oct 10 18:15:20 2026] Gebarn bites a gnoll for 25 points of damage.";
    let old_pet = "[Sat Oct 10 18:15:25 2026] Jeber bites a gnoll for 10 points of damage.";
    // The fight is still on: a fresh swing of yours keeps the gnoll something the group fights.
    let still = "[Sat Oct 10 18:15:18 2026] You slash a gnoll for 5 points of damage.";
    let rows = fold(&[
        MALKIL_SUMMONS,
        I_ENGAGE,
        PET_HITS,
        again,
        still,
        new_pet,
        old_pet,
    ]);
    assert!(
        rows.contains(&row("allyPet", "Pet (Gebarn) - Malkil (guessed)", 25)),
        "{rows:?}"
    );
    // What the first pet did while it was taken for Malkil's stays where it was booked; its
    // swing after the second summon is a pet with no owner.
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil (guessed)", 70)),
        "{rows:?}"
    );
    assert!(
        rows.contains(&row("other", "Pet (Jeber) - owner unknown", 10)),
        "{rows:?}"
    );
}
