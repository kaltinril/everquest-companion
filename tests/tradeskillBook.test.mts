// The Tradeskills section's recipe book: the pure folds (src/shared/tradeskillBook.ts) on a
// fixture, and the builder (src/main/tradeskillBook.ts) on the committed item database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbEntry, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook } from '../src/main/tradeskillBook'
import { ownershipIndexFrom, type OwnershipRow } from '../src/shared/planner/ownership'
import type { ItemSource } from '../src/shared/itemSources'
import type { SkillRow } from '../src/shared/skills'
import {
  LEVEL_UNSEEN_TEXT,
  MATERIAL_MOB_CAP,
  MAX_RECIPE_DEPTH,
  NO_TRIVIAL_TEXT,
  TRADESKILL_BOOK_VERSION,
  asTradeskill,
  benchRecipe,
  capped,
  heldCount,
  indexBook,
  ladderEmptyText,
  lineOfRecipe,
  materialDrops,
  materialsText,
  nextRecipe,
  pickedRecipe,
  qtyPrefix,
  recipeFacts,
  recipeForItem,
  recipeLadder,
  skillRecipes,
  sourceWords,
  subRecipes,
  tradeskillLevel,
  tradeskillTiles,
  unlistedText,
  yieldText,
  type BookRecipe,
  type LadderLine,
  type TradeskillBookPayload
} from '../src/shared/tradeskillBook'
import { TRADESKILLS } from '../src/shared/tradeskills'
import { assertCorpusFloor } from './corpusFloor.mts'

const NO_ERA = new Map()

const entry = (page: string, over: Partial<ItemDbEntry> = {}): ItemDbEntry => ({ page, ...over })

const ring = (trivial: number | undefined, gem: string, tradeskill = 'Jewelry Making'): Partial<ItemDbEntry> => ({
  craftedBy: [
    {
      tradeskill,
      ...(trivial === undefined ? {} : { trivial }),
      container: "Jeweler's Kit",
      ingredients: [
        { name: 'Enchanted Gold Bar', qty: 1, sources: ['Bought + Enchanted'] },
        { name: gem, qty: 1, sources: ['Dropped'] }
      ]
    }
  ]
})

/** The owner's stretch of the Jewelcrafting ladder, both wiki spellings, plus what the folds must cope with. */
function fixtureIndex(): Map<string, ItemDbEntry> {
  const pages = [
    entry('Golden Fire Wedding Ring', ring(196, 'Fire Opal')),
    entry('Fire Emerald Golden Bracelet', ring(202, 'Fire Emerald')),
    entry('Golden Black Sapphire Earring', ring(212, 'Black Sapphire')),
    entry('Golden Jacinth Wedding Ring', ring(210, 'Jacinth', 'Jewelcrafting')),
    entry('Golden Ruby Ring', ring(207, 'Ruby')),
    entry('Odd Trinket', ring(undefined, 'Ruby')),
    entry('Quest Idol', ring(50, 'Ruby', 'Non-Tradeskill')),
    entry('Enchanted Gold Bar', {
      craftedBy: [{ tradeskill: 'Non-Tradeskill', ingredients: [{ name: 'Gold Bar', qty: 1, sources: ['Bought'] }] }]
    }),
    // A loop: each is made from the other.
    entry('Loop A', { craftedBy: [{ tradeskill: 'Baking', trivial: 10, ingredients: [{ name: 'Loop B' }] }] }),
    entry('Loop B', { craftedBy: [{ tradeskill: 'Baking', trivial: 12, yieldQty: 5, ingredients: [{ name: 'Loop A' }] }] }),
    entry('Ruby', { dropsFrom: [{ mob: 'a ruby golem', zone: 'Najena' }], eraTag: 'Classic' }),
    entry('Jacinth', { foraged: ['Lavastorm Mountains'] }),
    // A redirect spelling: the recipe says "Fire Opal", the page is "Opal of Fire".
    entry('Opal of Fire', { otherNames: ['Fire Opal'], dropsFrom: [{ mob: 'a fire giant' }] })
  ]
  const file: ItemDbFile = {
    scrapedAt: '',
    source: 'fixture',
    count: pages.length,
    items: Object.fromEntries(pages.map((p) => [p.page.toLowerCase(), p]))
  }
  return buildItemDbIndex(file)
}

