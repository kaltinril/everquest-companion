# Agent notes: measured game facts and analysis methods

Facts about EQ Legends established from real logs, dumps, in-game screens, or the wiki's own
source. Cite these instead of classic-EQ folklore. Each says how it was measured, so it can be
re-checked. "Owner's log" = the owner's character log, Aug 2026 onward (multiclass WAR/MNK/SHM,
SK, others).

## Spells

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
  to level 1 for reincarnation AAs (early access now, everyone on 2026-12-08). NOT CHECKED: what
  the app's level history does with that reset.
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
  (Adj)]` zone line (the log's only crawl shape; `You have completed the Dungeon Crawl` follows);
  nothing respawns inside. The respawn time is the same in every place of a zone (owner).
- **Respawn across a visit elsewhere runs longer** (Corrupted Kedgespawn, open-world Lake Nerius 4,
  2026-11-03): death to first sighting 12:11-13:15 in one stay; 14:55-15:03 when you left the zone
  and came back (the owner waiting at the spawn).
- **Motes:** grade order Infinitesimal < Minor < Lesser < Major < Greater (< Superior). Yellow/red
  cons drop ~7-10 per 100 kills vs blue 4.2, green 3.1. Player level caps grade (~1 tier per 5
  levels). Party XP lines carry the percent: `You gain party experience! (0.718%)`.
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
  creator's parse-purity law; a design conversation. Related to upstream #56.
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
