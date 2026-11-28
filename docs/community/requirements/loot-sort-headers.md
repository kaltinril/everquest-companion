# loot-sort-headers: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-13 | owner | The Loot tab's grouped table sorts by clicking its column headers, like the other tabs, instead of the Sort dropdown. | built (every column sorts, a second click flips it; the old stored `eq.lootSort` choice still reads) |
| 2026-11-19 | owner (the bug hunt of that day) | A lore or quest item looted with the Loot tab open, or already on screen when the app starts on the Loot tab, got no Notable pickups chip until the tab was left and reopened. | built (the probe now waits for an item's marks when its row asked for them first, so the chip shows the first time; `fetchItemMarks` in `lib/itemMarks.ts`, pinned in `tests/itemMarks.test.mts` and `tests/useNotablePickups.test.mts`) |
| 2026-11-23 | owner (answering the bug hunt's open questions): "LOOT drops? probalby per character instead" | The Loot tab's Group by item is remembered per character. | built: `eq.loot.groupByItem.byCharacter` (shared/characterFlags.ts), on by default |
| 2026-11-27 | owner ("lets do all the agent's recommendations", duplicate item H, dup-ui-b-6) | Loot times read 24-hour in the shape of the timeslice caption above the ledger: "Aug 5, 20:26", not "Aug 05, 08:26 PM". The App source and the Engine source print the same string. | built: `formatShortStamp` in `lib/formatDate.ts` (Loot rows and the caption share it); the engine's `display_time` (`engined/src/views/loot.rs`, also `progression.recent`) renders the same shape; pinned in `tests/formatDate.test.mts`, the `views::loot` unit tests and `engine-loot-view.e2e.mts` |
