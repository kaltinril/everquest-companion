//! The single parse pass.
//!
//! The cascade order below is semantic, not cosmetic: the resist family tests your own form before
//! the named-caster form because 712 spell names contain `'s`; the spell-landing emote is matched
//! last so it can never shadow a real family; item merges come after loot so an auto-merge on
//! pickup stays one combined loot event. Never reorder.

pub mod acquire;
pub mod casts;
pub mod combat;
pub mod data;
pub mod group;
pub mod melee;
pub mod miss;
pub mod needles;
pub mod session;
pub mod who;
pub mod world;

use crate::event::{Ev, Kind};
use crate::jsstr::is_js_space;
use crate::scan::memchr;
use crate::spelldb::SpellDb;
use crate::timestamp::Clock;
use std::cell::RefCell;
use std::sync::Arc;

/// JavaScript's four line terminators, the characters its `.` refuses (`jsstr::JS_DOT`), looked for
/// as bytes: U+2028 and U+2029 are `E2 80 A8` and `E2 80 A9`, and a valid UTF-8 string holds no
/// other byte run that spells them.
fn has_line_terminator(bytes: &[u8]) -> bool {
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\n' | b'\r' => return true,
            0xE2 if bytes.get(i + 1) == Some(&0x80)
                && matches!(bytes.get(i + 2), Some(&0xA8) | Some(&0xA9)) =>
            {
                return true;
            }
            _ => {}
        }
        i += 1;
    }
    false
}

/// The line pattern by hand: `^\[(.+?)\]\s?(.*)$` with JavaScript's `.` and `\s` (jsstr.rs),
/// answering the two groups. `None` is what the pattern's failure to match was: the line is no
/// event at all and takes no seq.
///
/// The backtracking is reproduced, not approximated. The lazy group stops at the first `]`, and
/// when the rest of the line cannot be matched from there it grows to the next `]`, and the next,
/// until either the rest matches or the group itself would have to cross a line terminator. The
/// optional whitespace admits two of the four terminators (CR and LF are in `\s`), which is the
/// one way a terminator survives on a line that still parses — pinned by a test below. (Measured
/// 2026-11-06: the regex was 840 ms of a 68 MB fold; this is a byte scan.)
fn split_line(raw: &str) -> Option<(&str, &str)> {
    let bytes = raw.as_bytes();
    if bytes.first() != Some(&b'[') {
        return None;
    }
    // The group is non-empty, so the earliest `]` that can close it is at index 2. `]` is ASCII
    // and never a continuation byte, so every candidate is a character boundary.
    let mut from = 2;
    // How far the group has been proven terminator-free; a terminator inside it ends the search,
    // since every later candidate would contain it too.
    let mut clean_to = 1;
    loop {
        let close = from + memchr(b']', bytes.get(from..)?)?;
        if has_line_terminator(&bytes[clean_to..close]) {
            return None;
        }
        clean_to = close;
        let rest = &raw[close + 1..];
        let text = match rest.chars().next() {
            Some(c) if is_js_space(c) => &rest[c.len_utf8()..],
            _ => rest,
        };
        if !has_line_terminator(text.as_bytes()) {
            return Some((&raw[1..close], text));
        }
        from = close + 1;
    }
}

/// One log line, pre-split. `text` is the message with the `[timestamp] ` prefix removed.
pub struct Ctx<'a> {
    pub text: &'a str,
    pub ts: i64,
    pub seq: i64,
    pub raw: &'a str,
    /// Which gate substrings the line carries, found in one pass (`needles.rs`).
    pub hits: needles::Hits,
}

impl Ctx<'_> {
    /// `self.text.contains(needle)`, answered from the one pass.
    #[inline]
    pub fn has(&self, n: needles::Needle) -> bool {
        self.hits.has(n)
    }
}

/// The parser, and everything a parse is a pure function of: the bytes, the spell DB, and the
/// character name. No globals outlive a parse.
///
/// The database is held by `Arc` rather than by value so two parsers in one process can be handed
/// the same one; held by value, every attach rebuilt the catalog at 386 ms in a release build.
pub struct Parser {
    clock: Clock,
    db: Option<Arc<SpellDb>>,
    character: Option<String>,
    /// The last stamp read and what it resolved to. The game writes many lines a second and every
    /// line of one second carries the same 24 bytes, so the regex and the zone lookup run once per
    /// second of play rather than once per line. (Measured 2026-11-06: 430 ms of a 68 MB fold.)
    stamp_memo: RefCell<Option<(String, i64)>>,
    needles: needles::Needles,
    combat: combat::CombatRes,
    casts: casts::CastRes,
    world: world::WorldRes,
    who: who::WhoRes,
    acquire: acquire::AcquireRes,
    group: group::GroupRes,
    /// Stamps that matched the line pattern but not the timestamp pattern. The app falls back to a
    /// bare `Date.parse` there, and this is how the comparator proves the corpus never needs it.
    pub unparsed_stamps: std::cell::Cell<u64>,
}

