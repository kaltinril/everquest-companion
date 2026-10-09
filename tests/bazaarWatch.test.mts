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
  watchAlertCaptures,
  watchAlerts,
  type BazaarWatch
} from '../src/shared/bazaarWatch'
import { APP_SIGNAL_CAPTURES, applyCaptures, captureNamesIn } from '../src/shared/alertCaptures'

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

const watch = (w: Partial<BazaarWatch> & Pick<BazaarWatch, 'item'>): BazaarWatch => ({ tier: null, wts: false, wtb: false, ...w })

test('a stored watchlist is read defensively and never throws', () => {
  assert.deepEqual(normalizeBazaarWatchlist(undefined), { entries: [] })
  assert.deepEqual(normalizeBazaarWatchlist({ entries: 'no' }), { entries: [] })
  const list = normalizeBazaarWatchlist({
    entries: [
      { item: 'Fleeting Quiver', tier: null, wts: true, wtb: true },
      { item: 'fleeting quiver', tier: null, wts: false },
      { item: '', wts: true },
      { item: 'Cloak of Flames', tier: 4, wtb: 'yes' },
      { item: 'Rain Caller', tier: 99 }
    ]
  })
  assert.deepEqual(list.entries, [
    // Both at once; the repeat of the same item and tier is dropped.
    { item: 'Fleeting Quiver', tier: null, wts: true, wtb: true },
    // Only `true` is on, and an impossible tier is every tier.
    { item: 'Cloak of Flames', tier: 4, wts: false, wtb: false },
    { item: 'Rain Caller', tier: null, wts: false, wtb: false }
  ])
})

test('the first shape (one status, one alert switch) reads into the two switches', () => {
  const list = normalizeBazaarWatchlist({
    entries: [
      { item: 'A', tier: null, status: 'buy', alert: true, price: 20000, medianShare: 0.8 },
      { item: 'B', tier: null, status: 'sell', alert: true, price: null },
      { item: 'C', tier: null, status: 'buy', alert: false },
      { item: 'D', tier: 2, status: 'watch', alert: false }
    ]
  })
  assert.deepEqual(list.entries, [
    { item: 'A', tier: null, wts: true, wtb: false },
    { item: 'B', tier: null, wts: false, wtb: true },
    { item: 'C', tier: null, wts: false, wtb: false },
    { item: 'D', tier: 2, wts: false, wtb: false }
  ])
})

test('a tier watch wins over an every-tier watch, and edits replace in place', () => {
  let list = setWatch({ entries: [] }, watch({ item: 'Cloak of Flames' }))
  list = setWatch(list, watch({ item: 'Cloak of Flames', tier: 4, wts: true }))
  assert.equal(findWatch(list, 'cloak of flames', 4)?.wts, true)
  assert.equal(findWatch(list, 'Cloak of Flames', 2)?.wts, false)
  list = setWatch(list, watch({ item: 'Cloak of Flames', tier: 4, wtb: true }))
  assert.equal(list.entries.length, 2)
  list = removeWatch(list, 'Cloak of Flames', null)
  assert.equal(findWatch(list, 'Cloak of Flames', 2), null)
})

test('WTS and WTB alert independently; a watch with neither only watches', () => {
  const sale = offer([1, 'sell', 'Fleeting Quiver'], 19000)
  const want = offer([2, 'buy', 'Fleeting Quiver'], null)
  const both = watch({ item: 'Fleeting Quiver', wts: true, wtb: true })
  assert.equal(watchAlerts(both, sale), true)
  assert.equal(watchAlerts(both, want), true)
  assert.equal(watchAlerts(watch({ item: 'Fleeting Quiver', wts: true }), want), false)
  assert.equal(watchAlerts(watch({ item: 'Fleeting Quiver', wtb: true }), sale), false)
  assert.equal(watchAlerts(watch({ item: 'Fleeting Quiver' }), sale), false)
  // Another tier is another item, unless the watch is every tier.
  assert.equal(watchAlerts(watch({ item: 'Bone-Clasped Girdle', tier: 4, wtb: true }), offer([1, 'buy', 'Bone-Clasped Girdle', 3], 9000)), false)
  assert.equal(watchAlerts(watch({ item: 'Bone-Clasped Girdle', wtb: true }), offer([1, 'buy', 'Bone-Clasped Girdle', 3], 9000)), true)
})

test('the bazaarWatch signal declares the tokens it fills, and they fill a phrase', () => {
  assert.deepEqual(captureNamesIn({ type: 'app', signal: 'bazaarWatch' }), [...APP_SIGNAL_CAPTURES.bazaarWatch])
  assert.deepEqual(captureNamesIn({ type: 'app', signal: 'bossDefeat' }), [])
  const caps = watchAlertCaptures(offer([1, 'sell', 'Fleeting Quiver', 4], 18000))
  assert.deepEqual(Object.keys(caps), [...APP_SIGNAL_CAPTURES.bazaarWatch])
  assert.equal(applyCaptures('{item} {what}', caps), 'Fleeting Quiver +4 for sale')
  assert.equal(applyCaptures('{offer}', caps), 'Leric WTS Fleeting Quiver +4 18k')
  assert.equal(applyCaptures('{seller} wants {item} at {price}', watchAlertCaptures(offer([1, 'buy', 'Rain Caller'], null))), 'Leric wants Rain Caller at no price')
})

test('the first snapshot is a baseline; later live offers alert once', () => {
  const list = { entries: [watch({ item: 'Fleeting Quiver', wts: true })] }
  const snap: BazaarSnap = { rows: [], live: [offer([5, 'sell', 'Fleeting Quiver'], 15000)] }
  assert.deepEqual(freshWatchAlerts(snap, list, null), { newest: 5, alerts: [] })
  const later: BazaarSnap = { rows: [], live: [...(snap.live ?? []), offer([6, 'sell', 'Fleeting Quiver'], 18000), offer([7, 'sell', 'Rain Caller'], 1)] }
  const fresh = freshWatchAlerts(later, list, 5)
  assert.equal(fresh.newest, 7)
  assert.deepEqual(
    fresh.alerts.map((a) => a.text),
    ['Leric WTS Fleeting Quiver 18k']
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
