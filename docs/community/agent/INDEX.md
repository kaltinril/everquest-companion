# Agent index

Agent-facing notes for this fork. Humans read `docs/community/README.md`; agents read that, then
these. Repo knowledge lives here, never only in an agent's private memory: anyone who clones the
repo must get it. When you learn something a later session would need (a procedure, a trap, a
measured fact, an owner ruling), add it to the right file below on a work branch off
`main_community`, merge it, and push with the rest of the work.

| File | Read when |
| --- | --- |
| [../RULES.md](../RULES.md) | Always, first. The binding rules. |
| [WORKFLOW.md](WORKFLOW.md) | Before any branch, merge, gate, build or push. Environment, traps, owner rulings. |
| [BRANCH_NOTES.md](BRANCH_NOTES.md) | Before changing a feature. Design laws, traps, open items per feature area. |
| [../requirements/](../requirements/) | Before changing a feature. What was asked (rule 19). One file per feature area; most are named after the retired branch that built the feature. A new request goes in its area's file; a new area gets a new file. |
| [MEASURED.md](MEASURED.md) | Before reasoning about game mechanics or mining a log. |
| [DATA_REFRESH.md](DATA_REFRESH.md) | Before any wiki scrape or data top-up. |
| [../wiki-usage/README.md](../wiki-usage/README.md) | Before any wiki read, by hand or by script: every request goes in the ledger. |
| [WIKI.md](WIKI.md) | Before parsing wiki pages or writing pages for the wiki: links (site, API and its docs, the wiki's GitHub data pack), page templates, conventions, caches, what the log can give a page. |
| [../RELEASING.md](../RELEASING.md) | Before a release. |
| [../BRANCHES.md](../BRANCHES.md) | The known reds before a gate; the retired branches when tracing where code came from. |
| [../plans/2026-11-19-open-work.md](../plans/2026-11-19-open-work.md) | Open, read first after the session of 2026-11-19: what is on the trunk and how far it was checked, the e2e reds still to settle, what was running when the owner stopped the session (R7 as a WIP branch, the screen pass), what is left in order, what waits on the owner, and where the session's scripts and data are kept on this PC. |
| [../plans/2026-10-28-open-items.md](../plans/2026-10-28-open-items.md) | Open, read first: what waits on the owner, the work queued by the 2026-10-29 rulings, and the candidate work to pick from. |
| [../plans/2026-10-26-trunk-release-run.md](../plans/2026-10-26-trunk-release-run.md) | The owner's 15-step run of 2026-10-26: done, released as test.35 on 2026-10-27; the later performance passes and the open questions. |
| [../plans/2026-10-18-scrape-rebaseline.md](../plans/2026-10-18-scrape-rebaseline.md) | Open: the era rules, the stale-scrape defect, the August catch-up (phases and status). |
| [../plans/2026-10-19-gaps-all-characters.md](../plans/2026-10-19-gaps-all-characters.md) | The Gaps tab across every character: the owner's answers. |
| [../plans/2026-10-20-meter-pet-split.md](../plans/2026-10-20-meter-pet-split.md) | Before changing the damage meters' pet layouts: the third one, "With its owner" (the stacked pair); the mock and Malkil's answers. |
| [../plans/2026-10-20-gaps-item-page-facts.md](../plans/2026-10-20-gaps-item-page-facts.md) | Before changing Copy wiki page for items: what the logs give a page (forage zone, tradeskill depot, combine tradeskill), measured, in phases. |
| [../plans/2026-11-19-void-mote-ranking.md](../plans/2026-11-19-void-mote-ranking.md) | Before changing the Void motes tab's ranking: the owner's rules, the six scarcity factors and what each rests on, every constant with its measurement, the check against the owner's own mote uses, open questions. |
| [../plans/2026-11-19-reading-log-robustness.md](../plans/2026-11-19-reading-log-robustness.md) | Before changing anything on the path from the log file to "Reading log..." (the engine client and its connection, the supervisor and its watchdog, the attach and the wait for the read, the status a player is shown, the log-read box): the seven phases R1 to R7 and which are built, the defaults taken on the owner's questions, what is deferred and why, the experiments only a real machine settles. |
| [../audits/2026-11-19-log-loading-failures.md](../audits/2026-11-19-log-loading-failures.md) | Before reasoning about what the app does when the log is missing, locked, huge, cut, replaced or unreadable, when the engine dies, hangs or cannot be reached, or about what a player is shown while waiting: 88 situations traced through the engine, main and the renderer, each with what the player sees and whether the app recovers by itself. |
| [../audits/2026-11-19-bug-hunt.md](../audits/2026-11-19-bug-hunt.md) | Before hunting for bugs again, or before picking up an open defect: the whole-app hunt of 2026-11-19 (25 areas, finders on four models, a skeptic per finding): what was confirmed and fixed, what was left and why (the ones that wait on the owner are marked), what was refuted and should not be reported again, and what the finders said they did not read. |
| [../audits/2026-11-19-screen-pass.md](../audits/2026-11-19-screen-pass.md) | Before fixing a screen defect or opening a screen headlessly again: 8 screens driven in the hidden app on 2026-11-19, 55 defects reported, each with what was measured, the skeptic's verdict, the fix and the test. None is fixed. |
| [../plans/2026-11-19-own-project.md](../plans/2026-11-19-own-project.md) | Before changing the README, the rules' framing, the build's name or version, the installer or updater identity, or any text that describes this project against the original: what was rewritten on 2026-11-19 and the defaults behind it, the planned rename from TEST to Community Edition (what existing installs depend on and must never change, the corrected steps, what must be tried on a real machine), what the app itself still says, and the decisions waiting on the owner. |
| [../plans/2026-11-19-issue-sweep.md](../plans/2026-11-19-issue-sweep.md) | Before touching any fix from the 2026-11-19 issue sweep (fork #2 and #5 to #10, upstream #73 and #91): what is true of each, the plan, the defaults taken while the owner was away, what waits on the owner, the two wiki pages to fix, the reply drafts. |
| [../plans/2026-11-20-tradeskills-real-work.md](../plans/2026-11-20-tradeskills-real-work.md) | Open, before any Skills tab or tradeskill work: fork #6 reopened on 2026-11-20. What test.52 built against the six parts of the request, what the reporter's two linked guides hold, the owner's jewelcrafting measured from the archived log, six slices in order (recipe ladder first), and what waits on the owner. |
| [../plans/2026-10-20-screenshot-to-wiki.md](../plans/2026-10-20-screenshot-to-wiki.md) | Before changing screenshot to wiki: a pasted item window read locally (OCR and the game's own font) into the page, its `lucy_img_ID` from the game's own icon sheets; the measurements, the UI quirks, what is not built. |
| [../audits/2026-10-19-gaps-review.md](../audits/2026-10-19-gaps-review.md) | Before changing the Gaps tab: the review, the owner's eight decisions, what is left. |
| [../audits/2026-10-20-performance-review.md](../audits/2026-10-20-performance-review.md) | Before any performance work: what was measured, what is fixed, the ranked structural findings and quick wins. |
| [../audits/2026-11-06-fold-hot-paths.md](../audits/2026-11-06-fold-hot-paths.md) | Before any engine fold or parser performance work: the per-line costs ranked (top 10), the six fixed over two passes (buffs sweep memo, roster revision, hand-rolled line and melee splits, one-hash aggregate lookups, borrowed miss line), how to re-measure with `parity --stages`. |
| [../audits/2026-11-06-whole-app-review.md](../audits/2026-11-06-whole-app-review.md) | Before any performance work anywhere: the whole-app review (six areas, merged top 20 with status), the per-area lists, how to re-measure. |
| [../audits/2026-11-12-quick-review.md](../audits/2026-11-12-quick-review.md) | Before picking small fixes: a one-hour review's five fixes with timings, and ten open findings ranked. |

Notes, plans, audits, requirements and ledgers written before 2026-10-26 name the branches of the
time (`catch_all`, `local-data-refresh`, `gaps-tab` ...). Those branches are retired and their work
is all on `main_community`: read such a name as the feature area, and never as a place to commit.

Write style for these files: terse bullets, commands and facts, the reason in one clause. No
narrative, no session diaries, no commit hashes that only describe history. Record owner rulings
as decision + reason in neutral words (RULES.md rule 5).
