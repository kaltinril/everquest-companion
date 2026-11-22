// A crafted item's recipe, told to the app on the Gaps tab (shared/gapRecipe.ts, main/gapRecipes.ts;
// owner, 2026-11-21, of Picnic Basket: "the app can format the complete wiki code for me"). Pinned:
// the wiki's own format, that nothing unstated is invented, and which rows the Ready rule moves.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recipeCatalog, recipeHelp, recipeHelpFor, recipelessOf, searchRecipeItems } from '../src/main/gapRecipes'
import type { ItemDbEntry } from '../src/main/itemsDb'
import type { CraftedItemRow } from '../src/shared/crafting'
import { handEdited, readEdit, tidyEdit, withGapEdits } from '../src/shared/gapEdits'
import { gapJob } from '../src/shared/gapJob'
import { needsWords, openNeeds } from '../src/shared/gapReady'
import {
  RECIPE_NEED,
  addMaterial,
  changeMaterial,
  containerOptions,
  guideOffers,
  needsRecipe,
  playercraftedValue,
  readRecipe,
  recipeDraft,
  recipeStated,
  removeMaterial,
  tradeOption,
  typedCount,
  typedSources,
  type GapRecipe,
  type GapRecipeHelp
} from '../src/shared/gapRecipe'
import { combinedNames, recipeRows } from '../src/shared/gapRecipeRows'
import type { TradeskillGuidesFile } from '../src/shared/guideData'
import { doneKey, editKey, type GapRow } from '../src/shared/gaps'
import { updateWhy } from '../src/shared/gapUpdateWhy'
import { stillNeeded, wikiPageText } from '../src/shared/wikiPage'

const row = (name: string, kinds: GapRow['kinds'], extra: Partial<GapRow> = {}, trades: string[] = []): GapRow => ({
  domain: 'item',
  name,
  kinds,
  count: 4,
  first: '',
  last: '',
  details: {
    samples: [],
    ...(trades.length === 0 ? {} : { tradeskills: { entries: trades.map((t) => ({ name: t, n: 4 })), distinct: trades.length, all: trades } })
  },
  ...extra
})

const BASKET: GapRecipe = {
  tradeskill: 'Tailoring',
  container: 'Large Sewing Kit',
  trivial: 76,
  materials: [
    { name: 'Woven Mandrake', qty: 2, iconId: 572, sources: ['Crafted'] },
    { name: 'Steel Boning', qty: 1, iconId: 1034, sources: ['Crafted', 'Bought'] }
  ]
}
const picnic = (recipe?: GapRecipe): GapRow => row('Picnic Basket', ['failed-combine', 'crafted', 'appraised'], recipe === undefined ? {} : { edit: { recipe } }, ['Tailoring'])
const shots = { itemShots: { 'Picnic Basket': { statsblock: 'Size: SMALL WT: 0.1<br>' } } }
const left = (r: GapRow, seen: Parameters<typeof stillNeeded>[3] = shots): string => needsWords(openNeeds(r, stillNeeded(r, [], {}, seen), { pictures: {} }))

test("the recipe is written in the wiki's exact format", () => {
  assert.equal(
    playercraftedValue('Picnic Basket', BASKET, 'Tailoring'),
    "\n\n* [[Tailoring]] (Trivial: 76)\n** '''Yield: Picnic Basket''' x1\n** In [[Large Sewing Kit]]:\n:: {{SmIcon|572}} 2 x [[Woven Mandrake]] - Crafted\n:: {{SmIcon|1034}} 1 x [[Steel Boning]] - Crafted, Bought\n"
  )
})

test('nothing unstated is invented: the wiki spelling of each unknown', () => {
  const bare: GapRecipe = { container: 'Forge or Oven', yieldQty: 3, materials: [{ name: 'A' }, { name: 'B', qty: 2 }, { name: 'C', iconId: 9, sources: ['Dropped'] }] }
  assert.equal(
    playercraftedValue('Thing', bare, 'Baking'),
    "\n\n* [[Baking]] (Trivial: ??)\n** '''Yield: Thing''' x3\n** In [[Forge]] or [[Oven]]:\n::  [[A]]\n::  2 x [[B]]\n:: {{SmIcon|9}} [[C]] - Dropped\n"
  )
})

