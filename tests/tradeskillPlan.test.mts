// "Make an item" (src/shared/tradeskillPlan.ts, tradeskillPlanLevels.ts, tradeskillPlanGather.ts):
// which recipe a search picks, the recipe as a tree opened to its leaves, the skills the tree
// needs against the player's levels, the way to each, what to gather for N, and what the planner
// remembers (tradeskillPlanMemory.ts). Fixtures first, then Fleeting Quiver built from the
// committed item database and guide file.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook, wikiItemName } from '../src/main/tradeskillBook'
import { GUIDE_CREDITS, guideCreditLine } from '../src/shared/guideCredits'
import type { TradeskillGuidesFile } from '../src/shared/guideData'
import type { SkillRow } from '../src/shared/skills'
import { MAX_RECIPE_DEPTH, TRADESKILL_BOOK_VERSION, indexBook, type BookRecipe } from '../src/shared/tradeskillBook'
import { guidePayload, indexGuides, locatedSource, type GuidePayload } from '../src/shared/tradeskillGuide'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import {
  PLAN_SEARCH_CAP,
  choiceFacts,
  closedText,
  itemRecipes,
  madeWithText,
  pickRecipe,
  planChoices,
  planTree,
  recipeCountText,
  recipeOptionText,
  searchChoices,
  treeDrawsGuide,
  treeRecipes,
  type PlanDeps,
  type PlanNode
} from '../src/shared/tradeskillPlan'
import {
  clampCount,
  gatherFor,
  gatherTotalText,
  lineCostText,
  makeText,
  planHave,
  planPrice,
  type PlanHave
} from '../src/shared/tradeskillPlanGather'
import {
  WIKI_RUNG_CAP,
  alsoText,
  guideEndsText,
  levelText,
  routeHeading,
  routeMoreText,
  routeSourceText,
  skillMetText,
  skillNeedText,
  skillsAllMet,
  skillNeeds,
  skillRoutes
} from '../src/shared/tradeskillPlanLevels'
import { NO_PLAN, parsePlanMemory, withClosed, withCount, withItem, withRecipe } from '../src/shared/tradeskillPlanMemory'
import { bought, depot, fixtureSnap, ing, recipe, SEP_12 } from './tradeskillFixtures.mts'

// ---- the fixture -------------------------------------------------------------------------------

const GUIDES: GuidePayload = {
  leveling: {
    Tailoring: {
      notes: [],
      alternates: [],
      steps: [
        { from: 1, to: 66, item: 'Woven mandrake', materials: [{ name: 'Mandrake Root', qty: 2 }] },
        { from: 67, to: 150, item: 'Picnic basket', materials: [], note: 'sells back well' },
        { from: 151, to: 200, item: 'Quiver', materials: [] }
      ]
    }
  },
  recipes: {
    Tailoring: {
      recipes: [
        {
          trivial: 222,
          item: 'Quiver',
          notes: [],
          materials: [
            { name: 'Lion skin', zone: 'North Karana', sourceText: 'Highland Lions' },
            { name: 'Quiver Pattern', merchant: 'Klok Walrot', zone: 'New Sebi', loc: '286, -54' },
            { name: 'Egg Oil', sourceText: 'Crafted (See Brewing)' },
            { name: 'Sewing Needle', returned: true, sourceText: 'Any merchant' }
          ]
        }
      ]
    }
  },
  names: { 'quiver pattern': 'Quiver Pattern', 'egg oil': 'Egg Oil', 'sewing needle': 'Sewing Needle', quiver: 'Quiver' }
}

