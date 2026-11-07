//! The paren-modifier splitter and the damage category.

use crate::jsstr::{is_js_space, js_trim};

/// The three two-word procs, pulled out before the remainder is split on whitespace. The order is
/// load-bearing: the pull is greedy and runs first.
const TWO_WORD: [&str; 3] = ["Slay Undead", "Finishing Blow", "Crippling Blow"];

/// `"Riposte Critical"` → `["Riposte", "Critical"]`, each token borrowed from the modifier (or
/// one of the three phrases).
pub fn parse_modifiers(modifier: Option<&str>) -> Vec<&str> {
    // The app's falsy test covers undefined and the empty string, hence two checks rather than one.
    let Some(modifier) = modifier else {
        return Vec::new();
    };
    if modifier.is_empty() {
        return Vec::new();
    }
    let raw = js_trim(modifier);
    if raw.is_empty() {
        return Vec::new();
    }
    if !TWO_WORD.iter().any(|tw| raw.contains(tw)) {
        return raw.split(is_js_space).filter(|t| !t.is_empty()).collect();
    }
    parse_with_phrases(raw)
}

/// The rare annotation carrying a two-word proc: the app's algorithm verbatim on an owned copy,
/// each token then mapped back onto `raw`. Every token is a run of the original characters, since
/// the only character the pull inserts is a space and a token holds none, so the map always lands.
fn parse_with_phrases(raw: &str) -> Vec<&str> {
    let mut mods: Vec<&str> = Vec::new();
    let mut rest = raw.to_string();
    for tw in TWO_WORD {
        if let Some(at) = rest.find(tw) {
            mods.push(tw);
            // The app's string `replace` cuts the first occurrence only.
            let mut s = String::with_capacity(rest.len());
            s.push_str(&rest[..at]);
            s.push(' ');
            s.push_str(&rest[at + tw.len()..]);
            rest = js_trim(&s).to_string();
        }
    }
    for tok in rest.split(is_js_space) {
        if tok.is_empty() {
            continue;
        }
        let at = raw
            .find(tok)
            .expect("a token is a run of the original characters");
        mods.push(&raw[at..at + tok.len()]);
    }
    mods
}

pub fn has_critical<S: AsRef<str>>(mods: &[S]) -> bool {
    mods.iter()
        .any(|m| m.as_ref().eq_ignore_ascii_case("critical"))
}

/// Element-generic so the parser's owned token list and the fold's borrowed one can both ask
/// without either allocating a list in the other's spelling.
pub fn has_slay_undead<S: AsRef<str>>(mods: &[S]) -> bool {
    mods.iter()
        .any(|m| m.as_ref().eq_ignore_ascii_case("slay undead"))
}

/// A melee swing carrying Slay Undead is its own category; every other dtype maps 1:1.
pub fn damage_category<S: AsRef<str>>(dtype: &str, mods: &[S]) -> &'static str {
    if dtype == "melee" && has_slay_undead(mods) {
        return "slay";
    }
    match dtype {
        "melee" => "melee",
        "spell" => "spell",
        "dot" => "dot",
        "ds" => "ds",
        other => unreachable!("unknown damage type {other}"),
    }
}