test("Copy on a new page holds the whole recipe; with none it is today's bare tradeskill", () => {
  const page = wikiPageText(picnic(BASKET), [], {}, shots)
  assert.ok(page.includes("|playercrafted = \n\n* [[Tailoring]] (Trivial: 76)\n** '''Yield: Picnic Basket''' x1\n** In [[Large Sewing Kit]]:\n:: {{SmIcon|572}} 2 x [[Woven Mandrake]] - Crafted"), page)
  assert.ok(page.includes('[[Category:Player Crafted]]'))
  assert.ok(wikiPageText(picnic(), [], {}, shots).includes('|playercrafted = \n\n* [[Tailoring]]\n'))
})

test('a note goes in the page notes, and an edited name is the yield', () => {
  const page = wikiPageText(row('Picnic Basket', ['crafted'], { edit: { name: 'Picnic Basket II', recipe: { ...BASKET, notes: 'Used in a quest.' } } }, ['Tailoring']), [], {}, shots)
  assert.ok(page.includes('|notes = Used in a quest.\n|statsblock'), page)
  assert.ok(page.includes("'''Yield: Picnic Basket II''' x1"), page)
})

test('READY: a crafted item with no recipe needs one until materials with counts and a container are in', () => {
  assert.equal(left(picnic()), 'recipe')
  assert.equal(left(picnic({ ...BASKET, container: undefined })), 'recipe')
  assert.equal(left(picnic({ ...BASKET, materials: [] })), 'recipe')
  assert.equal(left(picnic({ ...BASKET, materials: [{ name: 'Woven Mandrake' }] })), 'recipe', 'a material with no count is not stated yet')
  assert.equal(left(picnic(BASKET)), '')
  assert.equal(left(picnic(BASKET), {}), 'stats', 'the recipe does not stand in for the item window')
  assert.equal(left(picnic(), {}), 'stats, recipe')
  // No tradeskill from the log or the player: nothing to write it under.
  const noTrade: GapRecipe = { container: 'Oven', materials: [{ name: 'A', qty: 1 }] }
  assert.equal(left(row('Odd Pie', ['crafted'], { edit: { recipe: noTrade } }), { itemShots: { 'Odd Pie': { statsblock: 'x' } } }), 'recipe')
  assert.equal(left(row('Odd Pie', ['crafted'], { edit: { recipe: { ...noTrade, tradeskill: 'Baking' } } }), { itemShots: { 'Odd Pie': { statsblock: 'x' } } }), '')
})

test('READY: every other row reads as it did', () => {
  const seen = { itemShots: { Rock: { statsblock: 'x' } } }
  for (const kinds of [['looted'], ['bought'], ['foraged'], ['by-product'], ['fused'], ['received'], ['held'], ['captured'], ['captured', 'looted']] as GapRow['kinds'][]) {
    const r = row('Rock', kinds)
    assert.equal(needsRecipe(r), false, kinds.join())
    assert.equal(left(r, seen), kinds.every((k) => k === 'held' || k === 'captured') ? 'where it comes from' : '', kinds.join())
  }
  const crafted = ['crafted'] as GapRow['kinds']
  assert.equal(needsRecipe(row('Rock', crafted, { suggest: { name: 'Rok', page: 'Rok', distance: 1 } })), false, 'a redirect')
  assert.equal(needsRecipe(row('Rock', crafted, { viaRedirect: 'Rok' })), false, 'a name known through a redirect')
  assert.equal(needsRecipe(row('Rock', crafted, { iconUpdate: { page: 'Rock' } })), false, 'one other field of a page')
  assert.equal(needsRecipe({ ...row('Rock', crafted), domain: 'spell' }), false, 'not an item')
  assert.equal(left(row('Rock', crafted, { suggest: { name: 'Rok', page: 'Rok', distance: 1 } })), '')
})

