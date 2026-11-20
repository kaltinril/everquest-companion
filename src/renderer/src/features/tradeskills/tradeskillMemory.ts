// tradeskills/tradeskillMemory.ts — what the Tradeskills section remembers, by the gear area's
// rule (gear/areaMemory.ts): what you CHOSE outlives a restart, what you TYPED or poked out of a
// list lasts the session.
//
//   restart (localStorage)    the open workbench (absent: Home), the Hide trivial switch
//   session (sessionStorage)  the search text and the picked recipe, for the open workbench only
//                             (and whether a link from another tab chose that recipe)
//
// The era toggle is not here: it is the shared `eq.planner.era` (plannerData.useEraOnly).
// A stored value degrades, never errors: anything unreadable is the default.

import { useCallback, useState } from 'react'
import { asTradeskill } from '@shared/tradeskillBook'
import type { Tradeskill } from '@shared/tradeskills'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'

const OPEN_KEY = 'eq.tradeskills.skill'
const HIDE_TRIVIAL_KEY = 'eq.tradeskills.hideTrivial'
const BENCH_KEY = 'eq.tradeskills.bench'
const MAX_SEARCH = 80

/** The open workbench's tradeskill, or null for Home. */
export function useOpenTradeskill(): [Tradeskill | null, (next: Tradeskill | null) => void] {
  const [raw, setRaw] = useRawPref(OPEN_KEY)
  return [asTradeskill(raw), setRaw]
}

export function useHideTrivial(): [boolean, (next: boolean) => void] {
  return useBoolPref(HIDE_TRIVIAL_KEY, false)
}

/** One workbench's session state. `pick` null: the panel follows the recipe to make next. */
export interface BenchMemory {
  query: string
  pick: string | null
  /** A link from another tab chose the pick: the panel keeps it up even when the table hides it. */
  linked: boolean
}

const FRESH: BenchMemory = { query: '', pick: null, linked: false }

function readBench(tradeskill: Tradeskill): BenchMemory {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(BENCH_KEY) ?? 'null')
    if (typeof stored !== 'object' || stored === null) return FRESH
    const { skill, query, pick, linked } = stored as Record<string, unknown>
    // Another tradeskill's search and pick mean nothing here.
    if (skill !== tradeskill) return FRESH
    return {
      query: typeof query === 'string' ? query.slice(0, MAX_SEARCH) : '',
      pick: typeof pick === 'string' ? pick : null,
      linked: linked === true
    }
  } catch {
    return FRESH
  }
}

function writeBench(tradeskill: Tradeskill, next: BenchMemory): void {
  try {
    window.sessionStorage.setItem(BENCH_KEY, JSON.stringify({ skill: tradeskill, ...next }))
  } catch {
    // A window without storage forgets; the workbench still works.
  }
}

/**
 * A link in from another tab names its recipe (appRouting `openTradeskills`): written before the
 * workbench mounts, which reads it back like any pick. The search is cleared so the table can
 * show the recipe.
 */
export function rememberLinkedPick(tradeskill: Tradeskill, recipeId: string): void {
  writeBench(tradeskill, { query: '', pick: recipeId, linked: true })
}

/** The open workbench's search and pick, read on mount and written through on every change. */
export function useBenchMemory(tradeskill: Tradeskill): [BenchMemory, (next: BenchMemory) => void] {
  const [value, setValue] = useState<BenchMemory>(() => readBench(tradeskill))
  const set = useCallback(
    (next: BenchMemory) => {
      setValue(next)
      writeBench(tradeskill, next)
    },
    [tradeskill]
  )
  return [value, set]
}
