// useBazaarWatch — the Bazaar watchlist (shared/bazaarWatch.ts), one copy per window.
//
// useFavorites' arrangement: a module-scope snapshot read through `useSyncExternalStore`, so the
// tab and the always-mounted alert watcher see the same list and an edit in one is live in the
// other. Loaded once from the settings store; every edit is written through at once, and the
// stored (normalized) list is what the snapshot becomes, from the newest write's reply only
// (latestReply.ts): an older reply landing late would flick a switch back or feed a keystroke a
// stale list. An edit made before the first load answers waits for it, so it lands on the stored
// list rather than replacing it.

import { useMemo, useSyncExternalStore } from 'react'
import { EMPTY_WATCHLIST, removeWatch, setWatch, type BazaarWatch, type BazaarWatchlist } from '@shared/bazaarWatch'
import { afterLoad, replyGate } from './latestReply'

let list: BazaarWatchlist = EMPTY_WATCHLIST
let loaded: ((edit: () => void) => void) | null = null
const listeners = new Set<() => void>()
const replies = replyGate()

function emit(next: BazaarWatchlist): void {
  list = next
  for (const l of listeners) l()
}

/** A store reply, applied only while `ticket` is still the newest (the first load is ticket 0). */
function landing(ticket: number): (stored: BazaarWatchlist) => void {
  return (stored) => {
    if (replies.isLatest(ticket)) emit(stored)
  }
}

/** Loads the list once; what it returns runs an edit after that load has settled. */
function load(): (edit: () => void) => void {
  loaded ??= afterLoad(window.eq.getBazaarWatch().then(landing(0), () => undefined))
  return loaded
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  load()
  return () => {
    listeners.delete(listener)
  }
}

function write(next: BazaarWatchlist): void {
  const ticket = replies.next()
  emit(next)
  void window.eq.setBazaarWatch(next).then(landing(ticket), () => undefined)
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
      put: (w: BazaarWatch) => load()(() => write(setWatch(list, w))),
      remove: (item: string, tier: number | null) => load()(() => write(removeWatch(list, item, tier)))
    }),
    [current]
  )
}
