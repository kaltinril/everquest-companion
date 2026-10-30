// shared/metNames.ts — THE `met` MODULE'S SHAPE, and the same names built from the four modules it
// replaced as a source (perf review 2026-10-20 #1). The engine folds `met` (`met.rs`): every mob
// killed, looted from or conned, every item looted, every zone entered, raw spellings, plus the kills
// map cut to the raid roster. `shared/metInLog.ts` keys the names.
//
// An archived segment captured `kills`, `loot`, `consider` and `progression` but no `met`, so its
// evidence is rebuilt from those here (`logArchive/mergeMet.ts`). Pure, relative imports.

import type { ConsiderSnap, KillMap, KillsSnap, LootSnap, ProgressionSnap } from './types'

export const MET_MODULE = 'met'

/** The `met` module's published state. */
export interface MetSnap {
  mobs: string[]
  items: string[]
  zones: string[]
  /** The kills map's entries whose name is a roster `match` name (`bossStatus.ts matchKey`). */
  bosses: KillMap
}

/** Every mob the log names: killed, looted from, conned. Display spellings; `setMet` folds them. */
export function metMobNames(kills: KillsSnap | null, loot: LootSnap | null, consider: ConsiderSnap | null): string[] {
  const names: string[] = []
  for (const k of Object.values(kills?.mobs ?? {})) names.push(k.display)
  for (const l of loot ?? []) if (l.source !== undefined && l.source !== '') names.push(l.source)
  for (const c of consider ?? []) names.push(c.mob)
  return names
}

/** Every item the log looted. */
export function metItemNames(loot: LootSnap | null): string[] {
  return (loot ?? []).map((l) => l.item)
}

/** Every zone the log entered (the zone timeline), and the zone of every loot and con. */
export function metZoneNames(
  progression: ProgressionSnap | null,
  loot: LootSnap | null,
  consider: ConsiderSnap | null
): string[] {
  const zones = [...(progression?.zoneName ?? [])]
  for (const l of loot ?? []) if (l.zone !== undefined && l.zone !== '') zones.push(l.zone)
  for (const c of consider ?? []) if (c.zone !== undefined && c.zone !== '') zones.push(c.zone)
  return zones
}

/** A segment's evidence, from the modules it captured. Its `bosses` stay empty: only the live
 *  celebration reads them, and it watches for a count that grows. */
export function metFromModules(modules: Readonly<Record<string, { state: unknown } | undefined>>): MetSnap {
  const kills = (modules.kills?.state ?? null) as KillsSnap | null
  const loot = (modules.loot?.state ?? null) as LootSnap | null
  const consider = (modules.consider?.state ?? null) as ConsiderSnap | null
  const progression = (modules.progression?.state ?? null) as ProgressionSnap | null
  return {
    mobs: metMobNames(kills, loot, consider),
    items: metItemNames(loot),
    zones: metZoneNames(progression, loot, consider),
    bosses: {}
  }
}