function fixtureDeps(): PlanDeps {
  const index = indexBook({
    version: TRADESKILL_BOOK_VERSION,
    recipes: [
      // The wiki states the trivial and no material: the guide's four stand in.
      recipe('Quiver', { tradeskill: 'Tailoring', trivial: 222 }),
      recipe('Egg Oil', { tradeskill: 'Brewing', trivial: 102, ingredients: [ing('Eggs'), ing('Water Flask')] }),
      // Made from itself: the loop guard stops it.
      recipe('Water Flask', { tradeskill: 'Brewing', trivial: 21, ingredients: [ing('Water Flask'), ing('Cork')] }),
      // Two tradeskills make it; a third recipe lists nothing.
      recipe('Pie Tin', { id: 'pie tin#0', tradeskill: 'Pottery', trivial: 60, ingredients: [ing('Clay', 2)] }),
      recipe('Pie Tin', { id: 'pie tin#1', tradeskill: 'Blacksmithing', trivial: 30, ingredients: [ing('Metal Bits', 2), ing('Smithy Hammer', 1, ['Returned on Success'])] }),
      recipe('Pie Tin', { id: 'pie tin#2', tradeskill: 'Blacksmithing', trivial: 10 }),
      // One combine makes five.
      recipe('Metal Bits', { tradeskill: 'Blacksmithing', trivial: 18, yieldQty: 5, ingredients: [ing('Small Piece of Ore', 2), ing('Water Flask')] }),
      recipe('Pie', { tradeskill: 'Baking', trivial: 40, ingredients: [ing('Pie Tin'), ing('Metal Bits'), ing('Fruit', 3)] }),
      // A chain one deeper than a material opens.
      recipe('A', { tradeskill: 'Baking', trivial: 5, ingredients: [ing('B')] }),
      recipe('B', { tradeskill: 'Baking', trivial: 4, ingredients: [ing('C')] }),
      recipe('C', { tradeskill: 'Baking', trivial: 3, ingredients: [ing('D')] }),
      recipe('D', { tradeskill: 'Baking', trivial: 2, ingredients: [ing('E')] }),
      recipe('E', { tradeskill: 'Baking', trivial: 1, ingredients: [ing('F')] }),
      // No tradeskill, and nothing listed.
      recipe('Quest Token', { tradeskill: undefined, skillWord: 'Non-Tradeskill' }),
      recipe('Unlisted Part', { tradeskill: 'Tinkering' }),
      recipe('Gadget', { tradeskill: 'Tinkering', ingredients: [ing('Unlisted Part'), ing('Quest Token')] })
    ],
    materials: {}
  })
  return { index, guides: indexGuides(GUIDES) }
}

const root = (deps: PlanDeps, key: string, id: string | null = null): BookRecipe => {
  const found = pickRecipe(itemRecipes(deps, key), id)
  assert.ok(found, `the fixture has a recipe for ${key}`)
  return found
}

const names = (nodes: readonly PlanNode[]): string[] => nodes.map((n) => n.name)

const node = (nodes: readonly PlanNode[], name: string): PlanNode => {
  const found = nodes.find((n) => n.name === name)
  assert.ok(found, `the tree lists ${name}`)
  return found
}

const skill = (name: string, value: number): SkillRow => ({ skill: name, value, lastTs: SEP_12, sessionUps: 0 })

const holds = (counts: Record<string, number>): PlanHave => (n) => (n.linked ? (counts[n.key] ?? 0) : null)

const noPrice = (): null => null

// ---- which recipe ------------------------------------------------------------------------------

test('an item several recipes make offers the one that lists materials first, lowest trivial first', () => {
  const deps = fixtureDeps()
  const recipes = itemRecipes(deps, 'pie tin')
  assert.deepEqual(recipes.map((r) => r.id), ['pie tin#1', 'pie tin#0', 'pie tin#2'])
  assert.equal(pickRecipe(recipes, null)?.id, 'pie tin#1')
  assert.equal(pickRecipe(recipes, 'pie tin#0')?.id, 'pie tin#0')
  // A pick that is not one of the item's recipes falls back to the first.
  assert.equal(pickRecipe(recipes, 'pie#0')?.id, 'pie tin#1')
  assert.equal(pickRecipe(itemRecipes(deps, 'no such item'), null), null)
  assert.equal(recipeCountText(recipes.length), '3 recipes make this item. Shown:')
  assert.equal(recipeCountText(1), '')
  assert.equal(recipeOptionText(deps, recipes[0]), 'Blacksmithing · trivial 30: Metal Bits, Smithy Hammer')
  assert.equal(recipeOptionText(deps, recipes[2]), 'Blacksmithing · trivial 10: no materials listed')
})

