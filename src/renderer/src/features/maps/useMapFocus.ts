// maps/useMapFocus.ts — applies a one-shot "open the map at this mob" ask (mapFocus.ts) once the
// asked zone's map is drawn: opens the sidebar for this visit if it was closed (pins draw only
// while it is open), then rings the mob's pin and centres on it through the sidebar row's own
// click. The ask is taken in the state initializer because this view remounts on every arrival;
// an arrival that parked nothing (the nav row, `openMapZone`, a restart) takes null and this hook
// does nothing at all.

import { useEffect, useState } from 'react'
import type { ZoneShort } from '@shared/maps'
import { focusRow, takeMapFocus, type MapFocus } from './mapFocus'
import type { ZonePaneState } from './useMapPane'

export function useMapFocus(args: {
  pane: Pick<ZonePaneState, 'mobs' | 'select' | 'reveal'>
  /** The zone actually ON SCREEN (`data.zone`), never the one being fetched. */
  zone: ZoneShort | undefined
  /** The host has a real size: centring into a zero-size pane lands nowhere (useSearchJump's rule). */
  sized: boolean
}): void {
  const { pane, zone, sized } = args
  const { mobs, select, reveal } = pane
  const [focus, setFocus] = useState<MapFocus | null>(takeMapFocus)
  useEffect(() => {
    if (focus === null || zone !== focus.zone || !sized) return
    const row = focusRow(focus, zone, mobs)
    if (row !== null) {
      reveal()
      select(row)
    }
    // Applied or not, the ask is spent: a row the list no longer holds leaves the zone open.
    setFocus(null)
  }, [focus, zone, sized, mobs, select, reveal])
}
