//! The keys. Three folds, each with exactly one definition.
//!
//! A name is a JOIN KEY, which is why these live here rather than at each use site: the committed
//! item DB, the quest index, the posky index and the runtime overlay must key an item the same way
//! four times, or a lookup answers for one spelling and not another.

use eqlog::jsstr::js_trim;
use fold::modules::consider::mob_key;
use std::borrow::Cow;

/// [`mob_key`], borrowed where the name is already its own key: trimmed, all ASCII with no
/// uppercase letter, no backtick, no control character and no run of two spaces, and not ending
/// in `)`. Those are the only things the fold touches (ASCII case, the three quote marks, runs of
/// whitespace, a trailing copy number), so on such a name the key is the trimmed name itself; any
/// other name takes the owned path. Every mob lookup keys through this.
#[must_use]
pub fn mob_key_ref(name: &str) -> Cow<'_, str> {
    let n = js_trim(name);
    let plain = n.bytes().all(|b| {
        b == b' ' || (b.is_ascii() && !b.is_ascii_uppercase() && !b.is_ascii_control() && b != b'`')
    }) && !n.contains("  ")
        && !n.ends_with(')');
    if plain {
        Cow::Borrowed(n)
    } else {
        Cow::Owned(mob_key(name))
    }
}

/// Strip a trailing ` +N` item-level suffix, then trim.
///
/// `Cloak of Flames +4` and `Cloak of Flames` are one item to every counting boundary (law 2), and
/// the wiki has a page for exactly one of them.
///
/// The rule is ` \+\d+$` spelled as a scan — a trailing run of ASCII digits preceded by ` +` —
/// which avoids a regex dependency in a crate whose whole job is map reads.
#[must_use]
pub fn item_base_name(name: &str) -> String {
    let stripped = strip_plus_suffix(name);
    stripped.trim().to_owned()
}

/// The ` +N` suffix, removed if it is there.
fn strip_plus_suffix(name: &str) -> &str {
    let digits: usize = name.chars().rev().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return name;
    }
    let head = &name[..name.len() - digits];
    head.strip_suffix(" +").map_or(name, |kept| kept)
}

/// The canonical item key, for the committed DB, the overlay and every index built over either.
/// Strip the ` +N` suffix and fold case: loot lines and wiki titles disagree about casing constantly.
#[must_use]
pub fn item_key(name: &str) -> String {
    item_base_name(name).to_lowercase()
}

/// The DISPLAY name a lookup answers with. Identical to [`item_base_name`] and named separately
/// because the two say different things: one is a key, the other is what the card prints.
#[must_use]
pub fn normalize_item_name(name: &str) -> String {
    item_base_name(name)
}

/// The quest index's key: [`normalize_item_name`] through the rename overlay, lowercased.
///
/// The app's item-rename table is empty today, so no overlay is ported here. An empty Rust copy
/// would be a silent SECOND opinion the day somebody adds a row over there, so the absence is
/// CHECKED instead: `tests/knowledgeCorpus.test.mts` fails if `ITEM_RENAMES` becomes non-empty while
/// this crate has no way to read it.
#[must_use]
pub fn quest_item_key(name: &str) -> String {
    normalize_item_name(name).to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{item_base_name, item_key, mob_key, mob_key_ref, quest_item_key};
    use std::borrow::Cow;

    /// The borrowed key is the fold's key, over every fold the fold makes and the names it leaves
    /// alone; and it is a borrow where the point was to skip the copy.
    #[test]
    fn the_borrowed_mob_key_is_the_folds_key() {
        let names = [
            "a sand giant",
            "A Sand Giant",
            "Innoruuk`s Chosen",
            "innoruuk\u{2019}s chosen",
            "innoruuk\u{b4}s chosen",
            "a rat (2)",
            "a rat(12)",
            "a rat (Awakened)",
            "a rat )",
            "a  rat",
            " a rat ",
            "a\trat",
            "x\u{A0}y",
            "Cazic-Thule",
            "\u{fc}n\u{ef}c\u{f6}d\u{e9}",
            "key master",
            "",
            "   ",
        ];
        for name in names {
            assert_eq!(mob_key_ref(name).as_ref(), mob_key(name), "{name:?}");
        }
        assert!(matches!(mob_key_ref("a sand giant"), Cow::Borrowed(_)));
        assert!(matches!(mob_key_ref(" a sand giant "), Cow::Borrowed(_)));
        assert!(matches!(mob_key_ref("A Sand Giant"), Cow::Owned(_)));
    }

    #[test]
    fn the_item_level_suffix_is_stripped_and_nothing_else_is() {
        assert_eq!(item_base_name("Cloak of Flames +4"), "Cloak of Flames");
        assert_eq!(item_base_name("  Cloak of Flames  "), "Cloak of Flames");
        // Not a suffix: no space-plus, no digits, or digits that are part of the name.
        assert_eq!(item_base_name("Cloak of Flames+4"), "Cloak of Flames+4");
        assert_eq!(
            item_base_name("Bag of Sewn Evil-Eye"),
            "Bag of Sewn Evil-Eye"
        );
        assert_eq!(
            item_base_name("Journeyman's Boots 2"),
            "Journeyman's Boots 2"
        );
        assert_eq!(item_base_name("+4"), "+4");
    }

    #[test]
    fn the_key_folds_case_and_the_suffix_together() {
        assert_eq!(item_key("Cloak of Flames +4"), "cloak of flames");
        assert_eq!(item_key("CLOAK OF FLAMES"), "cloak of flames");
        assert_eq!(quest_item_key("Guard Bracelet"), "guard bracelet");
    }
}
