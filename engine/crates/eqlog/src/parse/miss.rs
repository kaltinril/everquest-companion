//! The miss line, split by hand: `<attacker> tries to <verb> [on ]<target>, but <outcome>!(mods)`.
//!
//! This is the pattern
//!
//! ```text
//! ^(.+?) tr(?:y|ies) to [0-9A-Za-z_]+ (?:on )?(.+?), but (?:(miss|misses)
//!   |(.+?) (parries|dodges|ripostes|blocks)|(YOU) (parry|dodge|riposte|block)
//!   |.+?'s magical skin (absorbs) the blow|(YOUR) magical skin absorbs the blow)!(?: \([A-Za-z ]+\))?$
//! ```
//!
//! read exactly as the regex engine reads it, leftmost-first and lazy, and nothing else:
//!
//!   * the attacker is the shortest non-empty prefix after which ` try to ` or ` tries to `, a
//!     non-empty word of `[0-9A-Za-z_]` and a space leave a rest the remainder accepts;
//!   * `on ` is taken when it is there, and the rest is tried without it only when that fails;
//!   * the target is the shortest non-empty run followed by `, but ` and an outcome;
//!   * the outcome is the first of the five alternatives, in the pattern's order, that is followed
//!     by `!` and then either the end of the line or ` (` + a non-empty run of letters and spaces
//!     + `)` closing the line; inside an alternative its own lazy group grows shortest-first.
//!
//! A fifth of the owner's log is this one line, and the regex plus its two rescans were ~485 ms of
//! a 68 MB fold where this is a byte scan (measured 2026-11-06). The three patterns it replaces are
//! kept below as the tests' oracle. `first_verb` is the ` tr(?:y|ies) to ([0-9A-Za-z_]+)` rescan:
//! the verb the line is filed under is the FIRST such word on the line, which equals the claiming
//! pattern's own verb on every real line and differs only on a line carrying two sentences.

/// What came after `, but `: the pattern's five alternatives, with what each one captured.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Outcome<'t> {
    /// `miss` or `misses` (group 3).
    Miss,
    /// `<defender> parries|dodges|ripostes|blocks` (groups 4 and 5), the verb as printed.
    Defended(&'t str, &'static str),
    /// `YOU parry|dodge|riposte|block` (groups 6 and 7), the verb as printed.
    YouDefended(&'static str),
    /// `<someone>'s magical skin absorbs the blow` (group 8).
    SkinAbsorbs,
    /// `YOUR magical skin absorbs the blow` (group 9).
    YourSkinAbsorbs,
}

/// One miss line's groups, borrowed from the line.
pub struct Miss<'t> {
    pub attacker: &'t str,
    pub target: &'t str,
    pub outcome: Outcome<'t>,
    /// The parenthesised annotation at the end of the line, when there is one.
    pub modifier: Option<&'t str>,
}

/// Split one line, or `None` when the pattern would not have matched it.
pub fn split(text: &str) -> Option<Miss<'_>> {
    let bytes = text.as_bytes();
    for k in 1..bytes.len() {
        if bytes[k] != b' ' {
            continue;
        }
        let Some(after_verb) = tries_to_verb(&text[k..]) else {
            continue;
        };
        // `(?:on )?` takes the `on ` first and gives it back only when the rest fails without it.
        let found = after_verb
            .strip_prefix("on ")
            .and_then(target_and_outcome)
            .or_else(|| target_and_outcome(after_verb));
        if let Some((target, outcome, modifier)) = found {
            return Some(Miss {
                attacker: &text[..k],
                target,
                outcome,
                modifier,
            });
        }
    }
    None
}

/// The first ` tr(?:y|ies) to ` on the line followed by a non-empty word: that word.
pub fn first_verb(text: &str) -> Option<&str> {
    let bytes = text.as_bytes();
    (0..bytes.len())
        .filter(|&p| bytes[p] == b' ')
        .find_map(|p| {
            let after = tries_to(&text[p..])?;
            let n = word_len(after);
            (n > 0).then(|| &after[..n])
        })
}

/// ` try to ` or ` tries to ` at the start of `s`: what follows it.
fn tries_to(s: &str) -> Option<&str> {
    s.strip_prefix(" try to ")
        .or_else(|| s.strip_prefix(" tries to "))
}

/// ` tr(?:y|ies) to [0-9A-Za-z_]+ ` at the start of `s`: what follows it. The word is greedy and
/// the class excludes the space that must follow, so the word is the whole run or nothing.
fn tries_to_verb(s: &str) -> Option<&str> {
    let after = tries_to(s)?;
    let n = word_len(after);
    if n == 0 {
        return None;
    }
    after[n..].strip_prefix(' ')
}

/// The length of the `[0-9A-Za-z_]+` run at the start of `s`.
fn word_len(s: &str) -> usize {
    s.bytes()
        .take_while(|b| b.is_ascii_alphanumeric() || *b == b'_')
        .count()
}

