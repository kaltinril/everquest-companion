// THE REACT HALF of the typed-/loc marker (JOS-98) — the state, the persistence effect, and the
// two gestures. Every RULE it applies lives in `locMarker.ts`, which is pure and node-tested; this
// file is the wiring, and it is deliberately the only part of the feature that cannot be driven by
// `node --test`.
//
// PERSISTED BY ONE EFFECT, not by each transition — the same shape `useZoneSelection` uses for the
// pinned zone, and for the same reason: there is exactly one place that can forget to write, and
// none of the reducers has to be impure to be correct.
//
// KEYED BY ZONE, READ BY ZONE. The whole map of markers is held in state and the CURRENT zone's is
// derived, rather than loading one zone's marker on every zone change. That is what makes walking
// out of a zone and back — or pinning another map and returning — free of a reload, and it is why
// clearing one zone's marker provably cannot touch another's (`clearLocMarker`).
//
// PLACING JUMPS, RESTORING DOES NOT. Typing a loc is a question ("where is that?") and the answer
// is useless off screen, so a placement centres the view on it at the search's own zoom. A marker
// restored from a previous session is NOT a question anyone just asked — snapping the viewport on
// mount would fight the zone's own fit and move a map the user never touched.
//
// THE LOG FEEDS IT TOO (owner, 2026-10-29: "no one ever manually types loc much"). EQ Legends
// writes `/loc` to the log, and the `character` module keeps the zone's last two such lines. The
// marker is the NEWEST position from either source and the heading arrow points from the one
// before it (shared/mapHeading.ts `newestTwo`): a typed loc is stamped when placed, a logged one
// carries its log time. A logged position moves the marker but never the view.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ZoneShort } from '@shared/maps'
import type { CharacterSnap } from '@shared/types'
import { headingDeg, loggedLocsIn, newestTwo, type TimedLoc } from '@shared/mapHeading'
import { useModule } from '../../lib/useModule'
import { JUMP_ZOOM } from './MapBody'
import { mapFromLoc, type EqLoc } from './mapGeometry'
import {
  clearLocMarker,
  loadLocMarkers,
  locMarkerFor,
  saveLocMarkers,
  setLocMarker,
  type LocMarkers,
  type PlacedLoc
} from './locMarker'
import type { MapViewport } from './useMapViewport'

/** What the toolbar needs to state the marker, and what the surface needs to draw it. */
export interface LocMarkerState {
  /** This zone's marker in the game's own axes, or null: the newer of the typed and logged ones. */
  marker: EqLoc | null
  /** Which way you went from the position before the marker to the marker, degrees clockwise from
   *  the map's top; null with no earlier position, or the same spot twice. */
  heading: number | null
  /** A well-formed reading was entered: remember it for this zone, and go look at it. */
  place: (loc: EqLoc) => void
  /** Centre on the marker already placed. The chip's click. */
  show: () => void
  /** Forget this zone's marker, the logged positions up to now included. */
  clear: () => void
}

/** A typed marker as a timed position; one saved before the stamp existed counts as oldest. */
function timed(loc: PlacedLoc | null): TimedLoc | null {
  return loc == null ? null : { ns: loc.ns, ew: loc.ew, z: loc.z, at: loc.at ?? 0 }
}

/** The marker and its heading, from the typed marker, the one it replaced and the logged lines. */
function useShownLoc(zone: ZoneShort | null, marks: LocMarkers, tails: LocMarkers, cleared: Record<string, number>) {
  const snap = useModule<CharacterSnap>('character')
  const logged = useMemo(() => loggedLocsIn(snap, zone), [snap, zone])
  return useMemo(() => {
    const since = zone == null ? -Infinity : (cleared[zone] ?? -Infinity)
    const [now, before] = newestTwo([timed(locMarkerFor(marks, zone)), timed(locMarkerFor(tails, zone)), ...logged], since)
    const marker = now == null ? null : { ns: now.ns, ew: now.ew, z: now.z }
    const heading = headingDeg(before == null ? null : mapFromLoc(before), now == null ? null : mapFromLoc(now))
    return { marker, heading }
  }, [zone, marks, tails, cleared, logged])
}

export function useLocMarker(zone: ZoneShort | null, vp: MapViewport): LocMarkerState {
  const [marks, setMarks] = useState<LocMarkers>(loadLocMarkers)
  useEffect(() => {
    saveLocMarkers(marks)
  }, [marks])

  // The typed marker each placement replaced, per zone: an arrow's tail between two typed locs.
  // Memory only, like the Clear chip's time, which hides the logged positions it covered.
  const [tails, setTails] = useState<LocMarkers>({})
  const [cleared, setCleared] = useState<Record<string, number>>({})
  const marksNow = useRef(marks)
  marksNow.current = marks

  const { marker, heading } = useShownLoc(zone, marks, tails, cleared)
  const { centerOn, zoomedIn, view } = vp

  // Fitted ⇒ a marker is a few pixels from everything else, so the jump also zooms in; already
  // zoomed ⇒ keep the scale the user chose. Identical to the search jump, on purpose.
  // The view through a ref, so these callbacks keep one identity while the map pans and zooms and
  // the memoized toolbar that takes them does not redraw every frame.
  const viewNow = useRef({ zoomedIn, scale: view.scale })
  viewNow.current = { zoomedIn, scale: view.scale }
  const goTo = useCallback(
    (loc: EqLoc) => {
      const p = mapFromLoc(loc)
      const v = viewNow.current
      centerOn(p.x, p.y, v.zoomedIn ? undefined : v.scale * JUMP_ZOOM)
    },
    [centerOn]
  )

  const place = useCallback(
    (loc: EqLoc) => {
      // No map open ⇒ nowhere to remember it. The field is gated on `hasMap`, so this is a guard,
      // not a path: a marker filed under no zone could never be found again.
      if (zone == null) return
      const held = locMarkerFor(marksNow.current, zone)
      if (held != null) setTails((p) => setLocMarker(p, zone, held))
      setMarks((prev) => setLocMarker(prev, zone, { ...loc, at: Date.now() }))
      goTo(loc)
    },
    [zone, goTo]
  )

  const show = useCallback(() => {
    if (marker != null) goTo(marker)
  }, [marker, goTo])

  const clear = useCallback(() => {
    if (zone == null) return
    setMarks((prev) => clearLocMarker(prev, zone))
    setTails((p) => clearLocMarker(p, zone))
    setCleared((c) => ({ ...c, [zone]: Date.now() }))
  }, [zone])

  return { marker, heading, place, show, clear }
}
