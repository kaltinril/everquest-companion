//! Misses, mitigation, resists, the damage battery and heals.
//!
//! Every regex below is its app twin with three mechanical substitutions and no others: `\d` →
//! `[0-9]`, `\w` → `[0-9A-Za-z_]` and `\s` → the ECMA class (see jsstr.rs). Those three are
//! ASCII-only in JavaScript and Unicode-aware in the `regex` crate, and a mob name with a
//! non-ASCII letter is exactly the line that would part company.

use super::dot::{dot_source, has_critical_word, strip_possessive};
use crate::event::{Ev, Key, Kind};
use crate::names::norm;
use crate::taxonomy::{damage_category, has_critical, parse_modifiers};
use regex::Regex;
use std::borrow::Cow;

use super::needles::Needle;
use super::Ctx;

/// The melee verbs, first- and third-person, are `melee.rs`'s tables: the melee line is split by
/// hand there, and the two patterns it replaces are that file's test oracle. The miss line is
/// `miss.rs`'s the same way, its three patterns that file's oracle.
pub struct CombatRes {
    spell: Regex,
    ds: Regex,
    ds_inc: Regex,
    dot: Regex,
    dot_nocaster: Regex,
    sourceless: Regex,
    heal: Regex,
    mend: Regex,
    rune_gain: Regex,
    skin_absorb_blow: Regex,
    skin_absorb_ds: Regex,
    resist_yours: Regex,
    resist_caster: Regex,
    resist_incoming: Regex,
    reflexive: Regex,
}

impl Default for CombatRes {
    fn default() -> Self {
        Self::new()
    }
}

impl CombatRes {
    pub fn new() -> Self {
        CombatRes {
            spell: Regex::new(
                r"^(.+?) (?:hits?) (.+?) for ([0-9]+) points of ([0-9A-Za-z_-]+) damage by (.+?)\.(?: \((.+?)\))?$",
            )
            .unwrap(),
            ds: Regex::new(
                r"^(.+?) is [0-9A-Za-z_]+ by (YOUR|.+?'s) (.+?) for ([0-9]+) points? of non-melee damage\.$",
            )
            .unwrap(),
            ds_inc: Regex::new(
                r"^YOU are [0-9A-Za-z_]+ by (.+?)'s (.+?) for ([0-9]+) points? of non-melee damage!$",
            )
            .unwrap(),
            dot: Regex::new(r"^(.+?) ha(?:s|ve) taken ([0-9]+) damage from (.+?)\.(?: \((.+?)\))?$")
                .unwrap(),
            dot_nocaster: Regex::new(
                r"^(.+?) has taken ([0-9]+) damage by (.+?)\.(?: \((.+?)\))?$",
            )
            .unwrap(),
            // Engine-only: the app parser this file was ported from never read this line.
            sourceless: Regex::new(r"^You were hit by non-melee for ([0-9]+) damage\.$").unwrap(),
            heal: Regex::new(
                r"^(.+?) healed (.+?)( over time)? for ([0-9]+)(?: \(([0-9]+)\))? hit points?(?: by (.+?))?\.(?: \(([A-Za-z][A-Za-z ]*)\))?$",
            )
            .unwrap(),
            mend: Regex::new(r"^You mend your wounds and heal some damage\.$").unwrap(),
            rune_gain: Regex::new(r"^You gain a rune for ([0-9]+) points? of absorption\.$")
                .unwrap(),
            skin_absorb_blow: Regex::new(
                r"^(.+?) tr(?:y|ies) to [0-9A-Za-z_]+ (?:on )?YOU, but YOUR magical skin absorbs the blow!(?: \([A-Za-z ]+\))?$",
            )
            .unwrap(),
            skin_absorb_ds: Regex::new(
                r"^YOUR magical skin absorbs the damage of (.+?)'s .+\.$",
            )
            .unwrap(),
            resist_yours: Regex::new(r"^(.+?) resisted your (.+?)!$").unwrap(),
            resist_caster: Regex::new(r"^(.+?) resisted (.+?)'s (.+?)!$").unwrap(),
            resist_incoming: Regex::new(r"^You resist(?:ed)? (.+?)'s (.+?)!$").unwrap(),
            reflexive: Regex::new(r"(?i)^(itself|himself|herself|themselves)$").unwrap(),
        }
    }
}

