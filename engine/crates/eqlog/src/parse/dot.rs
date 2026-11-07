//! The DoT line's small reads, as byte tests: four helper regexes that ran on every `has taken`
//! line (and `(?i)critical` on every heal) are each a prefix, suffix or substring test. The
//! patterns are kept below as the tests' oracle.

use crate::names::norm;
use std::borrow::Cow;

/// Who a DoT came from and what it was, off the `from <X>` group: `your <Skill>` is you (the
/// pattern was `(?i)^your `, whose five bytes are ASCII, so the cut is a character boundary); else
/// the text before the first ` by ` that has something after it (` by (.+)$`); else nobody.
pub(crate) fn dot_source(rest: &str) -> Option<(Cow<'_, str>, &str)> {
    if rest.len() >= 5 && rest.as_bytes()[..5].eq_ignore_ascii_case(b"your ") {
        return Some((Cow::Borrowed("You"), &rest[5..]));
    }
    let mut from = 0;
    while let Some(off) = rest[from..].find(" by ") {
        let at = from + off;
        let caster = &rest[at + 4..];
        if !caster.is_empty() {
            return Some((norm(caster), &rest[..at]));
        }
        from = at + 1;
    }
    None
}

/// `(?i)critical` anywhere in a modifier. The ASCII fold is the regex's own here: no character
/// outside ASCII case-folds to a letter of the word (pinned below).
pub(crate) fn has_critical_word(s: &str) -> bool {
    s.as_bytes()
        .windows(8)
        .any(|w| w.eq_ignore_ascii_case(b"critical"))
}

/// The owner of a damage shield with its possessive off: `'s$` replaced by nothing.
pub(crate) fn strip_possessive(owner: &str) -> &str {
    owner.strip_suffix("'s").unwrap_or(owner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    const CASES: [&str; 26] = [
        "your Flame Lick",
        "Your Flame Lick",
        "YOUR Flame Lick",
        "your",
        "your ",
        "yourself by a rat",
        "Fetid Breath by a rat",
        "Fetid Breath by a rat by proxy",
        "Fetid Breath by ",
        "Fetid Breath by  by a rat",
        "A by by B",
        " by a rat",
        "by a rat",
        "Fetid Breath",
        "",
        "Critical",
        "critical",
        "CRITICAL",
        "a Critical Blow",
        "Critica",
        "Ünïcödé Crıtıcal",
        "\u{212A}ritical",
        "a rat's",
        "YOUR",
        "'s",
        "a rat's's",
    ];

    #[test]
    fn the_source_split_is_the_two_patterns() {
        let your = Regex::new(r"(?i)^your ").unwrap();
        let by = Regex::new(r" by (.+)$").unwrap();
        for rest in CASES {
            let expected: Option<(String, String)> = if your.is_match(rest) {
                Some(("You".to_string(), your.replace(rest, "").to_string()))
            } else {
                by.captures(rest).map(|c| {
                    let at = c.get(0).unwrap().start();
                    (norm(&c[1]).to_string(), rest[..at].to_string())
                })
            };
            let got = dot_source(rest).map(|(a, s)| (a.to_string(), s.to_string()));
            assert_eq!(got, expected, "{rest:?}");
        }
    }

    #[test]
    fn the_critical_and_possessive_tests_are_their_patterns() {
        let critical = Regex::new(r"(?i)critical").unwrap();
        let poss = Regex::new(r"'s$").unwrap();
        for s in CASES {
            assert_eq!(has_critical_word(s), critical.is_match(s), "{s:?}");
            assert_eq!(strip_possessive(s), poss.replace(s, "").as_ref(), "{s:?}");
        }
    }

    /// The ASCII fold is exact: over the whole Basic Multilingual Plane, no character outside
    /// ASCII matches any letter of `your` or `critical` case-insensitively (the regex crate's
    /// simple case folding reaches ASCII only from the Kelvin sign and the long s).
    #[test]
    fn no_non_ascii_character_folds_to_a_letter_of_either_word() {
        for letter in "yourcital".chars() {
            let re = Regex::new(&format!("(?i)^{letter}$")).unwrap();
            let mut buf = [0u8; 4];
            for code in 0x80..=0xFFFFu32 {
                let Some(c) = char::from_u32(code) else {
                    continue;
                };
                assert!(
                    !re.is_match(c.encode_utf8(&mut buf)),
                    "{c:?} folds to {letter}"
                );
            }
        }
        // …and the two that do fold are not letters of either word.
        assert!(Regex::new("(?i)^k$").unwrap().is_match("\u{212A}"));
        assert!(Regex::new("(?i)^s$").unwrap().is_match("\u{17F}"));
    }
}
