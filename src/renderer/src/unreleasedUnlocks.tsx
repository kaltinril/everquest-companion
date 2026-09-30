// unreleasedUnlocks — the UNRELEASED gate's reach into a component tree, for the Unlocks tab.
//
// unreleasedSlayer.tsx's arrangement: `UNRELEASED` is anchored on `import.meta.env.DEV`
// (devFlags.ts), a literal `false` in every `electron-vite build`, so the lazy const below
// compiles to `null` there, the dynamic `import()` is dead code, and `features/unlocks/**`
// leaves no trace in `out/renderer`. A strip, not a hide. The view check lives here, not in
// App.tsx, for the SpellDrill precedent that file states.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'
import type { AppRouting } from './appRouting'

const LazyUnlocksView = UNRELEASED ? lazy(() => import('./features/unlocks/UnlocksView')) : null

/** The Unlocks tab: nothing at all in a build without the flag, or on any other view. */
export default function UnreleasedUnlocksView({
  view,
  viewKey,
  routing
}: {
  view: View
  viewKey: string
  routing: AppRouting
}): JSX.Element | null {
  if (!LazyUnlocksView || view !== 'unlocks') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyUnlocksView
        key={viewKey}
        onOpenQuest={routing.openQuest}
        onOpenMob={routing.openMob}
        onSelectView={routing.selectView}
      />
    </Suspense>
  )
}
