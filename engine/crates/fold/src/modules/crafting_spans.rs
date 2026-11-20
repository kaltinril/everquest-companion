//! Crafting spans, for pace: a span is a run of combines with no gap over five minutes, so its
//! length is time spent combining and not the evening's clock (the owner's 2026-09-12: 91 minutes
//! of crafting inside 4 h 43 min).
//!
//! BOUNDED. The newest `SPAN_CAP` spans are kept one by one; an older span is added into one
//! total (`olderSpans`: how many, their summed length, their counts), so a pace over the whole
//! log stays exact while the list stays short. `mergeCrafting.ts` folds by the same rule.
//!
//! A span counts toward a tradeskill when it holds a raise of it (the log names a combine's
//! tradeskill no other way), so the folded total keeps that sum per tradeskill too.

use serde::Serialize;
use std::collections::{BTreeMap, VecDeque};

/// A longer pause between two combines ends the span.
pub const SPAN_GAP_MS: i64 = 5 * 60 * 1_000;
/// Spans kept one by one, newest last.
pub const SPAN_CAP: usize = 120;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub start: i64,
    /// The last combine's time: a span of one combine has no length.
    pub end: i64,
    pub combines: i64,
    pub made: i64,
    pub failed: i64,
    /// Raises paired with a combine of the span, by tradeskill in the client's spelling.
    pub raises: BTreeMap<String, i64>,
}

/// What the folded spans holding a raise of one tradeskill add up to.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSpans {
    pub spans: i64,
    pub ms: i64,
    pub combines: i64,
    pub raises: i64,
}

/// The spans folded past the cap.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OlderSpans {
    pub spans: i64,
    /// Their lengths, summed.
    pub ms: i64,
    pub combines: i64,
    pub made: i64,
    pub failed: i64,
    /// By tradeskill in the client's spelling: the folded spans that hold a raise of it.
    pub by_skill: BTreeMap<String, SkillSpans>,
}

#[derive(Default)]
pub struct Spans {
    recent: VecDeque<Span>,
    older: OlderSpans,
}

impl Spans {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// A combine at `ts`: the open span grows, or a new one opens.
    pub fn combine(&mut self, ts: i64, made: bool) {
        let open = self.recent.back().is_some_and(|s| ts - s.end <= SPAN_GAP_MS);
        if !open {
            self.recent.push_back(Span { start: ts, end: ts, ..Span::default() });
            self.fold_oldest();
        }
        let Some(span) = self.recent.back_mut() else {
            return;
        };
        span.end = span.end.max(ts);
        span.combines += 1;
        if made {
            span.made += 1;
        } else {
            span.failed += 1;
        }
    }

    /// A raise paired with a combine: counted on the span that combine is in, the newest.
    pub fn raise(&mut self, skill: &str) {
        if let Some(span) = self.recent.back_mut() {
            *span.raises.entry(skill.to_string()).or_default() += 1;
        }
    }

    fn fold_oldest(&mut self) {
        while self.recent.len() > SPAN_CAP {
            let Some(span) = self.recent.pop_front() else {
                return;
            };
            let (older, ms) = (&mut self.older, span.end - span.start);
            older.spans += 1;
            older.ms += ms;
            older.combines += span.combines;
            older.made += span.made;
            older.failed += span.failed;
            for (skill, raises) in span.raises {
                let of = older.by_skill.entry(skill).or_default();
                of.spans += 1;
                of.ms += ms;
                of.combines += span.combines;
                of.raises += raises;
            }
        }
    }

    pub fn recent(&self) -> &VecDeque<Span> {
        &self.recent
    }

    /// `None` until a span has been folded past the cap.
    pub fn older(&self) -> Option<&OlderSpans> {
        (self.older.spans > 0).then_some(&self.older)
    }
}
