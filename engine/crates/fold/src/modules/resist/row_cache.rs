//! The last row the fold filed, remembered so the next observation that pools into it skips the
//! spec and the key build.
//!
//! A DoT ticks on one mob every six seconds and a nuke rotation hits the same mob for a minute, so
//! the common case is "the same row as last time". Deciding that honestly means comparing every
//! input `mod.rs spec` reads: the observation's own fields, the ISO week the timestamp falls in, the
//! debuff window (which can close on its own clock), and a world revision the fold bumps whenever a
//! level, a `/con`, a debuff, a zone or the class loadout moves. A hit is then a row whose key would
//! have been byte-identical; a miss costs what every filing used to.

use super::ledger::{week_start, CasterKind, Family, WEEK_MS};

/// Everything `spec` reads off an observation, kept by value.
#[derive(Debug, Default)]
pub struct RowCache {
    filled: bool,
    mob: String,
    spell_key: String,
    family: Option<Family>,
    kind: Option<CasterKind>,
    level: Option<i64>,
    rank: i64,
    overchannel: Option<bool>,
    /// The week the cached row belongs to, as `[lo, hi)` on the log's clock.
    week_lo: i64,
    week_hi: i64,
    /// The fold's world revision at fill time.
    world_rev: u64,
    /// The first instant the mob's debuff string stops being right.
    debuff_until: i64,
    slot: usize,
}

/// The observation fields a row is keyed by, borrowed from wherever the caller holds them.
#[derive(Debug, Clone, Copy)]
pub struct RowProbe<'a> {
    pub mob: &'a str,
    pub spell_key: &'a str,
    pub family: Family,
    pub kind: CasterKind,
    pub level: Option<i64>,
    pub rank: i64,
    pub overchannel: Option<bool>,
    pub ts: i64,
}

impl RowCache {
    pub fn clear(&mut self) {
        self.filled = false;
    }

    /// The cached slot, when this observation pools into the row filed last.
    #[must_use]
    pub fn hit(&self, p: RowProbe<'_>, world_rev: u64) -> Option<usize> {
        if !self.filled
            || self.world_rev != world_rev
            || p.ts >= self.debuff_until
            || p.ts < self.week_lo
            || p.ts >= self.week_hi
        {
            return None;
        }
        let same = self.family == Some(p.family)
            && self.kind == Some(p.kind)
            && self.level == p.level
            && self.rank == p.rank
            && self.overchannel == p.overchannel
            && self.spell_key == p.spell_key
            && self.mob == p.mob;
        same.then_some(self.slot)
    }

    /// Remember the row just filed. The strings are reused in place, so a miss that alternates
    /// between two mobs costs a copy and not an allocation.
    pub fn fill(&mut self, p: RowProbe<'_>, world_rev: u64, debuff_until: i64, slot: usize) {
        self.filled = true;
        self.mob.clear();
        self.mob.push_str(p.mob);
        self.spell_key.clear();
        self.spell_key.push_str(p.spell_key);
        self.family = Some(p.family);
        self.kind = Some(p.kind);
        self.level = p.level;
        self.rank = p.rank;
        self.overchannel = p.overchannel;
        self.week_lo = week_start(p.ts);
        self.week_hi = self.week_lo + WEEK_MS;
        self.world_rev = world_rev;
        self.debuff_until = debuff_until;
        self.slot = slot;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe(ts: i64) -> RowProbe<'static> {
        RowProbe {
            mob: "a rat",
            spell_key: "shock of frost",
            family: Family::Cast,
            kind: CasterKind::SelfCast,
            level: Some(51),
            rank: 0,
            overchannel: Some(false),
            ts,
        }
    }

    #[test]
    fn a_hit_needs_every_key_term_the_same_week_and_an_unmoved_world() {
        let mut c = RowCache::default();
        assert_eq!(c.hit(probe(1_000), 0), None);
        c.fill(probe(1_000), 0, 50_000, 7);
        assert_eq!(c.hit(probe(2_000), 0), Some(7));
        // The world moved, a debuff window closed, the week turned, a term differs: all misses.
        assert_eq!(c.hit(probe(2_000), 1), None);
        assert_eq!(c.hit(probe(50_000), 0), None);
        assert_eq!(c.hit(probe(1_000 + WEEK_MS), 0), None);
        assert_eq!(
            c.hit(
                RowProbe {
                    rank: 1,
                    ..probe(2_000)
                },
                0
            ),
            None
        );
        assert_eq!(
            c.hit(
                RowProbe {
                    mob: "a bat",
                    ..probe(2_000)
                },
                0
            ),
            None
        );
        c.clear();
        assert_eq!(c.hit(probe(2_000), 0), None);
    }
}
