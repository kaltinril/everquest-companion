// shared/tableSort.ts — the ONE sortable-header rule the app's tables follow (dup-ui-a-7, 2026-11-27).
//
// A click on a new column opens it on its NATURAL end (names A→Z, numbers biggest-first, unless the
// table says otherwise); a click on the column already sorted FLIPS it. A table may also name a
// SOURCE order (AA: the wiki's order, requirements/alt-advancement.md 2026-11-26): then the click
// on a column already at its reversed end goes back to that source order instead of flipping again,
// so the cycle reads "natural, reversed, source". Without a source there is no third state.
//
// The remembered store is `lib/useTableSort.ts`; the keys it stores under are listed below, once.

export type SortDir = 'asc' | 'desc'

export interface ColumnSort<K extends string> {
  key: K
  dir: SortDir
}

/**
 * The localStorage key each table's sort is remembered under. A key is a promise to every install
 * that already wrote it: renaming one silently forgets the player's sort, so never rename, only add.
 * The Gear table keeps its own `eq.gear.sort` through the gear area's `useRemembered` (JOS-329).
 */
export const TABLE_SORT_KEYS = {
  aa: 'eq.aa.sort',
  bazaarQuotes: 'eq.bazaar.quotes.sort',
  bazaarOffers: 'eq.bazaar.offers.sort',
  factions: 'eq.factions.sort',
  levelingZones: 'eq.leveling.rangeZones.sort',
  mapsZoneHistory: 'eq.maps.zoneHistory.sort'
} as const

/** The natural first direction: the named (text) columns ascending, everything else descending. */
export function namesUpNumbersDown<K extends string>(nameKeys: readonly K[]): (key: K) => SortDir {
  return (key) => (nameKeys.includes(key) ? 'asc' : 'desc')
}

const flip = (dir: SortDir): SortDir => (dir === 'asc' ? 'desc' : 'asc')

/**
 * THE RULE: a new column opens on its natural end; the same column again flips. With a `source`
 * order, the same column again when it is already reversed returns `source` (the third click).
 */
export function nextSort<K extends string>(
  cur: ColumnSort<K> | null,
  key: K,
  natural: (key: K) => SortDir,
  source?: ColumnSort<K>
): ColumnSort<K> {
  if (cur?.key !== key) return { key, dir: natural(key) }
  if (source !== undefined && cur.dir !== natural(key)) return source
  return { key, dir: flip(cur.dir) }
}

/**
 * A stored sort read back, or `fallback` for anything that is not one of this table's columns: a
 * value that did not parse, a column a later build removed or renamed, a missing direction (which
 * takes the fallback's).
 */
export function sanitizeColumnSort<K extends string>(raw: unknown, keys: readonly K[], fallback: ColumnSort<K>): ColumnSort<K> {
  if (raw === null || typeof raw !== 'object') return fallback
  const o = raw as { key?: unknown; dir?: unknown }
  const key = keys.find((k) => k === o.key)
  if (key === undefined) return fallback
  return { key, dir: o.dir === 'asc' || o.dir === 'desc' ? o.dir : fallback.dir }
}
