// The Bazaar watchlist and its alerts (src/shared/bazaarWatch.ts), and the tab's Popular, price
// floor and keep filters (src/shared/bazaar.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlat, parsePlat, summarizeBazaar, type BazaarRow, type BazaarSnap, type LiveOffer } from '../src/shared/bazaar'
import {
  findWatch,
  freshWatchAlerts,
  normalizeBazaarWatchlist,
  removeWatch,
  setWatch,
  watchAlertCaptures,
  watchAlertReason,
  weekMedianAsking,
  type BazaarWatch
} from '../src/shared/bazaarWatch'
import { APP_SIGNAL_CAPTURES, applyCaptures, captureNamesIn } from '../src/shared/alertCaptures'
import { afterLoad, replyGate } from '../src/renderer/src/features/bazaar/latestReply'

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

const watch = (w: Partial<BazaarWatch> & Pick<BazaarWatch, 'item'>): BazaarWatch => ({
  tier: null,
  wts: false,
  wtb: false,
  wtsMax: null,
  wtsShare: null,
  wtbMin: null,
  ...w
})
const none = { wtsMax: null, wtsShare: null, wtbMin: null }

test('a stored watchlist is read defensively and never throws', () => {
  assert.deepEqual(normalizeBazaarWatchlist(undefined), { entries: [] })
  assert.deepEqual(normalizeBazaarWatchlist({ entries: 'no' }), { entries: [] })
  const list = normalizeBazaarWatchlist({
    entries: [
      { item: 'Fleeting Quiver', tier: null, wts: true, wtb: true, wtsMax: 20000, wtsShare: 1.5, wtbMin: 30000 },
      { item: 'fleeting quiver', tier: null, wts: false },
      { item: '', wts: true },
      { item: 'Cloak of Flames', tier: 4, wtb: 'yes', wtbMin: -3 },
      { item: 'Rain Caller', tier: 99 }
    ]
  })
  assert.deepEqual(list.entries, [
    // Both at once; a share over 100% is 100%; the repeat of the same item and tier is dropped.
    { item: 'Fleeting Quiver', tier: null, wts: true, wtb: true, wtsMax: 20000, wtsShare: 1, wtbMin: 30000 },
    // Only `true` is on, a negative price is no price, and an impossible tier is every tier.
    { item: 'Cloak of Flames', tier: 4, wts: false, wtb: false, ...none },
    { item: 'Rain Caller', tier: null, wts: false, wtb: false, ...none }
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
    // The price and the median share stay with the side they belonged to.
    { item: 'A', tier: null, wts: true, wtb: false, wtsMax: 20000, wtsShare: 0.8, wtbMin: null },
    { item: 'B', tier: null, wts: false, wtb: true, ...none },
    { item: 'C', tier: null, wts: false, wtb: false, ...none },
    { item: 'D', tier: 2, wts: false, wtb: false, ...none }
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
  assert.equal(watchAlertReason(both, sale, null), 'on your watchlist')
  assert.equal(watchAlertReason(both, want, null), 'on your watchlist')
  assert.equal(watchAlertReason(watch({ item: 'Fleeting Quiver', wts: true }), want, null), null)
  assert.equal(watchAlertReason(watch({ item: 'Fleeting Quiver', wtb: true }), sale, null), null)
  assert.equal(watchAlertReason(watch({ item: 'Fleeting Quiver' }), sale, null), null)
  // Another tier is another item, unless the watch is every tier.
  assert.equal(watchAlertReason(watch({ item: 'Bone-Clasped Girdle', tier: 4, wtb: true }), offer([1, 'buy', 'Bone-Clasped Girdle', 3], 9000), null), null)
  assert.ok(watchAlertReason(watch({ item: 'Bone-Clasped Girdle', wtb: true }), offer([1, 'buy', 'Bone-Clasped Girdle', 3], 9000), null))
})

test('WTS: a sale at or under the price, or under a share of the 7-day median', () => {
  const w = watch({ item: 'Fleeting Quiver', wts: true, wtsMax: 20000 })
  assert.match(watchAlertReason(w, offer([1, 'sell', 'Fleeting Quiver'], 19000), null) ?? '', /under your 20k/)
  assert.equal(watchAlertReason(w, offer([1, 'sell', 'Fleeting Quiver'], 21000), null), null)
  // An unpriced sale cannot be judged against a price.
  assert.equal(watchAlertReason(w, offer([1, 'sell', 'Fleeting Quiver'], null), null), null)
  const share = watch({ item: 'Fleeting Quiver', wts: true, wtsShare: 0.8 })
  assert.match(watchAlertReason(share, offer([1, 'sell', 'Fleeting Quiver'], 16000), 22000) ?? '', /73% of the 7-day median 22k/)
  assert.equal(watchAlertReason(share, offer([1, 'sell', 'Fleeting Quiver'], 19000), 22000), null)
})

test('WTB: a buyer at or over the price, or one who names none', () => {
  const w = watch({ item: 'Bone-Clasped Girdle', tier: 4, wtb: true, wtbMin: 8000 })
  assert.match(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 4], 9000), null) ?? '', /over your 8k/)
  assert.equal(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 4], 5000), null), null)
  assert.equal(watchAlertReason(w, offer([1, 'buy', 'Bone-Clasped Girdle', 4], null), null), 'no price stated')
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

