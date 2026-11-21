// The Tradeskills Home (owner, 2026-11-20, after comparing the built section with the mockup):
// the level bars and the wiki's 200 rule (src/shared/tradeskillLevelBar.ts), "Pick up where you
// left off" and the sources line (tradeskillHome.ts), "Working towards" for wished crafted items
// (tradeskillWished.ts), and the picked recipe's material lines (tradeskillPicked.ts). Fixtures
// first (the owner's case), then the achievements fixture and the committed data.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook, wikiItemName } from '../src/main/tradeskillBook'
import { GUIDE_CREDITS } from '../src/shared/guideCredits'
import type { TradeskillGuidesFile } from '../src/shared/guideData'
import type { SkillRow } from '../src/shared/skills'
import { indexBook, tradeskillTiles } from '../src/shared/tradeskillBook'
import { LEVELING_GUIDE_ID, RECIPE_GUIDE_ID, guidePayload, indexGuides } from '../src/shared/tradeskillGuide'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import {
  DOORS_LINE,
  HOME_SUBTITLE,
  NO_TRADESKILL_SEEN_LINE,
  UNSEEN_HEADING,
  doorsLine,
  homeDoors,
  lastRunText,
  pickUp,
  pickUpHeldText,
  pickUpWhyText,
  sourceParts,
  unseenDoorText,
  type PickUpAsk
} from '../src/shared/tradeskillHome'
import { CAP_NOTE, SPECIALIZATION_CAP, barLabel, barOfText, barTip, capTip, levelBar, skillTop } from '../src/shared/tradeskillLevelBar'
import { haveLookup } from '../src/shared/tradeskillMaterials'
import { bareRecipeText, madeBy, needQty } from '../src/shared/tradeskillPicked'
import type { PlanDeps } from '../src/shared/tradeskillPlan'
import { planHave } from '../src/shared/tradeskillPlanGather'
import { TRADESKILLS, tradeskillOf, type Tradeskill } from '../src/shared/tradeskills'
import { wishedCrafts, wishedHeldText, wishedMaterialsText, wishedSkillText } from '../src/shared/tradeskillWished'
import { MIN, SEP_12, fixtureSnap, item, span } from './tradeskillFixtures.mts'
import { OWNER_LEVEL, ownerGuides, ownerHeld, ownerIndex, ownerSnap } from './tradeskillRouteFixtures.mts'

const skill = (name: string, value: number, lastTs = SEP_12): SkillRow => ({ skill: name, value, lastTs, sessionUps: 0 })

/** The owner's levels on 2026-11-20: Jewelry Making 205 and four low tradeskills. */
const OWNER_ROWS: SkillRow[] = [skill('Jewelry Making', OWNER_LEVEL), skill('Fishing', 127), skill('Brewing', 8), skill('Baking', 5), skill('Alchemy', 2)]

const EM_DASH = /[–—]/

// ---- the level bar ------------------------------------------------------------------------------

/** The top `<Skill> (N)` milestone of each tradeskill block in the achievements dump. */
function topMilestones(): Map<Tradeskill, number> {
  const text = readFileSync(new URL('./fixtures/Primitive_freeport-Achievements.txt', import.meta.url), 'utf8')
  const tops = new Map<Tradeskill, number>()
  let inBlock = false
  for (const line of text.split(/\r?\n/)) {
    // A heading line carries no state letter and tab: "Tradeskill: Baking", "Slayer: General".
    if (!/^[A-Z]\t/.test(line)) inBlock = line.startsWith('Tradeskill:')
    const hit = inBlock ? /^[A-Z]\t([A-Za-z ]+) \((\d+)\)$/.exec(line) : null
    if (hit === null) continue
    // The dump writes "Smithing" where every other source writes Blacksmithing.
    const tradeskill = tradeskillOf(hit[1] === 'Smithing' ? 'Blacksmithing' : hit[1])
    if (tradeskill !== undefined) tops.set(tradeskill, Math.max(tops.get(tradeskill) ?? 0, Number(hit[2])))
  }
  return tops
}

test('MEASURED: the bar tops out where the achievements dump lists its last milestone, and has no scale where it lists none', () => {
  const tops = topMilestones()
  assert.ok(tops.size >= 9, `the fixture lists milestones for ${String(tops.size)} tradeskills`)
  for (const tradeskill of TRADESKILLS) assert.equal(skillTop(tradeskill), tops.get(tradeskill) ?? null, tradeskill)
  assert.equal(skillTop('Jewelcrafting'), 300)
  assert.equal(skillTop('Fishing'), 200)
  assert.equal(skillTop('Tinkering'), null)
})

