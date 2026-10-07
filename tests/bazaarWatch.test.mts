// The Bazaar watchlist and its alerts (src/shared/bazaarWatch.ts), and the tab's Popular, price
// floor and keep filters (src/shared/bazaar.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBazaar, type BazaarRow, type BazaarSnap, type LiveOffer } from '../src/shared/bazaar'
import {
  findWatch,
  freshWatchAlerts,
  normalizeBazaarWatchlist,
  removeWatch,
  setWatch,
  watchAlertReason,
  weekMedianAsking,
  type BazaarWatch
} from '../src/shared/bazaarWatch'

const row = ([day, dir, item, tier = 0]: [string, BazaarRow['dir'], string, number?], prices: number[]): BazaarRow => ({
  day,
  dir,
  item,
  tier,
  n: prices.length,
  unpriced: 0,
  min: prices.length > 0 ? Math.min(...prices) : null,
  max: prices.length > 0 ? Math.max(...prices) : null,
  sum: prices.reduce((s, p) => s + p, 0),
  prices
})

const offer = ([seq, dir, item, tier = 0]: [number, LiveOffer['dir'], string, number?], price: number | null): LiveOffer => ({
  seq,
  at: '2026-09-25 18:00:00',
  speaker: 'Leric',
  dir,
  item,
  tier,
  price
})

const watch = (w: Partial<BazaarWatch> & Pick<BazaarWatch, 'item' | 'status'>): BazaarWatch => ({
  tier: null,
  alert: true,
  price: null,
  medianShare: null,
  ...w
})

test('a stored watchlist is read defensively and never throws', () => {
  assert.deepEqual(normalizeBazaarWatchlist(undefined), { entries: [] })
  assert.deepEqual(normalizeBazaarWatchlist({ entries: 'no' }), { entries: [] })
  const list = normalizeBazaarWatchlist({
    entries: [
      { item: 'Fleeting Quiver', tier: null, status: 'buy', alert: true, price: 20000, medianShare: 1.5 },
      { item: 'fleeting quiver', tier: null, status: 'sell' },
      { item: '', status: 'buy' },
      { item: 'Cloak of Flames', tier: 4, status: 'watch', alert: true, price: -3 },
      { item: 'Rain Caller', status: 'nonsense' }
    ]
  })
  assert.deepEqual(list.entries, [
    // A share over 100% is 100%; the repeat of the same item and tier is dropped.
    { item: 'Fleeting Quiver', tier: null, status: 'buy', alert: true, price: 20000, medianShare: 1 },
    // Watching never alerts, and a negative price is no price.
    { item: 'Cloak of Flames', tier: 4, status: 'watch', alert: false, price: null, medianShare: null }
  ])
})

test('a tier watch wins over an every-tier watch, and edits replace in place', () => {
  let list = setWatch({ entries: [] }, watch({ item: 'Cloak of Flames', status: 'watch' }))
  list = setWatch(list, watch({ item: 'Cloak of Flames', tier: 4, status: 'buy' }))
  assert.equal(findWatch(list, 'cloak of flames', 4)?.status, 'buy')
  assert.equal(findWatch(list, 'Cloak of Flames', 2)?.status, 'watch')
  list = setWatch(list, watch({ item: 'Cloak of Flames', tier: 4, status: 'sell' }))
  assert.equal(list.entries.length, 2)
  list = removeWatch(list, 'Cloak of Flames', null)
  assert.equal(findWatch(list, 'Cloak of Flames', 2), null)
})

