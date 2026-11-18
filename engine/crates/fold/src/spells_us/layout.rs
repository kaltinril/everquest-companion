//! Which column layout a client's `spells_us.txt` is in — the TypeScript reader's twin
//! (`src/main/resist/spellsUsLayout.ts`), one rule for both.
//!
//! THE 2026-10-13 GAME PATCH INSERTED ONE COLUMN somewhere in fields 52..=75. Measured on the
//! owner's patched install: the icon moved 75 -> 76, the resist adjustment 78 -> 79, the effect
//! slots 172 -> 173, while everything up to the class levels (36..=51) stayed put. No reader
//! takes a field in 52..=74, so dropping ONE column at 52 from every row of a patched file puts
//! every field a reader takes back where the parser expects it, whichever column the patch added.
//!
//! THE 2026-11-16 GAME PATCH INSERTED SIXTEEN MORE, after `aemaxtargets`. Measured on the owner's
//! install against the app's saved parse of the file before it (48,296 rows joined by id): the
//! icon, resist adjustment, good-effect flag and aemaxtargets (144) stayed put, and the effect
//! slots moved 173 -> 189 on 190-field rows. No reader takes a field between aemaxtargets and the
//! slots, so dropping the extra columns right after aemaxtargets puts the slots back at 172.
//!
//! The layout is read from the file: the effect-slot list (`1|35|1|0|100|0$2|...`) is the first
//! such field at 172 or later, and the majority over a sample of rows says how far it has moved,
//! so an unpatched client and the tests' 173-field rows parse exactly as before.

/// Where the extra column is dropped from a patched row. Any index in 52..=75 restores every read field.
pub const INSERTED_COLUMN: usize = 52;
/// Where the 2026-11-16 columns are dropped, once column 52 is gone: right after aemaxtargets (143).
pub const EXTRA_COLUMNS_AT: usize = 144;
const OLD_SLOTS: usize = 172;
/// Rows sampled to decide; the effect lists start within the first few hundred rows.
const SAMPLE_ROWS: usize = 4000;

/// `1|...`: digits, then a bar — the head of an effect-slot list.
fn is_slot_list(s: &str) -> bool {
    let digits = s.bytes().take_while(u8::is_ascii_digit).count();
    digits > 0 && s.as_bytes().get(digits) == Some(&b'|')
}

/// How many columns past 172 the effect slots sit: 0 in an unpatched file, 1 since the 2026-10-13
/// patch, 17 since 2026-11-16. The most common answer over the sample; a tie goes to the smaller.
#[must_use]
pub fn shift(text: &str) -> usize {
    let mut votes: std::collections::BTreeMap<usize, usize> = std::collections::BTreeMap::new();
    for line in text.split('\n').take(SAMPLE_ROWS) {
        let at = line.split('^').enumerate().skip(OLD_SLOTS).find(|(_, f)| is_slot_list(f));
        if let Some((i, _)) = at {
            *votes.entry(i - OLD_SLOTS).or_default() += 1;
        }
    }
    // Ascending by shift, so the first of equal counts (the smaller shift) stands.
    let mut best = (0usize, 0usize);
    for (by, n) in votes {
        if n > best.1 {
            best = (by, n);
        }
    }
    best.0
}

/// A row's fields in the layout the reader indexes: the column inserted at 52 dropped from a patched
/// row, and any further columns (`shift` beyond 1) dropped from before the effect slots.
#[must_use]
pub fn unshift(mut f: Vec<&str>, shift: usize) -> Vec<&str> {
    if shift >= 1 && f.len() > INSERTED_COLUMN {
        f.remove(INSERTED_COLUMN);
    }
    if shift > 1 && f.len() >= EXTRA_COLUMNS_AT + shift {
        f.drain(EXTRA_COLUMNS_AT..EXTRA_COLUMNS_AT + shift - 1);
    }
    f
}

/// A field, as `f[i]` reads over there: `undefined` past the end, which `Number` reads as `NaN` and
/// `Number(x) || 0` reads as 0.
pub(super) fn field<'a>(f: &[&'a str], i: usize) -> Option<&'a str> {
    f.get(i).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(len: usize, slots_at: usize) -> String {
        let mut f: Vec<String> = (0..len).map(|i| i.to_string()).collect();
        f[slots_at] = "1|35|1|0|100|0$2|0|-1|0|101|11".to_string();
        f.join("^")
    }

    #[test]
    fn the_old_layout_is_left_alone() {
        let text = [row(173, 172), row(173, 172)].join("\n");
        assert_eq!(shift(&text), 0);
        let f: Vec<&str> = text.lines().next().unwrap().split('^').collect();
        assert_eq!(unshift(f.clone(), 0).len(), f.len());
    }

    #[test]
    fn the_patched_layout_is_detected_and_unshifted() {
        let text = [row(174, 173), row(174, 173), row(174, 172)].join("\n");
        assert_eq!(shift(&text), 1);
        let line = row(174, 173);
        let f = unshift(line.split('^').collect(), 1);
        assert_eq!(f.len(), 173);
        assert!(is_slot_list(f[OLD_SLOTS]), "the slots are back at 172");
    }

    /// The 2026-11-16 patch: 190 fields, the slots last, sixteen new columns after aemaxtargets.
    #[test]
    fn the_sixteen_column_patch_is_detected_and_every_read_field_is_back() {
        let text = [row(190, 189), row(190, 189), row(174, 173)].join("\n");
        assert_eq!(shift(&text), 17);
        let line = row(190, 189);
        let f = unshift(line.split('^').collect(), 17);
        assert_eq!(f.len(), 173);
        assert!(is_slot_list(f[OLD_SLOTS]), "the slots are back at 172");
        // The fields a reader takes, by where they sit in the patched file: icon 76, resist
        // adjustment 79, good effect 127, aemaxtargets 144.
        assert_eq!((f[75], f[78], f[126], f[143]), ("76", "79", "127", "144"));
        assert_eq!(f[51], "51", "the class levels never moved");
    }

    #[test]
    fn equal_votes_keep_the_smaller_shift() {
        let text = [row(174, 173), row(173, 172)].join("\n");
        assert_eq!(shift(&text), 0);
    }

    #[test]
    fn a_file_with_no_long_rows_is_not_shifted() {
        assert_eq!(shift("1^Short^row"), 0);
    }
}
