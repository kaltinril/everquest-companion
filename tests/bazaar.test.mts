// The Bazaar tab's list, from the engine's per-day rows (src/shared/bazaar.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlat, summarizeBazaar, type BazaarRow } from '../src/shared/bazaar'

type Priced = [n: number, min: number | null, max: number | null, sum: number]
type Where = [day: string, dir: BazaarRow['dir'], item: string]
const row = ([day, dir, item]: Where, [n, min, max, sum]: Priced, more: Partial<BazaarRow> = {}): BazaarRow => ({
  day,
  dir,
  item,
  tier: 0,
  n,
  unpriced: 0,
  min,
  max,
  sum,
  ...more
})

const rows: BazaarRow[] = [
  row(['2026-09-23', 'sell', 'Fleeting Quiver'], [2, 18000, 20000, 38000]),
  row(['2026-09-24', 'sell', 'Fleeting Quiver'], [1, 19000, 19000, 19000]),
  row(['2026-09-24', 'buy', 'Fleeting Quiver'], [0, null, null, 0], { unpriced: 3 }),
  row(['2026-09-20', 'sell', 'Bone-Clasped Girdle'], [1, 5000, 5000, 5000], { tier: 4 }),
  row(['2026-09-21', 'sell', 'Bone-Clasped Girdle'], [1, 3000, 3000, 3000], { tier: 3 })
]

test('one entry per item, tier and direction, most recently seen first, its days newest first', () => {
  const out = summarizeBazaar({ rows }, { text: '', dir: 'all' })
  assert.deepEqual(
    out.map((e) => [e.item, e.tier, e.dir, e.lastDay]),
    [
      ['Fleeting Quiver', 0, 'sell', '2026-09-24'],
      ['Fleeting Quiver', 0, 'buy', '2026-09-24'],
      ['Bone-Clasped Girdle', 3, 'sell', '2026-09-21'],
      ['Bone-Clasped Girdle', 4, 'sell', '2026-09-20']
    ]
  )
  const quiver = out[0]
  assert.deepEqual(quiver.days.map((d) => d.day), ['2026-09-24', '2026-09-23'])
  assert.equal(quiver.lastAvg, 19000)
  assert.equal(quiver.low, 18000)
  assert.equal(quiver.high, 20000)
  assert.equal(quiver.avg, 19000)
  assert.equal(quiver.offers, 3)
  assert.equal(out[1].avg, null, 'a buyer who named no price has no average')
  assert.equal(out[1].unpriced, 3)
})

test('search and direction narrow the list', () => {
  assert.deepEqual(summarizeBazaar({ rows }, { text: 'girdle', dir: 'all' }).map((e) => e.tier), [3, 4])
  assert.deepEqual(summarizeBazaar({ rows }, { text: '', dir: 'buy' }).map((e) => e.item), ['Fleeting Quiver'])
  assert.deepEqual(summarizeBazaar(null, { text: '', dir: 'all' }), [])
})

test('prices read the way trade chat writes them', () => {
  assert.equal(formatPlat(20000), '20k')
  assert.equal(formatPlat(2500), '2.5k')
  assert.equal(formatPlat(75), '75pp')
  assert.equal(formatPlat(0.5), '5g')
  assert.equal(formatPlat(null), '-')
})
