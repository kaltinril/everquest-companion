//! A meter row's own clock: the time its DPS divides by, and how an aggregate stamps it.

use crate::combat::aggregate::{Agg, SourceKind};

/// A source's own attacking time: first swing to last swing inside each fight, at least a second
/// per fight, summed over the fights a segment holds. A row's DPS divides by this and not by the
/// fight it may have joined late (owner, 2026-11-17: one 40,000 hit in a fight is 40,000 DPS).
#[derive(Debug, Clone, Default)]
pub struct OwnClock {
    open: bool,
    /// The encounter counter the open span belongs to; 0 outside any fight of ours.
    fight: u64,
    first: i64,
    last: i64,
    closed_ms: i64,
    /// The finished spans that were inside a fight of ours (fight, first, last), each counted in
    /// `closed_ms`. Kept for `merge`: two clocks that ran in one finished fight count its hull once.
    done: Vec<(u64, i64, i64)>,
}

/// A span outside any fight of ours (a bystander's row) ends after this much quiet.
const LOOSE_SPAN_GAP_MS: i64 = 60_000;
const SPAN_FLOOR_MS: i64 = 1_000;

/// One span's length: first swing to last, a second at least.
fn span(first: i64, last: i64) -> i64 {
    (last - first).max(SPAN_FLOOR_MS)
}

impl OwnClock {
    /// One swing at `ts` in fight `fight`. Another fight, or a long quiet with no fight around it,
    /// closes the open span first, so the time between fights is never counted.
    pub fn stamp(&mut self, ts: i64, fight: u64) {
        let loose_gap = fight == 0 && ts - self.last > LOOSE_SPAN_GAP_MS;
        if self.open && (self.fight != fight || loose_gap) {
            self.closed_ms += self.span_ms();
            if self.fight != 0 {
                self.done.push((self.fight, self.first, self.last));
            }
            self.open = false;
        }
        if !self.open {
            self.open = true;
            self.fight = fight;
            self.first = ts;
            self.last = ts;
        } else if ts > self.last {
            self.last = ts;
        }
    }

    fn span_ms(&self) -> i64 {
        if self.open {
            span(self.first, self.last)
        } else {
            0
        }
    }

    /// Every span so far, the open one included. 0 only for a clock never stamped.
    pub fn ms(&self) -> i64 {
        self.closed_ms + self.span_ms()
    }

    /// Fold another row's clock in (a re-keyed row): one fight's two spans become their hull,
    /// whether that fight is still open or long finished. Time outside any fight is added.
    pub fn merge(&mut self, from: OwnClock) {
        let in_fights: i64 = from.done.iter().map(|s| span(s.1, s.2)).sum();
        self.closed_ms += from.closed_ms - in_fights;
        for (fight, first, last) in from.done {
            self.join(fight, first, last);
        }
        if !from.open {
            return;
        }
        if !self.open {
            self.open = true;
            self.fight = from.fight;
            self.first = from.first;
            self.last = from.last;
        } else {
            self.join(from.fight, from.first, from.last);
        }
    }

    /// Count one span of `fight` from another clock: widened into this clock's own span of that
    /// fight when it has one, new time when it has none.
    fn join(&mut self, fight: u64, first: i64, last: i64) {
        if self.open && self.fight == fight && self.near(fight, first, last) {
            self.first = self.first.min(first);
            self.last = self.last.max(last);
            return;
        }
        let mine = (self.done.iter_mut()).find(|s| fight != 0 && s.0 == fight);
        if let Some(s) = mine {
            let was = span(s.1, s.2);
            (s.1, s.2) = (s.1.min(first), s.2.max(last));
            self.closed_ms += span(s.1, s.2) - was;
            return;
        }
        if fight != 0 {
            self.done.push((fight, first, last));
        }
        self.closed_ms += span(first, last);
    }

    /// Two spans of one fight are one span. Outside any fight (0) only when no long quiet parts
    /// them, the rule `stamp` ends a loose span by.
    fn near(&self, fight: u64, first: i64, last: i64) -> bool {
        fight != 0
            || (first - self.last <= LOOSE_SPAN_GAP_MS && self.first - last <= LOOSE_SPAN_GAP_MS)
    }

    /// The clock in seconds, the divisor of a row's DPS. A row no door ever stamped (none in a
    /// real fold) falls back to the segment's length.
    pub fn secs_or(&self, segment_sec: f64) -> f64 {
        match self.ms() {
            0 => segment_sec,
            ms => ms as f64 / 1000.0,
        }
    }
}

impl Agg {
    /// Name the line about to be folded: its instant and the fight it belongs to (0 for none).
    pub fn at(&mut self, ts: i64, fight: u64) {
        self.cur = (ts, fight);
    }

