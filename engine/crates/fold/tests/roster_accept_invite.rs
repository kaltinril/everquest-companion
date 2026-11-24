//! Joining somebody else's group admits the player whose invite you accepted (2026-11-23).
//!
//! The game names nobody when you join another player's group: `Malkil invites you to join a
//! group.`, `You notify Malkil that you agree to join the group.`, `You have joined the group.`, and
//! no `<Name> has joined the group.` line for anyone already in it. Before, nobody was admitted, so
//! a whole evening with Malkil read his damage as a stranger's: it opened no fight and kept none
//! open, the Group scope hid him, and multi-mob pulls split into one-mob fights as he killed them.

use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::{registered, ClusterDeps, Fold};
use serde_json::Value;

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

/// The published roster: (name, source) per member, in join order.
fn members(f: &Fold) -> Vec<(String, String)> {
    let snap = f.registry.snapshot_of("roster").expect("the roster module");
    snap["state"]["members"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            (
                m["name"].as_str().unwrap_or_default().to_string(),
                m["source"].as_str().unwrap_or_default().to_string(),
            )
        })
        .collect()
}

const INVITE: &str = "[Mon Nov 23 21:50:04 2026] Malkil invites you to join a group.";
const ACCEPT: &str =
    "[Mon Nov 23 21:50:08 2026] You notify Malkil that you agree to join the group.";
const JOINED: &str = "[Mon Nov 23 21:50:08 2026] You have joined the group.";

/// Tonight's three lines admit Malkil at the `joined` rung.
#[test]
fn accepting_an_invite_and_joining_admits_the_inviter() {
    let f = fold(&[INVITE, ACCEPT, JOINED]);
    assert_eq!(members(&f), vec![("Malkil".into(), "joined".into())]);
}

/// An invite nobody answered admits nobody, and nor does an acceptance the game never followed
/// with a join.
#[test]
fn an_invite_or_acceptance_without_a_join_admits_nobody() {
    assert!(members(&fold(&[INVITE])).is_empty());
    assert!(members(&fold(&[INVITE, ACCEPT])).is_empty());
    // A join long after the acceptance answers something else.
    let late = "[Mon Nov 23 21:52:08 2026] You have joined the group.";
    assert!(members(&fold(&[INVITE, ACCEPT, late])).is_empty());
}

/// Two invites, the second one accepted: the player you joined is admitted, not the first inviter.
#[test]
fn the_accepted_invite_names_the_member_not_an_earlier_one() {
    let f = fold(&[
        "[Mon Nov 23 21:40:00 2026] Revilus invites you to join a group.",
        INVITE,
        ACCEPT,
        JOINED,
    ]);
    assert_eq!(members(&f), vec![("Malkil".into(), "joined".into())]);
}

/// Your own invite is still not membership: `You have joined the group.` follows it when you form
/// the group, and only the `<Name> has joined the group.` line that answers it admits anybody.
#[test]
fn your_own_invite_followed_by_forming_the_group_admits_only_who_joined() {
    let f = fold(&[
        "[Sun Nov 15 19:38:50 2026] You invite revilus to join your group.",
        "[Sun Nov 15 19:38:53 2026] You invite malkil to join your group.",
        "[Sun Nov 15 19:38:56 2026] You have joined the group.",
        "[Sun Nov 15 19:38:56 2026] Malkil has joined the group.",
    ]);
    assert_eq!(members(&f), vec![("Malkil".into(), "joined".into())]);
}

fn fight_ids(f: &Fold) -> Vec<String> {
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
        .map(|s| s["id"].as_str().unwrap_or_default().to_string())
        .collect()
}

fn selected_rows(f: &Fold, id: &str) -> Vec<(String, String, i64)> {
    let opts = SnapshotOpts {
        selected_id: Some(id.to_string()),
        ..SnapshotOpts::full()
    };
    let snap = f
        .combat
        .as_ref()
        .expect("the engine")
        .snapshot(0, &opts, f.registry.roster());
    let rows: Vec<Value> = snap["selected"]["entities"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    rows.iter()
        .map(|r| {
            (
                r["name"].as_str().unwrap_or_default().to_string(),
                r["kind"].as_str().unwrap_or_default().to_string(),
                r["total"].as_i64().unwrap_or_default(),
            )
        })
        .collect()
}

/// Tonight's pull at 22:13:41 (Kedge Keep): Malkil kills three lancer swordfish while you hit two
/// of them, with up to 8 s between your hits. As a member his shots open the fight and keep it
/// open, so it is one fight holding all his damage. Before, his damage counted only inside a
/// fight you had opened, and the pull read as three fights of one swordfish each.
#[test]
fn a_members_kills_keep_one_pull_one_fight() {
    let f = fold(&[
        INVITE,
        ACCEPT,
        JOINED,
        "[Mon Nov 23 22:13:38 2026] Malkil shoots a lancer swordfish for 600 points of damage.",
        "[Mon Nov 23 22:13:41 2026] Malkil shoots a lancer swordfish for 700 points of damage.",
        "[Mon Nov 23 22:13:41 2026] A lancer swordfish has been slain by Malkil!",
        "[Mon Nov 23 22:13:43 2026] Malkil shoots a lancer swordfish for 650 points of damage.",
        "[Mon Nov 23 22:13:45 2026] You punch a lancer swordfish for 90 points of damage.",
        "[Mon Nov 23 22:13:46 2026] Malkil shoots a lancer swordfish for 640 points of damage.",
        "[Mon Nov 23 22:13:46 2026] A lancer swordfish has been slain by Malkil!",
        "[Mon Nov 23 22:13:49 2026] Malkil shoots a lancer swordfish for 610 points of damage.",
        "[Mon Nov 23 22:13:52 2026] Malkil shoots a lancer swordfish for 620 points of damage.",
        "[Mon Nov 23 22:13:54 2026] You punch a lancer swordfish for 80 points of damage.",
        "[Mon Nov 23 22:13:55 2026] A lancer swordfish has been slain by Malkil!",
    ]);
    assert_eq!(fight_ids(&f), vec!["e1".to_string()], "one fight");
    let rows = selected_rows(&f, "e1");
    let malkil = rows.iter().find(|r| r.0 == "Malkil").expect("Malkil's row");
    assert_eq!(malkil.1, "member");
    assert_eq!(malkil.2, 600 + 700 + 650 + 640 + 610 + 620);
}
