# macro-editor: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

Plan, research and the in-game tests still owed: `../plans/2026-11-20-macro-editor.md`.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-20 | eekwon (fork #11) | "A macro editor in the Companion app": edit macros outside EQL. | open: proof of concept (P0) edits a library kept by the app; it does not write the game's file |
| 2026-11-20 | eekwon (fork #11) | "edit, copy, and move around" macros. | open: P0 has edit, duplicate, and placing a macro on any slot of a set |
| 2026-11-20 | eekwon (fork #11) | Macros are "not easily moveable between loadouts". | open: P0 reads every character and loadout file and imports from any of them; sending a set to a loadout's file is P2 |
| 2026-11-20 | eekwon (fork #11) | "macro sets to load in and out when you reach the macro limit" (the reporter says the limit is 100). | open: P0 has named sets; loading one into the game is P2. The limit itself is not measured |
| 2026-11-20 | ziplock9000 (fork #11, comment) | "Does EQL let you save and load macros as a file?" | answered by the research: the game keeps them in a text file per character and loadout; it has no load-from-file command that was found |
| 2026-11-20 | owner ("A user wants to be able to have a set of macro's they manage, they'll need to be able to have names for them, all the data that's normally stored in the game ini file for the macro") | A managed library holding everything the game stores for a macro. | open: P0 (name, colour number, five lines) |
| 2026-11-20 | owner ("perhaps they can add category tags in our app so they can find the correct ones easier like tradeskill, quest, language, healing, offense, etc") | Category tags, to find a macro. | open: P0 (starter tags plus the player's own, filter and search) |
| 2026-11-20 | owner ("allow them all the luxuries of normal editors, but we'd want to add in anything you can find online that is commonplace") | The comforts of a normal editor, plus what players commonly do with macros. | open: P0 has search, duplicate, undo of a delete, limits checked while typing, paste in and copy out in the ini's own form. The research list is in the plan |
| 2026-11-20 | owner ("Keep this page mostly isolated.") | The page stands apart from the rest of the app. | open: P0 is one feature folder, one store file, its own channels; the only shared edits are the tab's registration |
| 2026-11-20 | owner ("let them mix/match and chose which they want to use on a specific character") | Choose which macros a given character uses. | open: P0 lets a set be chosen per character file and shows what would change; applying it is P2 |
| 2026-11-20 | owner ("investigation question, do not code it yet"; then "build out a proof of concept, and finally list the remaining items you need me to validate in game") | A proof of concept, then the list of in-game checks. | built 2026-11-20 as P0 (Library, Sets, Characters), not yet seen on screen by anyone; the checks are in the plan, "In-game tests owed" |
| 2026-11-20 | owner ("and this proof of concept is a normal HTML page you build for these types of POC with a link?"; "a mockup"; "mockup first please :) Then you can send the agent back to building the real thing") | A clickable mockup page with a link, before the real build. | done: https://claude.ai/artifact/JkMN41trsBNEeY18EgGXUT ; the screens follow it. A proof of concept for the owner means a mockup page first |
| 2026-11-20 | owner ("do any research you can yourself that doesn't break EQL rules like scanning their CODE files") | Research without reading the game's code. | done: the game's text files only (ini, UI layout XML, message tables, help pages) and public guides; no executable or library was opened. Sources in the plan |
| 2026-11-20 | owner ("We should always backup the ini before the first time we touch it") | Before the app first writes a game ini, it keeps a copy of the file as it was. | open: binds P2 and any test edit an agent makes by hand. No write to a game ini exists yet |
| 2026-11-20 | owner ("Original copy and last version. Dated or something yeah in folder. Build it") | Two copies are kept in the game folder beside the ini, each dated: the file as it was before the app ever wrote it, and the version just before the latest write. And: build the step that sends a set to the game file. | open: being built as P2 on `macro-send` |
