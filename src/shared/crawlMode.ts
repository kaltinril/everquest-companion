// crawlMode.ts — the mobs you killed on this visit to a zone, for the Maps tab's Crawl mode
// (owner, 2026-10-29, from the competitor scan: dim what you killed until you leave the zone).
// Pure.
//
// The visit is the log's latest zone interval (the progression module's `zoneStart`/`zoneName`);
// a kill belongs to it when the kills module's `lastTs` for that mob is at or after its start.
// Both are log timestamps, so the two modules agree whatever the machine's clock says.

import type { KillMap } from './kills'
import { mobKey } from './mobKey'
import { zoneShortName } from './zones'

/** The progression snapshot's zone intervals, ascending (progressionTypes.ts). */
export interface ZoneStays {
  zoneStart: readonly number[]
  zoneName: readonly string[]
}

const NONE: ReadonlySet<string> = new Set()

/** When your current visit to `zone` began, or null when the log's latest zone is another one. */
export function stayStart(stays: ZoneStays, zone: string | null): number | null {
  const last = stays.zoneStart.length - 1
  if (zone == null || last < 0) return null
  return zoneShortName(stays.zoneName[last]) === zone ? stays.zoneStart[last] : null
}

/** The mobs (as `mobKey`s) killed since `since`; none when there is no visit to count from. */
export function killedSince(kills: KillMap, since: number | null): ReadonlySet<string> {
  if (since == null) return NONE
  const out = new Set<string>()
  for (const [key, info] of Object.entries(kills)) if (info.lastTs >= since) out.add(mobKey(info.display || key))
  return out
}