test('a recipe the guide has materials for counts as listing them', () => {
  const deps = fixtureDeps()
  assert.equal(recipeOptionText(deps, root(deps, 'quiver')), 'Tailoring · trivial 222: Lion skin, Quiver Pattern, Egg Oil +1 more')
})

test('the search covers every made item, best match first, and lists nothing until something is typed', () => {
  const deps = fixtureDeps()
  const { list, eraHidden } = planChoices(deps)
  assert.equal(eraHidden, 0)
  // One choice per item, however many recipes make it.
  assert.equal(list.filter((c) => c.key === 'pie tin').length, 1)
  assert.equal(list.find((c) => c.key === 'pie tin')?.recipes.length, 3)
  assert.deepEqual(searchChoices(list, '  '), { shown: [], more: 0 })
  // The whole name, then a name that starts with it, then a word that does.
  assert.deepEqual(searchChoices(list, 'PIE').shown.map((c) => c.item), ['Pie', 'Pie Tin'])
  assert.deepEqual(searchChoices(list, 'tin').shown.map((c) => c.item), ['Pie Tin'])
  assert.deepEqual(searchChoices(list, 'i', 2), { shown: searchChoices(list, 'i').shown.slice(0, 2), more: searchChoices(list, 'i').shown.length - 2 })
  const facts = (key: string): string => choiceFacts(list.find((c) => c.key === key) ?? { key, item: key, recipes: [] })
  assert.equal(facts('pie tin'), 'Blacksmithing 30, Pottery 60, Blacksmithing 10')
  assert.equal(facts('quest token'), 'Non-Tradeskill')
  assert.ok(PLAN_SEARCH_CAP > 0)
})

test('the era setting leaves out an item only when it hides every recipe that makes it', () => {
  const deps = fixtureDeps()
  const hidden = planChoices(deps, (r) => r.id === 'pie tin#1' || r.key === 'pie')
  assert.equal(hidden.eraHidden, 1)
  assert.equal(hidden.list.some((c) => c.key === 'pie'), false)
  assert.deepEqual(hidden.list.find((c) => c.key === 'pie tin')?.recipes.map((r) => r.id), ['pie tin#0', 'pie tin#2'])
})

// ---- the tree ----------------------------------------------------------------------------------

test('a recipe the wiki lists no materials for takes the guide\'s, and a made one opens to its own recipe', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'quiver'))
  assert.equal(tree.from, 'guide')
  assert.deepEqual(names(tree.materials), ['Lion skin', 'Quiver Pattern', 'Egg Oil', 'Sewing Needle'])
  // A guide's spelling that names no wiki item stays text: no link, never opened.
  const skin = node(tree.materials, 'Lion skin')
  assert.deepEqual([skin.linked, skin.made, skin.closed, skin.recipes], [false, null, null, 0])
  assert.equal(skin.guide?.source.sourceText, 'Highland Lions')
  assert.equal(node(tree.materials, 'Sewing Needle').returned, true)
  const oil = node(tree.materials, 'Egg Oil')
  assert.equal(oil.made?.recipe.tradeskill, 'Brewing')
  assert.equal(oil.made?.from, 'wiki')
  assert.deepEqual(names(oil.made?.materials ?? []), ['Eggs', 'Water Flask'])
  assert.equal(madeWithText(oil), 'Made with: Brewing · trivial 102')
  assert.deepEqual(treeRecipes(tree).map((r) => r.item), ['Quiver', 'Egg Oil', 'Water Flask'])
  assert.equal(treeDrawsGuide(deps, tree), true)
})

