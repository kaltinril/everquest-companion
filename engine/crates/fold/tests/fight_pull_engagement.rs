//! A mob already fighting the group is in the pull (owner, 2026-11-23: "it's being too aggressive
//! about ending fights"; "when I tab to a new mob the DPS seems to show only the damage for that
//! mob").
//!
//! A fight closes 5 s after its last damage once every ENGAGED mob is dead. Before, a mob was
//! engaged only by damage of ours landing on it or by its damage landing on you, so a mob that was
//! swinging at a group member, at a pet, or missing you was not in the fight: the kill before it
//! closed the pull, and your first swing at it opened a fight of its own showing only that mob.
//! Tonight's log (Kedge Keep, with Malkil): a shimmering sailfin bit at Malkil and then at you for
//! 37 s after Cauldronbubble died, and its kill was a separate fight.

use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::{registered, ClusterDeps, Fold};

fn fold(lines: &[&str]) -> Fold {
    let parser = Parser::new(
        Clock::new(Tz::America__Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    let mut f = Fold::new(registered(ClusterDeps::default()), i64::MAX).with_combat(engine);
    let mut text = lines.join("\n");
    text.push('\n');
    f.fold_bytes(&parser, text.as_bytes());
    f
}

/// The fights the engine holds, finished and open, as (start, duration) pairs.
fn fights(f: &Fold) -> Vec<(i64, f64)> {
    let snap = f.combat.as_ref().expect("the engine").snapshot(
        0,
        &SnapshotOpts::full(),
        f.registry.roster(),
    );
    snap["segments"]
        .as_array()
        .expect("segments")
        .iter()
        .filter(|s| s["kind"] != "zone")
        .map(|s| {
            (
                s["startTs"].as_i64().unwrap_or_default(),
                s["durationSec"].as_f64().unwrap_or_default(),
            )
        })
        .collect()
}

const JOIN_MALKIL: [&str; 3] = [
    "[Mon Nov 23 21:50:04 2026] Malkil invites you to join a group.",
    "[Mon Nov 23 21:50:08 2026] You notify Malkil that you agree to join the group.",
    "[Mon Nov 23 21:50:08 2026] You have joined the group.",
];

fn with_group(lines: &[&'static str]) -> Vec<&'static str> {
    JOIN_MALKIL.iter().chain(lines.iter()).copied().collect()
}

/// Tonight at 22:15:51: Cauldronbubble dies; the sailfin that was biting at Malkil turns to you,
/// missing every time, and Malkil kills it 37 s later. One fight, as long as the sailfin lived.
#[test]
fn a_mob_swinging_at_the_group_holds_the_fight_until_it_dies() {
    let f = fold(&with_group(&[
        "[Mon Nov 23 22:15:33 2026] You punch Cauldronbubble for 100 points of damage.",
        "[Mon Nov 23 22:15:51 2026] A shimmering sailfin tries to bite Malkil, but misses!",
        "[Mon Nov 23 22:15:52 2026] You punch Cauldronbubble for 263 points of damage. (Finishing Blow)",
        "[Mon Nov 23 22:15:52 2026] You have slain Cauldronbubble!",
        "[Mon Nov 23 22:15:54 2026] A shimmering sailfin tries to bite Malkil, but misses!",
        "[Mon Nov 23 22:15:57 2026] A shimmering sailfin tries to bite Malkil, but misses!",
        "[Mon Nov 23 22:16:00 2026] A shimmering sailfin tries to bite YOU, but misses!",
        "[Mon Nov 23 22:16:06 2026] A shimmering sailfin tries to bite YOU, but misses!",
        "[Mon Nov 23 22:16:12 2026] A shimmering sailfin tries to bite YOU, but misses!",
        "[Mon Nov 23 22:16:18 2026] A shimmering sailfin tries to bite YOU, but misses!",
        "[Mon Nov 23 22:16:24 2026] A shimmering sailfin tries to bite YOU, but YOU dodge!",
        "[Mon Nov 23 22:16:29 2026] Malkil shoots a shimmering sailfin for 19 points of damage.",
        "[Mon Nov 23 22:16:29 2026] A shimmering sailfin has been slain by Malkil!",
    ]));
    let got = fights(&f);
    assert_eq!(got.len(), 1, "one fight, not two: {got:?}");
    assert_eq!(got[0].1, 56.0);
}

/// A mob that hit only Malkil during the pull is in it: killing the first mob does not end the
/// fight, and your swing at the second 7 s later lands in the same one.
#[test]
fn a_mob_hitting_a_member_is_engaged() {
    let f = fold(&with_group(&[
        "[Mon Nov 23 22:00:00 2026] You punch a stingtooth piranha for 100 points of damage.",
        "[Mon Nov 23 22:00:02 2026] A lancer swordfish slices Malkil for 20 points of damage.",
        "[Mon Nov 23 22:00:03 2026] You punch a stingtooth piranha for 100 points of damage.",
        "[Mon Nov 23 22:00:03 2026] You have slain a stingtooth piranha!",
        "[Mon Nov 23 22:00:05 2026] A lancer swordfish slices Malkil for 20 points of damage.",
        "[Mon Nov 23 22:00:10 2026] You punch a lancer swordfish for 100 points of damage.",
        "[Mon Nov 23 22:00:12 2026] You have slain a lancer swordfish!",
    ]));
    assert_eq!(fights(&f).len(), 1, "{:?}", fights(&f));
}

/// A proper-named mob that casts is still a mob: its swing at Malkil engages it, though the ally
/// model files every player-shaped caster as a friendly (Undertow, tonight at 22:10:18).
#[test]
fn a_proper_named_caster_hitting_a_member_is_engaged() {
    let f = fold(&with_group(&[
        "[Mon Nov 23 22:10:10 2026] You punch a shimmering sailfin for 100 points of damage.",
        "[Mon Nov 23 22:10:12 2026] Undertow begins casting Immobilize.",
        "[Mon Nov 23 22:10:13 2026] Undertow hits Malkil for 50 points of damage.",
        "[Mon Nov 23 22:10:14 2026] You punch a shimmering sailfin for 100 points of damage.",
        "[Mon Nov 23 22:10:14 2026] You have slain a shimmering sailfin!",
        "[Mon Nov 23 22:10:17 2026] Undertow hits Malkil for 50 points of damage.",
        "[Mon Nov 23 22:10:21 2026] You bash Undertow for 40 points of damage.",
        "[Mon Nov 23 22:10:28 2026] Undertow has been slain by Malkil!",
    ]));
    assert_eq!(fights(&f).len(), 1, "{:?}", fights(&f));
}

/// A mob that only missed you is in the fight, as one whose swing landed always was.
#[test]
fn a_mob_that_only_missed_you_is_engaged() {
    let f = fold(&[
        "[Mon Nov 23 22:00:00 2026] You punch a stingtooth piranha for 100 points of damage.",
        "[Mon Nov 23 22:00:02 2026] A lancer swordfish tries to slice YOU, but misses!",
        "[Mon Nov 23 22:00:03 2026] You punch a stingtooth piranha for 100 points of damage.",
        "[Mon Nov 23 22:00:03 2026] You have slain a stingtooth piranha!",
        "[Mon Nov 23 22:00:05 2026] A lancer swordfish tries to slice YOU, but YOU dodge!",
        "[Mon Nov 23 22:00:10 2026] You punch a lancer swordfish for 100 points of damage.",
        "[Mon Nov 23 22:00:12 2026] You have slain a lancer swordfish!",
    ]);
    assert_eq!(fights(&f).len(), 1, "{:?}", fights(&f));
}

/// A mob fighting somebody outside your group is not in your pull: the kill ends your fight and
/// the next swing is a new one, as before.
#[test]
fn a_mob_fighting_a_stranger_is_not_engaged() {
    let f = fold(&[
        "[Mon Nov 23 22:00:00 2026] You punch a stingtooth piranha for 100 points of damage.",
        "[Mon Nov 23 22:00:02 2026] A lancer swordfish slices Strangerguy for 20 points of damage.",
        "[Mon Nov 23 22:00:03 2026] You punch a stingtooth piranha for 100 points of damage.",
        "[Mon Nov 23 22:00:03 2026] You have slain a stingtooth piranha!",
        "[Mon Nov 23 22:00:05 2026] A lancer swordfish slices Strangerguy for 20 points of damage.",
        "[Mon Nov 23 22:00:10 2026] You punch a lancer swordfish for 100 points of damage.",
        "[Mon Nov 23 22:00:12 2026] You have slain a lancer swordfish!",
    ]);
    assert_eq!(fights(&f).len(), 2, "{:?}", fights(&f));
}

/// Being swung at engages nothing while no fight is open: it never opens one.
#[test]
fn a_swing_at_the_group_opens_no_fight() {
    let f = fold(&with_group(&[
        "[Mon Nov 23 22:00:02 2026] A lancer swordfish slices Malkil for 20 points of damage.",
        "[Mon Nov 23 22:00:03 2026] A lancer swordfish tries to slice YOU, but misses!",
    ]));
    assert!(fights(&f).is_empty(), "{:?}", fights(&f));
}
