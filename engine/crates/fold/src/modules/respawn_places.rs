//! `respawn.rs` across the PLACES of a zone (owner, 2026-11-03): the open pickzone tiers and a
//! private instance each keep their own clock; the respawn estimate is pooled across them, since
//! it is the same in each; creating the next private instance closes the last. A child module of
//! `respawn`, for its fields; `respawn_places_tests.rs` covers it.

use super::*;
use crate::event::Event;
use crate::modules::respawn_learned::least;

/// A zone line's base name, lowercase: the tier, any `- Solo`/`- Group` and a private instance's
/// `[instance N]` tag stripped. `Lake Nerius 4 (Refined) [instance 17]` and `Lake Nerius` are one.
fn zone_base(zone: &str) -> String {
    let bare = zone.split(" [instance ").next().unwrap_or(zone);
    crate::jsfn::zone_tier(bare).0.to_lowercase()
}

/// The zone a learned gap files under: the stay's zone without a private instance's `[instance N]`
/// tag, since the respawn is the same in every instance (owner, 2026-11-03) and the wiki number
/// needs every place's gaps in one series (owner, 2026-11-05: three nameds in Nektropos Castle 4,
/// one gap in a joined instance and one in an own instance, each read as one gap on its own).
pub(super) fn learned_place(zone: &str) -> &str {
    zone.split(" [instance ").next().unwrap_or(zone)
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
    ///
    /// Pooled from the LEARNED store as well as the history, because the history forgets a place:
    /// creating the next private instance drops the last one's entries, and the 800-mob LRU drops
    /// the rest in time. Every history gap is recorded in the store the moment it is learned, so
    /// the count is the larger of the two, never their sum (owner, 2026-11-07: the Nektropos
    /// Castle nameds respawned in 21-24 minutes in the Nov 5 instance; two days on, in a fresh
    /// instance, each clock ran from the open world's hour-long gap alone, "your kills (1 gap)").
    pub(super) fn pooled_gaps(&self, h: &MobHistory) -> (Option<i64>, i64) {
        let base = zone_base(&h.zone);
        let mut min = h.min_gap_ms;
        let mut samples = h.samples;
        for o in self.history.values() {
            if o.key != h.key || o.zone == h.zone || o.samples == 0 || zone_base(&o.zone) != base {
                continue;
            }
            samples += o.samples;
            min = least(min, o.min_gap_ms);
        }
        let (learned_min, learned_count) = self.learned.pooled(&h.key, |z| zone_base(z) == base);
        (least(min, learned_min), samples.max(learned_count))
    }
}
