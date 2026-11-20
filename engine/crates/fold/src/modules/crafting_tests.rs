//! The crafting module on the game's own line shapes (MEASURED.md, "Combines in detail"), each
//! read by the real parser so a test fails when the parser stops handing a line over the way the
//! module reads it. Merchant names are invented.

use super::crafting::CraftingModule;
use super::crafting_money::{consumed_of, Consumed};
use super::crafting_spans::{Spans, SPAN_CAP, SPAN_GAP_MS};
use crate::event::{Event, Kind};
use crate::EqModule;
use eqlog::event::Ev;
use serde_json::{json, Value};

const RAISE_4: &str = "You have become better at Jewelry Making! (4)";
const RAISE_5: &str = "You have become better at Jewelry Making! (5)";
const MADE: &str = "You have fashioned the items together to create something new: Silver Malachite Ring.";
const FAILED: &str = "You lacked the skills to fashion Silver Malachite Ring.";
const TRIVIAL: &str = "You can no longer advance your skill from making this item.";
const REFUSED: &str = "Sorry, but you don't have everything you need for this recipe in your general inventory.";

/// One log line of 2026-08-15 at `clock` (`00:15:14`).
fn at(clock: &str, text: &str) -> String {
    format!("[Sat Aug 15 {clock} 2026] {text}")
}

fn read(m: &mut CraftingModule, lines: &[String]) {
    let parser = eqlog::parser_for("Tester", eqlog::Tz::UTC);
    let mut ev = Ev::new();
    for line in lines {
        let seq = m.snapshot()["seq"].as_i64().unwrap_or(0) + 1;
        assert!(parser.parse_event(line, seq, &mut ev), "{line}");
        m.on_event(&Event::typed(ev.payload()), false);
    }
}

fn fold(lines: &[String]) -> CraftingModule {
    let mut m = CraftingModule::new();
    read(&mut m, lines);
    m
}

/// A derived event, which the parser never writes.
fn derived(m: &mut CraftingModule, kind: &str) {
    let seq = m.snapshot()["seq"].as_i64().unwrap_or(0) + 1;
    let ev = Event::from_json(&json!({ "kind": kind, "seq": seq, "ts": 0 }).to_string()).expect("a JSON event");
    m.on_event(&ev, false);
}

fn state(m: &CraftingModule) -> Value {
    m.snapshot()["state"].clone()
}

fn item(m: &CraftingModule, at: usize) -> Value {
    state(m)["items"][at].clone()
}

#[test]
fn the_parser_leaves_the_three_lines_the_module_reads_as_unknown() {
    let parser = eqlog::parser_for("Tester", eqlog::Tz::UTC);
    let kind = |text: &str| {
        let mut ev = Ev::new();
        assert!(parser.parse_event(&at("00:15:14", text), 1, &mut ev));
        ev.payload().kind()
    };
    assert_eq!(kind(FAILED), Kind::Unknown);
    assert_eq!(kind(TRIVIAL), Kind::Unknown);
    assert_eq!(kind("Consumed 2 x Gold Bar (leaving 21) from your personal depot."), Kind::Unknown);
    assert_eq!(kind(REFUSED), Kind::Unknown);
    assert_eq!(kind("You have fashioned the items together to create an alternate product: Bottle."), Kind::Unknown);
    assert_eq!(kind(MADE), Kind::ItemReceived);
    assert_eq!(kind("You purchased 20 Gold Bar from Jeweler Anvo for  210 platinum."), Kind::Purchase);
    assert_eq!(kind("You receive 4 gold 3 silver 9 copper from Jeweler Anvo for the Silver Malachite Ring(s)."), Kind::Coin);
}

#[test]
fn made_and_failed_combines_are_counted_on_the_item() {
    let m = fold(&[at("00:15:14", MADE), at("00:15:20", FAILED), at("00:15:26", MADE)]);
    assert_eq!(
        item(&m, 0),
        json!({ "item": "Silver Malachite Ring", "made": 2, "failed": 1, "trivial": 0, "raises": 0,
                "firstTs": 1786752914000i64, "lastTs": 1786752926000i64,
                "sessionMade": 2, "sessionFailed": 1, "sessionRaises": 0 })
    );
    assert_eq!(state(&m)["items"].as_array().map(Vec::len), Some(1));
}

