//! An offer read through a guess in the module: listed, never counted, and never in the way of a
//! counted one (review, 2026-10-13).

use super::tests::{line, Names};
use super::BazaarModule;
use crate::knowledge::Knowledge;
use crate::EqModule;
use serde_json::{json, Value};
use std::sync::Arc;

fn fold(lines: &[&str]) -> Value {
    let mut m = BazaarModule::new();
    let k: Arc<dyn Knowledge> = Arc::new(Names);
    m.install_knowledge(&k);
    for (seq, raw) in lines.iter().enumerate() {
        m.on_event(&line(seq as i64 + 1, raw), false);
    }
    m.snapshot()["state"]["rows"].clone()
}

/// A later unsure line from the same person keeps their counted price on the list beside it.
#[test]
fn a_guess_never_hides_the_price_a_person_was_counted_at() {
    let rows = fold(&[
        "[Wed Sep 23 17:00:00 2026] Leric tells General:1, 'WTB Fleeting Quiver 50pp'",
        "[Wed Sep 23 17:10:00 2026] Leric tells General:1, 'WTB Fleeting Quiver 40'",
    ]);
    assert_eq!(rows[0]["n"], 1);
    assert_eq!(rows[0]["prices"], json!([50.0]));
    assert_eq!(
        rows[0]["quotes"],
        json!([
            { "at": "17:00:00", "who": "Leric", "price": 50.0, "msg": "WTB Fleeting Quiver 50pp" },
            { "at": "17:10:00", "who": "Leric", "price": null, "msg": "WTB Fleeting Quiver 40" }
        ])
    );
}

/// Two different unsure lines from one person in a day are both heard: the newer is the one listed,
/// and a repeat of it changes nothing.
#[test]
fn each_different_guess_is_listed() {
    let rows = fold(&[
        "[Wed Sep 23 17:00:00 2026] Leric tells General:1, 'WTB Fleeting Quiver 40'",
        "[Wed Sep 23 17:10:00 2026] Leric tells General:1, 'WTB Fleeting Quiver 45'",
        "[Wed Sep 23 17:20:00 2026] Leric tells General:1, 'WTB Fleeting Quiver 45'",
    ]);
    assert_eq!(rows[0]["n"], 0);
    assert_eq!(
        rows[0]["quotes"],
        json!([
            { "at": "17:10:00", "who": "Leric", "price": null, "msg": "WTB Fleeting Quiver 45" }
        ])
    );
}

/// Owner ruling, 2026-11-23: in "WTS 3k each: A | B | C 10k" the item with a price of its own after
/// the lead is listed as sold with no price, its line beneath it, and adds nothing to its prices.
#[test]
fn an_irregular_price_line_lists_the_item_with_no_price_and_its_line() {
    let said = "WTS 3k each: Bone Chips | Fruit | Fleeting Quiver 10k";
    let rows = fold(&[&format!(
        "[Wed Sep 23 17:00:00 2026] Leric tells General:1, '{said}'"
    )]);
    let row = |item: &str| {
        rows.as_array()
            .unwrap()
            .iter()
            .find(|r| r["item"] == item)
            .cloned()
            .unwrap()
    };
    assert_eq!(row("Bone Chips")["prices"], json!([3000.0]));
    assert_eq!(row("Fruit")["prices"], json!([3000.0]));
    let quiver = row("Fleeting Quiver");
    assert_eq!(quiver["dir"], "sell");
    assert_eq!(quiver["n"], 0);
    assert_eq!(quiver["prices"], json!([]));
    assert_eq!(
        quiver["quotes"],
        json!([{ "at": "17:00:00", "who": "Leric", "price": null, "msg": said }])
    );
}
