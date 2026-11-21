// The two community guides as the workbench reads them (src/shared/tradeskillGuide.ts): the
// payload main serves, where the recipe guide places a material, the guide's materials for a
// recipe the wiki lists none for, and the leveling route with the player's level placed on it.
// Then the same folds on the committed guide file and item database, counted as floors.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook, wikiItemName } from '../src/main/tradeskillBook'
import { GUIDE_CREDITS } from '../src/shared/guideCredits'
import type { GuideMaterial, GuideStep, TradeskillGuidesFile } from '../src/shared/guideData'
import type { MobEntry } from '../src/shared/mobTypes'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookIndex, type BookRecipe } from '../src/shared/tradeskillBook'
import {
  EMPTY_GUIDES,
  LEVELING_GUIDE_ID,
  NO_GUIDES,
  RECIPE_GUIDE_ID,
  guideCreditOf,
  guideItemRecipe,
  guideMaterialTail,
  guideMaterialsFor,
  guidePayload,
  guideQtyPrefix,
  indexGuides,
  levelMarkerText,
  levelingCreditText,
  locatedSource,
  noRouteText,
  placedLadder,
  recipeDrawsGuide,
  recipeGuideCreditText,
  stepRange,
  wikiNameOf,
  type GuideIndex
} from '../src/shared/tradeskillGuide'
import { merchantEntry, merchantIndex } from '../src/shared/tradeskillMerchant'
import { TRADESKILLS } from '../src/shared/tradeskills'
import { assertCorpusFloor } from './corpusFloor.mts'
import { ing, recipe } from './tradeskillFixtures.mts'

const credit = (id: string, title: string): { id: string; title: string; author: string; sourceUrl: string; pulledAt: string } => ({
  id,
  title,
  author: 'a player',
  sourceUrl: 'https://example.invalid/guide',
  pulledAt: '2026-11-20T00:00:00.000Z'
})

const step = (from: number, to: number | undefined, item: string, over: Partial<GuideStep> = {}): GuideStep => ({
  from,
  ...(to === undefined ? {} : { to }),
  item,
  materials: [],
  ...over
})

/** A guide file with the shapes the real one has: loose names, overlapping ranges, a text upper bound. */
function fixtureFile(): TradeskillGuidesFile {
  return {
    about: 'fixture',
    leveling: {
      ...credit(LEVELING_GUIDE_ID, 'Leveling'),
      overview: [{ heading: 'Notes', lines: ['left out of the payload'] }],
      tradeskills: {
        Jewelcrafting: {
          notes: ['Ruby is the highest gem available on merchants.'],
          steps: [
            step(1, 34, 'Silver star rose quartz'),
            step(179, 196, 'Champagne Magnum', { note: 'Can start earlier if desired', materials: [{ name: 'Enchanted gold bar' }, { name: 'Opal' }, { name: 'Bottle', returned: true }] }),
            step(192, 202, 'Gold fire emerald'),
            step(203, 228, 'Golden Ruby Ring'),
            step(229, undefined, 'Platinum ruby', { range: '229 - see side' }),
            step(256, 279, 'Platinum blue diamond')
          ],
          alternates: [step(136, 142, 'Jumjum salad', { materials: [{ name: 'Vegetables', note: 'foraged, or made:', materials: [{ name: 'Fennel', qty: 2 }] }] })],
          asides: [{ col: 'H', cells: ['a side table'] }]
        }
      }
    },
    recipes: {
      ...credit(RECIPE_GUIDE_ID, 'Recipes'),
      tradeskills: {
        Jewelcrafting: {
          recipes: [
            {
              trivial: 146,
              item: 'Gold Malachite Bracelet',
              notes: [],
              materials: [
                { name: 'Enchanted gold bar', merchant: 'Amber', zone: 'North Freeport', loc: '-176, 207, 17' },
                { name: 'Malachite', merchant: 'Jade', zone: 'North Freeport', loc: '-179,197, 3' }
              ]
            },
            {
              trivial: 207,
              item: 'Golden Ruby Ring',
              notes: [],
              // A second merchant for the bar: the first one stays.
              materials: [{ name: 'Enchanted Gold Bar', merchant: 'Someone Else', zone: 'Elsewhere', loc: '1, 2' }, { name: 'Ruby', sourceText: 'Farmed' }]
            }
          ]
        },
        Tailoring: {
          recipes: [
            {
              trivial: 222,
              item: 'Fleeting Quiver',
              notes: [],
              materials: [
                { name: 'High Quality Lion Skin', zone: 'North Karana', sourceText: 'Highland Lions', notes: ['Bring Track....'] },
                { name: 'Fleeting Quiver Pattern', merchant: 'Klok Walrot', zone: 'New Sebi', loc: '286, -54' },
                { name: 'Sewing Needle', qty: 2, returned: true, sourceText: 'Crafted (Blacksmithing)' }
              ]
            },
            // On the Tailoring tab, but the guide says it is a Brewing recipe.
            { item: 'Aviak Egg Oil', tradeskill: 'Brewing', notes: [], materials: [{ name: 'Aviak Egg', sourceText: 'Farmed' }] }
          ]
        }
      }
    }
  }
}

