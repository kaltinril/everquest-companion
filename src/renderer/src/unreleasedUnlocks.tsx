// unreleasedUnlocks — the Unlocks tab, lazily loaded. The view check lives here, not in App.tsx,
// for the SpellDrill precedent that file states. (The file name is from the retired review gate;
// every build draws the tab.)

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import type { View } from './appViews'
import type { AppRouting } from './appRouting'

const LazyUnlocksView = lazy(() => import('./features/unlocks/UnlocksView'))

/** The Unlocks tab: nothing at all on any other view. */
export default function UnreleasedUnlocksView({
  view,
  viewKey,
  routing
}: {
  view: View
  viewKey: string
  routing: AppRouting
}): JSX.Element | null {
  if (view !== 'unlocks') return null
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
