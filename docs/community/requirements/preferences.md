# preferences: what was asked for

Every request about the Preferences screen as a whole (its rail, sections and grouping), newest at
the bottom. A request about one setting goes in that feature's own file. Nothing listed here is
removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-26 | owner | "Summarize and archive log" and "Send my loot to the wiki" are their own two sections, not inside Game. | built (rail: Log archive, Loot to the wiki; `GameSections.tsx`; the Game section keeps id `game`, now labelled EverQuest folder) |
| 2026-11-26 | owner | "can we maybe GROUP any of these preferences into categories" | built (rail headings like the main nav: GAME, DISPLAY, OVERLAYS & ALERTS, APP; `prefsRailGroups.ts`; rows indented 4px) |
| 2026-11-26 | owner | "make the preferences collapsable section categories, simliar to the main side bar" | built (`PrefsRail.tsx`: each heading folds with a chevron, kept per group across restarts like the main nav; a folded group holding the open section shows its heading selected) |
