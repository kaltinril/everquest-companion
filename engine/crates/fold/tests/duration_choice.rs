//! A saved duration choice (fork issue #4) and the rows that are already running.
//!
//! The choice arrives in `buffTrust.define` with no log line behind it. The Durations table reads
//! the estimator on every snapshot, but an active row carries the numbers it was projected with,
//! so the define has to re-project the live rows or the two surfaces state different lengths for
//! one spell until the next cast.

use fold::event::Event;
use fold::spell_facts::SpellFacts;
use fold::{registered, ClusterDeps, Fold};
use serde_json::{json, Value};

const MOB: &str = "a gnoll";

/// Folded over the committed catalog: with no spell database a row has no length to change.
fn fold_of(lines: &[&str]) -> Fold {
    let deps = ClusterDeps {
        facts: SpellFacts::project(&eqlog::spelldb::shared()),
        ..ClusterDeps::default()
    };
    let mut fold = Fold::new(registered(deps), i64::MAX);
    feed(&mut fold, lines);
    fold
}

fn feed(fold: &mut Fold, lines: &[&str]) {
    for line in lines {
        fold.on_primary(&Event::from_json(line).expect("a JSON object"), false);
    }
}

fn choose(fold: &mut Fold, durations: Value) {
    let payload = json!({ "externals": [], "durations": durations });
    assert!(
        fold.registry.define("buffTrust", &payload),
        "buffs answers to buffTrust"
    );
}

fn active(fold: &Fold) -> Value {
    let snaps = fold.registry.snapshots();
    snaps["modules"]
        .as_array()
        .expect("modules")
        .iter()
        .find(|m| m["id"] == "buffs")
        .expect("the buffs module")["snapshot"]["state"]["active"]
        .clone()
}

/// The four fields a row's bar, chip and countdown are drawn from.
fn length_of(row: &Value) -> Value {
    json!([
        row["estimatedMs"],
        row["durationSource"],
        row["overlayDurationMs"],
        row["overlaySource"]
    ])
}

/// A self buff of yours is up. Saving "Set it myself" moves its bar at once, and going back to
/// Automatic puts the first numbers back.
#[test]
fn a_saved_choice_moves_the_bar_of_a_buff_already_running() {
    let mut fold = fold_of(&[
        r#"{"kind":"castBegin","seq":0,"ts":1000,"raw":"c","spell":"Swift Like the Wind"}"#,
        r#"{"kind":"buffApply","seq":1,"ts":2000,"raw":"a","target":"self","spell":"Swift Like the Wind","illusion":false,"durationMs":60000,"candidates":[{"name":"Swift Like the Wind","durationMs":60000,"illusion":false}]}"#,
    ]);
    let before = length_of(&active(&fold)[0]);
    // Whatever the wiki states for it: the number is data, the source is the claim.
    assert!(before[0].is_i64(), "{before}");
    assert_eq!(before[1], "db", "{before}");
    assert_eq!(before[3], "db", "{before}");

    choose(
        &mut fold,
        json!({ "swift like the wind": { "mode": "fixed", "ms": 30000 } }),
    );
    let rows = active(&fold);
    assert_eq!(
        length_of(&rows[0]),
        json!([30_000, "manual", 30_000, "manual"]),
        "{rows}"
    );
    // The row is the same landing: only what it counts down from moved.
    assert_eq!(rows[0]["startedTs"], 2000, "{rows}");

    choose(&mut fold, json!({}));
    let rows = active(&fold);
    assert_eq!(length_of(&rows[0]), before, "{rows}");
}

/// A debuff on a mob whose wear-off never prints is culled on the length the player chose, not on
/// the one the row was first projected with: 8 s plus the 60 s grace, where the wiki's longer
/// number would have kept it.
#[test]
fn a_saved_choice_decides_when_an_unwitnessed_debuff_row_goes() {
    let landing = format!(
        r#"{{"kind":"buffApply","seq":1,"ts":2000,"raw":"a","target":"{MOB}","spell":"Shiftless Deeds","illusion":false,"durationMs":150000,"candidates":[{{"name":"Shiftless Deeds","durationMs":150000,"illusion":false}}]}}"#
    );
    let later = r#"{"kind":"loot","seq":2,"ts":72000,"raw":"l","item":"Bone Chips"}"#;
    let cast = r#"{"kind":"castBegin","seq":0,"ts":1000,"raw":"c","spell":"Shiftless Deeds"}"#;

    // With no choice the row is still inside the wiki length plus its grace 70 s in.
    let mut plain = fold_of(&[cast, &landing]);
    let wiki_ms = active(&plain)[0]["overlayDurationMs"].as_i64();
    assert!(wiki_ms.is_some_and(|ms| ms > 10_000), "{wiki_ms:?}");
    feed(&mut plain, &[later]);
    assert_eq!(active(&plain).as_array().map(Vec::len), Some(1));

    let mut chosen = fold_of(&[cast, &landing]);
    choose(
        &mut chosen,
        json!({ "shiftless deeds": { "mode": "fixed", "ms": 8000 } }),
    );
    feed(&mut chosen, &[later]);
    assert_eq!(active(&chosen), json!([]));
}

/// A mez already running moves to a saved choice at once, as a buff row does, and comes back with
/// Automatic. A define that changes nothing announces nothing.
#[test]
fn a_saved_choice_moves_a_crowd_control_hold_already_running() {
    let mut fold = fold_of(&[
        r#"{"kind":"castBegin","seq":0,"ts":1000,"raw":"c","spell":"Mesmerization"}"#,
        r#"{"kind":"cc","seq":1,"ts":2000,"raw":"m","mob":"a spiroc banisher","verb":"mesmerized","candidates":[{"name":"Mesmerization","durationMs":24000}]}"#,
    ]);
    let hold = |fold: &Fold| {
        let timers = fold.registry.buff_timers().expect("the hold module");
        let held = timers.holds();
        assert_eq!(held.len(), 1, "one hold");
        (held[0].duration_ms, timers.revision())
    };
    let (before, rev) = hold(&fold);
    assert!(before.is_some_and(|ms| ms != 12_000), "{before:?}");

    let chosen = json!({ "mesmerization": { "mode": "fixed", "ms": 12000 } });
    choose(&mut fold, chosen.clone());
    let (moved, moved_rev) = hold(&fold);
    assert_eq!(moved, Some(12_000));
    assert!(moved_rev > rev, "the change is announced");

    choose(&mut fold, chosen);
    assert_eq!(hold(&fold), (Some(12_000), moved_rev), "the same choice again moves nothing");

    choose(&mut fold, json!({}));
    assert_eq!(hold(&fold).0, before);
}
