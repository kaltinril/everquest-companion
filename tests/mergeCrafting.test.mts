// The `crafting` module across an archived log and the live one
// (src/shared/logArchive/mergeCrafting.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CRAFT_SPAN_CAP, CRAFT_SPAN_GAP_MS, type CraftedItemRow, type CraftingSnap, type CraftSpan } from '../src/shared/crafting'
import { mergeCrafting } from '../src/shared/logArchive/mergeCrafting'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { CAPTURED_MODULES } from '../src/shared/logArchive/modules'

const EMPTY: CraftingSnap = { items: [], levels: [], spans: [], bought: [], sold: [], depot: [] }

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

const span = (start: number, end: number, over: Partial<CraftSpan> = {}): CraftSpan => ({ start, end, combines: 1, made: 1, failed: 0, raises: {}, ...over })

const ARCHIVED: CraftingSnap = {
  items: [
    item('Gold Malachite Bracelet', {
      made: 60,
      failed: 20,
      trivial: 0,
      raises: 25,
      firstRaise: 114,
      lastRaise: 138,
      tradeskill: 'Jewelry Making',
      firstTs: 100,
      lastTs: 900,
      sessionMade: 60,
      sessionFailed: 20,
      sessionRaises: 25
    }),
    item('Silver Malachite Ring', { made: 12, failed: 4, trivial: 9, trivialTs: 400, firstTs: 50, lastTs: 400, sessionMade: 3 })
  ],
  levels: [{ skill: 'Jewelry Making', value: 138, firstValue: 2, firstTs: 50, firstItem: 'Silver Malachite Ring', firstInSession: true }],
  spans: [span(100, 900, { combines: 96, made: 72, failed: 24, raises: { 'Jewelry Making': 25 } })],
  bought: [
    { item: 'Gold Bar', qty: 40, copper: 420_000, lastQty: 20, lastCopper: 210_000, merchant: 'Jeweler Anvo', zone: 'The Feerrott', ts: 90 },
    { item: 'Malachite', qty: 5, copper: 500, lastQty: 5, lastCopper: 500, merchant: 'Jeweler Anvo', ts: 80 }
  ],
  sold: [{ item: 'Gold Malachite Bracelet', lines: 60, copper: 600_000, lastCopper: 10_000, merchant: 'Jeweler Anvo', ts: 950 }],
  depot: [
    { item: 'Malachite', left: 68, ts: 900 },
    { item: 'Ruby', left: 54, ts: 700 }
  ]
}

const DAY = 86_400_000

const LIVE: CraftingSnap = {
  items: [
    item('Golden Ruby Ring', { made: 2, failed: 1, raises: 2, firstRaise: 206, lastRaise: 207, tradeskill: 'Jewelry Making', firstTs: DAY, lastTs: DAY + 60, sessionMade: 2, sessionFailed: 1, sessionRaises: 2 }),
    item('Gold Malachite Bracelet', { made: 32, failed: 9, trivial: 4, trivialTs: DAY + 500, raises: 8, firstRaise: 139, lastRaise: 146, firstTs: DAY + 100, lastTs: DAY + 500, sessionMade: 5 })
  ],
  levels: [{ skill: 'Jewelry Making', value: 207, firstValue: 139, firstTs: DAY + 100, firstItem: 'Gold Malachite Bracelet' }],
  spans: [span(DAY, DAY + 500, { combines: 44, made: 34, failed: 10, raises: { 'Jewelry Making': 10 } })],
  bought: [{ item: 'Gold Bar', qty: 2, copper: 22_000, lastQty: 2, lastCopper: 22_000, merchant: 'Jeweler Bex', ts: DAY }],
  sold: [{ item: 'Gold Malachite Bracelet', lines: 30, copper: 310_000, lastCopper: 10_500, merchant: 'Jeweler Bex', ts: DAY + 600 }],
  depot: [{ item: 'Malachite', left: 27, ts: DAY + 500 }]
}

const merged = (older: CraftingSnap, newer: CraftingSnap): CraftingSnap => {
  const out = mergeCrafting(older, newer)
  assert.ok(out !== null)
  return out
}