    /// The named line's instant and fight, after stamping the You scope's clock when the row
    /// about to be written is you or a pet of yours.
    pub(crate) fn stamp_self(&mut self, kind: SourceKind) -> (i64, u64) {
        if matches!(kind, SourceKind::You | SourceKind::Pet) {
            self.self_clock.stamp(self.cur.0, self.cur.1);
        }
        self.cur
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::aggregate::{MissFold, MissType, SourceRef};

    /// One missed swing by `id` at `ts` in fight 1: the cheapest row door there is.
    fn swing(a: &mut Agg, id: &str, kind: SourceKind, ts: i64) {
        a.at(ts, 1);
        let r = SourceRef {
            id: id.into(),
            name: id.into(),
            kind,
        };
        let m = MissFold {
            mtype: MissType::Dodge,
            skill: "Melee",
            verb: None,
            lane_skill: None,
            modifiers: &[],
            target: "a bat",
            ts,
        };
        a.add_out_miss(&r, &m);
    }

    /// The You scope's clock is you and your pets together; a group-mate's swing is not in it.
    #[test]
    fn the_self_clock_is_you_and_your_pets_only() {
        let mut a = Agg::new();
        swing(&mut a, "member:malkil", SourceKind::Member, 1_000);
        swing(&mut a, "you", SourceKind::You, 4_000);
        swing(&mut a, "pet:zobarn#1", SourceKind::Pet, 9_000);
        swing(&mut a, "member:malkil", SourceKind::Member, 12_000);
        assert_eq!(a.self_clock.ms(), 5_000);
        assert_eq!(a.out.get("you").expect("row").clock.ms(), 1_000);
        assert_eq!(a.out.get("member:malkil").expect("row").clock.ms(), 11_000);
    }

    /// A source's own clock: each fight's first-to-last swing, a second at least, and never the
    /// quiet between two fights.
    #[test]
    fn the_own_clock_sums_each_fights_span_and_skips_the_time_between() {
        let mut c = OwnClock::default();
        assert_eq!(c.ms(), 0, "never stamped");
        c.stamp(1_000, 1);
        assert_eq!(c.ms(), 1_000, "one swing is the one-second floor");
        c.stamp(15_000, 1);
        assert_eq!(c.ms(), 14_000);
        // Fight 2 starts five minutes on: its lone swing adds a second, not the five minutes.
        c.stamp(315_000, 2);
        assert_eq!(c.ms(), 15_000);
        c.stamp(320_000, 2);
        assert_eq!(c.ms(), 19_000);
    }

    /// Outside any fight of ours (fight 0) a long quiet ends the span.
    #[test]
    fn a_span_with_no_fight_around_it_ends_after_a_long_quiet() {
        let mut c = OwnClock::default();
        c.stamp(0, 0);
        c.stamp(30_000, 0);
        c.stamp(200_000, 0);
        assert_eq!(c.ms(), 31_000);
    }

    /// Two rows of one fight merged by a re-key share one span: the hull, not the sum.
    #[test]
    fn merging_two_clocks_of_one_fight_takes_their_hull() {
        let mut a = OwnClock::default();
        a.stamp(1_000, 3);
        a.stamp(5_000, 3);
        let mut b = OwnClock::default();
        b.stamp(3_000, 3);
        b.stamp(9_000, 3);
        a.merge(b);
        assert_eq!(a.ms(), 8_000);
    }

    /// A pet claimed late: a finished fight both clocks ran in is its hull once, a fight only the
    /// pet ran in and its time outside any fight are added, and the open fight goes on as one span.
    #[test]
    fn merging_counts_a_finished_fight_both_clocks_ran_in_once() {
        let mut you = OwnClock::default();
        you.stamp(0, 1);
        you.stamp(10_000, 1);
        you.stamp(300_000, 3);
        let mut pet = OwnClock::default();
        pet.stamp(2_000, 1);
        pet.stamp(12_000, 1);
        pet.stamp(100_000, 2);
        pet.stamp(104_000, 2);
        pet.stamp(200_000, 0);
        pet.stamp(308_000, 3);
        you.merge(pet);
        // Fight 1's hull (12 s), fight 2 (4 s), the loose second, fight 3's hull so far (8 s).
        assert_eq!(you.ms(), 25_000);
        you.stamp(310_000, 3);
        assert_eq!(you.ms(), 27_000);
    }

    /// Two spans outside any fight, a long quiet apart, stay two spans when merged.
    #[test]
    fn merging_two_loose_spans_keeps_the_quiet_between_them_out() {
        let mut a = OwnClock::default();
        a.stamp(0, 0);
        a.stamp(10_000, 0);
        let mut b = OwnClock::default();
        b.stamp(500_000, 0);
        b.stamp(505_000, 0);
        a.merge(b);
        assert_eq!(a.ms(), 15_000);
    }
}
