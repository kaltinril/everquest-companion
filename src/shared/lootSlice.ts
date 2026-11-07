// lootSlice.ts — THE LEDGER UNDER A SLICE, cut once and only when the cut could differ.
//
// The Loot tab applies the timeslice to the whole loot history (11,000 rows on the owner's log)
// with `inSlice`, and every derivation under it — the grouped table, the notable strip, the
// drill-down — reads the result. The slice's range is resolved against the PROGRESSION snapshot,
// whose `lastTs` moves every second lines arrive, so under `All` (the ledger's own opening) the
// range's top end moved every second and the ledger re-filtered 11k rows for an answer that
// could not have changed: no loot row lives past the last loot row.
//
// THE EFFECTIVE RANGE is the fix, and it is sound rather than a heuristic. A membership test
// `t0 <= ts < t1` over a fixed set of rows whose instants lie in `[lo, hi]` gives the same answer
// for every `t1 > hi` and every `t0 <= lo`, so the range is clamped to the rows' own span before
// it is used as a memo key: the key moves only when a row's membership can. The row span is one
// pass per ledger identity; the cut is one pass per effective key. Under a range that covers the
// span with no zone restriction, the cut IS the ledger and the very same array is handed back, so
// everything memoized on its identity holds too.
//
// Shared rather than renderer-side because the renderer never filters domain rows itself
// (`eqc/no-domain-munging`, owner ruling 4); the renderer asks, this answers.

import type { LootEvent } from './types'
import { inSlice, type SliceRange, type Timeslice } from './timeslice'

/** The instants the ledger's rows span, inclusive at both ends. Null for an empty ledger. */
export interface LedgerSpan {
  lo: number
  hi: number
}

/** One pass: the earliest and latest row instants. The ledger is in log order but is not relied
 *  on to be (a merged archive can interleave), so both ends are read from every row. */
export function ledgerSpan(history: readonly LootEvent[]): LedgerSpan | null {
  if (history.length === 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (const e of history) {
    if (e.ts < lo) lo = e.ts
    if (e.ts > hi) hi = e.ts
  }
  return { lo, hi }
}

/**
 * The slice's range, clamped to the rows it could admit (file header). A range that reaches past
 * the ledger's last row ends one millisecond after that row instead; one that starts before the
 * first row starts at it. An empty ledger clamps to the empty range at zero.
 */
export function effectiveRange(slice: Timeslice, span: LedgerSpan | null): SliceRange {
  if (span === null) return { t0: 0, t1: 0 }
  const t0 = Math.max(slice.range.t0, span.lo)
  const t1 = Math.min(slice.range.t1, span.hi + 1)
  return { t0, t1: Math.max(t0, t1) }
}

/** Does the slice admit every row the ledger holds, so that cutting it would copy it? */
export function sliceCoversLedger(slice: Timeslice, span: LedgerSpan | null): boolean {
  if (slice.zoneKey !== null) return false
  if (span === null) return true
  return slice.range.t0 <= span.lo && slice.range.t1 > span.hi
}

/**
 * The rows the slice admits, in the ledger's own order. THE SAME ARRAY when the slice admits all
 * of them (`sliceCoversLedger`), so a consumer keyed on the ledger's identity keeps its answer.
 */
export function sliceLedger(history: LootEvent[], slice: Timeslice, span: LedgerSpan | null): LootEvent[] {
  if (sliceCoversLedger(slice, span)) return history
  return history.filter((e) => inSlice(slice, e.ts, e.zone))
}