/** The item database's answer for the fixture: exact names only, in the wiki's own spelling. */
const WIKI: Record<string, string> = {
  'enchanted gold bar': 'Enchanted Gold Bar',
  opal: 'Opal',
  bottle: 'Bottle',
  malachite: 'Malachite',
  ruby: 'Ruby',
  'golden ruby ring': 'Golden Ruby Ring',
  'gold malachite bracelet': 'Gold Malachite Bracelet',
  'fleeting quiver': 'Fleeting Quiver',
  'fleeting quiver pattern': 'Fleeting Quiver Pattern',
  'aviak egg oil': 'Aviak Egg Oil',
  fennel: 'Fennel'
}

const fixtureGuides = (): GuideIndex => indexGuides(guidePayload(fixtureFile(), (name) => WIKI[name.trim().toLowerCase()]))

function fixtureBook(): BookIndex {
  return indexBook({
    version: TRADESKILL_BOOK_VERSION,
    recipes: [
      recipe('Golden Ruby Ring', { trivial: 207, ingredients: [ing('Enchanted Gold Bar'), ing('Ruby')] }),
      recipe('Fleeting Quiver', { tradeskill: 'Tailoring', trivial: 222 }),
      recipe('Aviak Egg Oil', { id: 'aviak egg oil#0', tradeskill: 'Brewing', trivial: 50 }),
      recipe('Aviak Egg Oil', { id: 'aviak egg oil#1', tradeskill: 'Tailoring', trivial: 60 }),
      recipe('Plain Hat', { tradeskill: 'Tailoring', trivial: 10 }),
      recipe('Ruby Crown', { trivial: 250, ingredients: [ing('Ruby Setting')] }),
      recipe('Ruby Setting', { trivial: 90, ingredients: [ing('Malachite')] }),
      recipe('Wooden Bowl', { tradeskill: 'Pottery', trivial: 5, ingredients: [ing('Clay')] })
    ],
    materials: {}
  })
}

const byId = (index: BookIndex, id: string): BookRecipe => {
  const found = index.byId.get(id)
  assert.ok(found, `${id} is in the fixture`)
  return found
}

// ---- the payload ------------------------------------------------------------------------------

test('the payload keeps the route and the recipes, and resolves a name only when it is a wiki item exactly', () => {
  const payload = guidePayload(fixtureFile(), (name) => WIKI[name.trim().toLowerCase()])
  assert.deepEqual(Object.keys(payload.leveling), ['Jewelcrafting'])
  assert.deepEqual(Object.keys(payload.leveling.Jewelcrafting ?? {}), ['notes', 'steps', 'alternates'])
  assert.equal(payload.recipes.Tailoring?.recipes.length, 2)
  // The guide's own casing resolves to the wiki's spelling; a loose name resolves to nothing.
  assert.equal(payload.names['enchanted gold bar'], 'Enchanted Gold Bar')
  assert.equal(payload.names.fennel, 'Fennel')
  assert.equal(payload.names['gold fire emerald'], undefined)
  assert.equal(payload.names['high quality lion skin'], undefined)
  const guides = indexGuides(payload)
  assert.equal(wikiNameOf(guides, 'Enchanted gold bar'), 'Enchanted Gold Bar')
  assert.equal(wikiNameOf(guides, 'Gold fire emerald'), null)
  assert.equal(wikiNameOf(NO_GUIDES, 'Ruby'), null)
  assert.deepEqual(indexGuides(EMPTY_GUIDES).located.size, 0)
})

test('a material is placed at the first merchant the recipe guide gives with a loc, by its wiki name', () => {
  const guides = fixtureGuides()
  assert.deepEqual(locatedSource(guides, 'enchanted gold bar'), { merchant: 'Amber', zone: 'North Freeport', loc: '-176, 207, 17', notes: [] })
  assert.equal(locatedSource(guides, 'malachite')?.merchant, 'Jade')
  // "Farmed" is no merchant at a place: the wiki's own words already say where a drop comes from.
  assert.equal(locatedSource(guides, 'ruby'), null)
  assert.equal(locatedSource(guides, 'high quality lion skin'), null)
  assert.equal(locatedSource(guides, 'fleeting quiver pattern')?.zone, 'New Sebi')
})

