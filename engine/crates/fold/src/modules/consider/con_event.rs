//! One live `/con`, as the con-card hook saw it.
//!
//! Its own file because `consider.rs` sits over the factoring bar: the faction rung and the
//! difficulty clause joined the card (upstream issue #75) and had to be paid for, so the hand-back
//! and its one constructor moved here and the module's push became one line.

use crate::event::Event;

/// One live `/con`, as the con-card hook saw it.
///
/// A HAND-BACK rather than a callback, for the same ownership reason `take_fires` and `take_derived`
/// are: a module cannot hold a mutable reference to something the registry is iterating. It carries
/// the facts the card is built from and nothing derived — deriving is the serve layer's job.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConEvent {
    /// The `ts` of the con line — the LOG's own clock.
    pub ts: i64,
    /// The mob's display name, exactly as the line printed it. Uncapped and unfolded here: capping
    /// is a rendering guarantee and folding is an identity, and both belong to whoever builds the
    /// card rather than to the module that saw the line.
    pub mob: String,
    /// The level the con line stated, when it stated one.
    pub level: Option<i64>,
    /// The ` - a rare creature - ` infix was on the line.
    pub rare: bool,
    /// The zone the player was in — the module's own, which is why this is not simply the event.
    pub zone: Option<String>,
    /// The faction rung the parser named (`scowls`, `amiably`, …), 1:1 from the phrase. Empty only
    /// for an event that carried none.
    pub faction: String,
    /// The difficulty clause, VERBATIM. Turning it into a con colour is the app's presentation.
    pub difficulty: String,
}

impl ConEvent {
    /// The hand-back for one consider event, with the zone the module was holding when it arrived.
    #[must_use]
    pub fn from_event(ev: &Event, zone: Option<String>) -> Self {
        Self {
            ts: ev.ts(),
            mob: ev.str("mob").unwrap_or_default().to_owned(),
            level: ev.int("level"),
            rare: ev.bool("rare"),
            zone,
            faction: ev.str("faction").unwrap_or_default().to_owned(),
            difficulty: ev.str("difficulty").unwrap_or_default().to_owned(),
        }
    }
}
