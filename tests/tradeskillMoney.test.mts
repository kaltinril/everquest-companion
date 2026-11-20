// What a recipe costs and brings back from the player's own log (src/shared/tradeskillMoney.ts).
// Every number is a price a merchant line stated; where the log has none, nothing is stated.
// The fixture has the owner's shapes: Ruby 131.25 pp from Jade, Gold Bar 10.50 pp from Amber, the
// Golden Ruby Ring sold for 141.75 pp to Amber, and an Enchanted Gold Bar that is never bought.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookIndex, type BookRecipe } from '../src/shared/tradeskillBook'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import {
  costCell,
  costPartsText,
  differenceText,
  lastPaid,
  moneyBook,
  noCostText,
  ppText,
  returnedOnSuccess,
  sellsCell,
  type RecipeMoney
} from '../src/shared/tradeskillMoney'
import { SEP_12, bought, fixtureIndex, fixtureSnap, ing, recipe, sold } from './tradeskillFixtures.mts'

const book = (recipes: BookRecipe[]): BookIndex => indexBook({ version: TRADESKILL_BOOK_VERSION, recipes, materials: {} })

const byId = (index: BookIndex, id: string): BookRecipe => {
  const found = index.byId.get(id)
  assert.ok(found, `${id} is in the fixture`)
  return found
}

test('copper reads as platinum, to the copper', () => {
  assert.equal(ppText(131_250), '131.25 pp')
  assert.equal(ppText(10_500), '10.50 pp')
  assert.equal(ppText(14_175), '14.175 pp')
  assert.equal(ppText(141_750), '141.75 pp')
  assert.equal(ppText(0), '0.00 pp')
  assert.equal(ppText(52), '0.052 pp')
})

test("a material's price is the newest purchase line's, per unit, with who sold it and where", () => {
  const index = fixtureIndex()
  const craft = indexCrafting(fixtureSnap(), index)
  assert.deepEqual(lastPaid(craft, 'ruby'), { unit: 131_250, merchant: 'Jade', zone: 'North Freeport', ts: SEP_12 })
  // 20 Gold Bars for 210 pp: 10.50 pp each.
  assert.equal(lastPaid(craft, 'gold bar')?.unit, 10_500)
  assert.equal(lastPaid(craft, 'gold bar')?.merchant, 'Amber')
  assert.equal(lastPaid(craft, 'enchanted gold bar'), null)
  assert.equal(lastPaid(indexCrafting(null, index), 'ruby'), null)
})

test('the Golden Ruby Ring has no cost: the Enchanted Gold Bar is never bought and has no recipe, and no rule is made up', () => {
  const index = fixtureIndex()
  const money = moneyBook(indexCrafting(fixtureSnap(), index), index).of(byId(index, 'golden ruby ring#0'))
  assert.equal(money.perCombine, null)
  assert.deepEqual(money.unpriced, ['Enchanted Gold Bar'])
  assert.deepEqual(money.parts, [])
  assert.equal(costCell(money), '')
  assert.equal(noCostText(money), 'No cost stated: your log shows no purchase of Enchanted Gold Bar.')
  // What a merchant paid for the ring is still a fact of the log.
  assert.equal(money.sale?.merchant, 'Amber')
  assert.equal(sellsCell(money), '141.75 pp')
  assert.equal(money.difference, null)
  assert.equal(differenceText(money), '')
})

test('a recipe whose every material was bought costs their sum at the newest prices, and the sale is set against it', () => {
  const index = book([recipe('Plain Ruby Band', { trivial: 100, ingredients: [ing('Gold Bar', 2), ing('Ruby')] })])
  const craft = indexCrafting(fixtureSnap({ sold: [sold('Plain Ruby Band', 150_000, 'Amber')] }), index)
  const money = moneyBook(craft, index).of(byId(index, 'plain ruby band#0'))
  assert.equal(money.perCombine, 152_250)
  assert.deepEqual(money.unpriced, [])
  assert.equal(costCell(money), '152.25 pp')
  assert.equal(costPartsText(money), 'Gold Bar 21.00 pp + Ruby 131.25 pp')
  assert.equal(noCostText(money), '')
  assert.equal(money.difference, -2_250)
  assert.equal(differenceText(money), '2.25 pp under the materials')
})

test('a made material is costed from its own recipe when every input has a price, per item yielded', () => {
  const index = book([
    recipe('Ruby Studded Band', { trivial: 120, ingredients: [ing('Gold Setting', 2), ing('Ruby')] }),
    // One combine of 1 Gold Bar yields 2 settings: 5.25 pp each.
    recipe('Gold Setting', { trivial: 40, yieldQty: 2, ingredients: [ing('Gold Bar')] })
  ])
  const craft = indexCrafting(fixtureSnap({ sold: [sold('Ruby Studded Band', 141_750, 'Amber')] }), index)
  const money = moneyBook(craft, index).of(byId(index, 'ruby studded band#0'))
  assert.equal(money.perCombine, 141_750)
  assert.deepEqual(money.parts, [
    { name: 'Gold Setting', copper: 10_500, crafted: true },
    { name: 'Ruby', copper: 131_250, crafted: false }
  ])
  assert.equal(costPartsText(money), 'Gold Setting 10.50 pp (from its own recipe) + Ruby 131.25 pp')
  assert.equal(money.difference, 0)
  assert.equal(differenceText(money), 'the same as the materials')
})