test("a recipe the wiki lists no materials for shows the guide's, each with what the guide says of it", () => {
  const guides = fixtureGuides()
  const index = fixtureBook()
  const lines = guideMaterialsFor(guides, byId(index, 'fleeting quiver#0'))
  assert.deepEqual(lines.map((l) => [l.name, l.wikiName, l.key]), [
    ['High Quality Lion Skin', null, 'high quality lion skin'],
    ['Fleeting Quiver Pattern', 'Fleeting Quiver Pattern', 'fleeting quiver pattern'],
    ['Sewing Needle', null, 'sewing needle']
  ])
  assert.deepEqual(lines[0]?.source, { zone: 'North Karana', sourceText: 'Highland Lions', notes: ['Bring Track....'] })
  assert.deepEqual(lines[1]?.source, { merchant: 'Klok Walrot', zone: 'New Sebi', loc: '286, -54', notes: [] })
  assert.deepEqual([lines[2]?.qty, lines[2]?.returned], [2, true])
})

test("the guide's materials are not drawn over the wiki's own, nor for another tradeskill's recipe", () => {
  const guides = fixtureGuides()
  const index = fixtureBook()
  // The wiki lists the ring's materials: the guide's list is not shown in their place.
  assert.deepEqual(guideMaterialsFor(guides, byId(index, 'golden ruby ring#0')), [])
  assert.deepEqual(guideMaterialsFor(guides, byId(index, 'plain hat#0')), [])
  // The guide files Aviak Egg Oil under Brewing though it sits on the Tailoring tab.
  assert.equal(guideMaterialsFor(guides, byId(index, 'aviak egg oil#0')).length, 1)
  assert.deepEqual(guideMaterialsFor(guides, byId(index, 'aviak egg oil#1')), [])
  assert.deepEqual(guideMaterialsFor(NO_GUIDES, byId(index, 'fleeting quiver#0')), [])
})

test('the panel carries the recipe guide credit only when it can draw from the guide, opened materials included', () => {
  const guides = fixtureGuides()
  const index = fixtureBook()
  assert.equal(recipeDrawsGuide(index, guides, byId(index, 'golden ruby ring#0')), true)
  assert.equal(recipeDrawsGuide(index, guides, byId(index, 'fleeting quiver#0')), true)
  // Ruby Crown takes a Ruby Setting, whose own recipe takes Malachite, which the guide places.
  assert.equal(recipeDrawsGuide(index, guides, byId(index, 'ruby crown#0')), true)
  assert.equal(recipeDrawsGuide(index, guides, byId(index, 'wooden bowl#0')), false)
  assert.equal(recipeDrawsGuide(index, guides, byId(index, 'plain hat#0')), false)
  assert.equal(recipeDrawsGuide(index, NO_GUIDES, byId(index, 'golden ruby ring#0')), false)
})

// ---- the route --------------------------------------------------------------------------------

const states = (guides: GuideIndex, level: number | null): string => {
  const ladder = placedLadder(guides, 'Jewelcrafting', level)
  assert.ok(ladder)
  return `${ladder.steps.map((s) => s.state).join(',')} @${String(ladder.markerAt)}`
}

test("the player's level is placed on the route: done at a step's top, open from just under its bottom", () => {
  const guides = fixtureGuides()
  // 205 is inside 203 - 228; everything under it is done.
  assert.equal(states(guides, 205), 'done,done,done,here,ahead,ahead @3')
  // 202 finished 192 - 202 and stands at the door of 203 - 228.
  assert.equal(states(guides, 202), 'done,done,done,here,ahead,ahead @3')
  // The guide's ranges overlap: at 193 both 179 - 196 and 192 - 202 hold the level.
  assert.equal(states(guides, 193), 'done,here,here,ahead,ahead,ahead @1')
  // A gap in the route: 100 is past the first step and short of the second.
  assert.equal(states(guides, 100), 'done,ahead,ahead,ahead,ahead,ahead @1')
  assert.equal(states(guides, 0), 'here,ahead,ahead,ahead,ahead,ahead @0')
})

test('a step whose top is not a number ends where the next begins, and past the last step all is done', () => {
  const guides = fixtureGuides()
  assert.equal(states(guides, 240), 'done,done,done,done,here,ahead @4')
  assert.equal(states(guides, 255), 'done,done,done,done,done,here @5')
  assert.equal(states(guides, 300), 'done,done,done,done,done,done @6')
})

