# overview: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The
original design is `docs/plans/overview-tab.md`; the widget plan is
`docs/community/plans/2026-11-27-overview-widgets.md`.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-27 | owner | "i think we need the overview section to get some love ... Perhaps we need overview to contain "widgets" from each of the tabs/sections and they can checkmark/chose which sections go on their personal overlay? and with what settings on their filters (like bazaar they could put a specific item or search with specific settings?)" | Phase 1 built 2026-11-28 (show/hide and order every card); Phase 2 widgets with saved filters planned |
| 2026-11-27 | owner | "for now, just document it, and, identify the quick wins to put on the overview that don't require the extra filters saving functionality" | done: 14 quick-win cards in the plan |
| 2026-11-27 | owner | Every card can be added and removed: "they should be able to add widgets at will and remove at will", the existing cards included. | built 2026-11-28: Customize checklist, every card can be turned on or off and moved |
| 2026-11-27 | owner | One layout per install: "always the same for every character on that computer". | built 2026-11-28: settings store key `overviewLayout` |
| 2026-11-27 | owner | First batch: buffs running out, respawns here, motes, coin, plus the Customize checklist. | built 2026-11-28 (new cards default off) |
| 2026-11-27 | owner | Backlog, do not build yet: "a very very small 1 line overlay where they can just pick/chose the things they want to include ... like "show DPS" and a single line would appear, sort of like the XP overlay is, but they chose what shows up there". | backlog |
| 2026-11-28 | owner | After seeing Phase 1: "i think someone should be able to drag/drop to place them. they should be able to chose the width of the panels 1, 2, 3, or 4 units wide. for instance motes doesn't need to be that big, so it could be smaller, imagine splitting the image size here up into 4 with the padding/borders". | built 2026-11-28 (branch `overview-grid`): a 4-column grid, each card 1 to 4 columns wide, "Edit layout" with drag and drop, a width control and earlier/later buttons; widths stored per card in the per-install layout |
