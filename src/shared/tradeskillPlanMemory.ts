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
  /** Item keys of materials that can be bought and that the reader chose to make. Absent for none. */
  opened?: readonly string[]
  /** Item keys of the made materials whose own materials are showing. Absent for none: the tree starts folded. */
  expanded?: readonly string[]
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

/** The two optional lists, each left off the object when it is empty. */
function withLists(memory: PlanMemory, opened: readonly string[], expanded: readonly string[]): PlanMemory {
  const { opened: _opened, expanded: _expanded, ...rest } = memory
  return { ...rest, ...(opened.length > 0 ? { opened } : {}), ...(expanded.length > 0 ? { expanded } : {}) }
}

/** The stored plan, or `NO_PLAN` for anything unreadable. */
export function parsePlanMemory(raw: string | null): PlanMemory {
  if (raw === null) return NO_PLAN
  try {
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null) return NO_PLAN
    const { item, recipe, count, closed, opened, expanded } = stored as Record<string, unknown>
    const key = asKey(item)
    if (key === null) return { ...NO_PLAN, count: clampCount(count) }
    return withLists({ item: key, recipe: asKey(recipe), count: clampCount(count), closed: asKeys(closed) }, asKeys(opened), asKeys(expanded))
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

/** The reader gets a made material instead of making it (`closed`), or chooses to make it, bought or not. */
export function withClosed(memory: PlanMemory, key: string, closed: boolean): PlanMemory {
  const rest = memory.closed.filter((k) => k !== key)
  const others = (memory.opened ?? []).filter((k) => k !== key)
  const next = { ...memory, closed: closed ? [...rest, key].slice(-MAX_CLOSED) : rest }
  return withLists(next, closed ? others : [...others, key].slice(-MAX_CLOSED), memory.expanded ?? [])
}

/** A made material's own materials are shown, or folded away. */
export function withExpanded(memory: PlanMemory, key: string, open: boolean): PlanMemory {
  const others = (memory.expanded ?? []).filter((k) => k !== key)
  return withLists(memory, memory.opened ?? [], open ? [...others, key].slice(-MAX_CLOSED) : others)
}
