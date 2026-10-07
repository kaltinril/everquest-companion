// useBazaarWatch — the Bazaar watchlist (shared/bazaarWatch.ts), one copy per window.
//
// useFavorites' arrangement: a module-scope snapshot read through `useSyncExternalStore`, so the
// tab and the always-mounted alert watcher see the same list and an edit in one is live in the
// other. Loaded once from the settings store; every edit is written through at once, and the
// stored (normalized) list is what the snapshot becomes.

import { useMemo, useSyncExternalStore } from 'react'
import { EMPTY_WATCHLIST, removeWatch, setWatch, type BazaarWatch, type BazaarWatchlist } from '@shared/bazaarWatch'

let list: BazaarWatchlist = EMPTY_WATCHLIST
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(next: BazaarWatchlist): void {
  list = next
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  loading ??= window.eq.getBazaarWatch().then(emit, () => undefined)
  return () => {
    listeners.delete(listener)
  }
}

function write(next: BazaarWatchlist): void {
  emit(next)
  void window.eq.setBazaarWatch(next).then(emit, () => undefined)
}

export interface BazaarWatchApi {
  list: BazaarWatchlist
  put: (w: BazaarWatch) => void
  remove: (item: string, tier: number | null) => void
}

export function useBazaarWatch(): BazaarWatchApi {
  const current = useSyncExternalStore(subscribe, () => list)
  return useMemo(
    () => ({
      list: current,
      put: (w: BazaarWatch) => write(setWatch(list, w)),
      remove: (item: string, tier: number | null) => write(removeWatch(list, item, tier))
    }),
    [current]
  )
}
