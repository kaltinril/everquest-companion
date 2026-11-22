// Append frames keep a window's loot rows alive across pickups (shared/lootFrame.ts): the rows a
// read delivered are the rows the next append is joined to. So a reader that wrote to a row, or
// sorted the ledger in place, would no longer be undone by the next read: it would be the ledger.
// Every reader of the loot module's array runs here over a deep-frozen ledger, where any such write
// throws, and must answer exactly what it answers over a plain copy.
//
// Not run here, read by hand on 2026-11-21 and found read-only: `recentDistinct`
// (useNotablePickups), `deriveLootNames` (useProgress), `tallyDroppedBy` (ItemDetailDialog), the
// `history.filter(isKept)` in gearData. `useLootRows` spreads each row into its own object, so
// `filterLootEvents` and `groupLootRows` never hold a ledger row.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GapRow } from '../src/shared/gaps'
import type { LootEvent } from '../src/shared/types'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import { attributeSales } from '../src/shared/coinAttribution'
import { dropGaps, lootedItemNames } from '../src/shared/gapDrops'
import { heldSince } from '../src/shared/gapHeld'
import { imageGaps } from '../src/shared/gapImages'
import { groupGaps } from '../src/shared/gapGroups'
import { joinCharacters } from '../src/shared/gapsAllCharacters'
import { itemZoneRows, windowItemRows, windowLootTotals } from '../src/shared/lootRates'
import { ledgerSpan, sliceLedger } from '../src/shared/lootSlice'
import { metItemNames, metMobNames } from '../src/shared/metNames'
import { mobLoot } from '../src/shared/mobLoot'
import { dropsSeen, itemFacts, mobFacts, stillNeeded, wikiPageText } from '../src/shared/wikiPage'
import { zoneExtras, zoneHistory } from '../src/shared/zoneHistory'
import { rangeStats } from '../src/shared/progressionStats'
import { resolveSlice } from '../src/shared/timeslice'
import { normalizeXpRows } from '../src/shared/xpOverlay'
import { buildDropRows } from '../src/renderer/src/features/overview/overviewData'
import {
  computeHeldCounts,
  computeHeldCountsAfter,
  computeHeldCountsAfterPerKey,
  computeLastLootedAt,
  computeLogOnlyCounts
} from '../src/renderer/src/features/posky/heldCounts'
import { dataBounds } from '../src/renderer/src/features/leveling/zoneBands'
import { xpOverlayView } from '../src/renderer/src/overlay/xpRows'

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.parse('Sat Aug 01 12:00:00 2026')

/** One row of every shape the ledger holds, out of the ordinary order of names on purpose. */
const LEDGER: LootEvent[] = [
  { ts: T0 + MIN, item: 'Zombie Skin', source: 'a skeleton', zone: 'Befallen' },
  { ts: T0 + 2 * MIN, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen', count: 3 },
  { ts: T0 + 3 * MIN, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen', disposition: 'sold' },
  { ts: T0 + 4 * MIN, item: 'Mote of Ferocity', source: 'a ghoul', zone: 'Befallen' },
  { ts: T0 + 5 * MIN, item: 'Fragment of Potential', source: 'a ghoul', zone: 'Befallen', disposition: 'currency', count: 2 },
  { ts: T0 + 6 * MIN, item: 'Rusty Dagger', zone: 'Befallen', disposition: 'hoard' },
  { ts: T0 + 7 * MIN, item: 'Rusty Dagger', zone: 'Befallen', disposition: 'depot' },
  { ts: T0 + 8 * MIN, item: 'Rusty Dagger', zone: 'Befallen', disposition: 'destroyed' },
  { ts: T0 + 9 * MIN, item: 'Ruby', source: 'a ghoul', zone: 'Befallen', disposition: 'combined', created: 'Ruby +1' }
]

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const child of Object.values(v)) deepFreeze(child)
    Object.freeze(v)
  }
  return v
}

function progression(): ProgressionSnap {
  return {
    expTs: [T0 + MIN], expPct: [1], expFlag: [0],
    killTs: [T0 + MIN], killZone: [0], killCredit: [0],
    witnessTs: [], recentKills: [], lootTs: [],
    zoneStart: [T0], zoneEnd: [T0 + HOUR], zoneName: ['Befallen'],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [T0], levelValue: [20], aaGainTs: [], aaGainAmount: [],
    coinTs: [T0 + 4 * MIN, T0 + 10 * MIN], coinCopper: [100, 50], coinSold: ['Bone Chips', ''],
    lastTs: T0 + HOUR, windowStart: T0, dropped: 0
  } as ProgressionSnap
}

