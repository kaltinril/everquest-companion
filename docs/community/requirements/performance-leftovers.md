# performance-leftovers: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Source: audits/2026-10-20-performance-review.md.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-29 | owner | Do the performance review's leftovers ("performance improvements are good"): the engine "met" module (loot/kills stop re-fetching per kill) and one engine connection served in order. | built (perf-leftovers, not yet tested in the app): an engine `met` module of names met and the roster's kill records feeds the met-in-log feed and the boss celebration, the turn-in watch reads no loot, and the Sky overlay's counts are read only while it is open (~7.4 MB to ~15 KB re-read per kill on a tab that shows none of them); the one-connection item measured and not built (a collided small read 48.5 to 12.5 ms in the engine, ~5-15 ms in the app, now rare): audit, "Done 2026-10-29" |
| 2026-11-21 | backlog (open-work item 6) | A pickup does not re-send the whole loot history to each window. | designed, not built: `plans/2026-11-21-loot-append-frames.md`; the owner chooses |
| 2026-11-21 | owner ("if we can fix lag and make things better for a user do it as long as it doesn't compromise correctness") | A pickup does not re-send the whole loot history; a window's ledger is never spliced, reordered, duplicated or stale. | step 1 built 2026-11-21: append frames for the main window and XP overlay, no engine change. Unit tests and a seeded walk against a full read pass. Timing, e2e and the running app not checked |
