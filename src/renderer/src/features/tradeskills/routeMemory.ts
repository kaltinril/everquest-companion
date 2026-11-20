// tradeskills/routeMemory.ts — what the route tab remembers, by the section's own rule
// (tradeskillMemory.ts): what you CHOSE outlives a restart.
//
//   restart (localStorage)  the goal, per tradeskill (`eq.tradeskills.goal.<Tradeskill>`), and
//                           the number of combines the shopping list is for
//
// A stored value degrades, never errors: anything unreadable is the default (`asGoal`,
// `asCombines`).

import { useCallback } from 'react'
import { asGoal, type RouteGoal } from '@shared/tradeskillRoute'
import { asCombines } from '@shared/tradeskillShopping'
import type { Tradeskill } from '@shared/tradeskills'
import { useRawPref } from '../combat/useCombatPrefs'

const GOAL_KEY = 'eq.tradeskills.goal'
const COMBINES_KEY = 'eq.tradeskills.combines'

/** The goal picked on one tradeskill's workbench; Cheapest until the player picks another. */
export function useGoal(tradeskill: Tradeskill): [RouteGoal, (next: RouteGoal) => void] {
  const [raw, setRaw] = useRawPref(`${GOAL_KEY}.${tradeskill}`)
  return [asGoal(raw), setRaw]
}

/** How many combines the shopping list is for, on every workbench. */
export function useCombines(): [number, (next: number) => void] {
  const [raw, setRaw] = useRawPref(COMBINES_KEY)
  const set = useCallback(
    (next: number) => {
      setRaw(String(asCombines(next)))
    },
    [setRaw]
  )
  return [asCombines(raw), set]
}
