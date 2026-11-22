//! The zone-overall headline: whose time the whole stay's damage divides by. The total counts every
//! row the stay recorded, so the time must cover those rows too. It used to be your fights alone: a
//! stranger's minute of damage while you stood idle was divided by your ten seconds (bug hunt,
//! 2026-11-19). Every row stays; only the headline's divisor moves.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

fn fold(lines: &[&str]) -> CombatEngine {
    let parser = Parser::new(Clock::new(Tz::America__Los_Angeles), None, None);
    let mut engine = CombatEngine::new();
    engine.set_player_name("Primitive");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, None);
    }
    engine
}

fn selected(e: &CombatEngine, id: &str) -> Value {
    let opts = SnapshotOpts {
        selected_id: Some(id.to_string()),
        ..SnapshotOpts::full()
    };
    e.snapshot(0, &opts, None)["selected"].clone()
}

fn zone_row(e: &CombatEngine) -> Value {
    let snap = e.snapshot(0, &SnapshotOpts::full(), None);
    let rows = snap["segments"].as_array().expect("segments");
    rows.iter()
        .find(|s| s["id"] == "zone")
        .expect("zone row")
        .clone()
}

fn close(a: &Value, want: f64) {
    let got = a.as_f64().expect("a number");
    assert!((got - want).abs() < 0.001, "got {got}, want {want}");
}

const ENTER: &str = "[Tue Nov 17 12:00:00 2026] You have entered The Plane of Hate.";
const MINE_1: &str = "[Tue Nov 17 12:00:10 2026] You slash a gnoll for 1000 points of damage.";
const MINE_2: &str = "[Tue Nov 17 12:00:20 2026] You slash a gnoll for 1000 points of damage.";
const THEIRS_1: &str =
    "[Tue Nov 17 12:02:00 2026] Scooba slashes a gnoll for 3000 points of damage.";
const THEIRS_2: &str =
    "[Tue Nov 17 12:02:30 2026] Scooba slashes a gnoll for 3000 points of damage.";
const THEIRS_3: &str =
    "[Tue Nov 17 12:03:00 2026] Scooba slashes a gnoll for 3000 points of damage.";
const LEAVE: &str = "[Tue Nov 17 12:04:00 2026] You have entered The Feerrott.";

/// 11,000 damage: your 2,000 over your 10 seconds, and a stranger's 9,000 over a minute you did not
/// fight in. The headline covers both stretches: 70 seconds, never your 10.
#[test]
fn the_stay_headline_counts_the_time_only_others_were_fighting() {
    let e = fold(&[ENTER, MINE_1, MINE_2, THEIRS_1, THEIRS_2, THEIRS_3]);
    let row = zone_row(&e);
    assert_eq!(row["total"], 11_000);
    close(&row["dps"], 11_000.0 / 70.0);
    let view = selected(&e, "zone");
    close(&view["outDps"], 11_000.0 / 70.0);
    // The stay's own length is still your fights: procs per minute and the like read it.
    close(&view["durationSec"], 10.0);
}

/// Every row stays, each on its own clock.
#[test]
fn every_row_keeps_its_place_and_its_own_rate() {
    let e = fold(&[ENTER, MINE_1, MINE_2, THEIRS_1, THEIRS_2, THEIRS_3]);
    let view = selected(&e, "zone");
    let rows = view["entities"].as_array().expect("rows");
    assert_eq!(rows.len(), 2);
    let you = rows.iter().find(|r| r["kind"] == "you").expect("your row");
    close(&you["dps"], 200.0);
    let them = rows
        .iter()
        .find(|r| r["name"] == "Scooba")
        .expect("their row");
    close(&them["dps"], 150.0);
}

/// A finished stay reads the same in the picker and when it is opened.
#[test]
fn a_finished_stay_keeps_the_same_headline() {
    let e = fold(&[ENTER, MINE_1, MINE_2, THEIRS_1, THEIRS_2, THEIRS_3, LEAVE]);
    let snap = e.snapshot(0, &SnapshotOpts::full(), None);
    let kept = snap["zoneSessions"].as_array().expect("zoneSessions");
    let stay = kept
        .iter()
        .find(|z| z["live"] == false)
        .expect("finished stay");
    close(&stay["dps"], 11_000.0 / 70.0);
    let id = stay["id"].as_str().expect("id");
    close(&selected(&e, id)["outDps"], 11_000.0 / 70.0);
}

/// A stranger inside your fight is already covered by the fight's time: nothing is added.
#[test]
fn a_stranger_inside_your_fight_adds_no_time() {
    let inside = "[Tue Nov 17 12:00:15 2026] Scooba slashes a gnoll for 3000 points of damage.";
    let e = fold(&[ENTER, MINE_1, inside, MINE_2]);
    close(&zone_row(&e)["dps"], 5_000.0 / 10.0);
}

/// With no damage outside your fights the headline is what it always was.
#[test]
fn a_stay_of_your_fights_alone_is_unchanged() {
    let e = fold(&[ENTER, MINE_1, MINE_2]);
    let row = zone_row(&e);
    close(&row["dps"], 200.0);
    close(
        &row["activeDps"],
        2_000.0 / row["activeSec"].as_f64().expect("activeSec").max(1.0),
    );
}

/// A fight between two of a stranger's swings is counted once: the span breaks at the fight.
#[test]
fn a_fight_between_two_strangers_swings_is_not_counted_twice() {
    let before = "[Tue Nov 17 12:00:05 2026] Scooba slashes a gnoll for 3000 points of damage.";
    let slain = "[Tue Nov 17 12:00:20 2026] You have slain a gnoll!";
    // 35 s after the first swing, inside the 60 s a bystander's span would otherwise run on for.
    let after = "[Tue Nov 17 12:00:40 2026] Scooba slashes a gnoll for 3000 points of damage.";
    let e = fold(&[ENTER, before, MINE_1, MINE_2, slain, after]);
    // 1 s floor for the lone swing before, the 10 s fight, 1 s floor for the lone swing after.
    close(&zone_row(&e)["dps"], 8_000.0 / 12.0);
}

/// Time you only took hits or were healed is not time anyone dealt the stay's damage.
#[test]
fn being_hit_or_healed_outside_a_fight_adds_no_time() {
    let hit = "[Tue Nov 17 12:02:00 2026] A gnoll hits YOU for 10 points of damage.";
    let healed = "[Tue Nov 17 12:02:30 2026] Scooba healed you for 50 hit points by Light Healing.";
    let e = fold(&[ENTER, MINE_1, MINE_2, hit, healed]);
    close(&zone_row(&e)["dps"], 200.0);
}

/// Your opening miss comes just before the fight it starts: no second of the headline is added.
#[test]
fn an_opening_miss_of_yours_adds_no_time() {
    let miss = "[Tue Nov 17 12:00:08 2026] You try to slash a gnoll, but miss!";
    let e = fold(&[ENTER, miss, MINE_1, MINE_2]);
    close(&zone_row(&e)["dps"], 200.0);
}

/// A stay where only strangers fought divides by their time, not by a one second floor.
#[test]
fn a_stay_of_only_strangers_reads_over_their_time() {
    let e = fold(&[ENTER, THEIRS_1, THEIRS_2, THEIRS_3]);
    close(&zone_row(&e)["dps"], 9_000.0 / 60.0);
}
