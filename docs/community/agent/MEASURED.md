# Agent notes: measured game facts and analysis methods

Facts about EQ Legends established from real logs, dumps, in-game screens, or the wiki's own
source. Cite these instead of classic-EQ folklore. Each says how it was measured, so it can be
re-checked. "Owner's log" = the owner's character log, Aug 2026 onward (multiclass WAR/MNK/SHM,
SK, others).

## Spells

- **`spells_us.txt` column layout moves with game patches** (`src/main/resist/spellsUsLayout.ts`,
  `engine/crates/fold/src/spells_us/layout.rs`, one rule). 173 fields, slots at 172 (original);
  2026-10-13: one column added in 52..75 (174 fields, slots 173); 2026-11-16: sixteen more after
  aemaxtargets (190 fields, slots 189; icon 76, resist adjust 79, good effect 127, aemaxtargets 144
  unmoved, 100% of 48,296 rows against the app's saved parse of the file before). The symptom of a
  new shift: `resistBaseline` and `stackGroundTruth` go red on an untouched trunk (they read the
  install's file) and every spell parses with no slots. To place the columns, join today's file by
  id to an older `spell-resist-cache.json` (a `.bak` of the dev userData) and score each column.
  A layout fix also bumps `SPELL_RESIST_CACHE_VERSION`: the bad parse is cached under the file's
  own size and mtime.
- **Proc damage: 3% per rank of the BUFF, because the proc is cast at half the buff's tier**
  (patch notes 2026-07-07) and scales as a nuke, 6% a rank. Puma Maw over the whole log: buff
  rank I 154 (n=3453), IV 172 (n=196), VI 181 (n=1735), which is 154 x 1.12 and x 1.18 floored;
  rank I reads the base. Crits corroborate (400/154 = 472/181 = 2.6). An odd buff rank is not
  measured: half of V is 2.5, and whether that proc is rank II (172) or scaled to 177 is open.
- **Buff and debuff stats: 3% per tier, rounded** (`statAtRank`, 2026-11-15). The game's spell
  windows print the upgraded figure in green (probably since the 2026-10-22 note below); before
  that they printed base figures.
  Tier 4: 10 -> 11 (Grim Aura, Siphon Strength, Shadow Vortex), 20 -> 22 (Shroud of Hate, Heart
  Flutter), 25 -> 28 (Dark Temptation), 7 -> 8 (Heart Flutter AC: 7.84, so rounded, not floored).
  A roman rank is the tier (`IV` shows `Tier 4`). Same windows: debuff duration +10% and cast -4%
  a tier match the table; Heart Flutter's tick reads 24 -> 27, where the floored 3% gives 26.
  No reading yet for a percent stat (haste), a resist or a regen; the Chloroplast and Form of the
  Bear sheet readings (regen did not move) predate the patch.
- **DoT ticks: 3% per rank** (overturned the shipped 6%, which was fitted on nukes only).
  `scaleSpellDamage(amount, rank, perTick)`; a DD+DoT hybrid's direct hit stays 6%. Odium 387 ->
  445 at V, 468 at VII (exact); Envenomed Bolt 422 -> 473 at IV; Plague 180 -> 199 at IV. A
  constant-level window gave noisier reads (Plague 0%/rank), so treat DoT scaling as less certain
  than procs. To settle: cast rank I and rank IV of one DoT at one mob in one session.
  Write-up: `docs/plans/spell-upgrades-and-loadout.md` §0.9.
- **The healing rank rule (3% a rank, `healAtRank`) HOLDS on a same-day step** (2026-10-11): Superior
  Healing VII to VIII, non-crit, same gear, 48 and 27 casts: median 888 to 917 (+3.3%), p90 940 to
  970, max 961 to 985. A critical heal is exactly double (1,672 vs an 834 median) and the line ends
  `(Critical)`. The cross-week reading below is what to distrust, not the rule. On the owner's log
  Superior Healing's full heal (the parenthesised number of `You healed X for N (M)`) read 612 at
  rank I for weeks, then at rank IV alone climbed from 698 (8 Sep) to 870-943 (Oct) with no rank
  change: gear, focus or level move the heal far more than rank, and the August fit (892/943/968
  at II/IV/V) was taken during that climb. Read the HIGHER of the two numbers on every cast (the
  lower is the capped landing or the pre-crit value; owner, 2026-10-11): on a steady state, IV
  (Oct 6-8, n=140, median 834, p90 890) to VII (Oct 11, n=48, median 888, p90 940) is ~6% in
  total, about 2% a rank, and the heal now rolls within a range, so compare medians, not maxima.
  Do not re-fit from history: cast two ranks of one heal in one session on one gear state, ten
  overheals each, and read the two maxima. Until then the Upgrades tab overstates heal gains.
- **Form of the Bear:** upgrading buys only mana and duration. Stats window: +1 HP regen, +5 WIS
  with Bear IV up. A base of 1 cannot move under any rate. Shipped as `MEASURED_STATIC_MAGNITUDE`
  in `src/shared/spellUpgrade.ts` plus the `magnitudeCanMove` guard. Open: whether Chloroplast and
  Harnessing of Spirit behave the same. Known defect: the Upgrades tab scales a HoT's total healed
  by the magnitude rate, crediting duration growth twice.
- **The in-game spell window was not an instrument before 2026-10-22** (it printed base damage
  at every rank while mana, cast and re-use updated). Since then it prints upgraded stats and DoT
  ticks in green. A figure with no green value may be an effect the window does not show yet:
  still confirm a magnitude that matters from the Stats window or a log line.
- **The log states stacking verdicts:** `Your Dexterity spell did not take hold. (Blocked by
  Harnessing of Spirit.)`. 40 pairs are committed as `tests/stackGroundTruth.test.mts`; matching
  by EFFECT anywhere caught 40/40, the EQEmu slot-i-to-slot-i walk almost none. Ask the owner for
  more such lines when a stacking question is open.
- **Triggered spells stack too:** Form of the Great Wolf triggers spell 40593 (SPA 475) holding run
  speed in slot 2, so it conflicts with Bih`Li. The stacking check compares everything each cast
  lands (SPA 340/374/475, chance 100, id in `limit`).
- **Open stacking question (SPA 148 block directives):** a slot-specific reading
  (`other.effects[limit-1]`) fits all 52 blocks in the log and drops 21 false Augmentation-vs-AC
  conflicts; the shipped rule searches anywhere. Test in game: cast Augmentation, then Greater
  Shielding; if it lands, switch `directiveBites` to the slot.
- **Spell icons come from the client, no network.** `spells_us.txt` field 75 (0-based) is the gem
  icon id (field 76 is a decoy that renders a wrong tile). Sheets
  `<eqRoot>/uifiles/default/Spells01..63.tga`, 256x256, 6x6 grid of 40px tiles: icon `n` is sheet
  `floor(n/36)+1`, index `n%36`. Some sheets are RLE (type 10, e.g. Spells05); sheets 1-4 are
  top-down, 6+ bottom-up. Daybreak's art: read at runtime, never committed. Served at
  `eqimg://spell/<id>` by `src/main/spellIcons.ts`.
- **Client vs wiki names:** the client writes `O`Keil's`, the wiki `O'Keils`; keys fold backtick,
  apostrophe and typographic quotes. ~125 wiki spell names have no client row (Legends renames:
  Fay Gate -> Greater Faydark Gate).
- **A spell name the log never prints cannot be counted from parity's output** (2026-10-29). Landing
  and fade lines are shared by spell families (spells_us_str: `is bound by strands of solid music.`
  32 spells, `You feel replenished.` 29, `stumbles.` 62), and the fold names them by the DB's name,
  so a wiki typo in that name shows up as "the log's spelling". Count names from the raw log (`begin
  singing`/`casting X`, `resisted your X`, `Your X spell has worn off`, scribe and vendor lines). The
  owner's whole history (5.37 M lines) never names Largo's Assonant/Absonant Binding, Cantata/Cantana
  of Replenishment or GelatRoot/Gelatinous Root; spells_us.txt is the game's spelling for those
  (`audits/2026-10-11-data-gaps.md` section 4).

## From the game's patch notes

The wiki's `Patch Notes` page (pageid 57054, revid 200638), read whole on 2026-11-15: 2026-05-22
to 2026-11-10, the newest note there. A dated line is what the note says, not a measurement.
Re-read from the cached page (`scripts/sources/cache/pages/page-57054.wikitext`) after a delta.

- **Spell ranks.** 06-29: a rank lowers mana, cast, recovery and re-use, raises duration, lowers
  resist. 07-07: damage and healing bonuses; small durations are rounded; mez and charm cap one
  level higher a tier (07-14: pacify, fear and stun too); 10% a tier not to use a reagent, none at
  tier 10 (09-22: Alter Plane spells too); a summon-item spell summons the item at the spell's
  tier; a proc buff casts its proc at HALF the buff's tier (`Vampiric Embrace X` casts proc `V`).
  06-29: an item's proc that is also an upgraded spell fires at base rank. 08-25: pets gain from
  pet proc spell upgrades. 11-10: disciplines upgrade with motes like spells; Fragment Motes are
  rare drops with more upgrade power; on-expire effects upgrade one-to-one with the spell (not
  Promised Renewal); Cancel Magic casts half a tier of levels higher; stun, mez, charm and lull
  windows show the upgraded max level. 07-28: Void-Touched Potential is +1 rank to an item or
  spell, three a week from raids.
- **Spell windows.** 10-22: descriptions "adjusted to provide more specific and accurate
  information ... More effects will be implemented over time". The upgraded stat figures the owner
  showed on 2026-11-15 are not named in any note.
- **Stacking.** 06-09 and 06-11: the Paladin, Shadow Knight and Ranger combat innates (the self
  proc buffs) all stack, with each other, with Boon of the Garou and with a Rogue's poisons. 09-01
  and 09-09: a detrimental spell never overwrites or strips a beneficial one of the same effect
  (haste and slow, run speed and snare, HoT and DoT). 06-11: a permanent buff is not dispelled by
  a duration reducer.
- **Pets.** 06-02: Necromancer and Shadow Knight pets are Shadow Knights, Magician earth pets
  Rangers, Enchanter animations Paladins; every summoned pet is also a Warrior; a multi-class pet
  has double health. 06-11: Shaman wolves are Beastlords. 06-29: warders are Beastlords. 10-22:
  Monster Summoning pets are Warrior/Berserker. 07-07: a pet's level is its base plus the spell's
  rank, capped at player level - 1 (10-13: at player level); each added level is +6% hp, +1 base
  damage, +5 skill; pets gain ATK, HP regen and mana regen from items. 10-13: pet weapon damage
  follows the weapon's ratio far more than its base damage. 10-22: fixes to that; pets gain mana
  from WIS and INT and HP from STA. 09-09: pets proc AoE spells again. 08-18: no secondary-only
  item beside a two-hander. 09-15: pets respect Lore Equipped.
- **Pet procs, the owner's log (2026-11-14, measured):** an Animate Dead IV pet procced Winter's
  Roar (required level 30) 33 times in 21 minutes at 234, from a Shaman-only Garduk +10, while
  the owner was WAR/SHD/MNK. Spirit Strike (required level 35) fired once in two days. `Your
  pet's will is not sufficient to command its weapon.` printed 24 times in those two days:
  probably the proc's level requirement, not confirmed. The wiki's pet page lists that pet at
  level 19 and says a pet wears only what its classes or yours can: both are behind the log.
- **Combat.** 05-26: a point-blank area spell hits at most 8 targets (`aeMaxTargets`). 05-22:
  attack range is reciprocal. 06-09: the out-of-combat timer is 9 s (was 12). 06-11: a lifetap
  heals what it taps. 07-07: the low-level item haste cap is gone. 07-28: a stun leaves a short
  immunity; NPC charm on a player lasts 30 s at most. 09-22: upgraded weapons gain accuracy and
  backstab damage scales with weapon upgrades.
- **Motes and loot.** 05-28: motes drop within 10 levels (was 5). 06-21: a Constructed Potential
  condenses motes two to one (ranks 1 to 8). 07-14: motes are not tradable. 07-28: no motes at the
  class lock cap or on a kill that gave no experience. 07-29: loot rolls the difficulty tier or
  higher (+1 or more in D1). 09-09: in a Dungeon Crawl nothing respawns, and completion pays
  motes, experience and a bonus chest.
- **Quests and faction.** 05-22: the smallest faction hit is 5; race unlocks check the faction
  achievements, not current standing. 05-28: a Paineel NPC gives at most 100 faction a hit. 08-25:
  a bulk turn-in is calculated at once and shown in at most 4 chat blocks; NPCs take coin in any
  denomination. NOT CHECKED: whether the faction receipts the app counts survive that 4-block cap.
- **Levels.** 08-18: grouping gives a small experience bonus. 06-23: zone experience modifiers
  changed. 11-10: Reincarnation resets each class and the race of a level-50 three-class loadout
  to level 1 for reincarnation AAs (early access now, everyone on 2026-12-08). What the app's level
  history does with that reset (2026-11-22, the owner's two): the dings restart at 2 and
  `buildLevelSegments` reads the drop as a class swap, so each reincarnation is a dashed break, one
  of the Level over time chart's "class swaps" (23 on the owner's log, 2 of them these) and an `afterSwap`
  feed row. The label is wrong and was left alone. One reincarnation prints a race line and three
  class lines in one second as cost-0 AA purchases (`Class Reincarnation: Warrior`, then `... 2`
  through "improved"). None of the owner's 240 purchase lines repeats an ability and rank, so the re-log a
  comment in `progressionStatsTypes.ts` describes is not seen on this log. The Reincarnations panel
  (`shared/reincarnationClimbs.ts`) guards against it anyway.
- **Log lines.** 07-07: the rank is in `begin casting` lines; heal crits are logged. 09-15: the
  rank suffix is in interrupt, fizzle, wore-off and damage lines. 08-25: several item rewards
  print a count.
- **Spell levels the notes moved** (client file agrees, 2026-11-15): Lifespike to Shadow Knight 5
  (08-18), Enchant Steel to Enchanter 21 (06-29). The wiki pages still said 8 and 46, so the
  catalog does too: the page edits went to the owner. Not corrected in the app, because a `classes`
  correction is projected into the engine's spell overlay and needs the engine gate. The June Shaman heal levels (Slugs 28, Sloths 42) were reshuffled
  later; the catalog and the client agree on Snails 14, Tortoises 28, Slugs 42.

## Items and upgrades

- **Elemental damage:** a stats block can carry `DMG: 11 Fire DMG: 3`. The parser names five
  elemental keys; `repairElementalDamage` re-parses stored blocks at load (`itemsDb.ts`), because
  `items.json` is one line with two copies and a data patch would conflict on every rebuild.
- **Range: +10 flat per upgrade tier.** Mithril Champion Arrows 150 -> 220 at +7 (game), 250 at
  +10; Blessed Champion Arrows 170 -> 270 at +10. Bows too: Windstriker 200 -> 300 at +10 (2026-10-28).
- **Primary stats over 10: `floor(base + base * effective / 10)`, no inner rounding** (2026-10-28,
  game windows): Bloodsoaked Gauntlets +1 (0/2) Mana/End 95 -> 104, AC 17 -> 18; Pyrosilk Robe +5
  (0/32) AC/INT 13 -> 19. The old `floor(base + round(...))` cannot give 104 from any base. AC, HP,
  Mana and End qualify the synthetic SV Void (Bloodsoaked shows Void 1 with only those). A RANGE bow
  gains Accuracy (Windstriker +10: +25%, its page states none). Weight at a whole tier is exact
  decimal arithmetic (Windstriker +10 reads 0.4 from 4.0; the double artifact said 0.5).
- **Penalties past -10 shrink 10% of |base| per tier**, reaching 0 at +10:
  `-10 <= base < 0` -> `min(0, base + full)`; `base < -10` ->
  `min(0, base + round(|base| * effective / 10))`. Stonemelder's Band DEX/AGI -35 reads 0 at +10.
  Source: the wiki slider `scalePrimarySpreadsheetStat`.
- **When an in-game number disagrees with the app's upgrade math,** diff the live slider source
  (`https://eqlwiki.com/load.php?modules=ext.itemLevelSlider&only=scripts&debug=true`, one
  request) against `src/shared/itemUpgrade.ts` first. The slider has moved since the creator's
  2026-08-12 port (Range, penalties). Keys the port calls "unchanged" (Attack, Dmg Bon, Backstab)
  are not re-checked.
- **Instant sale on loot pays base price / 1.4**, rounded to the nearest copper (2026-10-11, the
  owner's log: 9,129 `sold it for` lines, 806 priced item+tier; sale x 1.4 lands on a round gold
  figure for 222 of 224 sales of 20g or more; the same price at every tier for all 225 items seen
  at 2+ tiers). Real price = sale x 1.4. A vendor at the owner's usual standing pays base / 1.05
  = sale x 4/3 (80 of 95 gear vendor-sale lines); the vendor side moves with CHA, faction and
  merchant, the instant side never does. `for free` is base 0. The wiki's `merchant_value` is a
  hand-typed vendor offer on 964 pages at varying CHA (median 0.745 of sale, some authors typed
  the instant price itself): not a usable denominator. Two items can share a name at two prices
  (Gold Ring: 6g from Gynok Moltor, 12g in the Karanas). The 1.05 / 1.4 pair is classic EQ's
  best / worst vendor multiplier.
- **A free sale is not a price** (owner, 2026-10-11). A worn item is bound and a vendor pays nothing
  for it, so `for free` on a vendor-sale line says nothing about the item's value; an item that EVER
  sold for coin has that price. A loot-line instant sale was never worn, so `for free` there is a
  genuine zero-value item. Any price reading takes the most frequent priced sale and shows nothing,
  never 0, for an item that only ever sold for free (`derivedPrices`, shared/gaps.ts on gaps-tab).
- **Item DB:** `src/main/data/items.json`, ~11.5k items, keys lowercased names. Use it instead of
  wiki fetches.

## Exaltations (socketing)

- Gems carry their donor item's effect per socket kind. Dump child index: 7 Focus, 8 Click,
  9 Worn, 10 Proc, 2 Ornamentation (`SOCKET_TYPE_OF_INDEX`, `shared/planner/inventorySlots.ts`).
- The donor's SLOT must match the host's (belt gem -> belt). Donor CLASSES must overlap the
  host's, and socketing re-restricts the host to the donor's classes.
- Same-name effects do not stack: one per family, highest tier (roman numeral) applies.
  Exception: PROCS are per weapon; the same proc in Primary and Secondary both fire.
- Unknown: whether un-socketing is lossy. Never claim it either way.

## Stats, combat, procs

- DEX = proc rate + weapon/rogue skill-up speed + bow average hit only; melee hit/damage is
  STR/ATK. AGI below 75 is a large AC penalty. (eqlwiki Statistics page.)
- Measured proc rate: ~1.3% per swing, ~0.81 procs/min both hands (dual-wield WAR), below the Live
  formula the wiki carries unverified.
- Ranged characters get an AA to fire at melee range; the planner scores Ranged STR and ATK at 0
  (owner ruling 2026-09-26).
- Melee verbs: `slash` = 2H swing, `cleave` = extra 2H hits, `punch`/`claw` = H2H, `reave` = SK
  auto-special, `kick` and `strike` = the monk special lines, `bash` = WAR bash.
- Specials auto-fire. `You will now use X instead of Y while attacking` prints only on a manual
  change, and the choice can revert silently; `You have become better at <special>!` shows which
  one is firing.
- Slotting a low-level class lowers the DISPLAYED level and everything scaled from it.

### BiS sheet research (2026-11-24): SOURCED, not measured by us

Read from public sources for the Best in slot sheet (`plans/2026-11-24-bis-sheet.md`, Version 2).
Code: TAKP/EQMacEmu (github.com/EQMacEmu/Server: zone/client_mods.cpp, attack.cpp, mob.cpp,
client.cpp, special_attacks.cpp, common/ruletypes.h) and EQEmu (github.com/EQEmu/Server,
zone/client_mods.cpp). Guides: almarsguides.com/eq/endgame/classguides/classic-por/<class>/. Legends
wiki pages read through `scripts/wiki-call.mts` (ledger): Statistics, Game_Mechanics, Skill_Archery.
wiki.project1999.com refused the fetch (403).

- HP = L*F/10 + L*F/10*STA'/300; STA' = 255 + (STA-255)/2 above 255. F at 60: WAR 300 (steps up
  from 220), PAL/SHD 260 (from 210), BER as PAL/SHD (EQEmu), RNG 200, MNK/BRD/ROG/BST 180,
  CLR/DRU/SHM 150, NEC/WIZ/MAG/ENC 120. HP per STA = L*F/3000. The Legends Game_Mechanics page
  gives the same factors at 50 and 60.
- Mana from WIS (CLR DRU SHM PAL RNG BST) or INT (NEC WIZ MAG ENC SHD BRD): S' = S, or 200 +
  (S-200)/2 above 200, plus 1.5*(S'-100) above 100; Mana = S'*15L/200 + 15L. Per point at 60: 4.5
  below 100, 11.25 from 100 to 200 (Legends wiki observed 11.27), 5.6 above 200. Hybrids get none
  before level 9. Multiclass rule: unpublished (eqlegendstools says INT and/or WIS by class mix).
- STR: melee offense, skill + ATK + (2*STR-150)/3 at STR 75+; raises the average hit, not the max.
  No effect on archery in Legends: eqlwiki Skill_Archery test, STR 199 to 299 gave no gain (the P99
  wiki says otherwise for P99).
- DEX: archery offense in place of STR. Legends test: DEX 139 to 338 took the average bow hit 118
  to 153 and DPS 34 to 45 (+32%). Proc chance (0.000417 + 0.0000114*DEX) * delay, DEX capped at
  255 for it. Warrior crit +DEX/90; ranger archery crit +DEX/34.
- AGI: AC loss below about 38; avoidance -25..0 below 40, +6..+53 from 75 to 200, none above 200;
  mitigation +AGI/20 above 70.
- AC: item AC x4/3 except NEC/WIZ/MAG/ENC; anti-twink cap 6L+25 below 50; mitigation softcap 350 to
  50, then (Velious) WAR 430, PAL/SHD/CLR/BRD 403, RNG/SHM 375, others 350. Legends wiki: "caps
  are changed in EQL" (unverified).
- ATK: worn cap 250. Haste: worn haste does not add, the highest counts; item haste capped 10% at
  level 25 and under; total cap level+25 (1-50), 85 (51-59), 100 (60+).
- Regen caps: worn mana regen 15, HP regen 30 (60 and under).
- Caps: classic 255 per stat; Legends 510 (515 for Magician) per eqlwiki Statistics and
  eqlegendstools; reincarnation raises the softcap +10, excess counts 20%. Resists cap 500.
- Resists: about 6 points per 1% (eqlwiki, from EQEmu; unverified for Legends); 5%/95% floor and
  ceiling.
- Item stat budget: no public point-cost formula (Verant, SOE or EQEmu). Our own fit over the
  corpus (2026-11-24): items of one drop level and slot vary about 4x in total stats; one attribute
  is worth about 3 mana and 3 to 6 points of one resist; AC follows armour type, not budget.
- eqlegendstools.com/char-sheet/ is a Legends BiS planner with per-stat weights 0-100; it
  publishes no weights.

## Progression and world

- **A respawn estimate is death-to-death, so it carries the fight** (2026-10-11, owner: timers 1 to
  1.5 min long). `respawn.rs record_death` takes the MINIMUM gap between two counted deaths of a name
  in one zone stay (not a median), raised to the wiki floor under the exact lowercased name. Lower
  Guk 4 (Refined): Hoptor Thaggelum respawns in exactly 570 s (death to first sighting, 569-571 s
  over seven cycles; the wiki says 9 min, and its floor sits under `the ghoul lord`, a key his name
  never matches), yet the estimate read 634 s because the group's fights ran 60-90 s; a reanimated
  hand and the ghoul arch magus read the same way. The archive refold and merge changed none of
  it (the respawn code is byte-identical to test.20). Fix to make: measure death to first sighting.

- **Disarm** (`npx tsx scripts/disarm-stats.mts`, 2026-11-08, every log Aug 12 to Nov 8): 32,458
  attempts that rolled (`Your attempt to disarm failed.` / `You disarmed <mob>!`), 357 successes,
  1.1% per attempt; 17,343 presses were "too far away" and 2,091 had no target (no roll). Once a
  mob is disarmed in a fight it is never disarmed again that fight: 0 of 655 later attempts (the
  weapon is gone). Named mobs land it more often than trash (Knight V`Tal 8.1%, Korven Nisere 5.7%,
  Avatar of Fear 5.8%, Master Yael 2.8%; Teir`Dal trash 1.4-1.8%); 144 distinct mobs disarmed, 51
  named. A success prints `<Mob> was disarmed!` (anyone's) and then `You disarmed <mob>!` (yours).
- **Death:** no XP loss. `Slain by <groupmate/pet>` means you were charmed
  (`You lose control of yourself!`).
- **Multiclass XP:** every active class gets the full amount; displayed level = lowest active
  class.
- **Personal-instance charges:** max 2, regen 1/hour. Loot/XP scale by difficulty tier (D0-D4)
  and solo vs group.
- **Instance tier is in the log:** `You have entered <Zone> <N> (<Word>).` with 1 Awakened,
  2 Adaptive, 3 Fused, 4 Refined. A `- Group` variant is the short 4-kill mission. Dungeon Crawl
  completion prints `You have completed the Dungeon Crawl and earned reward loot!`; its loot reads
  `... from Reward Chest`.
- **Re-entering an instance tier opens a new instance, spawns up** (owner's logs, 2026-11-03): Chief
  Goonda (WK 4) killed again 4:34 after his last death, 1 min after a re-entry, against 14-21 min
  cycles; Slizik the Mighty (Old Paineel 1) 3:15; Asaka L`Rei (Befallen 4) 5:15; Corrupted
  Kedgespawn (Lake Nerius 4) 7:54 against 12 min. Owner ruling (same day): clocks are still kept
  per tier across visits, so a re-entry can show a clock for a mob that is already up.
- **A tier's zone line is the open world too** (owner, 2026-11-03): `Lake Nerius 4 (Refined)` is the
  open-world +4 unless `Player <You> creating instance Lake Nerius <Id>.` came just before; the
  private instance prints the same zone line. A group invite (`X has asked you to join the
  instance: ...`) has no accept line. So the 2026-11-03 "re-entry is fresh" rows above may be
  private instances.
- **Places of a zone** (owner, 2026-11-03): open (anyone can join; the pickzone tiers `Zone`, `Zone 2
  (Adaptive)` ... `4 (Refined)`, `/pickzone` between them, 5 min apart) against a private instance
  (`Player <You> creating instance <Zone> <Id>.`, one at a time, the next closes the last, every mob
  up at creation), the difficulty +0 to +4 on either. A dungeon crawl is the `<Zone> - Group[ N
  (Adj)]` zone line (`You have completed the Dungeon Crawl` follows); nothing respawns inside.
  Not the only crawl shape (2026-11-18): a crawl run from a private instance keeps the plain zone
  line. `Player Drywrought creating instance The Ruins of Old Guk 257.` at 23:28:21, `You have
  entered The Ruins of Old Guk.` at 23:28:40, then `You have completed the Dungeon Crawl and earned
  reward loot!` at 00:01:47 with no `- Group` line anywhere. A crawl flag read from the zone line
  alone misses it; the completion line is the sure sign. The respawn time is the same in every place of a zone (owner).
- **Respawn across a visit elsewhere runs longer** (Corrupted Kedgespawn, open-world Lake Nerius 4,
  2026-11-03): death to first sighting 12:11-13:15 in one stay; 14:55-15:03 when you left the zone
  and came back (the owner waiting at the spawn).
- **Motes:** grade order Infinitesimal < Minor < Lesser < Major < Greater (< Superior). Yellow/red
  cons drop ~7-10 per 100 kills vs blue 4.2, green 3.1. Player level caps grade (~1 tier per 5
  levels). Party XP lines carry the percent: `You gain party experience! (0.718%)`.
- **Loot at a difficulty is that difficulty's tier** (owner's logs 08-12..11-19): D4 7,988 of 7,989
  gear loots are +4 (one +5); D3 629 of 635 are +3; D2 416 of 427 are +2; D1 325 of 402 are +1 (76
  are +2). A +N copy merges for 2^N item experience (wiki Item Upgrade System), so a D4 drop is 16.
- **Gear looted per kill at D4** (the owner's own loots over the group's kills, mobs with 10+ kills):
  raid roster 1.83 (263 / 144), named 0.99 (1,618 / 1,640), common 0.39 (4,924 / 12,716). One item
  from one mob: Innoruuk's jewellery 21-43% a kill (14 kills), Grandmaster R`Tal's Indicolite 33-42%
  (12), the same Indicolite from Hate trash 1-4% (a forsaken revenant 5 in 185).
- **Void-Touched Potential:** `You have been given: Void-Touched Potential`, one per weekly task
  `Potential of the Void - <boss> - Weekly`; 3 in every week from 2026-08-18 (14 weeks). A USE has
  no line of its own: it prints the ordinary `You have successfully merged two items together to
  create a new item: <Item> +N`, so a use is inferred (single-step tier-ups seconds apart at a high
  tier, soon after motes arrived), never read. Inferred uses, all at +7 or higher: Blood's Unity
  +8/+9/+10 (Oct 30), Talisman of Kejaar Kerrath +8/+9/+10 (Nov 3), Slime Blood of Cazic-Thule
  +9/+10 and Shield of Rainbow Hues +9 (Nov 11), Shield of Rainbow Hues +10 (Nov 17).
- **Ordinary motes at level 50 in Refined zones** (70.8 active hours, gaps under 5 min; 5,093 kills):
  Major 215, Greater 27, Superior 9, Grand 1, Ascendant 1, Infinite 0, plus fragments Major 4,
  Greater 2. Condensed two to one upward, the item experience an hour usable at a tier: +4 18.6, +5
  12.5, +6 7.8, +7 4.55, +8 2.6, +9 1.45. Hours for one tier by motes alone: 0.9, 2.6, 8.2, 28, 98,
  353. Active play over the same logs: 494 h in 14.3 weeks.
- **Fragments of Potential** (owner's logs, 2026-11-10 to 11-22, 64 active hours): none before the
  11-10 patch; 98 looted (Infinitesimal 63, Minor 1, Major 28, Greater 6), 64 of them from Reward
  Chests. Usable item experience an hour, condensed two to one: +4 5.04, +5 3.79, +6 2.76, +7 1.89,
  +8 1.38, +9 0.97. Loot lines read `You looted N Fragment of <grade> Potential from <source> and
  stored it in your currency`. The game's window for Fragment of Minor Potential (2026-11-22): Item
  Upgrade 3, Item Max Tier 2, Spell Upgrade 4. The wiki gives 3, a limit of +1, and 4: whether Max
  Tier 2 means "raises an item to +2" (the wiki's limit) or "usable on a +2" is not tested.
- **Raid cadence:** a raid boss at D4 1.3 kills a week (Innoruuk, 14 in 11 weeks); each plane entered
  at D4 1 to 3 times a week; `<Zone> - Group[ N (Adj)]` is also the group RAID instance (the first
  void mote arrived with the Innoruuk kill in `The Plane of Hate - Group`).
- **Con colours** (`src/shared/conColor.ts`) were measured by pairing each con with the HIGHEST
  "Welcome to level" so far (multiclass; the last ding is noise).
- **Faction:** the log prints numeric receipts (`has been adjusted by N`) and cap lines
  (`could not possibly get any better/worse`), no classic better/worse wording.
  `/outputfile faction` (singular) writes `<Char>_<server>-<CLASS>-Factions.txt` in the install
  root: TSV `ID/Name/StandingValue/PointsToMax`, standings clamped +/-2000. The con-rung floors in
  `factionTiers.ts` are classic community values, not measured.
- **Slayer counters** count by model race (a Ghost Dwarf counts as a Dwarf); `I'm a People
  Person!` counts only the true race; the Clockwork counter counts kills whose NAME says clockwork.
- **Log rotation:** the game opens the log by path per write. Moving the live log while EQ runs
  works; the game creates a fresh file on the next line.

## Alternate advancement: the game window and `/alternateadv list` (2026-11-25, owner's WAR/SHM/MNK)

Sources beside `plans/2026-11-25-aa-window/`: seven AA-window screenshots and the list's log text.

- **`/outputfile` has no AA kind.** The game's usage line: achievements, faction, guild, guildbank,
  guildhall, inventory, missingspells, raid, realestate, recipes [argument], spellbook. The
  `alternateadv` kind in `shared/outputs/kinds.ts` was the original author's unverified guess.
- **`/alternateadv list` (`/alt list`) prints to the log**: every AA the class combo can see, one
  block each, all lines in one second (118 blocks, 354 lines on the owner's log):
  `Ability #<id>: <name>`, `Description: <the rank's text>`, `Cost per Level: <n>`. No rank number.
  An ability not yet maxed prints a block per rank shown (current and next: Banestrike 1/4 prints
  its 2% and 4% texts; Class Reincarnation: Warrior 2/3 prints rank 2 and the activated rank 3); an
  unowned one prints rank 1; a maxed one prints one block. The `#id` is stable per ability.
- **The window** (General, Archetype, Class, Special tabs; Title, Cur/Max, Cost, Timer columns):
  Archetype and Class list only what the class combo can take. Cost is blank once maxed, 0 on
  Special rows. The owner: AA Points 20, Assigned 810, Total Spent 810.
- **WAR/SHM/MNK facts**: all 32 General AAs maxed. Archetype for this combo (29 seen, all maxed):
  Point Blank Fire, Healing Adept, Healing Gift, Spell Casting Mastery, Mastery of the Past, Spell
  Casting Deftness, Finishing Blow, Mass Group Buff, Quick Damage, Improved Bash, Ambidexterity,
  Double Riposte, Spell Casting Reinforcement 4, Mental Clarity 4, Physical Enhancement, Acrobatics,
  Destructive Fury, Pet Affinity, Rampage 2/2, Fury of Magic 4, Master of All, Healing Boon,
  Critical Affliction, Destructive Cascade, Persistent Casting 6, Intimidation, Companion's
  Discipline, Burst of Power, Mnemonic Retention 6. Class (13, all maxed): Warriors Endurance,
  Unbound Cascade, Unbound Wrath, Cannibalization, Improved Mend, Purify Body, Rapid Feign, Area
  Taunt, War Cry, Dragon Force, Innate Fighters Tenacity, Unbound Alacrity, Heroic Leap. Special:
  Banestrike 1/4; Class Reincarnation: Warrior, Monk, Shaman 2/3; Race Reincarnation: Half Elf 1/3
  and Iksar 1/3 (two reincarnations, one into each race); every other row 0/3.
- **Where the game differs from the wiki's AA page** (the game wins, WORKFLOW.md ruling):
  - Race lines are named `Race Reincarnation: <race>` in the game; the wiki writes `Class
    Reincarnation: <race>`.
  - The game has `Race Reincarnation: Drakkin` (#26145) and a placeholder `Race Reincarnation:
    Race 18` (#26151); the wiki has neither.
  - Rampage 2/2 shows cost 4 (the wiki: 1 rank, cost 5); Daybreak's 2026-10-22 notes added rank 2.
  - Pottery Mastery prints a fourth rank, cost 20: "reduces the chance of failing Pottery recipes
    by 50% and allows you to increase your skill past its Specialization cap by 5 points by
    learning more recipes" (the wiki: 3 ranks, 2/4/6; the window, a minute earlier, 3/3). Seen
    after a rank-3 purchase at 15:42 (cost 6).
  - Point Blank Fire is in the combo's Archetype list (Monk; Daybreak 2026-09-22: Rangers, Rogues,
    Monks, Berserkers).
- What it would take for other combos: the same `/alt list` after a loadout swap (the list follows
  the combo in force).

## /outputfile dumps

- **Inventory:** the bank is always in it. Hoard and Personal Depot appear only after that window
  was opened this session (`inventorySource.storagesCovered` records which). The Currency tab
  (Wind Runes, motes) is never in it, so the "rebaseline" count source reads held currency as 0.
- Location `Equipment` is the Storage > Equipment TAB, not worn gear (worn gear is named slots
  and their `-SlotN` sockets). `Augmentation` = Storage > Exaltations; `Activated` = Activated
  Items; these rows have an empty Count. The Equipment tab is listed incompletely (62 of 68 rows
  once).
- **Achievements:** the dump holds what the window shows, following its Show/Complete checkboxes.
  `General: Keys` and `EverQuest: Keys` are printed twice.

## Analysis methods

- **Parity replay** (offline fold of a log): `cd engine && cargo build --release -p parity`, then
  `engine/target/release/parity.exe <log> [--snapshots]`. The file name must be
  `eqlog_<Char>_<server>.<tag>.txt` (an extra dot segment) or parity refuses. Each snapshot is one
  giant JSON line, so count with `grep -o <token> | wc -l`, never `grep -c`. Bisect a poison line
  by slicing the log (`awk '/^\[Sat Aug 15/,0'`) and replaying.
- **Unknown-line audit:** parity's NDJSON, bucket `kind:"unknown"` by template (digits -> N, chat
  collapsed) and by last four words, with per-week histograms; a format change shows as one kind
  dying while an unknown family is born. An audit of unknowns misses MIS-parses: replay and
  eyeball the fields too.
- **Rate fits from the log:** bucket by the rank printed in the cast/tick line, take the MODE per
  bucket (means are dragged by crits and partial resists), compare inside one level and one day.
  Tick magnitude is immune to death/dispel/recast; tick COUNT is censored downward, so use the
  mode. Cast time, reuse and mana are not measurable from the log (stance changes and AAs
  confound them).
- **Log segmentation:** split on `You have entered`, then count per segment (slain lines, party XP
  % sum, motes by grade, `+N` gear loots, crawl flag, dings). Level-up lines do not name the class:
  split into monotonic ladders and identify each by class-spell evidence.

## Known log gaps (not built)

- The spell DB is wiki-only: `spells_us_str.txt` (landing/wear-off text per id) is read by
  nothing; ~36k unknown lines are landings it names (all Legends-only 74xxx spells). Touches the
  original design's parse-purity law; the owner decides. Related to issue #56 on the original repo.
- Unclaimed families: `Your <item> (Exaltation) flickers with a pale light.`, `<mob> tries to
  cast a spell on you, but you are protected.`, outgoing damage-shield absorbs (uncounted by the
  owner's 2026-10-25 rule: no damage passed). Claimed 2026-10-25: `You were hit by non-melee`
  (catch_all 71, the Environment row). `You have taken N damage from <Spell> by <mob>.` is
  counted by fix-self-dot-ticks (an agent measuring catch_all alone, which lacks it, read it as
  unknown: measure on main_community).
- Ally pet binds: a charm bind drops on every zone line; a summoned (`Summon`) bind is kept, as a
  summoned pet zones with its owner (2026-10-26, `ally.rs zone()`: Malkil's Gonekab lost 319k of
  damage over three zones when every bind dropped).
- The engine has no checkpoint: it replays the whole log from byte 0 every start (the creator
  built one, JOS-208, and removed it, JOS-230).

## /loc is in the log (EQ Legends, 2026-10-18)

- `Your Location is -790.65, 173.39, -12.01` IS written to the log file on EQ Legends (6 lines in the
  owner's live log on 2026-10-18), against `features/maps/locMarker.ts`'s header, which measured zero on
  the creator's log. Order is /loc's (y, x, z), the same order the wiki's `|location` uses.
- How far apart a mob's `/loc` points fall (owner's 68 placed mobs, 2026-11-10; 10 had two or more):
  standing NPCs 36 to 50 (A scouting kobold, Trooper Axyl, Scribe Noglleg), roamers 273 to 878 (a feral
  bleeder, a bleeder pupa, a dune spiderling, a kobold, Dar Guard Lraktol), one wanderer's three at 51 and
  118 (an undead servant). `gaps_locs.rs CLUSTER_UNITS` = 20 (owner's ruling, "20 or so"): points
  within it of a spot's mean are that spot, averaged; his standing NPCs' pairs above still read as two.
- The faction line on Legends is `Your faction standing with X has been adjusted by -20.` (or `could not
  possibly get any better/worse.`), printed just before the kill's death line, same second.

## Respawn constants from the owner's kills (2026-10-25)

- Castle of Mistmoore 4 (Refined), same-stay gaps ending at the first sign of life (2026-08-12..10-06 archive): Lasna Cheroon 8:50 (49 of 50 gaps at 526-532 s; the wiki says 8:50), Princess Cherista 8:48, a dark librarian 8:49, a cloaked dhampyre 8:50, Enynti 8:50 (the wiki says 22 minutes), Xicotl 4:55, a fallen noble 5:54. A named casts a buff the moment it spawns (`begins casting Greater Shielding`), so its gaps are second-accurate.
- Common names cluster at the 60 s floor (a deathly usher, the gargoyles): two spawn points sharing a name, not a respawn.
- Cost of learning every mob's gaps (respawn-first-sight): no slower (Oct log 105 MB: 28 s vs 30 s; Aug-Oct 334 MB: 85 s vs 91 s); respawn snapshot 5.5 KB to 72 KB and 125 KB.

## From the 2026-11-19 issue sweep

**Slayer kinds (fork #5)**

- 2026-11-19, committed mobs.json + mobRaces.json (8,154 catalog mobs), branch matcher: the
  `yieldsTo` rule changes the facts of exactly one mob, An emerald drake (page race Dragon, level 8
  ~ 14, Butcherblock Mountains): { race: 'dragon', nameTerm: null } becomes { race: '', nameTerm:
  'drakes' }. Mobs matching `True Dragons`: 84 before, 83 after. Mobs matching the You Call That a
  Dragon? line: 309 before, 310 after.
- mobRaces.json `races.Dragon` holds seven pages: An emerald drake, Hoshkar, Nexona, Silverwing,
  Trakanon, Trakanon (triggered), Xygoz. Lord Nagafen and Lady Vox are `Lava Dragon`.
- Dump lines (tests/fixtures/slayer-open-Achievements.txt): Dragonbane `True Dragons 19/250`
  (:234-235); You Call That a Dragon? `Dinosaurs, Dracoliches, Lesser Dragons, Drakes, Drixies,
  Raptors, Witherans, Wurms, and Wyverns. 90/1000` (:236-237); You Keep Dragon Me Into This `Drakes,
  Drixies, and Fay Drakes. 63/100` (:295-296); Here Be Dragons! 109/5000 (:178-179), which is 19 +
  90.
- Not measured: whether killing An Emerald Drake moves any drake counter in game (the reporter was
  asked in the reply draft).

**Respawn (fork #8)**

- Enynti, owner's log: four kills on 2026-11-12 in one stay in The Castle of Mistmoore 4 (Refined)
  gave gaps of 527, 567 and 529 s to the first sign of life; the page states 22 minutes. Under the
  agreement rule those three gaps agree on 527 s (8m 47s) and the 31 archived Aug to Oct gaps on 529
  s (8m 49s). Both cases are engine tests.

**Skills, combines, feign, fishing and forage lines (fork #6)**

- Skill-up line `You have become better at <Skill>! (<n>)`: archive 2026-08-12 to 2026-10-06 has
  5,071 lines over 61 distinct skills, every line with the value; live log 2026-10-25 to 2026-11-19
  has 195 lines over 11 skills.
- The line can repeat the level it already stated: `Specialize Evocation! (50)` 37 times in 7
  minutes (live log lines 286520-286873). A level can go down between lines: Specialize Evocation
  200 in the archive then 50; Forage 52 then 50.
- Combines (archive): 606 `You have fashioned the items together to create something new: X.`, 130
  `You lacked the skills to fashion X.`; a tradeskill tick lands in the same second for only 160
  successes and 55 failures. `You can no longer advance your skill from making this item.` (60
  lines) prints just before a trivial success; nothing reads it.
- Feign Death: no attempt line and no success line. Only `<You> has fallen to the ground.` (28
  archive, 5 live; mobs keep swinging, the failure) and `You are no longer feigning death, because a
  spell hit you.` A success rate cannot be computed.
- Fishing (live): `You cast your line.` 131, `You caught X!` 64, `You didn't catch anything.` 62,
  `You lost your bait!` 4, `You spill your beer while bringing in your line.` 16, `Your fishing pole
  broke!` 2. Forage: `You have scrounged up X.` 526 live / 159 archive, `You fail to locate any food
  nearby.` 568 / 357.
- Checked in code by this change: the real parser types `You have become better at Fishing! (127)`
  as Kind::SkillUp with skill `Fishing` and value 127 (test in skills.rs).

**Combines in detail (fork #6, measured 2026-11-20 on the 2026-08-12 to 2026-10-06 archive)**

- 736 combines (606 made, 130 failed), 43 items (31 of them on 2026-09-12; one only ever
  failed); Jewelry Making 2 to 205 in 204 raises, 129 of
  them on 2026-09-12 (563 combines, 91 minutes of crafting inside 4 h 43 min of clock).
- Raise and combine share a second. The raise is one or two lines before the combine line (133) or
  the line after (49); a failed combine can raise too. Taking both orders, all 204 raises pair.
  Only 215 of 736 combines carry a raise.
- `Consumed N x <item> (leaving M) from your personal depot.` precedes a combine made from depot
  stock (328 of 736): ingredient, quantity, stock left.
- `You can no longer advance your skill from making this item.` precedes a trivial combine, made
  or failed, in the same second or the one before.
- `Requesting favorite recipes...` prints when the tradeskill window opens. `Sorry, but you don't
  have everything you need for this recipe in your general inventory.` is a refused attempt, not
  a combine.
- Merchant lines: `You purchased N <item> from <merchant> for  N platinum N gold ...` (two spaces
  after `for`) and `You receive N platinum ... from <merchant> for the <item>(s).` 491 sales on
  2026-09-12, about 12,262 pp.
- Wiki trivials match the game: of 25 items that gave a raise, the last raise equals the
  `items.json` trivial on 22, is under it on 3, over it on none. All 31 items made have a
  `craftedBy` with a trivial and ingredients.
- The Inventory dump lists depot stock as `Personal-Depot<n>` rows (143 in the owner's dump of
  2026-11-20). `items.json` has no merchant data: no record says who sells an item.
- Merchants pay for a made jewel what its materials cost at the same merchants: Golden Ruby Ring
  141.75 pp of Gold Bar (10.50) and Ruby (131.25), sold for 141.75; Fire Emerald Golden Bracelet
  99.75 and 99.75; Golden Jaded Bracelet 14.88 and 14.17. Over the four crafting days: about
  28,823 pp paid, 13,452 pp received. The money lost is the failed combines.
- The in-game Tradeskill Window's search (owner, in game, 2026-11-20, Tailoring 1 in a Large
  Sewing Kit, Max Trivial 300): it lists only recipes within about 30 of the skill. "cloak" gave
  seven recipes at trivial 26 and 36 and none of the wiki's cloaks at 56 and up; "quiver" (wiki
  trivials 115, 115, 222) gave nothing. A search with no name lists nothing. So a recipe far above
  the player's skill cannot be checked in that window. The list named Leather Cloak and Small
  Leather Cloak at 36, which the wiki's Tailoring recipes do not have (not followed up).
- `/outputfile recipes Jewelcrafting` (owner, in game, 2026-11-20): the game prints `You haven't
  learned any notable Jewelry Making recipes, yet...` and writes no file, at skill 205 with 31
  recipes made. The dump is for "notable" learned recipes, not ordinary ones.
- Skill-mod items in `items.json`: five, as `Skill Mod: Fishing +5% (10 Max)` style strings in
  `stats.flags` (four Fishing, one Baking).

**The engine's `crafting` module on the same archive (2026-11-20, `parity --snapshots` on a copy)**

- The module gives 736 combines (606 made, 130 failed) over 43 items; 215 paired raises (Jewelry
  Making 204, Brewing 7, Baking 4); Gold Malachite Bracelet 92 made, 29 failed, 33 raises, 114
  to 146. A line-by-line count of the same file agrees on every number.
- Raise order, all 215: before the line of a made combine 160, after the line of a failed one 55,
  never the other two ways. No two combines share a second, so the pairing is never ambiguous.
- One tradeskill line pairs with nothing: a point bought from a trainer (`You have become better
  at Alchemy! (2)`, then the trainer's `You have increased your skill in Alchemy.`).
- The trivial notice: 60 lines, each claimed by a combine within one second.
- By-product: `You have fashioned the items together to create an alternate product: Bottle.`
  (4 lines, with `an`), each in the second of a failed Brewing combine and after its raise. It
  is not a combine of its own.
- `Consumed` lines: 466 for 328 combines, one per ingredient drawn. `You have deposited N <item>
  to your personal depot.` (254) and `You have taken N <item> from your personal depot.` (20)
  state a quantity and no count left. Refused attempts (`Sorry, but you don't have everything
  ...`): 54.
- Crafting spans (gaps over five minutes end one): 11. The four of 2026-09-12 hold 563 combines
  and 129 raises in 91.4 minutes: 369 combines and 85 raises per crafting hour.
- Merchants, whole archive: 680 purchase lines, 3,951 items of 555 distinct names, 57,811 pp;
  1,258 sale lines over 375 names, 45,815 pp. Most rows are not tradeskill goods (spell scrolls,
  drink, loot sold).
- Snapshot: 149 KB as JSON (bought 92, sold 44, items 10, spans 1.2, depot 1.1, levels 0.4).

**Fishing and forage outcomes (fork #6, measured 2026-11-20, read-only, on the owner's three logs)**

- Live log (2026-10-25 to 2026-11-20, 1,223,143 lines): `You cast your line.` 131; `You caught
  <X>!` 59 over 5 names; `You caught something...` 5 (no `!`, no name; after each the player
  destroyed a junk item within 12 s, so it is a catch); `You didn't catch
  anything.` 62; `You lost your bait!` 4; `You spill your beer while bringing in your line.` 16;
  `Your fishing pole broke!` 2. The 64 in the fork #6 block above is the 59 and the 5 together.
- October archive (2026-10-06 to 2026-10-25): casts 72, caught 26 named over 5 names and 7
  unnamed, nothing 35, spilled 8, lost bait 2, pole broke 0. The August archive has no fishing line.
- Lost bait, spilled beer and a broken pole are not outcomes of their own: each was followed in
  its second by `You didn't catch anything.` (32 of 32 over both logs). So of the live log's 62
  misses, 22 carry one of the three.
- A cast is followed by its outcome 11 to 30 s later (185 of 190; five within 3 s). 13 of 203
  casts had no outcome line at all (the next fishing line was another cast, or there was none):
  `You stop fishing and go on your way.` (4 lines, printed twice per stop) or nothing. 4 outcome
  lines had no cast line before them. Casts with an outcome: 125 live, 65 in October.
- Refused fishing prints no cast: `You can't fish while holding something.` 17, `Trying to catch
  land sharks perhaps?` 3 (live).
- Forage: `You have scrounged up <X>.` 550 live over 19 names, 659 over 26 in October, 159 over
  15 in August; `You fail to locate any food nearby.` 588, 659, 357. Two live lines have an
  article (`a Tuft of ...`); the rest name the item bare. Refused attempts print neither line:
  `You must wait longer before you can forage.` 30, `You can't try to forage while attacking.`
  24, `You must be standing to forage.` 12 (live).
- The parser types none of the eight shapes: all reach a module as `unknown`.
- The engine's `crafting` module on a copy of the live log (`parity --snapshots`, debug build,
  79 s): fishing 131 casts, 64 caught, 62 nothing, 4 lost bait, 16 spilled, 2 pole broke, 5 item
  rows adding up to 59; forage 550 found, 588 failed, 19 item rows adding up to 550. A line count
  of the same file agrees on every number and on every item's count. Both sessions were 0: no
  fishing or forage line follows the log's newest offline gap.
- Snapshot on the live log: 26.6 KB as JSON, 1.7 KB of it new (fishing 0.5, forage 1.2). The live
  log has no combine, so its `items`, `levels`, `spans` and `depot` are empty and no
  by-product line was there to count.

**Left menu (fork #10)**

- Measured in the hidden e2e app, fresh install, default window (inner 1280 x 860, 100%), every
  group open: the drawer is 820 px tall. At 14 px text in 32 px rows the open menu was 841 px and
  scrolled by 21 px: 20 destination rows of 32 px (Overview, seven under Stats/Data with Skills, nine
  under Research, two under Config, Preferences), three group headings of 28 px, and the Send
  feedback row at 57.4 px.
- The Send feedback row is 41.8 px when the menu fits. It read 57.4 px only because the menu was
  overflowing: the scrollbar narrows the text column and the row's second line ("Off in the
  community build") wraps. So the true overflow at 32 px rows was about 5 px, the Skills row, and
  the scrollbar it caused made it 21.
- At 28 px rows (the default since): the menu is no taller than the 820 px drawer and every
  destination row reads back 28.0 px. The row heights always read back exactly as set, so the
  styling holds; only the total was wrong.
- 2026-11-20, with the Tradeskills row (21 destination rows, ten under Research): the menu's
  blocks take 774 px of the 820 px drawer and nothing scrolls (`tradeskills.e2e.mts`, the sum of
  the drawer's children). 46 px spare: one more 28 px row fits, a second does not.

## The engine against a large log (2026-11-19, owner's PC: 16 cores, 64 GB, busy with other test apps)

- From `plans/2026-11-19-reading-log-robustness.md` ("Measured on a real machine"), where each
  number has its method and its caveats. Synthetic logs of a real shape (fights of 20 to 180 s, a
  pet, two group members) and a private copy of the owner's 99 MB log.
- Read rate: 7 to 11 MB of log a second with CPU to spare. Attach to live: 9 to 12 s at 99 MB
  (real), 55 to 73 s at 500 MB, 100 to 150 s at 1 GB, 208 to 270 s at 2 GB. The gap between the last
  progress frame and live is under 0.2 s.
- Engine memory at go-live, not released afterwards: about 0.5 GB at 99 MB (real), 2.2 to 3.1 GB at
  500 MB, 4.3 to 5.8 GB at 1 GB, 8.6 to 11.3 GB at 2 GB: 3.8 to 5.9 MB per MB of log, by shape. The
  combat fight history dominates it.
- Answers once live do not slow with size: a window's meter 1 to 7 ms and a warm module 0 to 25 ms
  up to 2 GB; the slowest first build of a module 720 to 760 ms (gaps). No window reply over 1.7 MB
  on those logs (they were mostly before the 2026-07-28 character epoch, which clears
  character-scoped modules such as loot: a log wholly after it grows loot at about 3.7 MB per GB of
  that shape).
- The reply that grows without bound is the loot history: 122 to 129 characters per looted item
  (10.5 KB of reply per MB of the owner's log). 8 MiB (the old limit that ended the connection) is
  about 65,000 looted items; 32 MiB (not shown) about 260,000 to 275,000; 64 MiB (not read) about
  520,000 to 550,000. The 1.19 MB "event feed" of the first measurement is the `messageOverlay`
  module; `eventFeed` is capped at 100 rows.
- A long loot history is paid for on every pickup: each new loot line makes every window that holds
  loot fetch the whole history. At 110,000 rows: engine about 45 ms, main's parse 33 to 48 ms, the
  hand-over to a window 245 to 280 ms, main stalled 155 to 410 ms per loot line.
- The engine refuses an ask its one reader thread has not answered within 5 s of being posted
  (`world.rs SNAPSHOT_PATIENCE`); it still finishes the build and drops it, and the log tail and
  every other ask wait behind it.
- The only shape found that makes the meter's own reply large or slow is one fight (or zone stay)
  with tens of thousands of mob instances: about 1,160 bytes and 40 to 50 microseconds per row of
  `selected.incoming` (81 MB and 2.6 to 3.4 s at 70,111 rows). The owner's largest fight has 38 such
  rows.
- The watchdog: with CPU to spare a health probe on a new connection takes at most 15 ms during a
  read (1,140 probes), and 14 launches from 99 MB to 2 GB ended no engine. With the engine starved
  (pinned to one core shared with a normal-priority spinner) the same probe takes 4.8 to 4.9 s at
  the median against the 5.0 s limit (7 of 83 single probes over 5 s, the worst 13.8 s; up to 18 s
  when probes overlap), while the app's own kept connection is answered in milliseconds and was
  never silent longer than 8.4 s. In the app: at Idle priority 4 engine restarts in 10 minutes and
  the log never live (one run; a 6 minute re-run saw none); at BelowNormal, the app's default, 4
  timeouts, all forgiven by the second ask, and no restart in 10 minutes, the read crawling at 0.045
  MB/s (about 160 times slower); with every process of the app starved, one kill and then 13
  launches that missed the 10 s announce wait (a starved engine alone announces in 4.8 to 5.1 s). A
  kill needs two timeouts in a row, so the rate varies widely; an endless loop was shown only at
  Idle.
- The e2e harness switches the app's lowered priority off, so no e2e run exercises the BelowNormal
  engine a real install runs.

## In-game macros (2026-11-20, owner's game window and files)

- A character's macros are in `<Character>_<server>_LO<n>.ini`, `[Socials]`: one file per class
  loadout, numbered from 1. A new loadout's file starts as a copy of the first (macros and hotbars).
- Name 15 characters, five lines, 255 characters a line (typed to the stop, read back from the file).
- 10 pages of 12 buttons = 120 macros. Page 1 is 12 built-ins (Assist Main ... Who) and is not in the
  file; pages 2 to 10 are the player's 108.
- Colour numbers 0 to 19, top row then bottom row of the edit window; RGB in `EQUI_SocialEditWnd.xml`.
- A hotbar button stores `E<n>`, a zero-based macro slot, `n = (page - 1) * 12 + (button - 1)`, 0 to
  119 (five buttons on the owner's bar). No name is stored. Values of 120 and up are something else.
- The game rewrites the character file within seconds of a macro being saved, while logged in.
- No ini file names a loadout or its classes. The log prints no line naming a loadout switch: around
  the owner's two switches of 18:39 and 18:41 the only system line was "You are not currently
  assigned to an adventure." (two samples; not known whether it also prints at other times).
- The character's own `/who` row names classes AND race:
  `[36 WAR/MNK/SHM] Drywrought (Half Elf) <Neon Knights> ZONE: ...`. It says nothing of which loadout
  is on. The live log can be short after an archive: search `Logs/companion-archive/*.log.gz` too.
- Not measured: whether the game picks up an outside edit of `[Socials]` at login.

## Pet owner guesses (2026-11-21, the owner's 3 sealed archives, 2026-08-12 to 2026-11-20)

- Real fold replay: 91 guesses, 25 right, 0 wrong, 57 with no later leader line, 9 with a line only after the stretch (8 name the guessed owner, 1 someone else, 23 h later across a zone change).
- A stretch ends at the pet's death, the guessed owner's next summon, a new guess of that name, a zone change or a 30-minute log pause.
- 88 of 91 guesses and all 25 judged are one group mate. The 95% upper bound on the wrong rate is about 11% if independent. A stranger's pet joining inside the window is not tested.

## Hand-in reward inference (2026-11-21; 6.6M lines, 4 characters, 563 completed NPC trades)

- Rule tried: an item's first sighting within 60 s of a completed NPC trade, no earlier mention. Replayed with the log's own give lines hidden, 15 known rewards: 2 right, 0 wrong, 13 missed; of 6 other firings 1 is provably wrong and 5 cannot be judged. At 300 s: 3 right, 2 wrong. Not shipped.
- The game prints `You have been given: X` for some rewards and nothing for others (Beacon Mount), so a silent reward cannot be read from the log.

## The Painting's repeatable hand-in (2026-11-21, the owner's log)

- 4 Capt. Orlin's Spiced Ale to Palatos Kynarn is one hand-in: +5 Craftkeepers, +5 High Council of Erudin, -1 Heretics; High Guard of Erudin was already at max (the wiki states +5). At 52 copper an ale, 2 gold 8 copper a hand-in.
- A stack counts: one trade of 100 ales printed 25 replies. 1,704 ales made 426 hand-ins. Craftkeepers reached max at 17:20:22 and High Council at 17:21:46, nearly all of it in about 8 minutes; 1,804 ales bought for about 94 platinum.
- The game prints no receive line for this quest's items: Beacon Mount, Ak`Anon's Portrait. Only the NPC's words hint at them (`Here is the portrait ...`). The log also never lists what went into a combine, so a Copy page cannot state a recipe's materials from it.
