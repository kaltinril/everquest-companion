//! Crafting's money and stock: what merchants were paid per item, what they paid back, and the
//! depot count the game last stated.
//!
//! - `You purchased 20 Gold Bar from <merchant> for  210 platinum.` is the parser's `purchase`
//!   (item, count, npc). `You receive <coin> from <merchant> for the <item>(s).` is its `coin`
//!   with source `vendor` (npc, item); the line states no quantity, so a sale is counted in lines.
//! - The coin is read off the raw line with Wiki Gaps' reader (`gaps_details.rs`): the event's
//!   price is an object the fold's event reader does not hand out. Everything is in copper.
//! - `Consumed 2 x Gold Bar (leaving 21) from your personal depot.` prints before a combine made
//!   from depot stock. Only this line states a count: a deposit or a withdrawal names its
//!   quantity and not what is left, so the count is as old as the item's last draw.

use super::crafting::Rows;
use super::gaps_details::{coin_of, price_of};
use crate::event::{Event, Key};
use crate::message_overlay::message_text_of;
use serde::Serialize;

/// One item bought from a merchant.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoughtRow {
    pub item: String,
    pub qty: i64,
    /// Everything paid for it.
    pub copper: i64,
    /// The newest purchase line: its quantity and what the whole of it cost. The unit price is
    /// the second over the first, kept as two whole numbers so nothing is rounded here.
    pub last_qty: i64,
    pub last_copper: i64,
    pub merchant: String,
    /// The zone the player was in, when the log had stated one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zone: Option<String>,
    pub ts: i64,
}

/// One item sold to a merchant.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoldRow {
    pub item: String,
    /// Sale lines; the line states no quantity.
    pub lines: i64,
    pub copper: i64,
    /// What the newest line paid.
    pub last_copper: i64,
    pub merchant: String,
    pub ts: i64,
}

/// One item's depot stock, as the newest draw stated it.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepotRow {
    pub item: String,
    pub left: i64,
    pub ts: i64,
}

/// `Consumed 2 x Gold Bar (leaving 21) from your personal depot.`
#[derive(Debug, PartialEq)]
pub struct Consumed<'a> {
    pub qty: i64,
    pub item: &'a str,
    pub left: i64,
}

pub fn consumed_of(text: &str) -> Option<Consumed<'_>> {
    let body = text.strip_prefix("Consumed ")?.strip_suffix(" from your personal depot.")?;
    let (qty, rest) = body.split_once(" x ")?;
    let (item, left) = rest.rsplit_once(" (leaving ")?;
    let consumed = Consumed { qty: qty.parse().ok()?, item, left: left.strip_suffix(')')?.parse().ok()? };
    (!item.is_empty()).then_some(consumed)
}

/// The coin of a vendor sale line, in copper: the clause between `You receive ` and ` from `.
fn sale_copper(text: &str) -> Option<i64> {
    let clause = text.strip_prefix("You receive ")?.split(" from ").next()?;
    coin_of(clause).map(|(_, copper)| copper)
}

#[derive(Default)]
pub struct Money {
    bought: Rows<BoughtRow>,
    sold: Rows<SoldRow>,
    depot: Rows<DepotRow>,
}

impl Money {
    pub fn clear(&mut self) {
        self.bought.clear();
        self.sold.clear();
        self.depot.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.bought.is_empty() && self.sold.is_empty() && self.depot.is_empty()
    }

    /// A `purchase` event. A free purchase counts its quantity at no coin.
    pub fn bought(&mut self, ev: &Event, zone: Option<&str>) -> bool {
        let (Some(item), Some(merchant)) = (ev.str(Key::Item), ev.str(Key::Npc)) else {
            return false;
        };
        let qty = ev.int(Key::Count).unwrap_or(1);
        let copper = price_of(ev.raw(), " for ").map_or(0, |(_, copper)| copper);
        let row = self.bought.entry(item, || BoughtRow { item: item.to_string(), ..BoughtRow::default() });
        row.qty += qty;
        row.copper += copper;
        (row.last_qty, row.last_copper) = (qty, copper);
        row.merchant = merchant.to_string();
        row.zone = zone.map(str::to_string);
        row.ts = ev.ts();
        true
    }

    /// A `coin` event: only a merchant's payment for an item is a sale.
    pub fn sold(&mut self, ev: &Event) -> bool {
        if ev.str(Key::Source) != Some("vendor") {
            return false;
        }
        let (Some(item), Some(merchant)) = (ev.str(Key::Item), ev.str(Key::Npc)) else {
            return false;
        };
        let Some(copper) = sale_copper(message_text_of(ev.raw())) else {
            return false;
        };
        let row = self.sold.entry(item, || SoldRow { item: item.to_string(), ..SoldRow::default() });
        row.lines += 1;
        row.copper += copper;
        row.last_copper = copper;
        row.merchant = merchant.to_string();
        row.ts = ev.ts();
        true
    }

    /// A depot draw: the item's stock is what the line says is left.
    pub fn consumed(&mut self, c: &Consumed, ts: i64) -> bool {
        let row = self.depot.entry(c.item, || DepotRow { item: c.item.to_string(), ..DepotRow::default() });
        (row.left, row.ts) = (c.left, ts);
        true
    }

    pub fn bought_rows(&self) -> &[BoughtRow] {
        self.bought.list()
    }

    pub fn sold_rows(&self) -> &[SoldRow] {
        self.sold.list()
    }

    pub fn depot_rows(&self) -> &[DepotRow] {
        self.depot.list()
    }
}