/// The shortest non-empty target followed by `, but ` and an outcome the tail accepts.
fn target_and_outcome(s: &str) -> Option<(&str, Outcome<'_>, Option<&str>)> {
    let bytes = s.as_bytes();
    for t in 1..bytes.len() {
        if bytes[t] != b',' {
            continue;
        }
        let Some(rest) = s[t..].strip_prefix(", but ") else {
            continue;
        };
        if let Some((outcome, modifier)) = outcome(rest) {
            return Some((&s[..t], outcome, modifier));
        }
    }
    None
}

/// The five alternatives in the pattern's order, each followed by `!` and the tail.
fn outcome(r: &str) -> Option<(Outcome<'_>, Option<&str>)> {
    if let Some(m) = literal_then_tail(r, "miss").or_else(|| literal_then_tail(r, "misses")) {
        return Some((Outcome::Miss, m));
    }
    if let Some(found) = defended(r) {
        return Some(found);
    }
    if let Some(after) = r.strip_prefix("YOU ") {
        for verb in ["parry", "dodge", "riposte", "block"] {
            if let Some(m) = literal_then_tail(after, verb) {
                return Some((Outcome::YouDefended(verb), m));
            }
        }
    }
    if let Some(m) = skin_absorbs(r) {
        return Some((Outcome::SkinAbsorbs, m));
    }
    literal_then_tail(r, "YOUR magical skin absorbs the blow")
        .map(|m| (Outcome::YourSkinAbsorbs, m))
}

/// `(.+?) (parries|dodges|ripostes|blocks)`: the shortest non-empty defender, then a space and a
/// verb the tail accepts after.
fn defended(r: &str) -> Option<(Outcome<'_>, Option<&str>)> {
    let bytes = r.as_bytes();
    for p in 1..bytes.len() {
        if bytes[p] != b' ' {
            continue;
        }
        for verb in ["parries", "dodges", "ripostes", "blocks"] {
            if let Some(m) = literal_then_tail(&r[p + 1..], verb) {
                return Some((Outcome::Defended(&r[..p], verb), m));
            }
        }
    }
    None
}

/// `.+?'s magical skin absorbs the blow`: any occurrence past the first character, in order, whose
/// tail is accepted. The literal cannot overlap itself (its only apostrophe is its first byte), so
/// the non-overlapping occurrences are all of them.
fn skin_absorbs(r: &str) -> Option<Option<&str>> {
    const SKIN: &str = "'s magical skin absorbs the blow!";
    r.match_indices(SKIN)
        .filter(|(p, _)| *p >= 1)
        .find_map(|(p, _)| tail(&r[p + SKIN.len()..]))
}

/// `lit` then `!` then the tail, at the start of `r`: `Some(modifier)` when accepted.
fn literal_then_tail<'t>(r: &'t str, lit: &str) -> Option<Option<&'t str>> {
    tail(r.strip_prefix(lit)?.strip_prefix('!')?)
}

