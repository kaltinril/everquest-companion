// slayer/slayerRows.ts — the Slayer tab's view models and its stored choices. Pure: no React.
//
// A COUNTER ROW is one open counter with what the plan says about it: how many kills are left,
// whether a General achievement still requires it, and how many zones and spawn points the
// catalog knows for it. The list's default order is LEAST LEFT FIRST, because the counter a
// player can finish tonight is the one worth seeing first.
//
// THE STORED CHOICES (`eq.slayer.*` in localStorage) exist because a view unmounts on every tab
// switch: the picks, the level cap and the two toggles are things the user set on purpose. Every
// read degrades rather than throws; a pick naming a counter the newest dump no longer lists
// (it was completed) is simply not drawn.

import {
  achievementKey,
  requiredByGoal,
  type SlayerCounter,
  type SlayerRecord
} from '@shared/outputs/slayer'
import { counterId, slayerTarget, type SlayerTarget } from '@shared/slayer/slayerPlan'

export interface CounterRow {
  id: string
  counter: SlayerCounter
  target: SlayerTarget
  left: number
  /** 0 to 100 */
  pct: number
  required: boolean
  zones: number
  spawns: number
}

export interface CounterFilters {
  query: string
  requiredOnly: boolean
}

export type Reach = ReadonlyMap<string, { zones: number; spawns: number }>

export function counterRows(record: SlayerRecord, reach: Reach): CounterRow[] {
  const required = requiredByGoal(record.goals)
  return record.counters.map((counter) => {
    const id = counterId(counter)
    const at = reach.get(id)
    return {
      id,
      counter,
      target: slayerTarget(counter),
      left: Math.max(0, counter.need - counter.have),
      pct: counter.need > 0 ? Math.min(100, (100 * counter.have) / counter.need) : 0,
      required: required.get(achievementKey(counter.achievement)) ?? true,
      zones: at?.zones ?? 0,
      spawns: at?.spawns ?? 0
    }
  })
}

function matchesQuery(row: CounterRow, query: string): boolean {
  if (query === '') return true
  const hay = `${row.counter.achievement} ${row.counter.label} ${row.counter.group}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => hay.includes(word))
}

/** The rows the list draws: filtered, least left first, then by name. */
export function visibleCounters(rows: readonly CounterRow[], f: CounterFilters): CounterRow[] {
  return rows
    .filter((r) => (!f.requiredOnly || r.required) && matchesQuery(r, f.query.trim()))
    .sort((a, b) => a.left - b.left || a.counter.achievement.localeCompare(b.counter.achievement))
}

/** How few kills away a counter must be for the "Nearly done" pick to take it. */
export const NEARLY_DONE = 50

/** The counters a player could finish soonest that the catalog knows a place for. */
export function nearlyDone(rows: readonly CounterRow[]): string[] {
  return rows.filter((r) => r.left <= NEARLY_DONE && r.zones > 0).map((r) => r.id)
}

// ---- the stored choices ------------------------------------------------------------------------

export const PICKS_KEY = 'eq.slayer.picks'
export const MAX_LEVEL_KEY = 'eq.slayer.maxLevel'
export const OUT_OF_ERA_KEY = 'eq.slayer.outOfEra'
export const REQUIRED_ONLY_KEY = 'eq.slayer.requiredOnly'

/** The slice of `Storage` this module uses, so a test can hand it a plain object. */
export interface PrefStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function read(store: PrefStore, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

export function savePref(key: string, value: string, store: PrefStore = localStorage): void {
  try {
    store.setItem(key, value)
  } catch {
    // A full or forbidden store costs the choice its persistence, never the tab.
  }
}

export function loadPicks(store: PrefStore = localStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(read(store, PICKS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

/**
 * The level cap: a number, `null` for no cap, or `undefined` when the user has never set one
 * (the tab then follows the character's own level).
 */
export function loadMaxLevel(store: PrefStore = localStorage): number | null | undefined {
  const raw = read(store, MAX_LEVEL_KEY)
  if (raw === null) return undefined
  if (raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 200 ? n : undefined
}

export function loadFlag(key: string, store: PrefStore = localStorage): boolean {
  return read(store, key) === '1'
}
