//! `/alt list` prints three lines per AA (owner's log, 2026-11-25; MEASURED.md "Alternate
//! advancement"). Each is an `aaList` event the leveling fold joins into blocks.

use eqlog::event::Ev;
use eqlog::{Clock, Parser};
use serde_json::Value;

fn parsed(text: &str) -> Value {
    let p = Parser::new(
        Clock::new(chrono_tz::America::Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let mut ev = Ev::new();
    assert!(
        p.parse_event(&format!("[Tue Nov 25 16:02:11 2026] {text}"), 0, &mut ev),
        "{text}"
    );
    serde_json::from_str(ev.finish()).unwrap()
}

#[test]
fn the_three_lines_of_a_block_each_parse_to_an_aa_list_event() {
    let h = parsed("Ability #40: Combat Fury");
    assert_eq!(h["kind"], "aaList");
    assert_eq!(h["value"], 40);
    assert_eq!(h["ability"], "Combat Fury");
    let d = parsed("Description: This passive ability increases your chance of performing a critical melee hit with all skills by 5%.");
    assert_eq!(d["kind"], "aaList");
    assert_eq!(
        d["text"],
        "This passive ability increases your chance of performing a critical melee hit with all skills by 5%."
    );
    let c = parsed("Cost per Level: 4");
    assert_eq!(c["kind"], "aaList");
    assert_eq!(c["cost"], 4);
}

#[test]
fn a_description_that_reads_like_combat_is_still_the_list_line() {
    let d = parsed("Description: This ability, when activated, will cast all currently memorized beneficial spells on all valid group and raid targets in range, for full mana and reagent cost. ");
    assert_eq!(d["kind"], "aaList");
    assert!(d["text"].as_str().unwrap().ends_with("reagent cost."));
}

#[test]
fn a_name_with_a_colon_keeps_it_and_a_malformed_header_is_not_claimed() {
    let h = parsed("Ability #26000: Class Reincarnation: Warrior");
    assert_eq!(h["value"], 26000);
    assert_eq!(h["ability"], "Class Reincarnation: Warrior");
    assert_ne!(parsed("Ability #x: Nope")["kind"], "aaList");
    assert_ne!(parsed("Cost per Level: lots")["kind"], "aaList");
}

#[test]
fn the_players_own_proof_lines_parse_to_aa_owned_with_the_name() {
    for (line, name) in [
        (
            "You can use the ability Heroic Leap again in 2 minute(s) 3 seconds.",
            "Heroic Leap",
        ),
        (
            "You can use the ability Rampage again in 0 minute(s) 41 seconds.",
            "Rampage",
        ),
        ("You disable Point Blank Fire.", "Point Blank Fire"),
        (
            "Your Quick Buff combat ability is interrupted.",
            "Quick Buff",
        ),
    ] {
        let v = parsed(line);
        assert_eq!(v["kind"], "aaOwned", "{line}");
        assert_eq!(v["name"], name, "{line}");
    }
    // A spell interrupt stays what it was.
    assert_eq!(
        parsed("Your Origin spell is interrupted.")["kind"],
        "castInterrupted"
    );
}

#[test]
fn a_ranked_cast_and_a_finishing_blow_reach_the_fold_as_they_always_did() {
    let c = parsed("You begin casting Rampage II.");
    assert_eq!(c["kind"], "castBegin");
    assert_eq!(c["spell"], "Rampage II");
    let d = parsed("You punch a rock golem for 120 points of damage. (Finishing Blow)");
    assert_eq!(d["kind"], "damage");
    assert_eq!(d["attacker"], "You");
    assert_eq!(d["dtype"], "melee");
    assert!(d["modifiers"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m == "Finishing Blow"));
}
