//! `respawn.rs` across the PLACES of a zone (owner, 2026-11-03): the open pickzone tiers and a
//! private instance each keep their own clock; the respawn estimate is pooled across them, since
//! it is the same in each; creating the next private instance closes the last. A child module of
//! `respawn`, for its fields; `respawn_places_tests.rs` covers it.

use super::*;
use crate::event::Event;

/// A zone line's base name, lowercase: the tier, any `- Solo`/`- Group` and a private instance's
/// `[instance N]` tag stripped. `Lake Nerius 4 (Refined) [instance 17]` and `Lake Nerius` are one.
fn zone_base(zone: &str) -> String {
    let bare = zone.split(" [instance ").next().unwrap_or(zone);
    crate::jsfn::zone_tier(bare).0.to_lowercase()
}

/// The stay was a private instance (`zone` above tags it so).
fn is_private_instance(zone: &str) -> bool {
    zone.contains(" [instance ")
}

impl RespawnModule {
    /// `Player <You> creating instance <Zone> <Id>.`: the next zone line into that zone is that
    /// instance. You hold one private instance of a zone at a time, so creating the next closes
    /// the last, and its clocks go with it (owner, 2026-11-03). What it taught (`learned`) stays.
    pub(super) fn instance_created(&mut self, ev: &Event) {
        let (Some(zone), Some(id)) = (ev.str("zone"), ev.int("instance")) else {
            return;
        };
        let base = zone_base(zone);
        let gone: Vec<String> = self
            .history
            .iter()
            .filter(|(_, h)| is_private_instance(&h.zone) && zone_base(&h.zone) == base)
            .map(|(k, _)| k.to_string())
            .collect();
        for k in &gone {
            self.history.remove(k);
        }
        if !gone.is_empty() {
            self.rev += 1;
        }
        self.pending_instance = Some((base, id));
    }

    /// A zone line: a new stay. Entering the zone an instance was just created for is entering
    /// that instance: its clocks are its own, never the open world's under the same zone line.
    pub(super) fn entered(&mut self, ev: &Event) {
        let entered = ev.str("zone").unwrap_or_default();
        self.zone = match self.pending_instance.take() {
            Some((base, id)) if base == zone_base(entered) => format!("{entered} [instance {id}]"),
            _ => entered.to_string(),
        };
        self.zone_since = ev.ts();
        // No gap spans a new stay, so nothing is awaiting a sign of life any more.
        self.awaiting.clear();
        // The revision moves, because the zone is part of what the screen shows: without this both
        // surfaces keep drawing the old zone's clocks while the log stays quiet.
        self.rev += 1;
    }

    /// The mob's gaps across every place of its zone: the open tiers, a private instance. The
    /// spawn time is the same in each (owner, 2026-11-03: "the amount of time it takes to spawn
    /// isn't different between instances"), so a gap learned in the open +4 times the +3's clock
    /// too. Each place keeps its own clock base; only the smallest gap and the count are pooled.
    pub(super) fn pooled_gaps(&self, h: &MobHistory) -> (Option<i64>, i64) {
        let base = zone_base(&h.zone);
        let mut min = h.min_gap_ms;
        let mut samples = h.samples;
        for o in self.history.values() {
            if o.key != h.key || o.zone == h.zone || o.samples == 0 || zone_base(&o.zone) != base {
                continue;
            }
            samples += o.samples;
            min = match (min, o.min_gap_ms) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (a, b) => a.or(b),
            };
        }
        (min, samples)
    }
}
