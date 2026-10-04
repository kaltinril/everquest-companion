//! The launch epoch is delivered BEFORE the line that trips it.
//!
//! The epoch wipes a pre-launch character. The line that trips it is the first line of the new
//! character, so it is folded after the wipe and keeps what it says. Delivered after, the wipe
//! erased that line's kill, loot or level: harmless in a log that began before launch day (the line
//! was a login line), but a log that begins after it lost its first real line on every cold read.

use fold::event::Event;
use fold::{registered, ClusterDeps, Fold};
use serde_json::Value;

const LAUNCH: i64 = 1_000;

fn fold(lines: &[&str]) -> Value {
    let mut f = Fold::new(registered(ClusterDeps::default()), LAUNCH);
    for line in lines {
        f.on_primary(&Event::from_json(line).expect("an event"), false);
    }
    let snaps = f.registry.snapshots();
    snaps["modules"]
        .as_array()
        .expect("modules")
        .iter()
        .find(|m| m["id"] == "kills")
        .expect("the kills module")["snapshot"]["state"]["mobs"]
        .clone()
}

#[test]
fn a_log_that_begins_after_launch_keeps_its_first_line() {
    let mobs = fold(&[
        r#"{"kind":"death","seq":0,"ts":5000,"raw":"d","name":"a first rat","bySelf":true}"#,
        r#"{"kind":"death","seq":1,"ts":6000,"raw":"d","name":"a second rat","bySelf":true}"#,
    ]);
    assert_eq!(mobs["a first rat"]["count"], 1, "{mobs}");
    assert_eq!(mobs["a second rat"]["count"], 1, "{mobs}");
}

#[test]
fn the_pre_launch_character_is_still_wiped_and_the_boundary_line_is_kept() {
    let mobs = fold(&[
        r#"{"kind":"death","seq":0,"ts":500,"raw":"d","name":"a beta rat","bySelf":true}"#,
        r#"{"kind":"death","seq":1,"ts":1000,"raw":"d","name":"a launch rat","bySelf":true}"#,
        r#"{"kind":"death","seq":2,"ts":2000,"raw":"d","name":"a later rat","bySelf":true}"#,
    ]);
    assert!(mobs.get("a beta rat").is_none(), "the beta character is wiped: {mobs}");
    assert_eq!(mobs["a launch rat"]["count"], 1, "{mobs}");
    assert_eq!(mobs["a later rat"]["count"], 1, "{mobs}");
}
