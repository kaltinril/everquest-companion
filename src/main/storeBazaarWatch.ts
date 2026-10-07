// storeBazaarWatch.ts — the persisted Bazaar watchlist, main-process side (shared/bazaarWatch.ts).
//
// storeRespawn.ts's arrangement: read and written through the same normalizer over the one open
// store, in its own file because store.ts sits at the 400-code-line ceiling. An additive optional
// key, so no schema bump: absent reads as no watches.

import { settingsStore } from './store'
import { normalizeBazaarWatchlist, type BazaarWatchlist } from '../shared/bazaarWatch'

/** The watchlist, defaulted. Never throws. */
export function getBazaarWatch(): BazaarWatchlist {
  return normalizeBazaarWatchlist(settingsStore.get('bazaarWatch'))
}

/** Store a watchlist the renderer sent; returns what was actually stored. */
export function setBazaarWatch(next: unknown): BazaarWatchlist {
  const clean = normalizeBazaarWatchlist(next)
  settingsStore.set('bazaarWatch', clean)
  return clean
}
