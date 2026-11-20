// The Bazaar watchlist and its alerts (src/shared/bazaarWatch.ts), and the tab's Popular, price
// floor and keep filters (src/shared/bazaar.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlat, formatPlatExact, parsePlat, platFieldCommit, summarizeBazaar, type BazaarRow, type BazaarSnap, type LiveOffer } from '../src/shared/bazaar'
import {
  findWatch,
  freshWatchAlerts,
  normalizeBazaarWatchlist,
  removeWatch,
  setWatch,
  watchAlertCaptures,
  watchAlertReason,
  watchChipLabel,
  watchOnItem,
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

// Bug hunt, 2026-11-19: a +4 watch with only WTB ticked silenced the every-tier watch's WTS on +4.
test("an every-tier watch still alerts on the side a tier's own watch leaves off", () => {
  const list = {
    entries: [watch({ item: 'Fleeting Quiver', tier: 4, wtb: true }), watch({ item: 'Fleeting Quiver', wts: true, wtsMax: 5000 })]
  }
  const snap: BazaarSnap = { rows: [], live: [offer([2, 'sell', 'Fleeting Quiver', 4], 3000), offer([3, 'buy', 'Fleeting Quiver', 4], null), offer([4, 'buy', 'Fleeting Quiver', 2], null)] }
  assert.deepEqual(
    freshWatchAlerts(snap, list, 1).alerts.map((a) => a.text),
    // The +2 buyer is on no watch's WTB: the every-tier watch has it off and the +4 one is another tier.
    ['Leric WTS Fleeting Quiver +4 3k (at or under your 5k)', 'Leric WTB Fleeting Quiver +4 (on your watchlist)']
  )
})

test("a tier's own price still decides on the side it has on", () => {
  const list = {
    entries: [watch({ item: 'Fleeting Quiver', wts: true, wtsMax: 20000 }), watch({ item: 'Fleeting Quiver', tier: 0, wts: true, wtsMax: 5000 })]
  }
  const snap: BazaarSnap = { rows: [], live: [offer([2, 'sell', 'Fleeting Quiver', 0], 10000), offer([3, 'sell', 'Fleeting Quiver', 2], 10000)] }
  assert.deepEqual(
    freshWatchAlerts(snap, list, 1).alerts.map((a) => a.text),
    ['Leric WTS Fleeting Quiver +2 10k (at or under your 20k)']
  )
  // A tier watched with neither box ticked mutes nothing: the every-tier watch still alerts there.
  const quiet = { entries: [watch({ item: 'Fleeting Quiver', tier: 4 }), watch({ item: 'Fleeting Quiver', wts: true })] }
  const sale: BazaarSnap = { rows: [], live: [offer([2, 'sell', 'Fleeting Quiver', 4], 3000)] }
  assert.equal(freshWatchAlerts(sale, quiet, 1).alerts.length, 1)
  // With no every-tier watch, a tier's own watch with the side off stays silent.
  assert.deepEqual(freshWatchAlerts(sale, { entries: [watch({ item: 'Fleeting Quiver', tier: 4, wtb: true })] }, 1).alerts, [])
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

test('a price typed with thousands commas reads as that price, and a misplaced comma reads as nothing', () => {
  assert.equal(parsePlat('12,500'), 12_500)
  assert.equal(parsePlat('1,500pp'), 1500)
  assert.equal(parsePlat('1,500,000'), 1_500_000)
  assert.equal(parsePlat('2,500k'), 2_500_000)
  assert.equal(parsePlat(' 12,500.5 p '), 12_500.5)
  for (const bad of ['1,50', '12,5000', '1,,500', ',500', '1500,', '1234,567', '1 500', 'abc']) assert.equal(parsePlat(bad), null, bad)
})

test('leaving a price field: blank clears the price, a price is stored, and a typo stores nothing', () => {
  assert.equal(platFieldCommit(''), null)
  assert.equal(platFieldCommit('   '), null)
  assert.equal(platFieldCommit('12,500'), 12_500)
  assert.equal(platFieldCommit('12.5k'), 12_500)
  // Before 2026-11-19 these stored "any price" while the field still showed the text, so every offer alerted.
  for (const typo of ['abc', '1 500', '1,50', '0']) assert.equal(platFieldCommit(typo), undefined, typo)
})

test('a threshold is written in full, so typing what the field shows stores the same price', () => {
  const written: [number, string][] = [
    [0.5, '0.5p'],
    [2.5, '2.5p'],
    [999, '999p'],
    [1250, '1.25k'],
    [12_345, '12345p'],
    [12_500, '12.5k'],
    [20_000, '20k'],
    [1_250_000, '1.25M'],
    [1_234_567, '1234567p'],
    [12_000_000, '12M']
  ]
  for (const [pp, text] of written) {
    assert.equal(formatPlatExact(pp), text)
    assert.equal(parsePlat(text), pp)
  }
  // The table's short form is unchanged, and it is what a number no short text says in full falls to.
  assert.equal(formatPlat(12_500), '13k')
  assert.equal(formatPlatExact(10 / 3), '3p')
})

// Bug hunt, 2026-11-19: a 12,500 threshold was written "13k", so the alert named a price the player
// never set and a 13k offer looked as if it should have alerted.
test('an alert names the threshold the player typed, and an offer at it never reads above it', () => {
  const under = watch({ item: 'Fleeting Quiver', wts: true, wtsMax: 12_500 })
  assert.equal(watchAlertReason(under, offer([1, 'sell', 'Fleeting Quiver'], 12_400), null), 'at or under your 12.5k')
  const over = watch({ item: 'Fleeting Quiver', wtb: true, wtbMin: 1250 })
  assert.equal(watchAlertReason(over, offer([1, 'buy', 'Fleeting Quiver'], 1300), null), 'at or over your 1.25k')
  const snap: BazaarSnap = { rows: [], live: [offer([2, 'sell', 'Fleeting Quiver'], 12_500)] }
  assert.deepEqual(
    freshWatchAlerts(snap, { entries: [under] }, 1).alerts.map((a) => a.text),
    ['Leric WTS Fleeting Quiver 12.5k (at or under your 12.5k)']
  )
  assert.equal(watchAlertCaptures(offer([1, 'sell', 'Fleeting Quiver'], 12_345), 'on your watchlist').price, '12345p')
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

test('a row that stands for every tier shows the every-tier watch, whichever was written last', () => {
  // Before 2026-11-20 it showed the first watch in list order: the +4 one, while the every-tier one alerted.
  const tier4 = watch({ item: 'Fleeting Quiver', tier: 4, wtb: true })
  const every = watch({ item: 'Fleeting Quiver', tier: null, wts: true, wtsMax: 31000, wtb: true, wtbMin: 9500 })
  for (const order of [[tier4, every], [every, tier4]]) {
    let list = normalizeBazaarWatchlist(undefined)
    for (const w of order) list = setWatch(list, w)
    assert.deepEqual(watchOnItem(list, 'fleeting quiver'), every)
  }
  // With no every-tier watch the row still shows a tier's, and with none at all nothing.
  const only = setWatch(normalizeBazaarWatchlist(undefined), tier4)
  assert.deepEqual(watchOnItem(only, 'Fleeting Quiver'), tier4)
  assert.equal(watchOnItem(only, 'Cloak of Flames'), null)
})

test('the watch chip names every threshold that can alert: a price and a share of the median are joined by or', () => {
  const q = { item: 'Fleeting Quiver' }
  assert.equal(watchChipLabel(watch({ ...q, wts: true, wtsMax: 12500, wtsShare: 0.8 })), 'Watch: WTS ≤ 12.5k or 80% median')
  assert.equal(watchChipLabel(watch({ ...q, wts: true, wtsMax: 12500 })), 'Watch: WTS ≤ 12.5k')
  assert.equal(watchChipLabel(watch({ ...q, wts: true, wtsShare: 0.8 })), 'Watch: WTS ≤ 80% median')
  assert.equal(watchChipLabel(watch({ ...q, wts: true })), 'Watch: WTS')
  assert.equal(watchChipLabel(watch({ ...q, wts: true, wtsMax: 100, wtsShare: 0.8, wtb: true, wtbMin: 9500 })), 'Watch: WTS ≤ 100p or 80% median + WTB ≥ 9.5k')
  assert.equal(watchChipLabel(watch({ ...q, wtb: true })), 'Watch: WTB')
  // A side that is off is not named, whatever thresholds it still holds.
  assert.equal(watchChipLabel(watch({ ...q, wtsMax: 12500, wtsShare: 0.8 })), 'Watch')
})
