// unreleasedSlayer — the UNRELEASED gate's reach into a component tree, for the Slayer tab.
//
// `devTriage.tsx`'s arrangement on the other flag: `UNRELEASED` is anchored on
// `import.meta.env.DEV` (devFlags.ts), a literal `false` in every `electron-vite build`, so the
// lazy const below compiles to `null` there, the dynamic `import()` is dead code, and
// `features/slayer/**` leaves no trace in `out/renderer`. A strip, not a hide.
//
// THE VIEW CHECK LIVES HERE, NOT IN App.tsx (the SpellDrill precedent): App's `PlainView` is one
// branch per view and sits at a measured complexity ceiling, so this component is rendered
// unconditionally there and answers `null` for every view but its own.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'
import type { AppRouting } from './appRouting'

const LazySlayerView = UNRELEASED ? lazy(() => import('./features/slayer/SlayerView')) : null

/** The Slayer tab: nothing at all in a build without the flag, or on any other view. */
export default function UnreleasedSlayerView({
  view,
  viewKey,
  routing
}: {
  view: View
  viewKey: string
  routing: AppRouting
}): JSX.Element | null {
  if (!LazySlayerView || view !== 'slayer') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazySlayerView key={viewKey} onOpenMob={routing.openMob} onSelectView={routing.selectView} />
    </Suspense>
  )
}
