//! Mobs the catalog knows under the wiki's spelling, and names that are no mob at all (owner ask,
//! 2026-10-17: a mob whose pages are split by disambiguation is not unknown).
//!
//!   * THE WIKI'S SPELLING. `known_mob` keys the catalog by its `|name` and page title as they
//!     stand, so a name the wiki writes with a disambiguation (`Cazic-Thule (God)`,
//!     `a kobold (Warrens)`, `Orc Legionnaire (Crushbone)`), without its article
//!     (`fire giant warrior`), with other punctuation (`Cazic Thule`, `Guard Kroon`) or as two
//!     spellings in one field (`a greater kobold / greater kobold`) misses. The loose fold here
//!     drops a trailing `(…)` and a leading article and reads punctuation as spaces, on both
//!     sides; the raid roster's stated aliases (`Innoruuk, the Prince of Hate`) are read too.
//!   * A MOB'S PET, `<mob> pet` (`a shadowknight pet`, `Lady Vox pet`): the wiki pages the mob,
//!     never its pet, so the name is known when the mob is, and an unknown mob's pet is filed
//!     under the mob ([`owner_of_pet`]); not in the EQ Legends Tutorial, whose `a fragile pet` is a mob.
//!   * A PAGE SPLIT BY ZONE answers to its plain name only in its zones (owner, 2026-11-10: the
//!     `a kobold` of Rathe Mountains drops Kobold Scalps and Woven armor, nothing of `A kobold
//!     (Warrens)`, and wants `A kobold (Rathe Mountains)`). A name with a plain page too (`a kobold
//!     runt`: `A Kobold Runt` and `A kobold runt (Steamfont)`) stays known everywhere: the plain
//!     page's zone list may just be short, which is an update, not a new page.
//!   * NO MOB: the `Reward Chest` a raid's loot is taken from.
//!   * A PLAYER'S: a pet that spoke as a pet or named its leader (`Zonarer says, 'As you wish, oh
//!     great one.'`) is filed as a player by the module; a mount or familiar a single-word name
//!     owns (`Malkil`s Mount`, `Revilus`s familiar`) is no mob here.

use super::gaps_keys::{fold_quotes, loose_key, same_name};
use crate::knowledge::Knowledge;
use crate::modules::consider::mob_key;
use crate::modules::resist::world::is_player_shaped_name;
use std::collections::{HashMap, HashSet};

/// The catalog's names under [`mob_loose`].
#[derive(Default)]
pub struct MobNames {
    loose: HashSet<String>,
    /// The wiki redirects that land on mob pages, under [`mob_loose`] → the page.
    redirects: HashMap<String, String>,
    /// Those pages under [`mob_loose`]: a page's own title is its own name.
    pages: HashSet<String>,
    /// Plain page titles (no disambiguation) under [`mob_loose`]: known in every zone.
    plain: HashSet<String>,
    /// Zone-titled pages under [`mob_loose`] of their plain name → their zones under [`zone_loose`].
    split_zones: HashMap<String, Vec<String>>,
}

impl MobNames {
    pub fn new(names: &[String]) -> Self {
        Self {
            loose: names
                .iter()
                .flat_map(|n| n.split(" / "))
                .map(mob_loose)
                .collect(),
            ..Self::default()
        }
    }

    /// The wiki redirects that land on mob pages too (`GapIndex::mob_redirects`): known names.
    #[must_use]
    pub fn with_redirects(mut self, redirects: &[(String, String)]) -> Self {
        self.redirects = redirects.iter().map(|(n, page)| (mob_loose(n), page.clone())).collect();
        self.pages = redirects.iter().map(|(_, page)| mob_loose(page)).collect();
        self
    }

    /// The page titles (`GapIndex::mob_pages`) and the zone-titled pages' zones (`mob_zone_splits`).
    #[must_use]
    pub fn with_zone_splits(mut self, pages: &[String], splits: &[(String, Vec<String>)]) -> Self {
        let titled = |t: &str| t.ends_with(')') && t.contains(" (");
        self.plain = pages.iter().filter(|p| !titled(p)).map(|p| mob_loose(p)).collect();
        for (page, zones) in splits {
            let at = self.split_zones.entry(mob_loose(page)).or_default();
            at.extend(zones.iter().map(|z| zone_loose(z)));
        }
        self
    }

    /// A name whose only pages are zone-titled: known in their zones alone (`known_in`), and a row
    /// elsewhere wants a zone-titled page of its own.
    pub fn zone_titled(&self, name: &str) -> bool {
        let key = mob_loose(name);
        !self.plain.contains(&key) && !self.redirects.contains_key(&key) && self.split_zones.contains_key(&key)
    }

