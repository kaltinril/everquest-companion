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
| 2026-11-24 | owner (R1 app check, Malkil's gear) | Budget: "what was the budget calculation they're ridiculous and all over the place on %"; "Don't use this weird calculation you invented, you can show it but don't use it." | done: it never ranked anything (display only); now shown only in the slot hover, worded "Stat budget estimate ... (our own estimate; it does not change the ranking)" |
| 2026-11-24 | owner (R1) | "you cant' stack HASTE items. So having 5 items with haste does nothing extra, you just get the highest haste amongst all the items with haste" | done: the loadout search already counted haste once; each card, runner-up and the worn compare now count a slot's haste only above the best haste of the other slots (`cellScore`), with a note when haste does not count |
| 2026-11-24 | owner (R1) | "where does this "my classes (class guide)" come from? and are we correctly accrediting the source?" | done: it is our reading of Almar's classic class guides (almarsguides.com), which give prose, not tiers; the preset is now "My classes (from Almar's guides)" and a credit line under the controls says the tier placement is ours |
| 2026-11-24 | owner (R1) | Rename "Doesn't count" to "unassigned". | done: the lane, the chip menu and the totals read Unassigned |
| 2026-11-24 | owner (R1) | The /outputfile line's "how" is "WAY WAY WAY over to the right ... Move it in front or directly after". | done: Refresh and How sit right after the command on every /outputfile line; only the timestamps stay right |
| 2026-11-24 | owner (R1) | Remove the "worn now" line and the source line from the cards ("the user can just click on the item"). | done: both left the card; the source is in the hover |
| 2026-11-24 | owner (R1) | "On hover of a slot, show the comparison between the recommended BiS item and the worn item. Along with the source (location/mob/crafted) to obtain it." | done: `BisCompare.tsx`, both items scored the card's way, stat by stat, worn at +0 |
| 2026-11-24 | owner (R1) | Show item icons. | done: on the card and the next-best rows |
| 2026-11-24 | owner (R1) | "do some sort of border if there is a suggested difference for the slot". | done: amber border when the best item is not what is worn |
| 2026-11-24 | owner (R1) | "Button with a + that on hover says "add to wishlist"". | done: on the card and each next-best row; a tick once on the list, which takes it off |
| 2026-11-24 | owner (R1) | "should be able to save the users Teir list settings, let them NAME them too". | done: "My tier lists" (`eq.gear.tierLists`): save under a name, pick to load, delete |
| 2026-11-24 | owner (R1) | In the next best five, the worn item's row is highlighted. | done: green row marked "worn" |
| 2026-11-24 | owner (R1) | "a clear tier button so all stats drop to the "unassigned" section". | done: Clear tiers |
| 2026-11-24 | owner (R1) | "like with all other pages, the classes needs a "detected" chip they can just click". | done: the Gear tab's "detected: ..." chip, same rule (shown when the pick differs from what the app detects) |
| 2026-11-24 | owner (R1) | "i have earring of bashing, just on the other ear"; "if an item is lore i can't equip 2"; "it's recommending wrists i already have also like back straps of mastery and hotof's bracers, just because i have them on the other writs". | fixed: the sheet never placed a Lore item twice, but a pair's two picks came out in either order; `alignPairsToWorn` now lays ears, wrists, fingers and the two Any slots on the side the item is worn (same scores, same total) |