/// The base (first-person) form of every melee verb (`melee.rs`).
pub(crate) const MELEE_VERB_BASES: [&str; 26] = [
    "hit", "slash", "pierce", "crush", "bash", "kick", "bite", "claw", "gore", "maul", "punch",
    "strike", "slice", "backstab", "slam", "sting", "rend", "smash", "gnaw", "lash", "smite",
    "cleave", "reave", "shoot", "frenzy", "flurry",
];

/// Lowercasing is the identity on a string with no ASCII uppercase and nothing outside ASCII —
/// which is every verb a regex here hands over, since the alternations are spelled in lowercase.
/// The two helpers below take that string as it is and lowercase only anything else.
fn already_lower(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii() && !b.is_ascii_uppercase())
}

/// Un-conjugate: longest suffix rule first, each confirmed against the base set.
pub fn melee_verb_base(verb: &str) -> Cow<'_, str> {
    if already_lower(verb) {
        return Cow::Borrowed(melee_verb_base_lower(verb));
    }
    let v = verb.to_lowercase();
    Cow::Owned(melee_verb_base_lower(&v).to_string())
}

/// [`melee_verb_base`] over an already-lowercased verb; the answer is a base from the table or
/// the verb itself.
fn melee_verb_base_lower(v: &str) -> &str {
    if v.starts_with("frenz") {
        return "frenzy";
    }
    if v.starts_with("flurr") {
        return "flurry";
    }
    if MELEE_VERB_BASES.contains(&v) {
        return v;
    }
    if let Some(stem) = v.strip_suffix("es") {
        if MELEE_VERB_BASES.contains(&stem) {
            return stem;
        }
    }
    if let Some(stem) = v.strip_suffix('s') {
        if MELEE_VERB_BASES.contains(&stem) {
            return stem;
        }
    }
    v
}

/// A named class skill gets its own lane; a weapon-in-a-hand verb shares one.
pub fn melee_skill(verb: &str) -> &'static str {
    if already_lower(verb) {
        return melee_skill_lower(verb);
    }
    melee_skill_lower(&verb.to_lowercase())
}

fn melee_skill_lower(v: &str) -> &'static str {
    if v.starts_with("backstab") {
        return "Backstab";
    }
    if v.starts_with("bash") {
        return "Bash";
    }
    if v.starts_with("kick") {
        return "Kick";
    }
    if v.starts_with("cleav") {
        return "Cleave";
    }
    if v.starts_with("smite") {
        return "Smite";
    }
    if v.starts_with("shoot") {
        return "Ranged";
    }
    if v.starts_with("strike") {
        return "Strike";
    }
    if v.starts_with("frenz") {
        return "Frenzy";
    }
    if v.starts_with("flurr") {
        return "Flurry";
    }
    "Melee"
}

/// The damage-shield reading of a line: six fields that travel together.
struct Dmg<'a> {
    attacker: &'a str,
    target: &'a str,
    amount: i64,
    dtype: &'a str,
    skill: &'a str,
    crit: bool,
}

/// The damage-shield shape, which carries no paren modifier and maps its category 1:1.
fn dmg(c: &Ctx, out: &mut Ev, spec: Dmg<'_>) {
    out.begin(Kind::Damage);
    out.envelope(c.seq, c.ts, c.raw);
    out.s(Key::Attacker, spec.attacker);
    out.s(Key::Target, spec.target);
    out.i(Key::Amount, spec.amount);
    out.s(Key::Dtype, spec.dtype);
    out.s(Key::Skill, spec.skill);
    out.b(Key::Crit, spec.crit);
    // The empty list needs an element type because `damage_category` is element-generic.
    out.s(Key::Category, damage_category(spec.dtype, &[] as &[&str]));
}

/// The miss type of a defence verb in either person: `parries`/`parry` → `parry`, and so on;
/// anything else is a block.
fn avoid_type(verb: &str) -> &'static str {
    if verb.starts_with("parr") {
        "parry"
    } else if verb.starts_with("dodge") {
        "dodge"
    } else if verb.starts_with("riposte") {
        "riposte"
    } else {
        "block"
    }
}