    /// [`Self::known`], except that a name known only through zone-titled pages is known in their
    /// zones alone; with no zone known yet, as `known`.
    pub fn known_in(&self, k: &dyn Knowledge, name: &str, zone: Option<&str>) -> bool {
        if !self.known(k, name) {
            return false;
        }
        let Some(zone) = zone.filter(|_| self.zone_titled(name)) else {
            return true;
        };
        let here = zone_loose(zone);
        self.split_zones.get(&mob_loose(name)).is_some_and(|zones| zones.iter().any(|z| zone_matches(&here, z)))
    }

    /// The page a mob name reaches only through a wiki redirect that is more than a respelling
    /// (`Hoptor Thaggelum` → `The Ghoul Lord`): a row to check, since a redirect can be wrong (owner,
    /// 2026-10-22). None for a name the catalog or the raid roster has as its own.
    pub fn via_redirect(&self, k: &dyn Knowledge, name: &str) -> Option<String> {
        let own = |n: &str| self.loose.contains(&mob_loose(n)) || self.pages.contains(&mob_loose(n));
        if own(name) || k.identity_keys(name).iter().any(|key| own(key)) {
            return None;
        }
        let page = self.redirects.get(&mob_loose(name))?;
        (!same_name(name, page)).then(|| page.clone())
    }

    /// Known as the catalog spells it, as the roster aliases it, loosely, or as a known mob's pet.
    pub fn known(&self, k: &dyn Knowledge, name: &str) -> bool {
        let redirected = |n: &str| self.redirects.contains_key(&mob_loose(n));
        self.spelled(k, name) || redirected(name) || (name.ends_with(" pet") && self.spelled(k, owner_of_pet(name)))
    }

    /// The event feed's "no picture" mark for a conned name the catalog knows: its pages have none
    /// (the Gaps tab's Images domain, owner 2026-10-20). Never for a one-word name, nor a player's
    /// mount, familiar, warder or summoned pet (owner, 2026-10-22). The "missing" mark is the Gaps
    /// tab's own Mobs row (`gaps_marks.rs`).
    pub fn needs_image(&self, k: &dyn Knowledge, name: &str) -> bool {
        !is_player_shaped_name(name) && !no_mob(name) && self.known(k, name) && k.imageless_mob(name)
    }

    fn spelled(&self, k: &dyn Knowledge, name: &str) -> bool {
        k.known_mob(name)
            || k.identity_keys(name).iter().any(|key| k.known_mob(key))
            || self.loose.contains(&mob_loose(name))
    }
}

/// `Cazic-Thule (God)` → `cazic thule`, `a fire giant warrior` → `fire giant warrior`.
fn mob_loose(name: &str) -> String {
    // The game stars some guards (`*Guard Willia`); no wiki title carries the star.
    let key = mob_key(name.trim_start_matches('*'));
    let bare = match key.rfind(" (") {
        Some(i) if key.ends_with(')') => &key[..i],
        _ => key.as_str(),
    };
    let loose = loose_key(bare);
    ["a ", "an ", "the "]
        .iter()
        .find_map(|a| loose.strip_prefix(a))
        .unwrap_or(&loose)
        .to_string()
}

/// A zone as the log or a page names it, folded for comparing: `The Warrens 2 (Adaptive) [instance 3]`,
/// `The Warrens - Group` and `the warrens` are one.
fn zone_loose(zone: &str) -> String {
    let bare = zone.split(" [instance ").next().unwrap_or(zone);
    let bare = bare.split(" - ").next().unwrap_or(bare);
    let (base, _) = crate::jsfn::zone_tier(bare);
    let loose = loose_key(&base.to_lowercase());
    loose.strip_prefix("the ").unwrap_or(&loose).to_string()
}

/// Whether the zone the log names is one a page states, allowing the wiki's short forms (`Eastern
/// Karana` for `The Eastern Plains of Karana`, `Lake Rathe` for `Lake Rathetear`, `Unrest` for `The
/// Estate of Unrest`, both under [`zone_loose`]): equal, one within the other, or a telling word
/// shared. Lenient on purpose: a miss here makes a known mob a row, a false match keeps today's answer.
fn zone_matches(here: &str, stated: &str) -> bool {
    if here == stated || here.contains(stated) || stated.contains(here) {
        return true;
    }
    const COMMON: [&str; 14] = ["north", "south", "east", "west", "northern", "southern", "eastern", "western", "greater", "lesser", "upper", "lower", "plane", "plains"];
    fn telling(z: &str) -> Vec<&str> {
        z.split(' ').filter(|w| w.len() >= 5 && !COMMON.contains(w)).collect()
    }
    let a = telling(here);
    telling(stated).iter().any(|w| a.contains(w))
}

/// `a necro initiate pet` → `a necro initiate`: the name an unknown mob's pet is filed under.
pub fn owner_of_pet(name: &str) -> &str {
    name.strip_suffix(" pet").unwrap_or(name)
}

