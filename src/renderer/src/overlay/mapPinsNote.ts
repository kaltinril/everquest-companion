// mapPinsNote.ts — which map answer the Map pins overlay may draw, and what it says when it has
// none. Pure: no React, so every rule is node-testable (tests/mapPinsNote.test.mts).
//
// THE ANSWER IS HELD WITH THE ZONE IT WAS ASKED FOR. On a zone change the last zone's map is still
// in hand until the new one lands, and drawing it put the new zone's pins over the old zone's
// lines at the old zone's scale (bug hunt, 2026-11-19). The key is the zone ASKED, never
// `MapData.zone`: main folds the name before it loads, and a spelling apart would blank the map.

import type { MapData } from '@shared/maps'
import type { ZoneExtent } from '../features/maps/mapTrack'

/** A map answer, with the zone it was asked for. `data` is null when that zone has no map. */
export interface HeldMap {
  zone: string
  data: MapData | null
}

/** The held map, when it answers this zone; null for any other zone's. */
export function heldMapFor(held: HeldMap | null, zone: string | null): MapData | null {
  return held?.zone === zone ? held.data : null
}

/** A zone is named and its answer has not landed yet. */
export function mapLoading(held: HeldMap | null, zone: string | null): boolean {
  return zone != null && held?.zone !== zone
}

/** The centred note for a window with nothing to draw. Silent while the map loads, as the Maps tab is. */
export function emptyNote(zone: string | null, ext: ZoneExtent | undefined, loading: boolean): string | null {
  if (zone == null) return 'Waiting for the log to name your zone.'
  if (loading) return null
  if (ext == null) return 'No map for this zone - install a map pack, or open it on the Maps tab.'
  return null
}
