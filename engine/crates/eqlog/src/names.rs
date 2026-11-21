//! Name normalization: the canonical `You` fold, identity keys, and spell canon keys.
//!
//! The app's `spellCanonKey` memo table is deliberately not ported — it is behaviour-identical
//! either way, and here it would be a global outliving a parse.

use crate::jsstr::js_trim;
use regex::Regex;
use std::borrow::Cow;
use std::sync::OnceLock;

/// 'you'/'yourself'/'your' fold to the canonical `You`; everything else is trimmed.
///
/// Borrowed, and the fold is the ASCII one, which is exact: `to_lowercase` reaches `you`,
/// `yourself` or `your` from their ASCII spellings alone, because the one non-ASCII character
/// that lowercases into ASCII (the Kelvin sign) becomes `k`. Every damage, miss and heal line
/// asked this twice, and each answer was an allocation thrown away after one write.
pub fn norm(name: &str) -> Cow<'_, str> {
    let n = js_trim(name);
    if n.eq_ignore_ascii_case("you")
        || n.eq_ignore_ascii_case("yourself")
        || n.eq_ignore_ascii_case("your")
    {
        return Cow::Borrowed("You");
    }
    Cow::Borrowed(n)
}

/// The lowercased identity key. Unicode default case conversion, not ASCII-only.
///
/// The owned spelling, for call sites that retain the key. A site that only compares or looks up
/// should reach for [`id_key_ref`]; this is that function plus the copy.
pub fn id_key(name: &str) -> String {
    id_key_ref(name).into_owned()
}

/// The identity key, borrowed where the name is already its own key. The fold asks this several
/// times per damage line and throws almost every answer away after one comparison, so the
/// allocation was the whole cost.
///
/// The fast path is exact rather than approximate: `to_lowercase` is Unicode default case
/// conversion, whose only non-per-character rule is the Greek final sigma, so for a string that is
/// all ASCII with no `A`–`Z` lowercasing is the identity and the trimmed slice is the key.
/// Everything else falls through to the same `to_lowercase` the owned spelling runs.
///
/// The `you`/`yourself`/`your` fold answers with a `'static` slice, so it allocates nothing either.
pub fn id_key_ref(name: &str) -> std::borrow::Cow<'_, str> {
    use std::borrow::Cow;
    let n = js_trim(name);
    if n.bytes().all(|b| b.is_ascii() && !b.is_ascii_uppercase()) {
        // Already lowercase, so `to_lowercase` would have handed back these same bytes.
        return match n {
            "yourself" | "your" => Cow::Borrowed("you"),
            _ => Cow::Borrowed(n),
        };
    }
    let l = n.to_lowercase();
    if l == "you" || l == "yourself" || l == "your" {
        return Cow::Borrowed("you");
    }
    Cow::Owned(l)
}

/// A trailing, word-bounded I–X at the end of a name. Case sensitive; the DB-side copy
/// ([`db_canon_key`]) is the case-insensitive one and stays separate.
fn rank_tail() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r" (?:I|II|III|IV|V|VI|VII|VIII|IX|X)$").unwrap())
}

/// Trim, strip a trailing Roman rank, trim, lowercase.
pub fn spell_canon_key(spell: &str) -> String {
    let t = js_trim(spell);
    let stripped = strip_rank_tail(t);
    js_trim(&stripped).to_lowercase()
}

/// The case-sensitive rank strip on its own, without the lowercasing [`spell_canon_key`] adds: the
/// display path needs the same "a trailing Roman numeral" semantic without the fold. `js_trim` is
/// deliberately not applied — the two callers trim differently, so each keeps its own trimming.
pub fn strip_rank_tail(name: &str) -> std::borrow::Cow<'_, str> {
    rank_tail().replace(name, "")
}

/// A trailing, word-bounded I–X at the end of a name, case-insensitive: the tail [`db_canon_key`]
/// strips, and the one the buff-timer rows fold and read their rank chip with.
pub fn db_rank_tail() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i) (?:I|II|III|IV|V|VI|VII|VIII|IX|X)$").unwrap())
}

/// The spell DB's own key: the same fold with a case-insensitive rank tail. Separate from
/// [`spell_canon_key`] so the difference stays visible instead of being merged away.
pub fn db_canon_key(name: &str) -> String {
    let t = js_trim(name);
    let stripped = db_rank_tail().replace(t, "");
    js_trim(&stripped).to_lowercase()
}