const fixtureBook = (): TradeskillBookPayload => buildTradeskillBook(fixtureIndex(), NO_ERA)

const names = (lines: readonly LadderLine[]): string[] =>
  lines.map((l) => (l.kind === 'recipe' ? `${l.recipe.item}:${l.state}` : `heading:${String(l.count)}`))

const skill = (name: string, value: number, lastTs = 1): SkillRow => ({ skill: name, value, lastTs, sessionUps: 0 })

test('both wiki spellings of Jewelcrafting fold to one ladder, ascending by trivial', () => {
  const index = indexBook(fixtureBook())
  const made = skillRecipes(index, 'Jewelcrafting').map((r) => `${r.item} ${String(r.trivial)}`)
  assert.deepEqual(made, [
    'Golden Fire Wedding Ring 196',
    'Fire Emerald Golden Bracelet 202',
    'Golden Ruby Ring 207',
    'Golden Jacinth Wedding Ring 210',
    'Golden Black Sapphire Earring 212',
    'Odd Trinket undefined'
  ])
})

test('at 205 the next three are the Ruby Ring, the Jacinth Wedding Ring and the Black Sapphire Earring', () => {
  const index = indexBook(fixtureBook())
  const ladder = recipeLadder(skillRecipes(index, 'Jewelcrafting'), { level: 205, query: '', hideTrivial: false })
  assert.deepEqual(names(ladder.lines), [
    'Golden Fire Wedding Ring:trivial',
    'Fire Emerald Golden Bracelet:trivial',
    'Golden Ruby Ring:next',
    'Golden Jacinth Wedding Ring:above',
    'Golden Black Sapphire Earring:above',
    'heading:1',
    'Odd Trinket:unrated'
  ])
  assert.equal(ladder.next?.item, 'Golden Ruby Ring')
  assert.equal(ladder.openLine, 2, 'the table opens on the next recipe')
  assert.equal(ladder.shown, 6)
  assert.equal(ladder.total, 6)
})

test('a trivial equal to the level is trivial, and one above it is next', () => {
  const recipes = skillRecipes(indexBook(fixtureBook()), 'Jewelcrafting')
  assert.equal(recipeLadder(recipes, { level: 207, query: '', hideTrivial: false }).next?.item, 'Golden Jacinth Wedding Ring')
  assert.equal(recipeLadder(recipes, { level: 206, query: '', hideTrivial: false }).next?.item, 'Golden Ruby Ring')
})

test('a skill the log never showed reads as level 0: nothing is trivial and the lowest recipe is next', () => {
  const recipes = skillRecipes(indexBook(fixtureBook()), 'Jewelcrafting')
  const ladder = recipeLadder(recipes, { level: null, query: '', hideTrivial: true })
  assert.equal(ladder.lines[0]?.kind === 'recipe' && ladder.lines[0].state, 'next')
  assert.equal(ladder.shown, 6)
  assert.equal(ladder.openLine, 0)
})

test('past the top of the ladder there is no next, and the table opens at the top', () => {
  const recipes = skillRecipes(indexBook(fixtureBook()), 'Jewelcrafting')
  const ladder = recipeLadder(recipes, { level: 300, query: '', hideTrivial: false })
  assert.equal(ladder.next, null)
  assert.equal(ladder.openLine, 0)
  assert.equal(nextRecipe(recipes, 300), null)
})

test('the switch hides what is already trivial and keeps the recipes with no trivial, set apart', () => {
  const recipes = skillRecipes(indexBook(fixtureBook()), 'Jewelcrafting')
  const ladder = recipeLadder(recipes, { level: 205, query: '', hideTrivial: true })
  assert.deepEqual(names(ladder.lines), [
    'Golden Ruby Ring:next',
    'Golden Jacinth Wedding Ring:above',
    'Golden Black Sapphire Earring:above',
    'heading:1',
    'Odd Trinket:unrated'
  ])
  assert.equal(ladder.openLine, 0)
})