test('a material made from itself is opened once and then left a leaf', () => {
  const deps = fixtureDeps()
  const oil = node(planTree(deps, root(deps, 'quiver')).materials, 'Egg Oil')
  const flask = node(oil.made?.materials ?? [], 'Water Flask')
  assert.ok(flask.made, 'Water Flask opens to its recipe')
  const inner = node(flask.made.materials, 'Water Flask')
  assert.deepEqual([inner.made, inner.closed], [null, 'loop'])
  assert.equal(closedText(inner), 'Also made by a recipe, which is already open above.')
  // The root itself as its own material is the same case.
  const self = node(planTree(deps, root(deps, 'water flask')).materials, 'Water Flask')
  assert.equal(self.closed, 'loop')
})

test('the tree stops at the depth limit and says the material is made', () => {
  const deps = fixtureDeps()
  let at = planTree(deps, root(deps, 'a'))
  const opened: string[] = []
  for (;;) {
    const next = at.materials[0]
    if (next.made === null) {
      assert.equal(next.closed, 'depth')
      assert.match(closedText(next), /not opened this deep/)
      break
    }
    opened.push(next.name)
    at = next.made
  }
  // The root and the materials opened under it are `MAX_RECIPE_DEPTH` recipes in all.
  assert.equal(opened.length, MAX_RECIPE_DEPTH - 1)
})

test('a material whose recipes list nothing is a leaf, and the reader can close one that would open', () => {
  const deps = fixtureDeps()
  const gadget = planTree(deps, root(deps, 'gadget'))
  assert.deepEqual(gadget.materials.map((n) => n.closed), ['unlisted', 'unlisted'])
  const pie = planTree(deps, root(deps, 'pie'), { closed: new Set(['pie tin']) })
  const tin = node(pie.materials, 'Pie Tin')
  assert.deepEqual([tin.made, tin.closed, tin.makeable?.id, tin.recipes], [null, 'reader', 'pie tin#1', 3])
  assert.ok(node(pie.materials, 'Metal Bits').made, 'the other made material still opens')
  const open = node(planTree(deps, root(deps, 'pie')).materials, 'Pie Tin')
  assert.equal(madeWithText(open), 'Made with (the first of 3 recipes): Blacksmithing · trivial 30')
  assert.equal(treeDrawsGuide(deps, pie), false)
})

// ---- where you stand ---------------------------------------------------------------------------

test('each tradeskill is needed at the highest trivial of its recipes in the tree, against the log\'s level', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'quiver'))
  const { needs, other } = skillNeeds(tree, [skill('Brewing', 30), skill('Baking', 200)])
  assert.deepEqual(other, [])
  assert.deepEqual(
    needs.map((n) => [n.tradeskill, n.trivial, n.item, n.level, n.stand]),
    [
      ['Tailoring', 222, 'Quiver', null, 'unseen'],
      ['Brewing', 102, 'Egg Oil', 30, 'short']
    ]
  )
  assert.equal(levelText(needs[0]), 'not in your log')
  assert.equal(skillNeedText(needs[0]), 'Quiver is trivial at 222. Your log has not shown this skill go up.')
  assert.equal(skillNeedText(needs[1]), 'Egg Oil is trivial at 102. 72 to go.')
  assert.equal(alsoText(needs[1]), 'Also in this plan: Water Flask (trivial 21)')
  const met = skillNeeds(tree, [skill('Tailoring', 222), skill('Brewing', 250)]).needs
  assert.deepEqual(met.map((n) => n.stand), ['met', 'met'])
  assert.equal(skillNeedText(met[0]), 'Quiver is trivial at 222. You are past it.')
  // Every skill met: the plan says so on one line in its head, and only then.
  assert.equal(skillsAllMet({ needs: met, other: [] }), true)
  assert.equal(skillsAllMet({ needs, other: [] }), false)
  assert.equal(skillsAllMet({ needs: [], other: [] }), false)
  assert.equal(skillMetText(met[0]), 'past the 222 this plan needs')
})

