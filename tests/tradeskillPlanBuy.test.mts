// "Make an item" shows every recipe and buys what can be bought (owner, 2026-11-20: "there is a
// recceipve and that's fine, but if you can buy it why make it?"; 2026-11-21: "always show how to
// make something"), on the committed data, and remembers which made materials are unfolded.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook, wikiItemName } from '../src/main/tradeskillBook'
import type { TradeskillGuidesFile } from '../src/shared/guideData'
import { indexBook, type BookRecipe } from '../src/shared/tradeskillBook'
import { guidePayload, indexGuides } from '../src/shared/tradeskillGuide'
import { itemRecipes, pickRecipe, planTree, treeRecipes, type PlanDeps, type PlanNode } from '../src/shared/tradeskillPlan'
import { gatherFor } from '../src/shared/tradeskillPlanGather'
import { NO_PLAN, parsePlanMemory, withExpanded, withItem } from '../src/shared/tradeskillPlanMemory'

function committed(): { deps: PlanDeps; quiver: BookRecipe } {
  const items = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const guides = guidePayload(guidesJson as unknown as TradeskillGuidesFile, wikiItemName(items))
  const deps: PlanDeps = { index: indexBook(buildTradeskillBook(items, new Map())), guides: indexGuides(guides) }
  const quiver = pickRecipe(itemRecipes(deps, 'fleeting quiver'), null)
  assert.ok(quiver)
  return { deps, quiver }
}

const node = (nodes: readonly PlanNode[], name: string): PlanNode => {
  const found = nodes.find((n) => n.name === name)
  assert.ok(found, name)
  return found
}

test('the wiki says Water Flask is bought: its recipe is shown, and the plan still buys it', () => {
  const { deps, quiver } = committed()
  const tree = planTree(deps, quiver)
  const oil = node(tree.materials, 'Aviak Egg Oil')
  const flask = node(oil.made?.materials ?? [], 'Water Flask')
  assert.deepEqual([flask.bought, flask.closed, flask.made?.recipe.tradeskill], [true, null, 'Brewing'])
  assert.deepEqual(flask.made?.materials.map((n) => n.name), ['Pod of Water', 'Bottle'])
  // The flask is a thing to get on the gather list, and its combine is no skill the plan asks for.
  const gather = gatherFor(tree, { count: 1, have: () => 0, price: () => null })
  assert.ok(gather.leaves.some((l) => l.node.name === 'Water Flask'))
  assert.equal(gather.made.some((m) => m.node.name === 'Water Flask'), false)
  assert.equal(treeRecipes(tree).some((r) => r.key === 'water flask'), false)
})

test('a purchase in the log counts as bought, for a material the wiki calls crafted only', () => {
  const { deps, quiver } = committed()
  assert.equal(node(planTree(deps, quiver).materials, 'Aviak Egg Oil').bought, false)
  const paid = planTree(deps, quiver, { paid: (key) => key === 'aviak egg oil' })
  const oil = node(paid.materials, 'Aviak Egg Oil')
  assert.equal(oil.bought, true)
  assert.notEqual(oil.made, null)
})

test('the plan remembers what is unfolded; another item starts clean, and old choices are dropped', () => {
  const plan = withExpanded(withItem(NO_PLAN, 'fleeting quiver'), 'aviak egg oil', true)
  assert.deepEqual(parsePlanMemory(JSON.stringify(plan)), plan)
  assert.equal(withExpanded(plan, 'aviak egg oil', false).expanded, undefined)
  assert.deepEqual(withItem(plan, 'pie'), { item: 'pie', recipe: null, count: 1 })
  // A plan saved by a build that had the make-or-get switch.
  assert.deepEqual(parsePlanMemory(JSON.stringify({ ...plan, closed: ['water flask'], opened: ['cork'] })), plan)
})