test('an item both logs combined adds its counts and keeps the newer session', () => {
  const row = merged(ARCHIVED, LIVE).items[0]
  assert.deepEqual(
    row,
    item('Gold Malachite Bracelet', {
      made: 92,
      failed: 29,
      trivial: 4,
      trivialTs: DAY + 500,
      raises: 33,
      // The first raise is the older log's, the newest the newer log's.
      firstRaise: 114,
      lastRaise: 146,
      // The newer log saw no raise name it; the older log's word stands.
      tradeskill: 'Jewelry Making',
      firstTs: 100,
      lastTs: DAY + 500,
      sessionMade: 5,
      sessionFailed: 0,
      sessionRaises: 0
    })
  )
})

test('an item only the older log combined is carried with no session; a new one is kept', () => {
  const rows = merged(ARCHIVED, LIVE).items
  assert.deepEqual(rows.map((r) => r.item), ['Gold Malachite Bracelet', 'Silver Malachite Ring', 'Golden Ruby Ring'])
  assert.deepEqual(rows[1], item('Silver Malachite Ring', { made: 12, failed: 4, trivial: 9, trivialTs: 400, firstTs: 50, lastTs: 400 }))
  assert.deepEqual(rows[2], LIVE.items[0])
})

test('by-products add, and a row neither log saw one on carries no count', () => {
  const older = { ...EMPTY, items: [item('Bog Juice', { failed: 3, byProducts: 3 }), item('Short Beer', { made: 1, byProducts: 1 }), item('Mead', { made: 2 })] }
  const newer = { ...EMPTY, items: [item('Bog Juice', { failed: 1, byProducts: 1 }), item('Mead', { made: 1 }), item('Short Ale', { failed: 2, byProducts: 2 })] }
  const rows = merged(older, newer).items
  assert.deepEqual(rows.map((r) => [r.item, r.byProducts]), [['Bog Juice', 4], ['Short Beer', 1], ['Mead', undefined], ['Short Ale', 2]])
  assert.equal('byProducts' in rows[2], false)
  // A log folded before the count existed has none to add.
  const before = { ...EMPTY, items: [item('Bog Juice', { failed: 3 })] }
  assert.equal(merged(before, newer).items[0].byProducts, 1)
})

test('money adds, and the last price, merchant and zone are the newer purchase', () => {
  const out = merged(ARCHIVED, LIVE)
  assert.deepEqual(out.bought, [
    // The newer purchase stated no zone, so none is claimed for it.
    { item: 'Gold Bar', qty: 42, copper: 442_000, lastQty: 2, lastCopper: 22_000, merchant: 'Jeweler Bex', ts: DAY },
    ARCHIVED.bought[1]
  ])
  assert.deepEqual(out.sold, [{ item: 'Gold Malachite Bracelet', lines: 90, copper: 910_000, lastCopper: 10_500, merchant: 'Jeweler Bex', ts: DAY + 600 }])
})

test('depot stock is the newer count; an item only the older log drew keeps its own', () => {
  assert.deepEqual(merged(ARCHIVED, LIVE).depot, [
    { item: 'Malachite', left: 27, ts: DAY + 500 },
    { item: 'Ruby', left: 54, ts: 700 }
  ])
})

test('the level is the newer log and the first line the older, for the next join', () => {
  assert.deepEqual(merged(ARCHIVED, LIVE).levels, [{ skill: 'Jewelry Making', value: 207, firstValue: 2, firstTs: 50, firstItem: 'Silver Malachite Ring' }])
})

test('spans follow one another, and stay apart when the logs are', () => {
  const out = merged(ARCHIVED, LIVE)
  assert.deepEqual(out.spans, [...ARCHIVED.spans, ...LIVE.spans])
  assert.equal('olderSpans' in out, false)
})

test('a run of combines the archive cut in two is one span again', () => {
  const older = { ...EMPTY, spans: [span(0, 10), span(1000, 2000, { combines: 5, made: 4, failed: 1, raises: { Baking: 2 } })] }
  const newer = { ...EMPTY, spans: [span(2000 + CRAFT_SPAN_GAP_MS, 400_000, { combines: 3, made: 3, raises: { Baking: 1, Brewing: 1 } }), span(900_000, 900_500)] }
  assert.deepEqual(merged(older, newer).spans, [
    span(0, 10),
    span(1000, 400_000, { combines: 8, made: 7, failed: 1, raises: { Baking: 3, Brewing: 1 } }),
    span(900_000, 900_500)
  ])
  // One millisecond more and they are two spans.
  const apart = { ...EMPTY, spans: [span(2001 + CRAFT_SPAN_GAP_MS, 400_000)] }
  assert.equal(merged(older, apart).spans.length, 3)
})

