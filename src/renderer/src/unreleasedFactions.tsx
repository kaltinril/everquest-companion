// unreleasedFactions — the Factions tab, lazily loaded. (The file name is from the retired review
// gate; every build draws the tab.)
//
// THE VIEW CHECK LIVES HERE, NOT IN App.tsx — the SpellDrill precedent (JOS-508): App's
// `PlainView` is one branch per view and sits at a measured complexity ceiling, so this component
// is rendered UNCONDITIONALLY there and answers `null` for every view but its own.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import type { View } from './appViews'
import type { AppRouting } from './appRouting'

const LazyFactionsView = lazy(() => import('./features/factions/FactionsView'))

/** The Factions tab — nothing at all on any other view. It takes
 *  the app's router whole (the SpellDrill contract) and hands the tab the two drill-downs its
 *  names link out to: an item's Loot page and a giver's Mobs page. */
export default function UnreleasedFactionsView({
  view,
  viewKey,
  routing
}: {
  view: View
  viewKey: string
  routing: AppRouting
}): JSX.Element | null {
  if (view !== 'factions') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyFactionsView
        key={viewKey}
        onOpenLoot={routing.openLoot}
        onOpenMob={routing.openMob}
        onSelectView={routing.selectView}
      />
    </Suspense>
  )
}
