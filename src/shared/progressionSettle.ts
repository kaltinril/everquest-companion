// progressionSettle.ts — DID THIS PUSH MOVE ANYTHING A RATE CAN READ, OR ONLY THE CLOCK?
//
// The `progression` module republishes on every active second of the log: `lastTs` moves with
// every line, and the engine serves a fresh snapshot for it (2026-10-29 measurement: 12.1 moves
// per kill window, every one of them `lastTs`). A surface that folds rates over the snapshot — the
// XP overlay's `rangeStats` over every column — paid that fold per second for columns that had not
// gained a sample. This answers the one question such a surface needs before it refolds: apart
// from `lastTs`, does the new snapshot read the same as the one already folded?
//
// THE TEST IS STRUCTURAL AND CHEAP: every column is append-only and capped from the front, so two
// columns with the same length and the same last entry are the same column (the met-in-log feed
// compares its ring the same way). Scalars compare by value; the few object-valued entries (a
// `recentKills` row) by their JSON, which is a handful of fields. Nothing here reads the whole
// column.

import type { ProgressionSnap } from './progressionTypes'

/** The last entries read the same? Primitives by value, an object row by its JSON. */
function sameEntry(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Two columns that could only differ by having grown: same length, same last entry. */
function sameColumn(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  return a.length === 0 || sameEntry(a[a.length - 1], b[b.length - 1])
}

/**
 * Does `next` read the same as `prev` in every field but `lastTs`? True for a push that only
 * moved the clock (and for an identical snapshot), so the caller can keep the fold it has.
 */
export function sameButLastTs(prev: ProgressionSnap, next: ProgressionSnap): boolean {
  if (prev === next) return true
  const a = prev as unknown as Record<string, unknown>
  const b = next as unknown as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (key === 'lastTs') continue
    const x = a[key]
    const y = b[key]
    if (Array.isArray(x) && Array.isArray(y)) {
      if (!sameColumn(x, y)) return false
      continue
    }
    if (!sameEntry(x, y)) return false
  }
  return true
}
