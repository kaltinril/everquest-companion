// tradeskills/tradeskillMemory.ts — what the Tradeskills section remembers, by the gear area's
// rule (gear/areaMemory.ts): what you CHOSE outlives a restart, what you TYPED or poked out of a
// list lasts the session.
//
//   restart (localStorage)    the open workbench (absent: Home), the recipe table's switches
//                             (Hide trivial, Can make now, Missing on the wiki)
//   session (sessionStorage)  the search text, the picked recipe and the open tab (recipes, your
//                             route, your history, the guides), for the open workbench only (and
//                             whether a link from another tab chose that recipe)
//
// The route tab's own choices (the goal per tradeskill, the number of combines) are routeMemory.ts.
// The era toggle is not here: it is the shared `eq.planner.era` (plannerData.useEraOnly).
// A stored value degrades, never errors: anything unreadable is the default.

import { useCallback, useState } from 'react'
import { asTradeskill } from '@shared/tradeskillBook'
import type { Tradeskill } from '@shared/tradeskills'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'

const OPEN_KEY = 'eq.tradeskills.skill'
const HIDE_TRIVIAL_KEY = 'eq.tradeskills.hideTrivial'
const CAN_MAKE_KEY = 'eq.tradeskills.canMake'
const WIKI_GAPS_KEY = 'eq.tradeskills.wikiGaps'
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

/** The recipe table's "Can make now" switch. */
export function useCanMakeOnly(): [boolean, (next: boolean) => void] {
  return useBoolPref(CAN_MAKE_KEY, false)
}

/** The recipe table's "Missing on the wiki" switch. */
export function useWikiGapsOnly(): [boolean, (next: boolean) => void] {
  return useBoolPref(WIKI_GAPS_KEY, false)
}

/** The workbench's tabs: the recipe book, the goal route, the player's own combines, the leveling guide. */
export const BENCH_TABS = ['recipes', 'route', 'history', 'guides'] as const

export type BenchTab = (typeof BENCH_TABS)[number]

function asTab(raw: unknown): BenchTab {
  return BENCH_TABS.find((tab) => tab === raw) ?? 'recipes'
}

/** One workbench's session state. `pick` null: the panel follows the recipe to make next. */
export interface BenchMemory {
  query: string
  pick: string | null
  /** A link from another tab chose the pick: the panel keeps it up even when the table hides it. */
  linked: boolean
  tab: BenchTab
}

const FRESH: BenchMemory = { query: '', pick: null, linked: false, tab: 'recipes' }

function readBench(tradeskill: Tradeskill): BenchMemory {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(BENCH_KEY) ?? 'null')
    if (typeof stored !== 'object' || stored === null) return FRESH
    const { skill, query, pick, linked, tab } = stored as Record<string, unknown>
    // Another tradeskill's search and pick mean nothing here.
    if (skill !== tradeskill) return FRESH
    return {
      query: typeof query === 'string' ? query.slice(0, MAX_SEARCH) : '',
      pick: typeof pick === 'string' ? pick : null,
      linked: linked === true,
      tab: asTab(tab)
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
 * show the recipe, and the recipes tab is the one opened.
 */
export function rememberLinkedPick(tradeskill: Tradeskill, recipeId: string): void {
  writeBench(tradeskill, { query: '', pick: recipeId, linked: true, tab: 'recipes' })
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
