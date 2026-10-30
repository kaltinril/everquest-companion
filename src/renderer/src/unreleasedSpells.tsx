// unreleasedSpells — the Spells area's three views, lazily loaded. (The file name is from the
// retired review gate; every build draws the area.)
//
// ONE COMPONENT FOR THREE VIEWS, deliberately. App.tsx sits at this tree's 400-code-line factoring
// ceiling and its content switch is one branch per view; three more branches plus three Suspense
// wrappers is the sort of growth that pushed the loot link and the spell drill out of that file
// already (`SpellDrill`'s own header records the move). So the view test lives here, App gains one
// line, and the whole area is one import away from being deleted or graduated.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import type { View } from './appViews'

const LazySpellbook = lazy(() => import('./features/spells/SpellbookView'))
const LazyUpgrades = lazy(() => import('./features/spells/SpellUpgradesView'))
const LazyLoadout = lazy(() => import('./features/spells/SpellLoadoutView'))

/**
 * Whichever Spells-area view is on screen, or nothing at all on any other view.
 *
 * `viewKey` is the app's character-scoped remount key, threaded through for the reason every other
 * view takes it: these surfaces read one character's loadout and observed ranks, and a character
 * switch has to drop the old one's state rather than re-render into it.
 */
export default function UnreleasedSpellsView({
  view,
  viewKey
}: {
  view: View
  viewKey: string
}): JSX.Element | null {
  const Lazy =
    view === 'spells'
      ? LazySpellbook
      : view === 'spellUpgrades'
        ? LazyUpgrades
        : view === 'spellLoadout'
          ? LazyLoadout
          : null
  if (!Lazy) return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <Lazy key={viewKey} />
    </Suspense>
  )
}