test('a combine that names no tradeskill, or states no trivial, is said and never counted as a level', () => {
  const deps = fixtureDeps()
  const token = planTree(deps, root(deps, 'quest token'))
  assert.deepEqual(skillNeeds(token, []), { needs: [], other: [{ item: 'Quest Token', word: 'Non-Tradeskill' }] })
  const gadget = skillNeeds(planTree(deps, root(deps, 'gadget')), [skill('Tinkering', 50)]).needs
  assert.deepEqual(gadget.map((n) => [n.trivial, n.stand]), [[null, 'unrated']])
  assert.equal(skillNeedText(gadget[0]), 'Needed for Gadget. The wiki gives no trivial for it.')
  assert.deepEqual(skillRoutes(deps, gadget), [])
})

// ---- the way there -----------------------------------------------------------------------------

test('a short tradeskill gets the guide\'s steps from the level to the trivial, credited', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'quiver'))
  const [tailoring] = skillRoutes(deps, skillNeeds(tree, [skill('Tailoring', 100)]).needs)
  assert.deepEqual([tailoring.source, tailoring.from, tailoring.to, tailoring.placed], ['guide', 100, 222, true])
  // The step already finished (1 to 66) is left out; the one the level sits in is kept.
  assert.deepEqual(tailoring.lines.map((l) => [l.range, l.item, l.wikiName, l.detail]), [
    ['67 - 150', 'Picnic basket', null, 'sells back well'],
    ['151 - 200', 'Quiver', 'Quiver', '']
  ])
  assert.equal(tailoring.guideEnds, 200)
  assert.equal(guideEndsText(tailoring), "The guide's route stops at 200.")
  assert.equal(routeHeading(tailoring), 'Tailoring, 100 to 222')
  const credit = GUIDE_CREDITS.find((c) => c.id === 'eql-tradeskill-guide')
  assert.ok(credit)
  assert.equal(routeSourceText(tailoring), `Route steps from ${guideCreditLine(credit)}.`)
  // A skill the log never showed starts at 0 and takes every step up to the trivial.
  const [unseen] = skillRoutes(deps, skillNeeds(tree, []).needs)
  assert.deepEqual([unseen.from, unseen.placed, unseen.lines.length], [0, false, 3])
  assert.equal(unseen.lines[0].detail, '2 x Mandrake Root')
})

test('with no guide step for the stretch, the wiki ladder\'s recipes between the two levels are listed and capped', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'quiver'))
  const routes = skillRoutes(deps, skillNeeds(tree, [skill('Tailoring', 222), skill('Brewing', 30)]).needs)
  // Tailoring is met and gets no route; Brewing has no guide route.
  assert.deepEqual(routes.map((r) => [r.tradeskill, r.source]), [['Brewing', 'wiki']])
  // Water Flask (trivial 21) is under the level; Egg Oil (102) is the stretch's top.
  assert.deepEqual(routes[0].lines.map((l) => [l.range, l.item]), [['trivial 102', 'Egg Oil']])
  assert.match(routeSourceText(routes[0]), /no step for this stretch/)
  assert.equal(routeMoreText(routes[0]), '')

  const many = Array.from({ length: WIKI_RUNG_CAP + 3 }, (_, i) => recipe(`Rung ${String(i).padStart(2, '0')}`, { tradeskill: 'Pottery', trivial: 10 + i }))
  const top = recipe('Top', { tradeskill: 'Pottery', trivial: 90 })
  const ladder: PlanDeps = { index: indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: [...many, top], materials: {} }), guides: indexGuides({ leveling: {}, recipes: {}, names: {} }) }
  const [pottery] = skillRoutes(ladder, skillNeeds(planTree(ladder, top), [skill('Pottery', 10)]).needs)
  // Trivial 10 is not above the level; 11 and up are, lowest first.
  assert.equal(pottery.lines.length, WIKI_RUNG_CAP)
  assert.equal(pottery.lines[0].range, 'trivial 11')
  assert.equal(pottery.more, 3)
  assert.equal(routeMoreText(pottery), 'and 3 more on the Pottery workbench')
})

