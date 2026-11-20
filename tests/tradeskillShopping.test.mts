// The shopping list for a route's next step (src/shared/tradeskillShopping.ts) and the expansion
// under it (src/shared/tradeskillMaterials.ts): need, have and what is still to get for a number
// of combines, a made or enchanted material the player lacks rolled up to what it takes, where
// each comes from, the total at the player's own prices, and the text put on the clipboard.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookRecipe } from '../src/shared/tradeskillBook'
import { expandMaterials, onHand, onHandText, recipeMaterials } from '../src/shared/tradeskillMaterials'
import {
  COMBINES_DEFAULT,
  COMBINES_MAX,
  HAVE_UNKNOWN_TEXT,
  asCombines,
  haveFromText,
  intoText,
  shoppingCopyText,
  shoppingList,
  toGetText,
  totalText,
  whereText,
  type ShoppingFacts,
  type ShoppingList
} from '../src/shared/tradeskillShopping'
import { bought, depot, ing, recipe, SEP_12 } from './tradeskillFixtures.mts'
import { ownerHeld, ownerIndex, ownerShopping, ownerSnap } from './tradeskillRouteFixtures.mts'

const byId = (facts: ShoppingFacts, id: string): BookRecipe => {
  const found = facts.index.byId.get(id)
  assert.ok(found, `${id} is in the fixture`)
  return found
}

/** A list as "name need/have/short action" lines. */
const rows = (list: ShoppingList): string[] => list.lines.map((l) => `${l.name} ${String(l.need)}/${String(l.have)}/${String(l.short)} ${l.action}`)

test("the owner's ring: 20 combines are covered by what is held, 60 are not, and the copied text says exactly that", () => {
  const facts = ownerShopping()
  const ring = byId(facts, 'golden ruby ring#0')
  const covered = shoppingList(facts, ring, 20)
  assert.deepEqual(rows(covered), ['Enchanted Gold Bar 20/23/0 buy', 'Ruby 20/54/0 buy'])
  assert.equal(covered.covered, true)
  assert.equal(covered.total, 0)
  assert.equal(totalText(covered), 'Nothing to buy: you hold everything for 20 combines.')
  assert.equal(
    shoppingCopyText(covered),
    [
      "Golden Ruby Ring x 20 (Jewelcrafting, trivial 207, Jeweler's Kit)",
      'Enchanted Gold Bar: need 20, have 23, buy 0. A spell enchants it from a Gold Bar.',
      'Ruby: need 20, have 54, buy 0. Last bought for 131.25 pp each from Jade in North Freeport.',
      'Nothing to buy: you hold everything for 20 combines.'
    ].join('\n')
  )

  // 60 rings: 37 bars to buy and enchant, 6 rubies to buy. 37 x 10.50 + 6 x 131.25 = 1176.00 pp.
  const short = shoppingList(facts, ring, 60)
  assert.deepEqual(rows(short), ['Enchanted Gold Bar 60/23/37 enchant', 'Gold Bar 37/0/37 buy', 'Ruby 60/54/6 buy'])
  assert.equal(short.total, 1_176_000)
  assert.equal(short.covered, false)
  assert.equal(
    shoppingCopyText(short),
    [
      "Golden Ruby Ring x 60 (Jewelcrafting, trivial 207, Jeweler's Kit)",
      'Enchanted Gold Bar: need 60, have 23, enchant 37. A spell enchants it from a Gold Bar.',
      'Gold Bar (for Enchanted Gold Bar): need 37, have 0, buy 37. Last bought for 10.50 pp each from Amber in North Freeport.',
      'Ruby: need 60, have 54, buy 6. Last bought for 131.25 pp each from Jade in North Freeport.',
      'To buy, at the prices you last paid: 1176.00 pp.'
    ].join('\n')
  )
  const bar = short.lines[1]
  assert.equal(intoText(bar), 'for Enchanted Gold Bar')
  assert.equal(toGetText(short.lines[0]), 'enchant 37')
  assert.equal(toGetText(bar), '37')
  assert.equal(bar.unit, 10_500)
  assert.equal(bar.cost, 388_500)
  assert.doesNotMatch(shoppingCopyText(short), /[–—\t]/)
})

