//! Whose summoned pet is it, when it has not said? The weakest ally bind (2026-11-20,
//! requirements/pet-rules.md rule 3).
//!
//! No line names the pet a summon makes. What the log does say is `<Name> begins casting <a pet
//! summon>.`, so `SummonWatch` keeps the summons no pet has been tied to yet, and
//! `AllyCharms::infer_summon_owner` ties one to a name from the game's pet-name table when that
//! name first acts against something the group is fighting. It guesses only when exactly ONE
//! summon is waiting. Split from `ally.rs` at the engine's file-size bar; the binds stay there.

use crate::combat::ally::{AllyBind, AllyCharms, AllyKind, AllyVia, NO_CLOCK};
use crate::jsmap::JsMap;
use std::collections::HashMap;

/// How long after a group mate's `begins casting <a pet summon>` a first-seen pet name may still
/// be that summon's pet. A pet is summoned at camp and may not swing until the next pull.
pub const SUMMON_INFER_WINDOW_MS: i64 = 10 * 60_000;
/// A pet cannot act before its summon has finished casting. The shortest summon is longer.
pub const SUMMON_INFER_MIN_MS: i64 = 2_000;

/// The summons waiting for a pet, and when each unowned pet name was first seen.
#[derive(Default)]
pub struct SummonWatch {
    /// casterKey → (display, ts) of a GROUP MATE's pet summon no pet has been tied to yet. Spent by
    /// the bind it explains, by that owner's leader line, and by `SUMMON_INFER_WINDOW_MS`.
    waiting: JsMap<(String, i64)>,
    /// When YOU last began a pet summon no claim has answered. Your pet names you sooner or later;
    /// until it does, a new pet name may be yours, so nothing is guessed for a group mate.
    own_waiting: Option<i64>,
    /// petKey → when a summoned-pet name first acted with no bind. A name already fighting before
    /// a summon was cast is not that summon's pet.
    first_unbound: HashMap<String, i64>,
}

impl SummonWatch {
    pub fn reset(&mut self) {
        self.waiting.clear();
        self.own_waiting = None;
        self.first_unbound.clear();
    }

    /// A group mate began a pet summon.
    pub fn note_group_summon(&mut self, caster_key: &str, caster: &str, ts: i64) {
        self.waiting
            .insert(caster_key.to_string(), (caster.to_string(), ts));
    }

    /// A leader line tied this pet to this owner: their summon is explained.
    pub fn explained(&mut self, owner_key: &str, pet_key: &str) {
        self.waiting.remove(owner_key);
        self.first_unbound.remove(pet_key);
    }

    /// The bind on this name ended. The next pet with this name is a new one.
    pub fn forget_pet(&mut self, pet_key: &str) {
        self.first_unbound.remove(pet_key);
    }

    /// A summoned-pet name acted with no bind, whatever it swung at. The first such moment is kept.
    pub fn note_unbound(&mut self, pet_key: &str, ts: i64) -> i64 {
        *self.first_unbound.entry(pet_key.to_string()).or_insert(ts)
    }

    /// When this name first acted with no owner, if it has since its last bind or death.
    pub fn first_seen(&self, pet_key: &str) -> Option<i64> {
        self.first_unbound.get(pet_key).copied()
    }

    /// `You begin casting <a pet summon>.`
    pub fn note_own(&mut self, ts: i64) {
        self.own_waiting = Some(ts);
    }

    /// Your summon failed, or a pet has named you: nothing of yours is waiting for a name.
    pub fn clear_own(&mut self) {
        self.own_waiting = None;
    }

    /// The one group mate this pet can be credited to, spending their summon; `None` when there is
    /// not exactly one, or the name first acted before that cast could have finished.
    fn pick(
        &mut self,
        pet_key: &str,
        ts: i64,
        still_member: impl Fn(&str) -> bool,
    ) -> Option<(String, String)> {
        let first = self.note_unbound(pet_key, ts);
        let floor = ts.saturating_sub(SUMMON_INFER_WINDOW_MS);
        self.waiting
            .retain(|k, (_, at)| *at >= floor && still_member(k));
        if self.own_waiting.is_some_and(|at| at < floor) {
            self.own_waiting = None;
        }
        if self.own_waiting.is_some() || self.waiting.len() != 1 {
            return None;
        }
        let (owner_key, (owner, cast_ts)) = {
            let (k, v) = self.waiting.iter().next()?;
            (k.to_string(), v.clone())
        };
        // Already acting before the cast could have finished: somebody else's pet.
        if first < cast_ts.saturating_add(SUMMON_INFER_MIN_MS) {
            return None;
        }
        self.waiting.remove(&owner_key);
        self.first_unbound.remove(pet_key);
        Some((owner_key, owner))
    }
}

impl AllyCharms {
    /// A summoned-pet name acted with no bind, against something the group is fighting. Whose is
    /// it? `Some` when exactly one group mate's summon is waiting and the name first acted after
    /// that cast; the bind is made here. `still_member` is asked of each waiting caster, because a
    /// group mate who left is no longer guessed for.
    pub fn infer_summon_owner(
        &mut self,
        pet_key: &str,
        pet: &str,
        ts: i64,
        still_member: impl Fn(&str) -> bool,
    ) -> Option<AllyBind> {
        if self.binds.contains_key(pet_key) {
            return None;
        }
        let (owner_key, owner) = self.watch.pick(pet_key, ts, still_member)?;
        // One pet at a time: an earlier guess for this owner is over.
        self.binds
            .retain(|_, b| b.via != AllyVia::Summon || b.charmer_key != owner_key);
        let bind = AllyBind {
            name_key: pet_key.to_string(),
            display: pet.to_string(),
            charmer_key: owner_key.clone(),
            charmer: owner,
            bound_ts: ts,
            hold_until: NO_CLOCK,
            window_ms: NO_CLOCK,
            ambiguous: false,
            via: AllyVia::Summon,
            kind: AllyKind::Summon,
            defaulted: false,
        };
        self.binds.insert(pet_key.to_string(), bind.clone());
        self.friendlies.insert(owner_key);
        Some(bind)
    }
}
