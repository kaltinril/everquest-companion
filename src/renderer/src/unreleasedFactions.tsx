// ============================================================================
// unreleasedFactions — the UNRELEASED gate's reach into a component tree, for the Factions tab.
// ============================================================================
//
// `devTriage.tsx`'s arrangement on the OTHER flag: `UNRELEASED` is anchored on
// `import.meta.env.DEV` (devFlags.ts), a literal `false` in every `electron-vite build`, so the
// lazy const below compiles to `null` there and the dynamic `import()` is dead code — rollup
// removes the call, the chunk is never emitted, and `features/factions/**` leaves no trace in
// `out/renderer`. A STRIP, not a hide. The dynamic import is what makes that possible; a static
// one would pull the tree into the graph before any branch could remove it.
//
// AND THE VIEW CHECK LIVES HERE, NOT IN App.tsx — the SpellDrill precedent (JOS-508): App's
// `PlainView` is one branch per view and sits at a measured complexity ceiling, so this component
// is rendered UNCONDITIONALLY there and answers `null` for every view but its own. When the tab
// graduates (gate deleted, `TELEMETRY_VIEWS` widened, owner-sequenced — the character sheet's
// JOS-327 path), this file is deleted and FactionsView becomes an ordinary static import with an
// ordinary branch, the complexity point paid at the moment the tab earns it.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'

const LazyFactionsView = UNRELEASED ? lazy(() => import('./features/factions/FactionsView')) : null

/** The Factions tab — nothing at all in a build without the flag, or on any other view. */
export default function UnreleasedFactionsView({
  view,
  viewKey
}: {
  view: View
  viewKey: string
}): JSX.Element | null {
  if (!LazyFactionsView || view !== 'factions') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyFactionsView key={viewKey} />
    </Suspense>
  )
}
