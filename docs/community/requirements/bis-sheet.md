# bis-sheet: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The plan
and the asks word for word: `plans/2026-11-24-bis-sheet.md`.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-24 | Malkil (tester, relayed by the owner) | An experimental Best in Slot sheet for gear. | planned |
| 2026-11-24 | Malkil | The player picks classes; only gear those classes can use is recommended. | planned |
| 2026-11-24 | Malkil | The player weights stats by dragging each into a tier: S, A, B, C, D, F. The recommendations follow those weights. | planned |
| 2026-11-24 | Malkil | Almost any item stat can be tiered, except Race, Class, Size, Weight, Skill, Lore Equipped, No Trade, Placeable and Exaltations. | planned |
| 2026-11-24 | Malkil | Exaltation recommendations stay on their own tab for now. | planned (the sheet does not touch exaltations) |
| 2026-11-24 | Malkil | Respect Lore Equipped when deciding whether more than one of an item can be equipped. | planned |
| 2026-11-24 | Malkil | 1H melee ratio, 2H melee ratio and ranged ratio are three separate stats for tiering. | planned |
| 2026-11-24 | Malkil | Whatever their tier, weapon ratios never count for either of the two ANY slots. | planned |
| 2026-11-24 | Malkil | Suggestions for the feature before it is built. | done (the plan's Suggestions section) |
| 2026-11-24 | owner | The tier board uses the saved reference image's look (`plans/2026-11-24-bis-sheet/tier-list-reference.png`), the one players know from videos. | planned (read as: the board is built in CSS to match the image; owner to confirm, plan question 1) |
| 2026-11-24 | owner | The feature corrects and ties into the existing BEST column, which today is a fixed formula the player cannot see or change. | planned |
| 2026-11-24 | owner | The default tier list is what the existing BEST formula shows. | superseded the same day by the owner (row "I didn't tell you to assign values to stats baesd on my old formula" below): defaults now come from class guides and game formulas |
| 2026-11-24 | owner | The player can cross a stat off (maxed STR, maxed haste, HP regen, anything) so it stops counting, or counts less. | planned |
| 2026-11-24 | owner | Built in a worktree; not merged into `main_community` until the owner says. | done: merged on the owner's word (row below) |
| 2026-11-24 | Malkil (on the owner's phone, mockup v1) | With his ranger board (RNG, MAG, WIZ; DEX, Attack, Haste and Ranged ratio in S) the sheet recommended "Rediculous items for head slot as best": Al`Kabor's Cap of Binding (Wizard-only; INT, HP, Mana, two resists, AC) over DEX helms. | fixed in mockup v2 (Executioners Hood, DEX 9, on HEAD); the old BEST formula ranks the cap first too (48.0 against about 14.5 for the hood) |
| 2026-11-24 | owner | "I didn't tell you to assign values to stats baesd on my old formula though.." and "remember this is a experiment to find the best in slot without my old calculations". | built in mockup v2; in the app with batch A: no default, unit or weight comes from `roleWeights.ts` |
| 2026-11-24 | owner | INT and WIS "provide nothing for damage, they Jaut provide mana pool (which can help with overall sustained dps yes)". | built: INT and WIS count only as the mana they give the picked classes (game formula), inside the Mana stat |
| 2026-11-24 | owner | "if ranger is in the classes, and they specifically put Dex at s tier that's the most important period." | built: each tier counts 4x the one below by default (2x and "S always wins" selectable) |
| 2026-11-24 | owner | "Review online information", "use any online guides to help hone the calculations"; "experiment with classes and stats and tiers". | done: research (TAKP/EQMacEmu source, Almar's class guides, the Legends wiki's Statistics, Game Mechanics and Archery pages); facts in `agent/MEASURED.md`, design in the plan's "Version 2" |
| 2026-11-24 | owner | Figure out the "budget" for each item: "I assume eq has some sort of formula for max they give to an item based on base stats. There may be a difference in old gear and the newer revamped gear that came with legends only." | measured: no public formula, and items of one level vary about 4x; each item shows its budget against the typical item of its slot and drop level; Legends revamp gear is budgeted like level 40-50 classic gear with more haste |
| 2026-11-24 | Malkil, then the owner | Mockup v2: "it's not perfect but it's a lot better"; owner: "build it". | built (batch A: P1 to P4), gated |
| 2026-11-24 | owner | "get this merged into main_community and pushed up and the remaining work in a plan feature doc" | done: merged and pushed; the plan's "Remaining work" section (R1 to R8) |
