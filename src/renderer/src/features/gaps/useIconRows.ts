// useIconRows - the Items rows for item pages that state no icon id (shared/gapIcons.ts; owner,
// 2026-11-20: Dark Ironbound Tome). Main is asked once per session which pages those are (the
// corpus is fixed for the process); the rows are the ones the player has looted or holds.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { iconRows, type IconlessPage } from '@shared/gapIcons'
import type { HeldIndex } from '@shared/gapHeld'
import type { GapRow } from '@shared/gaps'
import type { LootEvent } from '@shared/types'

const NO_ROWS: readonly GapRow[] = []
const NO_LOOT: readonly LootEvent[] = []

let asked = false
let pages: readonly IconlessPage[] | undefined
const listeners = new Set<() => void>()

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function ask(): void {
  if (asked) return
  asked = true
  void window.eq
    .gapIconlessItems()
    .then((got) => {
      pages = got
    })
    .catch(() => {
      // Main could not answer: no icon rows this session, and it is not asked again.
      pages = []
    })
    .finally(() => {
      for (const l of listeners) l()
    })
}

/** What the player has met: the loot lines and the inventory exports. */
export interface IconEvidence {
  loot: readonly LootEvent[] | null | undefined
  held: HeldIndex
}

/**
 * The icon rows for what this loot and these exports show; none until main has answered. `extra`
 * is the item rows already added beside the snapshot's: an item one of those names gets no second row.
 */
export function useIconRows(rows: readonly GapRow[] | undefined, extra: readonly GapRow[], met: IconEvidence): readonly GapRow[] {
  useEffect(ask, [])
  const iconless = useSyncExternalStore(subscribe, () => pages)
  const { loot, held } = met
  return useMemo(
    () => (iconless === undefined || iconless.length === 0 || rows === undefined ? NO_ROWS : iconRows(iconless, { loot: loot ?? NO_LOOT, held }, rows, extra)),
    [iconless, rows, extra, loot, held]
  )
}