/// The rank the key throws away: `Scorching Arrow IV` -> 4, a name with no numeral -> 0.
///
/// A second function rather than a change to [`spell_canon_key`], because every consumer of the
/// canonical key depends on a rank-IV and a rank-0 cast being one spell and only the resist model
/// needs to know they carry different resist adjusts. Case-sensitive, unlike the
/// `fold::jsfn::parse_spell_rank` twin.
pub fn spell_rank(spell: &str) -> i64 {
    let m = match rank_tail().find(js_trim(spell)) {
        Some(m) => m.as_str(),
        None => return 0,
    };
    // The closed I–X ladder EQ Legends prints; the fallback is unreachable behind a regex that
    // accepts only those ten.
    match js_trim(m) {
        "I" => 1,
        "II" => 2,
        "III" => 3,
        "IV" => 4,
        "V" => 5,
        "VI" => 6,
        "VII" => 7,
        "VIII" => 8,
        "IX" => 9,
        "X" => 10,
        _ => 0,
    }
}

/// Drop a possessive `'s` tail (three apostrophe variants), trim, and answer `None` for what is
/// left of nothing.
pub fn clean_mob(s: Option<&str>) -> Option<String> {
    let s = s?;
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)['`\u{2019}]s$").unwrap());
    let cut = re.replace(s, "");
    let out = js_trim(&cut);
    if out.is_empty() {
        None
    } else {
        Some(out.to_string())
    }
}

/// The leading article, the mob-name marker EQ prints, sentence-initial or not. JS's `\s`
/// ([`crate::jsstr::JS_S`]), not Rust's; the two differ.
pub fn mob_article_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(&format!(r"(?i)^(?:a|an|the){}", crate::jsstr::JS_S)).unwrap())
}

/// EQ gives players a single capitalized word with no space, and mobs an article plus a noun
/// phrase. The log capitalizes a sentence-initial article (`A fire giant warrior begins singing …`),
/// so the word count discriminates and capitalization does not.
///
/// The article test is stated separately from the single-word test even though `a ` could never
/// satisfy it, because the article is the mob marker and a reader looking for it should find it.
/// The word is a letter, then letters/apostrophes/backticks: EQ names carry backticks and
/// apostrophes (``T`Kail``, `N'Kari`) and never spaces, digits or other punctuation. Anchored at
/// both ends, so any multi-word phrase is refused outright.
///
/// The one definition: the pet-leader parse, the ally/others folds, the resist target verdict and
/// the con card all ask this same question.
pub fn is_player_shaped_name(name: &str) -> bool {
    static WORD: OnceLock<Regex> = OnceLock::new();
    let n = js_trim(name);
    if n.is_empty() {
        return false;
    }
    if mob_article_re().is_match(n) {
        return false;
    }
    let word = WORD.get_or_init(|| Regex::new(r"^[A-Z][A-Za-z`']*$").unwrap());
    word.is_match(n)
}

/// The four parts the game builds a summoned pet's name from, in order. The second and third may
/// be empty. 7 x 9 x 5 x 4 combinations, 1,204 different names (`ar` and `ob` can come from
/// either middle part).
const PET_NAME_FIRST: &[u8] = b"gjklvxz";
const PET_NAME_SECOND: &[&str] = &["", "ab", "ar", "as", "eb", "en", "ib", "ob", "on"];
const PET_NAME_THIRD: &[&str] = &["", "an", "ar", "ek", "ob"];
const PET_NAME_LAST: &[&str] = &["ab", "er", "n", "tik"];

/// Is this a name the game gives a SUMMONED pet (`Xabantik`, `Gebarn`, `Xekn`)?
///
/// The game draws those names from the fixed table above, so the same few names come round again
/// and again, for your pets and for everyone else's. Measured on the owner's logs, 2026-11-20:
/// all 57 different names that ever said `My leader is ...` are in the table, and none of the
/// names that spoke in a channel or joined a group is.
///
/// It is evidence, not proof: a player may pick `Karn` or `Garn`, which the table also holds. So a
/// caller uses it to refuse a GUESS (a name admitted to the group because a buff landed on it),
/// never to overrule a statement the log made outright (a join line, a `/who` line, a leader
/// line). A charmed pet keeps its mob name and is not asked about here.
///
/// Case is ignored, so a display name and an identity key give the same answer.
pub fn is_summoned_pet_name(name: &str) -> bool {
    let n = js_trim(name);
    let bytes = n.as_bytes();
    // The longest name is 1 + 2 + 2 + 3 letters.
    if bytes.len() < 2 || bytes.len() > 8 || !n.is_ascii() {
        return false;
    }
    if !PET_NAME_FIRST.contains(&bytes[0].to_ascii_lowercase()) {
        return false;
    }
    let rest = n[1..].to_ascii_lowercase();
    PET_NAME_SECOND.iter().any(|second| {
        rest.strip_prefix(second).is_some_and(|after| {
            PET_NAME_THIRD.iter().any(|third| {
                after
                    .strip_prefix(third)
                    .is_some_and(|last| PET_NAME_LAST.contains(&last))
            })
        })
    })
}

