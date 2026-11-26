//! `/alternateadv list` (`/alt list`): the game prints one three-line block per AA the class combo
//! can see, all in about one second (docs/community/agent/MEASURED.md, "Alternate advancement"):
//!
//! ```text
//! Ability #40: Combat Fury
//! Description: This passive ability increases your chance of ... by 5%.
//! Cost per Level: 4
//! ```
//!
//! Each line is its own `aaList` event: the header carries `value` (the `#id`) and `ability`, the
//! description `text`, the cost line `cost`. The fold (`leveling.rs`) joins them into blocks and runs.
//! Offered first in the cascade: a description is free prose ("... for 10 points of damage") that a
//! later classifier could otherwise claim.

use crate::event::{Ev, Key, Kind};
use crate::jsstr::js_trim;

use super::Ctx;

const HEADER: &str = "Ability #";
const DESCRIPTION: &str = "Description: ";
const COST: &str = "Cost per Level: ";

pub fn classify_aa_list(c: &Ctx, out: &mut Ev) -> bool {
    if let Some(rest) = c.text.strip_prefix(HEADER) {
        let Some((id, name)) = rest.split_once(": ") else {
            return false;
        };
        let Ok(id) = id.parse::<i64>() else {
            return false;
        };
        out.begin(Kind::AaList);
        out.envelope(c.seq, c.ts, c.raw);
        out.i(Key::Value, id);
        out.s(Key::Ability, js_trim(name));
        return true;
    }
    if let Some(text) = c.text.strip_prefix(DESCRIPTION) {
        out.begin(Kind::AaList);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Text, js_trim(text));
        return true;
    }
    let Some(cost) = c.text.strip_prefix(COST) else {
        return false;
    };
    let Ok(cost) = js_trim(cost).parse::<i64>() else {
        return false;
    };
    out.begin(Kind::AaList);
    out.envelope(c.seq, c.ts, c.raw);
    out.i(Key::Cost, cost);
    true
}
