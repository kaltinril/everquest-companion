// maps/zoneBands — every zone's level band, computed once for the whole window.
//
// `useZoneTravel` needs ONE zone's band and computes it per zone; the advice list needs ALL of
// them at once and would otherwise walk the 7,918-row bestiary on every keystroke of the level
// field. The catalog is a committed JSON module that cannot change while the app runs, so the
// answer is taken once and kept — `mobSearch.MOB_CATALOG`'s own posture, one level up.
//
// IT IS KEYED BY THE BESTIARY'S OWN ZONE SPELLING, which is the long name ("West Commonlands"),
// because that is what the catalog rows carry and what `mobsInZone` joins on. A surface that wants
// to OPEN one of these maps folds it to a stem through `zones.ts` at the point of use, and says
// nothing when the fold has no answer (law 12: a zone we cannot name is not a zone we guess at).

import { zoneLevelBand, type ZoneLevelBand } from '@shared/zoneLevels'
import { MOB_CATALOG } from '../mobs/mobSearch'

let CACHE: Map<string, ZoneLevelBand> | null = null

/**
 * Zone name → what its documented inhabitants say about it.
 *
 * A mob standing in several zones counts in each, which is correct: it really is in all of them,
 * and the band is about the zone rather than about the mob.
 */
export function zoneBands(): ReadonlyMap<string, ZoneLevelBand> {
  if (CACHE !== null) return CACHE
  const levels = new Map<string, number[]>()
  for (const mob of MOB_CATALOG) {
    const level = Number.parseInt(String(mob.level), 10)
    if (!Number.isFinite(level)) continue
    for (const zone of mob.zones ?? []) {
      const held = levels.get(zone)
      if (held) held.push(level)
      else levels.set(zone, [level])
    }
  }
  const out = new Map<string, ZoneLevelBand>()
  for (const [zone, ls] of levels) {
    const band = zoneLevelBand(ls)
    if (band !== null) out.set(zone, band)
  }
  CACHE = out
  return out
}
