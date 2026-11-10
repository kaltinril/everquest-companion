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
            shared_name: false,
        }],
    }
}

fn watching_a_shared_name() -> RespawnPrefs {
    RespawnPrefs {
        watches: vec![RespawnWatchPref {
            key: "a vis ghoul knight".to_owned(),
            display: "a vis ghoul knight".to_owned(),
            custom_sec: None,
            shared_name: true,
        }],
    }
}

/// Two spawns sharing a name: a kill, the other one 90 s on, then the real cycle twice over.
fn two_spawns_of_one_name(prefs: RespawnPrefs) -> RespawnModule {
    let mut m = RespawnModule::new(NOW, prefs);
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&death(2, T_DEATH + 90_000)), false);
    m.on_event(&ev(&death(3, T_DEATH + 90_000 + 720_000)), false);
    m.on_event(&ev(&death(4, T_DEATH + 90_000 + 720_000 + 660_000)), false);
    m
}

/// Same-named mobs ruin the clock (owner, 2026-11-09: "identical named mobs ... the spawn can't be
/// lower than 10min for these mobs as an exception, and it uses the lowest time above 10 mins"): with
/// the switch on, the 90 s gap is ignored and the lowest of the two real gaps numbers the row.
#[test]
fn a_shared_name_ignores_gaps_under_ten_minutes_and_takes_the_lowest_above() {
    let plain = only_row(&two_spawns_of_one_name(watching_without_a_number()));
    assert_eq!((plain.observed_ms, plain.samples, plain.shared_name), (Some(90_000), 3, false));
    let shared = only_row(&two_spawns_of_one_name(watching_a_shared_name()));
    assert_eq!((shared.observed_ms, shared.estimate_ms, shared.samples), (Some(660_000), Some(660_000), 2));
    assert_eq!((shared.source, shared.shared_name), ("observed", true));
    // The last six gaps still show as they were measured: the switch changes the estimate, not the evidence.
    assert_eq!(shared.gaps_ms, Some(vec![660_000, 720_000, 90_000]));
}

/// With no gap above the floor the row has no observed number at all, never the short one.
#[test]
fn a_shared_name_with_only_short_gaps_has_no_observed_number() {
    let mut m = RespawnModule::new(NOW, watching_a_shared_name());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&death(2, T_DEATH + 90_000)), false);
    let row = only_row(&m);
    assert_eq!((row.observed_ms, row.samples, row.source), (None, 0, "none"));
}

/// The switch rides the pushed prefs as `sharedName`; absent is off.
#[test]
fn the_shared_name_switch_is_read_off_the_pushed_prefs() {
    let prefs = RespawnPrefs::read(&serde_json::json!({ "watches": [
        { "key": "a vis ghoul knight", "display": "a vis ghoul knight", "sharedName": true },
        { "key": "the game master", "customSec": 1200 }
    ] }))
    .expect("an object");
    let flags: Vec<(&str, bool, Option<i64>)> = prefs.watches.iter().map(|w| (w.key.as_str(), w.shared_name, w.custom_sec)).collect();
    assert_eq!(flags, vec![("a vis ghoul knight", true, None), ("the game master", false, Some(1200))]);
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

/// A gap learned in a private instance still times the clock once the next instance of the zone is
/// created (owner, 2026-11-07: the Nektropos Castle nameds respawned in 21-24 minutes in the Nov 5
/// instance; two days on, in a fresh instance, every clock ran from the open world's hour-long gap
/// alone, "your kills (1 gap)"). Closing an instance drops its clocks, never what it taught.
#[test]
fn a_gap_learned_in_a_closed_private_instance_still_times_the_next_one() {
    let mut m = RespawnModule::new(NOW, watching_without_a_number());
    // The open +4: a kill, and an hour on, another. A one-hour bound.
    m.on_event(&ev(&zone_named(T_ZONE, "Nektropos Castle 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&death(2, T_DEATH + 3_600_000)), false);
    // A private +4 instance: a kill, and the respawn killed 22 minutes on.
    let t_inst = T_DEATH + 3_700_000;
    m.on_event(&ev(&instance_created(t_inst - 1_000, "Nektropos Castle", 709)), false);
    m.on_event(&ev(&zone_named(t_inst, "Nektropos Castle 4 (Refined)")), false);
    m.on_event(&ev(&death(3, t_inst + 60_000)), false);
    m.on_event(&ev(&death(4, t_inst + 60_000 + 1_320_000)), false);
    // Two days on, the zone's next private instance (a +0: a bare zone line), and a kill in it.
    let t_next = t_inst + 2 * 86_400_000;
    m.on_event(&ev(&instance_created(t_next - 1_000, "Nektropos Castle", 1156)), false);
    m.on_event(&ev(&zone_named(t_next, "Nektropos Castle")), false);
    m.on_event(&ev(&death(5, t_next + 60_000)), false);
    let rows = m.watch_rows(t_next + 120_000);
    let here = rows
        .iter()
        .find(|r| r.zone == "Nektropos Castle [instance 1156]")
        .expect("the new instance's own row");
    assert_eq!(here.samples, 2, "the open world's gap and the closed instance's: {rows:?}");
    assert_eq!(here.observed_ms, Some(1_320_000), "the 22-minute gap, not the hour");
    assert_eq!(here.estimate_ms, Some(1_320_000));
    assert_eq!(here.base_ts, t_next + 60_000, "its own clock base");
}

/// Gaps learned in the open zone and in a private instance of it are one series for the wiki number
/// (owner, 2026-11-05: Nektropos Castle 4's nameds showed one gap per place and never reached three).
#[test]
fn gaps_learned_in_a_private_instance_and_in_the_open_zone_file_under_one_zone() {
    let mut m = RespawnModule::new(NOW, RespawnPrefs::default());
    m.on_event(&ev(&zone_named(T_ZONE, "Nektropos Castle 4 (Refined)")), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&death(2, T_SECOND_DEATH)), false);
    m.on_event(&ev(&instance_created(T_SECOND_DEATH + 1_000, "Nektropos Castle", 709)), false);
    m.on_event(&ev(&zone_named(T_SECOND_DEATH + 2_000, "Nektropos Castle 4 (Refined)")), false);
    m.on_event(&ev(&death(3, T_SECOND_DEATH + 60_000)), false);
    m.on_event(&ev(&death(4, T_SECOND_DEATH + 60_000 + 700_000)), false);
    assert_eq!(m.snapshot()["state"]["zone"], "Nektropos Castle 4 (Refined) [instance 709]");
    let learned = learned_of(&m);
    assert_eq!(learned.len(), 1, "one entry for the zone, whatever the place: {learned:?}");
    assert_eq!(learned[0]["zone"], "Nektropos Castle 4 (Refined)");
    assert_eq!(learned[0]["id"], "nektropos castle 4 (refined)::a vis ghoul knight");
    assert_eq!(learned[0]["gapsMs"].as_array().map(Vec::len), Some(2));
}

