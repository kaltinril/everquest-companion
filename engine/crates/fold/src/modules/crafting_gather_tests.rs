//! Fishing and forage in the crafting module, on the game's own line shapes (MEASURED.md,
//! "Fishing and forage outcomes"), each read by the real parser so a test fails when the parser
//! starts typing a line the module reads as unknown.

use super::crafting::CraftingModule;
use super::crafting_tests::{at, derived, fold, read, state};
use crate::event::Kind;
use crate::EqModule;
use eqlog::event::Ev;
use serde_json::json;

const CAST: &str = "You cast your line.";
const CAUGHT: &str = "You caught Fresh Fish!";
const CAUGHT_UNNAMED: &str = "You caught something...";
const NOTHING: &str = "You didn't catch anything.";
const LOST_BAIT: &str = "You lost your bait!";
const SPILLED: &str = "You spill your beer while bringing in your line.";
const POLE_BROKE: &str = "Your fishing pole broke!";
const FOUND: &str = "You have scrounged up Fishing Grubs.";
const FOUND_ARTICLE: &str = "You have scrounged up a Tuft of Black Bear Fur.";
const FORAGE_FAILED: &str = "You fail to locate any food nearby.";

#[test]
fn the_parser_leaves_every_fishing_and_forage_line_unknown() {
    let parser = eqlog::parser_for("Tester", eqlog::Tz::UTC);
    for text in [CAST, CAUGHT, CAUGHT_UNNAMED, NOTHING, LOST_BAIT, SPILLED, POLE_BROKE, FOUND, FOUND_ARTICLE, FORAGE_FAILED] {
        let mut ev = Ev::new();
        assert!(parser.parse_event(&at("21:16:40", text), 1, &mut ev), "{text}");
        assert_eq!(ev.payload().kind(), Kind::Unknown, "{text}");
    }
}

#[test]
fn a_log_with_no_fishing_or_forage_line_serves_neither() {
    let m = fold(&[at("21:16:40", "You say, 'hello'")]);
    assert_eq!(state(&m).get("fishing"), None);
    assert_eq!(state(&m).get("forage"), None);
}

/// A cast, then its outcome 11 to 30 s later. Bait, beer and a broken pole each print with the
/// `You didn't catch anything.` of their second, so `nothing` counts those casts already.
#[test]
fn fishing_lines_are_counted_one_by_one() {
    let m = fold(&[
        at("21:16:40", CAST),
        at("21:16:55", CAUGHT),
        at("21:17:00", CAST),
        at("21:17:14", NOTHING),
        at("21:17:20", CAST),
        at("21:17:35", LOST_BAIT),
        at("21:17:35", NOTHING),
        at("21:17:40", CAST),
        at("21:17:55", SPILLED),
        at("21:17:55", NOTHING),
        at("21:18:00", CAST),
        at("21:18:14", POLE_BROKE),
        at("21:18:14", NOTHING),
        at("21:18:20", CAST),
        at("21:18:33", CAUGHT_UNNAMED),
        at("21:18:40", CAST),
        at("21:18:52", "You caught Rusty Dagger!"),
        at("21:19:00", CAST),
        at("21:19:13", CAUGHT),
    ]);
    let counts = json!({ "casts": 8, "caught": 4, "nothing": 4, "lostBait": 1, "spilled": 1, "poleBroke": 1 });
    let mut want = counts.clone();
    want["session"] = counts;
    // The catch the game did not name is a catch and no row.
    want["items"] = json!([
        { "item": "Fresh Fish", "count": 2, "lastTs": 1786828753000i64 },
        { "item": "Rusty Dagger", "count": 1, "lastTs": 1786828732000i64 }
    ]);
    assert_eq!(state(&m)["fishing"], want);
    assert_eq!(state(&m).get("forage"), None);
}

/// Zoned or interrupted: the cast printed and no outcome followed. It is a cast, and it is
/// neither a catch nor a miss.
#[test]
fn a_cast_with_no_outcome_line_is_not_a_failure() {
    let m = fold(&[
        at("21:16:40", CAST),
        at("21:16:43", "You stop fishing and go on your way."),
        at("21:16:50", CAST),
        at("21:16:55", "You have entered The Feerrott."),
        at("21:17:00", "You can't fish while holding something."),
        at("21:17:10", CAST),
        at("21:17:24", CAUGHT),
    ]);
    let fishing = &state(&m)["fishing"];
    assert_eq!((fishing["casts"].clone(), fishing["caught"].clone(), fishing["nothing"].clone()), (json!(3), json!(1), json!(0)));
}