/// Misses / avoided swings (by far the most common combat line).
pub fn classify_miss(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    if !(c.has(Needle::ButComma) && (c.text.starts_with("You try to ") || c.has(Needle::TriesTo))) {
        return false;
    }
    if let Some(m) = super::miss::split(c.text) {
        use super::miss::Outcome;
        let attacker = norm(m.attacker);
        let (mtype, target): (&str, Cow<str>) = match m.outcome {
            Outcome::Miss => ("miss", norm(m.target)),
            Outcome::Defended(defender, verb) => (avoid_type(verb), norm(defender)),
            // The base form is the miss type.
            Outcome::YouDefended(verb) => (avoid_type(verb), Cow::Borrowed("You")),
            // Self rune absorb: YOUR skin means the swing was aimed at you.
            Outcome::YourSkinAbsorbs => ("absorb", Cow::Borrowed("You")),
            Outcome::SkinAbsorbs => ("absorb", norm(m.target)),
        };
        out.begin(Kind::Miss);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Attacker, &attacker);
        out.s(Key::Target, &target);
        out.s(Key::Mtype, mtype);
        // Verb then modifiers, each written only when present. The verb is the first on the
        // line, as the separate rescan found it (`miss::first_verb`).
        if let Some(v) = super::miss::first_verb(c.text) {
            out.s(Key::Verb, &melee_verb_base(v));
        }
        if let Some(md) = m.modifier {
            out.strs(Key::Modifiers, &parse_modifiers(Some(md)));
        }
        return true;
    }
    // The miss pattern declined: the safety net for a compound trailing modifier its single-word
    // tail rejects.
    if let Some(a) = r.skin_absorb_blow.captures(c.text) {
        out.begin(Kind::Mitigation);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Mtype, "absorbSwing");
        out.s(Key::Source, &norm(&a[1]));
        return true;
    }
    false
}

/// Absorption / mitigation — rune grants + absorbed damage-shield ticks.
pub fn classify_mitigation(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    if c.text.starts_with("You gain a rune for ") {
        if let Some(m) = r.rune_gain.captures(c.text) {
            out.begin(Kind::Mitigation);
            out.envelope(c.seq, c.ts, c.raw);
            out.s(Key::Mtype, "rune");
            out.i(Key::Amount, m[1].parse().unwrap_or(0));
            return true;
        }
    }
    if c.text
        .starts_with("YOUR magical skin absorbs the damage of ")
    {
        if let Some(m) = r.skin_absorb_ds.captures(c.text) {
            out.begin(Kind::Mitigation);
            out.envelope(c.seq, c.ts, c.raw);
            out.s(Key::Mtype, "absorbDamageShield");
            out.s(Key::Source, &norm(&m[1]));
            return true;
        }
    }
    false
}

/// Spell resists — the caster-side "miss".
pub fn classify_resist(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    let text = c.text;
    if !(c.has(Needle::Resist) && !c.has(Needle::PointsOf) && text.ends_with('!')) {
        return false;
    }
    if text.starts_with("You resist") {
        if let Some(m) = r.resist_incoming.captures(text) {
            out.begin(Kind::Resist);
            out.envelope(c.seq, c.ts, c.raw);
            out.s(Key::Caster, &norm(&m[1]));
            out.s(Key::Target, "You");
            out.s(Key::Spell, crate::jsstr::js_trim(&m[2]));
            out.b(Key::Incoming, true);
            return true;
        }
        return false;
    }
    // The possessive-YOUR form first: 712 spell names contain `'s`.
    if let Some(m) = r.resist_yours.captures(text) {
        out.begin(Kind::Resist);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Caster, "you");
        out.s(Key::Target, &norm(&m[1]));
        out.s(Key::Spell, crate::jsstr::js_trim(&m[2]));
        out.b(Key::Incoming, false);
        return true;
    }
    if let Some(m) = r.resist_caster.captures(text) {
        out.begin(Kind::Resist);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Caster, &norm(&m[2]));
        out.s(Key::Target, &norm(&m[1]));
        out.s(Key::Spell, crate::jsstr::js_trim(&m[3]));
        out.b(Key::Incoming, false);
        return true;
    }
    false
}

