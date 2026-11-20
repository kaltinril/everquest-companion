// tradeskills/routeMemory.ts — what the route tab remembers, by the section's own rule
// (tradeskillMemory.ts): what you CHOSE outlives a restart.
//
//   restart (localStorage)  the goal, per tradeskill (`eq.tradeskills.goal.<Tradeskill>`), the
//                           "Only use materials I have" switch, per tradeskill like the goal
//                           (`eq.tradeskills.heldOnly.<Tradeskill>`), the faction picked for
//                           the Faction goal, per tradeskill
//                           (`eq.tradeskills.faction.<Tradeskill>`, its join key), and the number
//                           of combines the shopping list is for
//
// A stored value degrades, never errors: anything unreadable is the default (`asGoal`,
// `asCombines`). A stored faction the tradeskill's list no longer holds reads as no pick
// (shared/tradeskillRouteFaction.ts `buildFactionRoute`).

import { useCallback } from 'react'
import { asGoal, type RouteGoal } from '@shared/tradeskillRoute'
import { asCombines } from '@shared/tradeskillShopping'
import type { Tradeskill } from '@shared/tradeskills'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'

const GOAL_KEY = 'eq.tradeskills.goal'
const COMBINES_KEY = 'eq.tradeskills.combines'
const HELD_ONLY_KEY = 'eq.tradeskills.heldOnly'
const FACTION_KEY = 'eq.tradeskills.faction'

/** The goal picked on one tradeskill's workbench; Cheapest until the player picks another. */
export function useGoal(tradeskill: Tradeskill): [RouteGoal, (next: RouteGoal) => void] {
  const [raw, setRaw] = useRawPref(`${GOAL_KEY}.${tradeskill}`)
  return [asGoal(raw), setRaw]
}

/** "Only use materials I have" on one tradeskill's route; off until the player turns it on. */
export function useHeldOnly(tradeskill: Tradeskill): [boolean, (next: boolean) => void] {
  return useBoolPref(`${HELD_ONLY_KEY}.${tradeskill}`, false)
}

/** The faction picked for the Faction goal on one tradeskill's route (its join key); null until the player picks. */
export function useFactionPick(tradeskill: Tradeskill): [string | null, (next: string) => void] {
  return useRawPref(`${FACTION_KEY}.${tradeskill}`)
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