const CATALOG = [{ name: 'a skeleton', page: 'A skeleton', zones: ['Befallen'], drops: ['Bone Chips'] }]
const ITEM_ROW = { domain: 'item', name: 'Bone Chips', kinds: ['loot'], count: 1, first: '', last: '', details: { samples: [] } } as unknown as GapRow
const MOB_ROW = { ...ITEM_ROW, domain: 'mob', name: 'a skeleton' } as unknown as GapRow
const KILLS = { 'a skeleton': { n: 2 } } as never

/** Every reader, by name. Each is handed the ledger and answers something comparable. */
const READERS: Record<string, (loot: LootEvent[]) => unknown> = {
  attributeSales: (l) => attributeSales(progression(), l),
  dropGaps: (l) => dropGaps(l, CATALOG, {}),
  lootedItemNames,
  heldSince: (l) => heldSince(l, T0 + 2 * MIN),
  imageGaps: (l) => imageGaps({}, l, CATALOG),
  groupGaps: (l) => groupGaps([ITEM_ROW], l),
  'joinCharacters, one': (l) => joinCharacters([{ label: 'a', gaps: null, loot: l, kills: null }], null).loot,
  'joinCharacters, two': (l) =>
    joinCharacters([{ label: 'a', gaps: null, loot: l, kills: null }, { label: 'b', gaps: null, loot: l, kills: null }], null).loot,
  ledgerSpan,
  sliceLedger: (l) => {
    const snap = progression()
    return sliceLedger(l, resolveSlice({ snap, bounds: dataBounds(snap, []), id: 'all' }), ledgerSpan(l))
  },
  metItemNames,
  metMobNames: (l) => metMobNames(null, l, null),
  mobLoot: (l) => mobLoot(MOB_ROW, l),
  dropsSeen: (l) => dropsSeen('Bone Chips', l),
  itemFacts: (l) => itemFacts(ITEM_ROW, l),
  mobFacts: (l) => mobFacts(MOB_ROW, l, KILLS),
  wikiPageText: (l) => [wikiPageText(ITEM_ROW, l, KILLS), wikiPageText(MOB_ROW, l, KILLS)],
  stillNeeded: (l) => [stillNeeded(ITEM_ROW, l, KILLS), stillNeeded(MOB_ROW, l, KILLS)],
  windowLootTotals: (l) => windowLootTotals({ events: l, t0: T0, t1: T0 + HOUR }),
  windowItemRows: (l) => {
    const snap = progression()
    const spans = rangeStats({ snap, range: { t0: T0, t1: T0 + HOUR } })
    return windowItemRows({ events: l, t0: T0, t1: T0 + HOUR, spans })
  },
  itemZoneRows: (l) => {
    const snap = progression()
    return itemZoneRows({ events: l, zones: rangeStats({ snap, range: { t0: T0, t1: T0 + HOUR } }).zones })
  },
  zoneExtras: (l) => [...zoneExtras(progression(), l, { t0: T0, t1: T0 + HOUR })],
  zoneHistory: (l) => zoneHistory({ snap: progression(), loot: l, level: 20 }),
  computeHeldCounts,
  computeHeldCountsAfter: (l) => computeHeldCountsAfter(l, T0 + 2 * MIN),
  computeHeldCountsAfterPerKey: (l) => computeHeldCountsAfterPerKey(l, { 'bone chips': T0 }),
  computeLastLootedAt,
  computeLogOnlyCounts: (l) => computeLogOnlyCounts(l, []),
  buildDropRows: (l) => buildDropRows(l, new Set(), new Map()),
  xpOverlayView: (l) => {
    const snap = progression()
    const slice = resolveSlice({ snap, bounds: dataBounds(snap, []), id: 'all' })
    return xpOverlayView({ snap, loot: l, slice, visible: normalizeXpRows(undefined) })
  }
}

for (const [name, read] of Object.entries(READERS)) {
  test(`A FROZEN LEDGER: ${name} writes to no row and answers the same`, () => {
    const frozen = deepFreeze(structuredClone(LEDGER))
    assert.deepEqual(read(frozen), read(structuredClone(LEDGER)))
    assert.deepEqual(frozen, LEDGER)
  })
}

test('the check can fail: an in-place sort of a frozen ledger throws', () => {
  const frozen = deepFreeze(structuredClone(LEDGER))
  assert.throws(() => frozen.sort((a, b) => a.item.localeCompare(b.item)), TypeError)
  assert.throws(() => {
    frozen[0].zone = 'x'
  }, TypeError)
})