test('the search reads item and material names, and never moves the next mark', () => {
  const recipes = skillRecipes(indexBook(fixtureBook()), 'Jewelcrafting')
  const byMaterial = recipeLadder(recipes, { level: 205, query: '  jacinth ', hideTrivial: false })
  assert.deepEqual(names(byMaterial.lines), ['Golden Jacinth Wedding Ring:above'])
  assert.equal(byMaterial.next?.item, 'Golden Ruby Ring', 'next is still the Ruby Ring though the search hid it')
  assert.equal(byMaterial.openLine, 0)
  const byItem = recipeLadder(recipes, { level: 205, query: 'EARRING', hideTrivial: false })
  assert.deepEqual(names(byItem.lines), ['Golden Black Sapphire Earring:above'])
  const ruby = recipeLadder(recipes, { level: 205, query: 'ruby', hideTrivial: false })
  assert.deepEqual(names(ruby.lines), ['Golden Ruby Ring:next', 'heading:1', 'Odd Trinket:unrated'])
  const none = recipeLadder(recipes, { level: 205, query: 'velium', hideTrivial: false })
  assert.equal(none.shown, 0)
  assert.equal(pickedRecipe(none, null), null)
})

test('the detail panel shows the picked recipe while it is listed, else the one the table opens on', () => {
  const recipes = skillRecipes(indexBook(fixtureBook()), 'Jewelcrafting')
  const ladder = recipeLadder(recipes, { level: 205, query: '', hideTrivial: false })
  assert.equal(pickedRecipe(ladder, null)?.item, 'Golden Ruby Ring')
  assert.equal(pickedRecipe(ladder, 'golden fire wedding ring#0')?.item, 'Golden Fire Wedding Ring')
  assert.equal(lineOfRecipe(ladder.lines, 'golden fire wedding ring#0'), 0)
  const hidden = recipeLadder(recipes, { level: 205, query: '', hideTrivial: true })
  assert.equal(pickedRecipe(hidden, 'golden fire wedding ring#0')?.item, 'Golden Ruby Ring', 'a pick the switch hid falls back')
  const onlyUnrated = recipeLadder(recipes, { level: 205, query: 'odd', hideTrivial: false })
  assert.equal(pickedRecipe(onlyUnrated, null)?.item, 'Odd Trinket')
})

test('a link in opens the recipe that makes the item, or failing that the first that uses it', () => {
  const index = indexBook(fixtureBook())
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Golden Ruby Ring')?.id, 'golden ruby ring#0', 'the recipe that makes it')
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'golden ruby ring +3')?.id, 'golden ruby ring#0', 'any case, any plus level')
  // Ruby is made by nothing; three recipes use it. The first in ladder order is the one opened.
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Ruby')?.item, 'Golden Ruby Ring', 'the first recipe that uses it')
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Fire Opal')?.item, 'Golden Fire Wedding Ring', 'a material by its redirect spelling')
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Opal of Fire')?.item, 'Golden Fire Wedding Ring', 'and by its own page name')
  // Making wins over using: Loop A is made by one Baking recipe and used by the other.
  assert.equal(recipeForItem(index, 'Baking', 'Loop A')?.item, 'Loop A')
  assert.equal(recipeForItem(index, 'Baking', 'Golden Ruby Ring'), null, 'another tradeskill has no recipe for it')
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Velium Bar'), null, 'an item no recipe names')
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Quest Idol'), null, 'a recipe whose word names no tradeskill is on no workbench')
})

test('a link in still finds a recipe the era setting hides, after the listed ones of its kind', () => {
  const book = fixtureBook()
  const index = indexBook(book, (r) => r.item === 'Golden Ruby Ring')
  assert.equal(index.byId.size, book.recipes.length, 'every recipe is reachable by id, hidden or not')
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Golden Ruby Ring')?.id, 'golden ruby ring#0', 'the hidden recipe that makes it')
  // Ruby: the hidden Ruby Ring uses it and so does the listed Odd Trinket. The listed one is opened.
  assert.equal(recipeForItem(index, 'Jewelcrafting', 'Ruby')?.item, 'Odd Trinket')
  const all = indexBook(book, (r) => r.tradeskill === 'Jewelcrafting')
  assert.equal(recipeForItem(all, 'Jewelcrafting', 'Ruby')?.item, 'Golden Ruby Ring', 'with none listed, the first hidden one in ladder order')
})

