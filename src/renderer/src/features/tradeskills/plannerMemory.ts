// tradeskills/plannerMemory.ts — what "Make an item" remembers, by the section's own rule
// (tradeskillMemory.ts): what you CHOSE outlives a restart, what you TYPED lasts the session.
//
//   restart (localStorage)    whether the planner is the open screen, and the plan: the item, the
//                             recipe picked for it, how many to gather for, and the made
//                             materials marked "get it instead"
//   session (sessionStorage)  the search text
//
// The parse and the transitions are shared/tradeskillPlanMemory.ts. A stored value degrades,
// never errors.

import { useCallback, useMemo, useState } from 'react'
import { parsePlanMemory, type PlanMemory } from '@shared/tradeskillPlanMemory'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'

const PLAN_OPEN_KEY = 'eq.tradeskills.planOpen'
const PLAN_KEY = 'eq.tradeskills.plan'
const PLAN_SEARCH_KEY = 'eq.tradeskills.planSearch'
const MAX_SEARCH = 80

/** Whether the planner is the section's open screen (over Home or a workbench). */
export function usePlannerOpen(): [boolean, (next: boolean) => void] {
  return useBoolPref(PLAN_OPEN_KEY, false)
}

/** The remembered plan, live across every reader in the window. */
export function usePlanMemory(): [PlanMemory, (next: PlanMemory) => void] {
  const [raw, setRaw] = useRawPref(PLAN_KEY)
  const plan = useMemo(() => parsePlanMemory(raw), [raw])
  const set = useCallback(
    (next: PlanMemory) => {
      setRaw(JSON.stringify(next))
    },
    [setRaw]
  )
  return [plan, set]
}

function readSearch(): string {
  try {
    return (window.sessionStorage.getItem(PLAN_SEARCH_KEY) ?? '').slice(0, MAX_SEARCH)
  } catch {
    return ''
  }
}

/** The planner's search text: read on mount, written through on every change. */
export function usePlanSearch(): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(readSearch)
  const set = useCallback((next: string) => {
    const kept = next.slice(0, MAX_SEARCH)
    setValue(kept)
    try {
      window.sessionStorage.setItem(PLAN_SEARCH_KEY, kept)
    } catch {
      // A window without storage forgets; the search still works.
    }
  }, [])
  return [value, set]
}
