// useOverviewSession — what the Motes and Coin widgets measure over: the `progression` and `loot`
// modules, the record's bounds, and the rate basis the Leveling tab and the XP overlay share.
// Transport only; the arithmetic is shared/overviewCards.ts.

import { useMemo } from 'react'
import type { LootSnap, ProgressionSnap } from '@shared/types'
import type { SessionArgs } from '@shared/overviewCards'
import { useModule } from '../../lib/useModule'
import { EMPTY_PROGRESSION } from '../leveling/progressionDelta'
import { dataBounds } from '../leveling/zoneBands'
import { useScopeSelection } from '../timeslice/useScopeSelection'

const NO_LOOT: LootSnap = []

export function useOverviewSession(): SessionArgs {
  const prog = useModule<ProgressionSnap>('progression') ?? EMPTY_PROGRESSION
  const loot = useModule<LootSnap>('loot') ?? NO_LOOT
  const { basis } = useScopeSelection(window.eq)
  const bounds = useMemo(() => dataBounds(prog, []), [prog])
  return useMemo(() => ({ prog, loot, bounds, basis }), [prog, loot, bounds, basis])
}
