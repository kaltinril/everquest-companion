//! `src/main/modules/leveling.ts` — level-ups, AA gains, AA spends and AA-potion quaffs, all four
//! append-only and in log order (the unspent/net-spent math the view does depends on that order).
//!
//! Beside them, the latest `/alt list` run and the AAs seen activated (`leveling_aa.rs`): ownership
//! evidence for AAs bought before the log reaches.
//!
//! The potion is deliberately not persisted: the quaff is a log line, so a relaunch replays it and
//! re-derives the charge state exactly.

use super::leveling_aa::{fold_list_line, fold_used, AaActivation, AaListRun};
use crate::event::{Event, Kind};
use crate::EqModule;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize)]
pub struct LevelRow {
    ts: i64,
    level: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AaGainRow {
    ts: i64,
    amount: i64,
    now_have: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AaSpendRow {
    ts: i64,
    ability: String,
    cost: i64,
    /// Only the `You have improved X <rank>` shape states one; omitted otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    rank: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AaPotionRow {
    ts: i64,
}

#[derive(Default)]
pub struct LevelingModule {
    levels: Vec<LevelRow>,
    aa_gains: Vec<AaGainRow>,
    aa_spends: Vec<AaSpendRow>,
    aa_potions: Vec<AaPotionRow>,
    aa_list: Option<AaListRun>,
    aa_activations: Vec<AaActivation>,
    /// The last zone-in, for the next list run's `zoneBefore`. Not published.
    last_zone: Option<i64>,
    seq: i64,
    /// The announce cursor — see [`crate::announce`]. Moved only by an arm that changed what this
    /// module publishes (`on_event`); every other log line leaves it untouched.
    announce: crate::announce::Announce,
}

impl LevelingModule {
    pub fn new() -> Self {
        Self::default()
    }
}

impl EqModule for LevelingModule {
    fn id(&self) -> &'static str {
        "leveling"
    }

    fn reset(&mut self) {
        self.levels.clear();
        self.aa_gains.clear();
        self.aa_spends.clear();
        self.aa_potions.clear();
        self.aa_list = None;
        self.aa_activations.clear();
        self.last_zone = None;
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        // Each arm answers whether it changed what this module publishes: the four appends and the
        // clear always do; a list line or an activation only when the published state moved.
        let published = match ev.kind_of() {
            // Character rebirth: the prior epoch's levels and AA belong to a dead same-name
            // character, and the AA identity (allocated/unspent/earned) holds only without them.
            Kind::Epoch => {
                self.levels.clear();
                self.aa_gains.clear();
                self.aa_spends.clear();
                self.aa_potions.clear();
                self.aa_list = None;
                self.aa_activations.clear();
                true
            }
            Kind::Level => {
                self.levels.push(LevelRow {
                    ts: ev.ts(),
                    level: ev.int("level").unwrap_or(0),
                });
                true
            }
            Kind::AaGain => {
                self.aa_gains.push(AaGainRow {
                    ts: ev.ts(),
                    amount: ev.int("amount").unwrap_or(0),
                    now_have: ev.int("nowHave").unwrap_or(0),
                });
                true
            }
            Kind::AaSpend => {
                self.aa_spends.push(AaSpendRow {
                    ts: ev.ts(),
                    ability: ev.str("ability").unwrap_or_default().to_string(),
                    cost: ev.int("cost").unwrap_or(0),
                    rank: ev.int("rank"),
                });
                true
            }
            Kind::AaPotion => {
                self.aa_potions.push(AaPotionRow { ts: ev.ts() });
                true
            }
            Kind::AaList => fold_list_line(&mut self.aa_list, ev, self.last_zone),
            Kind::AaActivate | Kind::AaOwned | Kind::CastBegin | Kind::Damage => {
                fold_used(&mut self.aa_activations, ev)
            }
            Kind::Zone => {
                self.last_zone = Some(ev.ts());
                false
            }
            _ => false,
        };
        if published {
            self.announce.changed(self.seq);
        }
    }

    /// Moves on a ding, an AA line or a rebirth. See the `announce` field.
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        json!({
            "seq": self.seq,
            "state": {
                "levels": self.levels,
                "aaGains": self.aa_gains,
                "aaSpends": self.aa_spends,
                "aaPotions": self.aa_potions,
                "aaList": self.aa_list,
                "aaActivations": self.aa_activations
            }
        })
    }
}
