# fix-combat-reading-log: what was asked for

Every request this fix has taken, newest at the bottom. Read it before changing the fix;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-20 | tester (Malkil), via owner | The Combat tab shows "Reading log…" and takes a long time to load, as if re-reading the log. Owner: keep the last snapshot across visits and only say "Reading log…" when the log is really being read ("sure do that"). | built (`combatFeed.ts`: kept per world, 3 s grace for a hydrating answer after a real one, polls coalesced) |
| 2026-10-20 | owner | Find out why his machine takes so long to process a log that is small. | open: nothing on this machine records the engine's own timings in a packaged build; the tester's `errors.log` is asked for (an engine that stops answering is restarted and re-reads the whole log, which shows "Reading log…" mid-session) |
| 2026-11-09 | eekwon (fork #9); owner 2026-11-19 | "My app is stuck at Reading log... for the past couple of days." Owner: "add in some error checking to log loading, and some error reporting (to you) so you can show me what's going on with a screenshot". | built (plans/2026-11-19-issue-sweep.md, phase 4): main records each failure on the log-loading path (`logReadState.ts`) and stops waiting when the engine says the read ended (`foldWait.ts`, `idle`); after 15 s, or at once for a dead read, the Overview and Combat "Reading log…" panels show a box (`LogReadReport.tsx`, words in `shared/logReadReport.ts`) with what the app is waiting on, the log's name and size, how far the read got, the engine's state, the last error and the version. No retry yet; the full path and the Windows user name never reach the screen |