#[test]
fn a_raise_before_a_made_combine_pairs_with_it() {
    let m = fold(&[at("00:15:14", RAISE_4), at("00:15:14", MADE)]);
    let row = item(&m, 0);
    assert_eq!((row["raises"].clone(), row["firstRaise"].clone(), row["lastRaise"].clone()), (json!(1), json!(4), json!(4)));
    assert_eq!(row["tradeskill"], json!("Jewelry Making"));
    assert_eq!(row["sessionRaises"], json!(1));
}

/// The raise can sit two lines above its combine: a depot draw prints between them.
#[test]
fn a_raise_pairs_across_the_depot_line_of_its_second() {
    let m = fold(&[
        at("00:15:14", RAISE_4),
        at("00:15:14", "Consumed 1 x Malachite (leaving 67) from your personal depot."),
        at("00:15:14", MADE),
    ]);
    assert_eq!(item(&m, 0)["raises"], json!(1));
}

#[test]
fn a_failed_combine_carries_the_raise_printed_after_it() {
    let m = fold(&[at("00:15:14", FAILED), at("00:15:14", RAISE_4), at("00:15:20", RAISE_5), at("00:15:20", MADE)]);
    let row = item(&m, 0);
    assert_eq!((row["made"].clone(), row["failed"].clone(), row["raises"].clone()), (json!(1), json!(1), json!(2)));
    assert_eq!((row["firstRaise"].clone(), row["lastRaise"].clone()), (json!(4), json!(5)));
}

#[test]
fn a_raise_in_another_second_is_credited_to_no_item() {
    let m = fold(&[at("00:15:14", RAISE_4), at("00:15:16", MADE)]);
    let row = item(&m, 0);
    assert_eq!(row["raises"], json!(0));
    assert_eq!(row.get("tradeskill"), None);
    assert_eq!(state(&m)["levels"][0]["value"], json!(4));
    assert_eq!(state(&m)["levels"][0].get("firstItem"), None);
}

/// `skills.rs` trap 1: the game can restate the level it already gave. The line still names the
/// item's tradeskill.
#[test]
fn a_line_restating_the_level_is_not_a_raise() {
    let mut m = fold(&[at("00:15:14", RAISE_4), at("00:15:14", MADE)]);
    read(&mut m, &[at("00:15:20", RAISE_4), at("00:15:20", "You have fashioned the items together to create something new: Silver Jasper Ring.")]);
    assert_eq!(item(&m, 0)["raises"], json!(1));
    assert_eq!(item(&m, 1)["raises"], json!(0));
    assert_eq!(item(&m, 1)["tradeskill"], json!("Jewelry Making"));
    assert_eq!(state(&m)["spans"][0]["raises"], json!({ "Jewelry Making": 1 }));
}

#[test]
fn a_skill_that_is_no_tradeskill_is_not_a_combines_raise() {
    let m = fold(&[at("00:15:14", "You have become better at Kick! (12)"), at("00:15:14", MADE)]);
    assert_eq!(item(&m, 0)["raises"], json!(0));
    assert_eq!(state(&m)["levels"], json!([]));
}

#[test]
fn the_trivial_notice_goes_on_the_next_combine_within_a_second() {
    let m = fold(&[
        // Same second, made.
        at("00:17:58", TRIVIAL),
        at("00:17:58", MADE),
        // The second before, failed.
        at("00:18:03", TRIVIAL),
        at("00:18:04", FAILED),
        // Two seconds on: the notice is not this combine's.
        at("00:18:10", TRIVIAL),
        at("00:18:12", MADE),
        // No notice at all.
        at("00:18:20", MADE),
    ]);
    let row = item(&m, 0);
    assert_eq!((row["made"].clone(), row["failed"].clone()), (json!(3), json!(1)));
    assert_eq!((row["trivial"].clone(), row["trivialTs"].clone()), (json!(2), json!(1786753084000i64)));
}

#[test]
fn a_refused_attempt_and_a_by_product_are_not_combines() {
    let mut m = fold(&[at("00:15:14", REFUSED)]);
    assert_eq!(state(&m)["items"], json!([]));
    assert_eq!(m.published_seq(), Some(0));
    read(
        &mut m,
        &[
            at("00:15:20", "You lacked the skills to fashion Bog Juice."),
            at("00:15:20", "You have become better at Brewing! (2)"),
            at("00:15:20", "You have fashioned the items together to create an alternate product: Bottle."),
        ],
    );
    assert_eq!(state(&m)["items"].as_array().map(Vec::len), Some(1));
    let row = item(&m, 0);
    assert_eq!((row["item"].clone(), row["failed"].clone(), row["raises"].clone()), (json!("Bog Juice"), json!(1), json!(1)));
    assert_eq!(state(&m)["spans"][0]["combines"], json!(1));
    // The by-product is counted on the combine it rode on.
    assert_eq!(row["byProducts"], json!(1));
}