#[test]
fn forage_lines_are_counted_and_an_item_is_named_without_its_article() {
    let m = fold(&[
        at("21:16:40", FOUND),
        at("21:18:40", FORAGE_FAILED),
        // Refused attempts: neither found nor failed.
        at("21:18:50", "You must wait longer before you can forage."),
        at("21:18:55", "You can't try to forage while attacking."),
        at("21:19:00", "You must be standing to forage."),
        at("21:20:40", FOUND_ARTICLE),
        at("21:22:40", FOUND),
        at("21:24:40", FORAGE_FAILED),
    ]);
    assert_eq!(
        state(&m)["forage"],
        json!({
            "found": 3, "failed": 2,
            "session": { "found": 3, "failed": 2 },
            "items": [
                { "item": "Fishing Grubs", "count": 2, "lastTs": 1786828960000i64 },
                { "item": "Tuft of Black Bear Fur", "count": 1, "lastTs": 1786828840000i64 }
            ]
        })
    );
    assert_eq!(state(&m).get("fishing"), None);
}

/// A catch and a forage hand over an item, and neither is a combine or a purchase.
#[test]
fn an_item_caught_or_foraged_is_no_combine_and_no_purchase() {
    let m = fold(&[at("21:16:40", CAST), at("21:16:55", CAUGHT), at("21:17:00", FOUND), at("21:17:05", "You have scrounged up Fresh Fish.")]);
    let s = state(&m);
    for table in ["items", "levels", "spans", "bought", "sold", "depot"] {
        assert_eq!(s[table], json!([]), "{table}");
    }
    // The same name from the line and from the ground is one row in each table.
    assert_eq!(s["fishing"]["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(s["forage"]["items"].as_array().map(Vec::len), Some(2));
}

#[test]
fn an_offline_gap_zeroes_the_session_and_keeps_the_totals() {
    let mut m = fold(&[at("21:16:40", CAST), at("21:16:55", CAUGHT), at("21:17:00", FOUND), at("21:19:00", FORAGE_FAILED)]);
    let cursor = m.published_seq();
    derived(&mut m, "offlineGap");
    assert!(m.published_seq() > cursor);
    let zero = json!({ "casts": 0, "caught": 0, "nothing": 0, "lostBait": 0, "spilled": 0, "poleBroke": 0 });
    assert_eq!(state(&m)["fishing"]["session"], zero);
    assert_eq!((state(&m)["fishing"]["casts"].clone(), state(&m)["fishing"]["caught"].clone()), (json!(1), json!(1)));
    assert_eq!(state(&m)["forage"]["session"], json!({ "found": 0, "failed": 0 }));
    assert_eq!((state(&m)["forage"]["found"].clone(), state(&m)["forage"]["failed"].clone()), (json!(1), json!(1)));
    // A second gap has nothing left to zero.
    let cursor = m.published_seq();
    derived(&mut m, "offlineGap");
    assert_eq!(m.published_seq(), cursor);
    read(&mut m, &[at("22:40:00", CAST), at("22:40:14", NOTHING), at("22:41:00", FOUND)]);
    let s = state(&m);
    assert_eq!((s["fishing"]["casts"].clone(), s["fishing"]["session"]["casts"].clone()), (json!(2), json!(1)));
    assert_eq!((s["fishing"]["nothing"].clone(), s["fishing"]["session"]["nothing"].clone()), (json!(1), json!(1)));
    assert_eq!(s["fishing"]["session"]["caught"], json!(0));
    assert_eq!((s["forage"]["found"].clone(), s["forage"]["session"]["found"].clone()), (json!(2), json!(1)));
    assert_eq!(s["forage"]["items"][0]["count"], json!(2));
}

#[test]
fn an_epoch_empties_fishing_and_forage() {
    let mut m = fold(&[at("21:16:40", CAST), at("21:16:55", CAUGHT), at("21:17:00", FOUND)]);
    let cursor = m.published_seq();
    derived(&mut m, "epoch");
    assert!(m.published_seq() > cursor, "fishing and forage alone are something to clear");
    assert_eq!(state(&m).get("fishing"), None);
    assert_eq!(state(&m).get("forage"), None);
    read(&mut m, &[at("21:20:00", CAST)]);
    assert_eq!(state(&m)["fishing"]["casts"], json!(1));
    assert_eq!(state(&m)["fishing"]["items"], json!([]));
}

#[test]
fn a_fishing_or_forage_line_announces_and_a_near_miss_does_not() {
    let mut m = CraftingModule::new();
    read(&mut m, &[at("21:16:40", CAST)]);
    let cursor = m.published_seq();
    assert!(cursor > Some(0));
    // Chat that quotes a line, and shapes the game never prints.
    read(&mut m, &[at("21:16:50", "You say, 'You cast your line.'"), at("21:16:51", "You caught a cold."), at("21:16:52", "You have scrounged up.")]);
    assert_eq!(m.published_seq(), cursor);
    read(&mut m, &[at("21:16:55", FORAGE_FAILED)]);
    assert!(m.published_seq() > cursor);
}