test('want to buy: a sale at or under the price, or under a share of the 7-day median', () => {
  const w = watch({ item: 'Fleeting Quiver', status: 'buy', price: 20000 })
  assert.match(watchAlertReason(w, offer([1, 'sell', 'Fleeting Quiver'], 19000), null) ?? '', /under your 20k/)
  assert.equal(watchAlertReason(w, offer([1, 'sell', 'Fleeting Quiver'], 21000), null), null)
  // A buyer is no seller, and an unpriced sale cannot be judged against a price.
  assert.equal(watchAlertReason(w, offer([1, 'buy', 'Fleeting Quiver'], 1000), null), null)
  assert.equal(watchAlertReason(w, offer([1, 'sell', 'Fleeting Quiver'], null), null), null)
  const share = watch({ item: 'Fleeting Quiver', status: 'buy', medianShare: 0.8 })
  assert.match(watchAlertReason(share, offer([1, 'sell', 'Fleeting Quiver'], 16000), 22000) ?? '', /73% of the 7-day median 22k/)
  assert.equal(watchAlertReason(share, offer([1, 'sell', 'Fleeting Quiver'], 19000), 22000), null)
  // With neither set, any sale alerts; with the alert off, none does.
  assert.ok(watchAlertReason(watch({ item: 'Fleeting Quiver', status: 'buy' }), offer([1, 'sell', 'Fleeting Quiver'], null), null))
  assert.equal(watchAlertReason({ ...w, alert: false }, offer([1, 'sell', 'Fleeting Quiver'], 1), null), null)
})

test('want to sell: a buyer at or over the price, or one who names none', () => {
  const w = watch({ item: 'Bone-Clasped Girdle', tier: 4, status: 'sell', price: 8000 })
  assert.match(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 4], 9000), null) ?? '', /over your 8k/)
  assert.equal(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 4], 5000), null), null)
  assert.equal(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 4], null), null), 'no price stated')
  // Another tier is another item.
  assert.equal(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 3], 9000), null), null)
})

test('the 7-day median asking counts only the week ending that day', () => {
  const rows = [
    row(['2026-09-10', 'sell', 'Fleeting Quiver'], [50000]),
    row(['2026-09-20', 'sell', 'Fleeting Quiver'], [20000, 24000]),
    row(['2026-09-25', 'sell', 'Fleeting Quiver'], [22000]),
    row(['2026-09-25', 'buy', 'Fleeting Quiver'], [1000])
  ]
  assert.equal(weekMedianAsking(rows, 'Fleeting Quiver', 0, '2026-09-25'), 22000)
})

test('the first snapshot is a baseline; later live offers alert once', () => {
  const list = { entries: [watch({ item: 'Fleeting Quiver', status: 'buy', price: 20000 })] }
  const snap: BazaarSnap = { rows: [], live: [offer([5, 'sell', 'Fleeting Quiver'], 15000)] }
  assert.deepEqual(freshWatchAlerts(snap, list, null), { newest: 5, alerts: [] })
  const later: BazaarSnap = { rows: [], live: [...(snap.live ?? []), offer([6, 'sell', 'Fleeting Quiver'], 18000), offer([7, 'sell', 'Rain Caller'], 1)] }
  const fresh = freshWatchAlerts(later, list, 5)
  assert.equal(fresh.newest, 7)
  assert.deepEqual(
    fresh.alerts.map((a) => a.text),
    ['Leric WTS Fleeting Quiver 18k (at or under your 20k)']
  )
  assert.deepEqual(freshWatchAlerts(later, list, 7).alerts, [])
})

test('Popular ranks by platinum traded and the floor drops what sells under it', () => {
  const rows = [
    row(['2026-09-25', 'sell', 'Bone Chips'], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    row(['2026-09-25', 'sell', 'Fleeting Quiver'], [20000]),
    row(['2026-09-25', 'buy', 'Fleeting Quiver'], [18000]),
    row(['2026-09-25', 'sell', 'Cloak of Flames', 4], [5000])
  ]
  const sum = summarizeBazaar({ rows }, { text: '', dir: 'all', sort: { key: 'volume', desc: true }, minPrice: 1 })
  assert.deepEqual(
    sum.items.map((i) => [i.item, i.volume]),
    [
      ['Fleeting Quiver', 40000],
      ['Cloak of Flames', 5000]
    ]
  )
  const kept = summarizeBazaar({ rows }, { text: '', dir: 'all', sort: { key: 'item', desc: false }, keep: (item, tier) => tier === 4 && item === 'Cloak of Flames' })
  assert.deepEqual(kept.items.map((i) => i.key), ['Cloak of Flames|4'])
})
