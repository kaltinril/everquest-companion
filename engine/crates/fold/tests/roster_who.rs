//! A roster member carries the classes their `/who` row stated — and nobody else's row is published.
//!
//! The claim, from both ends: a row about somebody on the roster reaches the published member
//! whichever of the row and the join came first, and a row about a stranger changes nothing a
//! client can read and announces nothing.

use fold::event::Event;
use fold::{registered, ClusterDeps, Fold};
use serde_json::{json, Value};

struct Probe {
    fold: Fold,
    seq: i64,
    cursor: i64,
}

impl Probe {
    fn new() -> Self {
        let mut p = Probe {
            fold: Fold::new(registered(ClusterDeps::default()), i64::MAX),
            seq: 0,
            cursor: 0,
        };
        p.cursor = p.roster_cursor();
        p
    }

    fn roster_cursor(&self) -> i64 {
        let seqs = self.fold.registry.published_seqs();
        seqs.iter()
            .find(|(id, _)| *id == "roster")
            .map_or(0, |(_, s)| *s)
    }

    /// Fold one event and answer whether the roster announced.
    fn fold(&mut self, mut ev: Value) -> bool {
        self.seq += 1;
        ev["seq"] = json!(self.seq);
        ev["ts"] = json!(self.seq * 1000);
        let ev = Event::from_json(&ev.to_string()).expect("a JSON event");
        self.fold.on_primary(&ev, true);
        let now = self.roster_cursor();
        let moved = now != self.cursor;
        self.cursor = now;
        moved
    }

    fn who(&mut self, row: &str) -> bool {
        self.fold(json!({ "kind": "unknown", "raw": format!("[Mon Sep 21 23:31:00 2026] {row}") }))
    }

    fn join(&mut self, name: &str) -> bool {
        self.fold(json!({ "kind": "group", "raw": "g", "change": "join", "name": name }))
    }

    fn members(&self) -> Vec<Value> {
        let snap = self
            .fold
            .registry
            .snapshot_of("roster")
            .expect("the roster module");
        snap["state"]["members"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    }
}

const MALKIL: &str = "[50 DRU/RNG/MAG] Malkil (Halfling) <Neon Knights> ZONE: Halas (halas)  ";

#[test]
fn a_member_with_no_row_publishes_no_classes() {
    let mut p = Probe::new();
    p.join("Malkil");
    let members = p.members();
    assert_eq!(members.len(), 1);
    let row = members[0].as_object().unwrap();
    assert_eq!(row["name"], "Malkil");
    for absent in ["classes", "level", "classesTs"] {
        assert!(
            !row.contains_key(absent),
            "{absent} must be absent, not empty"
        );
    }
}

#[test]
fn a_row_after_the_join_reaches_the_member_and_is_announced() {
    let mut p = Probe::new();
    p.join("Malkil");
    assert!(p.who(MALKIL), "a member restated is a published change");
    let members = p.members();
    assert_eq!(members[0]["classes"], json!(["DRU", "RNG", "MAG"]));
    assert_eq!(members[0]["level"], 50);
    assert_eq!(members[0]["classesTs"], 2000);
    // …and everything the roster already said about them is still there.
    assert_eq!(members[0]["source"], "joined");
    assert_eq!(members[0]["sinceTs"], 1000);
}

#[test]
fn a_row_before_the_join_answers_once_the_join_arrives() {
    let mut p = Probe::new();
    assert!(!p.who(MALKIL), "a stranger's row publishes nothing");
    assert!(
        p.members().is_empty(),
        "and a row is never a membership signal"
    );
    p.join("Malkil");
    assert_eq!(p.members()[0]["classes"], json!(["DRU", "RNG", "MAG"]));
}

#[test]
fn a_strangers_row_changes_nothing_a_client_can_read() {
    let mut p = Probe::new();
    p.join("Malkil");
    let before = p.members();
    assert!(!p.who("[50 WAR/NEC/ENC] Grynn (Werewolf)  ZONE: Halas (halas)"));
    assert_eq!(p.members(), before);
}

#[test]
fn a_swapped_loadout_is_the_newer_row() {
    let mut p = Probe::new();
    p.join("Malkil");
    p.who(MALKIL);
    assert!(p.who("[50 DRU/RNG/ENC] Malkil (Halfling)  ZONE: Halas (halas)"));
    assert_eq!(p.members()[0]["classes"], json!(["DRU", "RNG", "ENC"]));
    assert_eq!(p.members()[0]["classesTs"], 3000);
}
