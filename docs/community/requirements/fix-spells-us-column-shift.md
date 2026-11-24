# fix-spells-us-column-shift: what was asked for

Every request this fix has taken, newest at the bottom. Read it before changing the fix;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-13 | owner | The 2026-10-13 game patch inserted a column into spells_us.txt (between fields 52 and 75); every field read from 75 on is one off in both readers (TS spellsUsParse.ts, Rust fold spells_us.rs), so resists, debuffs, stacking and spell categories are wrong. Fix both, for old and new clients alike, and get the three tests it broke green again. | built (both readers detect the layout; matches the pre-patch parse on every shared field but one genuinely patched spell; the three tests pass; known reds removed) |
| 2026-10-13 | owner | File an upstream issue that it is broken, and offer the creator the fix as a pull request. | built (issue #87, PR #88) |
| 2026-11-17 | owner ("get things updated"; found by the gate) | The 2026-11-16 game patch added sixteen columns after aemaxtargets: the effect slots moved 173 -> 189, so every spell parsed with no effect slots (stacking, buff conflicts, resist estimates, the same three tests red on an untouched trunk). Both readers read it, and the saved parse is rebuilt. | built (the layout is a count of columns the slots moved, 0 / 1 / 17; `SPELL_RESIST_CACHE_VERSION` 10) |
| 2026-11-23 | owner (answering the bug hunt's open questions): "well that's US, what about other country/languages? also, shouldn't we be packing this?" (asked whether Spells shows a notice when spells_us.txt is missing) | Open: how a client in another language names its spell files, and whether the app ships spell data of its own. No ruling on the notice yet. | answered by the next row |
| 2026-11-23 | owner ("ok then yeah dont' shipt spells_us"; "sure show notice and look for alternative.") | The app ships no spell file of its own. When spells_us.txt is missing, Spells shows a notice that stays up, and the app first looks for another spells_*.txt in the EQ folder. | built: one resolver (`resist/spellFiles.ts`, engine twin `spell_files.rs`) for every reader; a notice that cannot be closed while no file is found, a quiet line naming a fallback file, and the same warning for a file that cannot be read |
