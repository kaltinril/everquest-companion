//! Filing: an observation becomes a row. The half of the fold that turns what a line said into
//! the pooled row it counts on, kept beside `mod.rs` (a child module, so it reads the fold's own
//! fields) and apart from it so the line handlers stay readable.
//!
//! Every allocation here is one a minted row keeps. The common case, a tick stream on one mob, is
//! answered by `row_cache.rs` without building the spec at all.

use super::ledger::{iso_week_key, CasterKind, Family, ResistBucket, ResistRow, RowSpec};
use super::row_cache::RowProbe;
use super::{ResistFold, LAND_DEFER_MS};
use std::rc::Rc;

/// One thing the log said, as this fold names it before the bucket pools it. Borrowed from the line
/// (or from the deferred landing) it came off: a filing reads it once and copies nothing but what
/// a minted row keeps.
pub(super) struct Observation<'a> {
    /// The mob's name as the line spelled it; the key is folded from it.
    pub(super) mob: &'a str,
    pub(super) spell_key: &'a str,
    pub(super) family: Family,
    pub(super) kind: CasterKind,
    /// The caster's level, or `None` when nothing has stated it.
    pub(super) level: Option<i64>,
    pub(super) ts: i64,
    /// The spell upgrade rank this observation was made at: -15 of resist adjust each.
    pub(super) rank: i64,
    /// Whether the overchannel invocation was up. Three states — see `cast_state.rs`.
    pub(super) overchannel: Option<bool>,
}

/// A landing waiting to see whether a damage line cancels it: an `Observation` held for
/// `LAND_DEFER_MS` before it is filed. The fields must stay identical to `Observation`'s, because a
/// deferred filing carrying a different set of facts from an immediate one is a bug with nowhere to
/// be caught. The family is always `cast`: a song pulse is never deferred, its sentence is the
/// landing.
pub(super) struct Deferred {
    pub(super) mob: String,
    /// `mob` folded, kept so a cancelling damage line compares keys without re-folding.
    pub(super) mob_key: Rc<str>,
    pub(super) spell_key: String,
    pub(super) ts: i64,
    pub(super) kind: CasterKind,
    pub(super) level: Option<i64>,
    pub(super) rank: i64,
    pub(super) overchannel: Option<bool>,
}

impl ResistFold {
    pub(super) fn flush_deferred(&mut self, now: i64, bucket: &mut ResistBucket) {
        match &self.deferred {
            None => return,
            Some(d) if now - d.ts <= LAND_DEFER_MS => return,
            Some(_) => {}
        }
        let d = self.deferred.take().expect("checked above");
        // Only your own emote-landings are attributable. A stranger's sentence names no caster, and
        // an npc's cast is never armed in the first place.
        if d.kind != CasterKind::SelfCast {
            return;
        }
        self.row_for(
            bucket,
            &Observation {
                mob: &d.mob,
                spell_key: &d.spell_key,
                family: Family::Cast,
                kind: d.kind,
                level: d.level,
                ts: d.ts,
                rank: d.rank,
                overchannel: d.overchannel,
            },
        )
        .land += 1;
    }

    pub(super) fn cancel_deferred(&mut self, mob_key: &str, spell_key: &str) {
        let cancelled = self
            .deferred
            .as_ref()
            .is_some_and(|d| d.spell_key == spell_key && &*d.mob_key == mob_key);
        if cancelled {
            self.deferred = None;
        }
    }

    /// The cast a `resisted` line reports, as a row is keyed: the caster's level, and the rank and
    /// invocation of the armed cast it joins (the line's own rank beats the armed one, because the
    /// resist line is the one outcome line that often prints it).
    pub(super) fn resist_observation<'a>(
        &mut self,
        kind: CasterKind,
        caster: &str,
        target: &'a str,
        spell_key: &'a str,
        line_rank: i64,
        ts: i64,
    ) -> Observation<'a> {
        let level = self.caster_level(kind, caster);
        let armed = self
            .casts
            .owned_by(kind, spell_key, ts)
            .map(|a| (a.rank, a.overchannel));
        let overchannel = self.cast.invocation_for(kind, armed.map(|(_, oc)| oc));
        Observation {
            mob: target,
            spell_key,
            family: Family::Cast,
            kind,
            level,
            ts,
            rank: if line_rank > 0 {
                line_rank
            } else {
                armed.map_or(0, |(r, _)| r)
            },
            overchannel,
        }
    }

    /// The caster's level, by kind. Self is the session level; another player's is never stated
    /// anywhere this app reads; an NPC's is the same catalog-or-`/con` ladder the target's level
    /// climbs. `None` is a first-class answer and simply drops the row from the fit.
    pub(super) fn caster_level(&mut self, kind: CasterKind, caster: &str) -> Option<i64> {
        match kind {
            CasterKind::SelfCast => self.self_level,
            CasterKind::Pc => None,
            CasterKind::Npc => {
                let key = self.names.key(caster);
                self.levels.level_of(&key, caster).map(|f| f.level)
            }
        }
    }

    /// The spec, and the instant its debuff term stops being right (`row_cache.rs`).
    pub(super) fn spec(&mut self, obs: &Observation) -> (RowSpec, i64) {
        let key = self.names.key(obs.mob);
        let level = self.levels.level_of(&key, obs.mob);
        let ranged = level.filter(|l| l.lo != l.hi);
        let (debuffs, debuff_until) = self.debuffs.active(&key, obs.ts);
        let spec = RowSpec {
            debuffs: debuffs.to_string(),
            mob_key: key.to_string(),
            // Only where it changes `rc`, which is what keeps it out of the key on every ordinary
            // row.
            caster_classes: (obs.overchannel == Some(true)).then(|| self.cast.caster_classes()),
            zone: self.zone.clone(),
            spell_key: obs.spell_key.to_string(),
            family: obs.family,
            caster_kind: obs.kind,
            caster_level: obs.level,
            mob_level: level.map(|l| l.level),
            mob_level_lo: ranged.map(|l| l.lo),
            mob_level_hi: ranged.map(|l| l.hi),
            rank: obs.rank,
            overchannel: obs.overchannel,
            // The one key term that is not about `rc`: a row's age, so recent evidence can weigh
            // more than old. Off the log's own clock, never a wall clock — a replay must produce
            // the same ledger twice.
            week: Some(iso_week_key(obs.ts)),
        };
        (spec, debuff_until)
    }

    /// The row this observation pools into. The last row filed is remembered with everything its
    /// key was built from, so a tick stream on one mob pays one slot lookup per tick instead of the
    /// spec and the key; the row the cache names is the row the key would have found, term for
    /// term (`row_cache.rs`).
    pub(super) fn row_for<'b>(
        &mut self,
        bucket: &'b mut ResistBucket,
        obs: &Observation,
    ) -> &'b mut ResistRow {
        let probe = RowProbe {
            mob: obs.mob,
            spell_key: obs.spell_key,
            family: obs.family,
            kind: obs.kind,
            level: obs.level,
            rank: obs.rank,
            overchannel: obs.overchannel,
            ts: obs.ts,
        };
        if let Some(slot) = self.rows.hit(probe, self.world_rev) {
            return bucket.row_at(slot, obs.ts);
        }
        let (spec, debuff_until) = self.spec(obs);
        let slot = bucket.slot_of(spec, obs.ts);
        self.rows.fill(probe, self.world_rev, debuff_until, slot);
        bucket.row_at(slot, obs.ts)
    }
}
