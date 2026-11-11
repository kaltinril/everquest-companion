//! Where a mob stands (owner ask, 2026-10-18), for the Gaps tab's mob page `|location`. A player
//! who `/loc`s beside a mob and cons or hails it has said where it is:
//!
//! ```text
//! [Sun Oct 18 20:02:54 2026] Your Location is -790.65, 173.39, -12.01
//! [Sun Oct 18 20:02:56 2026] You say, 'Hail, a scout from zanivar'
//! ```
//!
//! EQ Legends writes the `/loc` line to the log (the owner's, 2026-10-18). A con or a hail takes
//! the `/loc` read within LOC_PAIR_MS before it, else the next one within LOC_PAIR_MS after. Each
//! point is kept per mob in `/loc`'s own order, which is the wiki's; points within CLUSTER_UNITS
//! of a kept spot are that spot, averaged (owner, 2026-11-10: two `/loc`s beside one merchant "are
//! basically the same loc"; his ruling: 20 units). Measured on the owner's 68 placed mobs: a
//! standing NPC's points lie 36 to 50 apart, a roamer's 273 and up, one wanderer's three at 51 and
//! 118, so at 20 units two `/loc`s from different sides of one NPC still read as two spots.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use serde_json::{json, Value};
use std::collections::HashMap;

/// LOC, hail, LOC is a few seconds' work; a con from across the zone a minute later is not.
const LOC_PAIR_MS: i64 = 10_000;
/// Points within this of a spot's mean are that spot (owner's ruling, 2026-11-10: "should be 20 or
/// so"; his standing NPCs measured 36 to 50 apart, roamers 273 and up).
const CLUSTER_UNITS: f64 = 20.0;

/// One spot: the running mean of the `/loc` points read beside the mob there.
struct Cluster {
    sum: [f64; 3],
    n: f64,
}

impl Cluster {
    fn mean(&self) -> [f64; 3] {
        self.sum.map(|v| v / self.n)
    }

    /// The mean rounded, as the page writes it.
    fn point(&self) -> [f64; 3] {
        self.mean().map(f64::round)
    }
}

/// `Your Location is -790.65, 173.39, -12.01` → the three numbers.
pub(crate) fn loc_of(text: &str) -> Option<[f64; 3]> {
    let rest = text
        .strip_prefix("Your Location is ")?
        .trim_end_matches('.');
    let n: Vec<f64> = rest
        .split(',')
        .filter_map(|p| p.trim().parse().ok())
        .collect();
    (n.len() == 3).then(|| [n[0], n[1], n[2]])
}

/// `You say, 'Hail, a scout from zanivar'` → the name hailed.
fn hail_of(text: &str) -> Option<&str> {
    text.strip_prefix("You say, 'Hail, ")?.strip_suffix('\'')
}

struct Spot {
    mob: String,
    zone: String,
    /// In the order first seen.
    clusters: Vec<Cluster>,
}

#[derive(Default)]
pub struct MobLocs {
    last_loc: Option<(i64, [f64; 3])>,
    /// A con or hail waiting for the `/loc` after it.
    pending: Option<(String, i64)>,
    spots: HashMap<String, Spot>,
}

impl MobLocs {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// An unparsed line: a `/loc` (which may place a waiting target) or a hail. True when a point was kept.
    pub fn line(&mut self, ev: &Event, zone: Option<&str>) -> bool {
        let text = message_text_of(ev.raw());
        if let Some(p) = loc_of(text) {
            self.last_loc = Some((ev.ts(), p));
            return match self.pending.take() {
                Some((mob, at)) if ev.ts() - at <= LOC_PAIR_MS => self.record(&mob, p, zone),
                _ => false,
            };
        }
        hail_of(text).is_some_and(|mob| self.target(mob, ev.ts(), zone))
    }

    /// A con or a hail of `mob`: the `/loc` just before it, else the next one.
    pub fn target(&mut self, mob: &str, ts: i64, zone: Option<&str>) -> bool {
        match self.last_loc {
            Some((at, p)) if ts - at <= LOC_PAIR_MS => self.record(mob, p, zone),
            _ => {
                self.pending = Some((mob.to_string(), ts));
                false
            }
        }
    }