impl Parser {
    /// The effective spell DB this parser was built with. The fold's catalog probe must be the same
    /// database the parser emits `candidates` out of; two loads is two answers waiting to disagree
    /// after an overlay change.
    pub fn spell_db(&self) -> Option<&SpellDb> {
        // `as_deref` rather than `as_ref`: the `Arc` is how the catalog is held, never part of what
        // a caller is handed, so nothing downstream of this crate learns that it is shared.
        self.db.as_deref()
    }

    /// The clock this parser stamps with. The fold's epoch launch anchor is a local-time instant
    /// and must resolve through the same zone the events were parsed in; handing over the parser's
    /// own clock makes that true by construction rather than by two callers agreeing.
    pub fn clock(&self) -> &Clock {
        &self.clock
    }

    pub fn new(clock: Clock, db: Option<Arc<SpellDb>>, character: Option<String>) -> Self {
        Parser {
            clock,
            db,
            character,
            stamp_memo: RefCell::new(None),
            needles: needles::Needles::new(),
            combat: combat::CombatRes::new(),
            casts: casts::CastRes::new(),
            world: world::WorldRes::new(),
            who: who::WhoRes::new(),
            acquire: acquire::AcquireRes::new(),
            group: group::GroupRes::new(),
            unparsed_stamps: std::cell::Cell::new(0),
        }
    }

    /// Parse one raw log line into a canonical event, or `false` if it isn't a timestamped log line.
    /// `seq` is stamped onto the event by the feeder.
    pub fn parse_event(&self, raw: &str, seq: i64, out: &mut Ev) -> bool {
        let Some((stamp, text)) = split_line(raw) else {
            return false;
        };
        let ts = self.timestamp(stamp);
        if ts == 0 {
            self.unparsed_stamps.set(self.unparsed_stamps.get() + 1);
        }
        let hits = self.needles.scan(text);
        let c = Ctx {
            text,
            ts,
            seq,
            raw,
            hits,
        };
        self.classify(&c, out);
        true
    }

    /// `Clock::parse_eq_timestamp`, memoized on the stamp's exact bytes — see `stamp_memo`.
    fn timestamp(&self, stamp: &str) -> i64 {
        let mut memo = self.stamp_memo.borrow_mut();
        if let Some((last, ts)) = memo.as_ref() {
            if last == stamp {
                return *ts;
            }
        }
        let ts = self.clock.parse_eq_timestamp(stamp);
        match memo.as_mut() {
            Some((last, at)) => {
                last.clear();
                last.push_str(stamp);
                *at = ts;
            }
            None => *memo = Some((stamp.to_string(), ts)),
        }
        ts
    }

