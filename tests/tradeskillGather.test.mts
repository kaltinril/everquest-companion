// Fishing and forage outcomes as the Tradeskills section draws them (fork #6: "Fishing and
// Foraging also come to mind"): the figures, lines and rows of src/shared/tradeskillGather.ts, on
// counts in the shape of the owner's live log (MEASURED.md, "Fishing and forage outcomes": 131
// casts, 64 caught of which 5 unnamed, 62 nothing, 4 lost bait, 16 spilled, 2 pole broke; 550
// found and 588 failed over 19 names). No log is read.
//
// WHAT IS PINNED HERE:
//   1. THE CATCH RATE is caught over the casts that printed an outcome; a cast with none is in its
//      own line and in neither side.
//   2. LOST BAIT, SPILLED BEER AND A BROKEN POLE are drawn apart and never added to the misses.
//   3. A CATCH THE GAME DID NOT NAME is in Caught, in no item row, and in the shares' whole.
//   4. THE SESSION LINE is drawn only when the session has a line of its kind.
//   5. THE FORAGING TILE draws nothing when the log shows no forage line and no Forage level; with
//      either one it draws, with the top five items and a switch to all of them.
//   6. THE WORDS on screen, with no em or en dash.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AASpendLike } from '../src/shared/aa'
import type { FishingCounts, FishingSnap, ForageSnap, GatheredRow } from '../src/shared/crafting'
import type { SkillRow } from '../src/shared/skills'
import { AA_NO_PURCHASE_TEXT } from '../src/shared/tradeskillAa'
import {
  FISHING_HEADING,
  FISHING_RATE_TIP,
  FISHING_REASONS_TIP,
  FORAGE_ITEMS_LABEL,
  FORAGE_LEVEL_UNSEEN,
  FORAGE_LEVEL_UNSEEN_TIP,
  FORAGE_NO_LINE_TEXT,
  FORAGE_RATE_TIP,
  FORAGE_TILE_TITLE,
  FORAGE_HIDE_TEXT,
  FORAGE_SHOW_TEXT,
  FORAGE_TOP,
  NO_FISHING_TEXT,
  fishingFigures,
  fishingItems,
  fishingNoOutcomeText,
  fishingReasons,
  fishingSessionText,
  fishingUnnamedText,
  forageFigures,
  forageLevel,
  forageSessionText,
  forageTile,
  forageToggleText,
  gatherPercent,
  hasFishing,
  hasForage
} from '../src/shared/tradeskillGather'

const NONE: FishingCounts = { casts: 0, caught: 0, nothing: 0, lostBait: 0, spilled: 0, poleBroke: 0 }

const got = (item: string, count: number, lastTs = 1000): GatheredRow => ({ item, count, lastTs })

/** The owner's live log: 59 named catches over 5 names, 5 the game did not name. */
const FISHED: FishingSnap = {
  casts: 131,
  caught: 64,
  nothing: 62,
  lostBait: 4,
  spilled: 16,
  poleBroke: 2,
  session: NONE,
  items: [got('Fresh Fish', 30), got('Tattered Cloth Sandal', 12), got('Fish Scales', 10), got('Rusty Dagger', 6), got('Saltwater Seaweed', 1)]
}

const FORAGED_ITEMS: GatheredRow[] = [
  got('Roots', 200),
  got('Berries', 150),
  got('Pod of Water', 100),
  got('Rabbit Meat', 50),
  got('Fishing Grubs', 30),
  got('Vegetables', 18),
  got('Tuft of Dire Wolf Fur', 2)
]

const FORAGED: ForageSnap = { found: 550, failed: 588, session: { found: 0, failed: 0 }, items: FORAGED_ITEMS }

const skill = (name: string, value: number, lastTs = 1000): SkillRow => ({ skill: name, value, lastTs, sessionUps: 0 })

const values = (figures: readonly { id: string; value: string }[]): Record<string, string> => Object.fromEntries(figures.map((f) => [f.id, f.value]))

test('the fishing figures: casts, caught, nothing, and the rate over the casts that had an outcome', () => {
  assert.deepEqual(values(fishingFigures(FISHED)), { casts: '131', caught: '64', nothing: '62', rate: '51%' })
  // 64 of 126 outcomes, not 64 of 131 casts (49%).
  assert.equal(gatherPercent(64 / 126), '51%')
  assert.deepEqual(
    fishingFigures(FISHED).map((f) => f.label),
    ['Casts', 'Caught', 'Nothing', 'Catch rate']
  )
  // Before any outcome there is no rate to state.
  assert.deepEqual(values(fishingFigures({ ...NONE, casts: 2 })), { casts: '2', caught: '0', nothing: '0' })
  assert.equal(gatherPercent(null), '')
})

