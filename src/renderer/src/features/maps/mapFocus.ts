// maps/mapFocus.ts — a ONE-SHOT "open the map at this mob" ask from another tab (the Tradeskills
// section's "Show on map" beside a merchant; owner, 2026-11-20: "fully integrated with maps").
//
// `appRouting.openMapAt` writes the zone pick the way `openMapZone` does, parks the ask here, and
// switches tabs; the Maps view takes it once as it mounts (`useMapFocus.ts`), and when that zone's
// map and its mob rows are in, rings the mob's EXISTING pin and centres on it: the sidebar row's
// own click (`mobPins.paneGestures.select`). Nothing new is drawn and no position is invented.
//
// It is not the typed `/loc` marker (`eq.maps.loc`): that one means "where you are" and is never
// written from here.
//
// WHEN A LINK IS OFFERED AT ALL is `pinTarget` below, asked with the Maps tab's own rules: the mob
// must be a row the sidebar would list for that zone with a stated position (`mobRows`: in the
// zone, in era under the tab's switch, on one zone's page, not a common spawn). A mob with no pin
// gets no "Show on map"; the caller links the zone alone, as before.
//
// Session-lifetime and one slot, like `lib/navReturn`: no storage, no IPC. An ask nobody took
// (the tab never mounted) is replaced by the next one.

import type { ZoneShort } from '@shared/maps'
import type { MobEntry } from '@shared/types'
// RELATIVE value imports, the rule for node-tested pure modules (mobPins.ts): tests/mapFocus.test.mts.
import { zoneShortNameFromCatalog } from '../../../../shared/zones'
import { mobRows, type MobPaneRow } from './mobPins'
import { zoneLabel } from './zoneOptions'

/** The map to open and the mob catalog page whose pin to ring there. */
export interface MapFocus {
  zone: ZoneShort
  /** `MobEntry.page`: the sidebar row's id. */
  page: string
}

let pending: MapFocus | null = null

/** Park an ask for the Maps view's next mount; the newest replaces any that was never taken. */
export function parkMapFocus(focus: MapFocus): void {
  pending = focus
}

/** The parked ask, handed over once. */
export function takeMapFocus(): MapFocus | null {
  const focus = pending
  pending = null
  return focus
}

/** Test seam: window-lifetime state. */
export function resetMapFocus(): void {
  pending = null
}

const NO_WISHES: ReadonlySet<string> = new Set()

/** The mob's page states exactly one zone and the zone table has a map for it. */
function ownZone(entry: MobEntry): ZoneShort | null {
  const zones = entry.zones ?? []
  return zones.length === 1 ? zoneShortNameFromCatalog(zones[0]) : null
}

/**
 * Where "Show on map" would take a mob, or null when the Maps tab would draw no pin for it.
 *
 * `statedZone` is the zone the caller's line names (a guide's cell, the zone a purchase was made
 * in). When the zone table resolves it, that map must list the mob with a pin. When it does not
 * resolve ("New Sebi") the mob's own page decides, if it names one zone: the page is the pin's
 * source either way. `eraOnly` is the Maps tab's "Current era only" switch.
 */
export function pinTarget(entry: MobEntry, statedZone: string | undefined, eraOnly: boolean): MapFocus | null {
  const stated = statedZone === undefined ? null : zoneShortNameFromCatalog(statedZone)
  const zone = stated ?? ownZone(entry)
  if (zone === null) return null
  const row = mobRows(zoneLabel(zone), [entry], NO_WISHES, eraOnly).find((r) => r.id === entry.page)
  return row !== undefined && row.pins.length > 0 ? { zone, page: entry.page } : null
}

/**
 * The sidebar row a parked ask means, once the map on screen is the asked one: the row to hand
 * `select`. Null while another zone is drawn, or when the list holds no such row with a pin
 * (the era switch moved, a search is typed): the zone is open and nothing is ringed.
 */
export function focusRow(focus: MapFocus, drawnZone: ZoneShort | undefined, rows: readonly MobPaneRow[]): MobPaneRow | null {
  if (drawnZone !== focus.zone) return null
  const row = rows.find((r) => r.id === focus.page)
  return row !== undefined && row.pins.length > 0 ? row : null
}
