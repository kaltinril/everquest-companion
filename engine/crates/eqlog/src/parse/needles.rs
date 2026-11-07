//! One pass over the line for every substring the cascade's gates ask about.
//!
//! Each classifier is guarded by a `contains` of some fixed substring before its regex runs, and an
//! unclaimed line walked ~30 such scans in turn (measured 2026-11-06: ~590 ms of a 68 MB fold). An
//! Aho-Corasick automaton finds every needle in one pass and records them as bits; a gate is then
//! one bit test. The gates and their order are untouched: a bit is set exactly when
//! `text.contains(needle)` is true, which the test below pins over a corpus, so the cascade decides
//! what it decided before.

use aho_corasick::{AhoCorasick, AhoCorasickKind, MatchKind};

/// Every substring a gate asks about, named. The discriminant is the bit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Needle {
    ButComma,
    TriesTo,
    Resist,
    PointsOf,
    PointOf,
    HasTaken,
    HaveTaken,
    NonMeleeDamage,
    DamageBy,
    OfDamageStop,
    Healed,
    Lvl,
    BeginsCasting,
    BeginsSinging,
    SpellFizzles,
    Interrupted,
    ToAClose,
    HasBeenCharmed,
    WornOffOf,
    HasBeen,
    HasBeenAwakenedBy,
    ToldYou,
    Says,
    SaysMyLeaderIs,
    Slain,
    Entered,
    Group,
    Party,
    Looted,
    Merge,
    Offered,
    CompleteTheTrade,
    GainedALevel,
    AbilityPoint,
    Zone,
    WornOffStop,
    CoatsTheirBladesIn,
}

/// The needles, in bit order. `Needle::X as usize` indexes this table (pinned by a test).
pub const TABLE: [(Needle, &str); 37] = [
    (Needle::ButComma, ", but "),
    (Needle::TriesTo, " tries to "),
    (Needle::Resist, "resist"),
    (Needle::PointsOf, "points of"),
    (Needle::PointOf, "point of"),
    (Needle::HasTaken, "has taken"),
    (Needle::HaveTaken, "have taken"),
    (Needle::NonMeleeDamage, "non-melee damage"),
    (Needle::DamageBy, " damage by "),
    (Needle::OfDamageStop, " of damage."),
    (Needle::Healed, " healed "),
    (Needle::Lvl, "(Lvl: "),
    (Needle::BeginsCasting, " begins casting "),
    (Needle::BeginsSinging, " begins singing "),
    (Needle::SpellFizzles, "spell fizzles!"),
    (Needle::Interrupted, "interrupted."),
    (Needle::ToAClose, " to a close!"),
    (Needle::HasBeenCharmed, "has been charmed"),
    (Needle::WornOffOf, "worn off of"),
    (Needle::HasBeen, "has been "),
    (Needle::HasBeenAwakenedBy, " has been awakened by "),
    (Needle::ToldYou, " told you, '"),
    (Needle::Says, " says, '"),
    (Needle::SaysMyLeaderIs, " says, 'My leader is "),
    (Needle::Slain, "slain"),
    (Needle::Entered, "entered"),
    (Needle::Group, "group"),
    (Needle::Party, "party"),
    (Needle::Looted, "looted"),
    (Needle::Merge, "merge"),
    (Needle::Offered, "offered"),
    (Needle::CompleteTheTrade, "complete the trade"),
    (Needle::GainedALevel, "gained a level"),
    (Needle::AbilityPoint, "ability point"),
    (Needle::Zone, "ZONE: "),
    (Needle::WornOffStop, "worn off."),
    (Needle::CoatsTheirBladesIn, "coats their blades in "),
];

/// Which needles one line carries.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Hits(u64);

impl Hits {
    /// `text.contains(needle)`, answered from the one pass.
    #[inline]
    pub fn has(self, n: Needle) -> bool {
        self.0 & (1u64 << (n as u32)) != 0
    }
}

/// The automaton over [`TABLE`], built once per parser.
pub struct Needles {
    ac: AhoCorasick,
}

impl Default for Needles {
    fn default() -> Self {
        Self::new()
    }
}

impl Needles {
    pub fn new() -> Self {
        // Standard (overlapping) semantics: every needle present is reported, whatever else is.
        let ac = AhoCorasick::builder()
            .kind(Some(AhoCorasickKind::DFA))
            .match_kind(MatchKind::Standard)
            .build(TABLE.iter().map(|(_, s)| *s))
            .expect("the needle table builds");
        Needles { ac }
    }

    /// One pass over the line.
    pub fn scan(&self, text: &str) -> Hits {
        let mut bits = 0u64;
        for m in self.ac.find_overlapping_iter(text) {
            bits |= 1u64 << m.pattern().as_usize();
        }
        Hits(bits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_table_is_in_bit_order() {
        for (i, (n, _)) in TABLE.iter().enumerate() {
            assert_eq!(*n as usize, i, "{n:?}");
        }
    }

    /// Every bit is `text.contains(needle)`, over lines that carry none, one, several and nested
    /// needles (`has been ` inside `has been charmed`, ` says, '` inside ` says, 'My leader is `).
    #[test]
    fn every_bit_is_the_contains_it_replaces() {
        let needles = Needles::new();
        let corpus = [
            "",
            " ",
            "You try to slash a rat, but miss!",
            "a rat tries to bite YOU, but misses! (Lucky)",
            "a rat tries to bite YOU, but YOUR magical skin absorbs the blow!",
            "a rat resisted your Flame Lick!",
            "You resist a rat's Fetid Breath!",
            "You slash a rat for 23 points of damage.",
            "You slash a rat for 1 point of damage.",
            "a rat is burned by YOUR flame shield for 5 points of non-melee damage.",
            "YOU are burned by a rat's flame shield for 5 points of non-melee damage!",
            "Drywrought hits a rat for 30 points of fire damage by Flame Lick.",
            "a rat has taken 12 damage from your Flame Lick.",
            "You have taken 12 damage from Fetid Breath by a rat.",
            "Drywrought healed Drywrought for 100 hit points by Minor Healing.",
            "a rat (Lvl: 3) looks powerful.",
            "a rat begins casting Flame Lick.",
            "Velkator begins singing Chant.",
            "Your spell fizzles!",
            "Your Flame Lick spell is interrupted.",
            "You miss a note, bringing your Chant to a close!",
            "a rat has been charmed.",
            "Charm has worn off of a rat.",
            "Your Haste spell has worn off.",
            "Velkator coats their blades in Fetid Venom.",
            "a rat has been mesmerized.",
            "a rat has been awakened by Drywrought.",
            "Jabber told you, 'At your service Master.'",
            "Jabber says, 'My leader is Drywrought.'",
            "Jabber says, 'Guarding with my life...oh splendid one.'",
            "a rat has been slain by Drywrought!",
            "You have entered The Plane of Sky.",
            "You have joined the group.",
            "Velkator has left the party.",
            "--You have looted a Rusty Dagger.--",
            "Your items have been merged.",
            "You have offered a Rusty Dagger to Vhalen.",
            "You complete the trade with Vhalen.",
            "You have gained a level! Welcome to level 50!",
            "You have gained an ability point!",
            "[50 Rogue] Drywrought (Human) ZONE: skyfire",
            "no needle at all, honestly",
            "ZONE: slain entered group party looted merge offered",
            "Ünïcödé points of non-melee damage by resist slain",
        ];
        for line in corpus {
            let hits = needles.scan(line);
            for (n, s) in TABLE {
                assert_eq!(hits.has(n), line.contains(s), "{line:?} / {n:?}");
            }
        }
    }
}