test('lost bait, spilled beer and a broken pole are their own small counts, never extra misses', () => {
  assert.deepEqual(values(fishingReasons(FISHED)), { 'lost-bait': '4', spilled: '16', 'pole-broke': '2' })
  // Only the ones that happened are drawn.
  assert.deepEqual(values(fishingReasons({ ...FISHED, lostBait: 0, poleBroke: 0 })), { spilled: '16' })
  assert.deepEqual(fishingReasons(NONE), [])
  // However many there are, the rate and Nothing do not move.
  const many = { ...FISHED, lostBait: 40, spilled: 40, poleBroke: 40 }
  assert.deepEqual(values(fishingFigures(many)), values(fishingFigures(FISHED)))
  assert.match(FISHING_REASONS_TIP, /parts of Nothing, not extra misses/)
})

test('a cast that printed no outcome is said in its own line', () => {
  assert.equal(fishingNoOutcomeText(FISHED), '5 casts printed no outcome (zoned or interrupted). They are in neither side of the catch rate.')
  assert.equal(fishingNoOutcomeText({ ...NONE, casts: 3, caught: 1, nothing: 1 }), '1 cast printed no outcome (zoned or interrupted). It is in neither side of the catch rate.')
  assert.equal(fishingNoOutcomeText({ ...NONE, casts: 2, caught: 1, nothing: 1 }), '')
  // More outcomes than casts (an outcome whose cast line the log lacks) is not a negative count.
  assert.equal(fishingNoOutcomeText({ ...NONE, casts: 1, caught: 2, nothing: 1 }), '')
})

test("this session's fishing is drawn only when the session has a fishing line", () => {
  assert.equal(fishingSessionText(NONE), '')
  assert.equal(fishingSessionText({ ...NONE, casts: 12, caught: 5, nothing: 6, spilled: 2 }), 'This session: 12 casts, 5 caught, 6 nothing, 45% caught')
  assert.equal(fishingSessionText({ ...NONE, casts: 1 }), 'This session: 1 cast, 0 caught, 0 nothing')
})

test('what was caught, most first, with its part of all catches; the unnamed ones said apart', () => {
  assert.deepEqual(fishingItems(FISHED), [
    { item: 'Fresh Fish', count: 30, share: '47%' },
    { item: 'Tattered Cloth Sandal', count: 12, share: '19%' },
    { item: 'Fish Scales', count: 10, share: '16%' },
    { item: 'Rusty Dagger', count: 6, share: '9%' },
    { item: 'Saltwater Seaweed', count: 1, share: '2%' }
  ])
  assert.equal(fishingUnnamedText(FISHED), '5 catches the game did not name ("You caught something...").')
  assert.equal(fishingUnnamedText({ ...FISHED, caught: 60 }), '1 catch the game did not name ("You caught something...").')
  assert.equal(fishingUnnamedText({ ...FISHED, caught: 59 }), '')
  // A part that rounds to nothing is not printed as 0%.
  const rare = fishingItems({ ...FISHED, caught: 1000, items: [got('Fresh Fish', 999), got('Pearl', 1)] })
  assert.deepEqual(rare[1], { item: 'Pearl', count: 1, share: 'under 1%' })
})

test('whether the log holds a fishing or a forage line', () => {
  assert.equal(hasFishing(undefined), false)
  assert.equal(hasFishing({ ...NONE, session: NONE, items: [] }), false)
  assert.equal(hasFishing({ ...NONE, casts: 1, session: NONE, items: [] }), true)
  assert.equal(hasFishing(FISHED), true)
  assert.equal(hasForage(undefined), false)
  assert.equal(hasForage({ found: 0, failed: 0, session: { found: 0, failed: 0 }, items: [] }), false)
  assert.equal(hasForage({ found: 0, failed: 1, session: { found: 0, failed: 0 }, items: [] }), true)
})

test('the forage figures and the session line', () => {
  assert.deepEqual(values(forageFigures(FORAGED)), { found: '550', failed: '588', rate: '48%' })
  assert.deepEqual(
    forageFigures(FORAGED).map((f) => f.label),
    ['Found', 'Failed', 'Found rate']
  )
  assert.equal(forageSessionText({ found: 0, failed: 0 }), '')
  assert.equal(forageSessionText({ found: 12, failed: 9 }), 'This session: 12 found, 9 failed, 57% found')
})

test('the Forage level is the newest line of the skill as the client spells it', () => {
  assert.equal(forageLevel([skill('Fishing', 100), skill('Forage', 151, 5), skill('forage', 152, 9)]), 152)
  assert.equal(forageLevel([skill('Fishing', 100)]), null)
  assert.equal(forageLevel([]), null)
})

const NO_SPENDS: AASpendLike[] = []

test('the Foraging tile draws nothing when the log shows no forage line and no Forage level', () => {
  assert.equal(forageTile({ forage: undefined, skills: [], spends: NO_SPENDS }, false), null)
  assert.equal(forageTile({ forage: undefined, skills: [skill('Fishing', 100)], spends: NO_SPENDS }, false), null)
  assert.equal(forageTile({ forage: { found: 0, failed: 0, session: { found: 0, failed: 0 }, items: [] }, skills: [], spends: NO_SPENDS }, false), null)
  // Nothing read yet is nothing to draw either.
  assert.equal(forageTile({ forage: null, skills: null, spends: null }, false), null)
})

