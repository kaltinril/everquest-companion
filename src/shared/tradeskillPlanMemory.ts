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
  /** Item keys of the made materials whose own materials are showing. Absent for none: the tree starts folded. */
  expanded?: readonly string[]
}

export const NO_PLAN: PlanMemory = { item: null, recipe: null, count: 1 }

const MAX_KEY = 160
const MAX_EXPANDED = 60

const asKey = (raw: unknown): string | null => (typeof raw === 'string' && raw !== '' && raw.length <= MAX_KEY ? raw : null)

function asKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw.slice(0, MAX_EXPANDED)) {
    const key = asKey(entry)
    if (key !== null && !out.includes(key)) out.push(key)
  }
  return out
}

/** The plan with this list of unfolded materials, the field left off when it is empty. */
function withList(memory: PlanMemory, expanded: readonly string[]): PlanMemory {
  const { expanded: _expanded, ...rest } = memory
  return expanded.length > 0 ? { ...rest, expanded } : rest
}

/** The stored plan, or `NO_PLAN` for anything unreadable. Fields of older builds are dropped. */
export function parsePlanMemory(raw: string | null): PlanMemory {
  if (raw === null) return NO_PLAN
  try {
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null) return NO_PLAN
    const { item, recipe, count, expanded } = stored as Record<string, unknown>
    const key = asKey(item)
    if (key === null) return { ...NO_PLAN, count: clampCount(count) }
    return withList({ item: key, recipe: asKey(recipe), count: clampCount(count) }, asKeys(expanded))
  } catch {
    return NO_PLAN
  }
}

/** Another item is chosen: its first recipe, nothing unfolded. The count is the reader's and stays. */
export function withItem(memory: PlanMemory, item: string, recipe: string | null = null): PlanMemory {
  if (memory.item === item) return recipe === null ? memory : { ...memory, recipe }
  return { item, recipe, count: memory.count }
}

export function withRecipe(memory: PlanMemory, recipe: string): PlanMemory {
  return { ...memory, recipe }
}

export function withCount(memory: PlanMemory, raw: unknown): PlanMemory {
  return { ...memory, count: clampCount(raw) }
}

/** A made material's own materials are shown, or folded away. */
export function withExpanded(memory: PlanMemory, key: string, open: boolean): PlanMemory {
  const others = (memory.expanded ?? []).filter((k) => k !== key)
  return withList(memory, open ? [...others, key].slice(-MAX_EXPANDED) : others)
}
