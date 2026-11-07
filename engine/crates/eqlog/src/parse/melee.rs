//! The melee hit, split by hand: `<attacker> <verb> <target> for N point(s) of damage.(mods)`.
//!
//! This is the pattern `^(.+?) (?:VERBS) (.+?) for ([0-9]+) points? of damage\.(?: \((.+?)\))?$`
//! read exactly as the regex engine reads it — leftmost-first, lazy — and nothing else:
//!
//!   * the attacker is the shortest non-empty prefix after which a space, one verb form and a
//!     space leave a rest the tail accepts;
//!   * the tail accepts the shortest non-empty target followed by ` for <digits> point(s) of
//!     damage.` and then either the end of the line, or ` (` + a non-empty modifier + `)` closing
//!     the line;
//!   * a verb form followed by a space is unique at any position (no form is another form plus a
//!     space), so the alternation's order can never matter.
//!
//! A quarter of the owner's log is this one line, and the regex was ~300 ms of a 68 MB fold where
//! this is a byte scan (measured 2026-11-06). The pattern it replaces is kept below as the tests'
//! oracle, and `first_verb` is ` (VERBS) ` the same way: the verb the line is filed under is the
//! FIRST form between two spaces, as that second pattern found it, which the claiming pattern's
//! own verb equals on every real line and could differ from only on a line carrying two sentences.

/// One melee hit's four groups, borrowed from the line.
pub struct Hit<'t> {
    pub attacker: &'t str,
    pub target: &'t str,
    /// The digits as printed; the caller parses them.
    pub amount: &'t str,
    /// The parenthesised annotation at the end of the line, when there is one.
    pub modifier: Option<&'t str>,
}

/// Split one line, or `None` when the pattern would not have matched it.
pub fn split(text: &str) -> Option<Hit<'_>> {
    let bytes = text.as_bytes();
    for k in 1..bytes.len() {
        if bytes[k] != b' ' {
            continue;
        }
        let Some(verb_len) = form_at(&text[k + 1..]) else {
            continue;
        };
        // Past the verb and the space after it.
        let rest = &text[k + 1 + verb_len + 1..];
        if let Some((target, amount, modifier)) = tail(rest) {
            return Some(Hit {
                attacker: &text[..k],
                target,
                amount,
                modifier,
            });
        }
    }
    None
}

/// The first verb form on the line standing between two spaces, or `None`.
pub fn first_verb(text: &str) -> Option<&str> {
    let bytes = text.as_bytes();
    (0..bytes.len())
        .filter(|&p| bytes[p] == b' ')
        .find_map(|p| form_at(&text[p + 1..]).map(|n| &text[p + 1..p + 1 + n]))
}

/// The length of the verb form at the start of `s` when a space follows it.
fn form_at(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let first = *bytes.first()?;
    candidates(first)
        .iter()
        .find(|f| bytes.len() > f.len() && bytes[f.len()] == b' ' && s.starts_with(*f))
        .map(|f| f.len())
}

/// The forms that begin with `first`, so a space followed by a name costs one byte test.
fn candidates(first: u8) -> &'static [&'static str] {
    match first {
        b'b' => &["bashes", "bash", "bites", "bite", "backstabs", "backstab"],
        b'c' => &["crushes", "crush", "claws", "claw", "cleaves", "cleave"],
        b'f' => &["frenzies on", "frenzy on", "flurries", "flurry"],
        b'g' => &["gores", "gore", "gnaws", "gnaw"],
        b'h' => &["hits", "hit"],
        b'k' => &["kicks", "kick"],
        b'l' => &["lashes", "lash"],
        b'm' => &["mauls", "maul"],
        b'p' => &["pierces", "pierce", "punches", "punch"],
        b'r' => &["rends", "rend", "reaves", "reave"],
        b's' => &[
            "slashes", "slash", "strikes", "strike", "slices", "slice", "slams", "slam", "stings",
            "sting", "smashes", "smash", "smites", "smite", "shoots", "shoot",
        ],
        _ => &[],
    }
}

