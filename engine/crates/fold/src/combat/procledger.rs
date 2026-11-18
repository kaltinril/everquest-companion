//! The proc ledger a segment's aggregate carries: Strike, poison and dispel lanes, the coats
//! applied, and the swing and active-time denominators a proc rate is read against.

use crate::combat::procdetect::{add_spell_proc, SpellProcFold, SpellProcLane};
use crate::jsmap::JsMap;
use std::collections::HashSet;

/// A rogue-poison Strike lane. Keyed by the display name, ambiguity included — an emote shared by
/// two Strikes keeps both in one ` / `-joined label. The count is exact, the name may not be.
#[derive(Debug, Clone)]
pub struct StrikeLane {
    pub name: String,
    /// The canon key of every Strike the label may name (`strike_keys`), fixed with the label.
    pub keys: Vec<String>,
    pub count: i64,
    pub ambiguous: bool,
}

/// An emote label may name several Strikes — one emote sentence is shared by two venoms — and the
/// ledger keeps both in one ` / `-joined label. Every candidate is joined against the damage lanes
/// and every candidate suppresses its spell-proc twin.
pub fn strike_keys(label: &str) -> Vec<String> {
    label
        .split(" / ")
        .map(|n| eqlog::names::spell_canon_key(n.trim()))
        .collect()
}

/// A poison-typed damage lane. The game states the damage type on every typed spell line, so this
/// is printed fact rather than a name-matched guess. An index over damage already counted.
#[derive(Debug, Clone)]
pub struct PoisonLane {
    pub name: String,
    pub count: i64,
    pub total: i64,
}

/// A dispel landing lane. Every one is ambiguous by construction — each message tier is shared by
/// 2–3 spells.
#[derive(Debug, Clone)]
pub struct DispelLane {
    pub name: String,
    pub count: i64,
}

/// One coat applied inside a segment, in order.
#[derive(Debug, Clone)]
pub struct CoatMark {
    pub poison: String,
    pub ts: i64,
}

/// The per-segment proc accumulator. Pure counters, incremented on ingest from lines the game
/// printed, so a downsampled or truncated timeline can never move a number here.
#[derive(Debug, Default)]
pub struct ProcAccum {
    pub strikes: JsMap<StrikeLane>,
    /// Weakening-Strike landings — broken out because it is the one we time.
    pub slow_lands: i64,
    /// Absolute ts of the first slow landing in this segment (0 = none).
    pub first_slow_ts: i64,
    pub poison_damage: JsMap<PoisonLane>,
    pub dispels: JsMap<DispelLane>,
    /// Your coats applied inside this segment, in order.
    pub coats: Vec<CoatMark>,
    pub stance_switches: i64,
    pub invocation_switches: i64,
    /// Your logged swing attempts here: melee + slay hits, plus your misses. The mechanical
    /// denominator for a chance-on-hit proc rate. The log does not distinguish main-hand from
    /// off-hand or double/triple attack, so this is swings as logged.
    pub swings: i64,
    /// `<kind>:<key>` → how many of those swings were logged while that state was open. The other
    /// half of a link: "it never fired without it" is evidence only in proportion to the swings
    /// there were without it.
    pub swings_by_state: JsMap<i64>,
    /// Ms of the meter's own active time that elapsed while a state was open — the PPM denominator
    /// for a lane whose source window is known. Folded from the same per-hit delta the window ledger
    /// receives, so the two cannot drift.
    pub active_ms_by_state: JsMap<i64>,
    /// Cast-less spell lanes, keyed by `spell_canon_key`. Their damage is already inside this
    /// segment's outgoing total — an index, never a second accumulation.
    pub spell_procs: JsMap<SpellProcLane>,
}

impl ProcAccum {
    /// Count one of your logged swing attempts against the states open when you made it. The total
    /// and the per-state split move together so no call site can update one without the other.
    pub fn add_swing(&mut self, active: &HashSet<String>) {
        self.swings += 1;
        for key in active {
            bump_state(&mut self.swings_by_state, key, 1);
        }
    }

    /// Charge one hit's active-time delta to every state open for it. Called on every folded damage
    /// line, incoming included, because that is what the meter's own `active_ms` counts — the two
    /// denominators must mean the same thing to be comparable.
    pub fn add_active_ms(&mut self, ms: i64, active: &HashSet<String>) {
        if ms <= 0 {
            return;
        }
        for key in active {
            bump_state(&mut self.active_ms_by_state, key, ms);
        }
    }

    pub fn add_spell_proc(&mut self, f: &SpellProcFold) {
        add_spell_proc(&mut self.spell_procs, f);
    }

    pub fn add_strike(&mut self, name: &str, ambiguous: bool, ts: i64, is_slow: bool) {
        if !self.strikes.contains_key(name) {
            self.strikes.insert(
                name.to_string(),
                StrikeLane {
                    name: name.to_string(),
                    keys: strike_keys(name),
                    count: 0,
                    ambiguous,
                },
            );
        }
        self.strikes.get_mut(name).expect("just inserted").count += 1;
        if is_slow {
            self.slow_lands += 1;
            if self.first_slow_ts == 0 {
                self.first_slow_ts = ts;
            }
        }
    }

    pub fn add_poison_damage(&mut self, skill: &str, amount: i64) {
        if !self.poison_damage.contains_key(skill) {
            self.poison_damage.insert(
                skill.to_string(),
                PoisonLane {
                    name: skill.to_string(),
                    count: 0,
                    total: 0,
                },
            );
        }
        let s = self.poison_damage.get_mut(skill).expect("just inserted");
        s.count += 1;
        s.total += amount;
    }

    pub fn add_dispel(&mut self, label: &str) {
        if !self.dispels.contains_key(label) {
            self.dispels.insert(
                label.to_string(),
                DispelLane {
                    name: label.to_string(),
                    count: 0,
                },
            );
        }
        self.dispels.get_mut(label).expect("just inserted").count += 1;
    }
}

fn bump_state(map: &mut JsMap<i64>, key: &str, by: i64) {
    *map.get_or_insert_with(key, || 0) += by;
}
