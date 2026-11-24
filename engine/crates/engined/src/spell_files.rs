//! Which spell files to read out of an install root. The app's `src/main/resist/spellFiles.ts` rule,
//! kept the same here so both processes read the same file.
//!
//! The app ships no spell file of its own (owner, 2026-11-23). A US client names its files
//! `spells_us.txt` and `dbstr_us.txt`; a client in another language may name them differently, and
//! nobody here knows the exact names, so this matches the pattern rather than a list:
//!
//! 1. `spells_us.txt` when it is there.
//! 2. Otherwise the first other `spells_<suffix>.txt`, ordered by lower-cased name and then by the
//!    name as written, never a `spells_<suffix>_str.txt` (the message file).
//! 3. The string table with the same suffix (`dbstr_<suffix>.txt`) when it is there, else
//!    `dbstr_us.txt`.
//!
//! Nothing found answers the `spells_us.txt` path, so a missing table still names the place looked.

use std::path::{Path, PathBuf};

/// The table every reader was written against.
const US_TABLE: &str = "spells_us.txt";

/// The two files this process reads out of one install.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpellFiles {
    /// The spell table: the one found, or `<root>/spells_us.txt` when none was.
    pub table: PathBuf,
    /// The string table beside it, which may not exist.
    pub dbstr: PathBuf,
}

/// The suffix of a spell table's file name (`spells_de.txt` → `de`), or `None` for anything else.
fn table_suffix(name: &str) -> Option<&str> {
    let lower = name.to_ascii_lowercase();
    if !lower.starts_with("spells_")
        || !lower.ends_with(".txt")
        || name.len() <= "spells_.txt".len()
    {
        return None;
    }
    let suffix = &name["spells_".len()..name.len() - ".txt".len()];
    if suffix.to_ascii_lowercase().ends_with("_str") {
        return None;
    }
    Some(suffix)
}

/// The table to read out of a folder's file names: `spells_us.txt` first, then a fixed order.
fn pick_table(names: &[String]) -> Option<String> {
    let mut tables: Vec<&String> = names.iter().filter(|n| table_suffix(n).is_some()).collect();
    if let Some(us) = tables.iter().find(|n| n.eq_ignore_ascii_case(US_TABLE)) {
        return Some((*us).clone());
    }
    tables.sort_by(|a, b| {
        a.to_lowercase()
            .cmp(&b.to_lowercase())
            .then_with(|| a.cmp(b))
    });
    tables.first().map(|n| (*n).clone())
}

fn list(root: &Path) -> Vec<String> {
    std::fs::read_dir(root).map_or_else(
        |_| Vec::new(),
        |entries| {
            entries
                .filter_map(|e| e.ok()?.file_name().into_string().ok())
                .collect()
        },
    )
}

/// The spell files to read out of one install root. Never fails.
#[must_use]
pub fn resolve(root: &Path) -> SpellFiles {
    let us = root.join(US_TABLE);
    let name = if us.exists() {
        Some(US_TABLE.to_string())
    } else {
        pick_table(&list(root))
    };
    let Some(name) = name else {
        return SpellFiles {
            table: us,
            dbstr: root.join("dbstr_us.txt"),
        };
    };
    let suffix = table_suffix(&name).unwrap_or("us");
    let own = root.join(format!("dbstr_{suffix}.txt"));
    let dbstr = if !suffix.eq_ignore_ascii_case("us") && own.exists() {
        own
    } else {
        root.join("dbstr_us.txt")
    };
    SpellFiles {
        table: root.join(&name),
        dbstr,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn folder_with(tag: &str, names: &[&str]) -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "engined-spellfiles-{}-{}-{tag}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).expect("a scratch folder");
        for n in names {
            std::fs::write(dir.join(n), "x").expect("a staged file");
        }
        dir
    }

    #[test]
    fn spells_us_is_read_when_it_is_there() {
        let dir = folder_with(
            "us",
            &[
                "spells_us.txt",
                "dbstr_us.txt",
                "spells_de.txt",
                "dbstr_de.txt",
            ],
        );
        let f = resolve(&dir);
        assert_eq!(f.table, dir.join("spells_us.txt"));
        assert_eq!(f.dbstr, dir.join("dbstr_us.txt"));
    }

    #[test]
    fn another_language_table_is_read_when_spells_us_is_missing() {
        let dir = folder_with(
            "de",
            &["spells_de.txt", "spells_de_str.txt", "dbstr_de.txt"],
        );
        let f = resolve(&dir);
        assert_eq!(f.table, dir.join("spells_de.txt"));
        assert_eq!(f.dbstr, dir.join("dbstr_de.txt"));
    }

    #[test]
    fn a_fallback_without_its_own_string_table_uses_the_us_one() {
        let dir = folder_with("fr", &["spells_fr.txt"]);
        assert_eq!(resolve(&dir).dbstr, dir.join("dbstr_us.txt"));
    }

    #[test]
    fn the_message_file_is_never_the_table_and_nothing_found_names_spells_us() {
        let dir = folder_with(
            "none",
            &["spells_us_str.txt", "spellsnew.eff", "dbstr_us.txt"],
        );
        assert_eq!(resolve(&dir).table, dir.join("spells_us.txt"));
    }

    #[test]
    fn the_order_among_fallbacks_is_fixed() {
        let names = |v: &[&str]| v.iter().map(|s| (*s).to_string()).collect::<Vec<_>>();
        assert_eq!(
            pick_table(&names(&["spells_ru.txt", "Spells_DE.txt", "spells_cn.txt"])).as_deref(),
            Some("spells_cn.txt")
        );
        assert_eq!(
            pick_table(&names(&["spells_de.txt", "SPELLS_US.TXT"])).as_deref(),
            Some("SPELLS_US.TXT")
        );
        assert_eq!(
            pick_table(&names(&["spells_us_str.txt", "spells.txt", "spells_.txt"])),
            None
        );
        assert_eq!(table_suffix("spells_de.txt.bak"), None);
    }
}
