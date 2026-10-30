//! Your weapon swing cadence, for the swing timer overlay: the whole seconds in which you swung a
//! weapon, newest last. The cadence estimate is the renderer's (`src/shared/swingTimer.ts`).
//!
//! What the log can give and no more. A stamp is a whole second, so one swing is known to the
//! second it fell in. Main hand and off hand share a verb (`rounds.rs` says so), so with two weapons
//! this is both hands' combined cadence. Reuse-timer skills (kick, bash, backstab, strike, the
//! `reave` special), ranged, frenzy and flurry are not weapon swings and are left out, and so is an
//! extra swing the line marks as one (riposte, flurry, rampage).

use crate::combat::rounds::extra_swing_mod;
use crate::combat::state::EngineState;
use crate::event::{Event, Key};
use eqlog::names::id_key_ref;
use eqlog::parse::combat::melee_skill;
use std::collections::VecDeque;

/// How many swing seconds are kept: enough for a stable cadence, recent enough to follow a haste.
pub const SWING_CAP: usize = 32;

#[derive(Debug, Default)]
pub struct SwingTrack {
    rounds: VecDeque<i64>,
}

impl SwingTrack {
    /// One swing second. Several swings in one second are one round.
    pub fn note(&mut self, ts: i64) {
        if self.rounds.back().is_some_and(|&t| t >= ts) {
            return;
        }
        self.rounds.push_back(ts);
        if self.rounds.len() > SWING_CAP {
            self.rounds.pop_front();
        }
    }

    pub fn rounds(&self) -> Vec<i64> {
        self.rounds.iter().copied().collect()
    }
}

/// A weapon swing: a melee verb the parser files under `Melee` or `Cleave`, other than an SK's
/// `reave`, on a line that does not mark it as an extra swing.
fn weapon_swing(verb: Option<&str>, modifiers: &[&str]) -> bool {
    let Some(verb) = verb else {
        return false;
    };
    let weapon = matches!(melee_skill(verb), "Melee" | "Cleave");
    let extra = modifiers
        .iter()
        .any(|m| extra_swing_mod(&m.to_lowercase()).is_some());
    weapon && !verb.eq_ignore_ascii_case("reave") && !extra
}

/// A landed melee line or an avoided swing (`You try to slash …`): kept when it is your weapon.
pub fn note(st: &mut EngineState, ev: &Event) {
    let attacker = ev.str(Key::Attacker).unwrap_or_default();
    if id_key_ref(attacker) != "you" || ev.str(Key::Dtype).is_some_and(|d| d != "melee") {
        return;
    }
    if weapon_swing(ev.str(Key::Verb), &ev.arr_str(Key::Modifiers)) {
        st.swings.note(ev.ts());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weapon_verbs_count_and_timed_skills_do_not() {
        assert!(weapon_swing(Some("slash"), &[]));
        assert!(weapon_swing(Some("punch"), &["Critical"]));
        assert!(weapon_swing(Some("cleave"), &[]));
        for v in [
            "kick", "bash", "backstab", "strike", "reave", "shoot", "frenzy",
        ] {
            assert!(!weapon_swing(Some(v), &[]), "{v}");
        }
        assert!(!weapon_swing(Some("slash"), &["Riposte"]));
        assert!(!weapon_swing(None, &[]));
    }

    #[test]
    fn one_second_is_one_round_and_the_ring_is_capped() {
        let mut s = SwingTrack::default();
        s.note(1_000);
        s.note(1_000);
        s.note(3_000);
        assert_eq!(s.rounds(), vec![1_000, 3_000]);
        for i in 0..100 {
            s.note(10_000 + i * 1_000);
        }
        assert_eq!(s.rounds().len(), SWING_CAP);
    }
}
