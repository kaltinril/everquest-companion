// unreleasedSlayer — the Achievements tab (view id `slayer`, the name it had while it listed the
// Slayer family alone), lazily loaded. (The file name is from the retired review gate; every build
// draws the tab.)
//
// THE VIEW CHECK LIVES HERE, NOT IN App.tsx (the SpellDrill precedent): App's `PlainView` is one
// branch per view and sits at a measured complexity ceiling, so this component is rendered
// unconditionally there and answers `null` for every view but its own.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import type { View } from './appViews'
import type { AppRouting } from './appRouting'

const LazySlayerView = lazy(() => import('./features/achievements/AchievementsView'))

/** The Achievements tab: nothing at all on any other view. */
export default function UnreleasedSlayerView({
  view,
  viewKey,
  routing
}: {
  view: View
  viewKey: string
  routing: AppRouting
}): JSX.Element | null {
  if (view !== 'slayer') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazySlayerView key={viewKey} onOpenMob={routing.openMob} onSelectView={routing.selectView} />
    </Suspense>
  )
}