/// The "points of damage" half of the battery: damage shield, spell nuke, melee.
fn points_damage(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    let text = c.text;
    // Each shape's pattern needs a substring the other shapes' lines never carry, so a line is
    // offered only to the shapes it could match, in the same order as before: the two damage-shield
    // sentences end in "non-melee damage", a typed spell hit says " damage by ", a melee hit ends
    // its sentence " of damage.". (Measured 2026-11-06: the three refusals ahead of every melee
    // line were ~300 ms of a 68 MB fold.)
    // Of the two damage-shield sentences the outgoing one ends in `.` and the incoming one in
    // `!`, so the terminal byte says which pattern could match at all.
    let non_melee = c.has(Needle::NonMeleeDamage);
    if non_melee && text.ends_with('.') {
        if let Some(m) = r.ds.captures(text) {
            return ds_damage(c, out, &m);
        }
    } else if non_melee && text.ends_with('!') {
        if let Some(m) = r.ds_inc.captures(text) {
            dmg(
                c,
                out,
                Dmg {
                    attacker: &norm(&m[1]),
                    target: "You",
                    amount: m[3].parse().unwrap_or(0),
                    dtype: "ds",
                    skill: crate::jsstr::js_trim(&m[2]),
                    crit: false,
                },
            );
            return true;
        }
    }
    if c.has(Needle::DamageBy) {
        if let Some(m) = r.spell.captures(text) {
            return spell_damage(c, out, &m);
        }
    }
    if c.has(Needle::OfDamageStop) {
        if let Some(hit) = super::melee::split(text) {
            return melee_damage(c, out, &hit);
        }
    }
    false
}

/// The damage-shield sentence (`<target> is burned by YOUR/<owner>'s <skill> for N points of
/// non-melee damage.`).
fn ds_damage(c: &Ctx, out: &mut Ev, m: &regex::Captures<'_>) -> bool {
    {
        let owner_group = &m[2];
        let owner: Cow<str> = if owner_group == "YOUR" {
            Cow::Borrowed("You")
        } else {
            norm(strip_possessive(owner_group))
        };
        dmg(
            c,
            out,
            Dmg {
                attacker: &owner,
                target: &norm(&m[1]),
                amount: m[4].parse().unwrap_or(0),
                dtype: "ds",
                skill: crate::jsstr::js_trim(&m[3]),
                crit: false,
            },
        );
        true
    }
}

/// The typed spell hit (`<caster> hits <target> for N points of <class> damage by <spell>.`).
fn spell_damage(c: &Ctx, out: &mut Ev, m: &regex::Captures<'_>) -> bool {
    {
        let modifier = m.get(6).map(|g| g.as_str());
        let mods = parse_modifiers(modifier);
        out.begin(Kind::Damage);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Attacker, &norm(&m[1]));
        out.s(Key::Target, &norm(&m[2]));
        out.i(Key::Amount, m[3].parse().unwrap_or(0));
        out.s(Key::Dtype, "spell");
        out.s(Key::Dclass, &m[4]);
        out.s(Key::Skill, crate::jsstr::js_trim(&m[5]));
        out.b(Key::Crit, has_critical(&mods));
        out.s_opt(Key::Modifier, modifier);
        out.strs(Key::Modifiers, &mods);
        out.s(Key::Category, damage_category("spell", &mods));
        true
    }
}

/// The melee hit (`<attacker> <verb> <target> for N points of damage.`). The verb is the FIRST
/// conjugated verb on the line (`melee::first_verb`), as the separate pattern found it.
fn melee_damage(c: &Ctx, out: &mut Ev, hit: &super::melee::Hit<'_>) -> bool {
    {
        let modifier = hit.modifier;
        let mods = parse_modifiers(modifier);
        let verb = melee_verb_base(super::melee::first_verb(c.text).unwrap_or("hit"));
        out.begin(Kind::Damage);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Attacker, &norm(hit.attacker));
        out.s(Key::Target, &norm(hit.target));
        out.i(Key::Amount, hit.amount.parse().unwrap_or(0));
        out.s(Key::Dtype, "melee");
        out.s(Key::Skill, melee_skill(&verb));
        out.s(Key::Verb, &verb);
        out.b(Key::Crit, has_critical(&mods));
        out.s_opt(Key::Modifier, modifier);
        out.strs(Key::Modifiers, &mods);
        out.s(Key::Category, damage_category("melee", &mods));
        true
    }
}