/// ` for <digits> point(s) of damage.` then the end or ` (<modifier>)`, after the shortest
/// non-empty target: the groups `(target, digits, modifier)`.
fn tail(s: &str) -> Option<(&str, &str, Option<&str>)> {
    let mut from = 0;
    while let Some(at) = s[from..].find(" for ") {
        let p = from + at;
        from = p + 1;
        if p == 0 {
            continue;
        }
        let after = p + " for ".len();
        let digits = s[after..].bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            continue;
        }
        let Some(rest) = s[after + digits..].strip_prefix(" point") else {
            continue;
        };
        let rest = rest.strip_prefix('s').unwrap_or(rest);
        let Some(rest) = rest.strip_prefix(" of damage.") else {
            continue;
        };
        let modifier = if rest.is_empty() {
            None
        } else {
            match rest.strip_prefix(" (").and_then(|m| m.strip_suffix(')')) {
                Some(m) if !m.is_empty() => Some(m),
                _ => continue,
            }
        };
        return Some((&s[..p], &s[after..after + digits], modifier));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    /// The alternation the two patterns spelled, verbatim — the oracle.
    const VERBS: &str = "hit(?:s)?|slash(?:es)?|pierce(?:s)?|crush(?:es)?|bash(?:es)?|kick(?:s)?|bite(?:s)?|claw(?:s)?|gore(?:s)?|maul(?:s)?|punch(?:es)?|strike(?:s)?|slice(?:s)?|backstab(?:s)?|slam(?:s)?|sting(?:s)?|rend(?:s)?|smash(?:es)?|gnaw(?:s)?|lash(?:es)?|smite(?:s)?|cleave(?:s)?|reave(?:s)?|shoot(?:s)?|frenzies on|frenzy on|flurries|flurry";

    fn melee_re() -> Regex {
        Regex::new(&format!(
            r"^(.+?) (?:{VERBS}) (.+?) for ([0-9]+) points? of damage\.(?: \((.+?)\))?$"
        ))
        .unwrap()
    }

    fn verb_re() -> Regex {
        Regex::new(&format!(r" ({VERBS}) ")).unwrap()
    }

    const LINES: [&str; 40] = [
        "You slash a rat for 23 points of damage.",
        "You slash a rat for 1 point of damage.",
        "a rat bites YOU for 4 points of damage.",
        "Drywrought backstabs a spite golem for 412 points of damage. (Critical)",
        "Drywrought backstabs a spite golem for 412 points of damage. (Critical Flurry)",
        "Drywrought hits a rat for 3 points of damage. (a) (b)",
        "Drywrought hits a rat for 3 points of damage. ()",
        "Drywrought hits a rat for 3 points of damage. (x",
        "Drywrought hits a rat for 3 points of damage.x",
        "Drywrought hits a rat for 3 points of damage",
        "Drywrought hits a rat for points of damage.",
        "Drywrought hits for 3 points of damage.",
        " slashes a rat for 3 points of damage.",
        "Hit Man kicks a rat for 5 points of damage.",
        "a slash hound bites you for 5 points of damage.",
        "a hits b kicks c for 5 points of damage.",
        "a hits for 5 points of damage. Y kicks Z for 3 points of damage.",
        "X slashes  Y for 5 points of damage.",
        "X slashes Y  for 5 points of damage.",
        "X slashes Y for 5 points of damage.",
        "X slashes Y for 5 points of damage. ",
        "X slashes Y for 5  points of damage.",
        "X slashes Y for 5 pointss of damage.",
        "X slashes Y for 5 point of damage.",
        "X frenzies on Y for 5 points of damage.",
        "X frenzy on Y for 5 points of damage.",
        "X flurries Y for 5 points of damage.",
        "X flurry Y for 5 points of damage.",
        "X frenzies Y for 5 points of damage.",
        "X hitss Y for 5 points of damage.",
        "X shoots Y for 50 points of damage.",
        "Ünïcödé mob gores Drywrought for 12 points of damage.",
        "X gores Ünïcödé for 12 points of damage. (Ünï)",
        "X gores Y for twelve points of damage.",
        "X gores Y for 12 points of non-melee damage.",
        "X gores Y for 12 points of damage by Z.",
        "You try to slash a rat, but miss!",
        "",
        " ",
        "X slashes Y for 5 points of damage.\r",
    ];

    #[test]
    fn the_hand_split_answers_exactly_what_the_pattern_did() {
        let re = melee_re();
        for line in LINES {
            let expected = re.captures(line).map(|m| {
                (
                    m[1].to_string(),
                    m[2].to_string(),
                    m[3].to_string(),
                    m.get(4).map(|g| g.as_str().to_string()),
                )
            });
            let got = split(line).map(|h| {
                (
                    h.attacker.to_string(),
                    h.target.to_string(),
                    h.amount.to_string(),
                    h.modifier.map(str::to_string),
                )
            });
            assert_eq!(got, expected, "{line:?}");
        }
    }

    #[test]
    fn the_first_verb_is_the_one_the_second_pattern_found() {
        let re = verb_re();
        for line in LINES {
            let expected = re.captures(line).map(|m| m[1].to_string());
            assert_eq!(first_verb(line).map(str::to_string), expected, "{line:?}");
        }
    }

    /// Every form the alternation accepts is in the candidate tables under its first letter, and
    /// nothing else is: the alternation is a finite list of literals, so the bases with their
    /// three suffixes and the four irregular forms enumerate it.
    #[test]
    fn the_candidate_tables_are_the_alternation() {
        let whole = Regex::new(&format!("^(?:{VERBS})$")).unwrap();
        let mut accepted: Vec<String> = Vec::new();
        for base in crate::parse::combat::MELEE_VERB_BASES {
            for suffix in ["", "s", "es"] {
                let form = format!("{base}{suffix}");
                if whole.is_match(&form) {
                    accepted.push(form);
                }
            }
        }
        for form in ["frenzies on", "frenzy on", "flurries", "flurry"] {
            assert!(whole.is_match(form));
            accepted.push(form.to_string());
        }
        let mut listed: Vec<String> = (0..=255u8)
            .flat_map(|b| candidates(b).iter().map(|f| f.to_string()))
            .collect();
        for form in &listed {
            assert!(whole.is_match(form), "{form}");
            assert_eq!(
                candidates(form.as_bytes()[0]).iter().filter(|f| **f == form).count(),
                1,
                "{form} is listed once, under its own first letter"
            );
        }
        accepted.sort();
        accepted.dedup();
        listed.sort();
        assert_eq!(listed, accepted);
    }
}