test('a bought price outranks the recipe, the cheapest costed recipe wins, and one unknown input leaves no cost', () => {
  const recipes = [
    recipe('Band', { trivial: 10, ingredients: [ing('Setting')] }),
    recipe('Setting', { id: 'setting#0', trivial: 5, ingredients: [ing('Ruby')] }),
    recipe('Setting', { id: 'setting#1', trivial: 6, ingredients: [ing('Gold Bar')] }),
    recipe('Setting', { id: 'setting#2', trivial: 7, ingredients: [ing('Unobtainium')] })
  ]
  const index = book(recipes)
  const band = byId(index, 'band#0')
  assert.equal(moneyBook(indexCrafting(fixtureSnap(), index), index).of(band).perCombine, 10_500)
  const paid = indexCrafting(fixtureSnap({ bought: [...fixtureSnap().bought, bought('Setting', 1, 99_000, 'Jade')] }), index)
  assert.equal(moneyBook(paid, index).of(band).perCombine, 99_000)
  const none = book([recipes[0], recipes[3]])
  const unknown = moneyBook(indexCrafting(fixtureSnap(), none), none).of(byId(none, 'band#0'))
  assert.equal(unknown.perCombine, null)
  assert.deepEqual(unknown.unpriced, ['Setting'])
})

test('two materials made from each other never cost each other', () => {
  const index = book([
    recipe('Loop A', { trivial: 10, ingredients: [ing('Loop B')] }),
    recipe('Loop B', { trivial: 12, ingredients: [ing('Loop A')] })
  ])
  const money = moneyBook(indexCrafting(fixtureSnap(), index), index).of(byId(index, 'loop a#0'))
  assert.equal(money.perCombine, null)
  assert.deepEqual(money.unpriced, ['Loop B'])
})

test('a material the wiki says the combine gives back costs a made combine nothing', () => {
  assert.equal(returnedOnSuccess(ing('File', 1, ['Crafted', 'Returned on Success'])), true)
  assert.equal(returnedOnSuccess(ing('Mold', 1, ['Returned on Failure or Success'])), true)
  assert.equal(returnedOnSuccess(ing('Ore', 1, ['Returned on Failure'])), false)
  assert.equal(returnedOnSuccess(ing('Ruby')), false)
  const index = book([recipe('Filed Band', { trivial: 10, ingredients: [ing('Gold Bar'), ing('File', 1, ['Returned on Success'])] })])
  const money = moneyBook(indexCrafting(fixtureSnap(), index), index).of(byId(index, 'filed band#0'))
  assert.equal(money.perCombine, 10_500)
  assert.deepEqual(money.returned, ['File'])
  assert.deepEqual(money.unpriced, [])
})

test('nothing is stated where the log states nothing: no materials, no purchase, no sale, an unserved module', () => {
  const index = fixtureIndex()
  const craft = indexCrafting(fixtureSnap(), index)
  const empty: RecipeMoney = moneyBook(craft, index).of(byId(index, 'platinum malachite ring#0'))
  assert.equal(empty.perCombine, null)
  assert.equal(empty.sale, null)
  assert.equal(costCell(empty), '')
  assert.equal(sellsCell(empty), '')
  // A recipe that lists no material has no reason to give either.
  assert.equal(noCostText(empty), '')
  const unserved = moneyBook(indexCrafting(null, index), index).of(byId(index, 'golden ruby ring#0'))
  assert.equal(unserved.perCombine, null)
  assert.equal(unserved.sale, null)
})

test('a sale line states no quantity, so a recipe that yields several states no difference', () => {
  const index = book([recipe('Class 1 Wood Point Arrow', { tradeskill: 'Fletching', trivial: 16, yieldItem: 'Arrow', yieldQty: 5, ingredients: [ing('Gold Bar')] })])
  const craft = indexCrafting(fixtureSnap({ sold: [sold('Arrow', 40_000, 'Amber')] }), index)
  const money = moneyBook(craft, index).of(byId(index, 'class 1 wood point arrow#0'))
  assert.equal(money.perCombine, 10_500)
  // The sale is found by what the combine yields.
  assert.equal(sellsCell(money), '40.00 pp')
  assert.equal(money.difference, null)
})

test('a recipe is costed once however often it is asked', () => {
  const index = fixtureIndex()
  const money = moneyBook(indexCrafting(fixtureSnap(), index), index)
  const ring = byId(index, 'golden ruby ring#0')
  assert.equal(money.of(ring), money.of(ring))
})