test('an unknown level places nothing, and a tradeskill the guide has no route for says so', () => {
  const guides = fixtureGuides()
  assert.equal(states(guides, null), 'ahead,ahead,ahead,ahead,ahead,ahead @null')
  assert.equal(placedLadder(guides, 'Fishing', 100), null)
  assert.equal(noRouteText('Fishing'), 'The leveling guide has no route for Fishing.')
  const ladder = placedLadder(guides, 'Jewelcrafting', 140)
  assert.deepEqual(ladder?.alternates.map((s) => [s.range, s.state]), [['136 - 142', 'here']])
  assert.deepEqual(ladder?.notes, ['Ruby is the highest gem available on merchants.'])
})

test('the words of the route: the range as written, a quantity, a returned tool and a remark', () => {
  assert.equal(stepRange(step(203, 228, 'x')), '203 - 228')
  assert.equal(stepRange(step(229, undefined, 'x', { range: '229 - see side' })), '229 - see side')
  assert.equal(stepRange(step(229, undefined, 'x')), '229 and up')
  assert.equal(levelMarkerText(205), 'Your level: 205')
  const materials: GuideMaterial[] = [{ name: 'Fennel', qty: 2 }, { name: 'Bottle', returned: true, note: 'see below' }, { name: 'Opal' }]
  assert.deepEqual(materials.map(guideQtyPrefix), ['2 x ', '', ''])
  assert.deepEqual(materials.map(guideMaterialTail), ['', ' (returned; see below)', ''])
})

test('each guide is credited by the line its credit states, wherever its data is drawn', () => {
  for (const id of [LEVELING_GUIDE_ID, RECIPE_GUIDE_ID]) {
    const known = GUIDE_CREDITS.find((c) => c.id === id)
    assert.ok(known, `${id} has a credit`)
    assert.ok(guideCreditOf(id).includes(known.author))
    assert.ok(guideCreditOf(id).includes(known.title))
  }
  assert.equal(guideCreditOf('no such guide'), '')
  assert.ok(recipeGuideCreditText().includes(guideCreditOf(RECIPE_GUIDE_ID)))
  assert.ok(levelingCreditText().includes(guideCreditOf(LEVELING_GUIDE_ID)))
})

test('an item a guide names carries the era mark of the wiki recipe that makes it', () => {
  const index = fixtureBook()
  assert.equal(guideItemRecipe(index, 'Golden Ruby Ring')?.id, 'golden ruby ring#0')
  assert.equal(guideItemRecipe(index, 'Ruby'), null)
  assert.equal(guideItemRecipe(index, null), null)
})

// ---- merchants --------------------------------------------------------------------------------

test('a merchant is a mob link only when the catalog holds the name on one page, or one page in the zone', () => {
  const mob = (page: string, name: string, zones: string[]): MobEntry => ({ page, name, zones })
  const index = merchantIndex([
    mob('Amber (Merchant)', 'Amber', ['North Freeport']),
    mob('Jade (Merchant)', 'Jade', ['North Freeport']),
    mob('Jade (Golem)', 'Jade', ['Najena']),
    mob('a bandit', 'a bandit', ['West Commonlands'])
  ])
  assert.equal(merchantEntry(index, 'Amber')?.page, 'Amber (Merchant)')
  assert.equal(merchantEntry(index, ' amber ', 'New Sebi')?.page, 'Amber (Merchant)')
  assert.equal(merchantEntry(index, 'Jade'), null)
  assert.equal(merchantEntry(index, 'Jade', 'north freeport')?.page, 'Jade (Merchant)')
  assert.equal(merchantEntry(index, 'Jade', 'Elsewhere'), null)
  assert.equal(merchantEntry(index, 'Jeweler Anvo'), null)
})

test('a guide name is a wiki item by its name, its page title or one of its other names, and by nothing looser', () => {
  const pages = [
    { page: 'Opal of Fire', otherNames: ['Fire Opal'] },
    { page: 'Ruby (Gem)', name: 'Ruby' },
    { page: 'Enchanted Gold Bar' }
  ]
  const file: ItemDbFile = { scrapedAt: '', source: 'fixture', count: pages.length, items: Object.fromEntries(pages.map((p) => [p.page.toLowerCase(), p])) }
  const wikiName = wikiItemName(buildItemDbIndex(file))
  assert.equal(wikiName('enchanted gold bar'), 'Enchanted Gold Bar')
  assert.equal(wikiName('Fire Opal'), 'Opal of Fire')
  assert.equal(wikiName('ruby (gem)'), 'Ruby')
  assert.equal(wikiName('Gold jade'), undefined)
  assert.equal(wikiName('Enchanted Gold'), undefined)
})

