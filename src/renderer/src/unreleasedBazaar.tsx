// unreleasedBazaar — the UNRELEASED gate's reach into a component tree, for the Bazaar tab.
//
// unreleasedSlayer.tsx's arrangement: `UNRELEASED` is anchored on `import.meta.env.DEV`
// (devFlags.ts), a literal `false` in every `electron-vite build`, so the lazy const below
// compiles to `null` there, the dynamic `import()` is dead code, and `features/bazaar/**` leaves
// no trace in `out/renderer`. The view check lives here, not in App.tsx, for the SpellDrill
// precedent that file states.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'

const LazyBazaarView = UNRELEASED ? lazy(() => import('./features/bazaar/BazaarView')) : null
const LazyBazaarWatcher = UNRELEASED ? lazy(() => import('./features/bazaar/BazaarWatcher')) : null

/** The Bazaar tab: nothing at all in a build without the flag, or on any other view. */
export default function UnreleasedBazaarView({ view, viewKey }: { view: View; viewKey: string }): JSX.Element | null {
  if (!LazyBazaarView || view !== 'bazaar') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyBazaarView key={viewKey} />
    </Suspense>
  )
}

/** The watchlist's alerts, mounted for the life of the window; nothing at all without the flag. */
export function UnreleasedBazaarWatcher(): JSX.Element | null {
  if (!LazyBazaarWatcher) return null
  return (
    <Suspense fallback={null}>
      <LazyBazaarWatcher />
    </Suspense>
  )
}
