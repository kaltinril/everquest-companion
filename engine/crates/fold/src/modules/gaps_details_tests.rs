//! What a row's details serve (`gaps_details.rs`): every con reading past the cap, and one item's
//! price out of a stack sold on loot. On the parent test file's corpus.

use super::{feed, module};
use crate::modules::gaps::GapsModule;
use crate::EqModule;
use serde_json::{json, Value};

#[test]
fn every_con_reading_is_served_past_the_cap_so_a_page_states_the_whole_level_range() {
    // Four levels under two standings fill the eight served entries; the lowest and highest level,
    // each conned once, fall off them. The copied page's `level` reads `all`.
    let mut m = module();
    let mut seq = 0;
    let mut con = |m: &mut GapsModule, level: i64, faction: &str| {
        seq += 1;
        feed(m, seq, json!({ "kind": "consider", "mob": "a nameless thing", "level": level, "faction": faction }));
    };
    con(&mut m, 28, "apprehensive");
    for level in 29..=32 {
        for faction in ["apprehensive", "indifferent"] {
            con(&mut m, level, faction);
            con(&mut m, level, faction);
        }
    }
    con(&mut m, 33, "indifferent");
    let cons = m.snapshot()["state"]["rows"][0]["details"]["cons"].clone();
    assert_eq!(cons["entries"].as_array().map(Vec::len), Some(8));
    assert_eq!(cons["distinct"], json!(10));
    let all: Vec<&str> = cons["all"].as_array().expect("all").iter().filter_map(Value::as_str).collect();
    assert_eq!(all.len(), 10);
    assert!(all.contains(&"L28 apprehensive") && all.contains(&"L33 indifferent"), "{all:?}");
}

#[test]
fn a_stack_sold_on_loot_is_tallied_at_one_items_price() {
    // The line's coin covers the stack (tests/fixtures/w21-stacked.log: Spider Silk 1 for 143c, 2
    // for 286c, 4 for 572c); the list is one item's price, the sum what the row brought in.
    let sold = |n: &str, coin: &str| format!("[Sat Oct 10 16:11:23 2026] You looted {n} Glowing Widget from a treant's corpse and sold it for {coin}.");
    let loot = |raw: String, count: Option<i64>| {
        let mut ev = json!({ "kind": "loot", "item": "Glowing Widget", "source": "a treant", "disposition": "sold", "raw": raw });
        if let Some(n) = count {
            ev["count"] = json!(n);
        }
        ev
    };
    let mut m = module();
    feed(&mut m, 1, loot(sold("2", "2 gold, 8 silver and 6 copper"), Some(2)));
    feed(&mut m, 2, loot(sold("4", "5 gold, 7 silver and 2 copper"), Some(4)));
    feed(&mut m, 3, loot(sold("a", "1 gold, 4 silver and 3 copper"), None));
    let d = m.snapshot()["state"]["rows"][0]["details"].clone();
    assert_eq!(d["sales"], json!({ "entries": [{ "name": "1 gold 4 silver 3 copper", "n": 3 }], "distinct": 1 }));
    assert_eq!(d["salesCopper"], json!(286 + 572 + 143));
    // A stack whose coin does not divide evenly states no one price: none is guessed.
    feed(&mut m, 4, loot(sold("3", "1 gold"), Some(3)));
    let d = m.snapshot()["state"]["rows"][0]["details"].clone();
    assert_eq!(d["sales"]["entries"], json!([{ "name": "1 gold 4 silver 3 copper", "n": 3 }]));
    assert_eq!(d["salesCopper"], json!(286 + 572 + 143 + 100));
    // Whole coins only where the price has them: 2 for 2 platinum 4 silver is 1 platinum 2 silver each.
    let mut whole = module();
    feed(&mut whole, 1, loot(sold("2", "2 platinum and 4 silver"), Some(2)));
    let d = whole.snapshot()["state"]["rows"][0]["details"].clone();
    assert_eq!(d["sales"]["entries"], json!([{ "name": "1 platinum 2 silver", "n": 1 }]));
}
