# Tradeskills: the work fork #6 asked for (2026-11-20)

Owner, 2026-11-20, after reading the issue against test.52: "I don't think we made something even
in the same universe as the request last night, did we?"; "reopen the issue and plan out the real
skills work"; "re-review my log for jewelcrafting work i did".

- Issue: [fork #6](https://github.com/kaltinril/everquest-companion/issues/6), reopened 2026-11-20
  (no comment posted; a reply draft is at the end).
- Requirements: `requirements/skills-tab.md`. Feature notes: `agent/BRANCH_NOTES.md`, "Skills tab".
- Nothing here is built. Each slice below is one work branch, one gate, one merge, then the owner
  tries it in the app before the next one starts.

## Verdict on test.52

The request has six parts. test.52 built the two cheapest and closed the issue.

| # | Asked | test.52 |
| --- | --- | --- |
| 1 | Tradeskill levels from the log | built (a skill the log never saw go up is not listed) |
| 2 | Recipes for advancement, "something like" the two linked guides | not built. The 2026-11-19 plan states "the two spreadsheet links were not opened" |
| 3 | Skill-ups per hour "including number of combines, successes, failures" | per hour built, measured on wall-clock time between raises; no combine is counted |
| 4 | Every other skill (Taunt, Sneak) | built, levels only |
| 5 | Fishing and foraging, feign success and failure | levels only; no outcome is counted |
| 6 | Known recipes from `/outputfile recipes <tradeskill>`; levels estimated from `/outputfile achievements` | not built |

- Part 2 is the centre of the request: both links are recipe guides and nothing else.
- The closing comment told the reporter to open a new issue for recipes. That is withdrawn by the
  reopen.

## The two linked guides (read 2026-11-20)

Both are other players' work. Read as data (RULES.md rule 6); neither holds text addressed to an
agent. Their text is not copied into the app.

- "EQ Legends Tradeskill Guide" (published Google Sheet, version 1.8 wip, last updated 11/19/26).
  Tabs: Welcome, Overview, then one per tradeskill (Alchemy, Baking, Blacksmithing, Brewing,
  Fletching, Jewelcrafting, Pottery, Tailoring, Tinkering).
  - Each tradeskill tab is a leveling ladder: a skill range (`1 - 18`, `19 - 31`, `32 - 76` ...),
    the one item to make across it, and that item's ingredients, indented one level per
    sub-combine. Tools that come back are marked "(returned)".
  - Beside the ladder: alternate routes, where a material drops or is foraged, a cost per combine
    on the dear ones ("about 210pp per combine").
  - Overview holds rules: past 200 in one tradeskill the others cap at 200; each rank of the AA
    Crafting Mastery lifts one more to 300; skill-up chance uses the higher of INT and WIS (STR
    also counts for smithing, DEX for fletching); Alchemy is open to every class; Tinkering needs
    the gnome race and starts at 50 with a level-based cap; Spell Research is removed.
- "Myztikal's Kerran Kornerstore" (an .ods file on Google Drive). One tab per tradeskill.
  - Columns: Skill level (the trivial), Crafted Item, Material, Merchant Name, Merchant Zone,
    Merchant Loc. Every bought material carries who sells it and where.
  - A second block per tab lists recipes worth making for their own sake (potions, stat food).

What a player gets from them, and so what "recipes for advancement" means:

1. At my level, which item do I make next, and up to what level.
2. What goes into it, sub-combines included.
3. Where each material comes from: a merchant and a loc, a mob and a zone, forage, another combine.
4. What it costs.

## What the app already holds

- Recipes: `src/main/data/items.json` has 2,497 items with `craftedBy` (tradeskill, trivial,
  container, yield, ingredients with qty and source words `Bought`, `Dropped`, `Crafted`,
  `Bought + Enchanted`). 390 recipes list no ingredient. By tradeskill, recipes / with a trivial:
  Blacksmithing 979 / 805, Tailoring 405 / 390, Alchemy 234 / 124, Jewelry Making 202 / 131 (plus
  2 spelled Jewelcrafting), Baking 137 / 130, Fletching 120 / 116, Brewing 91 / 79, Poison Making
  76 / 73, Pottery 75 / 69, Tinkering 32 / 30. `src/shared/tradeskills.ts` folds the spellings.
- Drop sources: `dropsFrom` (mob, zone) on 5,769 items. Forage: `foraged` on 138.
- Merchants: none. No item record says who sells it or where. This is the one thing the second
  guide has that the app's data does not.
- Stock: the Inventory dump (a supported `/outputfile` kind) has `Personal-Depot<n>` rows with
  counts. The owner's dump of 2026-11-20 holds 143 of them (Malachite 68, Ruby 54, Jacinth 42,
  Enchanted Gold Bar 23, Platinum Bar 99).