test('a stored recipe is read defensively, and survives an edit round trip', () => {
  assert.equal(readRecipe('x'), undefined)
  assert.equal(readRecipe({ tradeskill: 'Baking', materials: [] }), undefined, 'the untouched form is no recipe')
  assert.deepEqual(readRecipe({ container: ' Oven ', trivial: -3, yieldQty: 1.5, materials: [{ name: ' A ', qty: 0, iconId: 'x', sources: ['Bought', 3, ' '] }, { qty: 2 }, 7] }), {
    container: 'Oven',
    materials: [{ name: 'A', sources: ['Bought'] }]
  })
  const edit = readEdit({ recipe: BASKET })
  assert.deepEqual(edit?.recipe, BASKET)
  assert.equal(handEdited(edit), false, 'a recipe alone does not wear the edited chip')
  assert.equal(handEdited({ name: 'x', recipe: BASKET }), true)
  assert.deepEqual(tidyEdit({ recipe: BASKET })?.recipe, BASKET)
  assert.equal(tidyEdit({ recipe: { tradeskill: 'Baking', materials: [] } }), null)
  const [on] = withGapEdits([picnic()], { 'item:picnic basket': { recipe: BASKET } })
  assert.equal(recipeStated(on), true)
})

test('the form: adds once, changes one material, opens on the log tradeskill, and reads typed values', () => {
  const none = recipeDraft(picnic())
  assert.deepEqual(none, { tradeskill: 'Tailoring', materials: [] })
  assert.equal(recipeDraft(picnic(BASKET)), BASKET)
  const one = addMaterial(none, { name: 'Woven Mandrake', qty: 1 })
  assert.equal(addMaterial(one, { name: 'woven mandrake ', qty: 5 }), one)
  assert.equal(addMaterial(one, { name: '  ' }), one)
  assert.equal(changeMaterial(one, 'Woven Mandrake', { qty: 3 }).materials[0].qty, 3)
  assert.equal(changeMaterial(one, 'Woven Mandrake', { qty: undefined }).materials[0].qty, undefined)
  assert.deepEqual(removeMaterial(one, 'WOVEN MANDRAKE').materials, [])
  assert.equal(typedCount(' 12 '), 12)
  for (const bad of ['', '0', '-2', '1.5', 'x']) assert.equal(typedCount(bad), undefined, bad)
  assert.deepEqual(typedSources('Bought, , Returned on Failure'), ['Bought', 'Returned on Failure'])
})

const HELP: GapRecipeHelp = { trades: ['Jewelry Making', 'Tailoring'], containers: { 'Jewelry Making': ["Jeweler's Kit"], Tailoring: ['Loom', 'Large Sewing Kit'] }, guide: [{ name: 'Woven Mandrake' }, { name: 'Steel Boning', qty: 2 }] }

test('the offers: containers by tradeskill in any spelling; a guide material is offered, never written', () => {
  assert.equal(tradeOption(HELP, 'Jewelcrafting'), 'Jewelry Making')
  assert.equal(tradeOption(HELP, 'Oddcraft'), 'Oddcraft')
  assert.deepEqual(containerOptions(HELP, 'Jewelcrafting'), ["Jeweler's Kit"])
  assert.deepEqual(containerOptions(HELP, undefined), [])
  const draft = recipeDraft(picnic())
  assert.deepEqual(guideOffers(draft, HELP.guide).map((m) => m.name), ['Woven Mandrake', 'Steel Boning'])
  assert.deepEqual(draft.materials, [], 'an offer is not on the recipe')
  const added = addMaterial(draft, HELP.guide[0])
  assert.equal(added.materials[0].qty, undefined, 'a guide that states no count gets none')
  assert.deepEqual(guideOffers(added, HELP.guide).map((m) => m.name), ['Steel Boning'])
})