test('a level fills its share of the bar; a skill the log never showed has an empty bar and keeps its words', () => {
  const jewel = levelBar(OWNER_ROWS, 'Jewelcrafting')
  assert.deepEqual([jewel.level, jewel.top, jewel.fill.toFixed(3)], [205, 300, '0.683'])
  assert.equal(barOfText(jewel), 'of 300')
  assert.equal(barLabel(jewel), 'Jewelcrafting 205 of 300')
  assert.match(barTip(jewel), /300 is the last skill milestone/)
  const fishing = levelBar(OWNER_ROWS, 'Fishing')
  assert.deepEqual([fishing.level, fishing.top, fishing.fill.toFixed(3)], [127, 200, '0.635'])
  const pottery = levelBar(OWNER_ROWS, 'Pottery')
  assert.deepEqual([pottery.level, pottery.fill, pottery.capTick, pottery.cappedBy], [null, 0, null, null])
  assert.equal(barOfText(pottery), '')
  assert.equal(barLabel(pottery), 'Pottery: not in your log')
  // No milestone in the dump: the number alone, an empty bar, and the hover says why.
  const tinkering = levelBar([...OWNER_ROWS, skill('Tinkering', 60)], 'Tinkering')
  assert.deepEqual([tinkering.level, tinkering.top, tinkering.fill], [60, null, 0])
  assert.equal(barOfText(tinkering), '')
  assert.equal(barLabel(tinkering), 'Tinkering 60')
  assert.match(barTip(tinkering), /no skill milestones/)
  // A level past the top never overfills.
  assert.equal(levelBar([skill('Fishing', 250)], 'Fishing').fill, 1)
})