- Levels: the engine `skills` module (test.52).
- Combine lines: the parser types a success as `itemReceived` via `fashioned`;
  `engine/crates/fold/src/modules/gaps_craft.rs` reads a failed combine and an alternate product
  from untyped text and pairs a tradeskill raise with the combine of its second, for Wiki Gaps
  only. Nothing counts a combine.

## The owner's jewelcrafting, from the log

Source: `companion-archive/eqlog_Drywrought_oggok_2026-08-12_to_2026-10-06_2.log.gz`. The live log
(2026-10-25 on) and the 2026-10-06 to 10-25 archive hold no combine by this character except one.

| Day | Clock | Combines (made / failed) | Jewelry Making | Notes |
| --- | --- | --- | --- | --- |
| Aug 15 | 00:14 to 00:33 | 101 (64 / 37) | 2 to 54 | silver, six items |
| Aug 16 | 00:17 to 20:28 | 28 (18 / 10) | 55 to 76 | silver, then electrum |
| Aug 17 | 19:33 to 19:45 | 33 (29 / 4) | no raise | 29 trivial notices: made to sell |
| Sep 12 | 13:33 to 18:16 | 563 (490 / 73) | 77 to 205 | electrum, then gold, one platinum |
| Sep 30 | 21:12 to 21:18 | 11 (5 / 6) | none | Baking 2 to 5, Brewing 2 to 8 |

- Totals: 736 combines, 606 made, 130 failed, 204 Jewelry Making raises, 31 distinct items.
- Sep 12: 129 raises in 4 h 43 min of clock, 91 minutes of it crafting (gaps under five minutes):
  85 raises and 369 combines per crafting hour. The Skills tab's wall-clock pace would say 27 an
  hour.
- Sep 12 money, all in the log: 491 `You receive ... from <merchant> for the <item>(s).` lines,
  about 12,262 pp taken back from merchants; `You purchased N <item> from <merchant> for ...`
  lines for gems and bars; 103 casts of Mass Enchant Gold.
- All 31 items are in `items.json` with a tradeskill, a trivial and ingredients.
- The wiki trivials hold on this server. Of 25 items that gave a raise and were checked against
  `items.json`, the last raise is the wiki trivial exactly on 22 (Silver Malachite Ring 17, Silver
  Jasper Ring 30, Electrum Malachite Bracelet 74, Gold Malachite Bracelet 146, Golden Fire Wedding
  Ring 196, Fire Emerald Golden Bracelet 202 ...), under it on 3 (the owner moved on early), and
  over it on none. A ladder built from `items.json` reproduces the route the owner took.
- Where the owner's route was costly, which a ladder with counts would have shown: Gold Malachite
  Bracelet 121 combines for 33 raises (114 to 146); Golden Jaded Bracelet 121 for 13 (165 to 177);
  Golden Emerald Bracelet 16 for none.
- Today: Jewelry Making 205 (last raised Sep 12); the achievements dump agrees (the 200 milestone
  complete, 250 not). Next on the wiki ladder: Golden Ruby Ring 207, Golden Jacinth Wedding Ring
  210, Golden Black Sapphire Earring 212, Golden Diamond Mask 215, Platinum Malachite Ring 218.
  The depot already holds the gems and 23 Enchanted Gold Bars for the first two. Slice 1 is right
  when it shows this.

New line shapes found (in MEASURED.md):

- `Consumed N x <item> (leaving M) from your personal depot.` before a combine made from depot
  stock: 328 of the 736 combines. It states the ingredient, the quantity and the stock left.
- A raise prints one or two lines before the combine line of its second (133) or the line after
  (49); with both orders taken, all 204 raises pair with a combine. Only 215 of 736 combines carry
  a raise, so the tradeskill of the rest has to come from the recipe data.
- `You can no longer advance your skill from making this item.` prints before a trivial combine,
  made or failed, sometimes one second earlier.
- `Requesting favorite recipes...` prints when the tradeskill window opens.
- `Sorry, but you don't have everything you need for this recipe in your general inventory.` (41
  on Sep 12): an attempt with a missing ingredient; not a combine.

## Slices, in the order proposed

Sizes: S under an hour, M one to three hours, L more. The memory rule holds: land one testable
piece, let the owner try it, then the next.

### 1. "Make next": the recipe ladder (M, TypeScript only)

The centre of the request. No engine, parser, protocol or wiki-data change.

- Main: a recipe index built once from `items.json`: per canonical tradeskill
  (`tradeskillOf`), every recipe with item, trivial, container, yield and ingredients. Served by
  one IPC call.
- Shared (pure, tested): `recipeLadder(recipes, level)`: recipes with trivial above `level`,
  ascending by trivial then name; recipes with no trivial kept apart; the era setting applied the
  way the Gear index applies it.