const entry = (page: string, fields: Partial<ItemDbEntry> = {}): ItemDbEntry => ({ page, ...fields })
const CORPUS: Record<string, ItemDbEntry> = {
  'woven mandrake': entry('Woven Mandrake', { iconId: 572, craftedBy: [{ tradeskill: 'Tailoring', container: 'Large Sewing Kit', ingredients: [{ name: 'Mandrake Root', qty: 2, sources: ['Bought'] }] }] }),
  'steel boning': entry('Steel Boning', { iconId: 1034, craftedBy: [{ tradeskill: 'Blacksmithing', container: 'Forge', ingredients: [{ name: 'File', qty: 1, sources: ['Crafted', 'Returned on Failure'] }] }] }),
  'mandrake root': entry('Mandrake Root', { iconId: 583 }),
  file: entry('File', { iconId: 1035 }),
  'silk cape': entry('Silk Cape', { craftedBy: [{ tradeskill: ':Tailoring', container: 'Loom', ingredients: [{ name: 'Mandrake Root', qty: 1, sources: ['Dropped'] }] }, { tradeskill: 'Tailoring', container: 'Loom', ingredients: [{ name: 'Mandrake Root', qty: 1, sources: ['Bought'] }] }] }),
  'silk hat': entry('Silk Hat', { craftedBy: [{ tradeskill: 'Tailoring', container: 'Loom', ingredients: [{ name: 'Mandrake Root', qty: 1, sources: ['Bought'] }] }] }),
  'ore ring': entry('Ore Ring', { iconId: 5, dropsFrom: [{ mob: 'a rat' }], foraged: ['Zone'] }),
  'picnic basket': entry('Picnic Basket', { iconId: 724, craftedBy: [{ tradeskill: 'Tailoring', ingredients: [] }] }),
  'odd coin': entry('Odd Coin', { craftedNote: 'Non-Tradeskill (Quest)' }),
  'plain rock': entry('Plain Rock')
}

test('main: the search ranks starts-with first and carries the icon and the wiki words', () => {
  const c = recipeCatalog(CORPUS)
  assert.deepEqual(searchRecipeItems(c, 'man').map((m) => m.name), ['Mandrake Root', 'Woven Mandrake'])
  assert.deepEqual(searchRecipeItems(c, 'mandrake root')[0], { name: 'Mandrake Root', iconId: 583, sources: ['Bought'] }, 'the wording most recipes state')
  assert.deepEqual(searchRecipeItems(c, 'file')[0].sources, ['Crafted', 'Returned on Failure'])
  assert.deepEqual(searchRecipeItems(c, 'ore ring')[0].sources, ['Foraged', 'Dropped'], "no recipe uses it: what its own page proves, in the wiki's order")
  assert.equal(searchRecipeItems(c, 'plain rock')[0].sources, undefined)
  assert.deepEqual(searchRecipeItems(c, '  '), [])
})

const GUIDES = {
  leveling: { tradeskills: { Tailoring: { notes: [], steps: [{ from: 67, to: 76, item: 'Picnic basket', materials: [{ name: 'Woven mandrake' }, { name: 'Steel boning', qty: 2 }, { name: 'Loose guide word' }] }], alternates: [] } } },
  recipes: { tradeskills: {} }
} as unknown as TradeskillGuidesFile

test("main: a tradeskill's containers, most used first, and a guide's materials with only what it states", () => {
  const c = recipeCatalog(CORPUS)
  const help = recipeHelpFor(c, CORPUS, GUIDES, 'Picnic Basket')
  assert.deepEqual(help.containers.Tailoring, ['Loom', 'Large Sewing Kit'])
  assert.ok(help.trades.includes('Tailoring'))
  assert.ok(!help.trades.some((t) => t.startsWith(':')), 'a stray spelling is never the offered one')
  assert.deepEqual(help.guide, [
    { name: 'Woven Mandrake', iconId: 572, sources: ['Crafted'] },
    { name: 'Steel Boning', qty: 2, iconId: 1034, sources: ['Crafted'] },
    { name: 'Loose guide word' }
  ])
  assert.deepEqual(recipeHelpFor(c, CORPUS, GUIDES, 'Silk Hat').guide, [])
})

test('main: only a page that states no materials is recipeless', () => {
  assert.deepEqual(recipelessOf(CORPUS, ['Picnic Basket', 'Woven Mandrake', 'Odd Coin', 'Plain Rock', 'No Such Item']), [
    { name: 'Picnic Basket', page: 'Picnic Basket', tradeskill: 'Tailoring' },
    { name: 'Plain Rock', page: 'Plain Rock' }
  ])
})

test('the committed data answers: every tradeskill has a spelling and the search finds a material', () => {
  const help = recipeHelp('No Such Item')
  assert.equal(help.trades.length, 12)
  assert.ok((help.containers.Tailoring ?? []).length > 0)
  assert.deepEqual(help.guide, [])
})

