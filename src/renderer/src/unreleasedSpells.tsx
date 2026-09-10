// unreleasedSpells — the ONE place the review gate reaches the Spells area's component trees.
//
// THE `devTriage.tsx` SHAPE, AND THE FILE `unreleasedCharacter.tsx` USED TO BE. `UNRELEASED` is
// `import.meta.env.DEV`, a literal `false` in every `electron-vite build`, so each `const` below
// compiles to `null`, its `import()` becomes dead code, rollup removes the call, and the chunks are
// never emitted. `features/spells/**` leaves no trace in `out/renderer`. That is a STRIP and not a
// hide: there is no bundled component to un-hide and no route into one.
//
// THE DYNAMIC IMPORT IS WHAT MAKES THE STRIP POSSIBLE. A static `import SpellbookView from …` would
// pull the tree into the graph before any branch could remove it.
//
// ONE COMPONENT FOR THREE VIEWS, deliberately. App.tsx sits at this tree's 400-code-line factoring
// ceiling and its content switch is one branch per view; three more branches plus three Suspense
// wrappers is the sort of growth that pushed the loot link and the spell drill out of that file
// already (`SpellDrill`'s own header records the move). So the view test lives here, App gains one
// line, and the whole area is one import away from being deleted or graduated.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'

const LazySpellbook = UNRELEASED ? lazy(() => import('./features/spells/SpellbookView')) : null
const LazyUpgrades = UNRELEASED ? lazy(() => import('./features/spells/SpellUpgradesView')) : null
const LazyLoadout = UNRELEASED ? lazy(() => import('./features/spells/SpellLoadoutView')) : null

/**
 * Whichever Spells-area view is on screen, or nothing at all in a build without the gate.
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