/// The EQ Legends Tutorial, where `a fragile pet` and `a rambunctious pet` are mobs by their whole names.
pub fn is_tutorial_zone(zone: &str) -> bool {
    zone.trim().eq_ignore_ascii_case("EverQuest Legends Tutorial")
}

/// The game's ability switch (`<player> begins casting Disable Ability.`): no spell, no page.
pub fn no_spell(name: &str) -> bool {
    matches!(name.trim(), "Use Ability" | "Enable Ability" | "Disable Ability")
}

/// The `Reward Chest` a Dungeon Crawl pays out of: no mob, and what it pays is no mob's drop, since
/// it pays any item of any mob the crawl killed (owner, 2026-10-21).
pub fn is_reward_chest(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case("Reward Chest")
}

/// The `Reward Chest`, a player's mount or familiar (`Malkil`s Mount`, `Revilus`s familiar`), and
/// a summoned pet by its generated name (`Genekn`, `Zobektik`: see [`is_pet_name`]).
pub fn no_mob(name: &str) -> bool {
    let n = fold_quotes(name);
    if is_reward_chest(&n) || is_pet_name(&n) {
        return true;
    }
    let Some((owner, what)) = n.split_once("'s ") else {
        return false;
    };
    matches!(
        what.to_lowercase().as_str(),
        "mount" | "familiar" | "warder"
    ) && is_player_shaped_name(owner)
}

/// A summoned pet's generated name (owner, 2026-10-20: the Plane of Sky gaps "are mostly all
/// pets"). EverQuest builds one from four parts: a first letter (G J K L V X Z), up to two middle
/// syllables, and an ending (`er`, `ab`, `n`, `tik`): `Genekn` is G+en+ek+n, `Zobektik` Z+ob+ek+tik,
/// `Kaser` K+as+er. At least one middle syllable, so a bare `Gn` or `Ker` is not taken for one.
/// A pet has no wiki page, so a name of this shape is never a gap.
pub fn is_pet_name(name: &str) -> bool {
    const FIRST: [char; 7] = ['G', 'J', 'K', 'L', 'V', 'X', 'Z'];
    const SECOND: [&str; 9] = ["", "ab", "ar", "as", "eb", "en", "ib", "ob", "on"];
    const THIRD: [&str; 5] = ["", "an", "ar", "ek", "ob"];
    const LAST: [&str; 4] = ["er", "ab", "n", "tik"];
    let mut chars = name.chars();
    let Some(first) = chars.next().filter(|c| FIRST.contains(c)) else {
        return false;
    };
    let rest = &name[first.len_utf8()..];
    SECOND.iter().any(|b| {
        rest.strip_prefix(b).is_some_and(|r| {
            THIRD.iter().any(|c| {
                (!b.is_empty() || !c.is_empty())
                    && r.strip_prefix(c).is_some_and(|r| LAST.contains(&r))
            })
        })
    })
}

#[cfg(test)]
mod zone_tests {
    use super::{zone_loose, zone_matches};

    /// The wiki's zone fields against the log's zone lines (the 42 zone-titled-only pages, 2026-11-10).
    #[test]
    fn a_pages_zone_is_matched_by_the_logs_spelling_of_it_at_any_tier() {
        let m = |here: &str, stated: &str| zone_matches(&zone_loose(here), &zone_loose(stated));
        assert!(m("The Warrens 2 (Adaptive)", "The Warrens"));
        assert!(m("Befallen 4 (Refined) [instance 3]", "Befallen"));
        assert!(m("The Eastern Plains of Karana", "Eastern Karana"));
        assert!(m("Lake Rathetear", "Lake Rathe"));
        assert!(m("The Estate of Unrest", "Unrest"));
        assert!(m("Runnyeye Citadel", "Clan Runnyeye"));
        assert!(m("The Permafrost Caverns - Group", "Permafrost"));
        assert!(!m("The Rathe Mountains", "The Warrens"), "the owner's kobold");
        assert!(!m("The Rathe Mountains", "Lake Rathetear"));
        assert!(!m("Toxxulia Forest", "Greater Faydark"));
    }
}

#[cfg(test)]
mod pet_tests {
    use super::{is_pet_name, no_mob};

    #[test]
    fn generated_pet_names_are_not_mobs() {
        for pet in ["Genekn", "Xasarn", "Genab", "Kaser", "Vabekn", "Zasann", "Zobektik", "Jonobtik"] {
            assert!(is_pet_name(pet), "{pet} is a pet name");
            assert!(no_mob(pet), "{pet} is never a gap");
        }
    }

    #[test]
    fn other_names_are_left_alone() {
        for other in ["Lowejak", "Toejam", "Gn", "Ker", "Gabber", "a gnoll", "Genekns", "genekn", "Hoptor", "Lord Nagafen"] {
            assert!(!is_pet_name(other), "{other} is not a pet name");
        }
    }
}