test('plain bars the player holds count toward the enchanted ones: only the rest is bought', () => {
  const facts = ownerShopping({ held: ownerHeld({ 'Platinum Bar': 99, Malachite: 68 }) })
  const ring = byId(facts, 'platinum malachite ring#0')
  const list = shoppingList(facts, ring, 100)
  assert.deepEqual(rows(list), ['Enchanted Platinum Bar 100/0/100 enchant', 'Platinum Bar 100/99/1 buy', 'Malachite 100/68/32 buy'])
  // 1 x 105 pp + 32 x 0.06 pp.
  assert.equal(list.total, 106_920)
  assert.equal(totalText(list), 'To buy, at the prices you last paid: 106.92 pp.')

  // "Materials on hand": none as held, 68 once the bars are enchanted (the Malachite runs out first).
  assert.deepEqual(onHand(facts, ring), { ready: 0, enchanted: 68, bars: ['Platinum Bar'] })
  assert.equal(onHandText(onHand(facts, ring)), 'Materials on hand for 0, or for 68 once the Platinum Bar you hold is enchanted.')
  assert.deepEqual(onHand(facts, byId(facts, 'golden ruby ring#0')), { ready: 23, enchanted: null, bars: [] })
  assert.equal(onHandText(onHand(facts, byId(facts, 'golden ruby ring#0'))), 'Materials on hand for 23.')
})

test('where a material comes from: your last merchant, else the guide, else drops and forage, else the wiki words', () => {
  const extra = [
    recipe('Mixed Charm', {
      trivial: 230,
      ingredients: [ing('Ruby', 1, ['Bought', 'Dropped']), ing('Topaz', 1, ['Bought', 'Dropped']), ing('Jacinth', 1, ['Dropped']), ing('Swamp Reed', 1, ['Foraged']), ing('Odd Pebble', 1, ['Quested']), ing('Nameless Dust')]
    }),
    // The fixture guide places Enchanted Platinum Bar and Malachite at merchants: Topaz it does not.
    recipe('Guide Charm', { trivial: 231, ingredients: [ing('Enchanted Platinum Bar', 1, ['Summoned'])] })
  ]
  const index = indexBook({
    version: TRADESKILL_BOOK_VERSION,
    recipes: extra,
    materials: {
      jacinth: { dropsFrom: [{ mob: 'a spectre', zone: 'The Ocean of Tears' }, { mob: 'a ghoul lord', zone: 'Lower Guk' }, { mob: 'a ghoul lord', zone: 'The Ruins of Old Guk' }] },
      'swamp reed': { foraged: ['Innothule Swamp'], foragedNote: 'Various' }
    }
  })
  const facts = ownerShopping({ index })
  const list = shoppingList(facts, byId(facts, 'mixed charm#0'), 2)
  const where = Object.fromEntries(list.lines.map((l) => [l.name, whereText(l.where)]))
  assert.deepEqual(where, {
    Ruby: 'Last bought for 131.25 pp each from Jade in North Freeport.',
    Topaz: 'Wiki: Bought, Dropped.',
    // One line per mob name, its zones together.
    Jacinth: 'Drops: a spectre (The Ocean of Tears); a ghoul lord (Lower Guk, The Ruins of Old Guk).',
    'Swamp Reed': 'Forage: Innothule Swamp, Various.',
    'Odd Pebble': 'Wiki: Quested.',
    'Nameless Dust': ''
  })
  // One price is missing, so there is no total: the list names what has none.
  assert.equal(list.total, null)
  assert.deepEqual(list.unpriced, ['Topaz', 'Jacinth', 'Swamp Reed', 'Odd Pebble', 'Nameless Dust'])
  assert.equal(totalText(list), 'No total: your log has no price for Topaz, Jacinth, Swamp Reed, Odd Pebble, Nameless Dust.')
  // A farmed material is "get", a bought one "buy".
  assert.match(shoppingCopyText(list), /^Jacinth: need 2, have 0, get 2\. Drops: /m)
  assert.match(shoppingCopyText(list), /^Topaz: need 2, have 0, buy 2\. Wiki: Bought, Dropped\.$/m)

  // No purchase in the log: the recipe guide's merchant, with zone and loc.
  const guided = shoppingList(facts, byId(facts, 'guide charm#0'), 1)
  assert.equal(whereText(guided.lines[0].where), 'Guide: Amber, North Freeport, loc -176, 207, 17.')
})