    fn record(&mut self, mob: &str, p: [f64; 3], zone: Option<&str>) -> bool {
        let spot = self
            .spots
            .entry(mob.to_lowercase())
            .or_insert_with(|| Spot {
                mob: mob.to_string(),
                zone: String::new(),
                clusters: Vec::new(),
            });
        spot.zone = zone.unwrap_or_default().to_string();
        let near = |c: &&mut Cluster| {
            let m = c.mean();
            (m[0] - p[0]).hypot(m[1] - p[1]) < CLUSTER_UNITS
        };
        // True when the served point moved: a /loc on the spot's mean changes nothing.
        match spot.clusters.iter_mut().find(near) {
            Some(c) => {
                let was = c.point();
                c.sum = [c.sum[0] + p[0], c.sum[1] + p[1], c.sum[2] + p[2]];
                c.n += 1.0;
                c.point() != was
            }
            None => {
                spot.clusters.push(Cluster { sum: p, n: 1.0 });
                true
            }
        }
    }

    /// `[{mob, zone, points: [[y, x, z], …]}]`, by mob.
    pub fn serve(&self) -> Value {
        let mut spots: Vec<&Spot> = self.spots.values().collect();
        spots.sort_by(|a, b| a.mob.cmp(&b.mob));
        Value::Array(
            spots
                .iter()
                .map(|s| json!({ "mob": s.mob, "zone": s.zone, "points": s.clusters.iter().map(Cluster::point).collect::<Vec<_>>() }))
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::MobLocs;
    use crate::event::Event;

    fn line(text: &str, ts: i64) -> Event<'static> {
        Event::from_json(&format!(
            r#"{{"kind":"unknown","ts":{ts},"seq":1,"raw":"[Sun Oct 18 20:02:54 2026] {text}"}}"#
        ))
        .expect("json")
    }

    #[test]
    fn loc_hail_loc_places_the_mob_and_a_far_off_con_does_not() {
        let mut m = MobLocs::default();
        m.line(
            &line("Your Location is -790.65, 173.39, -12.01", 0),
            Some("The Feerrott"),
        );
        assert!(m.line(
            &line("You say, 'Hail, a scout from zanivar'", 2_000),
            Some("The Feerrott")
        ));
        m.line(
            &line("Your Location is -790.65, 173.39, -12.01", 4_000),
            Some("The Feerrott"),
        );
        assert!(
            !m.target("a scout from zanivar", 6_000, Some("The Feerrott")),
            "the same point is kept once"
        );
        assert!(!m.target("a far mob", 120_000, None), "no /loc near it");
        assert!(
            m.line(&line("Your Location is 10.4, -20.6, 1", 125_000), None),
            "the next /loc places it"
        );
        let served = m.serve();
        assert_eq!(served[1]["mob"], "a scout from zanivar");
        assert_eq!(
            served[1]["points"],
            serde_json::json!([[-791.0, 173.0, -12.0]])
        );
        assert_eq!(served[0]["points"], serde_json::json!([[10.0, -21.0, 1.0]]));
    }

    /// Owner, 2026-11-10: two `/loc`s a few steps apart beside Scribe Noglleg are one spot, averaged;
    /// at his 20 units, a point 50 away (his second Noglleg `/loc`) is another spot.
    #[test]
    fn points_beside_one_mob_average_into_one_spot_and_a_far_point_is_another() {
        let mut m = MobLocs::default();
        m.line(&line("Your Location is -2058.60, 1935.27, 1.54", 0), Some("The Rathe Mountains"));
        assert!(m.target("Scribe Noglleg", 1_000, Some("The Rathe Mountains")));
        m.line(&line("Your Location is -2050.10, 1947.40, 2.04", 60_000), Some("The Rathe Mountains"));
        assert!(m.target("Scribe Noglleg", 61_000, Some("The Rathe Mountains")), "the mean moved");
        assert_eq!(m.serve()[0]["points"], serde_json::json!([[-2054.0, 1941.0, 2.0]]));
        m.line(&line("Your Location is -2054.35, 1941.33, 1.79", 120_000), Some("The Rathe Mountains"));
        assert!(!m.target("Scribe Noglleg", 121_000, Some("The Rathe Mountains")), "a /loc on the mean changes nothing");
        m.line(&line("Your Location is -2056.10, 1985.40, 2.04", 180_000), Some("The Rathe Mountains"));
        assert!(m.target("Scribe Noglleg", 181_000, Some("The Rathe Mountains")));
        assert_eq!(m.serve()[0]["points"], serde_json::json!([[-2054.0, 1941.0, 2.0], [-2056.0, 1985.0, 2.0]]), "44 units away is a second spot at 20");
    }
}