// ---- what to gather ----------------------------------------------------------------------------

test('leaf materials roll up through the tree, times N, a returned tool once', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'pie'))
  const gather = gatherFor(tree, { count: 3, have: holds({}), price: noPrice })
  // Pie x3: 3 Pie Tin (Blacksmithing: 2 Metal Bits and a hammer each), 3 Metal Bits, 9 Fruit.
  // Metal Bits: 6 for the tins and 3 for the pies. A combine makes 5, so the tins' 6 take 2
  // combines (10 made, 4 spare) and the pies' 3 come out of the spare: 6 to make, not 9.
  assert.deepEqual(
    gather.made.map((m) => [m.node.name, m.need, m.toMake]),
    [
      ['Pie Tin', 3, 3],
      ['Metal Bits', 9, 6],
      ['Water Flask', 2, 2]
    ]
  )
  const need = Object.fromEntries(gather.leaves.map((l) => [l.node.name, l.need]))
  // 2 combines of bits: 4 ore and 2 flasks, each flask from a flask and a cork. One hammer, given back.
  assert.deepEqual(need, { 'Small Piece of Ore': 4, 'Water Flask': 2, Cork: 2, 'Smithy Hammer': 1, Fruit: 9 })
  assert.equal(gather.count, 3)
  assert.equal(makeText(gather.made[0]), '3 to make')
})

test('a made material already held is used before any is made, so its own materials are not gathered', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'pie'))
  const gather = gatherFor(tree, { count: 1, have: holds({ 'pie tin': 1, 'metal bits': 1, fruit: 2 }), price: noPrice })
  assert.deepEqual(
    gather.made.map((m) => [m.node.name, m.need, m.have, m.toMake]),
    [
      ['Pie Tin', 1, 1, 0],
      ['Metal Bits', 1, 1, 0]
    ]
  )
  assert.deepEqual(gather.leaves.map((l) => [l.node.name, l.need, l.have, l.toGet]), [['Fruit', 3, 2, 1]])
  assert.equal(makeText(gather.made[0]), 'you hold 1: none to make')
})

test('the total is stated only when every line still to get has a price from the log', () => {
  const deps = fixtureDeps()
  const tree = planTree(deps, root(deps, 'egg oil'))
  const craft = indexCrafting(fixtureSnap({ bought: [bought('Eggs', 2, 3_000, 'Jade'), bought('Cork', 1, 500, 'Jade')], depot: [depot('Eggs', 1, SEP_12)] }), deps.index)
  const have = planHave({ index: null, dumpedAt: null }, craft)
  // No dump: the log's depot line is the count; a material nothing has counted is unknown.
  assert.equal(have({ key: 'eggs', name: 'Eggs', linked: true }), 1)
  assert.equal(have({ key: 'cork', name: 'Cork', linked: true }), null)
  assert.equal(have({ key: 'eggs', name: 'Eggs', linked: false }), null)
  const gather = gatherFor(tree, { count: 2, have, price: planPrice(craft) })
  assert.deepEqual(
    gather.leaves.map((l) => [l.node.name, l.need, l.have, l.toGet, l.unit, l.copper]),
    [
      ['Eggs', 2, 1, 1, 1_500, 1_500],
      // The inner Water Flask of the flask's own recipe is a leaf: 2 flasks take 2 of them.
      ['Water Flask', 2, null, 2, null, null],
      ['Cork', 2, null, 2, 500, 1_000]
    ]
  )
  assert.equal(gather.total, null)
  assert.deepEqual(gather.unpriced, ['Water Flask'])
  assert.equal(gatherTotalText(gather), 'No total: your log shows no purchase of Water Flask.')
  assert.equal(lineCostText(gather.leaves[0]), '1.50 pp')
  assert.equal(lineCostText(gather.leaves[1]), '')

  // Closing the flask (the reader buys it) and holding one: every line left has a price.
  const closed = planTree(deps, root(deps, 'egg oil'), { closed: new Set(['water flask']) })
  const priced = gatherFor(closed, { count: 2, have: holds({ 'water flask': 2 }), price: planPrice(craft) })
  assert.deepEqual(priced.leaves.map((l) => [l.node.name, l.toGet]), [['Eggs', 2], ['Water Flask', 0]])
  assert.equal(priced.total, 3_000)
  assert.equal(gatherTotalText(priced), 'Total for what is still to get: 3.00 pp, at the price your log shows you last paid for each.')
  const all = gatherFor(closed, { count: 1, have: holds({ 'water flask': 1, eggs: 5 }), price: noPrice })
  assert.equal(gatherTotalText(all), 'You hold everything on this list.')
})