test('a recipe a link opened stays in the panel when the table hides it; any other pick falls back', () => {
  const index = indexBook(fixtureBook())
  const recipes = skillRecipes(index, 'Jewelcrafting')
  const hidden = recipeLadder(recipes, { level: 205, query: '', hideTrivial: true })
  const fire = 'golden fire wedding ring#0'
  assert.equal(benchRecipe(index, hidden, { id: fire, linked: true })?.item, 'Golden Fire Wedding Ring', 'linked: kept though Hide trivial took its line')
  assert.equal(benchRecipe(index, hidden, { id: fire, linked: false })?.item, 'Golden Ruby Ring', 'not linked: the line the table opens on')
  assert.equal(benchRecipe(index, hidden, { id: null, linked: true })?.item, 'Golden Ruby Ring', 'nothing picked')
  assert.equal(benchRecipe(index, hidden, { id: 'no such recipe#0', linked: true })?.item, 'Golden Ruby Ring', 'an id the book does not hold')
  const shown = recipeLadder(recipes, { level: 205, query: '', hideTrivial: false })
  assert.equal(benchRecipe(index, shown, { id: fire, linked: true })?.item, 'Golden Fire Wedding Ring')
  // The panel says so only when its recipe is not on a line under it.
  assert.equal(unlistedText(shown, benchRecipe(index, shown, { id: fire, linked: true })), null)
  assert.match(unlistedText(hidden, benchRecipe(index, hidden, { id: fire, linked: true })) ?? '', /not in the list/)
  assert.equal(unlistedText(hidden, null), null)
  // Under the era setting the hidden recipe is on no ladder at all, and a link still shows it.
  const era = indexBook(fixtureBook(), (r) => r.item === 'Golden Ruby Ring')
  const eraLadder = recipeLadder(skillRecipes(era, 'Jewelcrafting'), { level: 205, query: '', hideTrivial: false })
  assert.equal(benchRecipe(era, eraLadder, { id: 'golden ruby ring#0', linked: true })?.item, 'Golden Ruby Ring')
})

test('a recipe whose word names no tradeskill is on no ladder but still opens as a material', () => {
  const book = fixtureBook()
  const index = indexBook(book)
  const idol = book.recipes.find((r) => r.item === 'Quest Idol')
  assert.equal(idol?.tradeskill, undefined)
  assert.equal(idol?.skillWord, 'Non-Tradeskill')
  for (const t of TRADESKILLS) assert.ok(!skillRecipes(index, t).some((r) => r.item === 'Quest Idol'), t)
  const bar = subRecipes(index, 'enchanted gold bar', ['golden ruby ring'])
  assert.deepEqual(bar.map((r) => r.ingredients.map((i) => i.name)), [['Gold Bar']])
})

test('a material opens in place, stops at a loop and stops at the depth limit', () => {
  const index = indexBook(fixtureBook())
  assert.equal(subRecipes(index, 'loop b', ['loop a']).length, 1)
  assert.equal(subRecipes(index, 'loop a', ['loop a', 'loop b']).length, 0, 'already open above')
  const deep = Array.from({ length: MAX_RECIPE_DEPTH }, (_v, i) => `item ${String(i)}`)
  assert.equal(subRecipes(index, 'loop b', deep).length, 0, 'depth limit')
  assert.equal(subRecipes(index, 'ruby', []).length, 0, 'a material with no recipe')
})