test("THE WIKI'S RULE: with one tradeskill past 200, each other one at or under 200 wears the note and a tick at 200", () => {
  assert.equal(SPECIALIZATION_CAP, 200)
  const brewing = levelBar(OWNER_ROWS, 'Brewing')
  assert.equal(brewing.cappedBy, 'Jewelcrafting')
  assert.equal(brewing.capTick?.toFixed(3), '0.667')
  assert.equal(levelBar(OWNER_ROWS, 'Baking').cappedBy, 'Jewelcrafting')
  // The one past 200 is not capped by itself.
  assert.deepEqual([levelBar(OWNER_ROWS, 'Jewelcrafting').cappedBy, levelBar(OWNER_ROWS, 'Jewelcrafting').capTick], [null, null])
  // A skill the log never showed: its level is not known, so nothing is said of it.
  assert.equal(levelBar(OWNER_ROWS, 'Tailoring').cappedBy, null)
  // Not among the seven the wiki's Crafting Mastery row names: no note.
  assert.equal(levelBar(OWNER_ROWS, 'Alchemy').cappedBy, null)
  assert.equal(levelBar(OWNER_ROWS, 'Fishing').cappedBy, null)
  // At exactly 200 nothing is past the cap; at 201 the others are capped, one at 200 included.
  const at200 = [skill('Jewelry Making', 200), skill('Brewing', 200)]
  assert.equal(levelBar(at200, 'Brewing').cappedBy, null)
  const at201 = [skill('Jewelry Making', 201), skill('Brewing', 200), skill('Baking', 230)]
  assert.equal(levelBar(at201, 'Brewing').cappedBy, 'Baking')
  // Two past 200 (Crafting Mastery bought): neither wears the note, both name the other tradeskill for a third.
  assert.equal(levelBar(at201, 'Baking').cappedBy, null)
  assert.equal(levelBar(at201, 'Jewelcrafting').cappedBy, null)
  // Worded as the wiki's rule, not as a measurement.
  assert.equal(CAP_NOTE, 'caps at 200 without Crafting Mastery')
  assert.match(capTip('Jewelcrafting'), /^The wiki's Tradeskills page says: .*Crafting Mastery AA\. Your Jewelcrafting is past 200\.$/)
})

// ---- pick up where you left off -----------------------------------------------------------------

function ownerAsk(over: Partial<PickUpAsk> = {}): PickUpAsk {
  const index = ownerIndex()
  const craft = indexCrafting(ownerSnap(), index)
  return { index, guides: ownerGuides(), rows: OWNER_ROWS, craft, have: haveLookup({ index: ownerHeld(), dumpedAt: SEP_12 }, craft), ...over }
}

test("the owner's case: Jewelcrafting, the ring above 205, 23 on hand, and the last run in plain words", () => {
  const pick = pickUp(ownerAsk())
  assert.ok(pick)
  assert.deepEqual([pick.tradeskill, pick.level, pick.lastCombine], ['Jewelcrafting', OWNER_LEVEL, SEP_12])
  assert.deepEqual([pick.next?.item, pick.next?.trivial, pick.topped], ['Golden Ruby Ring', 207, false])
  // 54 Ruby and 23 Enchanted Gold Bar: the bars run out first.
  assert.equal(pick.canMake, 23)
  assert.equal(pickUpHeldText(pick), 'You hold the materials for 23.')
  assert.equal(pickUpWhyText(pick, 'Sep 12, 2026'), 'You last combined here on Sep 12, 2026.')
  // The newest span of the fixture: 4 combines over 10 minutes, no raise.
  assert.deepEqual(pick.lastRun && [pick.lastRun.combines, pick.lastRun.made, pick.lastRun.failed, pick.lastRun.raises], [4, 4, 0, 0])
  assert.equal(pick.lastRun?.end, SEP_12 + 210 * MIN)
})

test('the tradeskill is the one of the newest combine, placed by a raise or by the recipe book', () => {
  const index = ownerIndex()
  const snap = ownerSnap({
    items: [
      item('Golden Ruby Ring', { made: 4, lastTs: SEP_12 }),
      item('Arrow', { made: 5, failed: 1, raises: 1, tradeskill: 'Fletching', lastTs: SEP_12 + 5 * MIN }),
      // Newer still, but nothing places it in a tradeskill: it is not what was left off.
      item('Mystery Stew', { made: 2, lastTs: SEP_12 + 9 * MIN }),
      // A row with no combine at all is no combine.
      item('Golden Jaded Bracelet', { lastTs: SEP_12 + 20 * MIN })
    ]
  })
  const pick = pickUp(ownerAsk({ index, craft: indexCrafting(snap, index) }))
  assert.deepEqual([pick?.tradeskill, pick?.lastCombine], ['Fletching', SEP_12 + 5 * MIN])
  // Fletching is not in the log's levels: no level, so no next recipe is named and nothing is counted.
  assert.deepEqual([pick?.level, pick?.next, pick?.canMake, pick?.topped], [null, null, null, false])
})

test('with no combine it is the highest-level tradeskill; with no level at all there is nothing to pick up', () => {
  const index = ownerIndex()
  const none = indexCrafting(fixtureSnap({ items: [], spans: [] }), index)
  const pick = pickUp(ownerAsk({ index, craft: none }))
  assert.deepEqual([pick?.tradeskill, pick?.level, pick?.lastCombine, pick?.lastRun], ['Jewelcrafting', OWNER_LEVEL, null, null])
  assert.equal(pickUpWhyText({ lastCombine: null }, ''), 'Your highest tradeskill. Your log shows no combine yet.')
  assert.equal(pickUp(ownerAsk({ index, craft: none, rows: [] })), null)
  // A level in a skill that is no tradeskill does not count.
  assert.equal(pickUp(ownerAsk({ index, craft: none, rows: [skill('Taunt', 200)] })), null)
})

test('what is unknown is left out: no held count without a dump, no next recipe above the top', () => {
  const noDump = pickUp(ownerAsk({ have: null }))
  assert.equal(noDump?.canMake, null)
  assert.equal(pickUpHeldText({ canMake: null }), '')
  // A dump that holds none of a material says so; that is a count, not a guess.
  const index = ownerIndex()
  const craft = indexCrafting(ownerSnap(), index)
  const empty = pickUp(ownerAsk({ index, craft, have: haveLookup({ index: ownerHeld({ Ruby: 0 }), dumpedAt: SEP_12 }, craft) }))
  assert.equal(empty?.canMake, 0)
  assert.equal(pickUpHeldText({ canMake: 0 }), 'You do not hold every material for it.')
  // Past every listed trivial: nothing is next, and the panel says so.
  const top = pickUp(ownerAsk({ rows: [skill('Jewelry Making', 300)] }))
  assert.deepEqual([top?.next, top?.topped, top?.canMake], [null, true, null])
})

test('the last run states its pace only when the run is long enough to state one, and guesses nothing', () => {
  const index = ownerIndex()
  const long = indexCrafting(ownerSnap({ spans: [span(0, 60, 242, { 'Jewelry Making': 46, Fletching: 1 })] }), index)
  const run = pickUp(ownerAsk({ index, craft: long }))?.lastRun
  assert.ok(run)
  assert.deepEqual([run.combines, run.raises, run.combinesPerHour], [242, 47, 242])
  assert.equal(lastRunText(run, 'Sep 12, 2026'), 'Your last crafting run, on Sep 12, 2026: 242 combines (242 made, 0 failed), 47 raises, at 242 combines an hour.')
  // One combine has no length: no pace.
  const short = lastRunText({ end: SEP_12, combines: 1, made: 0, failed: 1, raises: 1, combinesPerHour: null }, 'Sep 12, 2026')
  assert.equal(short, 'Your last crafting run, on Sep 12, 2026: 1 combine (0 made, 1 failed), 1 raise.')
  for (const text of [lastRunText(run, 'x'), short]) {
    assert.doesNotMatch(text, EM_DASH)
    assert.doesNotMatch(text, /chance|likely|should|will|expect|about|roughly|%/i, `${text} forecasts`)
  }
})

// ---- the sources line ---------------------------------------------------------------------------

test("Home's doors: a full tile for each tradeskill the log has shown, one compact row for the rest", () => {
  const index = ownerIndex()
  // The owner's five: the highest level first. The other seven by name, each with its wiki recipes.
  const doors = homeDoors(tradeskillTiles(index, OWNER_ROWS))
  assert.deepEqual(doors.seen.map((t) => [t.tradeskill, t.level]), [['Jewelcrafting', OWNER_LEVEL], ['Fishing', 127], ['Brewing', 8], ['Baking', 5], ['Alchemy', 2]])
  assert.deepEqual(doors.unseen.map((t) => t.tradeskill), ['Blacksmithing', 'Fletching', 'Poison Making', 'Pottery', 'Spell Research', 'Tailoring', 'Tinkering'])
  assert.equal(doors.seen.length + doors.unseen.length, TRADESKILLS.length)
  assert.ok(doors.unseen.every((t) => t.level === null))
  assert.equal(doorsLine(doors, true), DOORS_LINE)
  assert.equal(UNSEEN_HEADING, 'Not in your log yet')
  assert.equal(unseenDoorText({ tradeskill: 'Pottery', recipes: 143 }), 'Pottery · 143 recipes')
  assert.equal(unseenDoorText({ tradeskill: 'Tinkering', recipes: 1 }), 'Tinkering · 1 recipe')
  assert.equal(unseenDoorText({ tradeskill: 'Alchemy', recipes: 0 }), 'Alchemy · 0 recipes')
  // A skill that is no tradeskill (Forage) makes no tile and moves none.
  assert.deepEqual(homeDoors(tradeskillTiles(index, [...OWNER_ROWS, skill('Forage', 119)])), doors)
})

test('the log has shown no tradeskill: all twelve are in the compact row, and the line above says so', () => {
  const doors = homeDoors(tradeskillTiles(ownerIndex(), []))
  assert.deepEqual(doors.seen, [])
  assert.deepEqual(doors.unseen.map((t) => t.tradeskill), [...TRADESKILLS].sort((a, b) => a.localeCompare(b)))
  assert.equal(doorsLine(doors, true), NO_TRADESKILL_SEEN_LINE)
  assert.match(NO_TRADESKILL_SEEN_LINE, /^Your log has not shown any tradeskill go up yet\. /)
  // Until the engine has read the skills the line does not blame the log.
  assert.equal(doorsLine(doors, false), DOORS_LINE)
  for (const line of [DOORS_LINE, NO_TRADESKILL_SEEN_LINE, UNSEEN_HEADING, unseenDoorText({ tradeskill: 'Pottery', recipes: 2 })]) assert.doesNotMatch(line, EM_DASH)
})

test('the sources line names the wiki data by its date and each guide by title, author and version or copy date', () => {
  const parts = sourceParts('2026-11-20T10:12:58.967Z', [
    { id: LEVELING_GUIDE_ID, version: '1.8 (wip)', pulledAt: '2026-11-20T18:45:13.000Z' },
    { id: RECIPE_GUIDE_ID, pulledAt: '2026-11-20T18:45:13.000Z' }
  ])
  assert.deepEqual(parts, [
    'wiki data of 2026-11-20',
    'EQ Legends Tradeskill Guide, by Zakarsis Moonstalker (Neriak), version 1.8 (wip)',
    "EQL Myztikal's Kerran Kornerstore, by Myztikal (Halas), copy of 2026-11-20",
    'your own log'
  ])
  // Nothing stated: the source is still named, with no date made up for it.
  assert.deepEqual(sourceParts(undefined, []), ['wiki data', 'your own log'])
  assert.deepEqual(sourceParts('not a date', [{ id: RECIPE_GUIDE_ID, pulledAt: '' }]), ['wiki data', "EQL Myztikal's Kerran Kornerstore, by Myztikal (Halas)", 'your own log'])
  // A guide the app has no credit for is not named by its id.
  assert.deepEqual(sourceParts(undefined, [{ id: 'someone-else', pulledAt: '2026-11-20T00:00:00.000Z' }]), ['wiki data', 'your own log'])
  assert.doesNotMatch(HOME_SUBTITLE, EM_DASH)
})

// ---- working towards ----------------------------------------------------------------------------

function ownerWished(wishes: string[], held: Parameters<typeof ownerHeld>[0] | null = {}): ReturnType<typeof wishedCrafts> {
  const index = ownerIndex()
  const craft = indexCrafting(ownerSnap(), index)
  const deps: PlanDeps = { index, guides: ownerGuides() }
  const have = held === null ? null : planHave({ index: ownerHeld(held), dumpedAt: SEP_12 }, craft)
  return wishedCrafts({ deps, wishes: wishes.map((itemKey) => ({ itemKey })), rows: OWNER_ROWS, have })
}

test('a wished item is listed when a recipe makes it, in the wish list order, each once', () => {
  const rows = ownerWished(['platinum malachite ring', 'cloak of flames', 'golden ruby ring', 'platinum malachite ring'])
  assert.deepEqual(rows.map((r) => r.recipe.item), ['Platinum Malachite Ring', 'Golden Ruby Ring'])
  assert.equal(ownerWished(['cloak of flames']).length, 0)
  assert.equal(ownerWished([]).length, 0)
})

test("the owner's case: the ring's two materials are held; the platinum ring's are not, and each is named", () => {
  const [ring, platinum] = ownerWished(['golden ruby ring', 'platinum malachite ring'])
  assert.deepEqual([ring.level, ring.materials, ring.covered, ring.missing, ring.held], [OWNER_LEVEL, 2, 2, [], 0])
  assert.equal(wishedSkillText(ring), 'Jewelcrafting, trivial 207. Your level: 205.')
  assert.equal(wishedMaterialsText(ring), 'You hold everything one takes: 2 materials.')
  assert.equal(wishedHeldText(ring), '')
  assert.deepEqual([platinum.materials, platinum.covered], [2, 0])
  assert.deepEqual(platinum.missing, [
    { name: 'Enchanted Platinum Bar', toGet: 1 },
    { name: 'Malachite', toGet: 1 }
  ])
  assert.equal(wishedMaterialsText(platinum), 'You hold none of the 2 materials one takes. Still to get: Enchanted Platinum Bar, Malachite.')
  // One of the two held, and the wished item itself held.
  const [half] = ownerWished(['platinum malachite ring'], { Malachite: 68, 'Platinum Malachite Ring': 2 })
  assert.equal(wishedMaterialsText(half), 'You hold 1 of the 2 materials one takes. Still to get: Enchanted Platinum Bar.')
  assert.equal(wishedHeldText(half), 'You hold 2.')
})

test('with nothing saying what is held, only how many materials one takes is stated', () => {
  const [ring] = ownerWished(['golden ruby ring'], null)
  assert.deepEqual([ring.materials, ring.covered, ring.missing, ring.held], [2, null, [], null])
  assert.equal(wishedMaterialsText(ring), 'One takes 2 materials.')
  assert.equal(wishedHeldText(ring), '')
  // The wiki lists no materials for the tiara and the guide none: said, not counted.
  const [tiara] = ownerWished(['platinum blue diamond tiara'])
  assert.equal(tiara.materials, 0)
  assert.equal(wishedMaterialsText(tiara), 'Neither the wiki nor the guide lists materials for this recipe.')
})

test('the words name the level, a skill the log never showed, a missing trivial, and cap a long list', () => {
  const recipe = ownerIndex().byId.get('golden ruby ring#0')
  assert.ok(recipe)
  assert.equal(wishedSkillText({ recipe, level: null }), 'Jewelcrafting, trivial 207. Not in your log.')
  assert.equal(wishedSkillText({ recipe: { ...recipe, trivial: undefined }, level: 12 }), 'Jewelcrafting, no trivial on the wiki. Your level: 12.')
  assert.equal(wishedSkillText({ recipe: { ...recipe, tradeskill: undefined, skillWord: 'Non-Tradeskill' }, level: null }), 'Non-Tradeskill, trivial 207.')
  const missing = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => ({ name, toGet: i + 1 }))
  const text = wishedMaterialsText({ materials: 7, covered: 1, missing })
  assert.equal(text, 'You hold 1 of the 7 materials one takes. Still to get: A, 2 x B, 3 x C, 4 x D and 2 more.')
  assert.equal(wishedMaterialsText({ materials: 1, covered: 1, missing: [] }), 'You hold everything one takes: 1 material.')
  for (const line of [text, wishedSkillText({ recipe, level: 205 })]) {
    assert.doesNotMatch(line, EM_DASH)
    assert.doesNotMatch(line, /chance|likely|should|will|expect|combines? to/i, `${line} forecasts`)
  }
})