/// The "has taken N damage" half: DoTs, with and without a caster.
fn taken_damage(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    let text = c.text;
    if let Some(m) = r.dot.captures(text) {
        let target = norm(&m[1]);
        let amount: i64 = m[2].parse().unwrap_or(0);
        let rest = m.get(3).expect("group 3").as_str();
        let modifier = m.get(4).map(|g| g.as_str());
        let crit = has_critical_word(modifier.unwrap_or(""));
        // "from <Spell>" with no "by <caster>" and not "your" falls through to the caster-less form.
        if let Some((attacker, skill)) = dot_source(rest) {
            let mods = parse_modifiers(modifier);
            out.begin(Kind::Damage);
            out.envelope(c.seq, c.ts, c.raw);
            out.s(Key::Attacker, &attacker);
            out.s(Key::Target, &target);
            out.i(Key::Amount, amount);
            out.s(Key::Dtype, "dot");
            out.s(Key::Skill, crate::jsstr::js_trim(skill));
            out.b(Key::Crit, crit);
            out.s_opt(Key::Modifier, modifier);
            out.strs(Key::Modifiers, &mods);
            out.s(Key::Category, "dot");
            return true;
        }
    }
    if let Some(m) = r.dot_nocaster.captures(text) {
        let modifier = m.get(4).map(|g| g.as_str());
        let crit = has_critical_word(modifier.unwrap_or(""));
        let mods = parse_modifiers(modifier);
        out.begin(Kind::Damage);
        out.envelope(c.seq, c.ts, c.raw);
        out.s_or_null(Key::Attacker, None);
        out.s(Key::Target, &norm(&m[1]));
        out.i(Key::Amount, m[2].parse().unwrap_or(0));
        out.s(Key::Dtype, "dot");
        out.s(Key::Skill, crate::jsstr::js_trim(&m[3]));
        out.b(Key::Crit, crit);
        out.s_opt(Key::Modifier, modifier);
        out.strs(Key::Modifiers, &mods);
        out.s(Key::Category, "dot");
        return true;
    }
    false
}

/// A hit on you that names no source: lava, a trap, a fall (the cause is the next line, `YOU are
/// burning!`, `YOU were injured by falling.`). The attacker is null, as the caster-less DoT's is;
/// the fold books it under its Environment row.
fn sourceless_damage(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    let Some(m) = r.sourceless.captures(c.text) else {
        return false;
    };
    out.begin(Kind::Damage);
    out.envelope(c.seq, c.ts, c.raw);
    out.s_or_null(Key::Attacker, None);
    out.s(Key::Target, "You");
    out.i(Key::Amount, m[1].parse().unwrap_or(0));
    out.s(Key::Dtype, "spell");
    out.s(Key::Skill, "Non-melee");
    out.b(Key::Crit, false);
    out.s(Key::Category, "spell");
    true
}

/// Damage: melee / spell / dot / damage-shield, behind the shared substring gates.
pub fn classify_damage(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    let has_points = c.has(Needle::PointsOf) || c.has(Needle::PointOf);
    let has_taken = c.has(Needle::HasTaken) || c.has(Needle::HaveTaken);
    if has_points && points_damage(r, c, out) {
        return true;
    }
    if has_taken && taken_damage(r, c, out) {
        return true;
    }
    c.text.starts_with("You were hit by non-melee for ") && sourceless_damage(r, c, out)
}

/// Heals, plus the one heal family that states no amount.
pub fn classify_heal(r: &CombatRes, c: &Ctx, out: &mut Ev) -> bool {
    if c.text.starts_with("You mend") && r.mend.is_match(c.text) {
        out.begin(Kind::HealUnstated);
        out.envelope(c.seq, c.ts, c.raw);
        out.s(Key::Skill, "Mend");
        out.s(Key::Target, "You");
        return true;
    }
    if !c.has(Needle::Healed) {
        return false;
    }
    let Some(m) = r.heal.captures(c.text) else {
        return false;
    };
    let healer = norm(&m[1]);
    let t_raw = crate::jsstr::js_trim(&m[2]);
    let reflexive = r.reflexive.is_match(t_raw);
    let target = if reflexive {
        healer.clone()
    } else {
        norm(t_raw)
    };
    out.begin(Kind::Heal);
    out.envelope(c.seq, c.ts, c.raw);
    out.s(Key::Target, &target);
    out.i(Key::Amount, m[4].parse().unwrap_or(0));
    // Absent, not zero, when the group did not participate.
    out.i_opt(
        Key::RawAmount,
        m.get(5).and_then(|g| g.as_str().parse().ok()),
    );
    // An empty trim is absent, not "".
    let spell = m.get(6).map(|g| crate::jsstr::js_trim(g.as_str()));
    out.s_opt(Key::Spell, spell.filter(|s| !s.is_empty()));
    out.s(Key::Healer, &healer);
    out.b(
        Key::Crit,
        has_critical_word(m.get(7).map_or("", |g| g.as_str())),
    );
    if m.get(3).is_some() {
        out.b(Key::OverTime, true);
    }
    true
}