    /// The ordered line-shape cascade. Each entry is offered the line and either claims it or
    /// declines; a line matching nothing is `unknown`.
    fn classify(&self, c: &Ctx, out: &mut Ev) {
        let db = self.db.as_deref();
        let name = self.character.as_deref();
        let claimed = combat::classify_miss(&self.combat, c, out)
            || combat::classify_mitigation(&self.combat, c, out)
            || combat::classify_resist(&self.combat, c, out)
            || combat::classify_damage(&self.combat, c, out)
            || combat::classify_heal(&self.combat, c, out)
            || world::classify_consider(&self.world, c, out)
            || casts::classify_cast_lifecycle(&self.casts, c, out)
            || casts::classify_charm(&self.casts, db, c, out)
            || casts::classify_worn_off(&self.casts, db, c, out)
            || casts::classify_cc_apply(&self.casts, db, c, out)
            || casts::classify_cc_wake(&self.casts, c, out)
            || casts::classify_pet_claim(&self.casts, c, out)
            || casts::classify_pet_say(&self.casts, c, out)
            || casts::classify_pet_leader(&self.casts, name, c, out)
            || casts::classify_ally_pet_leader(&self.casts, name, c, out)
            || world::classify_death(&self.world, c, out)
            || world::classify_zone(&self.world, c, out)
            || world::classify_instance_create(&self.world, c, out)
            || session::classify_session_start(c, out)
            || session::classify_camp(c, out)
            || session::classify_output_file(c, out)
            || group::classify_group(&self.group, c, out)
            || world::classify_loot(&self.world, &self.acquire, c, out)
            || world::classify_item_merge(&self.world, c, out)
            || acquire::classify_acquire(&self.acquire, c, out)
            || world::classify_turn_in(&self.world, c, out)
            || world::classify_level(&self.world, c, out)
            || world::classify_exp(&self.world, c, out)
            || world::classify_aa(&self.world, c, out)
            || world::classify_aa_potion(c, out)
            || casts::classify_aa_activate(&self.casts, c, out)
            || casts::classify_stance(&self.casts, c, out)
            || casts::classify_spell_gems(&self.casts, c, out)
            || who::classify_self_who(&self.who, name, c, out)
            || who::classify_skill_up(&self.who, c, out)
            || who::classify_special_attack(&self.who, c, out)
            || who::classify_class_unlock(c, out)
            || casts::classify_illusion_fade(c, out)
            || casts::classify_poison_coat(&self.casts, c, out)
            || casts::classify_poison_proc(&self.casts, c, out)
            || casts::classify_db_buff(db, c, out)
            || who::classify_item_activate(&self.who, c, out)
            || casts::classify_spell_emote(&self.casts, c, out);
        if !claimed {
            out.begin(Kind::Unknown);
            out.envelope(c.seq, c.ts, c.raw);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The pattern `split_line` replaces, kept here as the oracle it is measured against.
    fn line_re() -> regex::Regex {
        regex::Regex::new(&format!(
            r"^\[({d}+?)\]{s}?({d}*)$",
            d = crate::jsstr::JS_DOT,
            s = crate::jsstr::JS_S
        ))
        .unwrap()
    }

    fn by_regex(raw: &str) -> Option<(String, String)> {
        let m = line_re().captures(raw)?;
        Some((m[1].to_string(), m[2].to_string()))
    }

    #[test]
    fn the_hand_rolled_split_answers_exactly_what_the_pattern_did() {
        let lines = [
            "[Wed Aug 19 16:21:47 2026] You are not currently assigned to an adventure.",
            "[Wed Aug 19 16:21:47 2026]Welcome",
            "[Wed Aug 19 16:21:47 2026]  two spaces",
            "[Wed Aug 19 16:21:47 2026]\u{A0}nbsp then text",
            "[Wed Aug 19 16:21:47 2026]\u{FEFF}bom then text",
            "[Wed Aug 19 16:21:47 2026]\rWelcome to EverQuest Legends!",
            "[Wed Aug 19 16:21:47 2026]\n",
            "[Wed Aug 19 16:21:47 2026]\u{2028}",
            "[Wed Aug 19 16:21:47 2026]",
            "[Wed Aug 19 16:21:47 2026] a]b]c",
            "[Sun Aug 16 20:09:40 2026] Velkator tells general2:1, 'rebaseline\rCount items from'",
            "[Sun Aug 16 20:09:40 2026] line with \u{2029} inside",
            "[a]b]\rc",
            "[a]b]\rc]d",
            "[a\rb]c",
            "[]",
            "[]]",
            "[]x]",
            "[x]",
            "[",
            "",
            "no bracket here",
            " [Wed Aug 19 16:21:47 2026] leading space",
            "[Wed Aug 19 16:21:47 2026] ünïcödé mob ]]] name",
            "[é]ü",
            "[\u{2028}]x",
            "[x]\u{2028}y]z",
        ];
        for raw in lines {
            let expected = by_regex(raw);
            let got = split_line(raw).map(|(a, b)| (a.to_string(), b.to_string()));
            assert_eq!(got, expected, "{raw:?}");
        }
    }

    #[test]
    fn the_stamp_memo_answers_the_same_instant_for_a_repeated_stamp_and_moves_on_a_new_one() {
        let p = Parser::new(
            Clock::new(chrono_tz::America::Los_Angeles),
            None,
            Some("Primitive".to_string()),
        );
        let a = p.timestamp("Wed Aug 19 16:21:47 2026");
        assert_eq!(a, 1_787_181_707_000);
        assert_eq!(p.timestamp("Wed Aug 19 16:21:47 2026"), a);
        let b = p.timestamp("Wed Aug 19 16:21:48 2026");
        assert_eq!(b, a + 1000);
        assert_eq!(p.timestamp("Wed Aug 19 16:21:47 2026"), a);
        // A stamp the pattern declines is 0 every time it is asked, memoized or not.
        assert_eq!(p.timestamp("not a stamp"), 0);
        assert_eq!(p.timestamp("not a stamp"), 0);
    }
}