test('a made material the player lacks rolls up to its own recipe; one held stock serves every use; a tool is needed once', () => {
  const recipes = [
    recipe('Banded Bracer', {
      tradeskill: 'Blacksmithing',
      trivial: 100,
      container: 'Forge',
      ingredients: [ing('Metal Rings', 3, ['Crafted']), ing('Sheet Metal', 1, ['Crafted']), ing('Water Flask', 1, ['Bought']), ing('Smithy Hammer', 1, ['Bought', 'Returned on Success'])]
    }),
    // One combine yields two sets of rings.
    recipe('Metal Rings', { tradeskill: 'Blacksmithing', trivial: 30, yieldQty: 2, ingredients: [ing('Metal Bits', 2, ['Crafted']), ing('Water Flask', 1, ['Bought'])] }),
    recipe('Sheet Metal', { tradeskill: 'Blacksmithing', trivial: 40, ingredients: [ing('Metal Bits', 1, ['Crafted']), ing('Smithy Hammer', 1, ['Bought', 'Returned on Success'])] }),
    recipe('Metal Bits', { tradeskill: 'Blacksmithing', trivial: 18, ingredients: [ing('Small Piece of Ore', 2, ['Bought']), ing('Water Flask', 1, ['Bought'])] }),
    // A bought material that also has a recipe is bought, not made.
    recipe('Water Flask', { tradeskill: 'Pottery', trivial: 5, ingredients: [ing('Clay')] })
  ]
  const index = indexBook({ version: TRADESKILL_BOOK_VERSION, recipes, materials: {} })
  const snap = ownerSnap({ bought: [bought('Small Piece of Ore', 10, 5_000, 'Smith Lyra'), bought('Water Flask', 1, 100, 'Innkeep')] })
  const facts = ownerShopping({ index, snap, held: ownerHeld({ 'Metal Rings': 2, 'Metal Bits': 3, 'Water Flask': 4 }) })
  // 4 bracers: 12 rings (2 held, 10 to make in 5 combines), 4 sheets (4 combines).
  // Bits: 10 for the rings + 4 for the sheets = 14, 3 held, 11 to make. Ore: 22.
  // Flasks: 4 (bracers) + 5 (rings) + 11 (bits) = 20, 4 held.
  const list = shoppingList(facts, byId(facts, 'banded bracer#0'), 4)
  assert.deepEqual(rows(list), [
    'Metal Rings 12/2/10 make',
    'Metal Bits 14/3/11 make',
    'Small Piece of Ore 22/0/22 buy',
    'Water Flask 20/4/16 buy',
    'Sheet Metal 4/0/4 make',
    'Smithy Hammer 1/0/1 buy'
  ])
  const line = (name: string): ShoppingList['lines'][number] => {
    const found = list.lines.find((l) => l.name === name)
    assert.ok(found, name)
    return found
  }
  assert.equal(line('Metal Rings').made?.combines, 5)
  assert.equal(line('Metal Bits').made?.combines, 11)
  assert.deepEqual(line('Metal Bits').into, ['Metal Rings', 'Sheet Metal'])
  assert.equal(whereText(line('Metal Rings').where), 'Made by you (Blacksmithing, trivial 30): 5 combines.')
  assert.equal(toGetText(line('Metal Rings')), 'make 10')
  assert.equal(line('Smithy Hammer').tool, true)
  // The hammer has no price in the log, so there is no total; the ore and the flasks do.
  assert.equal(line('Small Piece of Ore').cost, 11_000)
  assert.equal(line('Water Flask').cost, 1_600)
  assert.equal(list.total, null)
  assert.deepEqual(list.unpriced, ['Smithy Hammer'])
  assert.match(shoppingCopyText(list), /^Metal Bits \(for Metal Rings, Sheet Metal\): need 14, have 3, make 11\. Made by you \(Blacksmithing, trivial 18\): 11 combines\.$/m)

  // With the made parts and the hammer in the bags, only the bracer's own flask is left.
  const stocked = ownerShopping({ index, snap, held: ownerHeld({ 'Metal Rings': 12, 'Sheet Metal': 4, 'Smithy Hammer': 1 }) })
  const ready = shoppingList(stocked, byId(stocked, 'banded bracer#0'), 4)
  assert.deepEqual(rows(ready), ['Metal Rings 12/12/0 buy', 'Sheet Metal 4/4/0 buy', 'Water Flask 4/0/4 buy', 'Smithy Hammer 1/1/0 buy'])
  assert.equal(ready.total, 400)
})

