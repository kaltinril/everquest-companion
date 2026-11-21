// Wiki first (src/shared/tradeskillWiki.ts; owner, 2026-11-20: "WIKI is our PRIMARY source, and
// others are secondary. If there are issues with the wiki, the users need to find out and fix the
// wiki, that's the point of a wiki"): which page a recipe links to, what the page lacks, the
// "Missing on the wiki" switch, and what is said when a guide lists a recipe otherwise than the
// wiki does. Fixtures first, then the committed item database and guide file.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook, wikiItemName } from '../src/main/tradeskillBook'
import { GUIDE_CREDITS, guideCreditLine } from '../src/shared/guideCredits'
import type { GuideRecipe, GuideStep, TradeskillGuidesFile } from '../src/shared/guideData'
import { TRADESKILL_BOOK_VERSION, indexBook, ladderEmptyText, recipeLadder, skillRecipes, type BookIndex, type BookRecipe, type LadderAsk } from '../src/shared/tradeskillBook'
import { LEVELING_GUIDE_ID, RECIPE_GUIDE_ID, guideMaterialsFor, guidePayload, indexGuides, type GuideIndex } from '../src/shared/tradeskillGuide'
import { benchFilters } from '../src/shared/tradeskillHeld'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import { expandMaterials, recipeMaterials } from '../src/shared/tradeskillMaterials'
import { moneyBook } from '../src/shared/tradeskillMoney'
import { planTree } from '../src/shared/tradeskillPlan'
import { TRADESKILLS } from '../src/shared/tradeskills'
import {
  WIKI_CELL_LINK,
  WIKI_GAP_FILTER,
  gapNote,
  guideDifferenceText,
  guideDifferences,
  guideTrivialText,
  recipeWikiPage,
  recipeWikiUrl,
  wikiGap,
  wikiGapCount,
  wikiGapSwitchLabel,
  wikiGapText,
  wikiLinkLabel,
  wikiRowLink
} from '../src/shared/tradeskillWiki'
import { bought, fixtureSnap, ing, recipe } from './tradeskillFixtures.mts'

const credit = (id: string): { id: string; title: string; author: string; sourceUrl: string; pulledAt: string } => ({
  id,
  title: 'a guide',
  author: 'a player',
  sourceUrl: 'https://example.invalid/guide',
  pulledAt: '2026-11-20T00:00:00.000Z'
})

const creditOf = (id: string): string => {
  const found = GUIDE_CREDITS.find((c) => c.id === id)
  assert.ok(found)
  return guideCreditLine(found)
}

const brew = (item: string, over: Partial<BookRecipe> = {}): BookRecipe => recipe(item, { tradeskill: 'Brewing', ...over })

/** Brewing recipes the wiki states, each against what a fixture guide says of the same item. */
const WIKI: BookRecipe[] = [
  brew('Heady Kiola', { trivial: 46, ingredients: [ing('Bottle', 1), ing('Packet of Kiola Sap', 2), ing('Water Flask', 1)] }),
  brew('Same Brew', { trivial: 20, ingredients: [ing('Water Flask', 1), ing('Malt', 2)] }),
  brew('Loose Brew', { trivial: 21, ingredients: [ing('Fresh Fish', 1), ing('Jug of Sauces', 1)] }),
  brew('Swapped Brew', { trivial: 22, ingredients: [ing('Evergreen Leaf', 1), ing('Water Flask', 1)] }),
  brew('Short Brew', { trivial: 23, ingredients: [ing('Malt', 1), ing('Water Flask', 1), ing('Yeast', 1)] }),
  brew('Other Trivial', { trivial: 195, ingredients: [ing('Malt', 1)] }),
  brew('Both Brew', { trivial: 21, ingredients: [ing('Small Piece of Ore', 2), ing('Water Flask', 1)] }),
  // The wiki lists no materials: the guide's fill in, and that is not a difference.
  brew('Guide Only', { trivial: 60 }),
  // The wiki lists materials and no trivial: the guide's trivial is said as the guide's.
  brew('Unrated Brew', { ingredients: [ing('Malt', 1)] }),
  brew('Bare Brew'),
  brew('Stepped Brew', { trivial: 80, ingredients: [ing('Malt', 1), ing('Water Flask', 1)] }),
  // Two wiki pages share one item name.
  brew('Carved Bow', { id: 'carved bow (linen)#0', page: 'Carved Bow (Linen)', trivial: 90, ingredients: [ing('Malt', 1)] })
]

