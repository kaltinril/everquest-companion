# Agent notes: design laws, traps and open items by feature area

What a session needs before changing a feature: the design laws it must not break, the traps it
hit, and what is still open. Each area's `requirements/<area>.md` lists what was asked (RULES.md
rule 19); read it first. The sections were written per feature branch; since 2026-10-26 those
branches are retired and all of this code is on `main_community`. Each heading names the retired
branch it came from, which is also the name of its BRANCHES.md row and of its requirements file
where one exists.

## Gear: the progression plan and the Gear tab (was gear-progression-plan, gear-tab-improvements)

- **Survivability dial:** dps focuses read a "Glass cannon <-> Wooden sword" slider
  (`roleWeights.ts`: `RoleContext.survivability`, `DEFENSE_SPANS`, `readsSurvivability`). Weight
  table = midpoint of every span; default 0.3 (`SURVIVABILITY_DEFAULT`, also `roleValue`'s
  fallback). Stored at `eq.plan.survivability`.
- **Chunk-stat law:** for a dps focus, attribute-sized stats (STR, DEX, STA, AGI, AC) are priced
  everywhere; chunk-sized stats (flat HP, resists, mana) are ~zero at glass and real only toward
  wooden. Pinned cases in `planOwned.test.mts` (Boots of Brawn, Withered Leather Boots, Imbued
  Granite Spaulders).
- **Base-vs-base law:** compare and gap-test base against base, never rescale bars. The compare
  card states the worn copy's tier in a frame label.
- **Quest lane:** `PlanCorpora.questSources` gives quest witnesses to rows with no dropper; a
  stated dropper always wins.
- **Ownership:** a bare loot line does not exclude a farm target; only dump-owned or melted into an
  exaltation does. The equip advisory (`planOwned.ownedUpgrades`) must apply every gate the route
  applies (`wearable`, weapon policy) except era: an owned item is owned.
- **Level cap 50** on the route (`planner/planHorizon.ts`, `LEVEL_CAP`, `LAST_BRACKET_ROOM = 4`).
- **Ranged:** STR 0, ATTACK 0, DEX 2; the blurb still names STR and ATK ("score nothing here").
  Archery buffs and item effects are not scored in any focus.
- **No stat caps modeled:** no sourced cap data exists.
- Bars come from EQUIPPED items only.
- Gear toolbar row one is full at 1280px (~138px slack); a new filter goes on row two. `GearView`
  is at the 100-line function ceiling; `gear.e2e.mts` is near 400 lines.
- Zone filter: `GearFilters.zones` holds map stems; 174 corpus spellings resolve to 121 zones via
  `zoneShortNameFromCatalog`.
- Open: zone options do not respect Current era; clicking a Zone cell does not filter.
- Closed 2026-11-25: Coldain Crossbow "topping RANGE" was measured over the whole corpus with no era
  filter; its `{{Velious Era}}` banner hides it under Current era, and it is `Temporary` (below).
- Closed 2026-11-25: Oakwynd (GM-event bow, Does Not Exist banner) is `GearRow.unobtainable`, see
  "Unobtainable items" under the Best in slot tab below.
- **Void motes tab** (2026-11-18, a tab since 2026-11-19; `shared/planner/voidMotes.ts`,
  `gear/VoidMoteView.tsx` hosting `VoidMotePanel.tsx`, view id `voidMotes`, stored at
  `eq.gear.motes`). A void mote is Void-Touched Potential: +1 full tier on
  any item, 3 a week from raids (MEASURED.md, patch notes 07-28). One row per WORN item below +10
  (the hover card's `plannerInventory` join; bags and bank are not read).
  - Where it lives: its own gear-area tab, right of Exaltations (owner, 2026-11-19: as a chip-opened
    panel over the Gear tab's table it was a second list on the catalog page; it asks about what is
    WORN, not about the catalog). Never put it back on the Gear tab. `VoidMotePanel` fills whatever
    box hosts it, so another host (the Character tab) is a mount, not a rewrite.
  - Gain = the role model's score at tier+1 minus tier (`roleValuer`, the Gear tab's class picks,
    default dial), or one stat's own points. Read at no banked progress: the dump states `+N` only.
  - Ranking (owner, 2026-11-19; `plans/2026-11-19-void-mote-ranking.md` has the rules, the
    measurements and every constant): score = gain x hours of play the mote saves. Hours =
    2^tier / (copies an hour + `moteShare` x ordinary-mote experience an hour at that tier).
  - Copies = `GearRow.supply` (`shared/planner/itemSupply.ts`, built in main by
    `planner/gearSupply.ts`): every mob that drops it and every quest that rewards it, as item
    experience a week, added. Drop = kills a week x (class drops per kill / loot list) x 16 /
    hardness; quest reward = its slowest part x 1. Raid target = roster mob or a stated respawn of
    a day or more, 1 kill a week. Absent when no page states a road: then only motes are counted.
  - TRAP (review, 2026-11-19): `moteShare` decides whether the supply counts at all. At 0.5 the
    ordinary motes swamped the copies of anything scarce and the tier alone ordered the list
    (Hate's trash armour at +9 led every raid boss's drop). It is 0.05, and a raid zone's trash is
    counted at the runs it CAN be run (16 a week), a raid target at its lockout. After changing
    either, replay the owner's dump and the week of Nov 11 (the plan doc's "Review").
  - AN ESTIMATE: the catalog has no drop rates. What a page does not state is assumed at a `SUPPLY`
    default and listed in `supply.assumed`; never present a number from it as measured.
  - Gate: `pick` at +7 or higher; `rare` at +5 or +6 when supply <= 0.5 a week (the Plane of Sky
    test rewards); else `early` ("not yet"). The week's plan (`motePlan`) takes the best ready row,
    re-weighs the item a tier higher, to three; a "not yet" row never takes a mote, the rest are held.
  - TRAPS: `GearRow.quest` means the item is USED in a quest, not that a quest rewards it (rewards
    come from `quests.json` `rewards` and `posky.json`). An item page writes `Cazic Thule (God)`
    where the roster says `Cazic Thule`: `mobKey` folds the suffix. A quest's parts are priced
    from the mob catalog by item name, gear or not.
  - Not modelled: spells (a mote lifts a spell rank too), banked progress, a piece about to be
    replaced, the player's own loot history, D0-D3 raid kills. Open questions for the owner are at
    the end of the plan.
- **Skill mod column** (owner, 2026-11-20; `shared/planner/skillMod.ts`, tests in
  `tests/gearSkillMod.test.mts`). `parseSkillMods(flags)` reads `Skill Mod: <skill> <N>% (<cap> Max)`
  wherever it sits in a flag entry, for any skill name. Main's `gearIndex.pageRow` puts the answer
  on the row once (`GearRow.skillMods`, absent when none; optional, so no `GEAR_INDEX_VERSION` bump).
  - Column: `GearSortKey` `SKILL_MOD`, in `PICKABLE_COLUMNS` after `WEIGHT` and before `BIS`, so the
    picker and the stored columns, sort and widths take it with no list of their own. `sortValue` is
    the largest percent; the cell is words (`gearColumns.gearCellText`, hover `gearCellTitle`).
  - Narrowing is the search box, as for a stat: the token `skillmod>0` (`THRESHOLD_KEYS`), and words
    through the haystack (`gearData.toRow` adds `skill mod <skill>`: the name, never the number).
  - Width: two numeric units (`gearColumns.columnUnits`). `gearTableLayout` is handed
    `numericUnits(columns)`, not `columns.length`. The core four plus it is 6 units: pixel mode
    while the drop trio is drawn. The derived seed (`visibleColumns`) never adds it, so the seed
    stays in percentage mode; a sort on it with no columns picked falls to AC.
  - Data, 2026-11-20: 7 pages state one, 6 parse (Fishing on four, Baking, Pick Lock) and all 6
    have a slot, so all are rows. `Skill Mod: ?` (Singed Armature Rod) reads as none. Uliorn's
    Fishing Pole is out of era by the era join.
  - Not done: the plus-state does not scale it (no page states how a tier moves one); the compare
    card and `benefitMismatch` do not read it; no toolbar control; not looked at in the running app.