test('the Foraging tile: level, counts, the top five items, a switch to all, and the Foraging AA', () => {
  const facts = { forage: FORAGED, skills: [skill('Forage', 151)], spends: NO_SPENDS }
  const tile = forageTile(facts, false)
  assert.ok(tile)
  assert.equal(tile.level, 151)
  assert.deepEqual(values(tile.figures), { found: '550', failed: '588', rate: '48%' })
  assert.equal(tile.session, '')
  assert.equal(tile.itemCount, 7)
  assert.equal(tile.items.length, FORAGE_TOP)
  assert.deepEqual(tile.items[0], { item: 'Roots', count: 200, share: '36%' })
  assert.deepEqual(tile.items[4], { item: 'Fishing Grubs', count: 30, share: '5%' })
  assert.equal(tile.toggle, 'Show all 7')
  // The committed wiki table's Foraging AA, with what the log shows of it.
  assert.deepEqual(
    tile.aas.map((l) => [l.aa.name, l.costText, l.boughtText]),
    [['Foraging', '1 rank costing 3 points', AA_NO_PURCHASE_TEXT]]
  )
  assert.match(tile.aas[0].aa.text, /increases your Forage skill cap by 50 points/)

  const all = forageTile(facts, true)
  assert.ok(all)
  assert.equal(all.items.length, 7)
  assert.deepEqual(all.items[6], { item: 'Tuft of Dire Wolf Fur', count: 2, share: 'under 1%' })
  assert.equal(all.toggle, 'Show the top 5')
})

test('the Foraging tile draws on a level alone, and on counts alone', () => {
  const level = forageTile({ forage: undefined, skills: [skill('Forage', 40)], spends: NO_SPENDS }, false)
  assert.ok(level)
  assert.equal(level.level, 40)
  assert.deepEqual(level.figures, [])
  assert.deepEqual(level.items, [])
  assert.equal(level.toggle, '')

  const session = { found: 3, failed: 1 }
  const counts = forageTile({ forage: { ...FORAGED, session, items: FORAGED_ITEMS.slice(0, 3) }, skills: [], spends: [{ ts: 1, ability: 'Foraging', cost: 3 }] }, false)
  assert.ok(counts)
  assert.equal(counts.level, null)
  assert.equal(counts.session, 'This session: 3 found, 1 failed, 75% found')
  assert.equal(counts.items.length, 3)
  assert.equal(counts.toggle, '')
  assert.equal(counts.aas[0].boughtText, 'Your log shows rank 1 of 1 bought.')
  // The purchases are not read yet: the AA is listed and nothing is said of buying it.
  const waiting = forageTile({ forage: FORAGED, skills: null, spends: null }, false)
  assert.ok(waiting)
  assert.equal(waiting.aas[0].boughtText, '')
})

test('what a click on the tile opens: the session line, the items found or an AA; a tile with none of them opens nothing', () => {
  const full = forageTile({ forage: FORAGED, skills: [skill('Forage', 151)], spends: NO_SPENDS }, false)
  assert.equal(full?.detail, true)
  // A level alone still has the wiki's Foraging AA to open.
  const level = forageTile({ forage: undefined, skills: [skill('Forage', 40)], spends: NO_SPENDS }, false)
  assert.deepEqual([level?.items.length, level?.session, level?.aas.length, level?.detail], [0, '', 1, true])
  // The words of the tile's last line.
  assert.equal(FORAGE_SHOW_TEXT, 'Show what you found')
  assert.equal(FORAGE_HIDE_TEXT, 'Hide what you found')
})

test('the switch between the top few and all', () => {
  assert.equal(forageToggleText(false, FORAGE_TOP), '')
  assert.equal(forageToggleText(false, FORAGE_TOP + 1), 'Show all 6')
  assert.equal(forageToggleText(true, 19), 'Show the top 5')
})

test('no word on screen carries an em or en dash, and none forecasts', () => {
  const words = [
    FISHING_HEADING,
    NO_FISHING_TEXT,
    FISHING_RATE_TIP,
    FISHING_REASONS_TIP,
    FORAGE_TILE_TITLE,
    FORAGE_LEVEL_UNSEEN,
    FORAGE_LEVEL_UNSEEN_TIP,
    FORAGE_RATE_TIP,
    FORAGE_NO_LINE_TEXT,
    FORAGE_ITEMS_LABEL,
    fishingNoOutcomeText(FISHED),
    fishingSessionText({ ...NONE, casts: 12, caught: 5, nothing: 6 }),
    fishingUnnamedText(FISHED),
    forageSessionText({ found: 12, failed: 9 }),
    forageToggleText(false, 19),
    ...fishingFigures(FISHED).map((f) => f.label),
    ...fishingReasons(FISHED).map((f) => f.label),
    ...forageFigures(FORAGED).map((f) => f.label)
  ]
  for (const line of words) {
    assert.doesNotMatch(line, /[\u2013\u2014]/, line)
    assert.doesNotMatch(line, /chance|likely|expect|per hour|will /i, line)
  }
})