test('the bazaarWatch signal declares the tokens it fills, and they fill a phrase', () => {
  assert.deepEqual(captureNamesIn({ type: 'app', signal: 'bazaarWatch' }), [...APP_SIGNAL_CAPTURES.bazaarWatch])
  assert.deepEqual(captureNamesIn({ type: 'app', signal: 'bossDefeat' }), [])
  const caps = watchAlertCaptures(offer([1, 'sell', 'Fleeting Quiver', 4], 18000), 'at or under your 20k')
  assert.deepEqual(Object.keys(caps), [...APP_SIGNAL_CAPTURES.bazaarWatch])
  assert.equal(applyCaptures('{item} {what}', caps), 'Fleeting Quiver +4 for sale')
  assert.equal(applyCaptures('{offer} - {why}', caps), 'Leric WTS Fleeting Quiver +4 18k - at or under your 20k')
  assert.equal(applyCaptures('{seller} wants {item} at {price}', watchAlertCaptures(offer([1, 'buy', 'Rain Caller'], null), 'no price stated')), 'Leric wants Rain Caller at no price')
})

test('the first snapshot is a baseline; later live offers alert once', () => {
  const list = { entries: [watch({ item: 'Fleeting Quiver', wts: true, wtsMax: 20000 })] }
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

test('a watch price reads what the field shows it as, millions included, so a threshold survives the field', () => {
  assert.equal(parsePlat('1.5M'), 1_500_000)
  assert.equal(parsePlat('2m'), 2_000_000)
  assert.equal(parsePlat('2.5k'), 2500)
  assert.equal(parsePlat('500pp'), 500)
  assert.equal(parsePlat(''), null)
  for (const pp of [500, 2500, 15_000, 1_500_000, 12_000_000]) assert.equal(parsePlat(formatPlat(pp)), pp)
})

test('a store reply lands only while its write is the newest, and the first load only before any write', () => {
  // "Every tier" removes and puts back-to-back; the median share field puts on every keystroke.
  const g = replyGate()
  const first = g.next()
  const second = g.next()
  assert.equal(g.isLatest(first), false, 'the earlier reply, landing late, must not put the older list back')
  assert.equal(g.isLatest(second), true)
  assert.equal(g.isLatest(0), false, 'an edit made while the load was out is not overwritten by it')
  assert.equal(replyGate().isLatest(0), true, 'with nothing written, the load lands')
})

test('an edit made before the first load answers waits for it, so it lands on the stored list', async () => {
  let answer!: (stored: string[]) => void
  let list: string[] = []
  const load = new Promise<string[]>((r) => (answer = r)).then((stored) => {
    list = stored
  })
  const run = afterLoad(load)
  run(() => (list = [...list, 'Cloak of Flames']))
  assert.deepEqual(list, [], 'nothing is written on the empty list while the load is out')
  answer(['Fungus Covered Scale Tunic'])
  await load
  await Promise.resolve()
  assert.deepEqual(list, ['Fungus Covered Scale Tunic', 'Cloak of Flames'])
  run(() => (list = [...list, 'Robe of the Oracle']))
  assert.equal(list.length, 3, 'once loaded, an edit applies at once')
})
