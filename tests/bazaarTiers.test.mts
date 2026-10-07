// "All tiers as one" (src/shared/bazaarTiers.ts), who said what (quotes on the summary), and the
// offers CSV (src/shared/bazaarCsv.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBazaar, type BazaarRow, type Quote } from '../src/shared/bazaar'
import { DEFAULT_TIER_RATE, asBaseTier, tierRate } from '../src/shared/bazaarTiers'
import { offersCsv, offersOf } from '../src/shared/bazaarCsv'

const row = ([day, dir, item, tier = 0]: [string, BazaarRow['dir'], string, number?], prices: number[], quotes?: Quote[]): BazaarRow => ({
  day,
  dir,
  item,
  tier,
  n: prices.length,
  unpriced: 0,
  min: prices.length > 0 ? Math.min(...prices) : null,
  max: prices.length > 0 ? Math.max(...prices) : null,
  sum: prices.reduce((s, p) => s + p, 0),
  prices,
  quotes
})

const near = (a: number | null, b: number, msg?: string): void => assert.ok(a !== null && Math.abs(a - b) < 1e-6, msg ?? `${a} ~ ${b}`)

test('a tier adds what the item itself shows, held between 1 and 2', () => {
  // 1k at +0, 2k at +2: about 41% a tier.
  near(tierRate([row(['2026-09-01', 'sell', 'Cloak'], [1000]), row(['2026-09-01', 'sell', 'Cloak', 2], [2000])]), Math.SQRT2)
  // Priced at one tier only: the measured default.
  assert.equal(tierRate([row(['2026-09-01', 'sell', 'Cloak', 4], [5000])]), DEFAULT_TIER_RATE)
  // A higher tier asked for less is never read as cheaper, and nothing passes doubling.
  assert.equal(tierRate([row(['2026-09-01', 'sell', 'Cloak'], [5000]), row(['2026-09-01', 'sell', 'Cloak', 1], [4000])]), 1)
  assert.equal(tierRate([row(['2026-09-01', 'sell', 'Cloak'], [1000]), row(['2026-09-01', 'sell', 'Cloak', 1], [9000])]), 2)
})

test('a row read as +0 divides each price by the rate once per tier', () => {
  const [r] = asBaseTier([row(['2026-09-01', 'sell', 'Cloak', 2], [4000, 6000])], 2)
  assert.deepEqual([r.tier, r.fromTier, r.prices, r.min, r.max, r.sum], [0, 2, [1000, 1500], 1000, 1500, 2500])
})

test('with All tiers as one, an item is one row priced as +0, with each tier beside its estimate', () => {
  const rows = [
    row(['2026-09-25', 'sell', 'Cloak'], [1000, 1000]),
    row(['2026-09-25', 'sell', 'Cloak', 2], [4000]),
    row(['2026-09-25', 'sell', 'Rain Caller'], [15000])
  ]
  const sum = summarizeBazaar({ rows }, { text: '', dir: 'all', sort: { key: 'item', desc: false }, combineTiers: true })
  assert.deepEqual(sum.items.map((i) => i.key), ['Cloak', 'Rain Caller'])
  const cloak = sum.items[0]
  // Each tier doubles here, so +2 at 4k reads as 1k: three offers at a +0 of 1k.
  near(cloak.combined?.rate ?? null, 2)
  assert.equal(cloak.asking, 1000)
  assert.deepEqual(
    cloak.combined?.tiers.map((t) => [t.tier, t.asking, t.offers, t.estimate]),
    [
      [0, 1000, 2, 1000],
      [2, 4000, 1, 4000]
    ]
  )
  // Separate, the same rows are one row per tier.
  const apart = summarizeBazaar({ rows }, { text: '', dir: 'all', sort: { key: 'item', desc: false } })
  assert.deepEqual(apart.items.map((i) => i.key), ['Cloak|0', 'Cloak|2', 'Rain Caller|0'])
})

test('quotes keep their own tier and price when tiers are combined, and export as CSV', () => {
  const rows = [
    row(['2026-09-24', 'sell', 'Cloak'], [1000], [{ at: '10:00:00', who: 'Leric', price: 1000, msg: 'WTS Cloak 1k' }]),
    row(['2026-09-25', 'buy', 'Cloak', 2], [3000], [{ at: '09:30:00', who: 'Aaron', price: 3000, msg: 'WTB Cloak +2, "3k" =pst' }])
  ]
  const sum = summarizeBazaar({ rows }, { text: '', dir: 'all', sort: { key: 'item', desc: false }, combineTiers: true })
  const quotes = offersOf(sum.items)
  assert.deepEqual(
    quotes.map((q) => [q.day, q.who, q.dir, q.tier, q.price]),
    [
      ['2026-09-25', 'Aaron', 'buy', 2, 3000],
      ['2026-09-24', 'Leric', 'sell', 0, 1000]
    ]
  )
  const csv = offersCsv(quotes)
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.deepEqual(csv.slice(1).split('\r\n'), [
    'Date,Time,Who,Direction,Item,Tier,Price (pp),Message',
    '2026-09-25,09:30:00,Aaron,WTB,Cloak,2,3000,"WTB Cloak +2, ""3k"" =pst"',
    '2026-09-24,10:00:00,Leric,WTS,Cloak,0,1000,WTS Cloak 1k',
    ''
  ])
})