test('each material is keyed to its own record, a redirect spelling included, with where it comes from', () => {
  const book = fixtureBook()
  const index = indexBook(book)
  const fire = book.recipes.find((r) => r.item === 'Golden Fire Wedding Ring')
  assert.deepEqual(fire?.ingredients.map((i) => i.key), ['enchanted gold bar', 'opal of fire'])
  assert.deepEqual(index.materials.get('opal of fire'), { dropsFrom: [{ mob: 'a fire giant' }] })
  assert.deepEqual(index.materials.get('ruby'), { dropsFrom: [{ mob: 'a ruby golem', zone: 'Najena' }] })
  assert.deepEqual(index.materials.get('jacinth'), { foraged: ['Lavastorm Mountains'] })
  assert.equal(index.materials.get('enchanted gold bar'), undefined, 'a page that states no drop or forage has no entry')
})

test('the era verdict is injected: a hidden recipe leaves its ladder and is counted, and still opens as a material', () => {
  const book = fixtureBook()
  const index = indexBook(book, (r) => r.item === 'Golden Ruby Ring' || r.item === 'Loop B')
  assert.ok(!skillRecipes(index, 'Jewelcrafting').some((r) => r.item === 'Golden Ruby Ring'))
  assert.equal(index.eraHidden.get('Jewelcrafting'), 1)
  assert.equal(index.eraHidden.get('Baking'), 1)
  assert.equal(index.eraHidden.get('Pottery'), undefined)
  assert.equal(subRecipes(index, 'loop b', []).length, 1)
  const ladder = recipeLadder(skillRecipes(index, 'Jewelcrafting'), { level: 205, query: '', hideTrivial: false })
  assert.equal(ladder.next?.item, 'Golden Jacinth Wedding Ring')
})

test('the level is the newest line of any spelling, and null when the log never showed the skill', () => {
  const rows = [skill('Jewelry Making', 205, 50), skill('Research', 40, 10), skill('Spell Research', 12, 20), skill('Kick', 90)]
  assert.equal(tradeskillLevel(rows, 'Jewelcrafting'), 205)
  assert.equal(tradeskillLevel(rows, 'Spell Research'), 12, 'the newer line wins, though it is lower')
  assert.equal(tradeskillLevel(rows, 'Baking'), null)
})

test('Home has one tile per tradeskill: the seen ones first by level, then the rest by name', () => {
  const index = indexBook(fixtureBook())
  const tiles = tradeskillTiles(index, [skill('Baking', 11), skill('Jewelry Making', 205), skill('Forage', 119)])
  assert.equal(tiles.length, TRADESKILLS.length)
  assert.deepEqual(tiles.slice(0, 3).map((t) => t.tradeskill), ['Jewelcrafting', 'Baking', 'Alchemy'])
  const [jewel, baking, alchemy] = tiles
  assert.deepEqual([jewel?.level, jewel?.recipes, jewel?.next?.item], [205, 6, 'Golden Ruby Ring'])
  assert.deepEqual([baking?.level, baking?.recipes, baking?.next?.item], [11, 2, 'Loop B'])
  assert.deepEqual([alchemy?.level, alchemy?.recipes, alchemy?.next], [null, 0, null])
  assert.ok(!tiles.some((t) => (t.tradeskill as string) === 'Forage'), 'Forage has no recipes and no tile')
})

test('the small words: source words, yield, a capped list, a stored tradeskill name', () => {
  assert.equal(sourceWords({ name: 'Ruby', sources: ['Bought', 'Dropped'] }), 'Bought, Dropped')
  assert.equal(sourceWords({ name: 'Ruby' }), '')
  const recipe = (over: Partial<BookRecipe>): BookRecipe => ({ id: 'arrow#0', key: 'arrow', item: 'Arrow', ingredients: [], ...over })
  assert.equal(yieldText(recipe({})), null)
  assert.equal(yieldText(recipe({ yieldItem: 'arrow', yieldQty: 1 })), null)
  assert.equal(yieldText(recipe({ yieldQty: 5 })), '5 x Arrow')
  assert.equal(yieldText(recipe({ yieldItem: 'Bundle of Arrows' })), '1 x Bundle of Arrows')
  assert.deepEqual(capped([1, 2, 3], 2), { shown: [1, 2], more: 1 })
  assert.deepEqual(capped([1, 2], 2), { shown: [1, 2], more: 0 })
  assert.equal(asTradeskill('Jewelry Making'), 'Jewelcrafting')
  assert.equal(asTradeskill('Forage'), null)
  assert.equal(asTradeskill(null), null)
})

