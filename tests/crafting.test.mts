// The `crafting` module's pure helpers (src/shared/crafting.ts): totals per tradeskill, pace per
// crafting hour, and what an item's combines cost against what its makes bring back.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  combineCost,
  craftingPace,
  itemTradeskill,
  tradeskillTotals,
  unitCopper,
  type BoughtRow,
  type CraftedItemRow,
  type CraftSpan,
  type SoldRow
} from '../src/shared/crafting'

const item = (name: string, over: Partial<CraftedItemRow>): CraftedItemRow => ({
  item: name,
  made: 0,
  failed: 0,
  trivial: 0,
  raises: 0,
  firstTs: 0,
  lastTs: 0,
  sessionMade: 0,
  sessionFailed: 0,
  sessionRaises: 0,
  ...over
})

const MIN = 60_000

const span = (startMin: number, minutes: number, combines: number, raises: Record<string, number>): CraftSpan => ({
  start: startMin * MIN,
  end: (startMin + minutes) * MIN,
  combines,
  made: combines,
  failed: 0,
  raises
})

const bought = (name: string, lastQty: number, lastCopper: number): BoughtRow => ({
  item: name,
  qty: lastQty,
  copper: lastCopper,
  lastQty,
  lastCopper,
  merchant: 'Jeweler Anvo',
  ts: 0
})

const sold = (name: string, lastCopper: number): SoldRow => ({ item: name, lines: 1, copper: lastCopper, lastCopper, merchant: 'Jeweler Anvo', ts: 0 })

test('an item takes the tradeskill a raise named, else the recipe data, in one spelling', () => {
  const recipe = (name: string): string | undefined => (name === 'Golden Emerald Bracelet' ? 'Jewelcrafting' : undefined)
  assert.equal(itemTradeskill(item('Gold Malachite Bracelet', { tradeskill: 'Jewelry Making' })), 'Jewelcrafting')
  assert.equal(itemTradeskill(item('Golden Emerald Bracelet', {}), recipe), 'Jewelcrafting')
  assert.equal(itemTradeskill(item('Golden Emerald Bracelet', {})), undefined)
  assert.equal(itemTradeskill(item('Mystery Stew', {}), recipe), undefined)
})

test('totals per tradeskill: combines, success rate, raises and combines per raise', () => {
  const recipe = (name: string): string | undefined => (name === 'Golden Emerald Bracelet' ? 'Jewelry Making' : undefined)
  const rows = tradeskillTotals(
    [
      item('Gold Malachite Bracelet', { made: 92, failed: 29, raises: 33, tradeskill: 'Jewelry Making' }),
      item('Golden Emerald Bracelet', { made: 10, failed: 6 }),
      item('Bog Juice', { made: 3, failed: 4, raises: 7, tradeskill: 'Brewing' }),
      item('Mystery Stew', { made: 1, failed: 1 })
    ],
    recipe
  )
  assert.deepEqual(
    rows.map((r) => [r.tradeskill, r.items, r.combines, r.made, r.failed, r.raises]),
    [
      ['Jewelcrafting', 2, 137, 102, 35, 33],
      ['Brewing', 1, 7, 3, 4, 7],
      [null, 1, 2, 1, 1, 0]
    ]
  )
  assert.equal(rows[0].successRate, 102 / 137)
  assert.equal(rows[0].combinesPerRaise, 137 / 33)
  assert.equal(rows[1].combinesPerRaise, 1)
  // No raise: nothing to divide by.
  assert.equal(rows[2].combinesPerRaise, null)
  assert.equal(rows[2].successRate, 0.5)
})

test('totals of nothing are no rows', () => {
  assert.deepEqual(tradeskillTotals([]), [])
})

test('pace is per crafting hour: the spans summed, not the clock around them', () => {
  // 91 minutes of combining inside an afternoon: 30 minutes, three hours away, then 61.
  const spans = [span(0, 30, 200, { 'Jewelry Making': 50 }), span(210, 61, 363, { 'Jewelry Making': 79 })]
  const pace = craftingPace({ spans })
  assert.deepEqual([pace.spans, pace.ms, pace.combines, pace.raises], [2, 91 * MIN, 563, 129])
  assert.equal(pace.combinesPerHour, (563 * 60) / 91)
  assert.equal(pace.raisesPerHour, (129 * 60) / 91)
})