// ---- the picked recipe's material lines ---------------------------------------------------------

test('a material with no stated count reads as one, the count every other fold already uses', () => {
  assert.equal(needQty({}), 1)
  assert.equal(needQty({ qty: 3 }), 3)
})

function committed(): { deps: PlanDeps; stamps: NonNullable<ReturnType<typeof guidePayload>['stamps']> } {
  const items = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const payload = guidePayload(guidesJson as unknown as TradeskillGuidesFile, wikiItemName(items))
  return { deps: { index: indexBook(buildTradeskillBook(items, new Map())), guides: indexGuides(payload) }, stamps: payload.stamps ?? [] }
}

test('COMMITTED DATA: Aviak Egg Oil opens to its Brewing recipe; Medium Quality Sheet Metal, whose recipe lists nothing, does not open', () => {
  const { deps, stamps } = committed()
  const oil = madeBy(deps, 'aviak egg oil', ['fleeting quiver'])
  assert.deepEqual([oil.open.map((r) => r.tradeskill), oil.bare.length], [['Brewing'], 0])
  const metal = madeBy(deps, 'medium quality sheet metal', ['antonian javelin'])
  assert.equal(metal.open.length, 0, 'the wiki lists no materials for Medium Quality Sheet Metal and the guide none: nothing to open')
  assert.equal(metal.bare.length, 1)
  assert.match(bareRecipeText(metal.bare[0]), /^Also made with Blacksmithing · trivial \d+: the wiki lists no materials for it\.$/)
  // An item already open above, and one nothing makes, read as leaves.
  assert.deepEqual(madeBy(deps, 'aviak egg oil', ['aviak egg oil']), { open: [], bare: [] })
  assert.deepEqual(madeBy(deps, 'griffon feathers', ['fleeting quiver']), { open: [], bare: [] })

  // Wished: Fleeting Quiver is made by Tailoring from six leaves: Aviak Egg Oil is opened, and its Water Flask is bought.
  const [quiver] = wishedCrafts({ deps, wishes: [{ itemKey: 'fleeting quiver' }], rows: OWNER_ROWS, have: null })
  assert.deepEqual([quiver.recipe.tradeskill, quiver.recipe.trivial, quiver.materials], ['Tailoring', 222, 6])
  assert.equal(wishedSkillText(quiver), 'Tailoring, trivial 222. Not in your log.')

  // The guides' stamps: one per credited guide, with no address in them.
  assert.deepEqual(stamps.map((s) => s.id).sort(), GUIDE_CREDITS.map((c) => c.id).sort())
  assert.doesNotMatch(JSON.stringify(stamps), /https?:|docs\.google|drive\.google/i)
  const parts = sourceParts((itemsJson as unknown as ItemDbFile).scrapedAt, stamps)
  assert.equal(parts.length, 4)
  assert.match(parts[0], /^wiki data of \d{4}-\d{2}-\d{2}$/)
  assert.doesNotMatch(parts.join(' '), /https?:/i)
})
