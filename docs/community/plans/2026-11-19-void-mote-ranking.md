# Void mote ranking (2026-11-19)

Built on `void-motes-tab`. What was asked: `requirements/gear-tab-improvements.md`, rows of
2026-11-18 and 2026-11-19. Code: `src/shared/planner/itemSupply.ts` (how fast copies come in),
`supplyContext.ts` (the catalogs folded), `voidMotes.ts` (the ranking, the gate, the week's plan),
`src/main/planner/gearSupply.ts` (the file reads), `features/gear/VoidMotePanel.tsx` and
`voidMotePrefs.ts` (the tab and its words). Tests: `tests/voidMotes.test.mts`.

## The owner's rules (2026-11-19)

- Six things make an item hard to come by: (1) how often the mob can be spawned or killed, (2)
  placeholders, (3) how often the zone, instance or raid can be started, (4) the chance it drops,
  (5) copies are wanted at +4, (6) how hard the zone and the mob are (level, hits, numbers, HP,
  resists, mechanics: "Lord Rick").
- The point: a weekly raid boss's drop with a low rate that needs a group at +4 is worth a mote
  ahead of a "Rare" drop from random trash in an instance. A common drop from many mobs in many
  zones is the easy end.
- 3 void motes a week, so each is valuable. Several may go on one item.
- Almost never below +7. Exception: an item extremely hard to get (the Plane of Sky ranger bow:
  many kills for a chance at each turn-in, then a +0 bow) may take one at +5 or +6. +6 is not hard
  to reach from +0.
- Calibration (owner, same day): the ranking should roughly agree with what the motes were
  actually spent on. "I wouldn't use it on a crushbone belt."

## Game facts used

From the committed wiki cache (`scripts/sources/cache/pages/`: Mote Guide 59130, Item Upgrade System
57487, Difficulty Levels 58090, Personal Instance 58092, patch notes 57054). No request was sent.

- Tier T to T+1 costs 2^T item experience. A merged copy at +N gives 2^N. A +0 copy gives 1, a +4
  copy 16.
- Ordinary motes, points on an item and the highest tier they work on: Infinitesimal 1 (+0), Minor
  1 (+1), Lesser 2 (+2), Potential 4 (+3), Major 5 (+4), Greater 6 (+5), Superior 7 (+6), Grand 8
  (+7), Ascendant 9 (+8), Infinite 10 (+9). Two of a grade condense into one of the next; the page
  says the construct takes up to Grand ("Needs Confirmed"), so Infinite may not be reachable that way.
- Void-Touched Potential: one full tier whatever the banked progress; at most 3 a week from solo
  and group raids together; the week resets Tuesday about 8 AM PT; only 3 can be held.
- Loot rolls the zone's difficulty or higher: D4 drops +4.
- Raid loot: each named raid creature gives full loot once a week per difficulty (resets Tuesday
  8 AM PT); inside the lockout a kill still gives one drop from its own table.
- Personal instance: 2 charges, 1 an hour, every spawn up at creation.

Owner's mote numbers against the tables: Major 5 up to +4, Greater 6 up to +5, two Major to one
Greater, 4 Major for +4 to +5 (16 / 5) and 10 Major (5 Greater) for +5 to +6 all agree. Two do not,
both kept: "about 1 Major for +0 to +4" where the tables say 15 experience, 3 Major; and the wiki's
own 5 Greater for +5 to +6 is 30 against the 32 the tier costs.

## Measured (owner's logs, 2026-08-12 to 2026-11-19, 14.3 weeks; MEASURED.md has the rows)

- Void motes received: 3 in every week from 2026-08-18 on (14 weeks).
- Loot at D4 is +4: 7,988 of 7,989 gear loots (one +5).
- Gear looted per kill at D4, by the mob's class: raid roster 1.83, named 0.99, common 0.39.
  Median loot list: 14, 2, 7.
- One item from one mob at D4: Innoruuk's jewellery 21 to 43% a kill (14 kills); Grandmaster R`Tal's
  Indicolite 33 to 42% (12 kills); the same Indicolite from trash 1 to 4% (a forsaken revenant 5 in
  185, Innoruuk's Chosen 3 in 78).
- A raid boss at D4: 1.3 kills a week (Innoruuk, 14 in 11 weeks). Each plane entered at D4 1 to 3
  times a week.
- Ordinary motes, level 50 in Refined zones, 70.8 active hours, 5,093 kills: Major 215, Greater 27,
  Superior 9, Grand 1, Ascendant 1, Infinite 0. Condensed upward that is the item experience an hour
  usable at each tier: +4 18.6, +5 12.5, +6 7.8, +7 4.55, +8 2.6, +9 1.45 (the last only if
  Ascendant condenses to Infinite). By motes alone a tier costs 0.9, 2.6, 8.2, 28, 98, 353 hours.
  The jump from 8 to 28 hours at +7 is the owner's "almost never below +7", measured.
- What the motes went on (inferred: a use prints only the ordinary merge line, so a use is read
  from single-step tier-ups seconds apart at a high tier soon after motes arrived): Blood's Unity
  +8, +9, +10 (Oct 30); Talisman of Kejaar Kerrath +8, +9, +10 (Nov 3); Slime Blood of Cazic-Thule
  +9, +10 and Shield of Rainbow Hues +9 (Nov 11); Shield of Rainbow Hues +10 (Nov 17). Every one at
  +7 or higher, usually all three on one item to finish it. Owner in party chat: "figured this is
  unique enough i just blew them on it" (the Talisman).

## The algorithm

For each worn item below +10:

1. **Gain**: what the next tier adds for the chosen focus or stat (unchanged).
2. **Supply**: item experience a week of play that copies bring in, every stated road added
   (`itemSupply`). A road is a mob that drops it or a quest that rewards it.
   - drop road = kills a week x chance a kill x 16 (a +4 copy) / hardness
   - quest road = turn-ins a week x 1 (a +0 copy), as fast as its slowest part
3. **Hours** a void mote saves: `2^tier / (supply an hour + share x ordinary-mote experience an hour
   at that tier)`. Both roads count because a player uses both.
4. **Score** = gain x hours. Recommended sorts by it; Biggest gain by the gain; Most hours saved by
   the hours.
5. **Gate**: +7 or higher is a pick. +5 and +6 are a pick only when supply is at most 0.5
   experience a week ("copies barely exist"). Everything else reads "not yet", sorted below the
   picks, and never takes a mote.
6. **The week**: the best pick takes a mote, the item is weighed again one tier higher, repeat to
   three. So two or three can land on one item. When picks run out the rest are held.

A player's reading of it: finish the highest tiers first, on the pieces whose copies come slowest,
weighted by how much the piece gives you.

### The six factors

| # | Factor | Computed from | When the data is silent | Rests on |
| --- | --- | --- | --- | --- |
| 1 | how often the mob can be killed | `respawns.json` seconds (555 pages); spawn points from `mobs.json` `loc` | 600 s, named 1 spawn, common 4: listed as assumed | data where stated, else a stated default |
| 2 | placeholders | the spawn points' stated shares, summed (`loc[].pct`; 3,125 mobs state one) | counted as always up | data where stated |
| 3 | how often the raid or instance starts | raid roster (`bosses.json`) or a stated respawn of a day or more: 1 kill a week; other mobs of a raid zone: the 16 runs a week it can be run; a respawn over an hour: 1 personal instance an hour | the camp rule | the lockout rule is the wiki's and measured (1.3 a week); 16 runs is the ceiling (re-made about hourly, measured), the habit was 2 |
| 4 | the chance it drops | gear a kill of the mob's class drops / its loot list size (drop groups counted) | list size 14, 2 or 7 by class: listed as assumed | a proxy: no rate is in the data. Anchored on measured gear per kill |
| 5 | copies at +4 | a drop counts 16, a quest reward or a crafted item 1 | none needed | the game's rule; assumes the player farms at D4 |
| 6 | how hard the mob is | raid target, raid zone, level over 50, a hand-kept mechanics list (`MECHANIC_MOBS`: Lord Rikantus Everling) | not harder | judgment, except the level |

Not read at all: the owner's own loot history at run time (the measured rates above set constants
only).

### The weights (`itemSupply.SUPPLY`, `voidMotes.MOTE_RULES`)

| Constant | Value | Reason |
| --- | --- | --- |
| `dropCopyExp` / `madeCopyExp` | 16 / 1 | a +4 copy against a +0 one (factor 5) |
| `dropsPerKill` raid / named / common | 2 / 1 / 0.4 | measured 1.83 / 0.99 / 0.39 |
| `lootDefault` raid / named / common | 14 / 2 / 7 | measured medians |
| `respawnDefault` | 600 s | the owner's camps run 530 to 570 s |
| `commonPoints` | 4 | a guess: a common mob stands in several places |
| `killsPerHourCap` | 30 | a guess: no camp yields more of one name |
| `instancesPerHour` | 1 | 2 charges, 1 an hour |
| `raidKillsPerWeek` | 1 | the weekly lockout; measured 1.3 |
| `raidRespawn` | 1 day | a stated respawn this long is a raid-style target |
| `raidRunsPerWeek` / `raidZonePoints` | 16 / 6 | the CEILING, as a camp's kills are (factor 3 asks how often it CAN be started): 20 hours over a 75 minute clear; a plane's instance is re-made about hourly (a second Refined Hate 67 to 92 minutes after the first, four days). The owner's habit was 2 runs a week (30 Refined Hate entries in 14.3 weeks). Was 2 in the first cut. 6 points is a guess |
| `partsPerHour` / `craftedPerHour` | 2 / 4 | guesses, always listed as assumed |
| `hard.raid` / `hard.group` | 2 / 1.5 | judgment: a +4 raid target needs a group; so does a raid zone |
| `hard.levelStep` | 0.2 a level over 50 | judgment: level 65 is 4 times slower |
| `hard.mechanics` | 2 | judgment, hand-kept list |
| `hoursPerWeek` | 20 | turns a weekly kill into an hourly rate; the order does not change from 5 to 35 |
| `moteExpPerHour` | 18.6, 12.5, 7.8, 4.55, 2.6, 1.45 (+4 to +9) | measured, one player, level 50, D4 |
| `fragmentExpPerHour` | 5.04, 3.79, 2.76, 1.89, 1.38, 0.97 (+4 to +9) | measured 2026-11-22, one player, since fragments began on 2026-11-10: 64 active hours, 98 fragments (64 from Reward Chests), wiki fragment points, condensed two to one. Assumes fragments condense like motes (the owner hands them to the Construct; the log prints no result). Adds 28% to 77% to the motes' rate, most at the top tiers, where few high grades were seen |
| `moteShare` | 0.05 | judgment: one item's share of the ordinary motes, among about twenty worn pieces and the spells. Was 0.5 in the first cut: the motes then swamped the copies, so the six factors moved nothing at +7 and up and the tier alone ordered every scarce item (see "Review") |
| `minTier` / `rareMinTier` / `rarePerWeek` | 7 / 5 / 0.5 | the owner's rule and exception; 0.5 sits between the Sky test rewards (0.07 to 0.34) and a raid boss's drop (1.0) |

### Unknown is not easy and not hard

- A page that states no source at all leaves `supply` absent. Hours then count ordinary motes only,
  and the row says "Not listed". That reads as scarce: stated here because it is a choice.
- Each assumed fact is named on the row's hover ("respawn, spawn points assumed").

## Check against the owner's character (dump of 2026-11-18, focus Balanced)

| | Before (2026-11-18 formula) | After |
| --- | --- | --- |
| 1 | Indicolite Breastplate +9 | Indicolite Breastplate +9 (526 h) |
| 2 | Indicolite Greaves +8 | Earring of Bashing +8 (190 h; Innoruuk) |
| 3 | Indicolite Vambraces +8 | Indicolite Vambraces +8 (166 h) |
| 4 | Darkbrood Mask +7 | Indicolite Greaves +8 (132 h) |
| 5 | Earring of Bashing +8 | Darkbrood Mask +7 (55 h) |
| 6 | Indicolite Boots +5 | Bloodstar Pendant +7 (55 h) |
| week | the top three rows | Breastplate +9 to +10, Earring of Bashing +8 to +10 |

- Not yet: Indicolite Boots +5, Runed Bolster Belt +5, Hammerhead Helm +6.
- Allowed early (the exception): Back Straps of Mastery +6, Azure Ruby Ring +6, Ton Po's Shoulder
  Wraps +5, all Plane of Sky test rewards, ranked below every +7.
- Last of the picks: Cloak of Treason +7 (2.5 h: its mob reads as an ordinary camp).
- The four items the motes went on, put back at their tier then: each is a pick and each outranks a
  common piece for a stated reason (pinned by name in the tests). Slime Blood +8 takes two motes to
  +10, as it did. Blood's Unity at +7 ranks below the +8 raid pieces of that week, where the owner
  put all three on it; the Talisman likewise. The model does not explain those two choices: see
  the questions.
- Changed during the check: the mote road was first the faster-road-only rule (every scarce item
  then tied at a tier, and Indicolite led an Innoruuk drop on gain alone); it became the blend with
  `moteShare`. The level step went 0.1 to 0.2 and stopped applying inside raid zones. The week's
  plan stopped filling up with "not yet" rows.

## Review (2026-11-19, before the merge; the owner asked for one against the rules above)

- Finding: in the first cut the supply was computed and then did not count. At `moteShare` 0.5 the
  ordinary motes brought 0.7 to 2.3 experience an hour against 0.05 to 0.25 from copies of anything
  scarce, so hours were the tier's alone (55, 190, 526 at +7, +8, +9 for a raid boss's drop and for
  Hate's trash armour alike) and Indicolite Breastplate +9 led every raid boss's drop. The owner's
  rule says the opposite, and the owner spent 12 motes over four weeks with none on it.
- The supply itself checks against the owner's loot lines (14.3 weeks): Indicolite Breastplate 8
  copies looted, 5 at +4, so 0.35 a week at 2 runs a week; modelled 0.31. Earring of Bashing 12
  looted, 5 at +4: a raid boss's drop came in no slower than the trash piece at the owner's habit.
  What separates them is the lockout: more runs bring more Indicolite, never more of Innoruuk's.
- Two constants changed, nothing else: `moteShare` 0.5 to 0.05, `raidRunsPerWeek` 2 to 16 (the
  ceiling). The plan stays one mote at a time; a best-total split over the three was tried and put
  all three on a +7 raid piece ahead of finishing a +8 one, against the list's own first row.
- After, the owner's dump of 2026-11-18, Balanced:

  | # | Row | Hours | Why |
  | --- | --- | --- | --- |
  | 1 | Earring of Bashing +8 | 1,422 | Innoruuk, weekly |
  | 2 | Indicolite Breastplate +9 | 296 | Hate and Fear trash, re-runnable |
  | 3 | Darkbrood Mask +7 | 461 | Innoruuk |
  | 4 | Bloodstar Pendant +7 | 461 | Innoruuk |
  | 5 | Hotof's Bracer +7 | 461 | Innoruuk |
  | 6 | Back Straps of Mastery +6 (allowed early) | 163 | Sky test |
  | 7 | Indicolite Vambraces +8 | 145 | Hate trash |

  The week: Earring of Bashing +8 to +10, then Indicolite Breastplate +9 to +10.
- Against the motes spent: the week of Nov 11 replayed (Slime Blood and Shield of Rainbow Hues back
  at +8) plans Slime Blood +8 to +10 and Earring of Bashing +8 to +9. The owner's merges that night:
  Slime Blood +9 and +10, and Earring of Bashing +8 one minute after the third mote arrived.
- Still not reproduced: all three on Blood's Unity from +7 (the data lists it as a camp drop, which
  it is not) and on the Talisman.
