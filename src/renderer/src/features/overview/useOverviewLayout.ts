// useOverviewLayout — the Overview's card layout, read from and written to the settings store
// (one per install; src/main/ipc/overviewLayout.ts). The last answer is kept at module scope, so
// a return to the tab paints the player's cards at once instead of waiting on the round trip.

import { useCallback, useEffect, useState } from 'react'
import type { OverviewLayout } from '@shared/overviewLayout'

let held: OverviewLayout | null = null
/** Bumped on every save, so a read that started before it cannot paint the older layout. */
let writes = 0

export interface OverviewLayoutState {
  /** null until the first read lands (a fraction of a second, once per app run). */
  layout: OverviewLayout | null
  /** Draw it now, store it, then draw what the store kept. */
  save: (next: OverviewLayout) => void
}

export function useOverviewLayout(): OverviewLayoutState {
  const [layout, setLayout] = useState<OverviewLayout | null>(held)
  useEffect(() => {
    let alive = true
    const at = writes
    void window.eq.getOverviewLayout().then((stored) => {
      if (at !== writes) return
      held = stored
      if (alive) setLayout(stored)
    })
    return () => {
      alive = false
    }
  }, [])
  const save = useCallback((next: OverviewLayout) => {
    held = next
    setLayout(next)
    const at = ++writes
    void window.eq.setOverviewLayout(next).then((stored) => {
      if (at !== writes) return
      held = stored
      setLayout(stored)
    })
  }, [])
  return { layout, save }
}
