// shared/logArchive/mergeLeveling.ts — the `leveling` module across an archive and the live log
// (step 1.5).
//
// The four lists join, older first. The AA ledger's unspent total is the value to watch: it is
// read off every gain and every purchase, so a merge that dropped one would show it.
//
// The latest `/alt list` run is the newer one's (by its stamp, as either side may lack it); the
// activations join by name, the earliest first sighting, the latest last one and the highest rank;
// castOnly only when every side saw the name only as a bare cast.

import type { AaActivation, AaListRun } from '../aaList'
import type { LevelingSnap } from '../types'

const LISTS = ['levels', 'aaGains', 'aaSpends', 'aaPotions'] as const

function isLevelingSnap(x: unknown): x is LevelingSnap {
  if (x === null || typeof x !== 'object') return false
  return LISTS.every((k) => Array.isArray((x as Record<string, unknown>)[k]))
}

function newerRun(a: AaListRun | null | undefined, b: AaListRun | null | undefined): AaListRun | null {
  if (a === null || a === undefined) return b ?? null
  return b === null || b === undefined || a.ts > b.ts ? a : b
}

function joinActivations(older: readonly AaActivation[], newer: readonly AaActivation[]): AaActivation[] {
  const byName = new Map<string, AaActivation>()
  for (const a of [...older, ...newer]) {
    const had = byName.get(a.name)
    const rank = Math.max(had?.rank ?? 0, a.rank ?? 0)
    const bare = had?.castOnly === true && a.castOnly === true ? { castOnly: true as const } : {}
    const joined = had === undefined ? a : { name: a.name, first: Math.min(had.first, a.first), last: Math.max(had.last, a.last), ...bare }
    byName.set(a.name, rank > 0 ? { ...joined, rank } : joined)
  }
  return [...byName.values()]
}

/** `older` then `newer`, or null when either is not a leveling snapshot. */
export function mergeLeveling(older: unknown, newer: unknown): LevelingSnap | null {
  if (!isLevelingSnap(older) || !isLevelingSnap(newer)) return null
  return {
    ...newer,
    levels: [...older.levels, ...newer.levels],
    aaGains: [...older.aaGains, ...newer.aaGains],
    aaSpends: [...older.aaSpends, ...newer.aaSpends],
    aaPotions: [...older.aaPotions, ...newer.aaPotions],
    // Only when a side has them: two segments from before the fields merge to one without them.
    ...(older.aaList === undefined && newer.aaList === undefined ? {} : { aaList: newerRun(older.aaList, newer.aaList) }),
    ...(older.aaActivations === undefined && newer.aaActivations === undefined
      ? {}
      : { aaActivations: joinActivations(older.aaActivations ?? [], newer.aaActivations ?? []) })
  }
}