test('pace is withheld until the spans add up to five minutes', () => {
  const pace = craftingPace({ spans: [span(0, 2, 20, { Baking: 3 }), span(60, 2, 20, {})] })
  assert.deepEqual([pace.ms, pace.combines, pace.raises], [4 * MIN, 40, 3])
  assert.equal(pace.combinesPerHour, null)
  assert.equal(pace.raisesPerHour, null)
  assert.equal(craftingPace({ spans: [] }).combinesPerHour, null)
})

test("a tradeskill's pace counts only the spans holding a raise of it", () => {
  const spans = [
    span(0, 30, 100, { 'Jewelry Making': 20 }),
    // Trivial combines made to sell: no raise names their tradeskill.
    span(100, 10, 33, {}),
    span(200, 6, 11, { Baking: 3, Brewing: 7 })
  ]
  const jewel = craftingPace({ spans }, 'Jewelcrafting')
  assert.deepEqual([jewel.spans, jewel.ms, jewel.combines, jewel.raises], [1, 30 * MIN, 100, 20])
  assert.equal(jewel.raisesPerHour, 40)
  const brewing = craftingPace({ spans }, 'Brewing')
  assert.deepEqual([brewing.spans, brewing.ms, brewing.combines, brewing.raises], [1, 6 * MIN, 11, 7])
  assert.equal(craftingPace({ spans }, 'Pottery').spans, 0)
})

test('the spans summed past the cap are in the pace, whole and per tradeskill', () => {
  const olderSpans = {
    spans: 3,
    ms: 60 * MIN,
    combines: 300,
    made: 250,
    failed: 50,
    bySkill: { 'Jewelry Making': { spans: 2, ms: 40 * MIN, combines: 220, raises: 30 }, Baking: { spans: 1, ms: 20 * MIN, combines: 80, raises: 10 } }
  }
  const spans = [span(1000, 30, 100, { 'Jewelry Making': 20 })]
  const all = craftingPace({ spans, olderSpans })
  assert.deepEqual([all.spans, all.ms, all.combines, all.raises], [4, 90 * MIN, 400, 60])
  const jewel = craftingPace({ spans, olderSpans }, 'Jewelcrafting')
  assert.deepEqual([jewel.spans, jewel.ms, jewel.combines, jewel.raises], [3, 70 * MIN, 320, 50])
})

test('a unit price is the newest purchase line divided out', () => {
  assert.equal(unitCopper(bought('Gold Bar', 20, 210_000)), 10_500)
  assert.equal(unitCopper(bought('Gold Bar', 0, 0)), null)
})

test("an item's net cost: every combine's materials against what its makes sell for", () => {
  // Measured: a made jewel sells for what its materials cost, so the loss is the failed combines.
  const snap = { bought: [bought('Gold Bar', 20, 210_000), bought('Ruby', 1, 131_250)], sold: [sold('Golden Ruby Ring', 141_750)] }
  const cost = combineCost(snap, { item: 'Golden Ruby Ring', made: 3, failed: 1 }, [{ name: 'gold bar' }, { name: 'Ruby', qty: 1 }])
  assert.deepEqual(cost, { perCombine: 141_750, unpriced: [], salePrice: 141_750, spent: 567_000, earned: 425_250, net: 141_750 })
})

test('a quantity and a yield multiply through', () => {
  const snap = { bought: [bought('Water Flask', 10, 100)], sold: [sold('Bog Juice', 15)] }
  const cost = combineCost(snap, { item: 'Bog Juice', made: 2, failed: 0 }, [{ name: 'Water Flask', qty: 3 }], 2)
  assert.deepEqual([cost.perCombine, cost.spent, cost.earned, cost.net], [30, 60, 60, 0])
})

test('an ingredient never bought leaves the cost unstated and is named', () => {
  const snap = { bought: [bought('Ruby', 1, 131_250)], sold: [] }
  const cost = combineCost(snap, { item: 'Golden Ruby Ring', made: 3, failed: 1 }, [{ name: 'Enchanted Gold Bar' }, { name: 'Ruby' }])
  assert.deepEqual(cost, { perCombine: null, unpriced: ['Enchanted Gold Bar'], salePrice: null, spent: null, earned: null, net: null })
  // A recipe with no ingredient listed (390 on the wiki) has no cost either.
  assert.equal(combineCost(snap, { item: 'Fleeting Quiver', made: 1, failed: 0 }, []).perCombine, null)
})
