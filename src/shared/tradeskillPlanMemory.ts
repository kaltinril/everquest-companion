// shared/tradeskillPlanMemory.ts — what "Make an item" remembers of the reader's choices, as the
// section remembers its other state (features/tradeskills/tradeskillMemory.ts): what was CHOSEN
// outlives a restart. The stored text is parsed here so a bad value degrades to "nothing chosen"
// and never errors; the hooks that read and write the store are the renderer's (plannerMemory.ts).

import { clampCount } from './tradeskillPlanGather'

export interface PlanMemory {
  /** The planned item's key (`sourceItemKey`); null: nothing chosen yet. */
  item: string | null
  /** The recipe the reader picked for it, by `BookRecipe.id`; null: the first one offered. */
  recipe: string | null
  /** How many of the item to gather for. */
  count: number
  /** Item keys of made materials the reader gets instead of making. */
  closed: readonly string[]
}

export const NO_PLAN: PlanMemory = { item: null, recipe: null, count: 1, closed: [] }

const MAX_KEY = 160
const MAX_CLOSED = 60

const asKey = (raw: unknown): string | null => (typeof raw === 'string' && raw !== '' && raw.length <= MAX_KEY ? raw : null)

function asKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw.slice(0, MAX_CLOSED)) {
    const key = asKey(entry)
    if (key !== null && !out.includes(key)) out.push(key)
  }
  return out
}

/** The stored plan, or `NO_PLAN` for anything unreadable. */
export function parsePlanMemory(raw: string | null): PlanMemory {
  if (raw === null) return NO_PLAN
  try {
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null) return NO_PLAN
    const { item, recipe, count, closed } = stored as Record<string, unknown>
    const key = asKey(item)
    if (key === null) return { ...NO_PLAN, count: clampCount(count) }
    return { item: key, recipe: asKey(recipe), count: clampCount(count), closed: asKeys(closed) }
  } catch {
    return NO_PLAN
  }
}

/** Another item is chosen: its first recipe, nothing closed. The count is the reader's and stays. */
export function withItem(memory: PlanMemory, item: string, recipe: string | null = null): PlanMemory {
  if (memory.item === item) return recipe === null ? memory : { ...memory, recipe }
  return { item, recipe, count: memory.count, closed: [] }
}

export function withRecipe(memory: PlanMemory, recipe: string): PlanMemory {
  return { ...memory, recipe }
}

export function withCount(memory: PlanMemory, raw: unknown): PlanMemory {
  return { ...memory, count: clampCount(raw) }
}

/** The reader gets a made material instead of making it (`closed`), or makes it again. */
export function withClosed(memory: PlanMemory, key: string, closed: boolean): PlanMemory {
  const rest = memory.closed.filter((k) => k !== key)
  return { ...memory, closed: closed ? [...rest, key].slice(-MAX_CLOSED) : rest }
}