/// `(?: \([A-Za-z ]+\))?$` after the `!`: `Some(None)` at the end of the line, `Some(Some(m))` for
/// one closing modifier of letters and spaces, `None` for anything else.
fn tail(rest: &str) -> Option<Option<&str>> {
    if rest.is_empty() {
        return Some(None);
    }
    let m = rest.strip_prefix(" (")?.strip_suffix(')')?;
    let letters = !m.is_empty() && m.bytes().all(|b| b.is_ascii_alphabetic() || b == b' ');
    letters.then_some(Some(m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    /// The three patterns this file replaces, verbatim: the oracle.
    fn miss_re() -> Regex {
        Regex::new(concat!(
            r"^(.+?) tr(?:y|ies) to [0-9A-Za-z_]+ (?:on )?(.+?), but ",
            r"(?:(miss|misses)",
            r"|(.+?) (parries|dodges|ripostes|blocks)",
            r"|(YOU) (parry|dodge|riposte|block)",
            r"|.+?'s magical skin (absorbs) the blow",
            r"|(YOUR) magical skin absorbs the blow)",
            r"!(?: \([A-Za-z ]+\))?$"
        ))
        .unwrap()
    }

    fn verb_re() -> Regex {
        Regex::new(r" tr(?:y|ies) to ([0-9A-Za-z_]+)").unwrap()
    }

    fn mod_re() -> Regex {
        Regex::new(r" \(([A-Za-z ]+)\)$").unwrap()
    }

    const LINES: [&str; 58] = [
        "You try to slash a rat, but miss!",
        "You try to slash a rat, but miss! (Riposte)",
        "a rat tries to bite YOU, but misses!",
        "a rat tries to bite YOU, but misses! (Lucky)",
        "a rat tries to bite YOU, but YOU dodge!",
        "a rat tries to bite YOU, but YOU parry!",
        "a rat tries to bite YOU, but YOU riposte!",
        "a rat tries to bite YOU, but YOU block!",
        "a rat tries to bite YOU, but YOU block! (Critical Flurry)",
        "a rat tries to bite YOU, but YOU blocks!",
        "a rat tries to bite YOU, but YOUR magical skin absorbs the blow!",
        "a rat tries to bite YOU, but YOUR magical skin absorbs the blow! (Riposte)",
        "a rat tries to bite YOU, but YOU's magical skin absorbs the blow!",
        "Drywrought tries to backstab a spite golem, but a spite golem parries!",
        "Drywrought tries to backstab a spite golem, but a spite golem dodges!",
        "Drywrought tries to backstab a spite golem, but a spite golem ripostes!",
        "Drywrought tries to backstab a spite golem, but a spite golem blocks!",
        "Drywrought tries to backstab a spite golem, but a spite golem blocks with his shield!",
        "Drywrought tries to hit a spite golem, but a spite golem's magical skin absorbs the blow!",
        "Drywrought tries to hit a spite golem, but a spite golem's magical skin absorbs the blow! (Critical)",
        "Drywrought tries to hit X, but X's magical skin absorbs the blow! Y's magical skin absorbs the blow!",
        "Drywrought tries to hit X, but 's magical skin absorbs the blow!",
        "Drywrought tries to hit X, but YOUR magical skin absorbs the blow!x",
        "X tries to hit on Y, but misses!",
        "X tries to hit on on Y, but misses!",
        "X tries to hit on , but misses!",
        "X tries to hit , but misses!",
        " tries to hit Y, but misses!",
        "X tries to hit Y, but misses! Z tries to kick W, but misses!",
        "X tries to hit Y, but misses! Y tries to hit X, but X dodges!",
        "A tries to go, but B tries to kick C, but misses!",
        "X tries to , but Y tries to kick Z, but misses!",
        "X tries to hit Y, but misses! (Critical) (Lucky)",
        "X tries to hit Y, but misses! ()",
        "X tries to hit Y, but misses! (a1)",
        "X tries to hit Y, but misses! (Ünï)",
        "X tries to hit Y, but misses! (Critical",
        "X tries to hit Y, but misses!x",
        "X tries to hit Y, but misses",
        "X tries to hit Y, but miss!",
        "X tries to hit Y, but missesss!",
        "X tries to hit Y, but Z blocks!",
        "X tries to hit Y, but  blocks!",
        "X tries to hit Y, but YOU parries!",
        "X try to hit Y, but miss!",
        "X tries to hit_2 Y, but misses!",
        "X tries to hit-kick Y, but misses!",
        "X tries to  hit Y, but misses!",
        "X tries to hit  Y, but misses!",
        "X tries to hit Y , but misses!",
        "X tries to hit Y,  but misses!",
        "Ünïcödé tries to hit Ÿou, but misses!",
        "X tries to hit Y, but Ünï dodges!",
        "ä tries to hit ö, but ü's magical skin absorbs the blow!",
        "You slash a rat for 23 points of damage.",
        ", but ",
        "",
        " ",
    ];

    /// The regex's groups and the split's, in one comparable shape.
    type Groups = (String, String, String, Option<String>, Option<String>);

    fn by_regex(line: &str) -> Option<Groups> {
        let m = miss_re().captures(line)?;
        let (alt, defender) = if m.get(3).is_some() {
            ("miss".to_string(), None)
        } else if let Some(v) = m.get(5) {
            (v.as_str().to_string(), Some(m[4].to_string()))
        } else if let Some(v) = m.get(7) {
            (format!("YOU {}", v.as_str()), None)
        } else if m.get(8).is_some() {
            ("absorbs".to_string(), None)
        } else {
            assert!(m.get(9).is_some());
            ("YOUR".to_string(), None)
        };
        // The modifier the second rescan found, when the pattern claimed the line.
        let modifier = mod_re().captures(line).map(|c| c[1].to_string());
        Some((m[1].to_string(), m[2].to_string(), alt, defender, modifier))
    }

    fn by_split(line: &str) -> Option<Groups> {
        let m = split(line)?;
        let (alt, defender) = match m.outcome {
            Outcome::Miss => ("miss".to_string(), None),
            Outcome::Defended(d, v) => (v.to_string(), Some(d.to_string())),
            Outcome::YouDefended(v) => (format!("YOU {v}"), None),
            Outcome::SkinAbsorbs => ("absorbs".to_string(), None),
            Outcome::YourSkinAbsorbs => ("YOUR".to_string(), None),
        };
        Some((
            m.attacker.to_string(),
            m.target.to_string(),
            alt,
            defender,
            m.modifier.map(str::to_string),
        ))
    }

    #[test]
    fn the_hand_split_answers_exactly_what_the_pattern_did() {
        let mut matched = 0;
        for line in LINES {
            let expected = by_regex(line);
            matched += usize::from(expected.is_some());
            assert_eq!(by_split(line), expected, "{line:?}");
        }
        // The table exercises both halves of the oracle.
        assert!(matched >= 30 && matched < LINES.len(), "{matched} matched");
    }

    #[test]
    fn the_first_verb_is_the_one_the_rescan_found() {
        let re = verb_re();
        for line in LINES {
            let expected = re.captures(line).map(|m| m[1].to_string());
            assert_eq!(first_verb(line).map(str::to_string), expected, "{line:?}");
        }
    }
}
