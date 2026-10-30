// shared/logArchive/mergeMet.ts — the `met` module across an archive and the live log.
//
// Names are evidence that never expires (`shared/metInLog.ts`), so a join keeps every name either
// side met, older first. A segment holds no `met` of its own: `history.ts` rebuilds one from the
// modules it captured (`metNames.ts metFromModules`). `bosses` is the live side's alone: its one
// reader celebrates a credited count that grows, and an archive adds the same amount every time.

import type { MetSnap } from '../metNames'

function isNames(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((n) => typeof n === 'string')
}

function isMetSnap(x: unknown): x is MetSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  const bosses = s.bosses
  return isNames(s.mobs) && isNames(s.items) && isNames(s.zones) && bosses !== null && typeof bosses === 'object'
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])]
}

/** `older` then `newer`, or null when either is not a met snapshot. */
export function mergeMet(older: unknown, newer: unknown): MetSnap | null {
  if (!isMetSnap(older) || !isMetSnap(newer)) return null
  return {
    mobs: union(older.mobs, newer.mobs),
    items: union(older.items, newer.items),
    zones: union(older.zones, newer.zones),
    bosses: newer.bosses
  }
}
