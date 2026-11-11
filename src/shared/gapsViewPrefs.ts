// gapsViewPrefs.ts — the Gaps tab's domain tab and sort order as stored, read back (owner,
// 2026-10-20). Both used to be state the tab forgot on leaving it; the Wiki Gaps overlay lists "the
// top 10 of whatever list they have on whatever tab they have showing", so with the tab closed the
// overlay's publisher has to know which tab and which order were showing. Stored as text per viewer
// beside the tab's other prefs; anything unreadable is the default, never an error.

import { DEFAULT_GAP_SORT, GAP_DOMAINS, type GapDomain, type GapSort, type GapSortKey } from './gaps'
import { FOLDED_INTO, GAP_TABS } from './gapNeeds'

/** Where the domain tab is remembered. */
export const GAP_DOMAIN_KEY = 'eq.gaps.domain'
/** Where the sort order is remembered, `count desc`. */
export const GAP_SORT_KEY = 'eq.gaps.sort'

const SORT_KEYS: readonly GapSortKey[] = ['name', 'kinds', 'zone', 'count', 'first', 'last', 'todo']

/** The stored domain tab; Items when absent or not a domain this build has; a tab folded into Mobs (2026-11-10) reads as Mobs. */
export function gapDomainOf(raw: string | null): GapDomain {
  const stored = GAP_DOMAINS.find((d) => d === raw)
  if (stored === undefined) return 'item'
  return GAP_TABS.includes(stored) ? stored : (FOLDED_INTO[stored] ?? 'item')
}

/** Where the Needs chips' choice is remembered, `factions,drops`. */
export const GAP_NEEDS_KEY = 'eq.gaps.needs'

/** The stored sort order (`count desc`); the engine's own order when absent or unreadable. */
export function gapSortOf(raw: string | null): GapSort {
  const [key, dir] = (raw ?? '').split(' ')
  const k = SORT_KEYS.find((s) => s === key)
  return k !== undefined && (dir === 'asc' || dir === 'desc') ? { key: k, dir } : DEFAULT_GAP_SORT
}

export function gapSortText(sort: GapSort): string {
  return `${sort.key} ${sort.dir}`
}
