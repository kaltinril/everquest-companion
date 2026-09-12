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
// The same two readers the map's own wish-list pins use, so a zone's count and the pins on its map
// can never disagree about which drops are wished.
import { sourceItemKey } from '../../lib/itemSources'
import { wishedDrops } from './mobPins'

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

/**
 * Zone name → how many DISTINCT wished items the bestiary says can drop there (owner ask,
 * 2026-09-12: *"most wishlist items in a single zone"*).
 *
 * DISTINCT ITEMS, not drop rows: three mobs in one zone that each drop the same wished sword are
 * one reason to go, not three. Keyed through `sourceItemKey`, the way `wishedDrops` is, because
 * the catalog spells `Ghoulbane` and `Ghoulbane +1` on different mobs and they are one item.
 *
 * A mob standing in several zones counts in each - it really is in all of them.
 *
 * ONE WALK, not one per zone: `mobsInZone` would answer this too, but 193 zones times the catalog
 * on every wish-list edit is the wrong shape for a list that redraws as you type.
 */
export function wishedByZone(wished: ReadonlySet<string>): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  if (wished.size === 0) return out
  const byZone = new Map<string, Set<string>>()
  for (const mob of MOB_CATALOG) {
    const drops = wishedDrops(mob, wished)
    if (drops.length === 0) continue
    for (const zone of mob.zones ?? []) {
      let items = byZone.get(zone)
      if (items === undefined) {
        items = new Set()
        byZone.set(zone, items)
      }
      for (const name of drops) items.add(sourceItemKey(name))
    }
  }
  for (const [zone, items] of byZone) out.set(zone, items.size)
  return out
}