#[test]
fn a_by_product_is_counted_on_the_combine_of_its_second_only() {
    let by_product = "You have fashioned the items together to create an alternate product: Bottle.";
    let mut m = fold(&[at("00:15:14", MADE)]);
    // No by-product yet: the row does not carry the key.
    assert_eq!(item(&m, 0).get("byProducts"), None);
    let cursor = m.published_seq();
    // Three seconds after the combine: nobody's.
    read(&mut m, &[at("00:15:17", by_product)]);
    assert_eq!(item(&m, 0).get("byProducts"), None);
    assert_eq!(m.published_seq(), cursor);
    read(&mut m, &[at("00:15:20", "You lacked the skills to fashion Bog Juice."), at("00:15:20", by_product), at("00:15:26", MADE)]);
    assert_eq!(item(&m, 0).get("byProducts"), None);
    assert_eq!(item(&m, 1)["byProducts"], json!(1));
    // The spelling the game never prints is not a by-product.
    read(&mut m, &[at("00:15:26", "You have fashioned the items together to create alternate product: Bottle.")]);
    assert_eq!(item(&m, 0).get("byProducts"), None);
    assert_eq!(state(&m)["items"].as_array().map(Vec::len), Some(2));
}

#[test]
fn an_offline_gap_zeroes_the_session_counts_and_keeps_the_totals() {
    let mut m = fold(&[at("00:15:14", RAISE_4), at("00:15:14", MADE), at("00:15:20", FAILED)]);
    assert_eq!(state(&m)["levels"][0]["firstInSession"], json!(true));
    derived(&mut m, "offlineGap");
    let row = item(&m, 0);
    assert_eq!((row["made"].clone(), row["failed"].clone(), row["raises"].clone()), (json!(1), json!(1), json!(1)));
    assert_eq!((row["sessionMade"].clone(), row["sessionFailed"].clone(), row["sessionRaises"].clone()), (json!(0), json!(0), json!(0)));
    assert_eq!(state(&m)["levels"][0].get("firstInSession"), None);
    // A second gap has nothing left to zero.
    let cursor = m.published_seq();
    derived(&mut m, "offlineGap");
    assert_eq!(m.published_seq(), cursor);
    read(&mut m, &[at("00:40:00", MADE)]);
    assert_eq!((item(&m, 0)["made"].clone(), item(&m, 0)["sessionMade"].clone()), (json!(2), json!(1)));
}

#[test]
fn an_epoch_empties_every_table() {
    let mut m = fold(&[
        at("00:15:14", RAISE_4),
        at("00:15:14", MADE),
        at("00:15:20", "You purchased 20 Gold Bar from Jeweler Anvo for  210 platinum."),
        at("00:15:21", "Consumed 2 x Gold Bar (leaving 18) from your personal depot."),
    ]);
    let cursor = m.published_seq();
    derived(&mut m, "epoch");
    assert_eq!(state(&m), json!({ "items": [], "levels": [], "spans": [], "bought": [], "sold": [], "depot": [] }));
    assert!(m.published_seq() > cursor);
    // The level table went too: the same level is a raise again for the reborn character.
    read(&mut m, &[at("00:20:00", RAISE_4), at("00:20:00", MADE)]);
    assert_eq!(item(&m, 0)["raises"], json!(1));
    assert_eq!(CraftingModule::new().published_seq(), Some(0));
}

#[test]
fn combines_under_five_minutes_apart_are_one_span() {
    let m = fold(&[
        at("00:15:14", RAISE_4),
        at("00:15:14", MADE),
        at("00:20:14", FAILED),
        // Five minutes and one second after the last combine: a new span.
        at("00:25:15", MADE),
    ]);
    assert_eq!(
        state(&m)["spans"],
        json!([
            { "start": 1786752914000i64, "end": 1786753214000i64, "combines": 2, "made": 1, "failed": 1,
              "raises": { "Jewelry Making": 1 } },
            { "start": 1786753515000i64, "end": 1786753515000i64, "combines": 1, "made": 1, "failed": 0, "raises": {} }
        ])
    );
    assert_eq!(state(&m).get("olderSpans"), None);
}

