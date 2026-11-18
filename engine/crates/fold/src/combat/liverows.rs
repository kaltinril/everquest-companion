//! The live meter's typed door: the selected segment's outgoing rows and nothing beneath them,
//! numbered and ranked exactly as `views::build_selected` numbers its `entities`.

use crate::combat::aggregate::Agg;
use crate::combat::lifecycle::zone_duration_sec;
use crate::combat::state::EngineState;

/// One outgoing row of the live meter: the numbers a `SourceView` carries at its top level and
/// the `combat.live` source prints, and nothing beneath them. `PartialEq` so a test can pin the
/// typed door to the snapshot's.
#[derive(Debug, Clone, PartialEq)]
pub struct LiveRow {
    pub id: String,
    pub name: String,
    pub kind: &'static str,
    pub total: i64,
    pub dps: f64,
    pub pct: f64,
    pub crit_pct: f64,
    pub misses: i64,
    pub hit_pct: f64,
    pub resists: i64,
    pub resist_pct: f64,
    pub ambiguous_hits: i64,
}

/// The selected segment's aggregate and its duration — the two inputs `build_selected` resolves
/// for `id` before anything else, by the same three lookups and the same floors. `None` when the
/// id resolves to nothing.
fn segment_agg<'a>(st: &'a EngineState, id: &str) -> Option<(&'a Agg, f64)> {
    if id == "zone" {
        return Some((&st.zone_agg, zone_duration_sec(st)));
    }
    if let Some(zs) = st.zone_history.iter().find(|z| z.id == id) {
        return Some((&zs.agg, f64::max(1.0, zs.finalized_ms as f64 / 1000.0)));
    }
    let e = match &st.current {
        Some(cur) if cur.id == id => Some(cur),
        _ => st.history.iter().find(|h| h.id == id),
    }?;
    Some((
        &e.agg,
        f64::max(1.0, (e.last_ts - e.start_ts) as f64 / 1000.0),
    ))
}

/// The selected segment's outgoing rows, numbered and ranked exactly as `build_selected(..)`'s
/// `entities` are (`source_views`: the same expressions over the same counters, the same stable
/// sort), and built from the aggregate alone. The landing graft and the annotation counts a full
/// view resolves reach a source's lanes and its rounds panel, never these numbers, so the live
/// meter pays for neither. `None` when the id resolves to nothing, as the view is `null` then.
pub fn live_rows(st: &EngineState, id: &str) -> Option<Vec<LiveRow>> {
    let (agg, duration_sec) = segment_agg(st, id)?;
    let map = &agg.out;
    let row_max = map.values().map(|s| s.total).max().unwrap_or(0).max(1) as f64;
    let mut out: Vec<LiveRow> = map
        .iter()
        .map(|(id, s)| {
            let swings = s.hits + s.misses;
            let spell_hits = s.by_category.get("spell").map_or(0, |c| c.hits)
                + s.by_category.get("dot").map_or(0, |c| c.hits);
            let casts = spell_hits + s.resists;
            LiveRow {
                id: id.to_string(),
                name: s.name.clone(),
                kind: s.kind.as_str(),
                total: s.total,
                dps: s.total as f64 / s.clock.secs_or(duration_sec),
                pct: (s.total as f64 / row_max) * 100.0,
                crit_pct: if s.hits > 0 {
                    (s.crits as f64 / s.hits as f64) * 100.0
                } else {
                    0.0
                },
                misses: s.misses,
                hit_pct: if swings > 0 {
                    (s.hits as f64 / swings as f64) * 100.0
                } else {
                    100.0
                },
                resists: s.resists,
                resist_pct: if casts > 0 {
                    (s.resists as f64 / casts as f64) * 100.0
                } else {
                    0.0
                },
                ambiguous_hits: s.ambiguous_hits,
            }
        })
        .collect();
    out.sort_by_key(|s| std::cmp::Reverse(s.total));
    Some(out)
}