test('two materials made from each other never expand each other', () => {
  const index = indexBook({
    version: TRADESKILL_BOOK_VERSION,
    recipes: [recipe('Loop A', { trivial: 10, ingredients: [ing('Loop B', 1, ['Crafted'])] }), recipe('Loop B', { trivial: 12, ingredients: [ing('Loop A', 1, ['Crafted'])] })],
    materials: {}
  })
  const facts = ownerShopping({ index })
  const plan = expandMaterials(facts, byId(facts, 'loop a#0'), 3)
  assert.deepEqual(plan.lines.map((l) => `${l.name} ${String(l.need)} ${l.action}`), ['Loop B 3 make', 'Loop A 3 buy'])
})

test('with no inventory dump nothing is held as far as the app knows: Have is unknown and the list says so', () => {
  const facts = ownerShopping({ held: null })
  const ring = byId(facts, 'golden ruby ring#0')
  const list = shoppingList(facts, ring, 5)
  assert.equal(list.haveKnown, false)
  assert.deepEqual(rows(list), ['Enchanted Gold Bar 5/null/5 enchant', 'Gold Bar 5/null/5 buy', 'Ruby 5/null/5 buy'])
  assert.equal(list.total, 708_750)
  assert.ok(shoppingCopyText(list).includes(HAVE_UNKNOWN_TEXT))
  assert.match(shoppingCopyText(list), /^Ruby: need 5, have not known, buy 5\./m)
  assert.equal(onHand(facts, ring), null)
  assert.equal(onHandText(null), '')

  assert.equal(haveFromText(null, false), '')
  assert.equal(haveFromText(null, true), 'Have is the depot count your log last stated, for the materials it names.')
  assert.equal(haveFromText('Nov 20', false), 'Have is from your inventory dump of Nov 20.')
  assert.equal(haveFromText('Nov 20', true), 'Have is from your inventory dump of Nov 20. Where your log states a newer depot count for a material, that count is used.')

  // The log's depot line stands in for a material it names, as on the recipe panel.
  const logged = ownerShopping({ held: null, snap: ownerSnap({ depot: [depot('Ruby', 50, SEP_12), depot('Enchanted Gold Bar', 9, SEP_12)] }) })
  assert.deepEqual(onHand(logged, ring), { ready: 9, enchanted: null, bars: [] })
})

test("a recipe the wiki lists no materials for shops from the recipe guide's list, and one neither lists has no list", () => {
  const facts = ownerShopping({ index: ownerIndex([recipe('Platinum Ruby Veil', { id: 'veil-unlisted#0', tradeskill: 'Jewelcrafting', trivial: 280 })]) })
  const unlisted = byId(facts, 'veil-unlisted#0')
  // The guide's own lines: a wiki item's name is linked, and the guide's merchant rides on the line.
  assert.deepEqual(recipeMaterials(facts.guides, unlisted).map((m) => `${m.ingredient.name} ${String(m.linked)} ${m.guide?.merchant ?? ''}`), ['Enchanted Platinum Bar true Amber', 'Ruby true Jade'])
  const list = shoppingList(facts, unlisted, 3)
  assert.equal(list.fromGuide, true)
  assert.deepEqual(rows(list), ['Enchanted Platinum Bar 3/0/3 buy', 'Ruby 3/54/0 buy'])
  // The guide gives no source words, so nothing says the bar is enchanted: it is the guide's merchant line.
  assert.equal(whereText(list.lines[0].where), 'Guide: Amber, North Freeport, loc -176, 207, 17.')

  const tiara = shoppingList(facts, byId(facts, 'platinum blue diamond tiara#0'), 3)
  assert.deepEqual(tiara.lines, [])
  assert.equal(totalText(tiara), '')
})

test('the number of combines is a whole number from 1 to 1000, and anything else is the default', () => {
  assert.equal(asCombines('60'), 60)
  assert.equal(asCombines(7.9), 7)
  assert.equal(asCombines('0'), 1)
  assert.equal(asCombines('-4'), 1)
  assert.equal(asCombines('99999'), COMBINES_MAX)
  assert.equal(asCombines(null), COMBINES_DEFAULT)
  assert.equal(asCombines('many'), COMBINES_DEFAULT)
  assert.equal(asCombines(Number.NaN), COMBINES_DEFAULT)
})