#[test]
fn spans_past_the_cap_are_added_into_one_total() {
    let mut spans = Spans::default();
    let step = SPAN_GAP_MS + 31_000;
    for n in 0..(SPAN_CAP as i64 + 2) {
        // Each span: two combines 30 s apart, one made with a raise and one failed.
        spans.combine(n * step, true);
        spans.raise("Baking");
        spans.combine(n * step + 30_000, false);
    }
    assert_eq!(spans.recent().len(), SPAN_CAP);
    assert_eq!(spans.recent().front().map(|s| s.start), Some(2 * step));
    assert_eq!(
        json!(spans.older()),
        json!({ "spans": 2, "ms": 60_000, "combines": 4, "made": 2, "failed": 2,
                "bySkill": { "Baking": { "spans": 2, "ms": 60_000, "combines": 4, "raises": 2 } } })
    );
}

#[test]
fn a_purchase_files_quantity_coin_merchant_and_zone() {
    let m = fold(&[
        at("00:10:00", "You have entered The Feerrott."),
        // Two spaces after `for`, as the game prints it.
        at("00:15:14", "You purchased 20 Gold Bar from Jeweler Anvo for  210 platinum."),
        at("00:15:20", "You purchased 2 Gold Bar from Jeweler Bex for  21 platinum 1 gold 5 silver 2 copper."),
        at("00:15:30", "You purchased 1 Ruby from Jeweler Anvo for  131 platinum 2 gold 5 silver."),
    ]);
    assert_eq!(
        state(&m)["bought"],
        json!([
            { "item": "Gold Bar", "qty": 22, "copper": 231_152, "lastQty": 2, "lastCopper": 21_152,
              "merchant": "Jeweler Bex", "zone": "The Feerrott", "ts": 1786752920000i64 },
            { "item": "Ruby", "qty": 1, "copper": 131_250, "lastQty": 1, "lastCopper": 131_250,
              "merchant": "Jeweler Anvo", "zone": "The Feerrott", "ts": 1786752930000i64 }
        ])
    );
}

#[test]
fn a_merchants_payment_is_a_sale_and_other_coin_is_not() {
    let m = fold(&[
        at("00:18:40", "You receive 4 gold 3 silver 9 copper from Jeweler Anvo for the Silver Malachite Ring(s)."),
        at("00:18:44", "You receive 141 platinum 7 gold 5 silver from Jeweler Bex for the Silver Malachite Ring(s)."),
        at("00:18:50", "You receive 6 gold from Jeweler Anvo."),
        at("00:18:51", "You receive 3 platinum, 5 gold and 8 copper from the corpse."),
    ]);
    assert_eq!(
        state(&m)["sold"],
        json!([{ "item": "Silver Malachite Ring", "lines": 2, "copper": 142_189, "lastCopper": 141_750,
                 "merchant": "Jeweler Bex", "ts": 1786753124000i64 }])
    );
}

#[test]
fn a_depot_draw_states_what_is_left() {
    assert_eq!(
        consumed_of("Consumed 2 x Enchanted Gold Bar (leaving 21) from your personal depot."),
        Some(Consumed { qty: 2, item: "Enchanted Gold Bar", left: 21 })
    );
    assert_eq!(consumed_of("You have deposited 4 Ruby to your personal depot."), None);
    let m = fold(&[
        at("00:15:14", "Consumed 1 x Malachite (leaving 67) from your personal depot."),
        at("00:15:14", "Consumed 2 x Enchanted Gold Bar (leaving 21) from your personal depot."),
        at("00:15:20", "Consumed 1 x Malachite (leaving 66) from your personal depot."),
    ]);
    assert_eq!(
        state(&m)["depot"],
        json!([
            { "item": "Malachite", "left": 66, "ts": 1786752920000i64 },
            { "item": "Enchanted Gold Bar", "left": 21, "ts": 1786752914000i64 }
        ])
    );
}

#[test]
fn a_line_that_changes_nothing_does_not_announce() {
    let mut m = fold(&[at("00:15:14", RAISE_4), at("00:15:14", MADE)]);
    let (before, cursor) = (state(&m), m.published_seq());
    read(&mut m, &[at("00:15:20", TRIVIAL), at("00:15:30", RAISE_4), at("00:15:40", "You say, 'hello'")]);
    assert_eq!(state(&m), before);
    assert_eq!(m.published_seq(), cursor);
}