#[cfg(test)]
mod pet_name_tests {
    use super::is_summoned_pet_name;

    #[test]
    fn the_pets_the_owner_reported_are_all_pet_names() {
        // The four that were listed as group members on 2026-11-19, and Malkil's pet.
        for name in ["Jasekab", "Gebarn", "Genober", "Xekn", "Xabantik"] {
            assert!(is_summoned_pet_name(name), "{name}");
        }
    }

    #[test]
    fn the_shortest_and_the_longest_names_fit() {
        assert!(is_summoned_pet_name("Zn"));
        assert!(is_summoned_pet_name("Xabantik"));
        assert!(is_summoned_pet_name("Gonobtik"));
    }

    #[test]
    fn a_key_and_a_display_name_agree() {
        assert!(is_summoned_pet_name("xabantik"));
        assert!(is_summoned_pet_name(" Xabantik "));
    }

    #[test]
    fn players_and_mobs_are_not_pet_names() {
        for name in [
            "Malkil",
            "Drywrought",
            "Primitive",
            "Scooba",
            "T`Kail",
            "a gnoll",
            "Gabe",
            "Xabanti",
            "Xabantiks",
            "Babantik",
            "",
        ] {
            assert!(!is_summoned_pet_name(name), "{name}");
        }
    }

    #[test]
    fn the_table_holds_1204_different_names() {
        let mut names = std::collections::HashSet::new();
        for first in super::PET_NAME_FIRST {
            for second in super::PET_NAME_SECOND {
                for third in super::PET_NAME_THIRD {
                    for last in super::PET_NAME_LAST {
                        let name = format!("{}{second}{third}{last}", *first as char);
                        assert!(is_summoned_pet_name(&name), "{name}");
                        names.insert(name);
                    }
                }
            }
        }
        assert_eq!(names.len(), 1204);
    }
}

#[cfg(test)]
mod id_key_tests {
    use super::{id_key, id_key_ref};
    use std::borrow::Cow;

    /// The names the fold asks about plus the fast path's edges: the three self-words in both
    /// cases, an uppercase name, a name needing a trim, and two non-ASCII spellings whose
    /// lowercasing is not byte-wise (Turkish dotted capital I, Greek capital sigma).
    const CASES: &[&str] = &[
        "you",
        "You",
        "YOU",
        "your",
        "Your",
        "yourself",
        "Yourself",
        "a large rat",
        "A Large Rat",
        "  Primitive  ",
        "Innoruuk`s Chosen",
        "",
        "   ",
        "İstanbul",
        "ΣΟΦΟΣ",
        "Straße",
    ];

    /// The borrowed spelling is the owned one. Stated as an identity over every case rather than a
    /// table of expected strings, which would let the two drift and still pass.
    #[test]
    fn the_borrowed_key_is_the_owned_key() {
        for name in CASES {
            assert_eq!(
                id_key_ref(name).as_ref(),
                id_key(name).as_str(),
                "id_key_ref disagreed with id_key on {name:?}"
            );
        }
    }

    /// …and it is a borrow where the point was to avoid the allocation, so an edit that turns the
    /// fast path into a copy fails here rather than regressing silently.
    #[test]
    fn an_already_lowercase_name_allocates_nothing() {
        assert!(matches!(id_key_ref("a large rat"), Cow::Borrowed(_)));
        assert!(matches!(id_key_ref("you"), Cow::Borrowed(_)));
        // The self-word rewrite answers with a 'static slice, so it does not allocate either.
        assert!(matches!(id_key_ref("yourself"), Cow::Borrowed(_)));
        assert_eq!(id_key_ref("yourself"), "you");
        // An uppercase name is the case that genuinely has to build a new string.
        assert!(matches!(id_key_ref("A Large Rat"), Cow::Owned(_)));
    }
}