- Side effect: 6 of the 95 Plane of Sky test rewards leave the +5/+6 exception, because their parts
  come from island mobs that are no raid target (Ton Po's Shoulder Wraps, 2.3 a week). The ranger
  bow (Windstriker, 0.063) and 88 others stay.
- The hours are an index now, not a forecast: at a twentieth share a raid boss's +9 reads 4,180
  hours. The tab's order is what they are for.

## Known gaps

- Drop rates are a proxy. A boss's listed item drops more often than its list size says (Innoruuk:
  modelled 12.5%, measured 21 to 43%), so raid supply is understated about threefold. The order
  holds; the exception's 0.5 threshold is the number most exposed to it.
- The player's own history is not read: the loot ledger knows how many copies really came in.
- A quest is assumed repeatable and its reward +0. Blood's Unity is listed as Lord Rikantus
  Everling's drop, never appears in a loot line, and its copies were merged at +1 to +4: how it is
  really come by is not known to the data.
- The mote table is one player's, at level 50 in D4. A lower level or difficulty earns less.
- Not modelled: spells (a void mote lifts a spell rank too), banked progress (the dump states `+N`
  only), a piece about to be replaced, lower-difficulty raid kills (D0 to D3 add up to 15 more
  experience a week), the one guaranteed drop inside a lockout.
- The gear index payload grows about 0.72 MB (12%) for the `supply` field on 6,387 rows.

## Questions for the owner

1. Blood's Unity and the Talisman took all three motes at +7 while Breastplate sat at +9 and
   Earring of Bashing at +8. Is finishing one item to +10 worth more than the single dearest tier?
   If so the plan can prefer the item three motes finish.
2. Indicolite Breastplate has been +9 since October 1 with no mote spent on it. Should Indicolite
   (trash in Hate and Fear) rank below every raid boss's drop whatever its tier?
3. How is Blood's Unity come by: a drop, or a quest reward, and at what tier?
4. Which other mobs belong on the hard-mechanics list beside Lord Rikantus Everling?
5. With nothing at +7 the tab now says to hold the motes. Only three can be held: is that right, or
   should it name the best of the rest?
6. The estimate assumes copies are farmed at D4. Is that right for the testers too?
