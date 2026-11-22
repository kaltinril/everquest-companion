# feedback-and-analytics: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-20 | owner | The menu's Send feedback row ("Off in the community build") is removed or becomes "Open github issue". | built (issue-link, not yet tested in the app): the row reads "Open GitHub issue" and opens this repo's new-issue page in the browser |
| 2026-11-20 | owner | The Feedback page in Preferences sends people to the owner's GitHub and asks them to open an issue. | built (issue-link, not yet tested in the app): one sentence and two links, "Open a GitHub issue" and "See open issues"; the crash screen's and the engine failure card's "Report this" open the same new-issue page |
| 2026-11-20 | owner | Remove all code associated with feedback and usage analytics. | built (issue-link, analytics-removal): the screens, then the code behind them in main, preload, shared, the owner-only Triage tab, tests, scripts, `infra/` and its workflow, and `TELEMETRY.md`. Kept because local features use them: the atomic file write, the error log's budget, the log tail reader, the `telemetry` key in old settings files. Leftovers removed the same day on the owner's word: the three perf probes only the reports read (live probe and its worker, stall attribution, tail I/O stats) and six unused dev packages (`pg`, `@types/pg`, four `@aws-sdk/*`). `@aws-sdk/credential-providers` stays for `scripts/aws-console.mts`. The build config lost a worker entry, so the next `npm run dist` is its packaged check (RULES.md rule 11) |
| 2026-11-21 | owner (backlog) | Remove the explain skill's dangling reference to the deleted feedback-triage skill. | done on `backlog-small` |