- Renderer: in the Skills tab, picking a tradeskill row opens its ladder beside the table: the
  level, then rows of item, trivial, container, ingredients with quantity and source word. A
  picker lists all tradeskills, so one the log never saw can still be opened (from level 0, said
  so on screen).
- Tests: the owner's case above (205 gives Golden Ruby Ring 207, Golden Jacinth Wedding Ring 210,
  Golden Black Sapphire Earring 212 as the first three rows); a recipe with no trivial is not in
  the ladder; the spellings fold (`Jewelry Making`, `Jewelcrafting`).

### 2. Where the materials come from, and what you hold (M, TypeScript only)

- A `Crafted` ingredient that has its own recipe opens in place (depth-limited, loop-guarded),
  the way the first guide indents sub-combines.
- A `Dropped` ingredient lists mob and zone from `dropsFrom`; a foraged one its zones.
- "Have N" beside an ingredient, from the newest Inventory dump (depot, bank and bags), with the
  dump's date. No dump: nothing is shown and the line says which command writes it.
- A recipe whose every ingredient is held is marked ready.

### 3. Combines: made, failed, per raise (M to L, engine)

- Engine module beside `skills`: one row per item combined, with made, failed, trivial notice
  seen, raises, the level at the first and last raise, first and last time, and the same counts
  for the session. A failed combine and the trivial notice become events the module can read
  (today `gaps_craft.rs` reads the failure from untyped text). Pairing of a raise with its combine
  uses the rule `gaps_craft.rs` already has, in both orders.
- Merge rule and `CAPTURED_MODULES` entry so archived months join; sealed archives refold by
  themselves when a module is new.
- TypeScript: the tradeskill of a combine with no raise comes from the recipe index.
- Screen: per tradeskill, combines, made, failed, success rate, raises, combines per raise; per
  item under it. Ladder rows gain "made N" and "trivial for you" (the log's own notice).
- Pace for a tradeskill: raises per crafting hour (time between combines, gaps over five minutes
  dropped) and per 100 combines, in place of the wall-clock figure.
- Tests from the owner's archive: 736 combines, 606 made, 130 failed, 204 raises; Gold Malachite
  Bracelet 92 made, 29 failed, 33 raises, 114 to 146.

### 4. Cost and merchants from your own log (M, engine or TypeScript: check first)

- Step 1: see whether `You purchased ...` and `You receive ... for the ...` are typed today.
- Per ingredient: the last price paid, the merchant and the zone it was bought in. Per recipe: a
  cost per combine from those prices, the price a merchant paid for the result, the net.
- This gives "where to buy" for everything the player has bought once, with no new wiki data.

### 5. Fishing and forage outcomes (S to M, engine)

- Fishing: casts, caught (by item), nothing, lost bait, pole broke. Forage: found (by item),
  failed. Shown on those two rows of the Skills tab. Line shapes are in MEASURED.md.

### 6. Skills the log never saw, and known recipes (S to M)

- A floor from the achievements dump: "at least 200" from the highest finished milestone, for a
  tradeskill with no raise in the log.
- `/outputfile recipes <tradeskill>`: still no sample, and no dump format is guessed
  (`src/shared/outputs/kinds.ts`). The owner can make the sample now (Jewelry Making 205). With
  it: a "known" mark on ladder rows.

### Not planned

- Feign success rate: the log prints a failed feign only. A failure count alone is possible; it
  was not asked for in that form.
- The guides' own text, routes and prices: other people's work. The app's ladder comes from the
  wiki data and the player's log.
- The guides' rules (the 200 cap, Crafting Mastery, the skill-up stat): unmeasured here. Shown
  only once the wiki data or a log measurement backs one.

## Waiting on the owner (a default is taken where one is safe)

1. Order. Default: the ladder first (slices 1, 2), then combines (3). The 2026-11-19 plan
   suggested combines first; the reporter's links say otherwise.
2. Where the ladder lives. Default: inside the Skills tab, opened from a tradeskill row. The
   other choice is its own Tradeskills tab.
3. A reply on the issue. Draft below; posted only on the owner's word.
4. Merchants for materials never bought. Needs who-sells-what from the wiki: a new scrape field
   and so the owner's sign-off (RULES.md rule 15). Default: not done; slice 4 covers what the
   player has bought.
5. Run `/outputfile recipes Jewelcrafting` in game once, so slice 6 has a real file.
6. Whether the app links to the two community guides. Default: no link.

## Reply draft for the issue

> Reopened: test.52 only added the levels table, which is the small part of what you asked for.
> Still to come, in this order: a "make next" list per tradeskill from your current level (the
> recipe, its trivial, what goes into it and where that comes from), then combine counts (made,
> failed, combines per skill-up), then fishing and foraging counts. A feign success rate is not
> possible: the log only prints a failed feign.