const guideRecipe = (item: string, trivial: number | undefined, materials: GuideRecipe['materials']): GuideRecipe => ({
  item,
  notes: [],
  materials,
  ...(trivial === undefined ? {} : { trivial })
})

const GUIDE_RECIPES: GuideRecipe[] = [
  guideRecipe('Heady Kiola', 46, [{ name: 'Water Flask' }, { name: 'Bottle' }, { name: 'Packet of Kiola Sap' }]),
  // The same list in another order, with the count written out.
  guideRecipe('Same Brew', 20, [{ name: 'Malt', qty: 2 }, { name: 'water flask', qty: 1 }]),
  // A loose spelling of the wiki's own material: not a difference on its own.
  guideRecipe('Loose Brew', 21, [{ name: 'Fresh Fresh' }, { name: 'Jug of Sauces' }]),
  // A real wiki item the wiki's list does not hold.
  guideRecipe('Swapped Brew', 22, [{ name: 'Duskglow Vine' }, { name: 'Water Flask' }]),
  guideRecipe('Short Brew', 23, [{ name: 'Malt' }, { name: 'Yeast', returned: true }]),
  guideRecipe('Other Trivial', 163, [{ name: 'Malt' }]),
  guideRecipe('Both Brew', 18, [{ name: 'Water Flask' }, { name: 'Small Piece of Ore' }]),
  guideRecipe('Guide Only', 60, [{ name: 'Malt', qty: 3 }]),
  guideRecipe('Unrated Brew', 162, [{ name: 'Malt' }])
]

const step = (item: string, materials: GuideStep['materials']): GuideStep => ({ from: 60, to: 80, item, materials })

function guideFile(): TradeskillGuidesFile {
  return {
    about: 'fixture',
    leveling: {
      ...credit(LEVELING_GUIDE_ID),
      overview: [],
      tradeskills: {
        Brewing: {
          notes: [],
          // The leveling guide adds a material the wiki does not list; its sub-combine nests and is not compared.
          steps: [step('Stepped brew', [{ name: 'Malt' }, { name: 'Water flask' }, { name: 'Pelt/skin', materials: [{ name: 'Thread' }] }]), step('Same brew', [])],
          alternates: []
        }
      }
    },
    recipes: { ...credit(RECIPE_GUIDE_ID), tradeskills: { Brewing: { recipes: GUIDE_RECIPES } } }
  }
}

/** Every name the fixture guide writes that is a wiki item's own, whatever its case. */
const NAMED = ['Heady Kiola', 'Same Brew', 'Loose Brew', 'Swapped Brew', 'Short Brew', 'Other Trivial', 'Both Brew', 'Guide Only', 'Unrated Brew', 'Stepped Brew']
const ITEMS = ['Water Flask', 'Bottle', 'Packet of Kiola Sap', 'Malt', 'Jug of Sauces', 'Duskglow Vine', 'Yeast', 'Small Piece of Ore']

function fixture(): { index: BookIndex; guides: GuideIndex } {
  const names = new Map([...NAMED, ...ITEMS].map((name) => [name.toLowerCase(), name]))
  return {
    index: indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: WIKI, materials: {} }),
    guides: indexGuides(guidePayload(guideFile(), (name) => names.get(name.trim().toLowerCase())))
  }
}

const byItem = (index: BookIndex, item: string): BookRecipe => {
  const found = [...index.byId.values()].find((r) => r.item === item)
  assert.ok(found, item)
  return found
}

// ---- the page ---------------------------------------------------------------------------------

