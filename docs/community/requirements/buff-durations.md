# buff-durations: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the buff and
debuff timer lengths; nothing listed here is removed or narrowed without the owner's word
(RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-27 | AnQueth, fork issue #4 | Whirl Till You Hurl's timer shows 24 s when the spin lasts 7.5 s (Color Skew likely the same). Times should come from the log, not the spell data, and be editable. | built (per-spell choice on the Buffs tab's Durations table) |
| 2026-10-27 | owner | For issue #4: an option to calculate a spell's duration from the logs, and an option to override it by hand. | built (edit button by each estimate: Automatic, From my log = median of the last five clean casts with no wiki floor, or Set it myself; `buffTrust.durations`, engine `buffs_overrides.rs`) |
| 2026-11-19 | owner (the bug hunt of that day) | Four defects in buff durations: a saved choice did not move buffs already running (table and card showed two numbers); with "From my log" or one logged cast a card past its estimate read "~- left"; a typed duration changed what a mob's death taught the estimator and that outlived going back to Automatic; a typed 7.5 s showed as "8s" in the Durations table. | built: a saved choice restates every live buff row at once (bar, chip and the stale-row cull); past the estimate reads "past estimate" for every source and the last second reads "0s"; the death-bound rule judges against the automatic estimate only; the Durations table prints tenths under a minute like the dialog. Unit tests: engine/crates/fold/tests/duration_choice.rs, death_bounds.rs (two new), tests/buffsFormat.test.mts. Crowd-control holds already running still keep their length. |
| 2026-11-21 | owner ("if there are real bugs found fix them, why do you need to list them?") | The Automatic line says what the number is. | built 2026-11-21, not seen on screen: a death bound reads "At least this long (the target died with it on)" with a >= mark; a measured-shorter spell says so |
| 2026-11-23 | owner (bug hunt follow-up: real bugs get fixed) | A crowd-control hold already running keeps its old length after a saved choice. | built: a saved choice restates every live hold at once and announces only when a length moved (engine/crates/fold/tests/duration_choice.rs) |
| 2026-11-23 | owner (bug hunt follow-up: real bugs get fixed) | A card with time left on its bar must not read "past estimate". | built: overdue means past the estimate the bar empties against (tests/buffsFormat.test.mts). Not seen on screen |