test('spans past the cap are summed, oldest first', () => {
  const HOUR = 3_600_000
  const run = (from: number, n: number): CraftSpan[] =>
    Array.from({ length: n }, (_, i) => span((from + i) * HOUR, (from + i) * HOUR + 60_000, { combines: 2, made: 1, failed: 1, raises: { Baking: 1 } }))
  const out = merged({ ...EMPTY, spans: run(0, 3) }, { ...EMPTY, spans: run(10, CRAFT_SPAN_CAP - 1) })
  assert.equal(out.spans.length, CRAFT_SPAN_CAP)
  assert.equal(out.spans[0].start, 2 * HOUR)
  assert.deepEqual(out.olderSpans, {
    spans: 2,
    ms: 120_000,
    combines: 4,
    made: 2,
    failed: 2,
    bySkill: { Baking: { spans: 2, ms: 120_000, combines: 4, raises: 2 } }
  })
  // A newer log that already summed spans of its own puts every older span behind them.
  const again = merged({ ...EMPTY, spans: run(0, 3) }, out)
  assert.equal(again.spans.length, CRAFT_SPAN_CAP)
  assert.equal(again.olderSpans?.spans, 5)
  assert.deepEqual(again.olderSpans?.bySkill, { Baking: { spans: 5, ms: 300_000, combines: 10, raises: 5 } })
})

test("a newer log's first line that restated the older level is not a raise", () => {
  // The older log ended at 146; the newer log's first Jewelry Making line said 146 again.
  const older: CraftingSnap = { ...EMPTY, levels: [{ skill: 'Jewelry Making', value: 146, firstValue: 2, firstTs: 5 }] }
  const newer: CraftingSnap = {
    ...EMPTY,
    items: [
      item('Gold Malachite Bracelet', { made: 3, raises: 1, firstRaise: 146, lastRaise: 146, tradeskill: 'Jewelry Making', firstTs: DAY, lastTs: DAY + 9, sessionMade: 3, sessionRaises: 1 }),
      item('Golden Ruby Ring', { made: 1, raises: 2, firstRaise: 147, lastRaise: 148, tradeskill: 'Jewelry Making', firstTs: DAY, lastTs: DAY + 9, sessionRaises: 2 })
    ],
    levels: [{ skill: 'Jewelry Making', value: 148, firstValue: 146, firstTs: DAY + 3, firstItem: 'Gold Malachite Bracelet', firstInSession: true }],
    spans: [span(DAY, DAY + 9, { combines: 4, made: 4, raises: { 'Jewelry Making': 3 } })]
  }
  const out = merged(older, newer)
  assert.deepEqual(out.items[0], item('Gold Malachite Bracelet', { made: 3, tradeskill: 'Jewelry Making', firstTs: DAY, lastTs: DAY + 9, sessionMade: 3 }))
  assert.deepEqual(out.items[1], newer.items[1])
  assert.deepEqual(out.spans[0].raises, { 'Jewelry Making': 2 })
  // A real raise from 146 to 147 on the first line stays counted.
  const real = { ...newer, levels: [{ ...newer.levels[0], firstValue: 147 }] }
  assert.equal(merged(older, real).items[0].raises, 1)
  // With an offline gap since, the session never counted that line.
  const later = { ...newer, levels: [{ skill: 'Jewelry Making', value: 148, firstValue: 146, firstTs: DAY + 3, firstItem: 'Gold Malachite Bracelet' }] }
  assert.equal(merged(older, later).items[0].sessionRaises, 1)
})

const NO_FISH = { casts: 0, caught: 0, nothing: 0, lostBait: 0, spilled: 0, poleBroke: 0 }