test('Have counts bags, bank and the tradeskill depot, every plus level, and not a socketed copy', () => {
  const held = (place: OwnershipRow['place'], count: number, containment: OwnershipRow['containment'] = 'top'): OwnershipRow => ({
    key: 'ruby',
    name: 'Ruby',
    rawName: 'Ruby',
    place,
    location: '',
    count,
    section: '',
    exaltation: false,
    containment,
    itemId: 1,
    line: 1
  })
  const index = ownershipIndexFrom([['ruby', [held('personalDepot', 54), held('bank', 3, 'bag'), held('inventory', 9, 'socket')]]])
  assert.equal(heldCount(index, 'Ruby'), 57)
  assert.equal(heldCount(index, 'Ruby +2'), 57)
  assert.equal(heldCount(index, 'Jacinth'), 0)
})

test('two pages that share one in-game name are two recipes with their own ids, and both make the item', () => {
  const bow = (cord: string): ItemDbEntry =>
    entry(`Carved Bow (${cord})`, {
      name: 'Carved Bow',
      craftedBy: [{ tradeskill: 'Fletching', trivial: 68, ingredients: [{ name: `${cord} Bowstring`, qty: 1, sources: ['Bought'] }] }]
    })
  const pages = [bow('Linen'), bow('Hemp')]
  const file: ItemDbFile = {
    scrapedAt: '',
    source: 'fixture',
    count: 2,
    // The scrape files a page under its title and again under its item name: a second copy of the record.
    items: { 'carved bow (linen)': pages[0], 'carved bow (hemp)': pages[1], 'carved bow': { ...pages[0] } } as ItemDbFile['items']
  }
  const book = buildTradeskillBook(buildItemDbIndex(file), NO_ERA)
  assert.deepEqual(book.recipes.map((r) => r.id).sort(), ['carved bow (hemp)#0', 'carved bow (linen)#0'], 'each page once')
  assert.deepEqual(book.recipes.map((r) => r.key), ['carved bow', 'carved bow'])
  assert.equal(subRecipes(indexBook(book), 'carved bow', []).length, 2)
})

test('the mobs a material lists: capped, and under the era setting the out-of-era ones are left out and counted', () => {
  const mob = (name: string, zone: string, outOfEra = false): ItemSource => ({ mob: name, zones: [zone], ...(outOfEra ? { outOfEra: true as const } : {}) })
  const sources = [mob('a golem', 'Najena'), mob('a dragoon', 'Chardok'), mob('a flagged one', 'Najena', true), mob('a wanderer', 'Various')]
  const all = materialDrops(sources, false, 3)
  assert.deepEqual([all.shown.map((s) => s.mob), all.more, all.outOfEra], [['a golem', 'a dragoon', 'a flagged one'], 1, 0])
  const era = materialDrops(sources, true)
  assert.deepEqual(era.shown.map((s) => s.mob), ['a golem', 'a wanderer'], 'a zone the era table does not place is kept')
  assert.equal(era.outOfEra, 2)
  assert.equal(era.more, 0)
  assert.equal(materialDrops([], true).shown.length, 0)
  // One name on several pages is one row with every page's zones; an out-of-era page of it is dropped first.
  const bandits = [mob('a bandit', 'Lake Rathe'), mob('A Bandit', 'Western Karana'), mob('a bandit', 'Chardok'), mob('a bandit', 'Lake Rathe')]
  const folded = materialDrops(bandits, false)
  assert.deepEqual(folded.shown.map((s) => [s.mob, s.zones]), [['a bandit', ['Lake Rathe', 'Western Karana', 'Chardok']]])
  const foldedEra = materialDrops(bandits, true)
  assert.deepEqual(foldedEra.shown.map((s) => s.zones), [['Lake Rathe', 'Western Karana']])
  assert.equal(foldedEra.outOfEra, 0, 'the name is still listed, so nothing is counted as hidden')
  assert.deepEqual(bandits[0]?.zones, ['Lake Rathe'], 'the input rows are left as they were')
  assert.ok(MATERIAL_MOB_CAP > 0)
})

