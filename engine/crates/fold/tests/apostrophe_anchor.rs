//! A cast line and the DB may spell one apostrophe with different marks. The anchor join folds
//! them; the instance key does not.

use fold::event::Event;
use fold::{registered, ClusterDeps, Fold};
use serde_json::Value;

fn active_after(lines: &[&str]) -> Value {
    let mut fold = Fold::new(registered(ClusterDeps::default()), 1000);
    for line in lines {
        fold.on_primary(&Event::from_json(line).expect("a JSON object"), false);
    }
    let snaps = fold.registry.snapshots();
    snaps["modules"]
        .as_array()
        .expect("modules")
        .iter()
        .find(|m| m["id"] == "buffs")
        .expect("the buffs module")["snapshot"]["state"]["active"]
        .clone()
}

#[test]
fn a_backtick_cast_line_anchors_the_straight_apostrophe_db_candidate() {
    let active = active_after(&[
        r#"{"kind":"castBegin","seq":0,"ts":1000,"raw":"c","spell":"Jaxan's Jig o` Vigor"}"#,
        r#"{"kind":"buffApply","seq":1,"ts":4000,"raw":"a","target":"self","spell":"Jaxan's Jig o' Vigor","illusion":false,"durationMs":18000,"candidates":[{"name":"Jaxan's Jig o' Vigor","durationMs":18000,"illusion":false}]}"#,
    ]);
    assert_eq!(active.as_array().map(Vec::len), Some(1), "{active}");
    assert_eq!(active[0]["spell"], "Jaxan's Jig o' Vigor", "{active}");
    assert_eq!(active[0]["self"], true, "{active}");
    assert_eq!(active[0]["startedTs"], 4000, "{active}");
}

#[test]
fn without_a_cast_line_the_same_landing_still_opens_nothing() {
    let active = active_after(&[
        r#"{"kind":"buffApply","seq":1,"ts":4000,"raw":"a","target":"self","spell":"Jaxan's Jig o' Vigor","illusion":false,"durationMs":18000,"candidates":[{"name":"Jaxan's Jig o' Vigor","durationMs":18000,"illusion":false}]}"#,
    ]);
    assert_eq!(active.as_array().map(Vec::len), Some(0), "{active}");
}
