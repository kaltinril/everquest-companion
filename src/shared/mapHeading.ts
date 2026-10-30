// mapHeading.ts — which way you were going, from the last two positions the map holds (owner,
// 2026-10-29, the competitor scan's heading arrow). Pure.
//
// Points are in map-file units (mapGeometry.ts `mapFromLoc`): x grows to the right of the drawn
// map and y grows downward, the screen's own axes, so a bearing here is a bearing on screen at any
// zoom (the projection is one scale and a shift, no rotation).

import type { CharacterSnap } from './characterTypes'
import { zoneShortName } from './zones'

export interface MapXY {
  x: number
  y: number
}

/** Moves shorter than this (map units) are standing still: /loc prints two decimals. */
const STILL = 0.01

/**
 * Degrees clockwise from the top of the map, [0, 360), for travel from `from` to `to`; null when
 * there is no earlier position or the two are the same spot (no arrow, the plain marker).
 */
export function headingDeg(from: MapXY | null, to: MapXY | null): number | null {
  if (from == null || to == null) return null
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.hypot(dx, dy) < STILL) return null
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (deg + 360) % 360
}

/** A position in `/loc`'s own order and when it was taken (ms): typed on the Maps tab, or logged. */
export interface TimedLoc {
  ns: number
  ew: number
  z: number
  at: number
}

/** The log's `/loc` lines (the `character` module's `locs`) as positions, while `zone` (a map stem)
 *  is the zone the log has you in; none for any other map. */
export function loggedLocsIn(snap: Pick<CharacterSnap, 'zone' | 'locs'> | null, zone: string | null): TimedLoc[] {
  if (snap?.locs == null || zone == null || zoneShortName(snap.zone) !== zone) return []
  return snap.locs.map((l) => ({ ns: l.ns, ew: l.ew, z: l.z, at: l.ts }))
}

/**
 * The marker and the position before it, from every source at once (owner, 2026-10-29: logged
 * `/loc` lines and a typed one, "whichever is newer wins"): the newest two, newest first. A
 * position at or before `clearedAt` (the Clear chip) is gone.
 */
export function newestTwo(cands: readonly (TimedLoc | null)[], clearedAt: number): [TimedLoc | null, TimedLoc | null] {
  const live: TimedLoc[] = []
  for (const c of cands) if (c != null && c.at > clearedAt) live.push(c)
  live.sort((a, b) => b.at - a.at)
  return [live[0] ?? null, live[1] ?? null]
}