test('the words on screen: the facts of a recipe, its materials as text, and why a table is empty', () => {
  const book = fixtureBook()
  const index = indexBook(book)
  const ring = skillRecipes(index, 'Jewelcrafting').find((r) => r.item === 'Golden Ruby Ring')
  assert.ok(ring)
  assert.equal(recipeFacts(ring, false), "trivial 207 · Jeweler's Kit")
  assert.equal(recipeFacts(ring, true), "Jewelcrafting · trivial 207 · Jeweler's Kit")
  assert.equal(materialsText(ring), 'Enchanted Gold Bar (Bought + Enchanted), Ruby (Dropped)')
  const loop = book.recipes.find((r) => r.item === 'Loop B')
  assert.ok(loop)
  assert.equal(recipeFacts(loop, true), 'Baking · trivial 12 · makes 5 x Loop B')
  assert.equal(materialsText(loop), 'Loop A')
  const bar = book.recipes.find((r) => r.item === 'Enchanted Gold Bar')
  assert.ok(bar)
  assert.equal(recipeFacts(bar, true), `Non-Tradeskill · ${NO_TRIVIAL_TEXT}`)
  assert.equal(qtyPrefix({ name: 'Thread', qty: 2 }), '2 x ')
  assert.equal(qtyPrefix({ name: 'Thread', qty: 1 }), '')
  assert.equal(qtyPrefix({ name: 'Thread' }), '')

  const recipes = skillRecipes(index, 'Jewelcrafting')
  const ask = (over: { level?: number; query?: string; hideTrivial?: boolean }) => ({ level: 205, query: '', hideTrivial: false, ...over })
  const text = (a: ReturnType<typeof ask>, list = recipes, eraOnly = false): string | null => ladderEmptyText(recipeLadder(list, a), a, eraOnly)
  assert.equal(text(ask({})), null)
  assert.equal(text(ask({ query: 'velium' })), 'No recipe or material matches the search.')
  assert.equal(text(ask({ level: 300, hideTrivial: true, query: '' }), recipes.filter((r) => r.trivial !== undefined)), 'Every recipe here is already trivial for you.')
  assert.equal(text(ask({}), [], true), 'The wiki lists no recipes here in the current era.')
  assert.equal(text(ask({}), [], false), 'The wiki lists no recipes here.')
  assert.ok(LEVEL_UNSEEN_TEXT.includes('level 0'))
})

// ---- the committed item database --------------------------------------------------------------

test('the committed data builds a book: every tradeskill has recipes, in ladder order, with keyed materials', () => {
  const index = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const book = buildTradeskillBook(index, NO_ERA)
  assert.equal(book.version, TRADESKILL_BOOK_VERSION)
  // Measured 2026-11-20: 2,483 recipes, each page walked once; 2,359 name a tradeskill.
  assertCorpusFloor(book.recipes.length, 2483, 'recipes')
  const folded = indexBook(book)
  // Jewelry Making 202 plus Jewelcrafting 2 on that day: the two spellings are one ladder.
  assertCorpusFloor(skillRecipes(folded, 'Jewelcrafting').length, 204, 'Jewelcrafting recipes')
  for (const t of TRADESKILLS) {
    const recipes = skillRecipes(folded, t)
    assert.ok(recipes.length > 0, `${t} has no recipe`)
    const trivials = recipes.map((r) => r.trivial ?? Infinity)
    assert.deepEqual(trivials, [...trivials].sort((a, b) => a - b), `${t} is not ascending by trivial`)
  }
  assert.ok(book.recipes.every((r) => r.ingredients.every((i) => i.key !== '')), 'a material with no key')
  assert.equal(new Set(book.recipes.map((r) => r.id)).size, book.recipes.length, 'two recipes share an id')
  assert.ok(Object.keys(book.materials).length > 100, 'materials carry where they come from')
})
