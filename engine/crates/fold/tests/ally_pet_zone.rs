//! A group mate's summoned pet that named its leader keeps its row through a zone line, whether or
//! not its summon cast was seen. With no summon on record the bind was classed a charm, and a charm
//! ends at a zone line: the pet's damage was then credited to nobody for the rest of the session,
//! with nothing said (bug hunt, 2026-11-19). A bind a leader line made, for a pet named the way
//! summoned pets are and never named by a charm broadcast, now crosses the zone line. It keeps the
//! charm's other endings. Every bind that does end at a zone line is said in the reading log.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

/// Folded as the live tail does, so the reading log is kept.
fn fold(lines: &[&str]) -> Value {
    let parser = Parser::new(
        Clock::new(Tz::get("America/Los_Angeles").unwrap()),
        None,
        Some("Primitive".to_string()),
    );
    let mut engine = CombatEngine::new();
    engine.set_player_name("Primitive");
    let mut now = 0;
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        now = ev.ts();
        engine.on_event(&ev, true, None);
    }
    let opts = SnapshotOpts {
        selected_id: Some("zone".to_string()),
        ..SnapshotOpts::full()
    };
    engine.snapshot(now, &opts, None)
}

/// (kind, name, total) of every damage row in the stay you are in.
fn rows(snap: &Value) -> Vec<(String, String, i64)> {
    let entities = snap["selected"]["entities"].as_array().expect("entities");
    let cell = |r: &Value, k: &str| r[k].as_str().unwrap().to_string();
    (entities.iter())
        .map(|r| {
            (
                cell(r, "kind"),
                cell(r, "name"),
                r["total"].as_i64().unwrap(),
            )
        })
        .collect()
}

/// The reading log's lines, oldest first.
fn said(snap: &Value) -> Vec<String> {
    let recent = snap["recent"].as_array().expect("recent");
    (recent.iter())
        .map(|r| r["text"].as_str().unwrap().to_string())
        .collect()
}

const ENTER: &str = "[Tue Nov 17 12:00:00 2026] You have entered The Plane of Hate.";
const NEXT_ZONE: &str = "[Tue Nov 17 12:01:00 2026] You have entered The Feerrott.";
const MINE: &str = "[Tue Nov 17 12:01:04 2026] You slash an orc for 50 points of damage.";

#[test]
fn a_group_mates_pet_keeps_its_row_through_a_zone_line() {
    let snap = fold(&[
        ENTER,
        "[Tue Nov 17 12:00:05 2026] Jeber bites a gnoll for 100 points of damage.",
        "[Tue Nov 17 12:00:06 2026] Jeber says, 'My leader is Malkil.'",
        NEXT_ZONE,
        MINE,
        "[Tue Nov 17 12:01:05 2026] Jeber bites an orc for 200 points of damage.",
    ]);
    let rows = rows(&snap);
    let pet = (
        "allyPet".to_string(),
        "Pet (Jeber) - Malkil".to_string(),
        200,
    );
    assert!(rows.contains(&pet), "{rows:?}");
}

/// A pet a charm broadcast named is a charmed mob: its bind ends at the zone line, and says so.
#[test]
fn a_charmed_pet_still_ends_at_the_zone_line_and_the_log_says_so() {
    let snap = fold(&[
        ENTER,
        "[Tue Nov 17 12:00:04 2026] Jeber has been charmed.",
        "[Tue Nov 17 12:00:06 2026] Jeber says, 'My leader is Malkil.'",
        NEXT_ZONE,
        MINE,
        "[Tue Nov 17 12:01:05 2026] Jeber bites an orc for 200 points of damage.",
    ]);
    let rows = rows(&snap);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
    let said = said(&snap);
    let line = "✕ Jeber - Malkil's charm ended at the zone line";
    assert!(said.iter().any(|s| s == line), "{said:?}");
}

/// A mob's name is no summoned pet's name: a charmed mob that named its leader ends there too.
#[test]
fn a_charmed_mob_that_named_its_leader_still_ends_at_the_zone_line() {
    let snap = fold(&[
        ENTER,
        "[Tue Nov 17 12:00:06 2026] A rock golem says, 'My leader is Malkil.'",
        NEXT_ZONE,
        MINE,
        "[Tue Nov 17 12:01:05 2026] A rock golem bites an orc for 200 points of damage.",
    ]);
    let rows = rows(&snap);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
    let said = said(&snap);
    let ended = |s: &String| s.ends_with("Malkil's charm ended at the zone line");
    assert!(said.iter().any(ended), "{said:?}");
}

/// A charm broadcast after the leader line is charm evidence all the same: the bind ends there.
#[test]
fn a_charm_broadcast_after_the_leader_line_ends_the_bind_at_the_zone_line() {
    let snap = fold(&[
        ENTER,
        "[Tue Nov 17 12:00:06 2026] Jeber says, 'My leader is Malkil.'",
        "[Tue Nov 17 12:00:08 2026] Jeber has been charmed.",
        NEXT_ZONE,
        MINE,
        "[Tue Nov 17 12:01:05 2026] Jeber bites an orc for 200 points of damage.",
    ]);
    let rows = rows(&snap);
    assert!(rows.iter().all(|r| r.0 != "allyPet"), "{rows:?}");
}