// ---- the committed guides against the committed item database ------------------------------------

function committed(): { guides: GuideIndex; book: BookIndex; file: TradeskillGuidesFile } {
  const index = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const file = guidesJson as unknown as TradeskillGuidesFile
  return { guides: indexGuides(guidePayload(file, wikiItemName(index))), book: indexBook(buildTradeskillBook(index, new Map())), file }
}

/** Every item name the two guides write, by where it stands. */
function guideNames(file: TradeskillGuidesFile): { steps: string[]; recipes: string[]; materials: string[] } {
  const steps = TRADESKILLS.flatMap((t) => {
    const ladder = file.leveling.tradeskills[t]
    return ladder === undefined ? [] : [...ladder.steps, ...ladder.alternates]
  })
  const recipes = TRADESKILLS.flatMap((t) => file.recipes.tradeskills[t]?.recipes ?? [])
  return { steps: steps.map((s) => s.item), recipes: recipes.map((r) => r.item), materials: recipes.flatMap((r) => r.materials.map((m) => m.name)) }
}

/** How many of the names are a wiki item exactly. */
const linked = (guides: GuideIndex, names: readonly string[]): number => names.filter((n) => wikiNameOf(guides, n) !== null).length

test('the committed guides: names that are wiki items resolve to them, counted as floors', (t) => {
  const { guides, book, file } = committed()
  const names = guideNames(file)
  const steps = linked(guides, names.steps)
  const recipes = linked(guides, names.recipes)
  const materials = linked(guides, names.materials)
  const filled = [...book.byId.values()].filter((r) => guideMaterialsFor(guides, r).length > 0).length
  t.diagnostic(`leveling steps and alternates: ${String(steps)} of ${String(names.steps.length)} name a wiki item exactly`)
  t.diagnostic(`recipe guide: ${String(recipes)} of ${String(names.recipes.length)} recipes and ${String(materials)} of ${String(names.materials.length)} materials name a wiki item exactly`)
  t.diagnostic(`wiki recipes with no materials that the guide fills: ${String(filled)}; materials the guide places at a merchant: ${String(guides.located.size)}`)
  // Measured 2026-11-20: 46 of 73 steps, 61 of 68 recipes, 174 of 189 materials, 2 filled, 66 placed.
  // (19 filled until the item parser read the wiki's `**:` ingredient rows: 17 of them were on the wiki all along.)
  assertCorpusFloor(steps, 46, 'leveling steps that name a wiki item')
  assertCorpusFloor(recipes, 61, 'guide recipes that name a wiki item')
  assertCorpusFloor(materials, 174, 'guide materials that name a wiki item')
  assertCorpusFloor(filled, 2, 'wiki recipes the guide fills')
  assertCorpusFloor(guides.located.size, 66, 'materials placed at a merchant')
  assert.ok(Object.values(guides.payload.names).every((name) => name.trim() !== ''), 'a guide name resolved to nothing')
})

test('the committed route places any level: the steps before the mark are done and the one at it is not', () => {
  const { guides } = committed()
  for (const tradeskill of TRADESKILLS) {
    for (const level of [0, 1, 54, 146, 205, 299, 300]) {
      const ladder = placedLadder(guides, tradeskill, level)
      if (ladder === null) continue
      assert.ok(ladder.markerAt !== null)
      assert.ok(ladder.steps.slice(0, ladder.markerAt).every((s) => s.state === 'done'), `${tradeskill} at ${String(level)}`)
      assert.notEqual(ladder.steps[ladder.markerAt]?.state, 'done', `${tradeskill} at ${String(level)}`)
    }
  }
})

test('the committed guides: a recipe the wiki has no materials for gets the guide list, plain text all the way', (t) => {
  const { guides, book } = committed()
  const tonic = [...book.byId.values()].find((r) => r.item === 'Tumpy Tonic' && r.tradeskill === 'Brewing')
  if (tonic === undefined || tonic.ingredients.length > 0) {
    t.diagnostic('the wiki now lists Tumpy Tonic with materials, or not at all: the example did not run')
  } else {
    assert.ok(guideMaterialsFor(guides, tonic).length > 0, 'the guide lists what a Tumpy Tonic takes')
  }
  assert.ok([...guides.located.values()].some((s) => s.merchant !== undefined && s.loc !== undefined), 'the guide places a material at a merchant with a loc')
  // The pull refuses markup; the screens draw these strings as text. Nothing here may look like a tag.
  const text = JSON.stringify(guides.payload)
  assert.doesNotMatch(text, /<\s*[a-z/!]/i)
})