test('a recipe links to its own wiki page: the item name, or the page title where several pages share the name', () => {
  const { index } = fixture()
  const kiola = byItem(index, 'Heady Kiola')
  assert.equal(recipeWikiPage(kiola), 'Heady Kiola')
  assert.equal(recipeWikiUrl(kiola), 'https://eqlwiki.com/Heady_Kiola')
  assert.equal(wikiLinkLabel(kiola), 'Open Heady Kiola on the wiki')
  const bow = byItem(index, 'Carved Bow')
  assert.equal(recipeWikiPage(bow), 'Carved Bow (Linen)')
  assert.equal(recipeWikiUrl(bow), 'https://eqlwiki.com/Carved_Bow_(Linen)')
  // The link is the app's standard wiki address and no other host.
  for (const made of index.byId.values()) assert.match(recipeWikiUrl(made) ?? '', /^https:\/\/eqlwiki\.com\/[^/?#]+$/, made.item)
})

// ---- the gap ----------------------------------------------------------------------------------

test('what the wiki page lacks is said in one plain line: materials, the trivial, or both', () => {
  const { index } = fixture()
  assert.equal(wikiGap(byItem(index, 'Heady Kiola')), null)
  assert.deepEqual(wikiGap(byItem(index, 'Guide Only')), { materials: true, trivial: false })
  assert.deepEqual(wikiGap(byItem(index, 'Unrated Brew')), { materials: false, trivial: true })
  assert.deepEqual(wikiGap(byItem(index, 'Bare Brew')), { materials: true, trivial: true })
  assert.equal(wikiGapText({ materials: true, trivial: false }), 'The wiki page lists no materials for this recipe. If you know them, that page is where to add them.')
  assert.equal(wikiGapText({ materials: false, trivial: true }), 'The wiki page states no trivial for this recipe. If you know it, that page is where to add it.')
  assert.equal(wikiGapText({ materials: true, trivial: true }), 'The wiki page lists no materials and no trivial for this recipe. If you know them, that page is where to add them.')
  // A table line carries one link: in the empty Materials cell, else beside the item's name.
  assert.equal(wikiRowLink(byItem(index, 'Heady Kiola')), null)
  assert.deepEqual(wikiRowLink(byItem(index, 'Guide Only')), {
    place: 'materials',
    tip: 'The wiki lists no materials for this recipe. Opens its page on eqlwiki.com, where they can be added.'
  })
  assert.deepEqual(wikiRowLink(byItem(index, 'Bare Brew')), {
    place: 'materials',
    tip: 'The wiki lists no materials and no trivial for this recipe. Opens its page on eqlwiki.com, where they can be added.'
  })
  assert.deepEqual(wikiRowLink(byItem(index, 'Unrated Brew')), {
    place: 'item',
    tip: 'The wiki states no trivial for this recipe. Opens its page on eqlwiki.com, where it can be added.'
  })
  assert.equal(WIKI_CELL_LINK, 'wiki')
})

test("the gap line says the rest itself: the guide's materials, or nothing to draw, is a clause of the one line", () => {
  const { index, guides } = fixture()
  // The recipe guide's list stands in: the line says whose the materials are and where to add the wiki's.
  assert.equal(gapNote(guides, byItem(index, 'Guide Only')), 'guide')
  assert.equal(
    wikiGapText({ materials: true, trivial: false }, 'guide'),
    "The wiki page lists no materials for this recipe, so the materials shown are the recipe guide's. If you know them, that page is where to add them."
  )
  assert.equal(
    wikiGapText({ materials: true, trivial: true }, 'guide'),
    "The wiki page lists no materials and no trivial for this recipe, so the materials shown are the recipe guide's. If you know them, that page is where to add them."
  )
  // The wiki lists its own, or neither lists any: no such clause.
  assert.equal(gapNote(guides, byItem(index, 'Heady Kiola')), undefined)
  assert.equal(gapNote(guides, byItem(index, 'Bare Brew')), undefined)
  // The planner looked in the guide too; the shopping list has nothing to list.
  assert.equal(
    wikiGapText({ materials: true, trivial: false }, 'guideNone'),
    'The wiki page lists no materials for this recipe, and the recipe guide lists none. If you know them, that page is where to add them.'
  )
  assert.equal(
    wikiGapText({ materials: true, trivial: false }, 'noList'),
    'The wiki page lists no materials for this recipe, so there is nothing to shop for. If you know them, that page is where to add them.'
  )
  // A page that lacks only its trivial has its materials: a note about them is not said.
  assert.equal(wikiGapText({ materials: false, trivial: true }, 'guide'), wikiGapText({ materials: false, trivial: true }))
  // "The wiki ... lists no materials" is said once in every variant.
  for (const note of [undefined, 'guide', 'guideNone', 'noList'] as const) {
    assert.equal(wikiGapText({ materials: true, trivial: false }, note).split('no materials').length, 2, String(note))
  }
})

test('"Missing on the wiki" keeps only recipes with a gap, counts them, and says when there are none', () => {
  const { index } = fixture()
  const recipes = skillRecipes(index, 'Brewing')
  assert.equal(wikiGapCount(recipes), 3)
  assert.equal(wikiGapSwitchLabel(3), 'Missing on the wiki (3)')
  const ask = (over: Partial<LadderAsk>): LadderAsk => ({ level: 50, query: '', hideTrivial: false, only: benchFilters(null, true), ...over })
  const ladder = recipeLadder(recipes, ask({}))
  // The rated one first, then the two with no trivial under their heading.
  assert.deepEqual(
    ladder.lines.map((l) => (l.kind === 'recipe' ? l.recipe.item : `heading:${String(l.count)}`)),
    ['Guide Only', 'heading:2', 'Bare Brew', 'Unrated Brew']
  )
  assert.equal(ladder.shown, 3)
  assert.equal(ladder.total, recipes.length)
  assert.ok(ladder.lines.every((l) => l.kind !== 'recipe' || WIKI_GAP_FILTER.keep(l.recipe)))
  // Hide trivial and a search still apply on top of it.
  assert.equal(recipeLadder(recipes, ask({ query: 'malt' })).shown, 1)
  const whole = recipes.filter((r) => wikiGap(r) === null)
  assert.equal(ladderEmptyText(recipeLadder(whole, ask({})), ask({}), false), 'No recipe listed here is missing its materials or its trivial on the wiki.')
})

// ---- the guides -------------------------------------------------------------------------------

test('a guide that lists a recipe otherwise than the wiki is said in one credited line, and only when it is shown to differ', () => {
  const { index, guides } = fixture()
  const text = (item: string): string[] => guideDifferences(guides, byItem(index, item)).map(guideDifferenceText)
  const from = `From ${creditOf(RECIPE_GUIDE_ID)}.`

  // A material both name, at another count.
  assert.deepEqual(text('Heady Kiola'), [`The wiki's materials are shown. The recipe guide lists: Water Flask, Bottle, Packet of Kiola Sap. ${from}`])
  // The same list in another order and case: nothing to say.
  assert.deepEqual(text('Same Brew'), [])
  // A loose name cannot be told from the wiki's own material: not called a difference.
  assert.deepEqual(text('Loose Brew'), [])
  // The guide names a wiki item the wiki's list does not hold.
  assert.deepEqual(text('Swapped Brew'), [`The wiki's materials are shown. The recipe guide lists: Duskglow Vine, Water Flask. ${from}`])
  // Fewer materials, and the guide's "returned" is kept as it wrote it.
  assert.deepEqual(text('Short Brew'), [`The wiki's materials are shown. The recipe guide lists: Malt, Yeast (returned). ${from}`])
  // The trivial alone.
  assert.deepEqual(text('Other Trivial'), [`The wiki's trivial is shown. The recipe guide lists trivial 163. ${from}`])
  // Both.
  assert.deepEqual(text('Both Brew'), [`The wiki's materials and trivial are shown. The recipe guide lists: Water Flask, Small Piece of Ore, at trivial 18. ${from}`])
  // Where the wiki is silent the guide fills in: that is the gap, not a difference.
  assert.deepEqual(text('Guide Only'), [])
  assert.deepEqual(text('Unrated Brew'), [])
  assert.deepEqual(text('Bare Brew'), [])
  // The leveling guide's step for the item, with its own credit; a nested sub-combine is not compared.
  assert.deepEqual(text('Stepped Brew'), [`The wiki's materials are shown. The leveling guide lists: Malt, Water flask, Pelt/skin. From ${creditOf(LEVELING_GUIDE_ID)}.`])

  // The credit is text: no address of a guide is in any line.
  for (const made of index.byId.values()) for (const line of text(made.item)) assert.doesNotMatch(line, /https?:|www\.|\.com|docs\.google|[–—]/, line)
})

test('where the wiki states no trivial and the recipe guide does, the trivial is said as the guide\'s and the ladder is left alone', () => {
  const { index, guides } = fixture()
  assert.equal(guideTrivialText(guides, byItem(index, 'Unrated Brew')), `The recipe guide lists trivial 162. From ${creditOf(RECIPE_GUIDE_ID)}.`)
  // The wiki has one, or the guide none.
  assert.equal(guideTrivialText(guides, byItem(index, 'Heady Kiola')), '')
  assert.equal(guideTrivialText(guides, byItem(index, 'Bare Brew')), '')
  // Still unrated on the ladder: the guide's number does not place it.
  const ladder = recipeLadder(skillRecipes(index, 'Brewing'), { level: 0, query: '', hideTrivial: false })
  const line = ladder.lines.find((l) => l.kind === 'recipe' && l.recipe.item === 'Unrated Brew')
  assert.equal(line?.kind === 'recipe' ? line.state : '', 'unrated')
})

test('WIKI FIRST everywhere: the materials, the plan, the cost and the shopping list are the wiki\'s where a guide differs', () => {
  const { index, guides } = fixture()
  const kiola = byItem(index, 'Heady Kiola')
  // The guide says one packet; the wiki says two, and two is what every fold uses.
  assert.equal(guideMaterialsFor(guides, kiola).length, 0, 'the guide list never stands in for one the wiki states')
  const materials = recipeMaterials(guides, kiola)
  assert.deepEqual(materials.map((m) => `${String(m.ingredient.qty)} ${m.ingredient.name}`), ['1 Bottle', '2 Packet of Kiola Sap', '1 Water Flask'])
  assert.ok(materials.every((m) => m.guide === undefined))
  const tree = planTree({ index, guides }, kiola)
  assert.equal(tree.from, 'wiki')
  assert.deepEqual(tree.materials.map((n) => `${String(n.qty)} ${n.name}`), ['1 Bottle', '2 Packet of Kiola Sap', '1 Water Flask'])
  const craft = indexCrafting(fixtureSnap({ bought: [bought('Bottle', 1, 1_000, 'Brewer'), bought('Packet of Kiola Sap', 1, 2_000, 'Brewer'), bought('Water Flask', 1, 500, 'Brewer')] }), index)
  // 1.00 pp + two packets at 2.00 pp + 0.50 pp.
  assert.equal(moneyBook(craft, index).of(kiola).perCombine, 5_500)
  const plan = expandMaterials({ index, craft, guides, have: () => 0 }, kiola, 10)
  assert.equal(plan.fromGuide, false)
  assert.equal(plan.lines.find((l) => l.name === 'Packet of Kiola Sap')?.need, 20)

  // Where the wiki lists none the guide's fill in, marked as the guide's.
  const only = byItem(index, 'Guide Only')
  assert.deepEqual(guideMaterialsFor(guides, only).map((l) => `${String(l.qty)} ${l.name}`), ['3 Malt'])
  assert.equal(planTree({ index, guides }, only).from, 'guide')
  assert.equal(expandMaterials({ index, craft, guides, have: () => 0 }, only, 1).fromGuide, true)
})

// ---- the committed data -----------------------------------------------------------------------

function committed(): { index: BookIndex; guides: GuideIndex } {
  const items = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const guides = guidePayload(guidesJson as unknown as TradeskillGuidesFile, wikiItemName(items))
  return { index: indexBook(buildTradeskillBook(items, new Map())), guides: indexGuides(guides) }
}

test('COMMITTED DATA: every recipe has a wiki page link, the gaps are counted per tradeskill, and the wiki list is the one used wherever a guide differs', (t) => {
  const { index, guides } = committed()
  const every = [...index.byId.values()]
  for (const made of every) {
    assert.match(recipeWikiUrl(made) ?? '', /^https:\/\/eqlwiki\.com\/\S+$/, made.id)
    // The page is kept only when it is not the item's name.
    assert.notEqual(made.page, made.item, made.id)
  }
  t.diagnostic(`recipes on a page whose title is not the item's name: ${String(every.filter((r) => r.page !== undefined).length)}`)

  for (const tradeskill of TRADESKILLS) {
    const recipes = skillRecipes(index, tradeskill)
    const gaps = recipes.filter((r) => wikiGap(r) !== null)
    assert.equal(wikiGapCount(recipes), gaps.length)
    const materials = gaps.filter((r) => r.ingredients.length === 0).length
    const trivial = gaps.filter((r) => r.trivial === undefined).length
    t.diagnostic(`${tradeskill}: ${String(gaps.length)} of ${String(recipes.length)} missing on the wiki (${String(materials)} no materials, ${String(trivial)} no trivial)`)
  }

  const differing = every.filter((r) => guideDifferences(guides, r).length > 0)
  for (const made of differing) {
    const differences = guideDifferences(guides, made)
    for (const difference of differences) {
      // A difference is only ever said of something the wiki itself states.
      if (difference.materials !== null) assert.ok(made.ingredients.length > 0, made.id)
      if (difference.trivial !== null) assert.ok(made.trivial !== undefined && difference.trivial !== made.trivial, made.id)
      assert.doesNotMatch(guideDifferenceText(difference), /https?:|www\.|docs\.google|[–—]/, made.id)
      t.diagnostic(`${made.tradeskill ?? ''} ${made.item}: ${guideDifferenceText(difference)}`)
    }
    // The wiki's own list is what the routes, the shopping list and the planner read.
    if (made.ingredients.length > 0) {
      assert.deepEqual(recipeMaterials(guides, made).map((m) => m.ingredient), made.ingredients, made.id)
      assert.equal(planTree({ index, guides }, made).from, 'wiki', made.id)
    }
  }
  t.diagnostic(`recipes a guide lists otherwise than the wiki: ${String(differing.length)}`)
})
