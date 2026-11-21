// "Make an item" buys what can be bought (owner, 2026-11-20: "there is a recceipve and that's fine,
// but if you can buy it why make it?"), on the committed data, and remembers what the reader
// chose to make and which made materials are unfolded.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook, wikiItemName } from '../src/main/tradeskillBook'
import type { TradeskillGuidesFile } from '../src/shared/guideData'
import { indexBook, type BookRecipe } from '../src/shared/tradeskillBook'
import { guidePayload, indexGuides } from '../src/shared/tradeskillGuide'
import { closedText, itemRecipes, pickRecipe, planTree, type PlanDeps, type PlanNode } from '../src/shared/tradeskillPlan'
import { NO_PLAN, parsePlanMemory, withClosed, withExpanded, withItem } from '../src/shared/tradeskillPlanMemory'

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

test('the wiki says Water Flask is bought: the plan buys it, and its recipe is one choice away', () => {
  const { deps, quiver } = committed()
  const oil = node(planTree(deps, quiver).materials, 'Aviak Egg Oil')
  const flask = node(oil.made?.materials ?? [], 'Water Flask')
  assert.deepEqual([flask.made, flask.closed, flask.makeable?.tradeskill], [null, 'bought', 'Brewing'])
  assert.equal(closedText(flask), 'Can be bought, so the plan does not make it.')

  const chosen = planTree(deps, quiver, { opened: new Set(['water flask']) })
  const made = node(node(chosen.materials, 'Aviak Egg Oil').made?.materials ?? [], 'Water Flask').made
  assert.deepEqual(made?.materials.map((n) => n.name), ['Pod of Water', 'Bottle'])
})

test('a purchase in the log counts as bought, for a material the wiki calls crafted only', () => {
  const { deps, quiver } = committed()
  assert.notEqual(node(planTree(deps, quiver).materials, 'Aviak Egg Oil').made, null)
  const paid = planTree(deps, quiver, { paid: (key) => key === 'aviak egg oil' })
  assert.equal(node(paid.materials, 'Aviak Egg Oil').closed, 'bought')
})

test('the plan remembers what the reader chose to make and what is unfolded; another item starts clean', () => {
  let plan = withItem(NO_PLAN, 'fleeting quiver')
  plan = withClosed(plan, 'water flask', false)
  assert.deepEqual(plan.opened, ['water flask'])
  plan = withExpanded(plan, 'aviak egg oil', true)
  assert.deepEqual(parsePlanMemory(JSON.stringify(plan)), plan)
  assert.equal(withExpanded(plan, 'aviak egg oil', false).expanded, undefined)
  // Getting it again takes the choice back.
  assert.equal(withClosed(plan, 'water flask', true).opened, undefined)
  assert.deepEqual(withItem(plan, 'pie'), { item: 'pie', recipe: null, count: 1, closed: [] })
})