test('Copy on an existing page keeps the trivial, container and yield the page already states', () => {
  const page = { name: 'Picnic Basket', page: 'Picnic Basket', tradeskill: 'Tailoring', trivial: 45, container: 'Loom', yieldQty: 2 }
  const [r] = recipeRows([page], [combine('Picnic Basket')], [])
  assert.deepEqual(r.recipeUpdate, { page: 'Picnic Basket', trivial: 45, container: 'Loom', yieldQty: 2 })
  assert.equal(wikiPageText(r, [], {}), "On Picnic Basket, replace | playercrafted = with:\n\n|playercrafted = \n\n* [[Tailoring]] (Trivial: 45)\n** '''Yield: Picnic Basket''' x2\n** In [[Loom]]:\n")
  assert.deepEqual(recipeDraft(r), { tradeskill: 'Tailoring', trivial: 45, container: 'Loom', yieldQty: 2, materials: [] })
  const picked = { ...r, edit: { recipe: { materials: [{ name: 'Silk', qty: 1 }] } } }
  assert.deepEqual(stillNeeded(picked, [], {}, {}), [], 'the page states the container, so the materials finish it')
  assert.ok(wikiPageText(picked, [], {}).includes('(Trivial: 45)'))
  const changed = { ...r, edit: { recipe: { trivial: 50, materials: [{ name: 'Silk', qty: 1 }] } } }
  assert.ok(wikiPageText(changed, [], {}).includes('(Trivial: 50)'), 'what the player states wins')
})

test('a Done mark on the New row does not hide the recipe Update row, and the typed recipe carries over', () => {
  const made = picnic(BASKET)
  const [update] = recipeRows([{ name: 'Picnic Basket', page: 'Picnic Basket' }], [combine('Picnic Basket')], [])
  assert.notEqual(doneKey(update), doneKey(made), 'two jobs, two Done marks')
  assert.equal(editKey(update), editKey(made), 'one recipe')
  const [withEdit] = withGapEdits([update], { [editKey(made)]: { recipe: BASKET } })
  assert.deepEqual(withEdit.edit?.recipe?.materials.map((m) => m.name), ['Woven Mandrake', 'Steel Boning'])
})

const combine = (item: string, fields: Partial<CraftedItemRow> = {}): CraftedItemRow =>
  ({ item, made: 2, failed: 1, trivial: 0, raises: 0, firstTs: Date.UTC(2026, 10, 21, 12), lastTs: Date.UTC(2026, 10, 21, 13), sessionMade: 0, sessionFailed: 0, sessionRaises: 0, ...fields })

test('a page that exists without materials is an Update row whose Copy says where the recipe goes', () => {
  const pages = [{ name: 'Picnic Basket', page: 'Picnic Basket', tradeskill: 'Tailoring' }, { name: 'Never Made', page: 'Never Made' }, { name: 'Has Row', page: 'Has Row' }]
  const [r, ...rest] = recipeRows(pages, [combine('Picnic Basket'), combine('Has Row')], [row('Has Row', ['crafted'])])
  assert.equal(rest.length, 0, 'none for an item never combined, or one a row already names')
  assert.deepEqual(r.kinds, ['crafted', 'failed-combine'])
  assert.equal(r.count, 3)
  assert.equal(gapJob(r), 'update')
  assert.deepEqual(updateWhy(r), ['The page for Picnic Basket does not state its recipe\'s materials.'])
  assert.equal(needsRecipe(r), true)
  assert.deepEqual(stillNeeded(r, [], {}, {}), [RECIPE_NEED], 'the page exists: only the recipe is asked for')
  assert.equal(wikiPageText(r, [], {}), 'On Picnic Basket, replace | playercrafted = with:\n\n|playercrafted = \n\n* [[Tailoring]]\n')
  const done = { ...r, edit: { recipe: BASKET } }
  assert.deepEqual(stillNeeded(done, [], {}, {}), [])
  assert.equal(
    wikiPageText(done, [], {}),
    "On Picnic Basket, replace | playercrafted = with:\n\n|playercrafted = \n\n* [[Tailoring]] (Trivial: 76)\n** '''Yield: Picnic Basket''' x1\n** In [[Large Sewing Kit]]:\n:: {{SmIcon|572}} 2 x [[Woven Mandrake]] - Crafted\n:: {{SmIcon|1034}} 1 x [[Steel Boning]] - Crafted, Bought\n"
  )
  assert.deepEqual(combinedNames([combine('B'), combine('A'), combine('B')]), ['A', 'B'])
})
