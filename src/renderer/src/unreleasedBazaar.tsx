// unreleasedBazaar — the Bazaar tab, lazily loaded. The view check lives here, not in App.tsx,
// for the SpellDrill precedent that file states. (The file name is from the retired review gate;
// every build draws the tab.)

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import type { View } from './appViews'

const LazyBazaarView = lazy(() => import('./features/bazaar/BazaarView'))
const LazyBazaarWatcher = lazy(() => import('./features/bazaar/BazaarWatcher'))

/** The Bazaar tab: nothing at all on any other view. */
export default function UnreleasedBazaarView({
  view,
  viewKey,
  onOpenLoot
}: {
  view: View
  viewKey: string
  /** An item name's click: its page on the Loot tab, as on the Gear tab. */
  onOpenLoot: (item: string) => void
}): JSX.Element | null {
  if (view !== 'bazaar') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyBazaarView key={viewKey} onOpenLoot={onOpenLoot} />
    </Suspense>
  )
}

/** The watchlist's alerts, mounted for the life of the window. */
export function UnreleasedBazaarWatcher(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyBazaarWatcher />
    </Suspense>
  )
}
