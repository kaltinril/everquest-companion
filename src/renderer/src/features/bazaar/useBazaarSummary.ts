// useBazaarSummary — the Bazaar list in two steps, so typing stays smooth (owner ask, 2026-10-11:
// the tab froze for a moment on each character while it rebuilt every entry). Every entry's
// numbers are computed once per shape (the snapshot, All tiers as one, Price at, Days, Ignore
// outliers) and kept; a keystroke only picks and orders them (shared/bazaar.ts). The search text
// is deferred (React's useDeferredValue), so the box shows the character at once and the list
// follows when React has a moment.
//
// THE SUMMARY OUTLIVES THE TAB (lib/kept.ts, the 2026-11-06 renderer pass). The tab unmounts on
// every tab switch and `useMemo` forgets with it, so each revisit rebuilt every entry's numbers for
// the same snapshot and the same four switches. The slot is keyed on the snapshot's identity (held
// across visits by useModule), the four shape switches as primitives, and the character epoch.

import { useDeferredValue, useMemo } from 'react'
import { selectBazaarItems, summarizeBazaarItems, type BazaarQuery, type BazaarSnap, type BazaarSort, type BazaarSummary } from '@shared/bazaar'
import type { BazaarControlState } from './BazaarControls'
import { kept, type Kept } from '../../lib/kept'
import { characterEpoch } from '../../lib/characterEpoch'

const summarySlot: Kept<ReturnType<typeof summarizeBazaarItems>> = { last: null }

/** Every entry's numbers for the snapshot under the four shape switches, kept across visits. */
export function keptBazaarItems(snap: BazaarSnap | null, ctl: BazaarControlState): ReturnType<typeof summarizeBazaarItems> {
  const { combineTiers, priceTier, sinceDays, ignoreOutliers } = ctl
  return kept(summarySlot, [snap, combineTiers, priceTier, sinceDays, ignoreOutliers, characterEpoch()], () =>
    summarizeBazaarItems(snap, { combineTiers, priceTier, sinceDays, ignoreOutliers })
  )
}

export function useBazaarSummary(snap: BazaarSnap | null, ctl: BazaarControlState, sort: BazaarSort, keep: BazaarQuery['keep']): BazaarSummary {
  const text = useDeferredValue(ctl.text)
  const all = keptBazaarItems(snap, ctl)
  return useMemo(() => selectBazaarItems(all, { text, dir: ctl.dir, sort, keep, minPrice: ctl.minPrice }), [all, text, ctl.dir, ctl.minPrice, sort, keep])
}