test('fishing and forage: counts add, the session is the newer log, an item keeps its later time', () => {
  const older: CraftingSnap = {
    ...EMPTY,
    fishing: {
      casts: 72, caught: 33, nothing: 35, lostBait: 2, spilled: 8, poleBroke: 0,
      session: { casts: 9, caught: 4, nothing: 5, lostBait: 0, spilled: 1, poleBroke: 0 },
      items: [{ item: 'Fresh Fish', count: 20, lastTs: 500 }, { item: 'Fish Scales', count: 6, lastTs: 400 }]
    },
    forage: { found: 659, failed: 659, session: { found: 12, failed: 10 }, items: [{ item: 'Roots', count: 300, lastTs: 600 }, { item: 'Berries', count: 359, lastTs: 550 }] }
  }
  const newer: CraftingSnap = {
    ...EMPTY,
    fishing: {
      casts: 131, caught: 64, nothing: 62, lostBait: 4, spilled: 16, poleBroke: 2,
      session: { casts: 3, caught: 1, nothing: 2, lostBait: 0, spilled: 0, poleBroke: 1 },
      items: [{ item: 'Rusty Dagger', count: 9, lastTs: DAY + 5 }, { item: 'Fresh Fish', count: 28, lastTs: DAY + 9 }]
    },
    forage: { found: 550, failed: 588, session: { found: 0, failed: 0 }, items: [{ item: 'Roots', count: 78, lastTs: DAY }] }
  }
  const out = merged(older, newer)
  assert.deepEqual(out.fishing, {
    casts: 203, caught: 97, nothing: 97, lostBait: 6, spilled: 24, poleBroke: 2,
    session: newer.fishing?.session,
    // The older log's rows in their order, then the newer log's new names.
    items: [{ item: 'Fresh Fish', count: 48, lastTs: DAY + 9 }, { item: 'Fish Scales', count: 6, lastTs: 400 }, { item: 'Rusty Dagger', count: 9, lastTs: DAY + 5 }]
  })
  assert.deepEqual(out.forage, {
    found: 1209, failed: 1247,
    session: { found: 0, failed: 0 },
    items: [{ item: 'Roots', count: 378, lastTs: DAY }, { item: 'Berries', count: 359, lastTs: 550 }]
  })
})

test('a log with no fishing or forage of its own leaves the other log its counts and no session', () => {
  const fished: CraftingSnap = {
    ...EMPTY,
    fishing: { casts: 3, caught: 1, nothing: 1, lostBait: 0, spilled: 0, poleBroke: 0, session: { ...NO_FISH, casts: 3, caught: 1, nothing: 1 }, items: [{ item: 'Fresh Fish', count: 1, lastTs: 9 }] }
  }
  // Archived fishing under a live log that has none: the session there is over.
  const carried = merged(fished, EMPTY)
  assert.deepEqual(carried.fishing, { casts: 3, caught: 1, nothing: 1, lostBait: 0, spilled: 0, poleBroke: 0, session: NO_FISH, items: fished.fishing?.items })
  assert.equal('forage' in carried, false)
  // An archive folded before the engine counted fishing: the live log's stands as it is.
  assert.deepEqual(merged(EMPTY, fished).fishing, fished.fishing)
  // Neither log: no key at all.
  assert.equal('fishing' in merged(EMPTY, EMPTY), false)
  // The empty template mergeModule tests a shape with ({} for an object) reads as zeros.
  assert.equal(mergeModule('crafting', [fished], { ...EMPTY, fishing: fished.fishing }).used, 1)
  assert.equal((mergeModule('crafting', [fished], fished).state as CraftingSnap).fishing?.casts, 6)
})

test('a state of another shape is not joined', () => {
  assert.equal(mergeCrafting({ rows: [] }, LIVE), null)
  assert.equal(mergeCrafting(ARCHIVED, null), null)
  assert.equal(mergeCrafting({ ...ARCHIVED, items: [{ made: 1 }] }, LIVE), null)
})

test('the rule is registered and the module is captured', () => {
  assert.ok(hasMergeRule('crafting'))
  assert.ok(CAPTURED_MODULES.includes('crafting'))
  const out = mergeModule('crafting', [ARCHIVED], LIVE)
  assert.equal(out.used, 1)
  assert.equal((out.state as CraftingSnap).items[0].made, 92)
  // The empty template mergeModule tests a shape with, summed spans included, passes.
  const withFolded = { ...LIVE, olderSpans: { spans: 1, ms: 10, combines: 2, made: 2, failed: 0, bySkill: {} } }
  assert.equal(mergeModule('crafting', [ARCHIVED], withFolded).used, 1)
  assert.equal(mergeModule('crafting', [ARCHIVED], EMPTY).used, 1)
})
