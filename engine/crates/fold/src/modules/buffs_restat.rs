//! Re-projecting rows that are already live, when what they count down from moved under them.
//!
//! An `ActiveBuff` carries the numbers it was projected with, so anything that changes the
//! estimator's answer has to restate the rows it reaches: a new sample restates its own spell line,
//! and a saved duration choice (fork issue #4) restates every row, because it arrives with no log
//! line and nothing else would move them until the next cast.
//!
//! A sibling `impl` because `buffs_instances.rs` sits over the factoring bar.

use crate::modules::buffs_entities::PetEntities;
use crate::modules::buffs_instances::{reproject_spec, BuffInstances};
use crate::modules::buffs_shapes::{instance_entity_key, instance_spell_key, SELF_CASTER};
use crate::modules::buffs_stats::SpellStats;
use crate::modules::buffs_view::build_active;

impl BuffInstances {
    /// Restate one live row against the stats as they now stand. The landing clock, the caster and
    /// the count are the row's own; only the numbers read from the estimator can move.
    pub(super) fn reproject_row(&mut self, ik: String, stats: &SpellStats, pets: &PetEntities) {
        let count = self
            .open
            .get(&ik)
            .map(|o| o.group.count() as i64)
            .or_else(|| self.active.get(&ik).and_then(|a| a.count))
            .unwrap_or(1);
        let Some(a) = self.active.get(&ik) else {
            return;
        };
        let spec = reproject_spec(
            a,
            instance_spell_key(&ik),
            instance_entity_key(&ik),
            a.started_ts,
            a.caster.as_deref().unwrap_or(SELF_CASTER),
            count,
        );
        let built = build_active(&spec, stats, pets);
        self.active.insert(ik, built);
    }

    /// Restate every live row: the player's duration choices changed, and a choice is keyed by
    /// spell line for every caster, so any row may be counting down from a number that just moved.
    /// The hygiene sweep reads its cull off the same rows, so it follows the choice too.
    pub fn restat_all(&mut self, stats: &SpellStats, pets: &PetEntities) {
        let keys: Vec<String> = self.active.iter().map(|(ik, _)| ik.to_string()).collect();
        for ik in keys {
            self.reproject_row(ik, stats, pets);
        }
    }
}