- **Best in slot tab** (Malkil and the owner, 2026-11-24; merged 2026-11-24, R1 fixes on `bis-r1`; plan `plans/2026-11-24-bis-sheet.md` "Version 2 design", asks `requirements/bis-sheet.md`).
  - Files: `shared/planner/tierChips.ts` (chips, lanes, step, board text `bis2:`), `tierWeights.ts`
    (conversions, derived chips, units, budgets, score), `tierDefaults.ts` (class-guide defaults),
    `bisSheet.ts` + `bisSearch.ts` (exact assignment) + `bisCaps.ts` (caps pass); renderer
    `features/gear/BisView.tsx` (the tab, `BisTab` mount), `TierBoard.tsx`, `BisCells.tsx`,
    `bisPrefs.ts` (`eq.gear.tiers`, named lists `eq.gear.tierLists`), `bisText.ts`, `useBisData.ts`,
    `BisCompare.tsx` (the slot hover), `BisSavedLists.tsx`.
  - HASTE PER CARD (R1): the search counts the loadout's best haste once; every card, runner-up and the
    hover's worn score is `bisSheet.cellScore`: haste only above `BisCell.otherHaste` (the best haste
    of the picks in the other cells). The budget ranks nothing; it is shown only in the hover.
  - LAW: nothing on the board reads `roleWeights.ts` but `hasteCredit` and the weapon-kind helpers
    (owner: "without my old calculations"). INT/WIS live only inside MANA, STA only inside HP, by the
    game formulas (MEASURED.md, "BiS sheet research"). Resists are their average unless split.
  - Lane weight = step^(3 - lane), C = 1; step 4 default. A unit = the median over in-era endgame
    rows (drop level over 50 or a revamp era tag), so S means "what a good endgame item carries".
  - BEST column: `GearFilterDeps.tier` -> `derivedOpts(filters, ownedHaste, tier)` ->
    `gearFilter.bestValue`, slot-free (any stated ratio counts), worn-haste rule and Ignore haste kept.
    Without a tier (pure callers) BEST is still `gearBisValue`. The board is read once per Gear mount.
  - TRAPS: renderer modules that node tests import must use relative `../../../../shared/` paths, not
    `@shared` (the node runner has no alias). `eqc/no-domain-munging` forbids `.filter` over
    GearRow in the renderer: the era filter is `buildTierModel`'s `admit`, the filled count is
    `BisSheet.filled`.
  - Caps: the exact search ignores them; `bisCaps.improveUnderCaps` then moves one cell at a time
    (a local optimum when a cap binds). Its pool per cell is the top 30 plus the top 12 by uncapped
    stats.
  - Kept laws: ratios only in the hands (1H, 2H) and RANGE (ranged), never ANY or other cells; a 1H
    ratio in SECONDARY only for a dual-wield class; Lore = any flag starting "Lore" (`LORE EQUPPED`
    too), one cell in the whole sheet; `CHIP_KEYS` order IS the text format: append, never insert.
  - TRAP: branch and bound over the cells blew a 400k-node budget (ANY cells double-count lore picks
    in the bound). The assignment (Hungarian) plus enumeration is exact and fast.
  - Unobtainable items (owner, 2026-11-25: "we simply need to just ignore items that are impossible
    to get before we even start our calculation"): main `itemsResearch.isUnobtainable` = the page's
    `{{:Does Not Exist}}` banner (`items.json doesNotExist`) or `isUnfarmable` (GM event / GM only).
    One seam: a new signal goes there. Readers: `effectIndex.excludedDonor`, and `gearIndex.pageRow`
    -> `GearRow.unobtainable` (optional, no version bump).
    - Gated (`gear.isObtainable`): `bisSheet.bisAdmits` drops the row before scoring, except a copy
      the character holds, in either mode (`BisOptions.held`, capped to copies held); `BisView.useStated` asks `bisAdmits`;
      `progressionPlan.candidatePool` (the Plan route) skips it.
    - Left: the Gear tab lists the row and its BEST column scores it (a lookup, not a pick); the tier
      model's units still measure over it (a median over thousands of rows); Void motes, socket
      advice, `planOwned` read only what the character holds; the wish list is the player's own.
  - Temporary items (owner, 2026-11-25, Summoned: Coldstone in Ammo: "Like i'm going to go randomly
    hail a magician ... every time i play?"): `gear.isTemporary` = the `Temporary` flag or a
    `Summoned:` name. `bisAdmits` drops it ALWAYS, held or not (gone at the next camp); the Plan route
    skips it. 101 slotted rows: 77 summoned, 24 NPC drops (Shadowed weapons, Coldain Crossbow).
  - Era on the sheet (owner, 2026-11-25: "dont' we already compute what to show in classic vs not in
    the gear tab ... why are we reinventing the wheel"): the sheet's Current era is the RECOMMENDERS'
    gate, `plannerData.eraUnconfirmed` (anything but a positive in-era from `donorEra`, the Recommended
    tab's `eraLegal` rule), via `gearData.useEraHidden().eraUnconfirmed`. The lists keep `eraHides`
    (Unknown Era shown). Trigger: Dwarven Plate Boots (Enchanted Imbued), a cultural piece no page
    dates, filled Feet. A held copy passes the era gate (`bisAdmits`; an owned item is owned). The
    tier model still measures over `!eraHidden` rows.
  - Class: NONE (owner, 2026-11-25): `normalize.statesNoClass` -> `GearRow.noClass`; `bisAdmits` drops
    it always, the Plan route via `isRecommendable`. `normalizeClasses` still returns `[]` for both
    NONE and an unstated list; `noClass` is what tells them apart. 7 slotted pages; two are
    pet-illusion forms of wearable items (MEASURED.md, Converted items), whose wearable form stays.
  - Not done: P5 (effects chips, a "My tier list" focus on Recommended and Void motes, per-character
    boards); the upgrade slider on the sheet; the Lore Group rule; not looked at in the running app.
  - 2026-11-25 batch (owner's asks, `requirements/bis-sheet.md`; merged, not seen on screen by the owner):
    - ARROWS (`planner/bisArrows.ts`): a bow in RANGE puts the best usable arrow in AMMO, DMG first,
      elemental at `ARROW_ELEMENTAL_WEIGHT` 0.5. An arrow = AMMO with Archery, or no skill and "arrow"
      in the name (46 arrows, Shardwing DMG 12 the best, state no skill). `GearRow.elementalDmg` =
      Fire+Cold+Poison+Magic+Disease DMG, unscaled; Bane left out (one body type). The bow rule lives
      in THREE places that must agree: the search's bow variant (`bisSearch.ts`), `bisCaps`
      `bowRuleHolds`, and `withArrow` (places a zero-score arrow the search left out).
    - SPLIT RESISTS count a fifth each through `tierWeights.chipUnit()` (Resists unit x 5). Anything
      dividing by `model.units[chip]` directly bypasses it.
    - LEVEL: default 50; `planner/statCaps.maxCharacterLevel` 50, 55 from `KUNARK_LAUNCH` (local
      midnight 2026-12-08). One date: `reincarnationCap.RULERS_OF_KUNARK` reads it.
    - SPELL HASTE (`BisPrefs.spellHaste`): item haste is clamped to `itemHasteCap` (the lower of the
      player's HASTE cap and `hasteCapAt(level)` less spell haste) BEFORE the search, so the search
      stays exact. The Gear tab's BEST column does not read spell haste.
    - ATTRIBUTE CAPS by default: `BisOptions.statCaps` (`{ value, over }` per attribute;
      `countedAmount`), default `HARD_STAT_CAPS` 510. The view passes `attributeCaps(useReincarnationCap())`:
      the reincarnation soft cap (Alt. Advancement section below). STA, INT, WIS are capped inside HP
      and Mana through `CapRules.folded`. A cap the player sets wins as a hard cap. The Targets bar's
      stat cap starts at the cap in force; only a number the player changed is stored.
    - The caps pass runs only when a cap binds (`capsBind`); its total now carries the damage-first
      weight (before: negative totals whenever a cap was set).
    - Totals are gear only (no base stats), so 510 binds only on heavy gear or high upgrade tiers.
## Alt. Advancement tab (owner, 2026-11-25; requirements/alt-advancement.md)

- View `aa`, Stats/Data row after Skills. `features/aa/AaView.tsx`, `AaRows.tsx`, `useAaRanks.ts`;
  `shared/aaRanks.ts`, `aaLogMatch.ts`, `reincarnationCap.ts`; table `shared/aaTable.generated.ts`
  from `scripts/gen-aa-table.mts` + `scripts/sources/allAas.ts`, parsing the cached page only.
  `tests/aaTable.test.mts` is red while the committed table is behind the cache: regenerate, never
  hand-edit. Corrections from the game and Daybreak's notes go in a layer over it, not into it.
- Rank: the ORDER OF PROOF below (2026-11-25). Picks: localStorage
  `eq.aa.ranks` = `{ [character]: { [rowKey]: rank } }`, one `useSyncExternalStore` store, so the tab
  and the Best in slot sheet stay in step.
- THE LOG WINS (WORKFLOW.md ruling 2026-11-25): top rank = max(wiki rank count, log rank); the shown
  name is the log's (near match, `NEAR_EDITS` 2, unique, only to a row no log name matched exactly),
  the wiki's in the hover; a log AA with no row gets an `unlisted` General row.
- Race lines: the game says `Race Reincarnation: <race>`, the wiki `Class Reincarnation: <race>`;
  the row key is the game's form. A race purchase line states no rank, so a race's rank counts the
  reincarnations into it (`reincarnationClimbs.reincarnations`, same re-log guard as the climbs).
- Soft cap (`reincarnationCap.ts`): no reincarnation in the log = hard 510; else 510 + 10 a
  reincarnation before Rulers of Kunark, 11 from it, + 5 a Human rank, + 3 a Half Elf rank, a point
  above counting `SOFT_CAP_OVER` 0.2. A reincarnation before the log began is not counted.
- ORDER OF PROOF (owner, 2026-11-25; `shared/aaRanks.ts` `rankAasFrom`): the first source that says
  something wins. 1. the latest `/alt list` run (`shared/aaList.ts`), except a purchase line logged
  after the run OR after the last zone-in before it raises it (`aaBeatsList`; a list is stale until a
  zone after a purchase); purchases before that zone-in are superseded (respecs exist:
  `tests/fixtures/aa-mnemonic-respec.log`). No zone-in seen before the run (`zoneBefore` null, e.g. the
  zone was in an older archive segment): every purchase counts. Loadout swaps are not detected.
  2. the player's own use lines for a table name: the rank a cast's numeral names, else at least 1
  (a numeral above the wiki's count raises the top rank).
  3. the pick. 4. purchase lines (`aaLedger`), then grants (`withGranted` never moves a list or pick
  rank). A one-rank row the list printed with none of 2-4 is `unknown`: not buyable, out of
  `aaLeft` and the tab counts, listed in the "Can't tell from the log" card ("I have it" = pick).
  The row detail names the deciding source; the picker is disabled where the list or (one-rank)
  activation decides.
- `/alt list` DATA FLOW: engine `eqlog/src/parse/aa_list.rs` (kind `aaList`: header `value`+`ability`,
  `text`, `cost`; first in the cascade) → `fold/src/modules/leveling_aa.rs` (latest run; a new run on
  a >2 s gap or the run's first id again, not on other repeats: a stale list repeats an id far apart;
  `zoneBefore` = the last `zone` event before the run; the used set name/first/rank/castOnly (no `last`
  stamp since 2026-11-27: a repeat announces nothing, so a field it moved went stale behind the cursor
  and failed engined's kept-answer test), fed by
  `aaActivate`, `castBegin` (rank via `names::spell_rank`), `aaOwned` (reuse timer, `You disable X.`,
  `Your X combat ability is interrupted.`; classifier last in the cascade) and the player's own
  melee `damage` with `(Finishing Blow)` (raw-tail gate); only a new name or a higher rank announces;
  every cast name is kept, the app filters by the table) → `LevelingSnap.aaList`,
  `.aaActivations` (optional: absent from older segments) → `mergeLeveling` (newer run by stamp,
  activations joined by name, fields only when a side has them). Reading a rank: each slash group of
  the row text with one value a rank (`1/2/3/5%`) against the block's numbers, else the cost; one
  block of rank 1 = 0; two = current then next (min); three or more = stale, says nothing. The tab's
  first row is the shared `OutputFileLine` for `/alt list` (no `/outputfile` kind: `/outputfile` has
  none for AAs), stamped with the run's log time.
- CORRECTIONS (`shared/aaOfficial.ts`): `AA_CORRECTIONS`, a source and date per entry; `AA_ROWS` is the
  table every reader uses (tab, ranks, points, the Best in slot cap). Never hand-edit the generated
  table. A correction the wiki has caught up with changes nothing (`correctionAgrees`). Entry fields:
  add, rename, ranks, cost, append, removed, `hkNote`, `tabOnly` (no Gaps row), `header` (a table
  header line as a Gaps row), `confirms` (a second source). A removed row ignores picks, keeps the
  log's rank, and is out of `aaPointsSpent`.
- ARCHETYPE CLASSES (`shared/aaArchetypeClasses.ts`), from `/alt list` runs (MEASURED.md): WAR and MNK
  split by a fresh character's runs; Physical Enhancement read as everyone's (in every combo); a
  class seen only beside WAR and MNK may still have some of the melee nine (`mayApply`), except
  where Daybreak's notes say (Rampage: BER; Point Blank Fire: RNG, ROG, BER). A held rank always
  shows. The Archetype tab's My classes filter reads it.
- WIKI GAPS "AAs" domain: `shared/gapAas.ts` `aaGapRows(spends)`, joined in `useGapsList` through
  `useAaGapRows` (the attached character's leveling snapshot only, even with All characters; no day
  window). An update domain (`gapJob`); action in `gapFieldActions`; Copy is `wikiPage`
  `PAGE_OF.aa`; editor `GapRowButtons` `ownPageEditor`. Rows keyed by the game's name; log evidence
  joins an existing correction's row. The two removed steeds are no row (the page already strikes
  them). Faction words moved to `shared/gapFactionWords.ts` (re-exported from `gaps.ts`, at its ceiling).
- GRANTED (owner, 2026-11-25: "free AA's should be marked as obtained as long as the level or requirement
  has been reached"): `shared/aaGranted.ts` `withGranted` over `rankAas`; order pick > the higher of log
  and grant > 0, source `granted`. Needs a known level (`CharacterSnap.level`) and the row being the
  character's own (General; Archetype if `archetypeFit` is mine; Class if held; never Special). Leading
  cost-0 ranks whose "Requirements:" level (one, or one per rank) and AA prerequisites are met; text it
  cannot read grants nothing. WAR/SHM/MNK 50: Gather Party, Origin, Full Potential, Intimidation, Point
  Blank Fire, Heroic Leap, Innate Fighters Tenacity, Unbound Wrath/Cascade/Alacrity 3/3. Not measured:
  whether Lay on Hands (10/10 at 6) and Hunter's Attack Power (26/26 at 8) are granted gradually.
- REDESIGN (2026-11-25, mockup v4): `features/aa/{AaView,AaCards,AaSummary,AaList,AaRowDetail,AaSpecial,AaUnspentLine}.tsx`,
  `useAaBoard.ts`, `aaNav.ts`; `shared/{aaEffectTable,aaEffects,aaCost,aaBoard,aaRecommend,aaStats,aaLinks,aaSpecial}.ts`.
  `AaRows.tsx` is gone. Effect labels are hand-written (`aaEffectTable.ts`), numbers from the row text or
  Special cells; a list whose length is not the rank count shows the label only; never "none".
  Planned combo key `eq.aa.classes` (session tier, `useFollowingClasses`). Usable = General and Special,
  Archetype by `archetypeFit`, Class by class; a held rank counts only for your own classes; unusable
  rows never count. `CLASS_TOPS` in `aaBoard.ts` (Steadfast Will 8/7/6, Rampage 2 for WAR/BER). Point
  Blank Fire is never "may apply" (Daybreak's notes). Pace = `useTimeslice(aaGainTs)` + `rangeStats` +
  `aaPace` (choosing a scope changes the app-wide slice). Wiki Gaps link writes `eq.gaps.domain` = aa.
  Costs: `aaCost.ts` (free ranks 0, an unstated price makes "N+"). The game's "spent" total is not in
  the log: the Points card shows spent at the wiki's prices. Not built: the list toolbar (All / Can
  still buy / Activated, Group by), the pace sparkline, clickable pips, starting a timer from an AA.
- OWN COMBO ONLY (2026-11-25, seen in the app on the owner's log): a Class row counts only for a shown
  class, an Archetype row only when `archetypeFit` is 'mine' ('mayApply' is shown, not counted, even if
  held). The log holds purchases from earlier loadouts; the game gives only the combo in force its
  Archetype and Class AAs. `AaBoardRow.elsewhere` = own combo, not for these classes, log rank > 0: kept,
  shown only under All AAs, marked "from another loadout", out of every count. With no classes known,
  a held rank still counts (nothing tells loadouts apart). SUMMARY ADDS ONLY: `aaStatTotals(board,
  defs?)`, no diff column, colours or struck-through AAs; the planning line has no "drop out" count.
- UNSPENT WARNING (aa-points-warn): unspent = `aa.ts unspentAaPoints` (newest "You now have M" less
  purchases after it; null with no gain line). `aaPointsWarn.ts`: `AA_POINT_CAP` 50 (also
  `AA_BANK_CAP`), warn at 45. Signal `aaPointsUnspent` (tokens points, cap); seeded alert
  `aa-points-unspent` OFF (stamp `alertAaPointsSeed`). N in localStorage `eq.aa.unspentAlertAt` (1-50),
  edited by the Points card's "Alert at" (the framework has no per-alert number). Fired renderer-side
  (`AaPointsWatcher` in AppCelebrations) once per upward crossing; the first count and the first after a
  character switch are a baseline. Nav badge `AaNavBadge.tsx`: amber "!" 45-49, red at 50. The game's
  cap line is not parsed (engine change); reaching 50 covers it. At 50 the game also stops experience.
- Labels: the nav says "Alt. Adv." (`VIEW_LABELS`), the page "Alternate Advancement". The description
  has no hover (it is shown in full); a hotkey row's hover holds the hotkey text only.
## Maps (was map-improvements)

- Owner ruling: nothing that does not relate to EQ Legends. `portsInClient` drops a cast port
  whose spell the client lacks; item ports pass on the item.
- Zone graph: built at idle from label (`P`) records only, as the union across ALL map packs (plane
  entrances are labelled only in the default pack). Full parse 3.9 s vs labels 0.55 s. Geometry
  LRU holds 8 zones. Owner preference: precompute once, never per-open work; `refresh()` has no
  callers, so pack installs do not invalidate.
- Port destinations: Teleport to / Teleport group to / Translocate to / Evacuate to / Evacuate
  group to.
- Where to level refuses out-of-era zones, home cities (`city: true`) and locked zones
  (`minLevel`). Levels go through `sortLevel`, so "~19" counts.
- Drag ends on `buttons===0`, pointercancel and lostpointercapture.
- MUI Tooltip must wrap a DOM element (Box/Link), not a plain function component.
- Open: no e2e for Closest port / era chip / advice table; Hate and Sky lock levels unruled.
- Fixed 2026-10-27: `maps.e2e` "the map row never moves" (the row dropped 71 px when the map
  arrived). Cause: the travel card sat in the column above the row and grows as its band, ports
  and zone graph answer. It now floats over the map's top-left (`MapBody` `TravelFloat`), and sits
  inside the no-map panel's own scroll box. Nothing whose height arrives late goes above the row.
- Player marker and heading arrow (2026-10-29): two sources. The engine's `character` module keeps
  the zone's last two `Your Location is` lines as `locs` ({ns, ew, z, ts}, oldest first; any zone
  line empties them; parsed by gaps_locs.rs `loc_of`), and the typed /loc is stamped `at` when
  placed (`eq.maps.loc`; an unstamped old one counts as oldest). `useLocMarker` shows the newest
  of all (`shared/mapHeading.ts newestTwo`) and points the arrow from the one before (map axes x
  right / y down, so the bearing holds at any zoom). Logged lines count only on the map of the
  log's own zone; Clear hides them up to that moment (memory only). Log ts vs `Date.now()` decides
  typed-versus-logged, so a log clock far off the machine's would skew it. A module field is not a
  protocol change (`ModuleState` is untyped).
- Crawl mode (2026-10-29): `eq.maps.crawl`, off by default. Killed this visit = kills module
  `lastTs` >= the progression module's last `zoneStart`, when that interval's zone is the map on
  screen (`shared/crawlMode.ts`). `useCrawlMode` keys the set on the start NUMBER, so experience
  lines do not rebuild it and redraw the memoized sidebar. Dims pins (`MapMobPins`) and Named mobs
  rows only; pins draw only while the sidebar is open. The `MapMobPane` function is near the
  110-line ceiling (the chip is its own `CrawlChip` for that).

## Map waypoints and the Map pins overlay (was map-waypoints)

- `/waypoint` is the game's command (`eqstr_us.txt` 8326: "Usage: /waypoint x, y, z"). Written in
  /loc order (N/S first); which number the game calls x is UNVERIFIED in game. One switch,
  `NS_FIRST` in `features/maps/waypoint.ts`, flips it.
- The owner's EQ Legends log DOES carry `Your Location is` lines (upstream comments in
  `locMarker.ts`/`mapGeometry.ts` say zero; true of the creator's logs, not this one). A live
  position source is possible later; nothing reads it yet.
- Overlay windows share localStorage with the main window (same origin, no partition): the track
  list (`eq.maps.track`) reaches the overlay through `storage` events, no IPC.
- A new overlay kind touches: `OverlayKind`/`OVERLAY_KINDS` (insert before the strips so
  `conCard` stays last and no meter's dock slot moves), `OVERLAY_KIND_LABEL`/`OVERLAY_LABEL_ORDER`,
  `DEFAULT_OVERLAY_CONFIG`, `OVERLAY_MENU_ROWS` (description only, never the label),
  `OVERLAY_TITLE`, `overlay/main.tsx`, `MODULE_READING_OVERLAYS` when it reads a module, tests
  `overlayHotZone` + `overlaysAppearanceSteps` ALL_KINDS.
- Overlays may not carry native `title` tooltips (`overlayTooltipPolicy.test.mts`).
- Owner rule (2026-10-13): zoom and pan NEVER redraw the Maps sidebar. `MapMobPane` is `memo`;
  every prop it takes must keep its identity across view changes. A callback that needs the view
  (`onCenter`, `jump`) reads it through a ref, never as a dependency. Twice a dependency on
  `view.scale`/`zoomedIn` broke the memo and cost ~180 ms per wheel step on a 290-row zone.
  Check: a CPU profile of 16 wheel steps shows no MUI (ButtonBase, Tooltip, emotion) frames.
- Overlay bundle trap: anything the overlay imports that reaches `features/mobs/mobSearch`
  (`MOB_CATALOG`, 3 MB) lands the catalog in the `conCard` chunk EVERY overlay window loads (even a
  dynamic import did). The Map pins overlay gets a slim copy over `maps:mobPlaces` instead, and
  `useZoneTrack.ts` (catalog) is kept out of `useMapTrack.ts` (overlay). Check after a build:
  `grep -c 'Sandgiant Husam' out*/renderer/assets/conCard-*.js` must be 0.
- Owner ruling (2026-10-13): the app may READ the game's `UI_<char>_<server>*.ini` at runtime for the
  Map pins overlay's optional Follow map (`[MapViewWnd] Show=`, re-saved by EQ on every M press).
  Zoom and pan are never saved anywhere (measured). Read-only; nothing else in that file is used.
- The Map tab's viewport state lives in `MapTab`, below `MapsTabs`: MUI Tabs re-measures its
  indicator (`getBoundingClientRect`) on every render, so the tab bar must not render per frame.
- Locked overlays are click-through except the header strip, so the pin overlay's clicks work
  only unlocked. Open: per-pin capture while locked.
- Auto-hide never hides the overlay while unlocked (2026-10-14): a hidden window draws no chip,
  so unlocked is the way back. Pinned and hidden, the Overlay menu's reset is. A new localStorage
  key the overlay keeps must start with `eq.maps.overlay` (`tests/mapPinsReset.test.mts` checks).
- Achievements chip (2026-10-27): the main window works out the areas (`useSlayerMapAreas`, the one
  reading the Maps tab layer also uses) for the log's zone and writes them to `eq.slayer.overlayAreas`
  (`shared/slayerOverlay.ts`; main-window data, so a reset keeps it). Publisher mounted in
  AppCelebrations only while `mapPins` is open (`unreleasedSlayerMap.tsx`). The
  overlay never imports `features/slayer/` (the catalog trap; measured clean 2026-10-27). Its on/off
  is `achievements` in `eq.maps.overlayLayers`. `savePref` fires `eq-slayer-prefs` so a pick on the
  tab reaches the feed at once (`storage` events skip their own window).
- Area labels are hover-only on the overlay (owner, 2026-10-29): `AreaCircle` with no `text`, plus a
  faint `Mark` at the centre (a `markZones` hover zone while pinned, `areas` in its input). The Maps
  tab's `SlayerMapLayer` still passes `text` and keeps the rim labels.
- Crawl mode on the overlay (2026-10-29): reads the Maps tab's `eq.maps.crawl` (`CRAWL_KEY`) via
  shared storage, no chip of its own; not an `eq.maps.overlay*` key, so the reset keeps it.
  `MapPinsCrawl.tsx` mounts the kills/progression feed only while it is on (each overlay
  `module:changed` refetches a whole snapshot). Only POI mob marks dim.

## Bazaar tab (was bazaar-tab)

- Owner ruling (2026-10-13): a wrong count is worse than a missing one. An offer the reader has to
  guess at is listed (line, speaker, time, direction) but never counted: `Offer::sure` false, no
  price, no day count, no median, no alert. A new parse rule that guesses marks its offers unsure
  rather than widening what is counted. The guess rules live in `bazaar_words.rs::mark_guesses`.
- Measure a rule change on the owner's trade lines: `BAZAAR_CORPUS=<lines> BAZAAR_DUMP=1 cargo
  test -p fold bazaar_corpus -- --ignored --nocapture` on the old and new trees, then diff the
  DUMP lines; the summary line reports `priced` and `counted`.

## Exaltations and sockets (was exaltation-clarity, character-slot-sockets)

- The "Current era" filter hides a POSITIVE out-of-era only (owner, 2026-11-20: "lets show items
  that we can't figure out the era"). A row nothing states an era for is shown, chipped
  `Unknown Era` (`plannerData.eraHides`, `eraChip`, `UNKNOWN_ERA_LABEL`). One rule for the
  Exaltations list, the Gear tab and the Wish list; 77 of 1,641 donors and 281 of 6,972 gear rows
  are in that state (`tests/unknownEraShown.test.mts` prints the counts). This reverses the
  2026-08-13 ruling that "era?" hides. The Recommended tab still requires in-era
  (`shared/planner/progressionPlan.ts eraLegal`): not changed, ask before changing.
- ONE BUILDER FOR A ROW'S ERA EVIDENCE: `main/planner/eraEvidence.ts eraEvidenceOf` (the banner
  and layer 3, `eraDerived`). The Gear index and the Exaltation donor index both spread it, over
  one copy of the derivations (`indexCurrent.ts eraDerivations`, filled by whichever index builds
  first). Before 2026-11-20 only the Gear index attached layer 3, so Mane Attraction was in era on
  the Gear tab and "era unknown" on the Exaltations list. `tests/eraEvidenceShared.test.mts` holds
  the property: every item on both lists carries the same evidence and gets the same verdict
  (1,256 items). A new index that shows an era takes its fields from that builder. Not yet on it:
  the item card and a mob's drop list, which read `ItemKnowledge` and so have layers 1 and 2 only.
- An item page states its era with a banner template at its top, `{{Classic Era}}`
  (`main/itemLookupParse.ts parseEraTag`); a quest reward with no dropper and no banner is
  `Unknown Era` until its page carries one and the data is refreshed.
- Socket rules and the per-weapon proc exception: MEASURED.md, Exaltations.
- Board optimizer (`socketOptimize.ts`): maximum bipartite matching over one claim per family ->
  worn sockets; objective = most distinct families at highest owned tiers. Stable matching:
  edges ordered current seat -> empty -> occupied; incumbents win ties only when their own best
  donors can keep a seat. Never invent cross-family values: a contested seat is named "your call".
- `socketRecommend.forceKey(family, seat)`: family per body, `family@cellId` for Proc seats.
- Chip and panel advice come from one computation (`useSocketAdvice`), so they cannot diverge.
- Windows case trap: `ExaltationAudit.tsx` vs `exaltationAudit.ts` -> TS1261; the panel is
  `ExaltationAuditPanel.tsx`.
- Open: persist the owned tri-state; e2e for red cards; is un-socketing lossy.
- Benefit filter (2026-10-26): `GearEffect.benefit` is built in main from the spell list's focus
  rows (`focusBenefit.ts`); every engine asks `exaltationAudit.helps` before offering a gem. Law 1:
  no row or no limit = helps anyone; an empty loadout filters nothing. The pet rule reads the pet's
  NAME ("Skeletal Pet"): the list writes most necro summons as `Summon Pet:`. Not checked (would
  hide gems that help): the spell kind a limit names, and level.
- Locks (`SocketHostCell.locked`, per character in localStorage `eq.character.exaltLocks`, keyed
  `cellId|type|gemKey` so a gem swapped in game leaves the lock inert): fixed before the matching
  (`socketFixed.ts`). A lock pins its body-wide family only AT ITS TIER OR BELOW. Trap: pinning
  the whole family pulled the Affliction Efficiency II beside a locked I.
- Recommended view = `socketDiff.boardDiff(plan)`; the panel's moves/clears lines are now the grid's
  red/green chips and their hovers. View choice per viewer: `eq.character.exaltView`.

## Spells, upgrades and Loadout (was spell-upgrades)

- The Spells views are drawn in every build. `tests/e2e/spells-area.e2e.mts` checks the area opens.
- Two copies of the spell load pipeline: `buildLevelUnlocks` (levelUnlocks.ts) runs its own pass
  over spells.json, separate from `loadSpellDb`. A new load pass goes in both.
- `spells_us.txt` is parsed into a versioned disk cache (`SPELL_RESIST_CACHE_VERSION`,
  `resist/spellTable.ts`). A change to the key rule or row shape needs a version bump.
- Same-name pairs with different messages are two spells; a classic row folds only when a noted
  row prints the same three messages (Healing Water regression, test.11/12).
- Page preference runs AFTER corrections.
- Group buff set: a group-mate contributes only spells whose `target_type` reaches another player;
  mates are read at YOUR level. Party colours are stored as slots (8), paint in `partyPaint.ts`.
- Open: pass `roleWeights` (the Gear plan's, now on the same trunk) into `buildLoadout` and delete
  `DEFAULT_STAT_WEIGHTS`.
- Buff set sides: a `Pet` / `Summoned Pet` target buff is a candidate with `pet: true`;
  `loadoutSides` solves the player's set and the pet's apart, and the view draws the pet's on its
  own tab. `buildLoadout` itself knows no sides: hand it one side.
- Buff set grants (`grantsOf`): stat lines re-read at the character's level (the catalog's
  `grants` are a reading at the gain level), per-tick regens, and one `MELEE_PROC` grant for
  `UnlockSpell.proc`. `MELEE_PROC` is never parsed by `parseStatLine` and never totalled.
- Buff set rank: `CandidateQuery.tierOf` lifts every point stat to the spell's tier (`statAtRank`,
  MEASURED.md); percents, regens and the proc grant are not scaled. Open: `spellUpgrade.ts` carries
  no stat magnitude, so the Upgrades tab still ranks a buff as buying no bigger numbers.
- Buff set procs: `procLadder` keeps one proc buff per spell line (the newest) before the conflict
  search and blanks SPA 85 in the kept views, because the game stacks proc buffs of different
  lines (MEASURED.md, patch notes) and the same-effect rule would call every pair a contest.
- Recourses: `<name> Recourse` in the catalog is folded onto `<name>` as `UnlockSpell.recourse`
  (main `levelUnlocks.ts`) and is no longer an unlock row. Such a spell is a buff candidate under
  its own name with the recourse's grants, `enemy: true`, and `stackAs` = the recourse row, whose
  client row answers stacking. A group-mate's recourse never reaches you (`landsOnOthers`).
  Owner's log, 2026-11-14: `You feel your strength grow.` follows a Siphon Strength cast and
  `Hatred fuels your arms.` a Shroud of Hate cast. Client rows: Siphon Strength (343) links
  recourse 2463, Shroud of Hate (1457) links 2470, Wave of Enfeeblement (363) links none.
- Wiki errors met here (2026-11-15): the Shroud of Hate Recourse page (pageid 51199) sets
  `spellname = siphon strength recourse` and a Shadow Knight 39 class row; the Siphon Strength
  and Shroud of Hate pages carry their recourse's cast-on-you message. Grim Aura and Shieldskin
  slot lines are corrected in `spellCorrectionsColumns.ts` until the pages are edited.
- Rust `spells_us.rs` twin is not parity-gated; deferred.
- Open: SPA 148 slot reading (MEASURED.md); SPA 475 rows in the same slot contest each other.
- `LevelUnlockData.general` holds the General AAs with no class key; the fold appends them classless
  (`UnlockRow.general`) after the class rows, and a name a class row shows wins.
- Archetype AAs are not listed: `classes.json` `aas` has `group: 'archetype'` and no classes. Add them
  only once the data states an archetype or classes.

## Factions, Achievements and Unlocks tabs (was faction-tab, slayer-tab, unlocks-tab)

- faction-tab: live standings = dump + log receipts since the dump's mtime (32 MB tail read).
  Cap lines PIN the value. Quest faction receipts come from the committed quest cache (zero
  requests). Wiki quest pages quote receipts inconsistently, so home-zone quests with no stated
  receipt are shown separately with a neutral marker.
- Class filter is inclusive on ambiguity (wiki class tokens are prose).
- Factions: open: give `loadFactionsNow` its perf seam.
- Achievements: the view id stays `slayer`. `achievements:book` is read on demand and never stored. Mob race
  from the wiki `|race` field (`scripts/gen-mob-races.mts`), mob factions likewise
  (`gen-mob-factions.mts`). Open: `Obtain <Item>` lines link nowhere; picks are per machine, not
  per character.
- Unlocks: needs the Factions and Achievements code. The App-root provider wraps
  `<ViewContentMemo>` at App's ROOT. Deity constants are spelled locally (shared ones exist in the
  Exaltations code; folding them together is open).
- Achievements, kinds table (fork #5, 2026-11-19): `SlayerTerm.yieldsTo` is the second exception to
  "the page race decides" (the first is `always`). A race claimed by a term with `yieldsTo` gives
  way when `nameTerm(name)` is one of the listed terms; `mobFacts` then returns `race: ''` and the
  mob is read by name (basis 'name', est. chip). Only `true dragons` uses it, yielding to drakes,
  wurms, wyverns.
- It is a rule, never a boss list (owner: "I would hate to hard code it to the 2 raid bosses"). Do
  not replace it with bosses.json, a level floor, or a general "name beats race": most name/race
  disagreements are the game reusing a model, which is what the game counts (clockworks on spider
  pages, crocodiles as Alligator).
- Traps: a yielded-to term must have `names`, and a race of a yielding term must be claimed by that
  term alone (tests/slayerYield.test.mts checks both). `drakeling` and `wyrm` are not whole-word
  matches and are left out on purpose (adding them would newly list A thorn drakeling under Drakes).
  `nameTerm` is run only for mobs whose race is in YIELDS (about 84), not the whole catalog.
- `MobFacts.race` is now '' for a yielded mob, so nothing downstream can show "Dragon" for it;
  matchMob, hitsOf, strictMatcher and the map shading read the facts and needed no change.

## Roster classes from /who (was roster-who-classes)

- `roster_who.rs` reads `/who` rows from `unknown` events via `ev.raw()` and joins them to
  published roster members (`classes`, `level`, `classesTs`). A row never admits anybody to the
  roster. Chosen over a new parser `Kind` (~30 files incl. parity). Only works if the player types
  `/who` on the group.

## Pet crediting: ever_struck (was fix-ds-ever-struck, fix-roster-overrides-ever-struck)

- `ever_struck` permanently refuses a caster's pet claims. Path 1: damage-shield ticks wrote it
  (fixed, PR #61). Path 2: a riposte against a groupmate wrote it; a LIVE roster member now passes
  the `ever_struck` refusal only (charm broadcast stays absolute). Path 2 was offered upstream on
  #60 (PR #80) and is left there.
- `ever_pet` (every name that was ever YOUR pet, kept for the whole log) no longer refuses a
  leader line that names somebody else: only a pet you have now (`pet_names`) does. Summoned pet
  names come round, and a group mate's pet with a name your own once had was credited to nobody
  (owner, 2026-11-19: Malkil's Xabantik; `fold/tests/ally_pet_reused_name.rs`).
- Pet rules, batch 1 (2026-11-20, requirements/pet-rules.md). `eqlog::names::is_summoned_pet_name`
  is the game's own table of summoned-pet names (7 first letters x 9 x 5 x 4 endings, 1,204
  names; all 57 names that said `My leader is` in the owner's logs are in it). Three uses:
  - The roster's `buffed` rung refuses a table name (`roster.rs fold_heal`), so a pet that caught
    a buff burst is no longer listed as a group member. `joined`, `stated`, `confirmed` and `user`
    are not asked: a player may really be called Karn or Garn, which the table also holds.
  - `routing.rs recordable_attacker`: a name that was a pet once (`ever_pet`, `others.pets`) is
    refused UNLESS it is a table name. A table name with no live bind is a new pet and is recorded;
    `rekey_other` / `retract_other` no longer stop at "already called a pet", so its row moves on
    the next claim or leader line. This ended the test.52 known issue (damage before the leader
    line dropped for a reused name).
  - `routing.rs other_source`: an unclaimed table name's row reads `Pet (Xabantik) - owner
    unknown` (kind still `other`, id still `member:<key>`), unless the roster lists the name.
  - Kind `other` is hidden by the Group scope, so an unclaimed pet shows under Everyone only until
    it is tied to a group member. NOT reviewed yet: ending your own claim on a name (rule 4).
- Pet rules, batch 2 (2026-11-20): the owner guessed from a group mate's summon.
  `ally_summon.rs` (`SummonWatch`, `AllyCharms::infer_summon_owner`) makes an `AllyVia::Summon` bind (kind `Summon`, no clock, no break rule);
  `routing.rs infer_summoned_pet` asks it on every `Attribution::Ignore` damage and miss line,
  BEFORE `route_other_*`, so the line that makes the bind is credited by it. State: `waiting`
  (group mates' unanswered summons, 10 minutes), `own_waiting` (yours; blocks every guess),
  `first_unbound` (when a table name first acted with no bind, stamped whatever it swung at).
  The label is `Pet (X) - Owner (guessed)` (`ally_pet_label`). A leader line or a claim settles
  it: `rekey.rs settle_guessed_pet` moves the guessed row (`move_recorded`, which also renames a
  row in place). The target must be an engaged hostile, so a fight that has gone stale guesses
  nothing until someone in the group swings again.
- A leader line, a claim or a summon guess moves a pet's row in the CLOSED zone stays too
  (`rekey.rs move_in_closed_stays`, 2026-11-20), but only stays that end at or after the pet's
  first unowned action (`SummonWatch::first_seen`): names come round, and an older stay's row was
  another pet's. Finished FIGHTS still move whatever their date, as they have since 2026-10-22.
- Twin evidence on an ally pet is a MELEE line only (`routing.rs lands_on_its_caster`, 2026-11-20).
  A pet's lifetap prints `X hit X ... by Lifebite`; read as a twin it set the sticky `ambiguous`,
  which credits nothing, and a same-owner leader line keeps `ambiguous`.
- To see what the engine does with a real log: copy it as `eqlog_<Name>_<server>.<anything>.txt`
  (the replay tool reads the character from that shape), then
  `engine/target/release/parity <copy> --snapshots > out.json` (`cargo build --release -p parity`
  first; the committed builds go stale). `scopes[]` holds every fight's rows. Keep the copy and
  the output out of the repo: they are the owner's log.

## Log archive (was log-archive)

- Plan and measurements: `docs/plans/log-archive/`. Laws: never write to the game log; a fold is
  never seeded with what it re-derives; combat history is lossless.
- The switch ("Summarize and archive log") is the only control: switch on = archive a log over
  100 MB, one archive per app run (the engine holds archived lines until relaunch).
- The fold ignores `PollStats.restarted`: only truncate-to-empty or whole-file move is clean.
- Log discovery is `/^eqlog_.+\.txt$/i`, non-recursive: an archive must not match it.
- `tests/e2e/log-archive-trial.mts` (not in the suite) runs the whole flow on a log copy.
- Open: a missing middle ledger can read "complete"; kills before the fresh log's first zone line
  file under unknown zone.
- The present across a rotation lives in ONE place, `shared/logArchive/carryOver.ts` (owner,
  2026-10-25: "some sort of COMMON CARRY OVER type spot"): a field a fresh log does not know until
  the game says it again (zone, level) goes in its `CARRY_OVER` table; the live value wins once it
  states one. Display only, never seeded into the engine.

## Sidebar groups (was sidebar-groups)

- One `GROUPS` table in `NavDrawer.tsx`. A change that adds a tab places it in a group in the
  same change. Maps under Research was an agent's choice; the owner never placed
  it.
- Row metrics (fork #10) come from `shared/navMenu.ts` (two px ladders, defaults 14px text / 28px
  rows) through four CSS variables on the drawer paper (`--nav-row`, `--nav-text`, `--nav-icon`,
  `--nav-icon-col`). `NavRowButton` and the "Open GitHub issue" row read them via `NAV_ROW_SX` / `NAV_ICON_SX`
  / `NAV_TEXT_SX`; no prop drilling. Group headings stay fixed (`GROUP_HEADING_SX`, 28px).
- TRAP: the default row height is a measurement, not arithmetic. It was first 32px, sized on paper
  so the open menu fit the default window; the Skills row landed the same day and the menu ran 21px
  over (MEASURED.md). A new nav row costs one row height, and an overflowing drawer grows further
  by itself: its scrollbar narrows the text column and a long row wraps (the old two-line Send
  feedback row went from 42px to 57px; since 2026-11-20 that row is one line, "Open GitHub issue").
  `stepNavMenu` in `tests/e2e/text-size.e2e.mts` checks the open menu against
  the drawer on a fresh install: when a new tab makes it fail, lower the default or shorten a row,
  do not delete the check.
- Rows use `minHeight`, never `height`: a label that wraps grows its row. `tests/navMenu.test.mts`
  holds the fit rule: the shortest row must hold the largest text's line (x1.3) and icon (x1.5). A
  new stop on either ladder must keep it.
- The two values are renderer localStorage (`eq.nav.textPx`, `eq.nav.rowPx`) read with `useRawPref`,
  like the folds: no IPC, no store field, no hydration-gate entry, not in the settings export. An
  absent key is the default, so the defaults are what every install without a pick draws.
- The Preferences card is `navMenuItem(SIZE_WORDS)` in `appearanceSection`, a factory call on
  purpose: `tests/uiScale.test.mts` counts the section's inline object literals (2) and pins the
  call beside them. An inline third item fails that count.
- `PrefStepper` has a third kind, `spacing` ("Shorter rows for" / "Taller rows for");
  `tests/overlayIndependent.test.mts` pins the other four names.
- The window zoom (In-app text size) multiplies these px values; at 90% with 28px rows a row is
  about 25 device px.

## The TEST build identity (was test-neutering)

- The build is the project's own app, not a test of the original app. Nothing points a player at
  the original app by default; the original is credited, clearly labelled "no longer updated".
- What's new: the community releases (test.20 on, the public ones) render above the original
  app's history from `src/shared/communityReleaseNotes.ts`, generated from the `Test build`
  commits by `node scripts/community/community-release-notes.mjs` (never hand-edited;
  `releaseNotes.ts` holds the original app's notes and is left as it is, rule 13). Its known
  issues show for the newest release only.
  `tests/communityReleaseNotes.test.mts` fails when the newest entry is not the `package.json`
  version. The parser reads the notes' shape: ALL-CAPS sections (`NEW IN TEST.N`, `KNOWN ISSUES`),
  plain-text group headings, `- ` bullets, `  - ` sub-bullets; keep new notes in that shape.
- Open: sweep remaining links to the creator's repo; the NEW chip and the teaser strip still key
  off the creator's versions only; notes for test.1-12 are under tag
  `archive/local_all_changes_testing-2026-09-15`, test.6/7 as `local test:` commits.

## Installer size and dependencies (was installer-size, deps-refresh)

- A lockfile is regenerated, never text-merged: move the packages, `npm install
  --package-lock-only` on Node 24; the installer-size diff was only dev flags.
- Measured, left out: en-US-only locales changes formatting for other locales; `compression:
  maximum` is byte-identical.
- 2026-10-29 major bumps, one `deps-*` branch each: React 19 + MUI 7, Vite 8 + plugin-react 6 +
  electron-vite 6, ESLint 10 + react-hooks 7 + typescript-eslint 8.72, TypeScript 6,
  electron-store 11 + chokidar 5, Electron 45 + @types/node 24, koffi 3.
- Held back, and why: MUI 9 drops the system props (`<Stack alignItems>`, `<Box display>`): 425
  sites over ~200 files, a `v9.0.0/system-props` codemod sweep of its own. TypeScript 7:
  typescript-eslint peers `typescript <6.1.0`. electron-store 12 (conf 16, a 2026-10-12 rewrite)
  and chokidar 6 (2026-10-19): too new when looked at.
- onnxruntime-node 1.31.1 (2026-11-27, from 1.20.1): binaries in `bin/napi-v6`; onnxruntime.dll
  carries Microsoft's 1DS telemetry client and opens HTTPS to
  `mobile.events.data.microsoft.com/OneCollector` during synthesis unless
  `ORT_DISABLE_TELEMETRY=1` is in the PROCESS environment before the runtime starts
  (`speech/engine.ts` sets it on main before the worker; a worker's `process.env` does not reach
  native code). Measured with `Get-NetTCPConnection` on the synth process: one connection without
  it, none with it. onnxruntime.dll imports `MSVCP140_ATOMIC_WAIT.dll`: `speech/pinned.ts`
  provisions it as a fifth file. `dxcompiler.dll` (WebGPU provider only, never mapped on the CPU
  path) is excluded in electron-builder.yml. Output wavs differ from 1.20.1 at the sample level
  (same lengths within 0.1 s, 10 ms envelope correlation 0.90-0.98); the wav cache keeps old ones.
- Lint kept as it was on ESLint 10: react-hooks 7's presets add the React Compiler rules (131
  findings), so the renderer block names only rules-of-hooks and exhaustive-deps;
  `no-useless-assignment` and `no-meaningless-void-operator` are off (54 and 11 idiom sites).
- Vite 8 traps: `json.namedExports` (default true) now beats `json.stringify`, so both bundles set
  it false; Rolldown still emits the chunk of an `import()` gated on ANOTHER module's constant, so
  a build-time strip keeps its `false` in the same module (`devTriage.tsx`). Compare a build's
  `out/renderer/assets` file list against the last one after any bundler bump.
- An ESM-only `dependency` in main (electron-store 9+, chokidar 5+) must be bundled
  (`externalizeDeps.exclude`): main is CommonJS, and `require()` of an ES module returns its
  namespace, so `new Store()` throws.
- koffi 3's binary is its own package, `@koromix/koffi-win32-x64` (asarUnpack names it); koffi's
  `src/**/*.cjs` is its loader and must ship.
- Electron 44+: `clipboard` is promise-based and `readImage` is gone (`shotIpc.ts` reads an
  `image/png` item).

## Gaps tab (was gaps-tab, gaps-item-facts, gaps-all-characters, gaps-overlay)

- 2026-11-20: an item page with no icon id is an Items UPDATE row (`shared/gapIcons.ts`,
  `GapRow.iconUpdate`). Main answers which pages state no `lucy_img_ID` once per session
  (`main/gapItemIcons.ts`, IPC `gaps:iconlessItems`); the renderer keeps only the ones the loot
  or an inventory export shows (`useIconRows.ts`), and none for an item an Items row already
  names. Copy is the one field line; the number comes only from a capture's icon match. The
  data is the committed corpus: a page fixed on the wiki stays a row until the next delta.
- 2026-11-10: a merchant's price quote (`X told you, 'That'll be 2 gold per Y.'`) files Y as an
  Items row of kind `quoted` with X as its source (`gaps_stock.rs quoted`, `Details::quoted_by`),
  as a purchase does; before, only the merchant's `items_sold` took it, and an unknown item was a
  row only once bought or captured. `wikiPage.ts` reads `quoted` as `bought` for the `soldby` rows.
  A quote for a player's resell names a merchant that never stocks it: pruned by hand, as on merchant
  pages (the 2026-10-23 ruling). Owner: Darkwood Bowstave at Zok Rurpp.
- 2026-11-10: `MobEntry.sells`, a merchant page's stock (the `{{:Item}}` titles under
  `|items_sold`, 1,009 records, re-derived offline). `gapMobPage.ts sellersOf` indexes it by item
  name; `catalogSellers` adds the merchants the log did not name to an item page's `soldby` rows,
  each placed by its own page (`vendorAt`). Owner: "the code should be smart enough to know that
  the Bowstave has other merchants that sell it, based on the wiki cache" (Asher, Nektropos
  Undercrofts). Not yet: a KNOWN item's page lacking a merchant the log quoted is no Update row.
- 2026-11-10: an item page's `soldby` row places its vendor by the catalog first (`vendorFinder`,
  one page, one spot), else by the log's own `/loc` beside the hail or con (`locFinder` over the
  engine's `mobLocs`, the point the vendor's Mobs row already puts on its page). `VendorPlacing` in
  `gapMobPage.ts` carries both finders. Owner: Zok Crikk, hailed beside a `/loc`, page created and
  marked done, yet Unusual Wine and Ale - Part 2's row had an empty loc cell (his page postdates the
  2026-11-08 scrape, so the catalog had nothing). The catalog's spot still wins where it has one.
- 2026-11-10: a mob's `/loc` points within 20 units of a kept spot's mean are that spot, averaged
  (`gaps_locs.rs CLUSTER_UNITS`; owner: two `/loc`s beside Scribe Noglleg "are basically the same
  loc", then "100 units is a bit much, should be 20 or so"). A point further off is a second spot, as
  before. Measured (MEASURED.md, /loc section): his standing NPCs' pairs lie 36 to 50 apart, so at 20
  those still read as two spots; roamers 273 and up.
- 2026-11-10: Copy on a Mobs or Merchants row reads the live page first (owner: "click copy ... it
  should do the fresh fetch of the page, compare and validate, and give me the updated full wiki to
  just copy/paste into place. I don't want to be doing surgery on the page if I don't have to").
  `main/mobLookup.ts readMobPage` (after the Copy door, same client and ledger feature, a read kept
  half an hour for the row's next clicks, else one search and one page fetch; a zone-titled row asks by
  its title and never searches), IPC
  `gapMobPageRead`, `shared/gapPageMerge.ts mergeMobPage`: a template field EMPTY on the page takes
  the draft's value, a filled field and `description` are never touched, nothing outside the template
  is touched; what the page did not take is handed back per field with the reason ("Exceptions:
  individual currently EMPTY fields ... just give me that section and make sure I know that's the
  reason"). `MobCopyDialog.tsx` shows the result and puts the page on the clipboard as the read lands;
  no page: the new page as before; wiki out of reach: the draft, said so; a page of free text: the
  draft, said so. A redirect row, a forage update and a quest-giver add text keep the plain copy.
- 2026-11-11: THE TABS STAY SPLIT BY PURPOSE. The one Mobs list of 2026-11-10 (`gapNeeds.ts`: Merchants,
  Factions, Images and Respawns folded into Mobs behind Needs chips, an Update row per known mob) is
  reverted whole (commits 89960b1e3, 1b474d936 and the 2026-11-11 Copy fix on top of them). Owner:
  "before i would go to image tab, paste, upload, and mark done. Now i go to mob and I'm like 'oh the
  mob is missing'"; "i'm leaning personally towards reverting the combined MOBS tab". His wiki work is
  batched by kind of edit, which is what a tab is; a row's tab is its purpose. Kept from that night,
  since none of it depends on the fold: the Copy page read and fill (below), drop groups on mob pages,
  a zone-titled row's loot kept to its zone, the Seen as cell collapsed to two chips and a count
  (`SeenAsChips.tsx`; the pane lists them all), and a redirected name's Copy as its whole page, read
  nothing (a giant fire beetle sent to A giant beetle: the read had filled the beetle's page).
- 2026-11-11: THE COPY READ IS KEPT HALF AN HOUR (owner: "we do not want to hit the wiki so much, we
  really need to avoid this as much as possible"): `mobLookup.ts readMobPage` answers the same row's
  later clicks from memory (`READ_KEEP_MS`; an offline answer is not kept), the dialog says the read's
  clock time, and a row that knows its page's title (zone-titled, or found by the verdict) fetches that
  page and never searches: the plain search once handed a Rathe Mountains kobold the Warrens page. Every
  request is still a `mob copy` line in the wiki ledger (`wikiClient.ts recordAppWikiCall`).
- 2026-11-11: an Images row for a name several imageless pages share (`A Kobold Scout`, Steamfont;
  `A kobold scout (Toxxulia)`) is the page whose `|zone` the mob was met in (`gapImages.ts pagesMet`,
  `zoneKey` equal or one within the other; a loot or a con places a mob, a kill does not), one row per
  page met, each with its own zones; met in no page's zone, the plain page, and with no plain page no
  row: never another zone's page (owner), the missing page is the Mobs tab's `zoneTitled` row. Both pages can name ONE file
  (`npc_a_kobold_scout.png`): one upload then pictures both. Unchanged: a name with an image on any
  page is no row.
- 2026-11-10: a new mob page lists a drop group as its group line (`[[Rusty Weapons]]`, rated by the
  corpses that dropped any member), as the Drops tab files them (owner: his A kobold (Rathe Mountains)
  page listed every rusty weapon); a `zoneTitled` row takes loot only from its own zone (owner: "we
  shouldn't be pulling in loot from other 'a kobold (zone)' to ours"); kills and cons are still by name.
  A generic mob's hail answer is not quoted on its page (a kobold's "Grrrrr. Bark."): merchants, mobs
  with a role or nameplate, and named NPCs keep the quote (`gapMerchantDescription.ts hailWorthQuoting`).
- 2026-11-10: a mob page split by zone (`A kobold (Warrens)`) answers to its plain name only in its
  record's zones, any tier (`gaps_names.rs known_in`, `GapIndex::mob_zone_splits`); elsewhere the name
  is a Mobs row served `zoneTitled`, and its Create page opens `A kobold (Rathe Mountains)`
  (`gaps.ts zoneTitledPage`). A name with a plain page too stays known everywhere. Owner: the Rathe
  Mountains kobold drops Kobold Scalps and Woven armor, nothing of the Warrens page. The zone match
  is lenient (`zone_matches`: equal, one within the other, or a telling word shared), since the
  wiki's zone fields use short forms (`Eastern Karana`, `Lake Rathe`, `Unrest`); checked against all
  42 zone-titled-only pages, 2026-11-10: only `A goblin alchemist (Beholder's Maze)` (zone field
  `Beholder's Maze`, log `Gorge of King Xorbb`) misses, and a miss errs toward a row, never silence.
- 2026-11-10: a guildmaster's nameplate (`(Shadow Knight Guildmaster)`, read off its picture) gives a
  Mobs row's page `class = GM [[Shadow Knight]]` and `Shadow knight guildmaster in <zone>.`, as 50
  cached guildmaster pages say it (`gapMerchantDescription.ts subtitleRole`, `subtitleSentence`); a
  target line's role still wins. Mob pages now take the nameplate and hail-answer description that
  merchant pages took (owner: Bok Master Thragnog's page had neither).
- 2026-11-10: the rows show a zone without its tier or instance mark (`Lake Nerius 4 (Refined)` ->
  `Lake Nerius`; `shared/zones.ts zoneBaseName`, `gaps.ts foldZoneTally` for the Zone column, its sort and
  the open row's zones chips; owner: "just show the zone, not +1 +4 whatnot"). The engine still serves
  the tiered spellings: Copy wiki page and the zone filter read them as before.
- 2026-11-10: a capture files a NEW Items row only under a plausible name (`itemShotKeep.ts
  plausibleItemName`: three letters, one lower case; owner: an `IL` row from a Kobold Talisman's icon read as
  letters). The window reader prefers, among the lines above Class, the one the title bar starts with
  (`itemWindow.ts titleNamed`), so an icon read as its own line under the name is not the name.
- 2026-11-10: a quest page titled `<name> (quest)` / `(Quest)` (the wiki's suffix when the plain title
  is a mob's, item's or zone's; 9 of 913 catalog pages) answers to the game's task name without the
  suffix (`gapQuests.ts questCatalogFinder`). Owner: the Skunk Scent Gland task was a New page while
  the wiki had `Skunk Scent Gland (quest)`. A plain title that is its own quest page keeps its entry.
- 2026-11-09: a KNOWN NPC's page lacking a quest the catalog says it gives is a Mobs row, an Update
  page (owner: Lord Ollix Everling's page, a template stub, lists none of The Tragic Tale of House
  Everling; the Mobs domain filed only unknown names and a quest enters only through a task line).
  `knowledge gap_index.rs mob_quest_gaps_of` pairs quests.json `giver` (by mob key, under every name
  a page answers to) with the record's `relatedQuests` (the page's `related_quests` links, a
  `MobEntry` field since 2026-11-09, re-derived offline); `gaps_quest_givers.rs` files the row when
  the log meets the NPC (hail, /con, kill, loot), `questGaps: { page, quests }` on it; the Event log's
  con mark skips such a row (`gaps_marks.rs`). TS: `gapFieldActions.ts` gives the "Add quests to
  mob page" chip, Copy gives the `* [[Quest]]` bullets, `stillNeeded` is empty. Giver only, not
  `relatedNpcs` (a page need not list every quest that mentions the NPC). Measured 2026-11-09: 70 of
  604 giver pages lack one of their quests (73 quests).
- 2026-10-25: E4 turn-ins count only at `You complete the trade with X.`; an offer left open, handed
  back or cancelled is none (`gaps_quests.rs`). Map links: `lib/mapZoneLink.ts` (context from the
  gate), `shared/gapMapZones.ts`. Stored edits are read through `readEdit` (non-strings dropped, the
  store untouched). Held tiers: `GapHeld.tiers` only when no +0 copy; the chip is `primary` then.
- The tab is lazily loaded through `unreleasedGaps.tsx` (the name is historical; every build draws it).
- Review and decisions: `audits/2026-10-19-gaps-review.md`. Laws from it (owner, 2026-10-19):
  instance tiers are one place and one item (`+N` folds to the base everywhere; zones are written
  as the wiki spells them, `shared/gapWikiZone.ts`); a rate is corpses over kills, no rate when
  drops exceed kills; a capped "better" faction line is a raise; `* None` only where the log
  proves none (credited kills, no faction line).
- One-word NPCs (`gaps_players.rs`): a hailed or conned one-word name files a Mobs row unless the
  log showed a player (chat, tells, group joins, `/who`); it is "may be a player" until an answered
  hail or a revisit in the same zone 10+ min later; "Mark as player" is a per-viewer list
  (`eq.gaps.players`). Measured: no catalog NPC sends tells on Legends (77 tellers, 0 in the catalog).
- Event log picture mark (`needsImage`): any conned name the catalog knows with no picture, one-word
  names included (owner, 2026-11-17: the overlay must show what the Images tab lists); never a name
  the log showed to be a player (`who.is_player`), a mount, familiar, warder or pet. The feed drops a
  repeat con of one mob inside 10 s (`CONSIDER_FEED_DEDUPE_MS`): space cons in a test.
- Loot fields: `mobs.json commonDrops` is the page's `|common_loot`; Drops counts both fields and
  dropGroups.json `aliases` (redirect titles); Copy wiki page files a name under common_loot when the
  wiki does on 3+ pages and more often than under known_loot (`commonLootNames`).
- Spell pages fill from the install's spells_us.txt / spells_us_str.txt (`src/main/gapSpellFacts.ts`,
  owner 2026-10-19). Level 254 (AA rows) and 255 mean no scroll; the other-person message is joined to
  "Someone" as it stands (`'s skin` or ` staggers`).
- Rows: Done marks are per viewer and per origin (`eq.gaps.done` in localStorage: the dev server
  `localhost:5173` and a `-Prod`/installed build `file://` keep separate marks). A mark holds the ISO
  time it was made and clears when the wiki data's `scrapedAt` is later (owner, 2026-10-25: "it
  should go off TIME"; a bare-day mark from before compares by day); never on the row's absence.
  `useDoneMarks(GAPS_DATA_STAMP)`: the call is in `useGapsList.ts`. A faction, drop or image chip opens the catalog page title picked by zone (`shared/gapMobPage.ts`).
- Held now (C6, `shared/gapHeld.ts`): the last `/outputfile inventory` export through
  `useGearOwnership`, plus kept loot since (`computeHeldCountsAfter`), less destroys since; no
  export, no claim (a loot line cannot tell a copy held from one sold). Items domain only.
- Soldby (D1): `{{ItemWhereTable|` rows laid out byte-for-byte as the 1,247 cached pages write them
  (`{{ItemWhereRow   | ` prefix, zone cell 34 wide, vendor 30, empty third cell 15, `(ns, ew)`, an
  unknown loc `|  }}`); a vendor's loc only when its catalog page states one point (the wiki's row
  matched a multi-point page's first point 113 of 426 times). `vendorFinder` in `gapMobPage.ts`.
- Owner answers to the review leftovers (2026-10-19): C7 map link dropped (an unknown mob has no
  location); E4 turn-ins not built (an offer is not an acceptance). The row's work buttons also sit
  on each row as icons (`GapRowButtons.tsx`).
- Copy wiki page (`shared/wikiPage.ts`): a page holds only fields the log fills, no placeholders, no
  blueprint option lists (owner, 2026-10-18: "each item page has FAR less than that"); `statsblock`
  stays open for the player's screenshot. Blueprints:
  https://eqlwiki.com/Help:Contents#Item_Page_Blueprint, #NPC_Page_Blueprint,
  #Merchant_Page_Blueprint, #Spell_Page_Blueprint. Model output on real cached pages (Fire Beetle
  Eye), not on the blueprint. The other half of the rule (owner, 2026-10-23: "if we can get it from
  the screenshots or log we need to put it into the item right?"): every fact a screenshot or the
  log gives goes on the page, in the form the wiki's own pages write it (categories, the full click
  line, Pet Illusion, drops, vendors, quests); a field left out needs a stated reason.
- Drop rates go on the MOB's page, per `known_loot` item and per group line, as the wiki's own
  spans: `<span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~12.5%]</span>` (owner,
  2026-10-18: the drare word from the bands the wiki's 9,806 lines use); never the wiki's
  `[1] 4x 55% (20%)` (loot tables, not in any log). A group line's rate is the corpses that dropped
  ANY member over the mob's kills; no kills or more drops than kills leaves it off.
- Corpse coin (`gaps_coin.rs`, `mobCoin`): Legends pays at the kill, `You receive ... from the
  corpse.` in the kill's second (5,576 of 5,689 lines claimed by a death within 2.5 s); a page gets
  the wiki's `MONEY DROPS` block (min - max per coin, the 406 cached blocks' colors and words).
  Never "NO MONEY DROPS" or "no loot": the game prints nothing for a coinless kill or an empty
  corpse, and rare payers are real (a basilisk paid on 2 of 103 kills), so no count proves none.
  `mergeGaps` joins it per mob (log-archive).
- Zones the wiki titles differently: `ZONE_ALIASES` in `shared/gapWikiZone.ts`; Temple of
  Cazic-Thule links `[[Cazic Thule (Zone)|Cazic Thule]]` (plain `Cazic Thule` is the god's
  disambiguation page) and files `[[Category:Cazic Thule]]`. The owner is asking the wiki's editors.
- `PLAYER_LEVEL_CAP = 50` (`gaps_players.rs`): a con above it makes a one-word name an NPC for good.
  Raise it when an expansion opens levels.
- Hide uncertain (`uncertainGap`, `eq.gaps.hideUncertain`, off by default): only "may be a player"
  rows; a near miss, a faction with no direction, an unpicked drop page and a cache verdict are real
  gaps with an unsure detail and stay.
- Not from the log: stats, slot, icon id, quest rewards, foraging, normal merchant sale price
  (Gaps keeps only the sale-on-loot), a merchant's stock. A merchant page needs a purchase
  tracker (asked, not built).
- The sale-on-loot note shows only the vendor value (= the game's Value line); the derived base
  price is not shown (owner read it as a wrong Value).
- Group by zone, then mob (`shared/gapGroups.ts`): an item under every (zone, mob) the loot ledger
  saw drop it; index the ledger once (a per-row scan over 500 rows is the lag shape).
- Event log `unknown` flag (`event_feed.rs`): an unknown pickup is admitted, a player-shaped con is
  never flagged, and the overlay never looks up an unknown item (that lookup asks the wiki).
  A con's mark reads the engine's Mobs row, which `gaps_roles.rs served_under` keeps behind a
  Merchants row; the tab serves that NPC under Merchants, so `feedGapTags.ts` takes a Done on either
  domain (2026-11-01, Jeim).
- Merchants and Factions domains: the engine's `gaps_trade.rs` reads price quotes (`X told you,
  'That'll be ...'`, kind `unknown`), purchases and vendor sales, and pairs each death with the
  faction lines printed in the 2.5 s before it (`killFactions`); `shared/gapFactions.ts` checks the
  pairs against mobs.json `factions` (both page lists; spelling folded: case, a trailing period, a
  leading "the"). mobs.json `merchant` and `factions` come from `mobPage.ts`.
- Drops missing from a mob (`shared/gapDrops.ts`): mob pages link groups (`[[Rusty Weapons]]`) instead
  of their items; `scrape-drop-groups.ts` reads the 265 non-item drop-list pages and keeps the
  members written as a `{{Gear Set|...}}`, bullets, `<li>` items or table cells (spell, item and mob
  pages are no group): 52 groups on 2026-10-18. An item in a group is filed as the group (owner's
  rule).
- Images domain (`shared/gapImages.ts`): a met mob (kills ledger or a loot source) whose every page
  is `noImage` in mobs.json. `noImage` is written by `scrape-wiki-files.ts`
  against the cached file list; a re-parse of a mob page drops it, so the delta
  re-marks after every fold. 6,364 of 7,954 pages name a file nobody uploaded: only met mobs show.
  A row carries every zone a loot or con placed it in, the newest first (heads the row and its
  group); one zone only hid a mob conned here but last looted elsewhere under Zone I'm in (2026-11-01).
- Drops reads both sides of the wiki's tie: the mob page (mobs.json) in the renderer and the item
  page's dropsfrom from main (`gaps:itemMobs`, `src/main/gapItemMobs.ts`; items.json is main-only).
  The server-wide rule waits for main's answer, so a half answer never hides a real gap. Measured
  2026-10-18 on the live log, 1,038 rows: 209 Motes and Treasures, 193 with the item page naming
  the mob, 98 on mob pages listing no drops, 538 the wiki has nowhere. Tier instances add loot the
  wiki's mob pages do not cover (Befallen 4 Refined), so many rows come from them.
- That fetch follows redirects, so `drop-groups/pages.json` holds 142 full `{{Itempage}}` texts
  under titles items.json has no key for. Recounted offline 2026-10-27: 141 are drop-list links
  that redirect to an item page items.json has (A Shining Stone -> Shining Stone, A Piece of Rat
  Fur -> Piece of Rat Fur, Small Bronze Helm -> Bronze Helm), reachable through that record's
  `otherNames`. One is genuinely missing: Cracked Darkwood Shield (`{{Classic Era}}`, Highpass
  Hold), absent from the item cache's `embeddedin` list and every cached batch. No out-of-era or
  renamed ones (`ITEM_RENAMES` is empty).
- Why Cracked Darkwood Shield was missed (offline, 2026-10-29): its own text (that drop-groups copy)
  opens `{{Itempage` directly inside `<onlyinclude>`: no redirect, no wrapper template, and
  `Template:Itempage` has no redirects. `item-pages.json` was listed fresh at the 2026-10-18
  baseline, not reused. The wiki's own GitHub pack (built from the wiki's database) leaves it out of
  `items` and `wikiEntities.items` too, while `wikiEntities.titles` has it and `lootSourceCounts`
  names it. Two separate listings missing a page that plainly uses the template points at the wiki's
  own `templatelinks` row for it being absent (its links update never ran); a null edit or purge with
  `forcelinkupdate` on the wiki would repair that (a wiki action, owner's call). The deltas missed it
  because nobody edited it since 2026-10-18. Since 2026-10-29 the compare names such pages in
  `toRead.linked` and `scrape-delta.mts --titles-from-compare` reads them (DATA_REFRESH.md); on the
  2026-10-28 pack that is Cracked Darkwood Shield and Exaltations (an index page, reported not folded).
- Every wiki page (owner, 2026-10-29): `scrape-delta.mts --all-pages` reads each article no cache
  holds once; pages no DB takes are kept in `scripts/sources/cache/pages/` and listed with their
  categories in `src/main/data/wikiPages.json` (DATA_REFRESH.md, "Every page"). Not wired into the
  app or the Gaps tab yet: a Gaps row naming such a page could say the page exists instead of
  offering Create page. The index is rebuilt only where the item cache is junctioned.
- The wiki's Help page (Editing Standards > AI Generated Content): "All graphics and readable page
  text should be crafted by real human contributors". Told the owner about Copy wiki page.
- No generated merchant item list (owner, decided): vendor stock and player resells cannot be told
  apart, and quoted prices carry the player's faction and Charisma.
- Respawn learning files a gap under the zone WITHOUT its `[instance N]` tag (`respawn.rs
  record_death` → `respawn_places.rs learned_place`, 2026-11-05). test.40's per-place clocks had
  put each place's gaps in their own `learned` series (`nektropos castle 4 (refined) [instance
  709]::the game master` beside `nektropos castle 4 (refined)::the game master`), so the owner's
  three Nektropos 4 nameds showed one gap per place and never reached the three-gap wiki rule. The
  clocks stay per place; only the learned series is pooled, as the estimate already was.
- The respawn estimate pools the LEARNED store, not only the history (`respawn_places.rs
  pooled_gaps` → `respawn_learned.rs pooled`, 2026-11-07). Creating the next private instance
  drops the last one's history entries (its clocks), and the 800-mob LRU drops the rest in time, so
  an estimate read from the history alone forgot every gap a closed instance taught: the owner's
  three Nektropos Castle nameds respawned in 21-24 min in the Nov 5 instance and, in a fresh
  instance two days on, each clock ran from the open world's hour-long gap, "your kills (1 gap)".
  Every history gap is recorded in the store as it is learned, so the pooled count is the larger of
  the two, never the sum. Still open: a learned series keeps the tier (`nektropos castle 4
  (refined)::x` beside `nektropos castle::x` for a +0 instance), so the wiki three-gap rule can
  still split across tiers; the estimate pools by `zone_base` and does not care.
- A watch marked "several mobs share this name" (`sharedName` on the pref, the edit dialog's switch,
  owner 2026-11-09: same-named mobs made the clock read a minute or two) estimates from the gaps of
  ten minutes or more only, the lowest of them, pooled as before (`respawn_places.rs
  pooled_gaps_above`, `SHARED_NAME_FLOOR_MS`; the learned store's `pooled` takes the floor). With no
  such gap the ladder falls to the wiki, then none. The row carries `sharedName`; the label reads
  "your kills (N gaps over 10 min)". The switch writes on the click (`respawn:setSharedName`), not on
  Save, since Save is disabled while the row has no number. An unwatch drops the switch with the
  watch (the kept list holds typed numbers only); `respawnWithCustom` keeps it.
- A property a define carries must be named in its schema type, or the engine drops it: `ops.rs`
  hands the fold the TYPED params re-serialized, so `additionalProperties: true` does not carry an
  unnamed property through. `sharedName` was missing from `RespawnWatch` until 2026-11-19 and the
  switch did nothing in the running app while every fold test (raw JSON) passed. The crossing is
  pinned by `engined/tests/live_surfaces.rs a_watchs_shared_name_switch_survives_the_wire`; a new
  pref property needs its schema line, `npm run gen:protocol`, and a test at that level.
- The archive merge takes a row's served fields from the NEWER side (`mergeGaps.ts mergeRow`,
  2026-11-05). A name on both sides joins its tallies; `itemsSold`, `greeting`, `role`,
  `questFacts`, `suggest` and the like are the live fold's current reading. Before, `...had` kept
  the archived row's fields and dropped the live row's: Klok Sasz, met once in a 2026-09 archived
  log, copied as a merchant page with every quote on the live row and no `items_sold`. The on-disk
  segments show no `gaps` module (captured before it existed); the running app folds the archived
  log for it, so an offline check against the segment files misses this path. Ask for the row as the
  tab shows it (kinds, first seen) before reasoning from files.
- `event_feed.rs` is 431 code lines, near the 440 bar. The npm gate does not run the size check
  on the real tree.
- "I have it" (`eq.gaps.heldOnly`, off by default): Items only; filters through `useHeldOnly` before
  Hide uncertain; that lives in `useGapsList`, so the Gaps overlay follows it. No
  export, no Items row.
- Days back (All characters) chooses rows only: `ownSince` cuts the engine rows, the join cuts
  each character's rows, loot and kills stay whole, and `useGapsData` `inWindow` applies `gapsSince`
  to the derived list (drops, factions, images) once built. Counts and drop rates read the whole
  log; an archive that ended before the window is still left out whole. One memo slot per copy
  (`lastShown`, `lastShownOnly`): a fresh array misses `snapOf` and a Gaps visit
  costs 400-500 ms again. Held is never cut.
- All characters "Seen by": engine forage rows are noted under `item|name`, the Items row they become.
- Forage update rows (`shared/gapForage.ts`): the engine files a KNOWN item's forage under domain
  `forage` (served after the four, no total); `withForageRows` always removes those rows, and an
  Items row with `forageUpdate` stands in for each page that lacks something. Zones compare by
  place through the zone table, never by spelling (`Northern Karana` = `Northern Plains of Karana`).
- `main/gapItemForage.ts` declares items.json's `foraged`, `foragedNote`, `foragedCategory`
  locally (until 2026-10-26 the data came from a separate branch).
- Depot update rows (2026-10-27) ride the forage rows: the engine files a KNOWN item a loot line
  stored in the tradeskill depot under domain `depot` (`gaps_craft.rs stored`; not a redirect-only
  name); main answers items.json `ingredientCategory` on the same `gaps:itemForage` answer
  (`ingredient`); a page lacking `[[Category:Tradeskill Ingredient]]` sets `forageUpdate.ingredient`,
  on the item's forage row when it has one, else a row of its own. 35 rows on the owner's logs.
  SAVED_ROWS 3.
- By-products (2026-11-20, `gaps_craft.rs by_product`): a combine's by-product line
  (`... create an alternate product: Bottle.`) files the item under kind `by-product`, through
  `item_named` like any item mention (unknown: an Items row; known: no row; a redirect-only name:
  a redirect row). Not `crafted`: `wikiPage.ts madeAndForaged` writes Player Crafted for
  `crafted` and `failed-combine` only, and a returned Bottle is no recipe's product. No zone
  (`gaps.rs note`, the list that also holds `crafted` and `fused`). Never passed to `Combines`:
  a by-product that entered the pairing would overwrite the failed combine waiting for its raise.
  Before the fix the reader matched a spelling the game never prints, so none of this ran.
- `itemLookupParse.ts` is 421 code lines, near the 440 bar.
- Job rule: `shared/gapJob.ts gapJob` is the one classification. Faction, drop and image rows are
  updates; a merchant is an update when `isMob`; a `forageUpdate` row is an update; a faction row
  with `noPage` stays an update (the mob's own row is the new page).
- Held picker places: `gapHeld.ts SIDE_OF`; `HeldPart.place`; `heldCaption` takes `{ index, where }`;
  stored values `1` (Anywhere), `0`, `bags`, `bank`.
- Drops (2026-10-21, reversed the same day): an item in a group is always filed as the group. A page
  listing members one by one gets `replaces {lines, rate}` on that group's row only when it lacks a
  looted member, as an optional cleanup; never a row of its own (no edits for formatting alone).
  `CatalogMob.dropRates` (parallel to `drops`) is read when present; no data carries it yet.
- Images: named and filed after the log's spelling of the mob met (`npc_a_cave_bat.png` for met
  `a cave bat`, though the page A cave bat says `|name = a giant cave bat`); never after the page's
  `|name`. When two spellings reach one page, the one that is its title or `|name` names the row.
  `pageImage` when the page's imagefilename differs; qualified titles keep the page's file. Row
  names equal the con title, so a Done mark also quiets the Event log tag. `imageAction` sits below `factionAction`.
- Common forage: `gapForage.ts COMMON_FORAGE`; 6 -> 2 rows on the owner's logs.
- Saved Gaps files carry `rows` (SAVED_ROWS). Raise it whenever the engine serves a new kind of row
  an older save cannot hold.
- `gaps.ts` is 404 code lines, near the 440 bar.
- The app has only a dark theme: the job tags use palette `secondary` (New page) and `primary`
  (Update page).
- Forage rows in the derivation: `gapDerive.ts` keeps `only`, always runs `withForageRows`, and
  has `met.itemForage` in `keyOf`; `wikiPage.ts` writes `row.forageUpdate ? forageAddText(...) :
  itemPage(...)` (NEEDED_OF `[]` for a forage row); `useGapsData.ts` takes forage names from the
  snapshot the derivation receives, the joined one under All characters.
- A new quest page follows the wiki's Quest Page Blueprint (Help:Contents, read 2026-10-23; the new
  Lake Nerius pages follow it): `{{<Era> Era}}`, picture, `questTopTable` with `Starts In`,
  `= Reward =` (`<ul>`, one `<li>{{:X}}</li>` a line), `= Summary =` (`{{CheckboxList}}`),
  `= Walkthrough =` with a blank line after every block, `Hand [[X]] to [[NPC]]:` for a hand-in,
  `= Related Quests =` when the chain is known, `[[Category:Quests]]` then the zone. The blueprint's
  option lists (Classes, Required Faction) are not copied: a cell the log cannot fill is `?` or left
  out. Most of the 931 older cached pages write `Start Zone` and `== X ==`; the merge reads both and
  adds in the page's own layout. The player's name in an NPC line is `Soandso` (27 lines on 8 pages;
  `<name>` 9) in both the engine and `gapQuestPage.ts`.
- Quest Copy reads the live page: one `action=parse` read per Copy click (owner-approved: "i'd have to
  go look it up myself anyways"), never on render or a timer (`src/main/gapQuestLive.ts`); a title
  ending in `?` that the wiki lacks is asked once more without it. `gapQuestMerge.ts` only adds: rows
  the table lacks or holds `?` in, rewards, walkthrough blocks whose words are not on the page,
  categories; a differing start zone or faction number is a note, never an edit. The read goes
  through the shared `wikiClient.fetchPage`. A page whose body is only a link to
  another spelling of its own title is a stub: the read follows it once and says so (the wiki has
  `Unfortunate news` as a stub of `Unfortunate News`). The merge reads sections at `= X =` or
  `== X ==` and adds in the page's own level; `Starts In` is Start Zone; a hand-in counts as present
  when any Hand/Give line links the item, and a near-miss link (`Curt Dismissal` for `A Curt
  Dismissal`) is a note. Task lines are never added (12 of 931 cached pages carry one).
- Chained quests: a task assigned in the same second as another quest's step (Unfortunate news after
  Call for Aid's last hand-in) is served with `chainedFrom` and no giver or start zone; the page writes
  `Start Zone: Finishing the quest [[X]]`, no giver row, and that second's talk, hand-ins and rewards
  stay on the other quest. Repeated hand-ins are a count (`Give 3 [[Fresh Fish]]`); a task line
  repeated in its second, or right after itself, is one line; an item handed in at a step is never its
  reward (Nikko hands Defiled Fish Scales back, and the log says `You have been given:` for it).
- Fixed from the 2026-10-23 review: a cancelled trade is no turn-in for the item quest facts either
  (`gaps_quests.rs` `cancelled`, one `trade_cancelled` for both; pinned end to end in
  `gaps_batch_tests.rs`). An emote is the hailed NPC's unless a longer NPC name the fold knows (a Mobs
  key seen in the log, or the mob catalog) also opens the line (`A gnoll pup growls` after a hail of
  `a gnoll`); the name match is case-blind, as a say line is. An emote line has no name boundary of
  its own, so an unknown longer name still passes.
- Quest steps from the log (`gaps_quest_log.rs`): a step's hand-ins are the open trade's offers to its
  NPC (`You offered ...` until `You complete the trade with X.`, 5 min cap), not a window before the
  task line; Unfortunate news offered its letters 57-61 s before. Its talk starts at the player's last
  hail of that NPC. The log prints no task-completed line: an end is the last update with its rewards.

## Screenshot to wiki (was screenshot-to-wiki)

- Backstab (2026-11-01): the writer keeps the window's own Backstab line even where it equals DMG on
  a rogue piercer (the wiki would draw it anyway; an explicit line is harmless and wins when it
  differs). `wikiDefaultBackstab` runs on wiki parses only, never on `parseStatsBlock` or a window read.
- Paste routing (2026-10-25): `rowPaste.ts` `pasteKind` reads the box's own OCR lines; a popup is
  known only by its closing `Click 'OK' to...` line, because a chat window behind a mob is also prose.
  The +0 work-back uses the Tier bar only when y is 2^N and x is below it. Weight rounds up to a
  tenth, so its +0 is mostly `?`. Its `heldWhere` (update rows) does not yet say the tier or `also`
  as the Gaps tab's `heldLine` does.
- Plan and measurements: `plans/2026-10-20-screenshot-to-wiki.md`. Built on the Gaps tab and its
  overlay. Main: `src/main/shot/` (Electron-free) and `src/main/ipc/shotIpc.ts`; the window
  to wiki mapping `src/shared/itemWindow.ts`; UI `features/gaps/ShotPanel.tsx`, kept readings in
  `itemShotsStore.ts` (`eq.gaps.itemShots`); `wikiPage.ts itemPage(f, shot)`.
- Game art is never committed or shipped: the icon index is built from the player's
  `uifiles/default/dragitem*.dds` and cached as `userData/item-icon-index.bin` (fingerprint: sheet
  count, bytes, newest mtime). Tests use synthetic sheets; the real-icon tests skip without an
  install (`EQ_ROOT`).
- Icon id = 500 + (sheet-1)*36 + col*6 + row (column-major). Sheets are DXT5, one DXT3 (323), two
  A8R8G8B8 (9, 302).
- The background view with the LOWEST best score wins, never the widest margin: by margin a
  meaningless near-tie on the raw sky beat the real answer (Malkil's sky shot).
- OCR: TSV output, never `blocks` (the tree of a big window overflows the worker message, "Too many
  properties to enumerate"). Scale by area, ~3 MP: 1x read `DMG: 90` as `920` on Malkil's window.
  Input as an 8-bit gray PNG (`grayPng`, node zlib): BMP went through tesseract's JS decoder, slow.
- Never guess a number. Two measured repairs only: Weight's one decimal (lost on 3 windows of 3), and
  DMG against the window's own Ratio and Delay (the player is told in `checks`).
- Locate the icon from the `Class:` and `Race:` WORDS (`OcrLine.lead`), not the line box: OCR reads
  the icon beside the text as junk (`| Class`, `8 Quest`) and stretches the box over it.
- Packaging: `electron-builder.yml` keeps the three FULL tesseract cores (`tesseract-core{-relaxedsimd,
  -simd,}.js` + `.wasm`) and `4.0.0_best_int`, and drops the `-lstm` cores, `*.wasm.js`, `dist/`,
  `zlibjs` (browser only) and `4.0.0`. TRAP (2026-10-21): tesseract.js 7.0.0 under Node always
  loads the full core (`getCore(lstmOnly)` gets a boolean its OEM test never matches); the first
  dist kept the `-lstm` ones and the packed app could not find its core. Dev and `npm test` never
  show it (every core is in node_modules). After any change to these lines or a tesseract bump,
  run OCR inside the packed asar: `ELECTRON_RUN_AS_NODE=1 "<win-unpacked>/EQ Legends Companion
  TEST.exe" <script>` that `require`s `resources/app.asar/node_modules/tesseract.js` and
  recognizes a small PNG (2026-10-21: 161 ms, installer 139.5 MB).
- `tests/shotScreenshots.test.mts` runs the real OCR (~12 s with the icon checks).
- What a paste keeps is pure and tested (`shared/itemShotKeep.ts`, `shared/mobPicture.ts`): a paste
  with nothing usable keeps nothing; another item's window waits for Use it anyway; a window paste
  replaces every window field, a Lore paste only the lore. Merge against `itemShotNow()` (the
  store now), never a render's copy, and ignore pastes while one is being read.
- Nothing in `shotPicture.ts` throws to the renderer (a failed write answers `{ status: 'error' }`,
  `pictureFiles.ts`), and every renderer call has a `.catch`/`.finally` that clears the spinner
  (review, 2026-10-21). Async answers in `MobPicture.tsx` go through `latestOnly` tickets; the
  nameplate check takes the save's `checkId` (main keeps that one decoded picture), never the bytes.
- Main writes only `.png` (`pictureFileName`), and deletes only files this run saved.
- `.npmrc` audit note is stale (review, 2026-10-21): tesseract.js brings
  `opencollective-postinstall` (`hasInstallScript`), suppressed by `ignore-scripts` and harmless
  (a donation banner), so the file's "SIX" install-time hooks are now seven. `.npmrc` is the
  creator's file: left as it is, recorded here.
- The icon box is placed from the `Class`/`Race` word itself (`ocr.ts` `LABEL_WORD`): OCR junk off
  the icon can be a real-looking word (`By`).
- The icon box's size is the line pitch at `Race:` (`readItemShot.ts pitchAt`: Race minus the row
  above it), never Class to Race: a class list that wraps (ten classes) puts a row between them.
  The Class row is the LAST line with the word above Race: a name can hold it (`CLASS 1 Steel Hooked
  Arrow`). Checking a box change: both trees' `iconRegion` on every kept picture's lines, then
  `readItemShot` only where the box moved (2026-11-18: 217 pictures, 4 moved, ~3 min).
  TRAP: the box has ~2 px to spare on the left. The pane's border line 1 px inside it stretches the
  query's content box to the full height and every score ties near 600 (a clear win is under ~350
  against 1,000+). A near-tie at 600 means the box, not the matcher.
- Auto-find anchor: the selected tab's yellow label, `max(r,g)>=100 && b*3<r && g>=0.6r`; its height
  sets the scale. Each yellow word's own text is OCR'd first (a crop, ~10 ms) and only `Description`
  / `Lore` (`isTabWord`) gets the full read: by shape alone, chat titles, map buttons and gauges
  outranked the tabs (owner's screenshots 2026-10-22: tabs 10th-11th of 24). Up to 60 words, 10
  windows. Sides (`sideCol`): the NEAREST column whose step holds on 80% of rows 3-16 label heights
  under the label, at least 0.6 of the steadiest in reach; never the strongest (a neighbour window's
  frame, 97, beats the own, 85) and not 3-10 heights (the icon fills most of it). The bottom is the
  first edge below which the sides stop. A spell window has no yellow tab: no anchor for it yet.
- Name line: a 1-2 character first token is dropped when the rest equals the title bar
  (`iconJunkDropped`: `S Halfling Blood`; `5 Dose Potion of Cold` keeps its 5).
- Capture triggers: no `globalShortcut` (a test sweeps the source). Macro `/echo eqc capture`: main
  adds an alert definition of its own, `eqc-shot-capture`, to `alerts.define`
  (`dataServer/ownFires.ts`, `withOwnDefs` at the engine host's send site) and takes its fire in
  `noteFire` before any sound. Line rule and gate in `shared/shotTrigger.ts`. Overlay:
  `SHOT_CAPTURE_ACTION` with `OverlayHeaderAction.whileLocked`.
- `/echo` is not yet seen in any of the owner's logs; the bare-text line format is assumed. First
  live test: check the line appears.
- `readCapture` returns `windows[]`, every window found.
- Spell window: Reuse is never written (whole seconds on the window); a bracketed value is the
  modified one and never written.
- Capture trigger (rebuilt 2026-10-21): the player's own `You tell eqc…:<n>, 'eqc capture'`; a second
  watch of the app's own (`eqc-shot-channels`) keeps the latest `Channels:` line; IPC `shotChannels`.
  `/echo` does not exist in the game; `/tell <self>` logs no text.
- Nameplate check (`shot/nameplate.ts`): the picture as it stands, then near-white, then bright text.
- Spell rank read against the row's name (`rankAfter`); `Resist: X -N` writes X.
- A filled exaltation slot keeps its kind of effect off the page (no catalog at read time).
- Review fixes (2026-10-21): the Class line = line start plus a colon or a code, a window needs
  Class/Race codes, a Lore's prose may say "class"; `itemDelevel.ts` inverts each
  stat by `upgradeStatClass` through itemUpgrade.ts's own rules (Range, Backstab, the penalty past
  ten), never a copy (2026-10-25); a classic numeral spell
  (Clarity II) is told from an upgraded rank by the install's spells_us (upgraded ranks are not rows
  there); the name check allows two OCR slips but never a digit change and never when another known
  name is as near, and a capture files at once only on an exact name; forage update rows take no
  shot (`isItemShotRow`); capture takes only a window titled exactly `EverQuest Legends` or
  `EverQuest` (the owner's client: "EverQuest Legends"), the thumbnail is at most 16 MP from the
  largest display, and an OCR read times out at 60 s and restarts the worker.
- Ready (`shared/gapReady.ts openNeeds`): a row's `stillNeeded`, less a mob picture saved from the tab
  (`eq.gaps.mobPictures`, keyed by `pictureFile`); an Images row needs its picture; a redirect needs
  nothing; `stillNeeded` asks for the Lore tab when a kept window showed one. `useGapReady` (inside
  `useGapsList`) reads every page input once; readiness is read only under Show: Ready, so a kept
  shot never re-filters the other choices; it never reads the loot ledger.
- Capture results (2026-10-21): the bar is one line of instructions plus a status mark
  (`IPC.onShotCapturing` drives the spinner); a reading's checks live on its row
  (`setCapturedRead` / `useCapturedRead`, in memory); `unplaced()` drops junk under 4 letters.
- Every failed paste goes through `shotProblem` / `spellProblem`; every name check through
  `otherItemNote` (an unread name asks, never passes).
- Spell icon = spells_us field 76; description id = field 86 into dbstr type 6; colour tags dropped,
  `<BR>` to `<br>`.
- D3: Weight's ceiling is many-to-one, so most +N items over 0.1 weight get the warning, not a guess.
- Fixtures: every game screenshot the owner or a tester sends (item, Lore tab, spell window, mob
  picture) is committed to `tests/fixtures/shots/` with a test (owner, 2026-10-21:
  "they should be saved into the repo for test images for unit/regression testing"). Screenshots of
  the app itself are not fixtures. An image sent while the agent is mid-reply is not written to the
  session's `images` folder (Claude Code in VS Code): describe it to the agent and ask the owner to
  re-send it after the reply, or to save the snip as a file and give its path.
- Font reader (D2, built 2026-10-27): `shot/fontReader.ts` matches the player's own GDI 12 px Arial
  (ClearType, blue channel; `fontAtlas.ts`, koffi, ~25 ms once, never PowerShell) on its own worker
  (`fontReaderWorker.js`, a rollup input), alongside OCR. `fontMerge.ts`: a cell with fit <= 0.02
  replaces the OCR words under it; OCR keeps its lines, boxes and order (the icon is placed from
  them) and everything else (title bar, art, other scales). Item windows only (`readItemShot.ts`);
  spell, popup, journal and nameplate reads are OCR alone (spell windows measured 2026-10-29: same
  page fields 61 of 61 with or without the font; not wired, plan section "Font reader on spell windows").
  `I` and `l` are one bitmap: the catalog's
  words pick (`fontWords.ts`). Windows only: elsewhere `arialAtlas()` is null and OCR reads alone.
- Font reader traps: art slivers fit `i`/`j`/`f` exactly at 1.5x, so a cell over no OCR word needs 3+
  letters or digits and never makes a line of its own (`Place`, a button, became an unread line).
  Attach a cell by the OCR WORDS it covers, not the line box (`8 Quest` took the Class cell).
  Under tsx an arrow made inside a hot function costs an esbuild `__name` call each time (3x slower).
- Font reader calibration (2026-11-17): the scale was judged on the ONE widest text cell, and when
  that was the title bar (drawn with a shadow, fits no scale) the reader returned scale 0 and OCR read
  the whole window: 45 of the owner's 154 kept item pictures, and Wu's Fist (long listed as "0.91").
  Now the next widest cells lead in turn (`LEADS`), and a later lead's reading is used only when 3+
  cells read exactly (`proven`). The widest cell's own answer is unchanged.
- The title bar is a second reading at 1x only (`fontMerge.ts confirmedCells`): a cell fitting
  0.02-0.35 whose box spans the OCR words under it, with no fewer letters and at most 3 slips, replaces
  them (`Reincamalion` -> `Reincarnation`). Never at a fractional scale (Rickety Fishing Pole at 0.90
  came back `Rickety' Fishing F'ole`). Title cells drop letters at `g`, `p`, `y`, so a title with one
  is not corrected. The name line's leading icon junk of any length is dropped when the title names
  the rest within 2 slips (`itemWindow.ts iconJunkDropped`: `wee, Token of Reincamation`).
- Checking a reader change: read every kept picture with both trees and diff name, statsblock and
  lore (the owner's picture folder `item/` plus `tests/fixtures/shots`; a script per tree that imports
  `readItemShot` by file URL, ~3 min for 200 pictures). The 2026-11-17 run: 207 pictures, 159
  identical, 31 the same page with the font now fitting, 16 better, 1 two-window fixture changed.
- The existing screenshot tests keep the OCR-only path (it is the fallback and the non-Windows path);
  `tests/shotFontReader.test.mts` pins the font path: 0 wrong of 1,903 transcribed characters for the
  reader, font+OCR 0 (4 before the 2026-11-17 title-bar check), OCR alone 42; every item fixture's
  page OCR's or better.
- Picture root = live autoDir, else live lastDir, through `pictureRoot` (a kind's folder stands for
  its parent; `lastDir` is saved as the root). Mob -> `<root>/npc`; item/lore ->
  `<root>/item/item_<n>[_lore].png`; spell -> `<root>/spell/spell_<n>.png` (`keptPictureFile`). Item
  and spell copies are overwritten with no prompt; `IPC.shotKeepPicture` answers `off` with no folder.
- Held = `heldPicture`: the folder listing (`<root>/npc`, then `<root>`, any case) wins; a saved-store
  entry whose path is in a listed folder but missing from it is not held. Main lists via
  `IPC.shotFolderPictures`; `folderPicturesStore` re-reads on mount, focus, after save/delete/folder
  change, and the overlay every 30 s. The player's files are never moved, renamed or deleted.
- A capture's `Captured.png` is that window's crop (`windowPng`) and rides `CapturedRead.png`, so "Use it
  anyway" keeps it too. Pictures are written after the reading is kept and never block it.
- Overlay code imported by tests uses relative `shared/` imports, not `@shared` (`feedGapTags.ts`).
- A renderer `<img>` from a Blob URL needs `blob:` in `index.html`'s `img-src` (2026-11-10: the picture
  beside "is it X's?" (`PasteZone.tsx WrongItem`) was a broken image for two weeks; nothing in the gate
  checks the CSP). `media-src` had `blob:` already, for alert sounds; `img-src` has it now.
- `shotIpc.ts catalogNames` includes each item's `otherNames` (wiki redirects).
- Details picture: `rowPicture` (shared/mobPicture.ts) picks it (mob/Images: the held picture; item: `item/item_<n>.png`,
  never the Lore one; spell: `spell/spell_<n>.png`); `RowPicture.tsx WithRowPicture` lays the pane out (text `1 1 380px`,
  picture `0 1 420px`, wraps then scales). Main serves it as a data URL through `IPC.shotPictureData` only where
  `pictureIn` passes for `pictureDirs()` (root, npc, item, spell), cached by path and mtime; the renderer reads no path.

## Page notices

- `src/shared/pageNotices.ts` reads `{{DNE}}` and `{{delete[|reason]}}` (comments and nowiki skipped) into
  `notices: ["DNE" | "delete" | "delete: <reason>"]`. Written by `mobPage.ts`, scrape-items and the delta's `deltaItems` (an edit that
  removes the notice drops the field). Spells need none.
- Notices domain (Gaps), engine-filed: `gaps_notices.rs` (child of `gaps.rs`); `GapIndex.item_notices`
  / `mob_notices` from `gap_index.rs`, the mobs off the corpus's `MobIndex` (never `MOBS_JSON` directly:
  the fold crate embeds that text once). Row key `<item|mob>:<page lowercased>`; serves
  `page`, `notices`, `subject`. Renderer: `gapNotices.ts noticeAction`, `wikiPage.ts noticeProof` (Copy
  proof), `gapJob` treats `notice` as an update; `GapRowButtons.editorOf` opens the page's editor.
- The forage test checks its four totals by name, so a new domain does not break it.

- Existing page (Gaps): the lookups (`wikiTemplates.ts`) save `notItemPage` / `notMobPage`;
  `gapExistingPage.lookupVerdict` gives `otherPage:<title>` or `freeText:<title>`, a search hit under another name
  is unchecked; `pageCheckAction(row, verdict)` says Fix page; `GapRowButtons.editorOf` edits that page.
- Link titles: `mobPageTitle.mobPageFinder` (name, page, redirect names to the page title; none when several answer)
  feeds `withPageTitles` for item `|dropsfrom` and `|soldby` via `PAGE_EXTRAS.mobPage`.
- Unlogged items: `shared/gapExtraItems.ts` (held from the export, captured from a 📷 of an unknown item, kept in
  `eq.gaps.capturedItems`); main `gapUnknownItems.ts` restates the engine's item check, keep it in step with `gaps_keys.rs`.

## Wiki redirects

- A redirect is a fact about the wiki, not about mobs: it applies to every catalog (owner, 2026-10-22,
  after the 2026-10-18 ask was built for mobs only). The cached list
  (`scripts/sources/cache/redirects/redirects.json`) becomes the `otherNames` of the record whose page
  it lands on: mobs.json, items.json (every key of the page), spells.json; and every redirect to an
  item page is a dropGroups.json alias. Target matched case-insensitively; a name with a record of its
  own is never another's.
- Writers (`scripts/sources/mobRedirects.ts`): scrape-mob-redirects (`--offline` re-applies the cache to
  all four files), scrape-mobs, scrape-items, scrape-spells and scrape-drop-groups apply the cache on
  write; the delta folds the cache first, then applies it to items, spells and the
  drop aliases (written only when a name changed).
- Readers, each filling only FREE keys: engine `knowledge::gap_index` (Gaps item check, near-miss
  candidates, event-feed offers), `knowledge::Corpus::item_db_key` (item answers), `gaps_keys::spell_keys`
  (Gaps spell check, its own light parse of spells.json); app `itemsDb.buildItemDbIndex` (itemLookup,
  character sheet), `itemOtherNames.itemsByAnyName` (gapItemMobs, gapItemForage, mobDropEra,
  wornFocusIndex); `gapDrops.filedAs` reads a looted name through the aliases; `shotIpc` catalog names.
- Safeguard (Gaps): `GapIndex.item_redirects` / `mob_redirects` (spells from spells.json otherNames) kept apart
  from own keys; `ItemIndex::with_redirects`, `MobNames::with_redirects`, `spell_via_redirect` name the target only
  when the name has no record of its own and the redirect is more than a respelling (`gaps_keys::same_name`).
  `gaps_redirects.rs` files it with `viaRedirect`; `gapRedirects.ts`; uncertain, an update, nothing needed. `known()`
  still counts redirects (event feed and the rest unchanged). A wrong redirect is fixed on the wiki; the next delta
  drops it from the cache (Halfling Blood, 2026-10-22).
- Not read: walks over every item (planner indexes, zone ports, clickies) keep the file's own map, so no
  page is visited twice; Spells search leaves the redirect shorthand (`DT`, `Dmf`) out.

## Buff durations (fork issue #4)

- Every bar's length goes through one engine function, `SpellStats::estimate_for`
  (`buffs_stats.rs`). The automatic rule is the DB floor raised to the max of the last five
  cycles, so one long outlier sets the bar. A player's choice answers first (`buffs_overrides.rs`).
- Choices: `log` = median of the last five clean cycles, no DB floor (falls back to automatic with
  none); `fixed` = typed ms, 1 s to 3 h. Keyed by spell line, every caster. Sources `logMedian`
  and `manual`; the chip reads `log` and `set`.
- Stored in `buffTrust.durations` and sent inside `buffTrust.define`; the protocol schema
  types it (`BuffDurationOverride`), so a field added there needs `npm run gen:protocol`.
- Saves go through `buffTrust:setDuration`, merged on main. `buffTrust:set` (the Preferences card)
  keeps the stored durations, because each surface holds its own copy and would wipe the other's.
- A change re-announces the buffs module, so the table and buff bars move at once. A crowd-control
  hold already running takes a saved choice at once (`Registry::define` calls `after_define`; `buff_timers.rs restat_holds`).

## Open items with no feature area yet

- The Recommended tab ignores layer-3 era derivations on purpose (`progressionPlan.ts`
  `eraLegal`).
- Spell page ladder base carries no magnitudes.
- Unparsed combat lines (owner ruling 2026-10-25: a line counts only if damage passed between us and
  them): the INVULNERABLE misses (8) and outgoing damage-shield absorbs (219 + 314 third-party) stay
  uncounted by that rule. `You were hit by non-melee` is counted (catch_all 71). `You have taken N
  damage from <Spell> by <mob>.` was already counted by fix-self-dot-ticks (catch_all 74 carries its
  parse and adds the charm fix); open, owner to decide: the 173 damage of ticks with no fight open,
  and the same charm problem for DoT ticks on group members (69,424 of Kamas's pet damage over 21
  fights; extending the exception would keep a broken-charm pet credited until its next swing). Later, maybe: the line after an environment hit names its cause (`YOU are burning!`
  26, `YOU were injured by falling.` 11, `YOU were crushed.` 1).
- Performance quick wins: done 2026-10-26 on the trunk: `heal-fight`/`heal-overall` in
  `CHARACTER_AWARE_OVERLAYS` (edited without the owner's explicit answer, under the trunk model's
  "move faster"; tell the owner), the kill-faction samples out of the gaps snapshot, the map timer
  pins' clock gate. Left: a `gearOwnership` cache (would change the visible per-window "read at"
  time; owner asked).
- Rust ProcBuff duration floor 0 vs measured growth (a deliberate floor in the original code;
  owner to decide).
- `tests/e2e/sky-inventory-autoload.e2e.mts` was red on `main_community` independent of any
  branch (2026-09-25, geometry "counts top was 280, now 336"); unknown on plain main.
- Buff tracker, by design (tell testers): two same-named mobs debuffed in different seconds merge
  into one row; a 30-minute quiet with no login line wipes every row; zone lines clear all
  debuffs.
- Group-inviter roster: after "You have joined the group", the inviter is not credited until a
  group-chat line (owner: leave for now).

## Zone history (was zone-history)

- Needs the Maps and coin-and-deaths code.
- `zoneHistory.ts` rates are per ACTIVE hour; the Leveling table's new columns follow its rate
  basis like its other rates, and every rate sort orders by the active-hour value.
- `tests/e2e/maps.e2e.mts` "the map row never moves or resizes" fails with or without Zone
  history's Maps change (measured 2026-10-13): a red of the Maps code, not of the new tab.

## Sky quest overlay (was sky-quest-overlay)

- Data path: AppCelebrations' `SkyOverlayFeed` (mounted only while the overlay is open, since
  2026-10-29: its counts read the whole loot ledger) -> `useProgress` -> `useSkyOverlayFeed` -> localStorage
  `eq.skyOverlay.rows` (written only on change) -> the overlay's `storage` listener. No IPC. The
  key is the main window's data, defined in `src/shared/`, so `tests/mapPinsReset.test.mts` (which
  scans keys defined in `overlay/`) does not see it and an overlay reset must not clear it.
- "Favorites" here means quest stars (`eq.questFavorites`). The Quests tab's "Favorites only" also
  shows quests that merely need a starred ITEM; the overlay does not list those (2026-10-16
  reading of the ask, not an owner ruling yet).
- Item icons: the feed asks `items:marks` (committed DB only) and puts `iconId` in the payload. Never
  `lookupItem` from the overlay for icons: a full record per item is a round trip the marks batch
  saves (it no longer reaches the wiki since 2026-10-26, wiki-traffic.md).
- "Count items from" is a per-window store (`useCountSource.ts`); a new `useProgress` reader
  follows the tab's pick with nothing extra.
- Its overlay kind sits beside `mapPins` in every overlay-kind list (Map waypoints, "A new overlay
  kind touches").
- e2e: `tests/e2e/sky-quest-overlay.e2e.mts` (window opens, a searched quest starred by the Quests
  tab checkbox reaches the overlay, the second click unstars). Open: the Ready tab checkbox has no e2e.

## Test hygiene: counts over the wiki data (test-hygiene)

- A count over the committed wiki data (items, mobs, spells, quests, posky, classes, the caches) is
  never an equality (owner, 2026-10-29). Use `assertCorpusFloor(actual, measured, what)` from
  `tests/corpusFloor.mts` (at least 90% of the measured count), a property (set equality, every
  record has X, A <= B), or a band when the number is an excluded population (dead-lands 1..50).
  Rust: `got >= measured * 9 / 10` (`spell_facts.rs`).
- Not counts, and kept: token censuses (an unknown slot, class or stat token must go into the
  hand table), named-record pins (Odium is Unstated), oracle lists compared name for name with
  hand research (the charm roster), and counts of fixtures or of a parser over a fixed input.
- Floors written at or near the day's count (under 5% or 3 below it: `poskyDroppers`,
  `planRolePolicy`, `classUnlocks`, `gearIndex` and 12 more files) are `assertCorpusFloor` on the
  2026-10-29 count, measured by a probe run. Older floors with 5-10% headroom (gearIndex pages
  11000 of 11674, respawnWiki 500 of 552) were left; a new floor uses the helper, never a hand number
  at the day's count. Rust corpus floors (`loot_from.rs`: items > 10,000, mobs > 5,000) have room.

## Test hygiene: what e2e checks (owner ruling 2026-11-27)

- 2026-11-27, owner: "we shouldn't be regression testing functions that produce values". E2E
  proves wiring; values are unit-tested over the function (WORKFLOW.md, Gate, "What belongs in
  e2e"). Every removal is listed by spec in the `e2e-trim` commit message with the unit test that
  pins it or the check it duplicated.
- First pass 2026-11-27 (`e2e-trim`), 10 specs: ok checks 1302 -> 1091 (gear 185 -> 134,
  combat-dashboard 256 -> 242, planner 130 -> 127, tradeskills-log 198 -> 136, tradeskills 74 -> 52,
  leveling 210 -> 193, sky-filters 70 -> 54, text-size 80 -> 65, voice-alerts 79 -> 72,
  mob-drops-era 20 -> 16). The 10 run together with the default runner (3 wide, BelowNormal, the
  owner using the PC): 336.9 s -> 256.0 s wall. Per-spec times under load are noise-dominated: the
  first three specs started carry a large start-up cost whichever they are (mob-drops-era took
  103.6 s in the first wave, 11.8 s alone). Alone (one at a time) after the trim: gear 43.3 s,
  combat-dashboard 39.6, tradeskills-log 35.8, leveling 30.2, tradeskills 18.8, planner 12.8,
  mob-drops-era 11.8, text-size 10.2. Full default run after the trim (the game and the dev app
  open): 73 specs, 728.6 s wall against the morning's 581.6 s, because its first wave ran 100 to
  140 s per spec for in- and out-of-scope specs alike (close-to-tray 98.5, alerts-search 98.7,
  bis-sheet 141.7); in later waves combat-dashboard 51.8 (101.9 in the morning), planner 17.9
  (66.4), sky-filters 19.3 (34.5), voice-alerts 18.4 (28.4). Red: sky-recent-sort (known); flaky
  under load: engine-boots (known), sky-cleanup (out of scope, passed alone in 9.4 s).
- Unit tests added for it: `tests/combatScopeOptions.test.mts` (the Fight/Overall selector rules,
  new file), one in `gearFilter.test.mts` (Owned or looted), one in `levelingWindowScope.test.mts`
  (a selection never counts more than its window).
- Kept on purpose: one "data reaches the surface" check per surface; one wiring check per control
  (a pick narrows the table); every geometry, remount, relaunch, IPC and pointer check. Sky filters
  keep two tab round trips, one per storage hook (`useStoredFlag` boxes, `useStoredNames` facets).
- combat-dashboard was red on `main_community` that day ("the You bar drills", "your pet sits on
  the line under you"): a row with avoided swings carries its "N% hit" badge inside the name span,
  so the spec's exact match on 'You' missed. Fixed in `petPrefSteps.mts` (each span's own text).
- Open (gear, found by the trim): with every Gear toolbar control shown, the Owned toggle ends about
  60 px past the content area at the 1280 px e2e window. The old spec hid the slot control before
  its width checks and so never saw it; the trimmed `gearColumnSteps` keeps that hide, with the
  measurement in a comment. Owner's call whether the toolbar should wrap.
- Open: `gearCompareSteps.mts` notes that the two-slot dedupe is pinned in
  `tests/gearCompare.test.mts`; no such file exists (only `gearCompareText.test.mts`).
- Candidates not taken (not value checks, owner's call): leveling's three screenshot steps
  (`stepChartShots`, `shootUnlockPanel`, `shootBestSpells`) assert nothing but resize and capture;
  tradeskills `stepOpenInPlace` waits in 700 ms steps.

## Sky rune count (fork #2, requirements/sky-rune-count.md)

- Count source `handins` ("Log only (loot minus hand-ins)"): `heldCounts.computeLogOnlyCounts` folds
  loot and the `turnins` rows' `given` in time order, floored at 0 per row; `reconcile` reads it only
  under `handins`. Opt-in; the default stays `both` (owner, 2026-10-29).
- `turnins` rows carry two lists: `items` is every offer (the old reading), `given` is what the
  trade took (stack counts from the offer line's `count`, cancel and refusal removed as
  `gaps_quest_log.rs` reads them). Sky quest crediting (`countTurnIns`) and the `handins` count read
  `given`; a row with no `given` (an archive segment captured before it) falls back to `items`, each
  once. A turn-in already persisted in `questTurnIns` from a refused offer stays until undone.
- Rotation: loot and trades come from the same log window (both merge across the app's archive), so
  `handins` never subtracts a turn-in whose loot it cannot see; it does lose items looted before a log
  the archive does not show. `log`/`both` subtract the persisted `questTurnIns`, which outlive the log.
- TRAP: with `CARGO_TARGET_DIR` shared across worktrees, `cargo test` ran a stale eqlog build (asserted
  the old output). `touch` the changed source to force the rebuild.

## Always-mounted readers and the `met` module (was perf-leftovers)

- Law: nothing mounted on every tab watches `loot`, `kills`, `consider` or `progression`. Each
  watched module is re-fetched on every cursor move in every window (`moduleStore.ts`); those four
  move on nearly every kill or second of play. Serve a small fact from the engine instead.
- `met` (`fold/src/modules/met.rs`, `shared/metNames.ts`): names met (raw spellings, sorted; the app
  keys them) plus `bosses`, the kills map cut to the `bosses.json` roster by `bossStatus.ts
  matchKey`. Kills reach it through a shared `MetSlot` the kills module fills (`KillsModule::sharing`),
  so `met` must stay registered after `kills`. The engine reads the roster at compile time
  (`resist::catalog::BOSSES_JSON`): a roster edit needs an engine rebuild.
- `met.bosses` is live-log only; the archive merge (`logArchive/mergeMet.ts`) joins names and leaves
  bosses to the live side. Fine for the celebration (it watches a credited count grow); the Raid
  Targets tab still reads `kills` for its archived counts. No segment captures `met`: `history.ts`
  rebuilds its names from each segment's `kills`/`loot`/`consider`/`progression`.
- The always-mounted Sky pieces are split: `useQuestTurnInWatch` (celebrate, persist turn-ins; no
  loot) always; `SkyOverlayFeed` (the loot-based counts) only while the Sky quest overlay is open.
- Measuring: `read_path_bench.rs` `met_cursor_moves` replays a log copy and counts cursor moves per
  kill window; `one_connection_in_order` times a small ask behind a fresh `loot` build. Results:
  audits/2026-10-20-performance-review.md, "Done 2026-10-29".

## Death recap and swing timer (was combat-wins)

- Death recap: `fold/src/combat/deathrecap.rs` keeps every landed hit on you and every heal on you
  (`You` or your own name) for the last 15 s of log time, whoever the meter credited the hit to (a
  fall, a tick from a mob the fight forgot), and freezes them on `playerDeath`. A recap is stamped
  with the FRESH encounter at the death (`fresh_encounter_id`) and the zone stay `zone_seq + 1`;
  a stay that `finalize_zone_session` drops (no damage) does not take a number, so its deaths would
  read as the next stay's. 40 deaths kept.
- It reaches the renderer as `deaths` on the SELECTED segment only, absent when the selection has
  none (`mod.rs with_deaths`). Grouping is `src/shared/deathRecap.ts`, names case-insensitive (the
  log prints `A tree snake bites YOU` and `a tree snake hit you ... by Weak Poison`). Incoming
  melee files under the skill `Melee` (a bite and a maul both); `Bash`, `Kick` and spells keep
  their names.
- Shown as the Incoming card's third tab, Death recap, offered only on a segment with a death; the
  segment header says `died` (Combat tab). A death with no fight open (DoT after the fight closed)
  shows only on the zone stay's Overall.
- Swing timer: `fold/src/combat/swing.rs` keeps the whole seconds you swung a weapon (landed or
  `You try to ...`), 32 of them, served as top-level `swingRounds`. Weapon = the parser's
  `melee_skill(verb)` is `Melee` or `Cleave`, not `reave`, and no riposte/flurry/rampage modifier;
  kick, bash, backstab, strike, frenzy, shoot are out. The special-attack lane (`specials`) is not
  consulted: a monk's `punch` could be either.
- The cadence is measured, never a delay formula (`src/shared/swingTimer.ts`): the mean of the last
  16 gaps under 8 s within a second of their median. Stamps are whole seconds, so no single gap is
  the delay; the mean of a run is (span / count). Measured 2026-10-29: an SK two-hander's gaps run
  2/3/4 s and read 2.875 s; a monk's (Drywrought) are mostly 1 s, where the bar is noise. Main and
  off hand share a verb, so dual wield reads both hands' combined cadence.
- The `swing` overlay kind is NOT in `METER_KINDS`: it opens 220x96 bottom-left (`swingBounds`).
  A thirteenth meter slot shrank every meter's first-open size at 1080p and overlapped two slots on
  a 1366x728 laptop (`tests/overlayLayout.test.mts`). It is in `METER_OVERLAYS` (4 Hz ping) and
  `CHARACTER_AWARE_OVERLAYS`.
- Fixtures: `tests/fixtures/death-recap.log` and `swing-timer.log` (a real SK's log, chat removed)
  are folded by `fold/tests/death_recap.rs` and `swing_rounds.rs`, which pin the engine's output to
  `death-recap.json` and `swing-rounds.json`; the TS tests read those JSON files, so both ends
  check the same data. A deliberate engine change regenerates the JSON from the Rust test's
  failure output.

## Overlay polish and friends online (competitor-quick-wins)

- Recover hotkey: `main/overlayRecover.ts` is the ONE `globalShortcut` in the app (owner's 2026-10-21
  "avoid C" stands for the capture; `tests/overlayHotkey.test.mts` pins the sole user, the capture
  sweep in `shotCapture.test.mts` skips that file). Off until set; store key `overlayRecoverHotkey`.
  It re-fits the STORED rectangle (`reconcileOverlayDisplays`): an overlay on a monitor Windows
  still lists (switched off, not unplugged) is on a display and is not moved; the per-row reset is.
- Overlay font: `eq.overlayFont` in shared localStorage (main-window data, so a reset keeps it).
  Panels use `OVERLAY_FONT` (a CSS var with the old Inter stack as fallback); a new overlay panel
  must too (`tests/overlayFont.test.mts` fails on a fixed `Inter, "Segoe UI"` stack under
  `overlay/`). No pick = no var and no body font, so the con card keeps its measured default face.
- Friends online: `/who` lines reach main only as LIVE fires of an app-owned raw alert
  (`whoWatch.ts` via `ownFires.ts`, which now takes several owners by name); a replayed log
  never fills it. Each taken fire logs one `data-server fire ... taken by the app` line, so a
  `/who all` in a city writes hundreds of dev.log lines. Last listing and the list live in
  `eq.who.last` / `eq.friends` (main window localStorage).

## Damage meters: whose scope, and what a row's DPS divides by (2026-11-17)

Asks: `requirements/meter-scope.md`, `requirements/meter-dps-clock.md`.

- **Two scope keys.** `eq.combat.meterScope` is the preference (Preferences > Combat): the
  overlays and the Overview card read it alone. `eq.combat.tabScope` is the Combat tab's own pick,
  written by the tab's three-button switch (`ScopeStatus.tsx`); absent, the tab follows the
  preference. A pick in Preferences removes the tab's key, so Preferences still sets every meter.
  Never make a Combat tab control write the preference: the overlays follow it (owner: a tab pick
  is "only for the combat tab, not the overlay").
- **A row's `dps` is over its own clock** (`OwnClock`, `engine/crates/fold/src/combat/ownclock.rs`):
  first swing to last swing (hits, misses, resists) inside each fight, at least 1 s per fight,
  summed over the fights a segment holds. Every row door stamps it through `Agg::at(ts, fight)`,
  which `routing.rs both()` sets; a new door that writes a row without `both()` leaves the clock
  unstamped and that row falls back to the segment's length. `SourceView.ownSec` carries the
  seconds.
- Two seams were split out of the engine's combat files to make room, not squeezed (owner,
  2026-11-17: "don't shrink files arbitrarily, can we break the code out into other files"):
  the proc ledger (`procledger.rs`, was in `aggregate.rs`) and the live meter's typed row door
  (`liverows.rs`, was in `views.rs`). A file at its size ceiling gets a split along a real seam.
- **Rows do not sum to the fight's rate, on purpose.** `SegmentSummary.dps`, `SegmentView.outDps`
  and the overlay's `all` crumb are still whole damage over the fight's length. Group and Everyone
  headlines are still their share of that. The You headline is over `SegmentView.selfSec` (you and
  your pets taken together, `meterScope.scopeRate`); a drilled row's headline is that row's own
  rate (`petRows.panelRate`). The Combat tab header prints the time as total / rate
  (`SegmentHeader` `clockSec`), so the three figures always agree.
- A combined bar (pet inside your bar, the grouped total box) still ADDS the rows' rates; with own
  clocks that is a sum of two rates over two spans, not one total over one span.
- The healing meters (`hps`) still divide by the segment's length: not asked for.
- Measured on the owner's log (2026-11-17 21:46:45, Cleric of Innoruuk): a group-mate's bow shot
  opened the fight 3 s before the owner's first hit; 7,247 damage was 426 DPS over the 17 s fight
  and is 518 over his own 14 s. A group-mate who shot and missed to the end keeps the full 17 s:
  a miss is a swing.

## Respawn timers: agreeing kills lower the wiki floor (fork #8, requirements/respawn-first-sight.md)

- Agreeing kills lower the wiki floor (fork #8, 2026-11-19; beside the 2026-11-07 and 2026-11-09
  respawn bullets). `respawn_learned.rs agreed`: the mob's learned gaps of `floor` or more, pooled
  across the zone's places as `pooled` pools, sorted; the lowest gap with `AGREE_LEAST` (3) gaps
  inside `AGREE_WITHIN_MS` (50 s) above it, or None when there is no such window or it is under
  `AGREE_SUSPECT_UNDER_MS` (2 min, two spawns sharing a name). `respawn_wiki.rs floor_of(wiki,
  agreed)` is the floor handed to `resolve_respawn`: the wiki time, lowered to the agreed gap when
  that is shorter. It never raises a floor and makes none where the wiki states no time. A typed
  number is still never floored.
- The rule is the Gaps tab's within25 rule (`respawnLearn.ts constantRespawn`, `lowest(sorted,
  50_000, 3)`), so the timer and the "Fix respawn" suggestion agree. Trap: the Rust side tests the
  window's LOWEST gap against two minutes where constantRespawn tests the cluster's peak; the Rust
  side is stricter at that boundary on purpose. Do not align them.
- Trap: only the lowest agreeing window is looked at. If it is under two minutes the answer is None,
  not the next cluster up (as constantRespawn does). A shared-name watch passes
  `SHARED_NAME_FLOOR_MS` as `floor`, so its short gaps are left out before the window is looked for.
- The row carries `agreedMs` (absent when the gaps do not agree, present even with no wiki time);
  `wikiMs` stays the page's own number. No protocol schema change and RESPAWN_SHAPE_VERSION stays 4:
  `mergeRespawn` refuses archives of another version and the field is optional.
- Two ladders, one rule: `shared/respawn.ts resolveRespawn` mirrors the engine (floor = min(wikiMs,
  agreedMs ?? wikiMs)) because `mergeRespawn.ts withEstimate` re-numbers archive-joined rows in
  TypeScript. `joinRow` keeps the smaller of the two sides' `agreedMs`; it does not re-test
  agreement over the joined gaps. `tests/respawnAgreed.test.mts` and `respawn_places_tests.rs` hold
  the same ladder cases.
- `respawnFloored` is true only when the wiki time is the floor in force (no `agreedMs` under
  `wikiMs`); the label and the hover both key off it and off `agreedUnderWiki`.
- An archive segment captured before this build has no `agreedMs`: an archived-only row keeps the
  wiki floor until the mob is killed again or the segment is re-captured.

## Respawn pre-alert (fork #7, requirements/respawn-alert.md)

- Law: the Timers tab decides only WHEN (one setting, store key `respawnAlert`, off / 20 s /
  5..300); how it sounds is the seeded Alerts-tab alert `respawn-soon` on app signal `respawnSoon`
  (`main/alertRespawnSeed.ts`, stamp `alertRespawnSeed`: a deleted alert stays deleted). Never speak
  or show a banner from the feature.
- Which clocks: `shared/respawnAlert.ts respawnAlertsDue` reads `respawnTierView(snap, now,
  'here')`, so it alerts for exactly what the Respawn overlay lists in the zone you stand in (other
  tiers and your instance included, crawls and other zones never). Skipped: seen up, no estimate,
  already due, respawn <= lead. First look (`prevMs` null) is a baseline.
- Trap, cooldown: `fireAppSignal` defaults to a 2 s per-alert cooldown. The seed sets `cooldownMs:
  0` so two mobs due together are both heard; dedupe is the watcher's fired set keyed
  `row.id@baseTs` (a re-based clock is a new key, a moved estimate is not).
- Trap, tokens: a capture is cut at 48 characters (`MAX_CAPTURE_CHARS`) and an empty or missing
  token is spoken literally. So the sentence is `{mob} {when}`, never one whole-sentence token, and
  every `respawnSoon` token always carries text. Tokens: mob, seconds, place, zone, when.
- Trap, clock: the watcher (`features/timers/RespawnAlertWatcher.tsx`, mounted in AppCelebrations)
  counts on `respawnAlert:tick` from `main/respawnAlertTick.ts`, a 1 s main-process interval that
  runs only while the setting is on. Do not move it to a renderer interval: the main window sets no
  `backgroundThrottling` and is usually minimized during play (reasoned, not measured).
- The reader subscribes to the `respawn` module only while the setting is on (the BazaarWatcher
  rule).
- A per-mob flag on the watch needs a Rust change: the engine keeps only key, display, customSec and
  sharedName on a watch and publishes its own copy.
- Open: the Alerts tab's Test button on this alert has no captures, as with the Bazaar seed.

## Reading log: the log-read report (fork #9, requirements/fix-combat-reading-log.md)

- The engine answers `session.attach` accepted before it opens the file. When the read dies
  (unopenable file, read error, panic) it prints one stderr line and reports `idle`. `idle` after an
  accepted attach always means the read ended; `foldWait.ts` ends the wait on it and calls
  `failed('ended')`. `starting`, `attaching` and `folding` never end the wait (owner ruling: a
  folding engine is never given up on). tests/dataServerFoldWait.test.mts pins both.
- On `ended`, `engineClientHost.ts` sets `attachedTo = null`, so the next world rebuild of the same
  log attaches again. Nothing retries by itself (owner default 2026-11-19). A rebuild therefore
  re-reads the whole log, and a panic repeats.
- All data-server narration is `logInfo`, console only. The only copy a packaged build keeps is
  `main/dataServer/logReadState.ts` (module state, no Electron import): the last error with its
  step, the last health answer, when the offset last grew, the last combat read, and the engine's
  newest stderr lines.
- State lifetimes: a new launch (`noteLogReadConnection`) clears everything except the stderr lines.
  A new turn (`noteLogReadTurn`, called from `bumpGen`) clears health, movedAt, the reply sizes
  (`tooLarge`, `large`) and every error except a connect error, because the connection is per
  launch, not per turn. A `live` health answer clears the error. A connect error is NOT cleared by a
  successful reconnect; the report hides it while the connection is ready. `lastCombatRead` is not
  cleared by a new turn (open: a panel that shows the box without polling the meter can read the
  last turn's verdict).
- Guards on the notes: the connect error uses the connection guard (`live?.client === client`), the
  attach error the turn guard (`gen === mine`). Using `gen` for the connect error would drop it on
  every world rebuild.
- The report crosses IPC as `LogReadReport` (channel `engine:logReadReport`). It carries the log's
  base name only. Every string from outside (error detail, stderr lines, fault detail) goes through
  `scrubPaths` in `shared/logReadReport.ts`: log path to base name, home directory and any
  `<drive>:\Users\<name>` or `/Users/<name>` to `~`, em and en dashes to ` - `. A new field that
  carries outside text must go through it too.
- The decision order in `composeLogReadReport` is the design. It changed in phases R1 and R2: the
  order now in force is in the R2 section below.
- Main looks at the log file itself only on the failure path, through `main/logProbe.ts` (the R2
  section below). It is a diagnostic; the engine still owns log-file facts everywhere else (ruling
  21).
- The status is PUSHED since phase R2 (it was polled: 5 s after a hydrating panel mounted, then
  every 3 s). The box is in `HydratingPanel` (CombatView) and `OverviewHydrating`; the band is on
  every tab; overlays have the status in their bridge and draw nothing from it yet (R3).
- "Engine said" lines come only from the error's snapshot (the 4 newest stderr lines when the error
  was recorded). A slow or stalled read with no recorded error shows none.
- Fixed since: main's one connection to the engine was never retried and the `gen` guard in
  `openConnection` could discard a good connection during a world rebuild (R1); the old failure
  card's "It last said" was not scrubbed (R2: `scrubFault` in `engineHost.ts onFault`). Still open,
  each with its phase in `plans/2026-11-19-reading-log-robustness.md`: a refused attach is never
  retried and nothing retries a read by itself (R4); an engine that dies after serving is relaunched
  for ever with no card (R5).
- e2e: a run with no engine binary, or one that holds a fold or a hydrating panel past 5 s with a
  failure (15 s without), now finds `data-testid="log-read-report"` inside `combat-hydrating` /
  `overview-hydrating`.

## Reading log: the connection and reply sizes (phase R1, plans/2026-11-19-reading-log-robustness.md)

- Size never ends a connection. `ndjson.ts`: `MAX_LINE_CHARS` 8 MiB is only the decoder default
  (the child's stdout and stderr, still throws). Engine transports use `MAX_MESSAGE_CHARS` 64 MiB
  with a watch: an over-limit message is dropped to its delimiter and reported through
  `Transport.onOversize({ id, size, refused })`. `LARGE_MESSAGE_CHARS` 16 MiB is reported with
  `refused` false BEFORE the message is delivered. A line is kept as its chunks and joined once.
- `messageIdOf` reads the id off the first 256 characters and depends on the engine writing `id`
  before any nested value (reply `{"id":N,...`, reset `{"epoch":E,"id":N,...`). If that order
  changed, a refused reply would end on its 15 s deadline instead (R7 pins the order in Rust).
- `client.ts`: a refused reply rejects ONE request with `EngineError('internal', ..., cause
  TransportError frameTooLarge)`; test with `ops.ts isTooLarge`. `isLinkLost` = code `unavailable`
  and no `requestId` (the client speaking, never the engine). A refused frame for a subscription
  sets its error AND drops its window (rows null), so later diffs are dropped until the next reset;
  keeping the old rows let the next diff clear the error over a window that missed a frame.
- Every listener the client calls goes through `listeners.ts callEach`. Protocol code is NOT
  wrapped: a throw in `receive()` still fails the connection.
- The windows and the epoch law's functions live in `clientStreams.ts` (a file-size split). Nothing
  in it may sort, filter or derive (pinned in tests/dataServerClientFaults.test.mts).
- One client per engine launch; its CONNECTION is reopened under it. `linkKeeper.ts` is the policy
  (0.5/1/2/5/15 s, 5 retries in a row, 60 s held clears the count, 20 per launch,
  `protocolMismatch` and `unauthorized` never retried, `tryNow` always gets one attempt).
  `engineLink.ts` joins it to the client. A "try" is a retry: the first connect of a launch is 0.
- Guards: everything about the connection uses `live?.client === client`. Never `gen`: it advances
  on every world rebuild.
- Listeners are registered ONCE per client in `engineClientWiring.ts`. Registering one per connect
  would now mean once per reconnect per frame.
- A reconnect takes a new turn (`bumpGen`) and keeps `attachedTo`: no second attach, no re-read. It
  rests on the engine keeping its world when a connection drops (`conn.rs`: a connection's end only
  calls `world.leave` for its own subscriptions).
- A clean hang-up is not reported by the transport. `engineLink.ts` hears it through `watchClose`
  and, one microtask later, fails the client with `EngineClient.fail()` (so the client stops saying
  `ready` over a closed socket and rejects what is in flight); the client's own reason wins when it
  has one. The `failed` state listener is the one place a loss is reported.
- `replySizes.ts`: `MAX_FORWARD_CHARS` 32 MiB is what main hands a window; 64 MiB is what main
  itself may read (the archive). A refused or unshowable key is `blocked` until `bumpGen`
  (`replySizes.reset`). A key of 16 MiB or more is sent at most once per 5 s. Keys are
  `<op> <stableKey(params)>`, the key `readShim` joins on.
- `readShim.ts` has TWO in-flight maps: `inFlight` shares one caller-wait's outcome, `wires` holds
  the real request until the client settles it. Do not merge them: that is what re-sent a timed-out
  read. A caller's wait = `timeoutFor(op) ?? timeoutMs`, plus any size hold. Readiness is asked
  again after a hold and after a reply (servable or not; it does not compare turns). `observe()`
  gets the `FallbackReason` as its 4th argument; `lastCombatRead.why` carries it.
- Report: `connecting` while the keeper has not given up (also with no keeper yet), `notConnected`
  only once it has (shows at once). `replyTooLarge` needs the METER's own read to have failed as
  `tooLarge` (`lastCombatRead.why`) and a too-large reply recorded in this turn; the archive asks
  `combat.snapshot` under the same op, so the op name alone is not evidence.
- Archive: the capture's reads REJECT on a failed read; only the engine's `notFound` means "none"
  (`captureReads.ts`, `engineCaptureReads(request)`, tested without Electron). Never catch-to-null
  there: that is what moved a log aside with a module missing. `secondEngine.ts` still skips a
  failed module in a refold; `refreshSegment` already refuses a refold that gave a module back
  missing.
- Not covered by R1: a connection whose hello is never answered (the client stays `connecting`, no
  loss is reported, requests end on their own 15 s deadline). A refused reset that is also the
  first frame of a newer epoch is dropped before `noteEpoch` sees it. 64 MiB and 32 MiB are
  reasoned, not measured (plan experiment 1); both are one-line constants.
- The renderer's own engine client (`lib/engineProvider.tsx`) gets the same 64 MiB limit and the
  same per-subscription error for a too-large reset; nothing in the renderer draws that error yet
  (R3).
- A module read is joined across `serve` and `serveShared` callers, so two projections can be
  handed the same reply object. A projection must never mutate the reply.

## Reading log: one status on every tab (phase R2, plans/2026-11-19-reading-log-robustness.md)

- ONE status. `composeLogReadReport` (`shared/logReadReport.ts`) decides; the words, the Try lines
  and the Try again actions are three Records over `LogReadWait` in `shared/logReadWords.ts`. A new
  wait does not compile until all three have a row.
- Decision order: engine missing, engine failing, no character, engine starting, connecting / not
  connected, attach error (code timeout = `notAnswering`, else `attachRefused`), read ended
  (`logHung`, `logMissing`, `logUnreadable`, `readerStopped`), health unanswered, `logHung`, still
  read (`finishing` / `stalled`), `opening`, `mismatch`, `reading`, then the meter's own read
  (`replyTooLarge`, `notAnswering`, ok). Eleven waits show at once; the rest after 15 s; ok and
  `noCharacter` never by themselves.
- PUSH, not poll. `main/logReadStatus.ts` composes on every poke and sends the report to the main
  window and every overlay when `statusChanged` (wait, show, tryLine, action, engine words,
  lastError, logFile, notes). Numbers alone (offset, pct, events, engineSaid, waitingSince): at most
  every 2 s and only while `show`. Never add a number to `statusChanged`.
- A fact that moves without a poke leaves every window stale, silently. Pokes: every note in
  `logReadState.ts`; `engineLaunchState.set()`; `client.onState` in `engineClientWiring.ts`; the
  link keeper's `changed` (retry scheduled, gave up, tryNow); `engineHost` `onPid` and `onFault`;
  `logProbe.onSettled`; the Try again handler. A new fact the report reads needs
  `noteLogReadTouched()` at its edge. `tests/logReadPokes.test.mts` pins these from source.
- The supervisor has no status callback: `starting` and `backoff` are seen by the 1 s tick
  (`shouldTick`, the `CLOCKED` set) or the 10 s net. A new wait that changes with the clock goes in
  `CLOCKED`.
- `poke()` composes one microtask later, on purpose: several notes land in one synchronous step and
  the middle states must not be pushed.
- `waitingSince` restarts only on another log, or on the first turn or launch after the read went
  live; not on a launch or a same-log rebuild (`noteLogReadTurn(at, logPath)` needs the path). It is
  the instant the SHOWN wait is timed from; the window counts with its own clock
  (`logReadLines(report, now)`). In the meter branch it is `lastCombatRead.since`.
- The meter's last read is cleared on a turn and at the live edge and counts only for
  `COMBAT_READ_FRESH_MS` = 30 s. It must stay above the idle meter poll (10 s, `combatPoll.ts`) or a
  standing failure blinks.
- Main never awaits the log file. `main/logProbe.ts`: one open in flight per path, two in all, an
  answer kept 5 s, `last()` synchronous. Looked at only when `worthALook`: the read ended, opening
  for 15 s, or no growth for 60 s. `pendingMs` of 15 s or more is `logHung`, except while the read
  is moving or live. While a read is ended the net re-opens the file about every 10 s. `onSettled`
  has ONE listener (the publisher).
- A fold error's stderr lines are read when the report is composed (the reason arrives after the
  idle answer). The ring is cleared on a new launch.
- Scrub, then cut: the supervisor hands `onEngineSaid` up to 2 KB; the report scrubs and cuts to
  200. The fault is scrubbed in `engineHost` `onFault` (`scrubFault`) before the card sees it.
  `Users\Public`, `Default` and `All Users` are not turned into `~`.
- `bannerFor` (`shared/engineLaunch.ts`) picks card / bar / band / notes / none. Card for any fault.
  Bar only for the wait `reading` or `finishing` with a readout. Never draw from `say.phase` again.
- `noteEngineReadEnded()` (phase `starting`, no fold) on `failed('ended')` and when the app has no
  character. Where the read stopped is `lastOffset` in `logReadState`, printed as "Stopped at".
- Try again carries no payload: main runs `LOG_READ_ACTION` of the wait it LAST PUSHED; a second
  press inside 2 s is ignored. reconnect = `EngineLink.reopen()` (fails a connection that is up,
  then `tryNow`). reattach = `reattachEngineLog()`: a new turn, `attachedTo = null`, the attach sent
  again, the whole log re-read; with no ready connection it reconnects instead. `replyTooLarge` has
  no button on purpose.
- A stopping or stopped supervisor is the app closing: never shown as a wait.
- Renderer: one store per window (`lib/logReadReportHud.ts`): subscribe, then one read; a read that
  lands after a push is dropped. The band is `LogReadBand.tsx` (`data-testid="log-read-band"`,
  `data-wait`): the sentence, the Try line, the button, and for `readerStopped` and `stalled` the
  box's own position row (`bandPosition`; `log-read-band-position`). The box keeps `log-read-report`
  and shows for any wait once its panel has been up 15 s.
- A Try line is printed by the band on every tab, where there is no box. It may not say "box" or
  name a row only the box has, and it may speak of where the read is only for a wait in
  `POSITION_IN_BAND` (`tests/logReadWords.test.mts` fails otherwise). Only a wait whose position
  stands still may be added there: the band is `role="status"` (atomic), so a moving number would be
  read out again at every push.
- Both preloads carry `onLogReadReport` and `logReadReport`; only the main window has
  `logReadTryAgain` (pinned).
- e2e: with a failure the box and the band are there at once (no 5 s). A wait of 15 s with no
  failure shows the band on every tab, above the content (`log-read-band`), which moves the content
  down while it shows. `engine-absent.e2e.mts` pins the card on a tab other than Overview and the
  Try row and button in Overview's box.

## Reading log: tabs, overlays and the no-logs screen follow the status (phase R3, plans/2026-11-19-reading-log-robustness.md)

- The meter's reads are PER QUESTION. LogReadFacts.combatReads (was lastCombatRead): newest outcome
  per key `<op> <stableKey(params)>`, 8 keys, 30 s each (COMBAT_READ_FRESH_MS), own `since` per key;
  cleared on a turn, a launch and the live edge. A key asked again after it lapsed starts a new run.
- Combat branch order (shared/logReadReport.ts combatCause, the ONE place): tooLarge ->
  replyTooLarge; timedOut, or refused with code timeout -> panelSlow; other refusal -> notAnswering;
  guess / readiness reason / nothing -> ok. Timed from the earliest `since` of the deciding keys.
  panelSlow has NO button and shows after 15 s. panelSlow and replyTooLarge are in CLOCKED.
- readShim `observe` takes ONE object (ObservedRead: op, key, ms, unserved?, why?, code?). Never put
  a duration into a status string: it changes per poll and statusChanged would push every second.
- Notes are composed in shared/logReadNotes.ts from facts of ONE read (large, tooLargeModules,
  nothingRecognised, archiveOn); logReadState forgetReadNotes() clears them on a turn and a launch.
  A note's text must not move while the read stands. LogReadNote.modules is compared by
  statusChanged. With the archive on: no getting-large note, no Try line on the too-large note.
- noteLogReadLanded(health.events, health.mark?.offset) is ONE line inside `if (first)` at the
  go-live edge; tests/logReadPokes.test.mts finds it in engineClientHost.ts or attachTurn.ts and
  fails if it is missing or doubled. Events 0 over 64 KiB = recognised nothing; unknown is not zero.
- A tab prints its own empty text only when its RAW snapshot is non-null. Use LogReadInline /
  useTabLine(module, served); never coalesce a null into "nothing yet". The line is held 1.5 s
  (inlineDue) unless report.show: remove the hold and every rebuild and tab mount flashes a
  sentence.
- Overlay labels: LOG_READ_SHORT, 22 characters at most (test-enforced). overlayTitle decides title
  and tail; 'Loading...' when hydrating with wait ok or no status. The JOS-158 pin allows a meter
  exactly one tail: `tail={head.tail}`.
- useOverlayModule: other log -> rows down at once; world-changed + null -> rows down; SAME log +
  null -> rows kept (an ordinary rebuild is 'not live' for an instant); an answer to an older ask is
  dropped. Source pin: the world-changed branch calls rehydrate().
- The dot (lib/useLiveDot.ts): a module cursor lights it, the world-changed frame does not, any
  non-ok wait turns it off and it then needs a new cursor. It no longer lights at go-live on a quiet
  log.
- showsNoLogs = no character AND empty list. The list and the folder config are re-read on window
  focus. EqFolderCheck is shared with Preferences (test id no-logs-check on the no-logs screen);
  folderVerdict is the one decision.
- Logs are listed by log/characterLogs.ts: FILES only, links followed with stat (kept unless they
  lead to a folder; kept when they cannot be followed). readLogsDir counts through it.
  Dirent.isFile() is false for a link: never filter on it alone.
- discovery.ts recheckDiscoveredRoot: a root good in this run is kept across a failed re-check; the
  sweep runs at most once per 60 s; the persisted root is not dropped on a failed re-check.
- The window's own engine connection: shared/dataServer/retryPlan.ts, 4/8/16/30 s, 5 tries, then
  nothing until the status's engine words change.
- Still open: Mobs, Maps, Gear and the rest rely on the band alone; the tray tooltip; the renderer
  client's per-subscription too-large error is drawn nowhere; gapsCharacters.ts still lists logs by
  name.
- After review: Overlay labels: add "The percentage is printed only when report.show is true
  (overlayLabel). Main sends numbers to a window only while the status shows, so before 15 s an
  overlay says a plain 'Reading log'. Never print a number from a report with show false: nothing
  keeps it current."
- After review: Replace the discovery line with: "discovery.ts recheckDiscoveredRoot: a root good in
  this run is kept across a failed re-check; while it is marked bad (sweptAt set) NEITHER its
  re-check NOR the sweep runs more than once per 60 s; the persisted root is not dropped. The kept
  root is the answer either way, so a drive that returns is in use at once and only the mark clears
  late. config.ts refreshEqDiscoveryCheaply asks keptRootIsGood(discovery, rootHasLogs), never
  rootHasLogs(discovery.root). Still true: every resolveEqDir()/listCharacters() reads the kept
  root's Logs folder on demand (describeLogsDir is not memoized), so a dead share is still read when
  something asks for the list; only the 5 s re-check and the 2 s rescan tick were floored."
- After review: Replace the engine-connection line with: "The window's own engine connection:
  shared/dataServer/retryPlan.ts, 4/8/16/30 s, 5 tries, then nothing until the status's engine words
  change. The count is cleared by the client's 'ready' (hello accepted), never by a connection
  merely handed over: retryAfter(held, 'taken' | 'ready' | 'failed') is the one place. 'taken' is
  said BEFORE next.attach(). A connection that reaches ready and then drops every time still retries
  at 4 s each time (the supervisor's own cap covers an engine that keeps dying)."
- After review: Add: "moduleStore: a null reply leaves the entry stale, so the next READER of that
  module asks again (a tab reopened). No timer, and nothing is asked without a new reader. On a
  launch with no engine this costs one more IPC per module each time a tab is opened."
- After review: Add to the tab-line note: "The hook's rule is lib/useTabLine.ts useTabLineOf(report,
  module, served); components/LogReadInline.tsx useTabLine only hands it the store's report.
  tests/tabLine.test.mts runs it on hookHost and pins the six views from source: a view must pass
  the RAW snapshot as served, and its empty text must appear once, inside the line."
- After review: Add to 'Still open': "A module that answered null after go-live (a 10 s timeout
  during the go-live burst) keeps its tab on 'The data engine is answering; this panel has no reply
  yet.' for a player who STAYS on the tab, until that module's next cursor. Reopening the tab now
  asks again. Making the tab ask by itself needs a force-refresh on the module store, which the
  owner ruling in useModule.ts (2026-08-26) says to raise first: this is that raise."
- After review: Add: "R6 should call useTabLineOf (lib/useTabLine.ts) when it needs the rule in a
  test; useTabLine in LogReadInline.tsx is the store-bound wrapper."
- After review: Add: "tests/moduleStore.test.mts is AT 440 code lines. A new module-store case goes
  in a sibling file."
- After review: Add: "Owner decision wanted: may the module store get a bounded re-ask of a null
  reply (one more try a few seconds later, or a refresh the tab line calls once)? Without it the 'no
  reply yet' sentence can outlive its 'yet' for a player who never leaves the tab."
- After review: Change the retry item for R5: "engineProvider's count now survives a taken
  connection; if R5 changes when the engine words move (engineCycling), check that onStatusWords
  still restarts a 'stopped' window."
- After review: where_the_other_branch_meets_mine: unchanged for R4's files. None of these fixes
  touches engineClientHost.ts, logReadState.ts, shared/logReadReport.ts, main/logReadReport.ts,
  logReadStatus.ts, foldWait.ts, supervisor.ts or session.ts. In src/shared/logReadWords.ts the only
  change is inside overlayLabel (the new section below line 95): one condition and its comment; no
  existing table was touched.
- After review: E2E STEP FOR THE COORDINATOR (not added; tests/e2e was not edited, and this text has
  not been run). File tests/e2e/engine-absent.e2e.mts, function stepStatusEverywhere, directly after
  the existing check 'the failure card is still up on a tab other than Overview' (the page is on the
  Loot tab there); add LOG_READ_WORDS to the file's import from shared/logReadWords beside
  LOG_READ_TRY:
- After review: const line = await settle(() => textOf(page, '[data-testid="log-read-inline"]'), (t)
  => t !== '')
- After review: check('the Loot tab says what the app is waiting on',
  line.includes(LOG_READ_WORDS.engineMissing), line || '(no line)')
- After review: const lootText = await page.locator('body').innerText()
- After review: check('...and does not say "No loot parsed yet" over a log nobody read',
  !lootText.includes('No loot parsed yet'), lootText.includes('No loot parsed yet') ? 'printed' :
  'absent')
- After review: Expected line text on that launch: 'The data engine program is missing. Check your
  antivirus quarantine, then reinstall.' (wait engineMissing shows at once, so the 1.5 s hold does
  not apply). The plan names 'the run that holds a fold' instead; no run under tests/e2e holds a
  fold today, and the engine-absent run already opens the Loot tab with no loot snapshot served, so
  it is the thin place for it.
- After review: No existing e2e check is made stale by these six commits: no test id, no sentence on
  a tab and no healthy-launch text changed. An overlay title during the first 15 s of a read is now
  'Reading log' with no number; no e2e spec was found asserting the number.

## Reading log: a failed probe does not end an engine the app just heard (phase R5 step 1, 2026-11-20)

- `supervisorHealth.ts` `forgiven()`: before `onUnhealthy`, a verdict made only of transient
  reasons is set aside when the app's own connection heard the engine inside
  `ENGINE_HEARD_FRESH_MS` (20 s), the stamp is newer than the one used last time, and the launch
  has answered once. Once the log is live, at most `ENGINE_FORGIVE_MAX_LIVE` (6) beats in a row;
  while it is being read, no cap. An answered probe resets the run.
- The stamp is `logReadState.ts` `noteEngineHeard` / `engineHeardAt`, written by the progress and
  module-changed listeners (`engineClientWiring.ts`) and by `noteLogReadHealth`; a new launch
  clears it (`noteLogReadConnection`). `engineHost.ts` passes `engineHeardAt` and `engineIsLive`
  as optional supervisor deps; without them the watch is the two-strike rule alone.
- Why: a probe opens a new connection each time; a starved engine took 4.8 to 4.9 s of the 5.0 s
  limit to answer one while answering the app's connection in milliseconds, and was ended four
  times in ten minutes mid-read (plan, "Measured").
- NOT built (owner, 2026-11-20: "lets no go wild, lets let the user respond"): the death cap, the
  restart count under the bar, the longer announce wait, the local-connection words. An engine
  that really dies on one log is still relaunched forever with no card.

## Reading log: the read starts again by itself, with caps (phase R4, plans/2026-11-19-reading-log-robustness.md)

- The 2026-11-19 default (nothing retries a read by itself) is replaced, on the default taken for
  owner question 2. Three automatic re-attaches, each a whole re-read, each capped in
  dataServer/readRetry.ts: file came back (5 per log per engine launch), one plain retry 2 s after a
  read ended with the file openable, one re-read after the reader stops after live (none while an
  earlier such end lies inside 30 minutes).
- Going live and a new launch clear autoTries, fileBackTries and ends. Nothing clears the after-live
  window but time and a Try again press. Never reset it on go-live: a reader that dies after every
  go-live would be re-read for ever.
- Nothing fires into a running read. Every read starts with bumpGen, bumpGen says the 'turn' edge,
  and the recovery drops whatever was armed. A new way to start a read must go through bumpGen.
- The host says the read's edges through dataServer/readEdges.ts (one listener): launch, turn, live,
  ended, endedAfterLive, manual. 'ended' is said AFTER the fold error is recorded, because the
  recovery may replace it with its stop line. main/logReadReport.ts startLogReadStatus binds the
  recovery; it must run before the engine starts.
- logProbe.onSettled still has ONE listener; it now tells the publisher, then the recovery.
- A Try line may promise a retry only while one will come. LogReadFacts.watchingFile
  (recovery.watching()) picks the line; TRY_NOT_WATCHING in shared/logReadReport.ts holds the two
  lines without the promise. Move them into logReadWords.ts once R3 is merged.
- attachTurn.ts is the turn. What the engine was told is recorded even on a stale turn. A health
  answer is this turn's only when its mark names the turn's TARGET (markAgrees: case and slash
  insensitive; a mark with no log cannot disagree). An answer about another log is never passed to
  sawHealth, so it can never be recorded as live. Caps per turn: 2 re-sends of an unanswered attach
  (2 s, 5 s), 1 re-attach on a difference.
- The mark's log is the string main sent in session.attach, echoed back. If main ever attaches with
  one spelling and compares with another, every launch would re-attach once and then stop on
  'mismatch'.
- Attach error codes decide the wait (ATTACH_WAITS): timeout is notAnswering, mismatch (main's own)
  is mismatch, anything else attachRefused.
- The archive half (liveHistory.engineAttaching()'s callback) is called for EVERY accepted attach,
  stale or not. The bar half (noteEngineFolding) only by the current turn, or a replaced turn when
  the app still wants that log.
- foldWait: unanswered is said once and the loop asks every 5 s for as long as the turn lasts; the
  slow asks write no line. An answered poll clears a 'health' error. The wait returns at once if
  saw() ended the turn.
- After live: supervisor onHealth hands on every probe answer; afterLive.ts confirms a not-live
  answer once on main's own connection, in the same turn, before readStoppedAfterLive runs. There is
  no poller on main's connection, on purpose.
- tailCharacter goes through sessionTail.ts storeThenSignal: a failed settings write is logged
  (main:attachCharacter) and the world-rebuilt signal is still sent.
- Traps: noteEngineFolding() resets the fold measurement, so never call it per poll. A reconnect's
  turn re-attaches an ended read; that is bounded by the link keeper, not by readRetry. servingLine
  lives in foldWait.ts now.
- Line budgets: engineClientHost.ts 411 of 440, supervisor.ts 399.
- After review: First bullet, replace the end with: "... one plain retry 2 s after a read ended with
  the file openable, one re-read after the reader stops after live (none while an earlier such end
  lies inside 30 minutes). THE RE-READ AFTER LIVE IS THE PLAIN RETRY (readRetry.ts plainRetrySent):
  if it ends before it goes live the log is not read a third time. Only going live, a new launch or
  a Try again press gives the retry back."
- After review: Second bullet, add: "`ends` counts the end after live too, so the stopped line says
  how often the read really stopped since it was last live."
- After review: New bullet: "A read's end is decided only on a look at the file taken AT OR AFTER
  THE END. logReadRecovery records endedAt; an answer the probe kept from before it reads as
  'pending' (readRetry.ts probeSeenSince) and the first answer after the end decides.
  logProbe.look(path, since) does not keep an answer taken before `since`, and
  logProbe.answeredAt(path) says when the last answer came in. One open in flight per path and two
  in all still hold; when the two-opens limit blocks the open, the old answer stays 'pending' and
  the 5 s watch asks again. Trap: never decide on logProbe.last() alone after an end; the watch's
  own 'it can be opened' is under 5 s old when the re-read it caused fails."
- After review: The logProbe.onSettled bullet is unchanged. LogReadRecoveryDeps now has look(path,
  since), last(path) and answeredAt(path); the pin in tests/logReadRecoveryPins.test.mts reads all
  three in src/main/logReadReport.ts.
- After review: Add to the test list: tests/logReadRecoveryProbe.test.mts drives the recovery on the
  real createLogProbe (hand-made open, clock and timer); use it for anything that depends on the
  probe's keep.
- After review: R6 item ("logReadRecovery's file watch runs only after a read ended ..."): add "A
  quiet-log check that looks at the file should pass `since` to logProbe.look when it needs an
  answer newer than some moment; a plain look may return an answer up to 5 s old."
- After review: R5 item about the 'launch' edge: still true; note also that 'launch' gives the plain
  retry back after an after-live re-read (wentLive), the after-live window is still kept.
- After review: "Anyone adding a LogReadFacts literal": unchanged. LogReadProbe (the shared type)
  was NOT changed; answeredAt is a separate method on the probe, so no R3 file is touched.
- After review: where_the_other_branch_meets_mine, correction: src/main/logReadReport.ts recovery
  binding now has `look: (path, since) => { logProbe.look(path, since) }` and one more line
  `answeredAt: (path) => logProbe.answeredAt(path),`; buildLogReadReport's own
  `logProbe.look(logPath)` is unchanged. Nothing changed in engineClientHost.ts, attachTurn.ts,
  logReadWords.ts, shared/logReadReport.ts or logReadState.ts, so the go-live edge and every line
  number reported for those files stand.
- After review: deviations, additions: (a) the stop line after an after-live end plus one more end
  reads 'stopped twice; not trying again by itself' (true count), and STOPPED_AFTER_LIVE_LINE is
  shown only when a second after-live end falls inside the window; (b) every end now costs one open
  of the log by main unless an open is already out or an answer came in the same millisecond, where
  before a look under 5 s old was reused; (c) logProbe.ts (an R2 file) gained an optional parameter
  and one method.
- After review: Line counts: src/main/logReadRecovery.ts and readRetry.ts stay far under the
  ceiling; engineClientHost.ts and supervisor.ts untouched (411 and 399).

## DPS chart: the pet drawn apart (upstream #91, requirements/meter-pet-split.md)

- The DPS-over-time chart (DpsOverTime.tsx, both the Combat tab card and the Overview glance card)
  follows the pet layout: 'separate' ("Its own bar") sets `petApart` on the card's DpsSeries;
  'nested' and 'grouped' do not. Same predicate as the Overview DpsCard (layout !== 'separate' means
  combined).
- ONE sum: `dpsAt.outRate(series, i)`. The gold line, its area, peakVis, yMax, the hover dot
  (dpsChart.outAt) and the hover's printed rate (dpsAt().out) all read it. Never spell you + pet +
  group again beside it. `dpsAt.outLabel(series)` is the one name for that line (legend and hover).
- `petApart` is set only by `withPetApart` in the card, never by buildDpsSeries: the SERIES WeakMap
  cache stays layout-free, and with the flag off the card gets the SAME cached object (no
  re-derive). The flagged copy shares the typed arrays.
- `series.peakOut` (whole-fight peak, built in buildDpsSeries) still includes the pet; the card
  quotes `chart.peakVis`, which follows the flag. Do not quote peakOut next to a petApart line.
- Under petApart the pet line can stand ABOVE the gold line and set yMax (it is no longer a
  component of `out`); the comment in buildDpsChart's scale loop predates this.
- The Combat timeline (CombatTimeline.tsx, TimelineHoverLayer.tsx) builds its own unflagged series
  and still prints 'you + pet' as the sum, on purpose. In a group the gold line under "Its own bar"
  is 'you + group', not you alone.
- No new storage key and no new line key: eq.combat.chartHidden still holds out/pet/group/inc,
  absent = nothing hidden.

## Sky Cleanup hand-set count (upstream #73, requirements/sky-cleanup-count.md)

- The Cleanup row's Held cell is `HandCountCell` (ItemOverrides.tsx), the same control the quest
  row's `ItemHaveCell` wraps: one editor, one chip, one store call (`useProgress.setItemOverride`).
  Change testids, the commit rule (blank commits nothing) or the hover there once; both rows follow.
- No count logic lives in the door. A stated 0 leaves Cleanup through `cleanup.ts`'s `quantity <= 0`
  rule; the statement is per item, so it also moves the Have count on every quest row naming the
  item.
- The pencil writes with `row.name`; `itemCountKey(row.name) === row.key` is what makes it land on
  the row. `CleanupRow` carries no override: `CleanupList` indexes
  `itemOverridesByKey(itemOverrides)` by `row.key`.
- A row zeroed by hand is gone, so its chip is gone. The trace is `OverrideSummaryChip` on the
  Cleanup control row; the take-back is the "By hand" chip on the quest row. Zeroed rows are not
  kept listed (default taken 2026-11-19).
- Tests: `tests/skyCleanupOverride.test.mts` is the only unit test over `cleanupRows` (the old
  `tests/skyCleanup.test.mts` was deleted in b6ff987bb). e2e: `sky-cleanup.e2e.mts` step 4b,
  reversible, so steps 5 and 6 keep their numbers.
- TRAP: `tests/skyTurnInAfterDump.test.mts:31` still names the deleted `tests/skyCleanup.test.mts`
  for Cleanup's half of the JOS-403 report; no unit test pins that case.

## Skills tab (fork #6, requirements/skills-tab.md)

- Engine module `skills` (`engine/crates/fold/src/modules/skills.rs`), wired after `leveling` in
  `WIRING_ORDER` and `registered`. State `{ rows: [{ skill, value, lastTs, sessionUps,
  sessionFirstTs? }] }`, one row per skill in the client's spelling, in first-raise order. No parser
  kind and no protocol change.
- Trap 1, repeat at cap: the game reprints the level it already stated (`Specialize Evocation! (50)`
  37 times in 7 minutes). A line is a raise only when its level differs from the stored one; a
  repeat changes nothing and does not announce. Lines are not points gained.
- Trap 2, a level can drop (Specialize Evocation 200 then 50; Forage 52 then 50). The level kept is
  the newest stated, never the maximum; a lower line replaces it and counts as one raise in the
  session column.
- A skill-up line with no `(n)` is ignored. A skill that never went up in the log has no row; the
  caption says so. Do not present the table as complete.
- Session = since the newest `offlineGap` (the app's Session, `timeslice.ts`): the gap zeroes
  `sessionUps` and drops `sessionFirstTs`, the level stays. An epoch clears the table.
- Per hour is `(sessionUps - 1)` over the span from the session's first to latest raise of that
  skill, stated only when `rateMeasurable(span)` (5 minutes, `rateBasis.ts`). It is not the Leveling
  slice bar: that would need one stored row per raise.
- Archives: `skills` is in `CAPTURED_MODULES` and `MERGE_RULES`
  (`shared/logArchive/mergeSkills.ts`). The newer row wins whole; an older-only skill is carried
  with `sessionUps` 0 and no `sessionFirstTs`, built from its four known fields, so a new `SkillRow`
  field must be added there. A session that spans an archive cut counts only the live log's raises.
  Adding the module made every sealed archive refold once.
- Sort and the tradeskill filter live in `src/shared/skills.ts` (`skillRows`, `isTradeskillRow` via
  `tradeskillOf`), not the renderer (eqc/no-domain-munging).
- `App.tsx` `PlainView` is at the complexity ceiling (13): the tab is mounted as `<SkillsTab view
  viewKey />`, whose view check is in `features/skills/SkillsView.tsx`. A new plain tab must do the
  same.
- View id `skills`. Nav row: Stats/Data, after Leveling.
- Per hour and This session cells are blank when there is nothing to state (no dash glyph:
  copyNoEmDash).

### Crafting module (fork #6; the Tradeskills workbench reads it, slice 3 below)

- Engine module `crafting`, wired after `skills`: `fold/src/modules/crafting.rs` (the module, item
  rows, pairing), `crafting_spans.rs`, `crafting_money.rs`, `crafting_tests.rs`. No parser kind and
  no protocol change: the failed combine, the trivial notice and the depot draw are read from
  `unknown` lines, as Wiki Gaps reads the first.
- State: `items` (per item: `made`, `failed`, `byProducts?`, `trivial`, `trivialTs?`, `raises`, `firstRaise?`,
  `lastRaise?`, `tradeskill?`, `firstTs`, `lastTs`, `sessionMade`, `sessionFailed`,
  `sessionRaises`), `levels` (per tradeskill: `value` and its log's first line), `spans`,
  `olderSpans?`, `bought`, `sold`, `depot`. Types and helpers: `src/shared/crafting.ts`.
- Shared with Wiki Gaps, one copy: `gaps_craft.rs` `failed_combine_of`, `alternate_product_of`,
  `is_tradeskill` and the `Combines` pairing (the module is `gaps::craft`, `pub(crate)`); `gaps_details.rs` `coin_of` and
  `price_of`. A change to any of them changes both features.
- Pairing: a tradeskill line and a combine pair when they share a log second, either order. The
  raise is counted on the item, the session and the span. A line restating the stored level is
  not a raise but still names the item's tradeskill. A skill that is no tradeskill never pairs.
- `tradeskill` is absent on an item no raise ever named (8 of the owner's 43). The TypeScript
  side fills it from recipe data: `itemTradeskill(row, recipe)`, folded through `tradeskillOf`.
- Not combines: the refused attempt (`Sorry, but you don't have everything ...`) and the
  by-product line (`... create an alternate product: Bottle.`), which rides on a failed combine
  already counted.
- By-products (2026-11-20): the line is counted as `byProducts` on the item of the newest combine
  when that combine is in its second or the one before; with no combine that near it is counted
  nowhere. The key is absent at 0, in the engine and after a join (`mergeCrafting.ts` adds the
  two sides). The by-product's own name is not kept. No session column.
- The trivial notice is held and claimed by the next combine within 1 s, made or failed; a
  later combine does not get it.
- Spans: a combine within 5 minutes of the last one extends the span, else opens one. The newest
  120 are kept; an older one is summed into `olderSpans` (count, length, counts, and per
  tradeskill the spans that held a raise of it). `SPAN_CAP` and `SPAN_GAP_MS` exist twice
  (`crafting_spans.rs`, `shared/crafting.ts`): change both.
- Pace (`craftingPace`) is per crafting hour: counts over the spans' summed length. With a
  tradeskill, only spans holding a raise of it count. A span of one combine has no length.
- Money is in copper, read off the raw line. `bought` keeps the newest line as `lastQty` and
  `lastCopper` (unit price = the second over the first, `unitCopper`), the merchant and the zone
  the player was in. `sold` counts lines: the sale line states no quantity. Both hold EVERY item
  bought or sold, not only tradeskill ones (the engine knows no recipe): 555 and 375 rows on the
  owner's archive, 136 KB of the 149 KB snapshot.
- `depot` is the newest `(leaving N)` of a `Consumed` line. A deposit or a withdrawal states no
  count, so the number is as old as the item's last draw.
- Session = since the newest `offlineGap`; an epoch clears every table (the zone is kept).
- Fishing and forage (2026-11-20, `crafting_gather.rs`, tests `crafting_gather_tests.rs`): the
  snapshot gains `fishing` (`casts`, `caught`, `nothing`, `lostBait`, `spilled`, `poleBroke`,
  `session` with the same six, `items`) and `forage` (`found`, `failed`, `session`, `items`);
  an item row is `item`, `count`, `lastTs`. Each key is absent until the log has a line of its
  kind, and from an engine or an archive older than this, so both are optional in `CraftingSnap`.
  - No parser kind and no protocol change: all eight shapes are `unknown` lines (a test holds the
    real parser to that). The two that name an item are read with Wiki Gaps' `caught_of` and
    `forage_of` (`gaps_players.rs`), one copy: a change there changes both features. A forage's
    leading `a `/`an ` is dropped, as on the Gaps row.
  - Line counts, no state machine. A cast and its outcome are counted apart, so a cast with no
    outcome (zoned, interrupted) is in `casts` and in nothing else. `fishingRate` is `caught`
    over `caught + nothing`.
  - `lostBait`, `spilled` and `poleBroke` are not outcomes: each prints beside a `You didn't
    catch anything.` of its second (32 of 32), so `nothing` holds those casts already. Adding
    them to a denominator counts a cast twice.
  - `You caught something...` is a catch the game does not name: in `caught`, in no item row.
    `unnamedCatches` is `caught` less the rows' sum.
  - The item rows are not capped: one row per distinct name, 5 fished and 15 to 26 foraged per
    log on the owner's three (MEASURED.md). The session has totals only, no per-item column.
  - A catch or a forage is never a combine or a purchase: the module counts a combine only on an
    `itemReceived` with `via` fashioned or a failed-combine line, a purchase only on `purchase`.
  - Archives (`mergeCrafting.ts joinGathered`): counts and item counts add, the session is the
    newer log's, an item's `lastTs` the later. A side without the key reads as zeros, which is
    also how `mergeModule`'s empty template (`fishing: {}`) passes.
  - A sealed archive keeps the state it was folded with and gains `fishing` and `forage` when
    refolded. Every version bump does that at launch (`refreshLackingHistories`; test.53 filled all
    three of the owner's), so only a dev build at an unchanged version still needs Refresh.
  - Not built: a screen; the zone a fish or a forage came from (Wiki Gaps keeps those for its own
    rows); pace per hour (the Skills tab states raises per hour for Fishing and Forage).
- Archives: `crafting` is in `CAPTURED_MODULES` and `MERGE_RULES` (`mergeCrafting.ts`). Counts
  add; session columns, last price, merchant, depot count and level are the newer log's; the
  first raise is the older log's. Spans are concatenated, bridged when an archive cut a run
  within the 5 minute gap, and capped by the engine's rule. A newer log's first tradeskill line
  that restates the older log's level is taken back off its item and span (`levels[].firstItem`).
- `combineCost` states a cost only when every ingredient was bought at least once; a crafted
  ingredient (Enchanted Gold Bar) is never bought, so its recipe must be costed first by the
  caller. It assumes a failed combine loses its materials.
- Fixed 2026-11-20: `alternate_product_of` reads `create an alternate product: `, the game's
  spelling (4 of 4 lines in the owner's archive). The spelling without `an` is not read: nothing
  ever printed it.

## Tradeskills section (fork #6, requirements/skills-tab.md, plans/2026-11-20-tradeskills-real-work.md)

Slice 1 (2026-11-20): the menu entry, Home and a workbench with the wiki recipe book. TypeScript
only: no engine, parser, protocol, network or dependency change.

- View id `tradeskills`, one view with two screens. Nav row: Research, after Maps.
  Mounted as `<TradeskillsTab view viewKey
  routing />` (`features/tradeskills/TradeskillsView.tsx`), the Skills tab's way, because
  `App.tsx` `PlainView` is at the complexity ceiling. The Skills tab is unchanged.
- Data path: main builds the book once per process (`src/main/tradeskillBook.ts`
  `buildTradeskillBook`, handler `src/main/ipc/tradeskills.ts`, channel `tradeskills:book`,
  bridge `window.eq.tradeskillBook()` in `preload/knowledge.ts`). It reads `itemDb()` and
  `eraDerivations()`, the memos the item lookups and the Gear index hold: no second import of
  items.json (a new JSON import edge in main is a bundle-order risk, WORKFLOW.md). The import in
  `ipc/index.ts` sits after `./planner` on purpose. The renderer fetches once per window
  (`tradeskillData.ts`); the payload is about 1.6 MB.
- Every fold is `src/shared/tradeskillBook.ts`, tested in `tests/tradeskillBook.test.mts`:
  `indexBook` (per-tradeskill ladders, era-hidden counted), `recipeLadder` (marks, search, Hide
  trivial, the unrated heading as a line), `tradeskillTiles`, `subRecipes`, `materialDrops`,
  `heldCount`, and the words on screen. Components only map over what these return.
- TRAP: `items.json` files one page under two keys (its title and its `|itemname`) as two copies
  of the record. Counting keys gives 2,497 crafted items and 2,531 recipes; walked once per PAGE
  there are 2,483 recipes (2,359 name a tradeskill). `buildTradeskillBook` dedupes by
  `entry.page`, not by object identity.
- TRAP: several pages share one in-game name (a bow's Linen, Hemp and Silk pages; `Blade
  core-Nth fold`). A recipe's `id` is `<page key>#<n>`; `key` (the item name's key) is not unique
  and is only for the era join, the item link and "which recipes make this item".
- Marks: trivial at or under the level is `trivial`; the first rated recipe above it is `next`;
  no trivial is `unrated`, kept after everything else under a heading line. A skill the log never
  showed reads as level 0 and the screen says so. The marks are set against the whole ladder
  before the search and the switch take lines away, so a search never moves `next`.
- Era: the shared Current era toggle (`plannerData.useEraOnly`, `eq.planner.era`), with
  `plannerData.eraHides` injected into `indexBook`, the Gear filter's arrangement. A recipe row
  carries the Gear row's evidence (`eraEvidenceOf`), so an item has one verdict on both tabs. An
  unknown era is shown with the `Unknown Era` chip (owner, 2026-11-20). A material's own recipe
  opens whatever its era. Drop mobs are a list that recommends: under the toggle, out-of-era
  mobs are left out and counted.
- Layout: the Bazaar's master and detail. The picked recipe's panel (the next recipe until the
  player picks) holds the materials in full; the table under it is `useWindowedRows` with 36 px
  lines, so a line's Materials cell is one cut-off line with the whole list on hover.
  TRAP: after the table sets its own `scrollTop` it dispatches a `scroll` event itself. The
  browser's event comes a frame later (far later in the hidden e2e window) and until then the
  windowed slice is the old position's: a blank table.
- Names: every item name is `ItemLink` / `ItemLabel` (`tradeskillLinks.tsx`), which is
  `DonorName` with `card` plus `lib/ItemIcon`: the item window on hover, the Loot page on click.
  Mob names are `CellLink` to `openMob(dropMobTarget(...))`, zones `CellLink` to
  `openMapZone(dropZoneTarget(...))`; a zone the table refuses stays plain text. Do not build
  another hover or link here.
- A material's mobs: `mergeItemSources(sourcesFor(key), material.dropsFrom)`, the Loot page's
  own join, folded to one row per mob name and cut to 4 with a count.
- Have: `window.eq.gearOwnership()` (the Gear tab's read; re-asked on `onInventoryReload`),
  counted by `heldCount`: bags, bank, shared bank and `Personal-Depot<n>` rows, every plus level,
  a socketed copy left out. No dump: the cell is blank and `OutputKindLine kind="inventory"`
  names the command. The panel states the dump's date.
- Memory (`tradeskillMemory.ts`, the gear area's rule): the open workbench
  (`eq.tradeskills.skill`, absent is Home) and Hide trivial (`eq.tradeskills.hideTrivial`) in
  localStorage; the search and the picked recipe in sessionStorage (`eq.tradeskills.bench`),
  for the open workbench only, with `linked` when a link from another tab chose the pick. The
  table's scroll position rides `lib/navReturn` (parked on unmount, taken on mount after a Back).
- Back: `openLoot(item)` and `openMob(...)` are anchored links, so their Back returns to the
  Tradeskills view, which reopens the workbench and the picked recipe from storage. Only the
  Loot page's Back calls `noteBack`, so the exact scroll position is restored after Loot and the
  table opens on the picked recipe after Mobs. Maps has no Back for a zone link (`openMapZone`): the
  nav row reopens the workbench. A merchant's "Show on map" (`openMapAt`, slice 4 below) does.
- e2e: `tests/e2e/tradeskills.e2e.mts`. Its claims are properties of what is on screen (the line
  marked next is the first above the level), never a name or count from the wiki data.
- Left menu: with this row the menu's blocks take 774 px of the 820 px drawer (MEASURED.md). One
  more 28 px row fits; a second does not.
- What's new line, for the next `Test build` commit (the in-app list is generated from that
  commit, `scripts/community/community-release-notes.mjs`; nothing is hand-edited): "New
  Tradeskills section: a tile per tradeskill with your level, and a workbench with the wiki's
  recipes in trivial order, what to make next, each material's sources and how many you hold."
  For slice 2: "Tradeskills is linked from the Loot page, the Bazaar, the Skills tab, the wish
  list and the Gear table, and a workbench lists the gear that raises its skill."
- Not built, and no placeholder is drawn: the shopping list across several steps, the
  make-an-item planner, a "ready" mark, a faction goal (no quest reward data). Merchants and
  locations, prices, combine history and the guide panel are slice 3, below; the goal switch,
  the routes and the shopping list for the next step are slice 4.
- Links IN from other tabs (owner, 2026-11-20: "fully integrated with maps and other tabs"),
  slice 2, 2026-11-20 on `tradeskills-links`:
  - The opener: `openTradeskills({ tradeskill, item? })` in `appRouting.ts`, a `FocusSlot` like
    `openLoot` (`tradeskillFocus`, `tradeskillNonce`, `clearTradeskillFocus`). A focus is
    anchored, so the origin stack parks the tab the link was on.
  - How a link reaches it: a context, `lib/tradeskillLink.tsx` (`useTradeskillLink()`, null where
    no app published it), the spell link's arrangement. `lib/appLinks.tsx` `AppLinkProvider`
    mounts the spell and tradeskill providers as one element, because `App.tsx` is at its line
    ceiling: add a later context door there, not in `App.tsx`.
  - How the tab applies it (`TradeskillsView.tsx` `useArrival`): once the book is loaded,
    `shared/tradeskillBook.recipeForItem` picks the recipe (makes the item, else first uses it;
    listed recipes before era-hidden ones of the same kind), `rememberLinkedPick` writes it as
    the workbench's pick with `linked: true` and an empty search, the workbench is opened and the
    focus retired. No screen is drawn while a focus waits, so the workbench mounts after the
    pick is written. A link with no item, or an item with no recipe there, leaves the workbench's
    memory alone.
  - A linked pick stays in the panel when the table does not list it (Hide trivial, the era
    toggle): `benchRecipe`, with `unlistedText` under the recipe's name. Picking a line or typing
    a search clears `linked`. `BookIndex.byId` holds every recipe, era-hidden included.
  - Back: the header's `BackToOrigin` ("Back to <tab>", `tradeskills-back`) shows while an origin
    is parked; it is also the mouse Back's target (`useBackTarget`) and calls `noteBack`, so a
    mob page that sent the reader here comes back as that page. LootView now parks its open item
    page too (`parkReturn('loot', ...)`), so Back to Loot lands on that item; only this Back
    notes `loot`, so every other arrival at Loot is unchanged.
    TRAP: `lib/navReturn` is ONE slot. The recipe table parks on unmount, so going Home or to
    another workbench after a link in overwrites what Mobs or Loot parked, and Back then lands
    on their list.
  - Which tradeskill an item is made by, for a row that has no recipe in hand:
    `ItemMarks.madeBy` (`shared/itemKnowledge.marksOf`: the tradeskills of the item's own
    `craftedBy`, absent when none). `marks.tradeskills` also holds what the item is an ingredient
    of, so it is not the answer to "made by". `lib/tradeskillLink.MadeByLink` draws
    "made: <Tradeskill>" from it.

  | Surface | File and component | State | What the player sees |
  | --- | --- | --- | --- |
  | Loot item page and item dialog | `features/loot/KnowledgeSection.tsx` `CraftedNote`, `RecipeUseChip` | built | Each way in "Crafted:" that names a tradeskill is a `CellLink` (parts from `shared/itemKnowledge.craftedByParts`); each "Used in recipe" chip that names one is clickable and opens the recipe that makes the chip's item |
  | Item hover card | `lib/KnownItemTooltip.tsx` `RecipeHow` | built where the card takes the pointer | Depth 0 only (not click-through, not nested): the "Baking 56" beside a "Used in recipe" name is a `CellLink`. Most cards in the app are click-through and are unchanged |
  | Bazaar | `features/bazaar/BazaarControls.tsx` `WorkbenchButton` | built | "<Tradeskill> recipes" beside the Tradeskill picker once one is picked |
  | Skills tab | `features/skills/SkillsView.tsx` `SkillName` | built | A tradeskill's name is a `CellLink` to its workbench (any log spelling, folded by `tradeskillOf`) |
  | Loot ledger | `features/loot/KnowledgeBadge.tsx` `TradeskillChip` | built | The `tradeskill` badge is clickable: the first of `marks.tradeskills`, with the row's item; the click stops before the row |
  | Mobs drop lists | none | not built | The mob page's drop rows carry no tradeskill badge (`KnowledgeBadge` is drawn only by `loot/lootRows.tsx`); the item dialog opened from a drop row has the Loot page's links |
  | Wish list | `features/wishlist/WishGroups.tsx` `CampLine` | built | A Crafted-group row with no camp reads "made: <Tradeskill>" (`MadeByLink`) where it read "-". The Exaltations farm list no longer exists: the wish list is its drawing half |
  | Gear rows | `features/gear/GearTable.tsx`, the Mob cell | built | A `playerCrafted` row with no drop mob reads "made: <Tradeskill>"; its marks are asked only for such rows |
  | Recommended (Plan) | none | not built | The plan's targets are mob drops and quest rewards (`progressionPlan.ts` reads no `playerCrafted`): a made item is never on it, so there is nothing to link. A crafted lane is a feature, not a link |
  | Character sheet depot rows | none | not built | `CarryAll.tsx` is read-only by its own header ("no row click ... a row is text") and the Character tab has no door to any other tab. A link there is a new pattern for that screen: the owner's call |
  | Factions turn-ins | none | blocked | No quest reward data |
  | Maps merchant waypoints | none | blocked | No merchant data (the guides, or the log's purchases). Superseded 2026-11-20: the link OUT to a merchant's pin is built (slice 4 below); a waypoint list on the Maps tab itself is still not |

- "Gear that raises this skill" (`SkillGearPanel.tsx`, under the workbench's head): the Gear
  index rows whose `skillMods` name the tradeskill, by `shared/tradeskillGear.skillGear` (fold by
  `tradeskillOf`; largest percent, then cap, then name; a mod that lowers the skill left out).
  - The rows are `gear/gearData.useGearIndex()`: the Gear tab's one fetch per window. The first
    workbench opened in a window pays that fetch if the Gear tab has not; the panel appears when
    it lands. Do not build a second index.
  - Era: `gearData.useEraHidden()` injected when the Current era toggle is on; hidden items are
    counted in the panel. Held: `heldCount` over the section's own `useHeld()`; with no dump the
    words are left out.
  - No line for the tradeskill: the panel returns null. 2026-11-20 data: Fishing four, Baking one.
  - The link out: `appRouting.openGearSearch(text)` writes `eq.gear.search`
    (`gear/useAreaMemory.presetSearch`) and switches to Gear unanchored, `openMapZone`'s
    arrangement. The text is `skill mod <the item's own spelling of the skill>`, lower case: the
    Gear haystack holds what the item wrote (`skillModSearchText`). The Gear tab's other filters
    are not touched, so a class or slot filter the player left on can still hide the items.
- e2e (written, NOT run on `tradeskills-links`): `tradeskills.e2e.mts` gained `stepFromSkills`,
  `stepFromLoot` and `stepSkillGear`.
- Slice 3, the workbench's data (2026-11-20, branch `workbench-data` off `tradeskills-batch`; not
  merged, not tried by the owner). TypeScript only; no engine, protocol, network or dependency
  change; `security.ts` untouched.
  - Layout: three tabs under the head, one shown at a time (`Workbench.tsx` `BenchTabs`, the
    `MapsTabs` arrangement): Recipes (the slice 1 master and detail), Your history, From the
    guides. The tab is in the workbench's session memory (`BenchMemory.tab`); a link in and a
    history row both open Recipes. The mockup's one page of panels is not built as drawn (owner:
    the workbench must not be one long scroll).
  - TRAP: `RecipeTable` parks the one `lib/navReturn` slot on unmount. A tab change unmounts it,
    so `parkOnLeave` (Workbench's `awayFromRecipes` ref) tells it not to park then, and
    `restoreTop` is dropped on the first tab change.
  - Facts for every line: `benchFacts.ts` (`BenchFacts`: index, held, eraOnly, `craft`, `money`,
    `guides`), one context for the recipe panel and the guide panel.
  - Guides on the wire: `ipc/tradeskills.ts` imports `data/tradeskillGuides.json` (the one new
    JSON import edge in main; e2e not run on it) and adds `guides` to the book payload:
    `shared/tradeskillGuide.guidePayload` keeps each tradeskill's `notes`, `steps`, `alternates`
    and the recipe lists, and resolves every item name once (`main/tradeskillBook.wikiItemName`:
    the item index's own key, so a name, a page title, an other name or a renamed item's old
    name). The leveling guide's `asides`, `overview` and `unparsed` are not served.
  - Name matching: exact only (case folded, `+N` dropped). Measured 2026-11-20: 46 of 73 route
    steps and alternates, 244 of 278 route materials, 61 of 68 guide recipes, 174 of 189 guide
    recipe materials name a wiki item. The rest stay the text the author wrote ("Gold jade").
  - History (`shared/tradeskillHistory.ts`): `indexCrafting` keys the snapshot by
    `sourceItemKey`; `skillHistory` is one tradeskill's totals, pace and item rows (newest
    combine first); `recipeHistory` is the row of a recipe's item or of what its combine yields.
    Two recipes that make one item share one row: the log names the item, never the recipe.
    Items neither a raise nor the book places are counted in a line under the history table.
  - "trivial for you" (`RecipeYou.NoticeChip`, info colour) is the game's own notice
    (`CraftedItemRow.trivial > 0`); "trivial" (`RecipeTable.StateChip`) is the wiki's trivial
    against the level. Two chips, never merged.
  - Money (`shared/tradeskillMoney.ts`, header lists the rules): a material's price is its
    newest purchase line per unit; a material never bought is costed from the cheapest of its own
    recipes whose every input has a price, per item yielded; a material the wiki marks
    `Returned on Success` is left out; the sum is `crafting.combineCost`'s. Anything else leaves
    the cost unknown: the cell is blank and the panel says which material has no purchase.
    Enchanted Gold Bar (never bought, no wiki recipe, made by a spell from a bought Gold Bar) was
    that case until slice 4 gave it a rule (below): it now costs what the Gold Bar cost.
  - Limits of the money: a tool the wiki does not mark as returned counts as consumed if the
    player ever bought one (the panel lists the parts it added up); the sale line states no
    quantity, so Sells is what one sale LINE paid and the difference is stated only for a recipe
    that yields one item; a recipe whose materials are the guide's has no cost.
  - Have (`tradeskillHistory.haveNow`): the dump's count, or the log's `leaving N` when that line
    is newer than the dump or there is no dump; the cell then carries `log` under the number and
    the foot line says so. The log's count is the DEPOT only, the dump's is bags, bank and depot.
  - Guide lines in the panel (`MaterialWhere.tsx`): the recipe guide's first merchant with a loc
    for a material (66 materials; none has two different places), with a `guide` chip. A recipe
    the wiki lists no materials for draws the guide's recipe of the same tradeskill and item (19
    recipes): a matched name is an ordinary material row, an unmatched one plain text.
  - Merchants: `shared/tradeskillMerchant` over the mob catalog: a link only when one page has
    the name, or one page in the stated zone (24 of the recipe guide's 27 merchants).
  - Loc: plain text. `openMapZone(zone)` is the only Maps opener and takes a zone. Measured
    2026-11-20: the guide's locs are in `/loc` order (north/south, west/east) and each of the 24
    catalog merchants has a wiki spawn point within about 15 units of the guide's loc (one
    outlier, Merchant Lanin). What an opener would take: a one-shot focus beside
    `openMapZone` that `MapsView` reads on mount, selects the merchant's mob pin
    (`mobPins`, the existing selection ring) and centres on it (`centerOn`, as the loc marker's
    `goTo` does). The typed `/loc` marker (`eq.maps.loc`) is "where you are" and must not be
    written for this.
  - Route (`tradeskillGuide.placedLadder`): a step is done at its top, open from the level just
    under its bottom; ranges overlap, so two steps can both be open. The level line sits before
    the first step not done.
  - Credit: `guideCreditOf` (from `guideCredits.ts`) under the route, and under a picked recipe
    when `recipeDrawsGuide` says the panel can draw a guide line (opened materials included).
  - Not shown, by scope: the recipe guide's recipe notes, its 14 recipes with no wiki recipe of
    the same tradeskill (7 name no wiki item), the leveling guide's side tables and overview.
  - Tests: `tests/tradeskillHistory.test.mts`, `tradeskillMoney.test.mts`,
    `tradeskillGuide.test.mts` (fixtures in `tests/tradeskillFixtures.mts`, the owner's shapes).
    e2e: `tests/e2e/tradeskillLogSteps.mts` (`stepOwnLog`, `stepHistory`, `stepGuides`), called
    last from `tradeskills.e2e.mts`; written, NOT run.
  - What's new line: "A Tradeskills workbench now shows your own combines, what a recipe costs at
    the prices you last paid, where you bought each material, and the two community guides: the
    leveling route with your level on it, and merchants with their locations."
- Slice 4, Make an item and Maps at a merchant (2026-11-20, branch `tradeskill-planner` off
  `tradeskills-batch2`; not merged, not tried by the owner). TypeScript only; no engine, protocol,
  network, data or dependency change.
  - Third screen: `Planner.tsx`, over Home or a workbench. Which screen is up: `eq.tradeskills.planOpen`
    (localStorage) over `eq.tradeskills.skill`; `TradeskillsView.useScreens` holds the three moves.
    A link in from another tab closes the planner. The planner's Back names what it was opened over.
  - Memory (`plannerMemory.ts`, parse and transitions in `shared/tradeskillPlanMemory.ts`):
    `eq.tradeskills.plan` in localStorage = item key, picked recipe id, count, keys marked "get it
    instead"; the search text in sessionStorage (`eq.tradeskills.planSearch`). Another item keeps
    the count and drops the rest. The scroll position rides `lib/navReturn` as `PlanReturn`
    (`{ planner: true, scrollTop }`): same one slot as the recipe table, same trap.
  - Doors: `TradeskillDoors` gained `onOpenMapAt` (the router's) and `onPlanRecipe` (the section's
    own, added in `TradeskillsView`, so `Workbench.tsx` threads nothing). `RecipePanel` draws "Plan
    this item" from it and exports `WhereCell`, which the planner's tree and gather list reuse.
  - Folds, all in shared, tested in `tests/tradeskillPlan.test.mts` (fixtures, then Fleeting Quiver
    from the committed data): `tradeskillPlan.ts` (`planChoices`, `searchChoices`, `itemRecipes`,
    `pickRecipe`, `planTree`), `tradeskillPlanLevels.ts` (`skillNeeds`, `skillRoutes`),
    `tradeskillPlanGather.ts` (`gatherFor`, `planHave`, `planPrice`).
  - Which recipe: `planOrder` = lists materials (wiki's, or the guide's) first, names a tradeskill
    first, then ladder order. The root is the reader's pick; a made material opens the first in
    that order that lists materials and says "the first of N".
  - Tree: depth and loop are `subRecipes`'s (`MAX_RECIPE_DEPTH`). A made material is a leaf when:
    the reader closed it, it is already open above, it is past the depth, or no recipe for it lists
    materials (Water Flask: a Brewing recipe with none). `closedText` says which. A guide spelling
    that names no wiki item is a text leaf with no link and no Have.
  - Search: every key of `BookIndex.byItem` (2,384 items, 70 with several recipes, 2026-11-20),
    combines that name no tradeskill included. Under the era toggle an item is left out, and
    counted, only when every recipe that makes it is hidden. A remembered plan is shown whatever
    its era, with the chip. Nothing is listed until something is typed; 40 results, then a count.
  - Levels: a tradeskill is needed at the highest trivial of its recipes in the tree. Stands:
    met, short, unseen (not in the log), unrated (no trivial on the wiki). A combine that names no
    tradeskill is said in words and needs no level.
  - Way there: the leveling guide's steps that cover any of (level, trivial], credited through
    `guideCreditOf`; no step there, then the wiki ladder's recipes that go trivial inside the
    stretch, lowest first, 10 then a count. A skill the log never showed starts at 0 and says so.
    Never shown (the job's brief, 2026-11-20): a success chance, a number of combines to a level,
    anything added for failures. No rate is measured for this game, and nothing resting on a
    guessed formula may be drawn (`CHANCE_NOTE` and `GATHER_NOTE` say so on screen).
  - Gather: leaves times combines; a returned tool once; a held made material is used before any
    is made (so its own materials are not gathered); a combine that yields several leaves the
    spare for the next branch. The total is stated only when every line still to get has a
    purchase price; else the lines without are named.
  - Maps at a merchant: `appRouting.openMapAt({ zone, page })` = the zone pick (`openMapZone`'s
    write) + a one-shot ask in `features/maps/mapFocus.ts` + an ANCHORED link. `useMapFocus` takes
    the ask in a state initializer (the view remounts on arrival), waits for `data.zone` to match
    and the host to have a size (`useSearchJump`'s rule), then `pane.reveal()` (sidebar open for
    this visit, `eq.maps.pane` untouched: pins draw only while it is open) and `pane.select(row)`.
    `MapBack.tsx` draws "Back to <tab>" only while an origin is parked, which only `openMapAt` does.
    `MapsView` takes `nav` (one changed line in `App.tsx`).
  - When "Show on map" is drawn: `mapFocus.pinTarget(entry, statedZone, eraOnly)` asks `mobRows`
    itself, so it is the Maps tab's own answer (in the zone, in era under `eq.maps.travelEra`, one
    zone on the page, not a common spawn, a stated loc). A stated zone the table cannot place
    ("New Sebi") falls back to the one zone the mob's page names. Measured 2026-11-20: 24 of the
    recipe guide's 27 merchants (21 by the guide's zone, 3 New Sebilis by the page's; the other 3
    are not in the catalog). `tests/mapFocus.test.mts` holds the counts as floors.
  - Seen in the data, not acted on: the leveling guide's Fleeting quiver step lists five materials
    (it adds Vial of distilled mana); the recipe guide lists four. The tree draws the recipe
    guide's; the route line prints the leveling guide's words as written.
  - e2e: `tests/e2e/tradeskillPlanSteps.mts` (`stepPlanner`), called last from
    `tradeskills.e2e.mts`; written, NOT run.
  - What's new line: "Tradeskills has Make an item: search any craftable item to see every
    material down to its leaves, the skills it takes with your levels, what to make on the way,
    and what to gather. A merchant's line can open the Maps tab on that merchant."
- Slice 4, goal routes and the shopping list (2026-11-20, branch `tradeskill-routes` off
  `tradeskills-batch2`; not merged, not tried by the owner). TypeScript only; no engine, protocol,
  network or dependency change.
  - Where: a fourth workbench tab, "Your route", second after Recipes (`BENCH_TABS` gained
    `route`). A workbench still opens on Recipes: the e2e steps before it assume that. Making the
    route the opening tab is `FRESH.tab` in `tradeskillMemory.ts`.
  - THE LAW: no success or skill-up rate of this game is measured, so no route states a chance, a
    number of combines, a loss per point or a total for a stretch. `Route.basis` says what a route
    ranks on, `Route.caveats` what it does not. `tests/tradeskillRoute.test.mts` "NOTHING
    GUESSED" scans every step of every goal for forecast words and for a price the fixture's four
    prices cannot add up. A new sentence that needs a formula fails it.
  - Files: `shared/tradeskillRoute.ts` (goals, `buildRoute`, the route's own words),
    `tradeskillRouteStep.ts` (a step and its sentences), `tradeskillRouteLevel.ts` (Cheapest,
    Fastest), `tradeskillRouteExplore.ts` (Explore, the community route), `tradeskillShopping.ts`
    (the list, where, total, copy text), `tradeskillMaterials.ts` (held counts, the expansion
    through made and enchanted materials, "can it be bought"). Screens: `RoutePanel.tsx`,
    `ShoppingPanel.tsx`, `routeMemory.ts`. They map over what the shared files return.
  - Cost rule added to `tradeskillMoney.ts`: a material whose wiki source words include "Bought +
    Enchanted" and whose name is "Enchanted <X>", that nothing in the book makes, costs the last
    price of <X> (`enchantedFrom`, `CostPart.bar`). The parts text marks it "(the price of a Gold
    Bar, enchanted by a spell)"; with no bar price the reason names the bar to buy. Both the words
    and the name are needed: an imbued recipe's bar is sourced "Summoned" and stays unpriced. The
    spell's own cost is not in the log and is not counted. One for one is the cost rule's reading
    and the shopping list's too.
  - Cheapest (the two held tie-breaks in this bullet were removed the same day: slice 5 below):
    from the level, the recipe above it with the least cost per combine; equal costs:
    more combines on hand, then the lower trivial. With no priced recipe above: what is held, then
    the next trivial up. TRAP for the reader: the cheapest per combine can sit far above the
    level and skip a recipe the player holds materials for. The step's `aside` names that recipe
    ("Not picked, but on hand: materials for 23 Golden Ruby Ring"). Whether held materials should
    outrank a lower cost is the owner's call.
  - Fastest: `recipeBuyable`. Bought means a purchase in the log, a wiki source word holding
    "Bought" (not "Bought + Enchanted"), or a guide merchant; a bar a spell enchants counts and is
    named; a made material counts when one of its recipes takes only bought materials; a tool the
    combine gives back counts when one is held. When nothing above is buyable: the highest trivial
    that lists materials, then the highest the wiki holds.
  - Explore: never made (`recipeHistory(...).made === 0`), trivial from `level - 20` up, rated
    recipes only. Groups, first that fits: quest, guide, odd (a different yield, or a container
    under 5% of the tradeskill's recipes use once 20 state one), dropped, worn. 8 per group, the
    rest counted. Empty until the crafting module is served.
  - Two fields added to `BookRecipe`, filled in `main/tradeskillBook.ts` `madeItemFacts`: `quests`
    (the made item's quest uses, a reward role left out, deduped) and `worn` (its own stats, saves
    and effect names). Measured 2026-11-20: 319 recipes with `quests`, 1,766 with `worn`; the
    payload is about 1.7 MB. `TRADESKILL_BOOK_VERSION` is unchanged: both are optional.
  - Community route: `placedLadder` steps not done. A step is joined to a recipe only when the
    guide's name is a wiki item's exactly; the Jewelcrafting route above 203 joins none ("Platinum
    ruby"), so those steps are the guide's text with no cost and no shopping list.
  - On hand: `tradeskillMaterials.onHand`, from `haveLookup` (the Have cell's own count). Null
    with no dump and no depot line: no number. Plain bars held count toward a second number
    ("or for 68 once the Platinum Bar you hold is enchanted").
  - Shopping list (`shoppingList`): for the route's first step. `expandMaterials` walks the
    recipe; one held stock serves every place a material is used; a made material short of its
    need rolls up to its own recipe (the parent's tradeskill first, then the lowest trivial) in
    `ceil(short / yield)` combines; a material that can be bought is never rolled up; an enchanted
    bar short of its need rolls up to that many plain bars. A tool is needed once. Limit: a made
    material used in two places is rounded up per place.
  - Where: the log's last purchase (`PaidLine`), else the guide's merchant (`GuideSourceLine`),
    else drops and forage (the Loot page's join, handed in as `ShoppingFacts.drops`), else the
    wiki's source words. The total is stated only when every material still to buy has a price.
  - Copy: `shoppingCopyText`, through `lib/clipboard.copyText` (main's clipboard); a refusal is
    said beside the button.
  - Memory (`routeMemory.ts`, localStorage): `eq.tradeskills.goal.<Tradeskill>` and
    `eq.tradeskills.combines` (1 to 1000, default 20).
  - `tradeskillMaterials.ts` may overlap a helper of the make-an-item planner branch
    (`tradeskillPlan*.ts`): reconcile to one when both are on the trunk.
  - Tests: `tests/tradeskillRoute.test.mts`, `tradeskillShopping.test.mts` (fixtures
    `tradeskillRouteFixtures.mts`: the owner's case), `tradeskillMoney.test.mts`,
    `tradeskillBook.test.mts`. e2e: `tests/e2e/tradeskillRouteSteps.mts` (`stepRoute`), called last
    from `tradeskills.e2e.mts`; written, NOT run.
  - What's new line: "Tradeskills: a workbench now plans a route from your level for the goal you
    pick (cheapest, fastest, explore, or the community guide's), with a shopping list for the next
    step. Jewelcraft recipes now show a cost: an enchanted bar counts at the price of its bar."
- Slice 5, held materials and wiki first (2026-11-20, branch `tradeskill-held-wiki` off the trunk;
  not merged, not tried by the owner). TypeScript only; no engine, protocol, network, data or
  dependency change; `security.ts` untouched. Owner rulings: "the price of the materials doesn't
  change just because I already have them. but... you can add a 'only use materials i have'
  option"; "WIKI is our PRIMARY source, and others are secondary. If there are issues with the
  wiki, the users need to find out and fix the wiki".
  - SUPERSEDES the Cheapest bullet above: Cheapest ranks on cost alone. `cheaperFirst` is cost,
    then the lower trivial; with no priced recipe it is the next trivial up. Held counts are read
    only for the aside ("Not picked, but on hand"). Do not put `ready` back in the order.
  - Files: `shared/tradeskillRouteHeld.ts` (the held-only route), `tradeskillHeld.ts` (can make
    now, whether anything says what is held, the switches' words), `tradeskillWiki.ts` (the page,
    the gap, guide differences). Screens: `RecipeFilters.tsx` (the two table switches),
    `WikiGap.tsx` (`WikiPageLink`, `WikiGapLine`, `GuideDifferences`).
  - Held-only route (`RouteAsk.heldOnly`, read by Cheapest and Fastest only): candidates are
    rated recipes above the level whose `onHand(...).ready` is at least 1 against what is LEFT of
    the stock. Cheapest: cost, then lower trivial. Fastest: highest trivial. A step takes every
    combine it covers and `take` removes that from the stock (a returned tool is not removed), so
    the next step sees the rest. `handText` is "Your held materials cover N combines", with
    "after what the steps above use" from the second step on.
  - Strict on purpose: only a recipe's own materials count. Plain bars that a spell could enchant
    and a made material whose parts are held do NOT qualify a recipe. A material with no stated
    count (no dump, no depot line for it) is not held.
  - TRAP: the count of combines is a count of materials. Nothing may say it reaches a level
    (`HELD_NOT_MEASURED`; the NOTHING GUESSED test in `tests/tradeskillHeld.test.mts`).
  - A held-only route can end below the wiki's top: `capTop(route)` is null for it (so "N more
    steps, not listed" names no top) and `routeEndText` names the last listed step's trivial, or
    nothing when steps were capped.
  - Whether anything says what is held: `heldKnown` = an inventory dump or any depot line. False:
    the route switch and "Can make now" are disabled with `HELD_UNKNOWN_SHORT` beside them, and no
    mark is drawn. On Explore and Community route the route switch is disabled with
    `HELD_ONLY_GOALS_TEXT`; the stored choice is kept.
  - Can make now: `makeableNow(facts, recipes)` = recipe id to combines, each recipe judged alone
    (two marked recipes may want the same material; only the route shares a stock). It does not
    read the level. A recipe with no consumed material listed is never marked. The planner's mark
    is `gatherHeld` (every leaf's To get is 0), so it covers sub-combines.
  - Table switches: `LadderAsk.only` is a list of `LadderFilter` (`keep`, `emptyText`), applied
    after the marks are set, like Hide trivial. `benchFilters(makeable | null, wikiGaps)` builds
    it. Both switches are remembered across restarts (`eq.tradeskills.canMake`,
    `eq.tradeskills.wikiGaps`), the section's rule for a choice; the count line says "N of M".
  - `BookRecipe.page` (added in `main/tradeskillBook.ts`): the wiki page title, kept only when it
    is not the item's name (122 recipes on 2026-11-20). The wiki link is
    `wikiPageUrl(recipe.page ?? recipe.item)`, the app's one URL builder; `<a target="_blank">`
    as on the Loot and Mobs pages. `TRADESKILL_BOOK_VERSION` unchanged (optional field).
  - A table line's wiki link: `wikiRowLink(recipe)` = in the empty Materials cell, else beside
    the item's name. TRAP: never in the Trivial cell. `tests/e2e/tradeskills.e2e.mts` `rows()`
    reads that cell as a number or nothing, and its unrated-lines check wants nothing.
  - Wiki first was already true in every fold (`recipeMaterials`, `planTree.linesOf`, the cost,
    the shopping list read a guide list only when `recipe.ingredients` is empty); a test in
    `tests/tradeskillWiki.test.mts` now holds it on fixtures and on the committed data.
  - Guide differences (`guideDifferences`): the recipe guide's recipe for the same tradeskill and
    item (materials and trivial), and the leveling guide's step for it (top-level materials only;
    a nested sub-combine is not compared; its range is not a trivial). A list differs when a
    shared material has another count, the guide names a real wiki item the wiki's list lacks, or
    the leftovers differ in number or counts. A loose guide spelling alone ("Fresh Fresh") is NOT
    a difference: it cannot be told from the wiki's own material.
  - Measured 2026-11-20: 36 recipes have materials on both the wiki and the recipe guide; 23
    match; 7 differ by the rule (Clump of Dough, Evergreen Extract, Fine Plate Breastplate, Fine
    Plate Helm, Forged Javelin, Heady Kiola, Metal Bits); 6 differ only by a loose name. 5 state
    another trivial (Fine Plate Helm, Fine Plate Visor, Metal Bits, Mithril Bundled Arrow Shafts,
    Sheet Metal). 2 leveling guide steps differ (the two Unfired poison vials). 12 recipes in all.
  - Seen in the data, not acted on: the wiki's Clump of Dough lists every kind of egg as its own
    material (13 lines), so its cost and "can make" want all of them. A wiki page to fix.
  - The guide's trivial where the wiki has none (`guideTrivialText`; Distillate of Clarity VI)
    is said in the gap line only. The ladder still files the recipe as unrated.
  - Missing on the wiki, 2026-11-20: 615 of 2,359 recipes (Alchemy 177, Baking 21, Blacksmithing
    192, Brewing 26, Fishing 5, Fletching 7, Jewelcrafting 72, Poison Making 4, Pottery 8, Spell
    Research 27, Tailoring 69, Tinkering 7). `tests/tradeskillWiki.test.mts` prints them.
  - Tests: `tests/tradeskillHeld.test.mts`, `tradeskillWiki.test.mts`; changed
    `tradeskillRoute.test.mts` (cost alone) and `tradeskillBook.test.mts` (`page`). e2e:
    `tests/e2e/tradeskillHeldSteps.mts` (`stepHeldAndWiki`), called last from
    `tradeskills.e2e.mts`; written, NOT run.
  - What's new line: "Tradeskills: the route has Only use materials I have, recipes you can make
    right now are marked and can be listed alone, and a recipe the wiki is missing materials or a
    trivial for says so with a link to its wiki page."
- Slice 6, crafting AAs, fishing outcomes and the Foraging tile (2026-11-20, branch
  `tradeskills-aa-gather` off `tradeskills-batch3`; not merged, not tried by the owner). TypeScript
  only; no engine, protocol, network or dependency change; `security.ts`, `crafting.ts`,
  `Workbench.tsx` and `TradeskillsHome.tsx` untouched.
  - Mounts (one line each, by the coordinator): `<AaPanel tradeskill={tradeskill} />` under
    `SkillGearPanel` in `Workbench.tsx`; `<ForagingTile />` after the tile grid in
    `TradeskillsHome.tsx`. `GatherPanel` is mounted in `HistoryPanel.tsx` when the workbench is
    Fishing. All three read their modules themselves (`useModule`): no prop from the workbench.
  - AA data: `src/shared/tradeskillAaTable.generated.ts` (`GENERAL_AAS`: name, ranks, the Cost
    cell and the Description cell as the wiki writes them, 32 rows; `TRADESKILL_AA_RULES`: the
    lines of the wiki's Tradeskills page that link to the AA page, one today). Written by
    `scripts/gen-tradeskill-aas.mts` (parsers `scripts/sources/generalAas.ts`) from the committed
    caches, zero requests, no date in the file. `tests/tradeskillAaTable.test.mts` fails while the
    file is behind the caches (DATA_REFRESH.md).
  - Why not `classes.json`: its `aas` rows hold group, classes, levels and cast, no ranks, cost or
    text, and `classWiki.aaRows` reads only rows written on one line with `||`. The wiki writes
    Full Potential, Widened Perception and Point Blank Fire one cell per line, so those three are
    not in `classes.json` (175 AAs there; `scrape:classes -- --offline` over the 2026-11-20 cache
    rewrites nothing, so the file is in step with its parser). Not fixed here: reading them adds
    three rows to `classes.json`, which the level-up unlock tables are built from.
    `generalAas.aaCells` reads both layouts.
  - Which AAs (`shared/tradeskillAa.ts aaReach`), read off the row, no name list: `<X> Mastery`
    whose X folds to a tradeskill bears on it (`aaTradeskill`: `tradeskillOf` plus the wiki's
    "Jewel Craft" and "Jewelcraft"); a text naming Forage bears on foraging; any other text saying
    "tradeskill" bears on all (Crafting Mastery, Full Potential). 2026-11-20 cache: 8 masteries
    (Alchemy, Baking, Blacksmithing, Brewing, Fletching, Jewelcrafting, Pottery, Tailoring),
    Crafting Mastery, Full Potential, Foraging. No mastery for Fishing, Poison Making, Spell
    Research, Tinkering; no fishing AA.
  - Crafting Mastery's text lists seven "standard" tradeskills (Baking, Blacksmithing, Brewing,
    Fletching, Jewelcraft, Pottery, Tailoring); the Tradeskills page's rule says "all other
    tradeskills". Both are shown as written; a workbench outside the seven adds "The wiki's text
    names ... It does not name <Tradeskill>". Which is right in game is not known.
  - Figures: read only from `by A/B/C%` and `raise A/B/C additional`, once in the text, one value
    per rank (`percents`, `extra`); else null. Shown as "At rank N the wiki states ...". THE LAW of
    slice 4 holds: no chance, no rate, nothing worked out from a figure (the NOTHING GUESSED test
    in `tests/tradeskillAa.test.mts`).
  - Purchases: the `leveling` module's `aaSpends` through `aaLedger` (the top rank a line names;
    a re-bought rank is one rank; every rank at cost 0 reads "granted"). The game's names match
    the wiki's exactly on the owner's log (Jewel Craft Mastery, Baking Mastery, Crafting Mastery;
    costs 2/4/6 and 3 each as the wiki lists). No line: "Your log shows no purchase", with a hover
    saying a log that began later does not show it. Never "you do not have it".
  - Past 200 (`pastCap`): `tradeskillLevel` over all twelve app tradeskills, level above 200,
    named with their levels. The app does not work out how many more may pass 200.
  - Panel: one line, closed by default (`eq.tradeskills.aaOpen`, localStorage), because the
    workbench must not grow a scroll of panels; open, the details scroll inside 220 px.
  - Fishing and forage words: `shared/tradeskillGather.ts` over `crafting.ts`'s `fishingRate`,
    `forageRate`, `gatheredShares`, `unnamedCatches`. Fishing shares are over ALL catches (the
    unnamed ones in the whole), so the named rows can add up to under 100%. A part that rounds to
    0 reads "under 1%". The Foraging tile lists 5 items, then "Show all N" (window state only).
  - The Forage level is the `skills` row spelled `Forage` (the newest line), not a tradeskill row.
  - On a dev build at an unchanged version, a sealed archive without `fishing` and `forage` needs
    Refresh, so the panel and the tile count the live log alone until then. A version bump refolds it.
  - TRAP: `tests/copyNoEmDash.test.mts` scans every string under `src/shared`, the generated table
    included. `generalAas.cellText` writes an em or en dash in a wiki cell as a spaced hyphen (none
    in the table today).
  - Not built: a fishing or forage pace per hour; the zone a catch or a forage came from; the AA
    table's Archetype, Class and Special rows (none bears on a tradeskill on today's page).
  - Tests: `tests/tradeskillAa.test.mts`, `tradeskillAaTable.test.mts`, `tradeskillGather.test.mts`.
    e2e: `tests/e2e/tradeskillGatherSteps.mts` (`stepAaAndGather(page, log)`), to be called last
    from `tradeskills.e2e.mts`; written, NOT run; each part notes and skips when its mount is not in.
  - What's new line: "Tradeskills: a workbench lists the AAs for its tradeskill with the ranks your
    log shows bought, Fishing shows your casts, catches and what you caught, and Home has a
    Foraging tile."
- Slice 6, Home after the owner's first look (2026-11-20, branch `tradeskills-home` off
  `tradeskills-batch3`; not merged, not tried by the owner). TypeScript only; no engine, protocol,
  network, data or dependency change; `security.ts` untouched. Owner: "that bar you had showing the
  progress for each tradeskill"; "perhaps people can 'wishlist' a crafted item"; of the mockup's
  other parts, "if they made sense and you feel it has value add them".
  - Files: `shared/tradeskillLevelBar.ts` (the bar, the 200 rule), `tradeskillHome.ts` (pick up,
    the sources line), `tradeskillWished.ts` (working towards), `tradeskillPicked.ts` (the picked
    recipe's material lines). Screens: `SkillBar.tsx`, `HomePickUp.tsx`, `HomeWished.tsx`,
    `RecipeWish.tsx`; `TradeskillsHome.tsx` lays Home out (pick up, Make an item, working towards,
    the tiles, sources). Tests: `tests/tradeskillHome.test.mts`.
  - The bar's scale is MEASURED per tradeskill, and it is not 300 for all: the achievements dump
    (`tests/fixtures/Primitive_freeport-Achievements.txt`, blocks `Tradeskill: <name>` and
    `Tradeskill: Special`) lists milestones 50 to 300 for Alchemy, Baking, Blacksmithing (written
    "Smithing"), Brewing, Fletching, Jewelcrafting, Pottery and Tailoring, 50 to 200 for Fishing,
    and none for Tinkering, Poison Making or Spell Research. `skillTop` holds that table and a test
    reads the fixture against it. No milestone: an empty bar, the level as a number, no "of".
  - The 200 cap is the WIKI'S RULE, worded as such (`CAP_NOTE`, `capTip`): its Tradeskills page
    says every other tradeskill caps at 200 once one passes it, until Crafting Mastery; its AA
    table names the seven that AA lifts (Baking, Blacksmithing, Brewing, Fletching, Jewelcraft,
    Pottery, Tailoring). The note and the tick at 200 are drawn for those seven only, where the
    two pages agree, on a tradeskill whose level is known and at or under 200 while another of the
    seven is above 200. Not for Alchemy or Fishing, not for a skill the log never showed.
    Open: it does not read the Crafting Mastery ranks the log shows bought (the AA panel's branch
    has that fold); a player with ranks still sees the note on the tradeskills at or under 200.
  - e2e contract kept: `tradeskill-tile-level` and `tradeskill-level` hold the number alone; "of
    300" is its own element (`tradeskill-bar-of`); the bar is `tradeskill-bar` with `data-fill`.
  - Pick up (`pickUp`): the tradeskill of the newest item row with a combine that a raise or the
    recipe book places; none, then the highest level; no level, then null and no panel. The next
    recipe is named only when the level is known. `canMake` is `onHand(...).ready`: null (left
    out) when nothing says what is held or one material's count is unknown; 0 is said ("You do
    not hold every material for it."). The last run is `spans.at(-1)`, every tradeskill's raises
    together, and its pace is `craftingPace` over that one span (null under the rate's minimum
    time). The panel waits for BOTH the skills and the crafting module: before that "no combine
    yet" would be a default.
  - Sources: `TradeskillBookPayload.scrapedAt` (items.json's own, through the new
    `itemLookup.itemDbScrapedAt()`: no new JSON import edge) and `GuidePayload.stamps` (id,
    version, pulledAt, built in `guidePayload`). A guide's `sourceUrl` is NEVER put on the payload:
    the test scans the stamps for an address. Title and author are `GUIDE_CREDITS`'s. Both fields
    are optional; `TRADESKILL_BOOK_VERSION` unchanged.
  - Wish: ONE control (`wishlist/WishToggle`). `RecipeWish` only names the item: `hasWish` by
    `recipe.key`, `wishFromGear({ key, name })`, `useWishlist` add and remove, nothing drawn before
    `ready`. Homes: the picked recipe's head (beside "Plan this item") and the planned item's head.
    NOT on recipe lines: the table is fixed-layout and a line already holds up to four marks.
  - Working towards (`wishedCrafts`): every wish list entry whose key is in `BookIndex.byItem`,
    in the list's order; the recipe is `pickRecipe(itemRecipes(...), null)` and the counts are
    `gatherFor(planTree(recipe), { count: 1 })`, so they are the planner's. Shown whatever its era,
    with the chip (a wish is the player's own choice, as a remembered plan is). The link is
    `openPlan(item, recipeId)`.
    TRAP: a wished crafted item that is not equippable is not in the Gear index, so the Wish list
    tab resolves it as `unknownItem` and files it under "Nothing says where these come from" (so
    does one wished from the Loot page). Giving the Wish list a crafted lane off the recipe book
    is a feature of that tab, not done here.
  - Price format: `ppText` is two decimals, half up from the copper (`14_175` reads 14.18 pp); 1
    to 4 copper reads "under 0.01 pp"; 0 reads 0.00 pp. `differenceText` says "the same as the
    materials" within `SAME_PRICE_SHARE` (1%) of the cost. No other formatter prints plat here.
  - The recipe table's Cost and Sells (`PRICE_SX`, `PRICE_WIDTH`): the cause of the cut-off was
    not Materials. The table is `tableLayout: fixed`, so a column is as wide as its head says; 92
    px less the small table's 16 px either side left 60 px. Now 112 px with 8 px either side and
    no ellipsis; `TABLE_MIN_WIDTH` (920) makes the table scroll sideways when the pane is
    narrower, because every px a fixed table loses comes out of the one column with no width.
  - The picked recipe's material lines: one grid (`ROW_SX`, `LINE_SX`) for wiki lines, guide lines
    that name a wiki item and guide lines that do not. Need prints `needQty` (the stated count,
    else 1: the count `combineCost`, `onHand`, the planner and the Have cell's "enough" already
    use). `madeBy` splits a material's recipes into `open` (lists materials on the wiki, or the
    guide's) and `bare` (lists none): the opener is drawn only for `open`; each `bare` recipe is
    one line in the Where cell with its wiki page link (`tradeskill-material-bare`).
    Read, not seen: nothing opened a material by default (`useState(false)`, lists keyed by
    recipe); the screenshot's open Water Flask came from an opener the row offered for a recipe
    with nothing under it.
  - Skills tab: `lib/tradeskillLink.OpenTradeskills` takes an optional focus; with none the
    router's slot switches tab unanchored, so the section opens where it was left and shows no
    Back. `SkillsView` `OpenTradeskills` is the button (`skills-open-tradeskills`).
  - e2e: `tests/e2e/tradeskillHomeSteps.mts` (`stepHomeAndWish`), called last from
    `tradeskills.e2e.mts`; written, NOT run. The price change moved no e2e string: every pinned
    price there already had two decimals.
  - What's new line: "Tradeskills: every tradeskill shows a level bar, Home opens with Pick up
    where you left off, and a crafted item can be put on your wish list from its recipe and
    followed under Working towards. Prices print to two decimals, and the Skills tab has an Open
    Tradeskills button."
- Slice 6, the Faction goal (2026-11-20, branch `tradeskill-faction` off `tradeskills-batch3`; not
  merged, not tried by the owner). TypeScript only; no engine, protocol, network, data or
  dependency change; `security.ts` untouched.
  - Where: the fifth goal of the switch on "Your route". `ROUTE_GOALS` has five; `BOOK_GOALS` is
    the four `buildRoute` builds (`RouteAsk.goal` and `Route.goal` are `BookGoal`). Faction is not
    a climb from the level, so it is not a `Route`: `shared/tradeskillRouteFaction.ts`
    `buildFactionRoute(facts, ask)` returns the list of factions, the picked one and its rows.
    `RoutePanel.tsx` draws `BookRoute` or `FactionRoute.tsx` by the goal.
  - The join is `shared/questFactions.ts` (`questsTaking`). The renderer has no items.json, so
    its item records come from the recipe book: `bookFactionItems(index)`, one record per made
    item's page, every recipe counted (era-hidden too). `BookRecipe.questPages` (new, filled in
    `main/tradeskillBook.ts` `madeItemFacts`) is quest name to page title for a use whose page has
    another title (97 entries on 83 recipes); without it Tarnished Dagger lost its rows.
    `TRADESKILL_BOOK_VERSION` unchanged (optional field). A test holds the book's rows equal to
    the item database's (none invented, at most 2% lost; measured: none lost).
  - Era: the caller builds the join over `inEraQuests(quests)` when the Current era setting is on
    (`FactionRoute.useTurnIns`), and the rows walk `skillRecipes(index, tradeskill)`, which the
    setting has already narrowed. With the setting off an out-of-era quest's row carries
    `TurnIn.eraNote`.
  - A row is one recipe and one quest page (`FactionStep`, a `RouteStep` plus `turnIn`, so
    `ShoppingPanel` reads it unchanged). Its id is `<recipe id>|<quest page>`. One recipe is a row
    under every faction its page raises.
  - Order (`rowOrder`): trivial at or under the level, then the stated raise (unstated after every
    stated one), then the known cost per combine, then ladder order, then the page title. A level
    the log never showed makes no recipe trivial (`LEVEL_UNSEEN_NOTE`), unlike the climbing routes,
    which start from 0.
  - Default pick: the faction most recipes feed, first by name among equals; a remembered pick
    (`eq.tradeskills.faction.<Tradeskill>`, the join key) stands while the list holds it.
  - THE LAW: one list per quest page (questFactions.ts header). Nothing is filtered for it. A row
    is marked (`TurnIn.shared`, chip "shared page" and the sentence) on three signs: the item's
    page files the use under a quest name that is not the page's title (`filedAs`), the title
    matches `quests|tests`, or the page lists more than `LONG_LIST` (5) changes. Do not turn a
    sign into a filter without the owner's word.
  - A second honesty line, `TurnIn.tie`: a row tied by the quest page alone (`requiredItems` is
    every item the page names outside its Reward section, so a material of the turn-in is there
    too: Clump of Dough on Muffin Quests) or by the item's page alone says which. Both: nothing.
  - Never drawn: a number of turn-ins, a standing to reach, how many of the item a turn-in takes
    (`requiredItems` holds no counts), a combine chance. `tests/tradeskillRouteFaction.test.mts`
    "NOTHING FORECAST" scans every row.
  - Standings: `factions/useFactionRows.useFactionData()`, the Factions tab's own rows (the dump
    corrected by the log), keyed by `questFactionKey(row.name)`. It asks main for the log evidence
    while the Faction goal is open, as the Factions tab does. Null rows = no dump: no standing is
    drawn and `OutputKindLine kind="faction" quiet` names the command.
  - "Only use materials I have" reads here too (`tradeskillRoute.heldOnlyApplies`): rows whose
    recipe `combinesHeld` covers at least one combine, each judged alone (rows are alternatives,
    not a sequence, so no stock is shared out). The list of factions is not narrowed.
    `HELD_ONLY_GOALS_TEXT` now reads "Applies to Cheapest and Fastest, and to Faction." (the e2e
    held steps match `cheapest and fastest`).
  - Shopping list: for the first row, or the row whose "Shop for this" was pressed (component
    state, not remembered; a pick the list no longer holds falls back to the first row).
  - Links: item = `ItemLabel`; quest = `<a target="_blank">` to `wikiPageUrl(page)` (no tab holds a
    quest page; the Factions tab and the Loot page link a quest the same way); giver =
    `MerchantLink` (a link only when the mob catalog holds the name on one page); zones =
    `ZoneList` (`startZone` split on commas; a spelling the table refuses stays text); faction =
    `lib/factionLink.FactionLink`.
  - The door into the Factions tab is new: `appRouting.openFactions(name?)` (`factionFocus`,
    `factionNonce`, `clearFactionFocus`; a `FocusSlot`, anchored when a name rides along),
    published by `lib/factionLink.tsx` through `lib/appLinks.tsx`. `useFactionsController`
    `useFocusArrival` calls `reveal(name)` and retires the ask; `FactionBack.tsx` is the Back
    (`MapBack.tsx`'s arrangement). The link asks for the dump's spelling when the dump lists the
    faction (`FactionChange.openAs`): the tab's search is a substring match on the dump's names,
    and a wiki spelling of a faction can differ from the dump's. Not checked against a real dump.
  - Back from Factions lands on the route again: the open workbench, the route tab, the goal and
    the picked faction are all in storage. The "Shop for this" row is not.
  - Measured 2026-11-20, in era: factions per tradeskill Baking 42, Brewing 42, Blacksmithing 38,
    Tailoring 30, Pottery 25, Fletching 13, Fishing 3 (the other five none; with the setting off
    Poison Making 5, Alchemy 3 and Jewelcrafting 2 appear). 90 recipe and page pairs; 26 marked
    shared (14 pages); 26 tied by the quest page alone, 13 by the item's page alone. TRAP for the
    reader: Pottery's 25 and Fletching's 13 are one item on one long page each.
  - Tests: `tests/tradeskillRouteFaction.test.mts` (a fixture, then Muffin, Silk Swatch and
    Tarnished Dagger from the committed data); changed `tradeskillRoute.test.mts` (five goals,
    `BOOK_GOALS`) and `tradeskillHeld.test.mts` (`heldOnlyApplies`). e2e:
    `tests/e2e/tradeskillFactionSteps.mts` (`stepFaction`), written, NOT run, and not yet called
    from `tradeskills.e2e.mts`; `tradeskillRouteSteps.mts` now expects five goals.
  - What's new line: "Tradeskills: the route has a Faction goal. Pick a faction and see which
    items of the tradeskill a quest takes to raise it, with the quest, its giver and zone, every
    faction change the wiki states, and the shopping list. Faction names open the Factions tab."
- Slice 8, screen fixes after the first captures (2026-11-20, branch `tradeskills-screen-fixes` off
  `tradeskills-batch3`; not merged, not tried by the owner). TypeScript only; no engine, protocol,
  network, data or dependency change. Captures: a 1500 px window, the section about 1220 px wide.
  Unit tests of the changed folds run; typecheck and lint run; e2e steps changed and NOT run.
  - Recipe table. Seen: Materials showed one material ("Enchanted Gold Bar (Bought + Enc..."), You
    was cut, and Container repeated one value down a tradeskill. Now six columns: Trivial 72 px,
    Item 26%, Materials (what is left), Cost 112 px, Sells 112 px, You 23% with 8 px side padding.
    At a 1205 px table: Item 313, Materials 319 (287 of text), You 277 (261 of text; "made 3,
    failed 1, 2 raises (204 to 205)" is about 234). A line's Materials are counts and names only;
    the hover (`materialsText`) and the panel keep the source words. `TABLE_MIN_WIDTH` stays 920.
    TRAP: the third cell is now Materials, which holds links. An e2e click that only picks a line
    goes to the Trivial cell (`td >> nth=0`).
  - Shopping list. `ItemLabel` takes `wrap`: the name wraps in its column (the planner's
    `DonorName` style cuts it; the override is a selector on its test id in `tradeskillLinks.tsx`,
    because `PlannerChips.tsx` is another feature's file). Used for the list's lines and its head.
  - Faction goal. SUPERSEDES the Order and Default pick bullets of slice 6:
    - `TurnIn.group` (`RowGroup`) is the order's first key: `own` (the item's own page lists the
      quest, alone or with the quest page, and the row is not marked shared), `shared` (marked
      shared, item's page lists it), `questOnly` (the quest page alone names the item, marked
      shared or not). Inside a group the old order stands. No row is dropped.
    - `FactionChoice.own` counts a faction's `own` rows. `choices` are sorted by it (most first,
      then name) and the default is the first. The count on screen is still the recipes.
    - Measured on the committed data, in era, no level: Baking opens on Arcane Scientists (one
      row: Uncooked Rat Ear Pie on Rat Ear Pie Quest); no Baking faction has more than one `own`
      row, so the name decides among them. Tailoring opens on Rogues of the White Rose (14 rows,
      all `own`). Pottery, Fletching and Fishing have no `own` row at all and open on the first
      name.
    - A row's changes on screen are `shownChanges(turnIn, all)`: the picked faction's own first,
      then `CHANGE_CAP` (8) others, then "and N more" (`tradeskill-faction-more`), which opens the
      whole list in the row and closes it again. `TurnIn.changes` is untouched.
    - Above the panes: the basis line (reworded for the new order), `FactionRoute.notice` (the
      level the log never showed, when that is so), then "How to read this"
      (`tradeskill-faction-how`), which opens the four caveats in place. Closed until asked for;
      `eq.tradeskills.factionHelp` in localStorage. `caveats` no longer holds the level line.
  - Missing wiki materials are said in ONE line, `WikiGapLine` (`wikiGapText(gap, note)`,
    `GapNote`): `guide` when the recipe guide's materials are drawn under it (decided by
    `gapNote`, the same `guideMaterialsFor` every fold uses; `data-guide` on the line), `guideNone`
    in the planner's tree, `noList` in the shopping list. Removed: `GUIDE_MATERIALS_TEXT`,
    `PLAN_GUIDE_MATERIALS_TEXT`, `GUIDE_LIST_TEXT`, `NO_LIST_TEXT`, `NO_MATERIALS_TEXT` and the
    `tradeskill-guide-materials`, `tradeskill-plan-guide-materials` and
    `tradeskill-shopping-guide-list` elements. In the recipe panel `MaterialList` draws the gap
    line itself; `tradeskill-no-materials` is now a wrapper around it.
  - Home (owner asked whether the overview should be simpler; the page ran past one 860 px
    screen):
    - `homeDoors` (shared/tradeskillHome.ts): a tradeskill the log has shown has a tile with its
      level. The rest were a row of small buttons until 2026-11-22 (owner: they read as comments);
      each is now a full tile of the same grid, after Foraging, by name: `NOT_IN_LOG_TEXT` where
      the number goes (never 0, the level is unknown; a default awaiting the owner's word), "of N"
      only where `skillTop` knows one, an empty bar, no next recipe (`unseenFace`). Every door
      keeps `tradeskill-tile-<Tradeskill>` on an element holding a `button`, with `data-tile` =
      `seen` or `unseen`. No tradeskill seen: all twelve are such tiles and
      `NO_TRADESKILL_SEEN_LINE` is above, said only once the skills module is served.
    - Foraging is a tile of the same grid (`tradeskills-tiles`), after the tradeskills: level and
      "Found, Failed, Found rate" on one line (`data-value` on each). A click opens the session
      line, the items and the AA in `tradeskill-forage-detail`, a grid item spanning every column;
      closed until asked for, `eq.tradeskills.forageOpen`. `ForagingTile` must sit inside a grid.
    - "Make an item" is one row: heading (hover `PLAN_HOME_TIP`), search, count, and "Your plan"
      when there is one. Results open under it.
    - The era count beside the search is gone (Home and the planner screen): the header's count of
      hidden recipes is the one stated. `PlanChoices.eraHidden` is still computed.
  - Tests: `tradeskillRouteFaction.test.mts` (fixture) and the new
    `tradeskillRouteFactionData.test.mts` (committed data; split at the lint's file length),
    `tradeskillWiki.test.mts`, `tradeskillGuide.test.mts`, `tradeskillHome.test.mts`,
    `tradeskillGather.test.mts`.
  - e2e, changed and not run: `tradeskills.e2e.mts` (`stepHome`), `tradeskillHeldSteps.mts`,
    `tradeskillPlanSteps.mts`, `tradeskillFactionSteps.mts`, `tradeskillHomeSteps.mts`,
    `tradeskillGatherSteps.mts`. The faction step now reads the long list and the shopping list on
    the faction with the most recipes, which its pick step leaves up, because the default faction
    of Baking has one row.

### After the owner's first read of the built screens (2026-11-20, branch `tradeskill-tighten`)

- **Ingredient rows come in four leads.** `parseCraftRecipes` read only `::`. The 2026-11-20 cache
  also writes `**:` (37 pages, Fleeting Quiver), `***` (Ethira's Poison Antidote) and a bare
  `**1 x [[Item]]` (Shadow Silk, Robe of the Lost Circle). All four are read now. Before a recipe
  is called "none on the wiki", open its cached page: 17 of the 19 recipes the guide was "filling"
  were on the wiki all along (two are left: Distillate of Clarity VI, Tumpy Tonic).
- **Re-reading `craftedBy` without a scrape.** `items.json` was patched for 42 records only: each
  record with an empty-ingredient recipe was re-parsed from its cached page and replaced only
  where the page's recipe skeleton (tradeskill, trivial, container, yield) still equalled the
  stored one (DATA_REFRESH.md's offline rule). `npm run gen:data-weight` after any such patch, or
  the data-weight ledger test goes red.
- **A name does the line's own action.** `ItemLink`/`ItemLabel` take `act`: Home's "Your plan" and
  "Working towards" names open the plan, a "Next" name opens that workbench on that recipe
  (`rememberLinkedPick` then `show`), a recipe table row's name picks the row (a no-op `act`, so
  the click reaches the row). The hover card is unchanged. Names with no action of their own keep
  the Loot page. Do not add a second control beside a name that does the same thing.
- **The Loot page's "Plan this item"** is `TradeskillFocus.plan`: `useArrival` opens the workbench
  as for any link in, then the planner over it.
- **The plan says each thing once.** "What to gather" has no Where column ("What it takes" has
  it). `skillsAllMet` true and no route to show: "Where you stand" is `PlanStandLine` in the head
  and `ItemPlanSkills` is not drawn. A material whose wiki words include Bought lists two mobs
  (`dropCap`), others four.

### The held-materials route chains (2026-11-20, branch `route-held-chain`)

- `tradeskillRouteHeld.ts` no longer asks `onHand` per recipe. `tryCover` takes each material from
  one running count and, when the stock is short, makes it first with this tradeskill's own
  lowest-trivial recipe for it if that recipe's materials are held (one level deep). `coverOf`
  finds the most combines by doubling then halving. `take` commits what the step used and adds
  what it makes (`combines x yield`), so a later step can use it; that step's count says it rests
  on the steps above succeeding.
- Equals (same trivial, same cost) are named in the step's `aside`; between them the order is how
  many later recipes use the item (`feedCounter`), then the name.
- Not counted: what was made since the last inventory dump. Have is the dump or a newer depot
  line; a combine's output in the bags is in neither until the next `/outputfile inventory`.
- **A starred line is an ingredient only when a quantity follows it.** The first cut of the `**:`
  fix also took `:*See [[Patchwork Armor]]` as a material on five pages. The re-patch tool now
  compares every crafted record against a fresh parse of its cached page: after the fix, exactly
  those five differed and nothing else, which is the check to repeat after any parser change.
- A guide step no wiki recipe is joined to carries `guideMaterialsLine` in its `aside`. Its `why`
  says "No wiki item has this exact name": true for a missing page (Woven Mandrake) and for a
  guide's shorthand (Platinum ruby), so it never claims the wiki lacks a page.

### The plan buys first, folds, and keeps its columns (2026-11-20, branch `plan-buy-first`)

- Since 2026-11-21 a material with a recipe always opens; `PlanNode.bought` says the wiki's words, a
  guide's merchant (`soldByMerchant`) or the log (`PlanAsk.paid`) call it sold. The gather list and
  `treeRecipes` treat a bought node as a thing to get, so its recipe adds no material or skill. No
  make-or-get switch and no extra wording: the source line's "Bought" is the indicator (owner). Pass
  `paid` wherever a tree is built for the player, or Home's "Working towards" count and the plan
  disagree.
- A made item is out of era, over its own banner, when every recipe needs a Dropped-only material
  whose zones are all unopened (`eraDerive.recipeDropWall`, definitive). Do not widen it to foraged
  or bought materials: Clump of Dough lists every egg as alternatives, and Fine Plate molds are sold.
- Unfolded made materials are `PlanMemory.expanded`, by item key, so they survive a Back from a
  link out. A new item starts folded. "What to gather" reads the tree, not what is unfolded.
- `materialGrid.ts` is the one material table. Nesting goes in `nameCell(depth)` only; do not wrap
  nested rows in a margin, which is what pushed Need and Have out of line.

## Tradeskill guides as data (fork #6, requirements/skills-tab.md)

- Two community guides are pulled at release time by `scripts/community/guides-pull.mts` and
  committed as `src/main/data/tradeskillGuides.json` (types `src/shared/guideData.ts`). Procedure,
  rules and thresholds: DATA_REFRESH.md, "The two tradeskill guides". The app never fetches them.
- Read by the Tradeskills workbench ("Tradeskills section", slice 3). A screen that shows this
  data shows the guide's credit with it (owner, 2026-11-20: the app credits and links both); the
  workbench draws the credit line as text, with no link (the hosts are not on the allowlist).
- `leveling.tradeskills.<Tradeskill>`: `steps` and `alternates` (`from`, `to`, `item`, `materials`
  nested per sub-combine), `notes`, and `asides` (side tables as written). `recipes.tradeskills.
  <Tradeskill>.recipes`: `trivial`, `item`, `materials` with `merchant` + `zone` + `loc` only when
  the guide gives coordinates, else `sourceText`. Keys are `tradeskillOf` spellings.
- Names are the guides' own, loose spellings (`Gold jade`, `HQ cat pelt`, `Fresh Fresh`): join to
  `items.json` by a fold and expect misses; the pull lists them.
- `returned: true` is a tool the combine gives back (the sheet writes `(returned)`, the recipe book
  `(Reusable)`).
- Trap: the leveling guide's ranges overlap and skip (`179 - 196` then `192 - 202`); a recipe-book
  recipe may have no `trivial` (an item made inside another recipe's block) or a `tradeskill` other
  than its tab's. A step's upper bound may be text (`range: "189 - see side"`, no `to`).
- Trap: a remark sits at most 3 columns right of its name, a side table at least 4 (measured on the
  2026-11-20 sheet; `NOTE_REACH` in `guides/sheetGuide.ts`). A sheet that narrows that gap turns a
  side-table cell into a `note`: read the data diff after a pull.
- The data file is never edited by hand: `guides-pull.mts --offline` rewrites it from the last good
  copy, and `tests/guidesPull.test.mts` compares the two.

## Bug hunt 2026-11-19: the rules its fixes left in force

From the multi-model hunt of that day (`audits/2026-11-19-bug-hunt.md`). One block per feature area:
what a later change must know. Each fix has a unit test that failed before it.

### Damage and healing meters

- Healing header (Combat tab) is unlabelled, so it follows the scope and the healer drill:
  `healRows.healHeadline(panel, seg.healing)`, summed in `src/shared/healHeadline.ts` (in shared
  because summing domain rows in the renderer trips eqc/no-domain-munging). Level 1 hps is
  `healing.hps * shown / healing.total` (one clock, the segment's length); level 2 is the healer's
  own. Trap: the solo path is an identity check, `shown === healing.healers`, so anything that
  copies the healer array before `healPanel` loses the "engine's own figures" return.
- `SegmentHeader` takes the heal figures as its `healing` prop and never reads `seg.healing`; pinned
  in tests/healRows.test.mts and tests/overlayLockedSelector.test.mts. The overlay's heal crumb
  stays the whole segment, labelled `all` (JOS-158): do not route it through `healHeadline`.
- `SegmentPanel.SegmentBody` sits at the complexity ceiling (13). The heal headline rides on
  `Dimension.healing` and `headline(panel, dim, healing)` so it adds no branch there; a new ternary
  in that function fails lint.
- `meterScope.scopeHealers` now re-bases `pct` when it removes a row (new objects), and still
  returns the input array by reference when it removes none. `scopeHealing` still leaves `total` and
  `hps` on the model untouched: the headline is derived, not rewritten.
- The time beside a damage headline is `headlineClock.headlineClockSec(total, dps, durationSec)` on
  both the Combat tab header and the Overview card (`supportLine`). The card hides "active" only
  when it is BELOW the headline; the Combat tab's note also hides it when equal or when the fight
  had no idle gaps. That difference is deliberate: the Overview plan lists the active rate on the
  card's line.
- Level 1 copy: `formatSegmentText(seg, mode, selfLabel, shown)` where `shown` is `{ rows:
  panel.sources, ...head }` from the panel. A new caller that omits `shown` pastes the whole
  unscoped direction. The level 2 copy (`formatEntityText`) still prints the subject's own total
  above a table with the nested pet: pinned golden, owner's call to change.
- tests/combatCopyText.test.mts is near the 440-line ceiling; scope and layout copy tests live in
  tests/combatCopyScope.test.mts.
- The level-1 copy (`copyText.formatSegmentText`) takes the panel's own rows and headline
  (`ShownSources`, built in `SegmentPanel.copyView` from `panel.sources` and `head`). Never hand it
  the bare segment from the panel again: the paste must list what the list shows.
- One clock helper, three readers: `headlineClock.headlineClockSec(total, dps, durationSec)` is read
  by the Combat tab header (`SegmentHeader` `clockSec`), the Overview card (`supportLine`) and now
  the copy (`copyText.ownClockNote`). A surface that prints a headline rate beside a time must read
  the time there, never `seg.durationSec` directly.
- Copy rule: the first line always carries the fight's length (`subjectLine`). The rate gains ` over
  m:ss` only for the outgoing direction and only when the headline's clock, as formatted, is not
  that length (the You scope). The active rate follows it: `529 dps over 1:16 (act 575 dps)`. Trap:
  do not key this on "the view differs from the whole segment"; Group hiding a stranger scales total
  and rate together, the clock is still the fight's, and a second identical time would be printed.
- Trap: the Incoming header uses `seg.durationSec` as its clock, not total / rate, so the note is
  off for `mode === 'in'`. The Incoming golden's fixture (3.2k at 39 dps over 1:23) would print a
  wrong `over 1:22` if that guard were dropped; that golden is what catches it.
- Still open: the drilled copy (`formatEntityText`) prints the row's own total and own-clock rate
  under the fight's length, and with the pet nested its headline is the subject alone while the
  table includes the pet. The header at that level prints subject plus nested pets
  (`petRows.panelTotals` / `panelRate`). Fix by passing the header's figures in, as level 1 does.

### Gear: the Void motes tab

- Void motes empty state: the rule is `moteEmptyText` (`gear/voidMotePrefs.ts`), not the panel. It
  needs BOTH reads: the gear index (`indexReady` / `indexRefused` props from `useGearIndex`, plus
  `hasRows` = `byKey.size > 0`) and the inventory. TRAP: `compare.ready` is the INVENTORY's
  readiness only; with the index still loading `byKey` is empty, every worn item is skipped, and the
  list is empty for a reason that is not "all +10". The "+10" sentence may be returned only from the
  last branch.
- The two index flags are panel props on purpose, not fields of `GearCompareData`: that object is a
  memoised prop of the Gear table's rows and must not change shape for this tab.
- Worn items with no gear-index row: `moteUnranked` (`shared/planner/voidMotes.ts`) lists them
  (below +10 only) and the panel prints `moteUnrankedText` under the list (`gear-motes-unranked`).
  `moteAdvice` / `motePlan` still leave them out. TRAP: `moteUnranked` returns none when `byKey` is
  empty, otherwise a loading or unread index would name every worn item as "not in the item data".
- Proc socket rule has ONE copy: `procSeatSwings` in `shared/planner/rules.ts` (PRIMARY or
  SECONDARY; an Any Slot cell is null and not live). `socketRecommend.seatIsLive` and `moteAdvice`
  both read it; the reasoning and what would overturn the ruling stay in `seatIsLive`'s header.
  TRAP: `moteAdvice` must ask the CELL (`equipSlotOf(host.slot)`), never `wornSlot(w)`, which falls
  back to the item's own first slot and would call an off-hand item in an Any Slot cell a weapon
  hand.
- `MoteAdvice.opens` is omitted for a Proc socket off a weapon hand (the game does open one there;
  the app just does not point at it). If the owner would rather keep the fact visible, word it in
  the panel instead of restoring `opens`.
- 2026-11-23: `SUPPLY.lockoutRerunsPerWeek` (6) and `lockoutRerunDrops` (1) apply to `RERUN_BOSSES` only (Lord Nagafen, Lady Vox, Cazic-Thule, Innoruuk, Master Yael). `RERUN_FAVOURS` gives Slime Blood 8/9 on Fear miniboss later kills (9 kills, Oct 15-29). `distinctMobs` folds dropper names by `mobKey`. `MotePlanStep.why` is the only input to the reasoning lines. `onHand` lives in `eq.gear.motes`.

### Maps and the pins overlay

- zonePorts.ts DESTINATION: the coordinates may be bare, absent, or in parentheses. Combine Gate is
  the only parenthesised row in the corpus (2026-11-19). A new wiki spelling of a port line drops
  the spell silently; the trap shows as a missing cheapest level on a chip, not an error.
- Map pins overlay extent: always go through `overlayExtent` (mapTrack.ts), never `data.bounds`
  directly. `usableExtent` rejects only when BOTH axes have no span; a one-line map (one axis zero)
  must keep fitting. `readExtent` (stored extents) is stricter and rejects either axis, so a
  one-line zone has no stored fallback.
- `fitExtent` floors the DIVISION at one map unit but keeps the real span for width/height, so a
  one-line map still centres as before. Do not floor width/height.
- Saved overlay views (`eq.maps.overlayView`) are read through `parseOverlayViews`: k > 0 and finite
  k/cx/cy, dropped entry by entry.
- The overlay's map answer is held with the zone it was ASKED for (mapPinsNote.ts `heldMapFor`). Do
  not compare against `MapData.zone`: main folds the name before loading and a spelling apart would
  blank the map for good. Keyed by zone only, so a pack change in the same zone keeps the old lines
  until the new ones land (intended).
- `emptyNote` says nothing while `loading`; "No map for this zone" is only true once this zone's
  answer is in. While loading, pins draw through the zone's stored extent with no lines.
- Checked and not a defect: `useZoneTrack` stores `data.bounds` under `data.zone` (both from the
  same MapData), so the Maps tab cannot store one zone's bounds under another while it loads.

### Achievements and Factions

- Achievements, level text: `slayerPlan.ts LEVEL_RE` joins two levels on a hyphen, en dash, em dash,
  tilde, slash or `to`. A comma or a bracket is NOT a join on purpose (`4-6, ~12`, `35 (1-10
  according to Magelo)`): only the opening of the text is read. Trap: `~53` and `28~` are one level,
  not a range.
- Achievements, est. chip: the tooltip text is `estimateNote(PlanMob)` in
  `shared/slayer/slayerPlan.ts`, never inline in ZoneList. The chip shows exactly when
  `estimateNote` is not null (basis 'name'). `SlayerMob.yieldedRace` (wiki race as written) is set
  in `slayerMobs` via `slayerMatch.raceYields`; `PlanMob.yielded { race, kind }` only on a name-read
  row whose race yielded. Trap: do not put the flag on `MobFacts`, tests/slayerYield.test.mts
  deepEquals the drake's facts.
- Factions, Moved recently: the recent tally is `factionsEvidence.ts recentWithLedgers` (live tail
  plus the archive ledgers, under `ledgerWindow` with `recentFromMs - 1` because the window keeps
  `ts > sinceMs` and the tally wants `ts >= recentFromMs`). The tail-null branch (log just archived)
  returns `recent` too. Trap: a ledger keeps a run of one cap line as one entry, so a cap run is one
  hit in the tally (net is exact).
- Factions, the dump's own second: a faction line stamped in the dump mtime's second counts only
  when it comes after the game's `Outputfile Complete: ...-Factions.txt` line of that same second;
  with no such line the second is left out (undercount side, never a double count). Do not change
  `ts > sinceMs` to `>=`. `ledgerWindow` keeps the plain exclusion: a ledger has no line order
  against the dump. Not measured: that `/outputfile faction` prints the receipt line (inventory and
  achievements dumps do); if it does not, behaviour is as before.
- Suggested edit for docs/community/requirements/faction-tab.md (not made here, docs are off
  limits): the 2026-10-13 Moved recently row's built note should say the window reads the live log
  tail and an archive's ledgers. Suggested new row: | 2026-11-19 | owner (the bug hunt of that day)
  | Moved recently went empty after the log was archived, and a faction hit logged in the dump's own
  second was dropped. | built (the recent tally reads the archive ledgers too, also when the live
  log is empty or not yet recreated; a hit after the game's Outputfile Complete line in the dump's
  second is counted, otherwise that second stays left out) |

### Spells and Loadout

- The client spell table is loaded once per `spells_us.txt` PATH, not once per run:
  `resist/spellTableMemo.ts` (Electron-free, tested) reloads when `spellsUsPath()` differs from the
  path it loaded from. `spellTable.ts` only binds it. Trap: `spellTable()` can now resolve a table,
  then null (folder moved to one with no file), then a table again; do not capture the table or
  assume it never becomes null.
- No reload on a patch to the same file (by design: restart). A reload never starts while one is in
  flight.
- `spellTableStatus()` reports `loading` while the memo is stale, so state and path always describe
  the same folder. Every status reader also calls `spellTable()`, which is what starts the reload; a
  new reader must do the same.
- `buildLevelUnlocks` caches per table reference (`cachedClient`): a different table rebuilds, a
  null read keeps the last fold (tests C4, C4b).
- Renderer: the unlock dataset is held by `shared/heldPull.ts` and dropped on `eqconfig:changed`;
  `useLoadoutViews` refetches on the same event. A new once-per-window pull of anything built from
  the client table needs the same signal. Open: `useZoneTravel.allPorts` (maps) still holds its
  first answer.
- Renderer modules that import `@shared/...` at runtime cannot be loaded by node tests: put the rule
  in `src/shared` (relative imports) and test that.
- Loadout class pins are per character under `eq.spells.loadout.classes.byCharacter`
  (`OwnClassPins`: name to classes, `'*'` with no character, an empty list means follow detection).
  `eq.spells.loadout.classes` is the older single pin: read-only fallback, never written, shape
  unchanged. The group (`eq.spells.party`) is one per machine by decision.
- spellTableMemo.table(): an ask made while a load is in flight gets a CHAINED promise that
  re-checks the path when the load settles (`pending !== mine || stale()`), then recurses into
  table(). Do not return the bare in-flight promise again: the renderer's heldPull re-pulls once per
  eqconfig:changed and is never signalled a second time, so a stale answer there lasts all session.
- Trap: `stale()` alone is not enough in that re-check. `spellTableIsStale` is false while state is
  'loading', so once the first waiter has started the new load every later waiter reads "not stale"
  and would keep the old folder's table. The `pending !== mine` comparison is what catches them.
  tests/spellTableMemo.test.mts holds two waiters for this reason; keep both.
- Promise identity: only a SETTLED, unmoved table is returned as the same promise object. Callers
  must not compare promises from table() while a load is running.
- The caller that STARTS a load still gets that load's own table even if the folder moves meanwhile.
  That is safe only because heldPull drops an overtaken pull and main-side readers reload on their
  next ask. A new once-per-window consumer that is not behind heldPull would need the same re-check.
- Still one load at a time (two would race for spell-resist-cache.json): the re-check starts the new
  load only after the old one settles.
- 2026-11-23: the client's spell files come from `resist/spellFiles.ts` (engine twin `engined/src/spell_files.rs`): `spells_us.txt`, else the first other `spells_<suffix>.txt`, with matching `_str`/`dbstr` falling back to `_us`. `SpellTableNotice` wraps the Spells views; channel `spells:tableReport`.

### Settings stores and the session

- Settings recovery notice: `store.ts` exports `schemaMigration`; `shared/settingsRecovery.ts
  settingsRecoveryNotice()` is the only place the words live. "Recovered" means `salvagedFrom` set
  AND `wrote` true; a salvage that could not be written back is a reset (the app is on defaults).
  Trap: do not key on `fileMissing`, a failed migrated write leaves it false.
- The notice waits in the optional store key `pendingSettingsNotice` (`holdRecoveryNotice`,
  `main/ipc/settingsRecovery.ts`) until the player presses OK; a fresh recovery replaces it. Older
  builds ignore the key.
- The card sits top centre under the title bar on purpose: the bottom edge belongs to the
  what's-new strip, and bottom right belongs to the switch nudge and toasts.
- `salvagedBackup.savedAtMs` is the backup file's mtime and is optional: a stat failure must never
  cost the restore (`storeFile.ts backupFacts`).
- Quarantine: `tornJson.ts quarantineSlots()` gives five names; `quarantineStore` takes the first
  free one and reuses the LAST when full, never the first. `quarantinePathFor` is still the first
  slot. Trap: `renameSync` replaces an existing file on Windows. The resist ledger
  (`resist/ledgerFile.ts`) takes the first free slot too: it holds other characters' learned
  resists, which no log on this PC can re-derive.
- Launch pick: `log/discovery.ts savedLogHonoured` is the rule. The under-the-folder check applies
  only when the player chose the EQ folder (a non-blank `eqInstallDir`) and not under `EQ_LOG_PATH`.
  With no chosen folder the saved log is kept on existence alone: it rescues a launch where
  auto-discovery misses, so do not make the check unconditional.
- `clearActiveLogPath()` runs only in `applyEqDirChange`'s no-character arm (a player's own folder
  change). The idle rescan saves the pick again on attach.
- Quiet switch: `lastLineAt` has two feeders now, the engine's cursors (`noteTailLine`) and the
  attached log's own size (`switchNudge.ts hearFromFile`). A cursor can miss writes (engine down),
  so it makes a log look quiet sooner, never later. Trap: only a sample taken at or after
  `lastLineAt` is evidence (`attachedWroteSince`); comparing against any remembered size delays
  every normal offer by about a minute. Size is used, not mtime.
- `switchNudge.ts` cannot be loaded in node:test (it imports Electron); `tests/quietSwitch.test.mts
  bindingPoll` mirrors `poll()` and must be kept in step with it.
- A new preload module must be listed in `tsconfig.web.json` or typecheck fails with TS6307;
  `preload/index.ts` has room under the 440 ceiling for small additions.

### Updates

- Switch off means no request the player did not ask for. schedule() returns early for every phase;
  do not add a forced check (the remembered build and the interrupted retry both stop short of this
  on purpose).
- A downloaded build is remembered in the store key updateStagedVersion and rides on the status as
  stagedVersion. 'ready' itself is still never persisted: only a check in this session can bring it
  back. Clear points: this build is that version or newer (launch), update-not-available,
  update-available naming another version, any failed download.
- Trap: a 'download' step error always means nothing valid is staged (electron-updater only
  downloads when the cached file fails validation, and clears the pending folder on failure).
- Trap: electron-updater adds its quit handler only when a download resolves while
  autoInstallOnAppQuit is true. Setting the flag later is not enough; rearmApplyOnQuit() re-resolves
  the cached file through downloadUpdate(). Keep 'downloading' unset there: the latch picks the
  failing step from it.
- Trap: the download runs after its check has returned, so runCheck's caller has already re-armed
  the poll. Anything that should change the next delay after a download ends must re-arm from the
  event handler (retrySoon), not rely on consecutiveFailures being read later: update-available
  resets it first.
- Trap: never re-arm with a fixed schedule('periodic') after runCheck; use
  checkFollowUpPhase(status, interruptedInARow), or an interrupted check's short retry is
  overwritten by a 4 hour wait.
- An interruption is still not a failure: no checkDone, no consecutiveFailures, failed:false on the
  line. It is marked with status.interrupted ('check' | 'download'), which the next push drops.
- The words live in src/shared/update.ts (updateChipLine, updatePrefsChip, autoUpdateCaption,
  readyChipTip). The Preferences chip may say 'up to date' only when a check completed with nothing
  newer: switch on, or inside the cooldown after a manual check.
- The first-launch copy lives in src/main/userDataSeed.ts and must keep importing only fs and path
  (channel.ts is the first import). A new entry added to SEED_ENTRIES later needs its own late copy
  in topUpSeed and its own toppedUp mark, or installs already seeded never get it.
- The seed stamp migrated-from.json gained a toppedUp list; the store gained the optional key
  updateStagedVersion and UpdateStatus gained stagedVersion and interrupted. All additive, no schema
  bump.
- The imported-sounds fix belongs to the 2026-10-08 'keeping settings' row in test-neutering.md;
  that file may want its own row. RELEASING.md's sentence about what the copy carries should name
  the imported sounds (text under not_fixed).

### Overlay windows

- Re-placing an OPEN overlay has one door: `overlayBounds.ts` `replaceOverlay(kind)` (monitor change
  and Recover key via `reconcileOverlayDisplays`, text-size change via `refitStripsForTextScale`).
  Trap: `overlayAppliedBounds` returns the stored PLACEHOLDER height for a fit kind (con card, 220);
  never hand it straight to `applyOverlayBounds` on a live window. The app's own move is marked as
  applied, so the move handler does not re-fit, and the overlay sends no new height while its card
  measures the same. `placedOverlayBounds` (overlayLayout.ts) keeps the worn height; `refitOverlay`
  then clamps the last request to the new work area.
- Showing a hidden overlay from anywhere but its own queue must ask `windows.ts`
  `opaqueStripResting(kind)` first (rule: `overlayLayout.ts` `opaqueStripRests`; absent idle reads
  as resting). `raiseOverlays` and `setOverlaysHidden` do. E2E is NOT part of the rule: each call
  site keeps its own E2E check. `createOverlayWindow`'s existing-window `show()` is unguarded but
  unreachable today (toggle only opens a closed kind); guard it if a caller ever opens an open kind.
  `raiseOverlays` still returns and logs every open kind, including a skipped resting strip.
- Recover hotkey state lives in `shared/overlayHotkey.ts` `makeRecoverHotkey(ports)`;
  `main/overlayRecover.ts` only supplies `globalShortcut` and the store (still the one
  `globalShortcut` file, one `register(` call; `tests/overlayHotkey.test.mts` pins both, and the
  factory file must not name `globalShortcut` in code). A saved key refused at start stays saved and
  off; `get` carries the reason (existing optional `message` field, no protocol change) until a key
  is set or turned off. The reason text is in src/shared, so the em-dash guard covers it. Not built:
  a way to forget a refused saved key from Preferences without setting another key first ('Turn off'
  is hidden while the key is null).

### Loot

- lib/itemMarks.ts: a null in `marks` means two things, "asked, answer on its way" and "answered,
  unknown". The `unsettled` set tells them apart. Write the placeholder only through `hold(name)`,
  and let only `settle()` clear it: a null written any other way reads as "unknown" to a probe.
- `fetchItemMarks(names)` resolves when EVERY name has its answer, whoever asked (a row's 30 ms
  batch or another probe), not when its own IPC lands. It sends only names nobody has asked for.
  Trap: do not bring back the early return on "nothing missing"; that was the bug (a Loot row's
  effect runs before LootView's probe in one commit, the probe read the row's placeholder as not
  notable, and useNotablePickups never asks a key twice per mount).
- `settle()` runs on both the success and the failure path of every ask. Keep it that way: a name
  left in `unsettled` makes every later `fetchItemMarks` for it wait forever.
- `requestItemMarks(name)` is the row's ask as a plain function (`useItemMarks` calls it in its
  effect). It exists so a test can run a row's ask before a probe: tests/hookHost.mts has no
  `useSyncExternalStore`, so `useItemMarks` itself cannot be mounted there.
- The marks store is module-global and remembers every name for the run: each test uses item names
  no other test in the file touches.
- 2026-11-23: Group by item is per character: `eq.loot.groupByItem.byCharacter` (shared/characterFlags.ts). Wiki Gaps grouping stays app-wide.

### Log archive

- Capture: `captureSegment(deps, expected)` refuses when the attached character is not the one the
  caller read before its wait, at the start and after its last read. TRAP: keep zero awaits between
  the capture's return and `renameSync` inside `rotateLog` (rotateNow), or a switch can slip in
  again.
- Put back (rotate.ts `restoreLog`) is resumable; a try that stops is finished by the next. Scratch
  names: `<id>.restoring.partial` (unverified unpack, swept at launch by `sweepTemp`),
  `<id>.restoring` (verified archive plus joined pieces), `<id>.<length>.part` (a set-aside piece;
  the number is the joined file's length before it, so a half-added copy is cut off and re-added).
- TRAPS: never open an existing `.restoring` for writing and never rename onto a `.part` (each can
  be the only copy of the lines since the archive). Never sweep `.restoring` or `.part` at launch: a
  `.restoring` that is a second name (hard link) of the live log is how a try killed after the link
  is recognised; without it a second Put back would join the archive twice. After the link succeeds
  nothing may be reported as a failure.
- An older version's `<id>.part` (no length) and a `.restoring` that does not begin with the archive
  are refused by name and left alone.
- `putBackUnfinished` (preflight) blocks a new archive while the NEWEST sealed archive has scratch
  files: only that archive's Put back joins them, and it must stay newest to keep its button.
- A put-back log is not auto-archived (`autoArchiveDue`). Nothing is stored for this: it is derived,
  live log begins with an archive of this character in state `backed-up` (`putBackInLive`). TRAP:
  anything else that leaves a `backed-up` record whose bytes head the live log (the trial-only Back
  up) pauses the automatic archive the same way; a new state or a cleanup of `backed-up` records
  must keep this rule working. Owner has not yet confirmed the pause.
- The reason an interrupted archive could not be finished is kept in memory only (`notFinished` in
  actions.ts), set by the launch recovery and by an archive that stops after the move. Not in the
  journal: the journal format is unchanged.
- `archivePath` in a record can be stale after the game folder moves. Read it through
  segmentStore.ts `resolveArchivePath(dir, segment)`; refresh and put back write the corrected path.
  `stageSegmentLog` still checks the path it is handed.
- "One archive per run" is per character and has one source: engineBuckets.ts `movedThisRun` via
  `wasMovedThisRun`. Do not clear an entry on re-attach unless the bucket rule (`settle`/`take`
  skip) is changed with it.
- Put back (rotate.ts restoreLog) probes the drive for hard links BEFORE any live line moves:
  probeLink links the unpacked <id>.restoring to <id>.restoring.link.partial and removes it. Keep
  the probe ahead of joinAndLink; exFAT and FAT32 refuse every link (libuv reports EISDIR, not
  EEXIST), and without the probe each press moves the live log into a join that can never get the
  log's name.
- The probe goes through the RestoreIo.link test seam. A test that wants a stop AFTER the join must
  refuse only the link whose target is the log path; link: refused(code) for every call now stops at
  the probe with 'Nothing has changed'.
- The probe's name ends .partial so the launch sweep (backup.ts sweepTemp) removes one left by a
  kill. It is only ever a second name of the joined file. Never give a file that holds the only copy
  of log lines a .partial name: the sweep deletes it.
- stopped() advises 'press Put back again' only when a second press can finish. After NoLink (the
  probe refused) it never does: it says nothing changed, or, where an earlier version left lines in
  <id>.restoring or a .part, it names the files and says to move them somewhere safe before Archive
  now. Those leftovers are never removed by the app.
- The probe links inside the archive folder, not the game's Logs folder. That is enough while the
  archive folder is <Logs>/companion-archive on the same volume; a refusal of the final link after a
  passing probe is treated as passing and keeps the retry advice.
- Capture test trap (tests/logArchiveRotate.test.mts): captureSegment asks attached() twice before
  its first engine read (its own read, then the start check). A stub meant to switch character
  during the reads must answer the first character for two asks, or the start check refuses and the
  post-read check (capture.ts, after historyIfStill) is never exercised.
- 2026-11-23: an archive that cannot be finished is undone at launch: the moved log is joined back in front of the live one (journal step `returning`), never archived half-joined; a sealed archive is never undone; a leftover `.moving` file refuses a new archive.
- 2026-11-23: Put back and the recovery share `joinLive.ts`: a hard link, else a copy created exclusively at the log's name (`COPYFILE_EXCL`). Nothing writes onto the log's name with an operation that can replace a file. A file id of 0 is never trusted as the same file.

### Engine: combat crediting

- **Closure runs on every event.** `ingest_event` calls `eval_closure(st, ev.ts())` once, after the
  three sweeps and before routing. Do not add per-arm calls again and do not gate it on kind: a
  replay has no meter reads, so any line booked before closure lands in a fight that has ended and
  the replay disagrees with the live tail. `engine/crates/fold/tests/replay_matches_live.rs` folds
  the same lines live and replayed and compares the fight list, zone sessions and every scope; add a
  case there for any new line kind that books into a fight.
- Trap: an `other` or ally-pet row does not extend a fight. A fight whose only later swings are an
  unbound pet's closes 20 s (PRESENCE_GONE_MS) after your last line; the pet's later swings are in
  the zone stay only.
- **`self_clock` has two writers:** a row door (`stamp_self`) and `Agg::move_out` when a row enters
  the You scope (a pet claim). `OwnClock` keeps finished in-fight spans by fight (`done`) so `merge`
  counts one fight's two clocks as their hull once, open or finished. Spans outside any fight (fight
  0) are hulled only when within 60 s of each other, else added.
- `rekey_other` still does not move rows inside past zone sessions (`zone_history`), only the live
  stay, the open fight and the fight history.
- **Zone stay drop rule:** `finalize_zone_session` drops a stay when `Agg::nothing_of_ours()` (no
  incoming row, no outgoing row but `Other` / `AllyPet`). Do not gate on `zone_start_ts == 0`: a
  fall-only or miss-only stay has start 0 and is kept, so a death recap stays with its own stay.
- **Ally binds at a zone line:** a `Summon` bind crosses, and so does a `defaulted` bind (leader
  line, no charm broadcast ever, no summon seen) whose pet name is player-shaped. It stays `Charm`:
  hold clock and swing-at-a-friendly ending still apply, and a charm broadcast clears `defaulted`.
  Every bind the zone line ends is logged ("charm ended at the zone line"). MEASURED.md's "a charm
  bind drops on every zone line" is now true only for binds with charm evidence or a mob-shaped
  name.
- Open, owner to rule: (1) the zone overall Everyone headline divides bystanders' out-of-fight
  damage by your own fight time; the renderer derives Group and Everyone rates as `dps * kept /
  total`, so an engine-only change to the divisor or the numerator breaks another figure. (2) The
  repeated hour of the autumn clock change: `Fold::last_ts()` is the maximum stamp, not the latest,
  so a live `now` correction built on it holds a pre-change fight open. (3) `routing.rs both()`
  still stamps the zone clock with the open fight's counter when that fight is stale; reachable only
  under a refreshed mez with no damage for a minute.
- Any replay golden recorded before this change (`oracle:rust-fold`; the fixtures are not in the
  repo) will differ by design wherever a non-damage line followed a finished fight.
- Housekeeping from this run: I used `git stash` once in the worktree to see a test fail without its
  fix and popped it at once. The stash list is shared with the main clone; the owner's two entries
  are intact.
- 2026-11-23: an own mez still on a mob (`Encounter::mez_on`, name key to bound) vetoes the idle fallback and the death-close until its wear-off line, its death or `MEZ_HOLD_MAX_MS` (180 s); roots do not count.
- 2026-11-23: the record-everything defender test is `friendly_person`, NOT `ally_friendly`: the ally caster set holds every player-shaped caster, and a proper-named mob casts (`Undertow begins casting`), so every unlearned group-mate hit on it was dropped. `ally_friendly` stays on the charm-break proof only.
- 2026-11-23: a mob's swing at you (hit or miss), at a member, your pet or a member's bound pet engages it in the open fight (`state.rs engage_swing_at_ours`); it never opens a fight or moves a clock. Accepting an invite admits the inviter (roster `accepted`, `ACCEPT_JOIN_MS` 30 s). The 20 s presence rule stays: mob pets vanish with no death line.

### Alerts

- Early warning, break family: `advance_breaks` marks a watch `spoken` BEFORE anyone knows whether
  the warning sounds. Whoever delivers a due warning must call
  `EarlyWarnings::release_break(due.break_key)` when nothing fired (cooldown swallowed it, def
  gone), or that hold's break line is suppressed as "already warned" and the mob gets neither sound.
  Law: a warning that made no sound spends no break. The swallowed warning is dropped, not retried
  later (the cooldown means drop, not defer).
- `fireToFiring` resolves an engine fire by NAME among ENABLED defs only (the engine never compiles
  a disabled def). Trap still open: two enabled alerts with one name and one sound resolve to the
  first; phrase, banner, colour and volume all come off the resolved def. The fix is `alertId` on
  the fire frame (protocol change), not a guess in the app.
- Banner line ids come from `makeAlertBannerIds()` (`src/shared/alertBanner.ts`):
  `<alertId>:<ts>:<count>`. The card queue REPLACES a line whose id repeats, so never build a banner
  id from the alert and the clock alone: two firings in one synchronous loop share a millisecond.
- A seeded app-signal alert that can fire for several things at once (Bazaar, respawn) seeds
  `cooldownMs: 0`; the 2 s default drops the second firing before the voice AND the banner
  (`fireAppSignal` gates before `playAlertNow`). The feature must then fire each thing once itself.
- Bazaar seed: `withBazaarCooldown` runs on every `getAlerts()` read and sets 0 only where
  'bazaar-watch' has NO cooldown key. It relies on the alert editor always writing `cooldownMs` on
  save (`defFromForm`). If the editor ever omits the key at its default, this would overwrite a
  player's choice: add a stamp first.
- Cooldown is whole milliseconds everywhere: `src/shared/alertCooldown.ts` (`normalizeCooldownMs`,
  `cooldownFromInput`, `sanitizeCooldownMs`, `cooldownOver`, `DEFAULT_COOLDOWN_MS`) and the engine's
  `cooldown_ms_of` round the same way (half up, floor 0, default 2000 only when no finite number).
  Change one, change the other. Do not read a stored number with `as_i64` in the engine: a float
  reads as absent. No upper clamp on save (share import still clamps to 600000 in `shareSchema.ts`,
  its own copy).
- New test seams: `withBazaarAlert` / `seedBazaarAlertOnce` take the sound-ref step as a parameter,
  like the respawn seed, so they test without Electron.

### Respawn timers

- Shared-name floor across the archive join. Law: `mergeRespawn.ts withFloor` reads BOTH sides' rows
  of a mob today's list marks shared over `RESPAWN_SHARED_NAME_FLOOR_MS` before `mergeRows`
  (`aboveFloor`). A row with `sharedName: true` is trusted as the engine's; any other is re-read
  from that side's `learned` gaps (same key, same `zoneBase`) and its own `gapsMs`; samples = the
  larger count, never the sum; an `agreedMs` under the floor is dropped; the row is flagged
  `sharedName` so the next join in a several-archive fold trusts it. Trap: history rows
  (`respawnHistory`) are read with bare watches and every segment older than 2026-11-09 is
  unfloored, so never min() an archived bound into a shared-name row without this step. Trap:
  `gapsMs` is left unfiltered on purpose, as the engine leaves it. Limit: a segment with no
  `learned` list has only the row's six newest gaps, so its clock can read longer, never under the
  floor.
- Seen, not changed: a row captured while the switch was on stays floored and flagged after the
  switch is turned off; as an archived-only row it still reads "over 10 min".
- Edit dialog. Law: Save writes only what was typed (`shared/respawnEdit.ts
  respawnDraftToSave(typed, inForce)`); `typed` is null until the field is typed in and on each
  opening, and text equal to the number in force is not an edit. The same number typed another way
  (`525` for `8m 45s`) is saved on purpose: that is how a player pins the calculated number. Trap:
  do not go back to a draft prefilled into state; the untouched field must follow the row, because
  the shared-name switch writes on the click and moves the estimate while the dialog is open. The
  2026-11-09 sentence "Save is disabled while the row has no number" is now "Save is disabled until
  a number is typed"; the button beside it reads Close (test id still `respawn-edit-cancel`).
  `RESPAWN_INPUT_HELP` no longer mentions an empty field.
- Row cap. Law: `RESPAWN_MAX_ROWS` (60) counts only rows of zones other than the one the player
  stands in; every row of the standing zone (by `zone_base`, each tier and instance) is published
  (`respawn.rs collect`) and kept by the join (`mergeRespawn.ts capRows`). So `rows` can be longer
  than 60. Trap: `withHistoryRows` puts an in-memory `liveZone` on each archived state so an
  archive-to-archive join keeps today's zone, not the zone that archive ended in; the final join
  spreads the live state, so the field never reaches the renderer and is never written to a segment.
  Trap: `main/logArchive/respawnHistory.ts readBatch` still splits a batch at 60 rows; that stays
  sound (a cut read always has at least 60 rows) but its header's "60-row page" now means 60 rows of
  other zones plus the standing zone's. Open: no count of other-zone rows left out (needs a snapshot
  shape change); with a blank live zone and three or more archives an older archive's standing-zone
  row can still be cut.

### Wiki Gaps

- 2026-11-19 (bug hunt, wiki-gaps). `mergeGaps.ts mergeRow` now has three rules, not one. (a) Served
  fields (`itemsSold`, `greeting`, `role`, `questFacts`) take the newer side, and the newer side's
  absence is not a removal. (b) `suggest`, `zoneTitled`, `viaRedirect` take the newer side even when
  absent. (c) `maybePlayer` stands only when BOTH sides say it: a row without it is that log's
  proof. Trap: a side folded before `maybePlayer` existed would clear a live flag; the running app
  refolds, so not seen in practice.
- Kill-faction amount across a join: the engine serves `adjusts: [[amount, count]]` (most stated
  first, tie to the larger hit, `gaps_trade.rs Pair::stated`) and `joinKillFaction` adds the counts.
  A side without `adjusts` (an older save or segment) weighs its one `adjust` by its kills `n`,
  which counts capped lines too. Trap: an old save of many capped kills and one clipped hit can
  outvote a new log until that character is attached again. Never go back to "newer side wins".
- All characters join: `inputs[0]` is the attached character. It is joined FIRST (its spelling,
  kinds order and first `/loc` point lead; `locFinder` reads `points[0]`) and its served fields are
  joined once more at the END with emptied tallies (`servedOnly`), so its reading stands as the live
  fold's does over its archive. Do not "simplify" this to folding it last: that changes the row's
  name, kinds order and the loc a soldby row prints. Still open: between two other characters the
  one joined last wins those fields.
- `otherInputs` re-check: only a plain unknown-name Mobs row closes when the catalog knows the name
  (`closedByCatalog`). A row with `questGaps`, `viaRedirect` or `zoneTitled` is about a name the
  wiki already has, so the name test must never see it. Any new kind of Mobs row for a KNOWN name
  has to be added to that exemption.
- `details.sales` entries are ONE item's price: the loot line's coin covers the stack (fixtures
  w21-stacked.log: Spider Silk 1 for 143c, 2 for 286c, 4 for 572c) and `coin_each` divides by the
  event's `count`; a coin that does not divide adds no entry. `salesCopper` is still the total. A
  save or segment folded before this still holds stack totals among its entries until refolded.
  MEASURED.md "Instant sale on loot" should gain one line: stack total = quantity x the single
  price. Not checked: whether `progression_ledger.rs` reads the same clause as one item.
- `details.cons` carries `all` (every reading by name) like `zones`; a page's `level` reads it
  (`wikiPage.ts conLevels`), with the entries as the fallback for an older save. `gaps_stock.rs
  cons_of` serves it for a Merchants row too. `sources` has no `all`: an item's soldby rows can
  still miss a ninth vendor.
- All characters read: a failure is its own state (`shared/gapsOthersLine.ts otherAnswer`), never an
  empty list. The words on the line and the count line's tail live there with their tests;
  `AllCharactersControls.tsx` only prints them. `othersGaps` catches one character whose state will
  not join and names it `unreadable`; a folder that cannot be listed still rejects the whole read,
  and the tab says so.
- Gaps saves: one attempt is `main/gapsCharacterSave.ts gapsSaver`, electron-free and unit tested.
  `takeMoved` is taken first and `restoreMoved` puts it back when the attempt did not land. Do not
  move `takeMoved` after the write: cursors that move during the save would be lost.
- OPEN: no save on a character switch or on quit, and both timers count from launch. Another
  character's rows can be up to ten minutes behind, and a character left before its first save is
  absent until attached again. The fix needs a pre-switch hook in `session.ts tailCharacter` and a
  bounded save in the quit path of `index.ts`. The tooltip's save time is the only sign for now.
- `gaps_tests.rs` is at its factoring ceiling: new details tests go in `gaps_details_tests.rs`.
- All characters, saved rows about a page the wiki HAS (quest giver `questGaps`, redirect
  `viaRedirect`, zone-titled `zoneTitled`): the catalog knows their names by design, so no "is this
  name known" test may close them. `gapsRecheckPages.ts aboutKnownPage` is the ONE predicate; main
  (`gapsRecheck.ts withoutNowKnown`) and the tab (`gapsAllCharacters.ts otherInputs`) both use it.
  Trap: main filters first, so a fix or a test at `otherInputs` alone proves nothing; test
  `withoutNowKnown` with a `known()` that returns true.
- The same name test in main covers Items too (`inItemDb` indexes `otherNames`), so an Items
  redirect row needs the same exemption; it has it.
- What these rows state is read off the wiki data, not the log, and a saved row is as old as its
  save. `knownPageRowNow` serves one only as far as TODAY's catalogs still say it: quest giver =
  saved quests still given by that NPC (quests.json `giver`) and still absent from the page's
  `relatedQuests` (a TS port of `gap_index.rs mob_quest_gaps_of`: change one, change the other),
  never adds a quest, none left closes the row; redirect = name still reaches the same page only
  through `otherNames`; zone-titled = `zoneTitledPage(row)` still absent. Unconfirmed means left out
  until that character's next attach. Copy on a quest-giver row is the bullets the page lacks, so
  this check is what keeps Copy true.
- Limit: a zone-titled row is NOT closed by a plain page added since (that needs the engine's loose
  name and zone folds); it waits for the next attach.
- `withoutNowKnown(gaps, known, pages)` takes today's catalogs as a required third argument;
  `main/gapsToday.ts pagesToday` builds it and is electron-free so `tests/gapsToday.test.mts` runs
  it on the committed catalogs (names picked from the data, no counts).
- `main/gapsToday.ts` imports quests.json; `itemClickies.ts` records a JSON import edge once
  breaking the inventory-watcher e2e. Not run in this pass: run that spec at the gate.
- Not examined: whether the ATTACHED character's own archive-merged quest-giver rows can carry stale
  `questGaps` (`mergeGaps.ts mergeRow` spreads the older row's field); main's re-check runs only on
  other characters.
- 2026-11-23: `mergeGaps(..., join)`: `oneCharacter` (archives) adds `turnedInTo` per NPC; `acrossCharacters` never sums. Open: in All characters a row the attached character never turned in shows another character's count.

### Bazaar

- Commas: `bazaar_words.rs::join_thousands` takes the commas out of `1,500pp` BEFORE `tokens()` pads
  separators. Trap: `tokens()` splits every comma, so a price rule that expects a comma inside a
  token never fires (the `,` in `price_at`'s regex is dead). Not joined on purpose: a number after
  `+` ("+4,500pp" is tier 4 at 500pp) and one glued to a letter.
- `price_at` returns None for a price of 0: an offer is never counted at 0.
- A price before "for" prices ONE item (`Parser.lead_once`); a leading "3k each: A | B" prices every
  item. Open: after an each-lead, a later item's own price ("... | C 10k") is still dropped and C is
  counted at the lead.
- A lead price with no unit makes its offers a guess (`Parser.lead_bare`), the same law as a bare
  price after an item.
- Second price (`Parser::second_price`, `price_end`): a different price right after the first, with
  only separators, "to" or "now" between, marks the offer unsure. A second price followed by "for"
  or "if" does NOT ("2500pp, 2000pp for multiples": 24 correct offers on the owner's log; the rule
  without that exemption uncounted all of them). Words between also leave it counted (the price of
  an item no page names).
- This guess rule lives in the parser, not in `mark_guesses`, because it needs token positions of
  the prices.
- `bazaar_parse.rs` is at 423 of 440 code lines and `apply_price` at complexity 12 of 13: the next
  rule goes in its own function, or the file needs a split at a real seam.
- Watch alerts: `alertingWatch` (per side: the tier's own watch if that side is on, else the
  every-tier one) decides alerts; `findWatch` is only what the panel, chip and My watchlist filter
  show. A tier watch with neither box ticked mutes nothing. Open: the per-tier row chip shows only
  the tier's own watch.
- Prices the player typed (watch thresholds) and the alert's offer price go through
  `formatPlatExact`, the inverse of `parsePlat`; `formatPlat` rounds and is for tables, tiles and
  charts only. A new unit in `parsePlat` needs its line in `EXACT_UNITS`.
- `parsePlat` reads thousands commas only where they group three digits (`12,500`; `1,50` is
  unreadable). A price field's blur goes through `platFieldCommit`: blank clears the price, text
  that is not a price stores nothing and the field goes back to the stored price (before
  2026-11-19 a typo stored "any price" while the field kept the text, so every offer alerted).
- Measure: a corpus for `BAZAAR_CORPUS` can be made by filtering trade-word lines from the live log
  plus `Logs/companion-archive/*.log.gz` (the live log alone has too little chat); 2026-11-19
  numbers: trade 1972, offers 2326, priced 1376, counted 1309.
- 2026-11-23: `own_after_lead` (bazaar_parse.rs, 436 of 440 lines): an item given a price before it ("3k each:") and a different one right after its name is listed with no price and adds nothing to history.

### Buffs

- Replace the last bullet's first sentence with: A changed choice restates every live buff row in
  the define itself (`BuffInstances::restat_all`, `buffs_restat.rs`) and then announces. An
  `ActiveBuff` carries the numbers it was projected with, so anything new that changes
  `estimate_for`'s answer without a log line must call `restat_all` too, or the table and the cards
  disagree. A saved choice now moves a running crowd-control hold too.
- `reproject_row` (`buffs_restat.rs`) is the one per-row re-projection for both a new sample and a
  choice; it keeps the row's own `started_ts`, caster and count. `buffs_instances.rs` is near its
  factoring ceiling: new re-projection code goes in `buffs_restat.rs`.
- What the log LEARNS never reads a choice: `death_bound_span` judges against `automatic_estimate`.
  Use `estimate_for` only for what is drawn (rows, timers, the stats table).
- The Buffs card's overdue rule and captions are pure functions in `features/buffs/format.ts`
  (`estimateState`, `leftCaption`, `estimateText`, `fmtPrecise`), tested in
  `tests/buffsFormat.test.mts`. Past the estimate is overdue for every source; never print
  `fmtDuration(0)` in a caption (it is a dash).
- Open: for an `observed` estimate the all-time p75 can sit below the estimate, so the card can say
  "past estimate" with time still on the bar. Not changed; needs an owner yes.
- Tests over the committed catalog must not pin a wiki duration: `duration_choice.rs` reads the
  row's own number and asserts the source.

### Plane of Sky counts

- `turnins.rs` `given`: an offer older than `TRADE_MS` (300 s) leaves `given` when the next offer to
  the same NPC comes (the `gaps_quests.rs` `offered` rule). `items` still keeps every offer. Not
  filtered at the trade line: a trade window left open over 5 minutes must still give its offers.
- TRAP, still open: a re-offer within 5 minutes of a bounce ('You must turn in all quest items at
  once ...', which no module reads) counts the bounced item twice. Reading that line as a hand-back
  needs a check of the owner's log first, and the two gaps modules have the same gap.
- TRAP, still open: a refusal hands back an offer only inside `REFUSE_MS` (10 s) of that offer, but
  refusal lines print at trade completion, so a slow fully refused trade leaves earlier offers in
  `given`. A partial hand-back (NPC keeps the quest items, returns an extra) removes the wrong
  offer; fixing it needs a `back` list on the row, which is an archive format change.
- A turn-in recorded with '+' lowers a count only through the log witness: always under `log`, under
  `both` only where the log holds more than the export. Under `inventory`, `rebaseline` and
  `handins` it moves no count (a click time never discounts a dump, JOS-409; `handins` never reads
  the ledger). A count set by hand is the exception under every source. `countSource.ts`
  `recordedTurnInMovesCounts`, `recordTurnInTitle`, `turnedInHover` hold the rule and the hovers;
  `tests/skyRecordedTurnInCounts.test.mts` ties them to the real reconcile. Change the arithmetic
  and that test tells you which sentence is now false.
- Known inexact: under `rebaseline` with no dated export the app counts as `both`, and the '+' hover
  still says counts stay the same.
- `turnInActions.ts`: every click builds on `newestKnown` = the render's list, plus '+' stamps not
  shown yet (`sent`), less take-backs still in flight (`cut`). Main REPLACES a quest's instants and,
  when given, its rejected list, so undo restates the rejections of in-flight take-backs too.
- `cut` lives only until its own reply (try/finally). Do not make it expire on 'the list stopped
  showing it': a trade an archive shows again later would then be impossible to take back. This is
  safe because the reply re-renders at once (progressStore is a useSyncExternalStore).
- `sent` still expires only at the next '+' on that key. Unverified: if the Sky tab's hook survives
  a character switch, an old stamp could be restated for the new character.
- The undo hover reads `QuestProgress.undoTakesLogTurnIn` (`undoRejectsDetection`, which
  `takeBackTurnIn` also uses). Never word it from `turnIns <= logTurnIns`: a hand turn-in older than
  a log one makes that comparison lie. `logTurnIns` no longer decides anything on screen.
- `useProgress.ts` cannot be imported by a node test (path aliases); put testable rules in
  src/shared or countSource.ts. The file is about 2 code lines under its 440 ceiling: new code goes
  in another module.
- Payload: `loaded` = the main window holds the character's progress (it gates the empty-list text
  only, and must not wait on the log, or an engine that never starts leaves 'Waiting' up for good).
  `countsPending: true` is written only while progress is held and the loot or turn-ins module is
  not loaded; the overlay then draws `skyOverlayNotice` above the rows and hides the ready tally. A
  settled payload has no such key.
- Every count source waits on both modules, `inventory` too: its dump is discounted by the log's
  destroys and turn-ins.
- The feed builds the payload with `buildSkyOverlayPayload` (shared/skyQuestOverlay.ts);
  `useProgress` exposes `lootReady` beside `turnInsReady`.
- Not changed: at launch the overlay first draws the last session's stored payload until the feed
  writes.

## Bug hunt 2026-11-27: the rules its fixes left in force

Findings and verdicts: `audits/2026-11-27-bug-hunt-and-duplicates.md`. Each rule below has a unit
test that failed before the fix.

- Tradeskills, Pick up: `pickUpWhyText` takes `lastCombine` and `lastRun`. "Your log shows no
  combine yet." only when both are null; a run with no combine placed in a tradeskill reads "Your
  highest tradeskill." alone.
- Tradeskills, Explore: `exploreRoute`/`exploreEmpty` take the route's `topTrivial`. Total 0 and
  (top null or floor > top) gives `ladderEmpty(ctx, top)`, as Cheapest and Fastest do. The "made
  every ... from trivial N up" sentence only for floor <= top with every rated recipe made.
- Gaps recipe Copy: `recipeAddText` with `recipeTrade(row)` undefined returns "On <page>, pick the
  recipe's tradeskill first ..." plus any notes block; it never writes `replace | playercrafted =`
  with a blank value (pasted, that erases the page's facts). `RECIPE_TRADE_NEED` only on a
  recipeUpdate row whose container and counted materials are stated (`combineStated`). A New-page
  row with no tradeskill still says "recipe" (READY test).
- AA spell-name collisions (aa-1): fold `leveling_aa.rs` publishes `castOnly: true` on an
  `aaActivations` entry whose every line so far was a castBegin with no numeral; an aaActivate,
  aaOwned, Finishing Blow line or ranked cast clears it (and announces). `shared/aaList.ts`
  `AA_SPELL_NAMES` (divine aura, stoicism, rampage) is pinned against `src/main/data/spells.json`
  by `tests/aaList.test.mts`: regenerate it when that test goes red after a data refresh.
  `aaActivatedRows` skips a castOnly entry with one of those names; `mergeLeveling` keeps castOnly
  only when both sides have it. Archive segments from before the field keep the old behaviour until
  refolded.
- AA picker (aa-2): `AaRanked.listed` (from `heldByList`, on 'list' and on 'log' when a purchase
  beat the list) and `AaRanked.usedRank`. `aaPickHeard(r, n)` in `shared/aaRanks.ts` is the one
  rule: picker disabled when listed (caption "from /alt list"), items below usedRank disabled.
- AA one per key (aa-3): `aaOnePerKey` (`shared/aaBoard.ts`) in `aaLeft`, `aaSpent`, `aaTabCount`,
  `aaRecommend` and `aaPlanDelta`, after their usable/buyable filter. `aaPlanDelta` compares rows by
  `r.key`, not by object (the own and planned boards are ranked apart; `withGranted` makes new
  objects). Lists and the search count still show both Quick Evacuation rows; it is the only key two
  rows share.
- AA jump (aa-4): `aaJumpView` gives `AaView.jump` the scope and maxLevel; unchanged when
  `aaTabGroups` already shows the row, else maxLevel cleared if the row is past it, then scope
  'all' if still hidden.
- BiS bow rule now lives in FOUR places that must agree: the search's bow variant (`bisSearch.ts`),
  `bisCaps` `bowRuleHolds`, `withArrow`, and `buildBisSheet`'s AMMO readback. `withArrow` runs after
  the exact search and again after `solveWithCaps` (the arrow priced with `cappedValue`, never a
  candidate of the pass). With no arrow admitted, AMMO is read off its own list, so card, totals,
  filled and total agree; `arrowForBow` is set only on a real arrow. Open neighbour (review nit): a
  caps pass that moves a bow in while AMMO holds a non-arrow item.
- BiS Level box (`BisView.LevelInput`, `bisPrefs.typedLevel`): local text; empty or non-numeric
  stores nothing and shows the stored level again on blur; a number is stored through `clampLevel`.
- Macros (`src/main/ipc/macros.ts`): only ENOENT starts an empty library. Any other read failure
  is logged, rejects `macrosLoad`, leaves `loaded` false; a save before a good load reads first and
  writes nothing if that read fails. The player sees the tab's "could not be loaded" line.
- Click-through mode (`lib/clickThroughHover.ts`, 2026-11-27): flip off, preventOverflow
  `{ mainAxis: true, altAxis: false, padding: 8 }` (JOS-344; for a bottom placement mainAxis is
  horizontal), `pointerEvents: 'none'`, close on capture-phase pointerdown. One copy, imported by
  `KnownItemTooltip` (`clickThrough`) and `GearCompareCard` (`GearRowCompare`); the two cards stay
  separate. `tests/clickThroughCardAxes.test.mts` pins the pair and that neither card writes its own.
  The Best in slot slot hover (`BisCells`, `BisCompare`) is not in this mode: right-start and
  interactive on purpose, scored at the slider, not base-vs-base (dup-ui-a-2: kept separate).
- Reading log, own-connection second opinion: runs under `OWN_CONNECTION_HEALTH_DEADLINE_MS` =
  `ENGINE_OWN_CONNECTION_TIMEOUT_MS` + 5 s (`engineProtocol.ts`), passed as the optional third
  argument of `EngineClient.request`. The supervisor's 20 s timer is the only bound on the ask;
  `REQUEST_DEADLINE_MS` (15 s) applies to every other request.
- Duplicate merges of 2026-11-27 (`dupes-1127`; outcomes in the audit, "Prototype outcomes"):
  - Table sort: `shared/tableSort.ts` `nextSort` is the one header rule (new column on its natural
    end, same column flips). The third click back to a source order is a per-table opt-in (the
    `source` argument); only AA passes it (`AA_WIKI_ORDER`, requirements 2026-11-26). Stored under
    `TABLE_SORT_KEYS` through `lib/useTableSort.ts` `useSortPref`: never rename a key; the
    `sanitize` passed must be module level (it is a memo dependency). Gear keeps `eq.gear.sort`
    through `useRemembered` (JOS-329). The two zone-rate tables keep a dash row (and, under a goal,
    a short visit) last in both directions.
  - Chips: `lib/TagChip.tsx`. Size `tag` (18 px, 11 px text) for Combat, Loot, Factions, Alerts.
    Gaps chips use size `clickable` (MUI's small chip untouched) and keep their own height
    overrides (20 or 24 px). The Leveling unlock chips, `SeenAsChips` and `KnowledgeBadge` stay off it.
  - Loot times are 24-hour in both sources: TS `formatShortStamp` ("Aug 5, 20:26") and engine
    `views/loot.rs` `display_time` print the same string; change both together.
    `engine-loot-view.e2e` checks the shape on both sides. The engine pins en-US; the TS side uses
    the runtime locale.
  - Time ago: `lib/formatDate.formatAge(ts, now, style)` is the only ladder (90 s, 90 min, 36 h);
    `terse` for the overlay meters, `long` for the drop report sentence. No local copies.
  - Stat tiles: `lib/StatTile.tsx`, pixel-identical to the five copies it replaced; a difference
    between surfaces is a density field or a prop. The Paper is built inside `StatTile` so the
    Tooltip attaches to it.
  - Map timer pins (`respawnPins.ts`): seen, then stale, then due, in `respawnClockLabel`'s words; a
    seen pin never pulses (`justDue`); seen and stale hover ages use the Timers tab's `fmtDuration`.
  - Exaltations and Wish list class filter: `useFollowingClasses('eq.planner.classPins')`, per
    character. The old `eq.planner.classes` pin is read as the `'*'` fallback only while the new key
    is absent (`readClassPins`). Two views share the key; they are never mounted together.

## Chart readout: drawn on body (2026-11-20)

- `lib/ChartTooltip.tsx` draws its card with `createPortal` on `document.body`, `position: fixed`,
  z-index 1500. A zero-size anchor span stays in the hover layer; a caller's `x`/`y` are still px
  from the layer's positioned ancestor. The card flips at the WINDOW's edge
  (`lib/chartTooltipPlace.ts place`), so the `bounds` prop is gone.
- Why: drawn inside the chart it was cut off by a scrolling ancestor (the dashboard's DPS card at
  125% text). Do not move it back inside a chart; `tests/e2e/tooltipClipSteps.mts` checks its
  parent is body and that nothing clips it.
- TRAP for e2e steps: a NAMED helper (an arrow assigned to a const) inside `page.evaluate` fails in
  the page with `__name is not defined` (the test loader wraps it). Return plain data from the
  page and judge it in the test.

## Backlog batch (2026-11-21, branch `backlog-small`)

- A fire frame carries `alertId` (optional; the engine always sends it). `fireToFiring` resolves by id, and an id that is gone or disabled is dropped. Label and sound are only the fallback for a frame with no id.
- A capture refused as too large is remembered in `logArchive.refusedTooLarge` by head, size and version. It stops holding for another log, a shorter file or a new version. `liveTooLarge.known` answers from memory because the status report must never wait on the disk.
- The recipe table's Trivial cell may hold the textless notice icon only: the e2e `rows()` reads that cell's text as a number or nothing.
- The Tradeskills e2e is two specs split at the level raise. Steps that raise the level or depend on it belong in `tradeskills-log.e2e.mts`. `npm run typecheck` does not cover `tests/`.

## Second batch (2026-11-21)

- Loot append frames (`shared/lootFrame.ts`): main answers `module:getLootFrame` with the rows past a window's `{ gen, length }` mark, comparing every held row by value; any non-prefix change raises `gen` and sends the whole ledger. A reply must also match the array it was asked against. Window rows now live across pickups, so no loot reader may write to a row or sort the ledger in place (`tests/lootFrameFrozen.test.mts`). A null re-ask still keeps the overlay's last rows until the next cursor (existing, pinned behaviour).
- A stay's outgoing headline divides by your fight time plus `Agg.loose` (`LooseClock`, ownclock.rs): stretches of landed damage with no fight of yours open, ended by a fight or 60 s of quiet, a second at least, and a dropped row takes its time with it. `durationSec` stays your fights alone, because per-minute figures read it, so print a headline's time with `headlineClockSec`, never `durationSec`.
- Item window: a short junk token before `Class:` is accepted only with a class code after it and `Race` opening the next row; without the Race check, full-screen captures read as junk windows.
- The screen pass's 16 owner entries and the bug hunt's 17 are decided; each audit line says how. Check the Bazaar column fit and the Combat log at 900x600 first: neither was measured.

## Batch of 2026-11-23: rules its fixes left in force

- **CE is display only.** Frozen for good: appId, `executableName` (TEST), package name,
  `PROD_DIR_NAME`, `channel: test`, `test.yml`, the updater cache. Pinned by
  `tests/communityIdentity.test.mts`, enforced by `scripts/community/check-release-identity.mts`.
  Releases publish not-Latest; `gh release edit community-<v> --latest` is a separate owner step.
  Versions are plain 0.1.N from 0.1.55. The first CE release bridges the previous blockmap to its
  `-ce-` name.
- **Loot order.** The flat ledger is newest first within a second, on append and full read (measured).
  A character switch remounts the Loot tab and Group by item returns to on, so a spec reading rows
  after a switch reads the grouped table, where ties sort A to Z. That was the "oldest first" report.
- **Gaps save on leaving.** `switchController.ts leaveLog` runs the one `setBeforeSwitch` slot;
  `gapsSaver.leaving(ms)` is bounded at 2 s, never rejects, and a timed-out attempt is dropped so it
  cannot write another character's answer. `window-all-closed` waits for it, then tears down;
  `before-quit` runs that teardown if it lands first. Tray Quit closes the window, so it saves too.
  A quit that closes no window (the updater's install, an OS logoff) makes no save.
- **All characters stock.** `withOthersStock` (`gapsAllCharacters.ts`) covers only rows the attached
  character lacks. `mergeRow` still takes the newer side for the archive merge.
- **Turn-ins.** Refusal lines print with the trade (141 of 141 within 1 s), so `turnins.rs` applies no
  age window. The log never names the refused item; `back` plus `shared/turnInRefusals.ts` settles it
  from the quest list. "You must turn in all quest items at once" does NOT return the items: they
  stay in the window (5 of 12 bounce sessions then completed). Never treat it as a cancel.
- **Respawn join.** `standingAcross` gives every archive join the same standing zone. A zero-sample
  row with an agreed pool takes that pool's count and bound.
- **Log archive trap.** Never clear the rotation journal for a segment still `captured`:
  `placeArchivedBuckets` then calls `withdraw`, which deletes that segment's stash.
- **App-signal fires** live in main for the launch (`createAppFireLog`) and merge in
  `useAlertsStore`, not the module snapshot, because the module cursor is the engine's. The event
  feed row is still a gap: it needs an engine command.
- **Maps refresh.** `refreshIfChanged` stats every file because a directory's time does not move on
  an overwrite. `generation()` invalidates the zone graph; the renderer re-asks through
  `useMapsRevision`. The port table is held per EverQuest folder (`zonePortsPull.ts`).
- **Combat copy.** Under "With its owner" the level-1 paste follows `petGroupPrintLines` (master,
  pets, `Together`). The per-mob drill reads "all sources combined": its events are everything but
  `enemy`, so a group's damage is in it.

## Cursor ring (on screen: Cursor overlay): shapes, crosshair, trail (2026-11-26, requirements/cursor-ring.md)

- **Field:** `CursorRingPrefs.shape` (`RingShape`: `circle` | `oval` | `square` | `rounded` |
  `diamond` | `dot` | `target`), default `circle`. Rides the `cursorRing` blob with no schema bump,
  like `colorHex`: `normalizeRingShape` takes `unknown`, and an unknown or missing name draws the
  circle (store file, renderer, share import, a config sent without one).
- **Geometry:** `shared/cursorRingShape.ts` `ringGeometry` (box, stroke, radius, turn, inner mark)
  and `ringTransform`. The ring window and the Preferences sample both read it; never a second copy.
  Every shape fits the `sizePx` footprint: oval = full width, 60% height; diamond = side
  size/sqrt(2) turned 45 degrees. The drawn stroke is capped at half the shorter side; the stored
  thickness is not touched.
- **Default pinned:** the circle's geometry and transform string are the old ring's exactly
  (`tests/cursorRingShape.test.mts`); `cursorRingZoom.test.mts` now pins the centring line in the
  shape module.
- **Performance contract, extended:** still one moving element. `dot` and `target` draw their inner
  mark on `#ring-inner`, a child of `#ring` styled once per config, so the ring's transform carries
  it. The diamond's `rotate(45deg)` is appended to the same transform string, after the translate.
  No timer, no canvas, no layout on a move.
- **Offset:** `offsetXPx` / `offsetYPx`, whole px clamped to +-60 (`MIN/MAX_RING_OFFSET_PX`), default
  0/0 (centred, as before), no schema bump. `ringTransform(g, p, offset)` adds it before the half
  box comes off; `ringOffset(prefs)` reads a config without one as 0/0. +-60 keeps a parked ring
  (-9999) off screen. Pinned in `tests/cursorRingOffset.test.mts`.
- **Preferences sample:** `CursorRingDemo.tsx`, a box holding a drawn arrow pointer whose tip is the
  hot spot, with the shape at the offset; keeps `data-testid="pref-cursor-ring-preview"` on the
  shape (the colour e2e reads its border colour). Grows with size + offset so nothing clips.
- **Renamed "Cursor overlay" on screen (owner, 2026-11-26):** Preferences section and item, the
  switch ("Show a cursor overlay"), captions, window title (`Cursor Overlay`; `presence.test.mts`
  keeps the old title in its own-windows list). Internal names stay `cursorRing`: files, IPC
  channels, the store key, data-testids, CSS ids. Renaming them would orphan every installed
  store blob and break the e2e selectors for no player-visible gain. Keywords keep "ring".
- **Shape switch:** `showShape` (default true). `enabled` is still the master switch (window, poll,
  watcher); `showShape` only hides `#ring`, so the crosshair or trail can run alone.
  `shapeShown(prefs)` reads a config without it as shown.
- **Crosshair:** `crosshairEnabled` (false), `crosshairColorHex` (`#ffffff`, `normalizeRingColor`),
  `crosshairWeightPx` (2, clamped 1 to 8). `shared/cursorCrosshair.ts`: `crosshairOf`,
  `crosshairTransforms`, `crosshairLineStyles`, `isParkedPoint` (any negative coordinate: main
  only sends in-window points or -9999). Two prebuilt divs `#cross-v` / `#cross-h` (100vh / 100vw
  = the EQ window, the whole screen only in fullscreen), 1px dark contour. Raw pointer, never the
  shape's offset. Parked: both at -9999. Pinned in `tests/cursorCrosshair.test.mts`.
- **Trail:** `trail` (`'off'` | `'trail'` | `'sparkles'`, default `'off'`, `normalizeTrailMode`),
  `trailLength` (5, clamped 1 to 10), drawn in the shape's `colorHex`. Maths in
  `shared/cursorTrail.ts` (no DOM): trail life 60 ms x length; sparkles 300 + 50 x length ms, 1 to 3
  specks per sample; caps 96 / 160 live, oldest dropped; positions are closed forms of age, so a
  late frame or a hidden window just finds them expired. Canvas painter:
  `renderer/src/overlay/cursorTrailCanvas.ts`. Pinned in `tests/cursorTrail.test.mts`.
- **Performance contract, extended again (cursorRing.ts rules 4 and 5):** the crosshair is two more
  transform-only elements, painted in the ring's frame, skipped on one boolean when off. The trail
  is the window's one canvas: Off = hidden, no 2D context ever requested, `point()` returns on
  its first line. On = each sample spawns and starts one rAF loop that clears only last frame's
  `trailBounds` box and stops itself on `stepTrail` = idle, so a still mouse costs nothing. A
  parked point clears the trail. Backing store = CSS size x devicePixelRatio, re-fitted on
  `resize` and on each loop start.
- **Store blob:** all six new fields ride `cursorRing` with no schema bump; defaults leave every
  install's overlay as it was. The five blob-pinning tests list them (grep `trailLength: 5`).
- **Picture (`'image'` shape, owner 2026-11-26: icon upload + NxN drawing grid):** one picture,
  two ways to make it. New fields, no schema bump: `imageDataUrl` (`''` = none) and
  `drawing: { n, cells }` (default `{ n: 16, cells: 256 x '' }`; n in `DRAWING_SIZES` 8/12/16/24/32,
  cells padded/trimmed to n*n, each `''` or `#rrggbb` via `normalizeRingColor(c, '')`). Both make a
  PNG data URL: upload = `createImageBitmap` + canvas fit to 64 px (`fitWithin`), grid = one pixel
  per cell. The overlay draws `#ring-img` (child of `#ring`) and never knows which made it.
- **Validator = the security boundary:** `shared/cursorPicture.ts normalizePictureDataUrl`: only
  `data:image/png;base64,` + base64 chars (padded, length % 4), whole string <= 64 KB
  (`MAX_PICTURE_CHARS`), decoded head = PNG signature + IHDR, 1 to 128 px a side; else `''`. Runs
  in `normalizeCursorRing`, so main's IPC write, the store reader and migrations all clamp it.
  The cursorRing blob is not in the settings share export (share.ts carries no presence prefs).
- **CSP:** cursor.html `img-src 'none'` became `img-src data:` (no http(s), file:, blob:). The
  picture reaches the DOM only as `pic.src = ringPicture(cfg)`; no innerHTML, no CSS url().
- **Geometry:** `ringPicture(prefs)` = the validated URL only when shape is `'image'`;
  `ringGeometry` then gives a size x size box, stroke 0, radius 0. `'image'` with no picture draws
  the circle. `pictureRendering`: <= 32 px a side = `pixelated` (grid, tiny icons), else smooth.
- **Performance contract rule 6:** the picture is set once per config, and its src only when the
  picture itself changes (a slider drag does not re-decode); a move still changes only the ring's
  transform. `#ring.picture` drops the shadows.
- **Preferences:** `CursorIconSetting.tsx` (upload, Remove, error line), `CursorDrawingGrid.tsx`
  (one canvas, not N*N elements). Shown while Shape = "My icon / drawing"; Upload/Save also pick
  that shape. Thickness is hidden for it. Pinned in `tests/cursorPicture.test.mts`; the blob pins
  list the two new fields.
- **Optional, not built:** "load current icon into the grid"; a trail colour of its own (today
  the shape's).

## Shared build cache and low-priority builds (2026-11-27, branch `shared-cargo`)

- **sccache as `rustc-wrapper`**, set once per PC in `%USERPROFILE%\.cargo\config.toml`, not in
  the repo: an `engine/.cargo/config.toml` wrapper would fail every CI cargo run (no sccache
  there). WORKFLOW.md, Environment, "Shared build cache" has the install, numbers and traps.
- **Per-tree correctness is by construction:** each tree keeps its own `engine/target`; only
  crates.io dependency compiles come from the cache, keyed by content. A shared
  `CARGO_TARGET_DIR` was rejected: workspace members get the same artifact name in every tree
  (the 2026-10-29 trap) and `target/release/engined.exe` would be last-writer-wins.
- **Measured gain is modest** (debug 85 s to 69-75 s, release 47 s to 37 s, disk unchanged at
  8.1 GB per tree): our own crates are ~75% of a debug build. The next lever is debuginfo
  (`line-tables-only`: 4.5 GB, 59 s), not adopted, waiting on the owner.
- **Below-normal priority:** `atBelowNormalPriority` (`scripts/build-engine.mts`) lowers the
  process around its cargo `spawnSync` and restores it after, so cargo and an sccache server it
  starts inherit BelowNormal; used by `build:engine` and `tests/e2e/build.mts`. `run-all.mts`
  lowers itself for the whole sweep. `known-reds.sh` runs `nice -n 10 npm test` when `nice`
  exists. Restore failures are ignored (Linux refuses an unprivileged raise).

## Engine binary reuse and the cargo-test skip (2026-11-27, branch `engine-reuse`)

- **A worktree copies the main clone's release `engined.exe` instead of building, only on proof**
  (`scripts/engineStamp.mts`, used by `tests/e2e/build.mts` `buildEngineIfStale`). The stamp beside
  each built binary lists the build's inputs as checkout-relative paths (cargo dep-info plus the
  manifests, `Cargo.lock`, `rust-toolchain.toml`), one sha256 over their bytes, and the binary's
  sha256. The old stamp hashed absolute paths, so no two checkouts could ever agree. WORKFLOW.md,
  Gate, "Engine binary reuse" has the rule, the failure cases and the timings.
- **Law: correctness beats speed.** Any doubt builds: no stamp, old format, a binary that does not
  hash to its stamp, one differing or missing input, a copy that changed mid-way. Never a link. A
  build writes no stamp when an input's mtime is after cargo started. Do not add a shortcut that
  trusts mtimes or the commit id: a dirty tree or a by-hand `cargo build` defeats both.
- **The main clone becomes a donor through `npm run build:engine`** (which now stamps), or
  `start_companion.ps1`'s rebuild. Until it has run there once on the current engine code, worktrees
  log "no readable stamp" and build as before.
- **Gate:** `bash scripts/community/engine-changed.sh` prints yes or no from the diff against
  `main_community` (plus uncommitted and untracked files) against
  `scripts/community/engine-inputs.txt`; no means no `cargo test` (RULES.md rule 11). A new
  `include_str!` outside the list fails `tests/engineStamp.test.mts`. Runtime reads by cargo tests
  (`repo_root().join(...)`) are not checked by that test: a new one outside `engine/`, `protocol/`
  and `tests/fixtures/` must be added to the list by hand.
- `tests/e2e/build.mts` held raw NUL bytes in its old digest code, so git kept it CRLF in the index;
  without them it is stored LF, and that commit shows the whole file as changed.

## E2E suite speed (2026-11-27, branch `e2e-speed`)

- **The suite was bound by pointer actions, not the app.** Hidden (`show:false`) windows drew about
  one frame a second; each Playwright `mouse.move`/`hover`/`click` waited a frame (1 to 3 s).
  `--disable-frame-rate-limit` as a HARNESS launch argument (`tests/e2e/appWindow.mts` FRAME_ARGS)
  fixes it with no product change; the backgrounding/occlusion switches and `backgroundThrottling`
  were measured and do nothing here. WORKFLOW.md, Gate, has the numbers.
- **Runner** (`tests/e2e/run-all.mts`): 3 at a time (`EQ_E2E_CONCURRENCY`), longest first from past
  `summary.json` files (a worktree also reads the main clone's), every failure retried once alone:
  `flaky under load` (exit 0, listed) or `red` (exit 1). `--serial` is for debugging only.
- **Measured:** 73 specs in 581.6 s at 3-wide (59 min serial, ~14 min 4-wide before); leveling
  211.5 s to 28.5 s alone.
- **Law for new steps:** wait on the condition, never on the action's duration. Three steps that
  read too early were exposed by the speed and fixed (character-sheet, sky-targets, overlay-sync).
  The leveling crossing step now asserts "a quick crossing opens at most one card" directly
  (re-proven red with `enterNextDelay={0}`).
- Open: `sky-recent-sort` red (also on `main_community`); `engine-boots` flakes under load (counts
  other specs' engines); `page.screenshot` still times out on hidden windows.
