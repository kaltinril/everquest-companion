// shared/tradeskillMerchant.ts — which mob catalog page a merchant's name means, so the workbench
// can draw a merchant (from the log's purchase lines, or from the recipe guide) as the standard
// mob link. Refuse over guess: a name the catalog does not hold, or holds on several pages with
// nothing to choose by, stays plain text.

import type { MobEntry } from './mobTypes'

export type MerchantIndex = ReadonlyMap<string, readonly MobEntry[]>

const fold = (s: string): string => s.trim().toLowerCase()

/** The catalog's pages by in-game name. */
export function merchantIndex(catalog: readonly MobEntry[]): MerchantIndex {
  const out = new Map<string, MobEntry[]>()
  for (const entry of catalog) {
    const key = fold(entry.name)
    const list = out.get(key)
    if (list) list.push(entry)
    else out.set(key, [entry])
  }
  return out
}

/**
 * The page a merchant's name means: the only page of that name, or, of several, the only one
 * whose zones hold the stated zone. Null otherwise.
 */
export function merchantEntry(index: MerchantIndex, name: string, zone?: string): MobEntry | null {
  const named = index.get(fold(name)) ?? []
  if (named.length === 1) return named[0]
  if (zone === undefined) return null
  const there = named.filter((entry) => (entry.zones ?? []).some((z) => fold(z) === fold(zone)))
  return there.length === 1 ? there[0] : null
}