test('the count is a whole number from 1 to 999', () => {
  assert.deepEqual([clampCount(0), clampCount(2.9), clampCount('12'), clampCount('x'), clampCount(5000), clampCount(undefined)], [1, 2, 12, 1, 999, 1])
})

// ---- what the planner remembers ----------------------------------------------------------------

test('a stored plan is read back, and anything unreadable is no plan', () => {
  assert.equal(parsePlanMemory(null), NO_PLAN)
  assert.equal(parsePlanMemory('not json'), NO_PLAN)
  assert.equal(parsePlanMemory('[1]').item, null)
  assert.deepEqual(parsePlanMemory(JSON.stringify({ item: 'fleeting quiver', recipe: 'fleeting quiver#0', count: 3, closed: ['aviak egg oil', 7, 'aviak egg oil', ''] })), {
    item: 'fleeting quiver',
    recipe: 'fleeting quiver#0',
    count: 3,
    closed: ['aviak egg oil']
  })
  // No item: nothing else is kept but the count, which is the reader's own.
  assert.deepEqual(parsePlanMemory(JSON.stringify({ item: 5, recipe: 'x', count: 12, closed: ['a'] })), { ...NO_PLAN, count: 12 })
  assert.equal(parsePlanMemory(JSON.stringify({ item: 'a', count: -4 })).count, 1)
})

test('choosing another item keeps the count and drops the rest; the same item keeps its choices', () => {
  const plan = withClosed(withCount(withRecipe(withItem(NO_PLAN, 'pie'), 'pie#1'), '4'), 'pie tin', true)
  assert.deepEqual(plan, { item: 'pie', recipe: 'pie#1', count: 4, closed: ['pie tin'] })
  assert.equal(withItem(plan, 'pie'), plan)
  assert.deepEqual(withItem(plan, 'pie', 'pie#0'), { ...plan, recipe: 'pie#0' })
  assert.deepEqual(withItem(plan, 'quiver'), { item: 'quiver', recipe: null, count: 4, closed: [] })
  assert.deepEqual(withClosed(plan, 'pie tin', false).closed, [])
  // Closing twice lists the key once.
  assert.deepEqual(withClosed(plan, 'pie tin', true).closed, ['pie tin'])
})

// ---- the committed data: Fleeting Quiver -------------------------------------------------------

function committedDeps(): PlanDeps {
  const items = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const book = buildTradeskillBook(items, new Map())
  const guides = guidePayload(guidesJson as unknown as TradeskillGuidesFile, wikiItemName(items))
  return { index: indexBook(book), guides: indexGuides(guides) }
}

