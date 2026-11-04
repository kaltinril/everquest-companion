//! `respawn.rs` across the PLACES of a zone (owner, 2026-11-03): a pickzone tier and a private
//! instance each keep their own clock; the estimate is pooled across them; creating the next
//! private instance closes the last. A child of `respawn_tests.rs` for its helpers and constants.

use super::*;

fn zone_named(ts: i64, name: &str) -> String {
    format!(r#"{{"kind":"zone","seq":0,"ts":{ts},"raw":"z","zone":"{name}"}}"#)
}

/// Each instance tier keeps its own clock, kept across a visit elsewhere (owner, 2026-11-03:
/// "Timers should be retained across instances but be ISOLATED to that instance"): a kill in the
/// +4, out to the +3 and a kill there, back to the +4 — two rows, the +4's still counting.
#[test]
fn each_instance_tier_keeps_its_own_clock_across_a_visit_elsewhere() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone_named(T_ZONE, "The Ruins of Old Guk 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&zone_named(T_DEATH + 60_000, "The Ruins of Old Guk 3 (Fused)")), false);
    m.on_event(&ev(&death(2, T_DEATH + 90_000)), false);
    m.on_event(&ev(&zone_named(T_DEATH + 120_000, "The Ruins of Old Guk 4 (Refined)")), false);
    let mut rows = m.watch_rows(NOW);
    rows.sort_by(|a, b| a.zone.cmp(&b.zone));
    let got: Vec<(&str, i64, i64)> = rows.iter().map(|r| (r.zone.as_str(), r.base_ts, r.kills)).collect();
    assert_eq!(
        got,
        vec![
            ("The Ruins of Old Guk 3 (Fused)", T_DEATH + 90_000, 1),
            ("The Ruins of Old Guk 4 (Refined)", T_DEATH, 1),
        ]
    );
}

/// The open world is one place: zoning out and back keeps the clock.
#[test]
fn re_entering_the_open_world_keeps_the_clock() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&zone(T_DEATH + 60_000)), false);
    assert_eq!(m.watch_rows(NOW).len(), 1);
}

fn instance_created(ts: i64, zone: &str, id: i64) -> String {
    format!(r#"{{"kind":"instanceCreate","seq":0,"ts":{ts},"raw":"i","player":"Drywrought","zone":"{zone}","instance":{id}}}"#)
}

/// A private instance prints the open world's zone line; the creation notice before it keeps the
/// clocks apart (owner, 2026-11-03: "i'm in an INSTANCE +4 and the timer is showing the time from
/// the previous kill in the +4 OPEN WORLD").
#[test]
fn a_private_instance_never_shows_the_open_worlds_clock() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone_named(T_ZONE, "Lake Nerius 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&instance_created(T_DEATH + 50_000, "Lake Nerius", 17)), false);
    m.on_event(&ev(&zone_named(T_DEATH + 60_000, "Lake Nerius 4 (Refined)")), false);
    let snap = m.snapshot();
    assert_eq!(snap["state"]["zone"], "Lake Nerius 4 (Refined) [instance 17]");
    let rows = m.watch_rows(NOW);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].zone, "Lake Nerius 4 (Refined)", "the open world's clock stays the open world's");
    // A kill in the instance is the instance's own clock.
    m.on_event(&ev(&death(2, T_SECOND_DEATH)), false);
    let mut zones: Vec<String> = m.watch_rows(NOW).into_iter().map(|r| r.zone).collect();
    zones.sort();
    assert_eq!(zones, vec!["Lake Nerius 4 (Refined)", "Lake Nerius 4 (Refined) [instance 17]"]);
    // Back out to the open world: no notice, so it is the open world again.
    m.on_event(&ev(&zone_named(T_SECOND_DEATH + 60_000, "Lake Nerius 4 (Refined)")), false);
    assert_eq!(m.snapshot()["state"]["zone"], "Lake Nerius 4 (Refined)");
}

/// A notice for another zone does not tag the zone you walk into.
#[test]
fn an_instance_notice_for_another_zone_tags_nothing() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&instance_created(T_ZONE, "The Plane of Fear", 572)), false);
    m.on_event(&ev(&zone_named(T_ZONE + 10_000, "Lake Nerius 4 (Refined)")), false);
    assert_eq!(m.snapshot()["state"]["zone"], "Lake Nerius 4 (Refined)");
}

fn watching_without_a_number() -> RespawnPrefs {
    RespawnPrefs {
        watches: vec![RespawnWatchPref {
            key: "a vis ghoul knight".to_owned(),
            display: "a vis ghoul knight".to_owned(),
            custom_sec: None,
        }],
    }
}

/// A gap learned in one place of the zone times the mob's clock in another (owner, 2026-11-03:
/// "the amount of time it takes to spawn isn't different between instances").
#[test]
fn a_gap_learned_in_one_place_times_the_clock_in_another() {
    let mut m = RespawnModule::new(NOW, watching_without_a_number());
    m.on_event(&ev(&zone_named(T_ZONE, "The Ruins of Old Guk 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&death(2, T_SECOND_DEATH)), false);
    m.on_event(&ev(&zone_named(T_SECOND_DEATH + 60_000, "The Ruins of Old Guk 3 (Fused)")), false);
    m.on_event(&ev(&death(3, T_SECOND_DEATH + 120_000)), false);
    let rows = m.watch_rows(NOW);
    let fused = rows.iter().find(|r| r.zone.ends_with("(Fused)")).expect("a +3 row");
    assert_eq!(fused.samples, 1);
    assert_eq!(fused.observed_ms, Some(T_SECOND_DEATH - T_DEATH));
    assert_eq!(fused.estimate_ms, Some(T_SECOND_DEATH - T_DEATH));
    assert_eq!(fused.base_ts, T_SECOND_DEATH + 120_000, "its own clock base");
}

/// You hold one private instance of a zone at a time: creating the next closes the last, and its
/// clocks go with it (owner, 2026-11-03).
#[test]
fn creating_the_next_private_instance_drops_the_last_ones_clocks() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&instance_created(T_ZONE - 1_000, "Lake Nerius", 17)), false);
    m.on_event(&ev(&zone_named(T_ZONE, "Lake Nerius 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    assert_eq!(m.watch_rows(NOW).len(), 1);
    m.on_event(&ev(&instance_created(T_DEATH + 1_000, "Lake Nerius", 18)), false);
    assert!(m.watch_rows(NOW).is_empty(), "instance 17 is closed, its clock with it");
    m.on_event(&ev(&zone_named(T_DEATH + 2_000, "Lake Nerius 4 (Refined)")), false);
    assert_eq!(m.snapshot()["state"]["zone"], "Lake Nerius 4 (Refined) [instance 18]");
}

/// Another zone's notice closes nothing here.
#[test]
fn another_zones_instance_notice_keeps_this_zones_private_clock() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&instance_created(T_ZONE - 1_000, "Lake Nerius", 17)), false);
    m.on_event(&ev(&zone_named(T_ZONE, "Lake Nerius 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&instance_created(T_DEATH + 1_000, "The Plane of Fear", 572)), false);
    assert_eq!(m.watch_rows(NOW).len(), 1);
}