test("COMMITTED DATA: Fleeting Quiver takes the wiki's five materials, and Aviak Egg Oil opens to its Brewing recipe", () => {
  const deps = committedDeps()
  const choice = searchChoices(planChoices(deps).list, 'fleeting quiver').shown[0]
  assert.equal(choice.item, 'Fleeting Quiver')
  const recipe = pickRecipe(itemRecipes(deps, choice.key), null)
  assert.ok(recipe)
  // The wiki page lists them (its rows lead with `**:`, which the parser read as nothing until 2026-11-20).
  assert.deepEqual([recipe.tradeskill, recipe.trivial, recipe.ingredients.length], ['Tailoring', 222, 5])

  const tree = planTree(deps, recipe)
  // Wiki first: its list is the one shown, and it asks one material the guide's list does not.
  assert.equal(tree.from, 'wiki')
  assert.deepEqual(names(tree.materials), ['Aviak Egg Oil', 'Fleeting Quiver Pattern', 'Griffon Feathers', 'High Quality Lion Skin', 'Vial of Distilled Mana'])
  assert.ok(tree.materials.every((n) => n.linked), 'all five are wiki items: each is the standard item link')
  // The guide still says where the pattern is sold: its merchant is the item's located source.
  assert.equal(locatedSource(deps.guides, 'fleeting quiver pattern')?.merchant, 'Klok Walrot')
  const oil = node(tree.materials, 'Aviak Egg Oil')
  assert.deepEqual([oil.made?.recipe.tradeskill, oil.made?.recipe.trivial, oil.made?.from], ['Brewing', 102, 'wiki'])
  assert.deepEqual(names(oil.made?.materials ?? []), ['Aviak Eggs', 'Water Flask'])
  // The other four are leaves.
  assert.deepEqual(tree.materials.filter((n) => n.made !== null).map((n) => n.name), ['Aviak Egg Oil'])
  assert.equal(treeDrawsGuide(deps, tree), true)

  // Where you stand: Tailoring at 222 and Brewing at 102, neither in an empty log.
  const { needs, other } = skillNeeds(tree, [])
  assert.deepEqual(other, [])
  assert.deepEqual(
    needs.map((n) => [n.tradeskill, n.trivial, n.item, n.stand]),
    [
      ['Tailoring', 222, 'Fleeting Quiver', 'unseen'],
      ['Brewing', 102, 'Aviak Egg Oil', 'unseen']
    ]
  )

  // The way there: the leveling guide has a route for both, ending on the quiver itself.
  const routes = skillRoutes(deps, needs)
  assert.deepEqual(routes.map((r) => [r.tradeskill, r.source, r.from, r.to]), [
    ['Tailoring', 'guide', 0, 222],
    ['Brewing', 'guide', 0, 102]
  ])
  assert.ok(routes[0].lines.length >= 2, 'several Tailoring steps cover 0 to 222')
  assert.ok(routes.every((r) => r.lines.every((l) => l.range !== '' && l.item !== '')))

  // What to gather for two: every leaf doubled, the oil's materials through its recipe (and its Water Flask's through its own).
  const gather = gatherFor(tree, { count: 2, have: () => null, price: () => null })
  assert.deepEqual(gather.made.map((m) => [m.node.name, m.need, m.toMake]).filter((m) => m[0] === 'Aviak Egg Oil'), [['Aviak Egg Oil', 2, 2]])
  const need = Object.fromEntries(gather.leaves.map((l) => [l.node.name, l.toGet]))
  assert.equal(need['High Quality Lion Skin'], 2)
  assert.equal(need['Fleeting Quiver Pattern'], 2)
  assert.equal(need['Griffon Feathers'], 2)
  assert.equal(need['Aviak Eggs'], 2)
  assert.equal(need['Vial of Distilled Mana'], 2)
  assert.equal(need['Water Flask'], 2)
  assert.equal(gather.total, null, 'no price is known, so no total is stated')
})
