// shared/tradeskillWished.ts — "Working towards" on the Tradeskills Home (owner, 2026-11-20:
// "perhaps people can 'wishlist' a crafted item in some way so they can work towards it"): the
// wish list's items that some recipe makes, each with the recipe, the player's level in its
// tradeskill, and how much of what one takes is already held.
//
// - A wish is listed when the recipe book holds a recipe that makes its item, whatever the wish
//   was added for and on whichever tab. A wished item nothing makes is not this panel's.
// - The recipe shown is the planner's own first choice (`tradeskillPlan.itemRecipes`), and the
//   materials are the planner's gather list for one (`tradeskillPlanGather.gatherFor`): made
//   materials opened to their leaves, a held made material used before any is made. So the
//   numbers here and on "Make an item" are one count.
// - Counts are of materials held. Nothing here says a combine will succeed or how many it takes:
//   no success rate is measured for this game.
// - With no inventory dump and no depot line nothing says what is held: the panel then states
//   how many materials one takes and no held count.

import type { SkillRow } from './skills'
import { NO_TRIVIAL_TEXT, tradeskillLevel, type BookRecipe } from './tradeskillBook'
import { PLAN_NO_MATERIALS_TEXT, itemRecipes, pickRecipe, planTree, type PlanDeps } from './tradeskillPlan'
import { gatherFor, type Gather, type PlanHave } from './tradeskillPlanGather'

/** A material one of the item still takes, and how many of it. */
export interface WishedMissing {
  name: string
  toGet: number
}

export interface WishedCraft {
  /** The wished item's key: the wish list's own, and the planner's. */
  key: string
  /** The recipe shown: the first of the item's recipes in the planner's order. */
  recipe: BookRecipe
  /** How many recipes make the item. */
  recipes: number
  /** The player's level in the recipe's tradeskill; null when the log never showed it, or the recipe names none. */
  level: number | null
  /** How many of the item itself are held; null when nothing says. */
  held: number | null
  /** Leaf materials one of the item takes; 0 when neither the wiki nor the guide lists any. */
  materials: number
  /** Of those, how many are held in full; null when nothing says what is held. */
  covered: number | null
  /** What is still to get for one, in the plan's order; empty when nothing says, or all is held. */
  missing: WishedMissing[]
}

export interface WishedAsk {
  deps: PlanDeps
  /** The wish list's entries, in its own order. */
  wishes: readonly { itemKey: string }[]
  /** The engine's skill rows. */
  rows: readonly SkillRow[]
  /** Null when nothing says what is held (no inventory dump, no depot line). */
  have: PlanHave | null
}

function coverage(gather: Gather, known: boolean): Pick<WishedCraft, 'materials' | 'covered' | 'missing'> {
  if (!known) return { materials: gather.leaves.length, covered: null, missing: [] }
  const missing: WishedMissing[] = []
  for (const line of gather.leaves) if (line.toGet > 0) missing.push({ name: line.node.name, toGet: line.toGet })
  return { materials: gather.leaves.length, covered: gather.leaves.length - missing.length, missing }
}

function wishedCraft(ask: WishedAsk, key: string, recipes: readonly BookRecipe[], recipe: BookRecipe): WishedCraft {
  const have: PlanHave = ask.have ?? (() => null)
  const gather = gatherFor(planTree(ask.deps, recipe), { count: 1, have, price: () => null })
  return {
    key,
    recipe,
    recipes: recipes.length,
    level: recipe.tradeskill === undefined ? null : tradeskillLevel(ask.rows, recipe.tradeskill),
    held: ask.have === null ? null : ask.have({ key, name: recipe.item, linked: true }),
    ...coverage(gather, ask.have !== null)
  }
}

/** The wished items some recipe makes, in the wish list's order; each item once. */
export function wishedCrafts(ask: WishedAsk): WishedCraft[] {
  const out: WishedCraft[] = []
  const seen = new Set<string>()
  for (const wish of ask.wishes) {
    if (seen.has(wish.itemKey)) continue
    seen.add(wish.itemKey)
    const recipes = itemRecipes(ask.deps, wish.itemKey)
    const recipe = pickRecipe(recipes, null)
    if (recipe !== null) out.push(wishedCraft(ask, wish.itemKey, recipes, recipe))
  }
  return out
}

// ---- the words on screen ----------------------------------------------------------------------

export const WISHED_HEADING = 'Working towards'

export const WISHED_SUBTITLE = 'Items on your wish list that a recipe makes. Click one to open its plan.'

/** "Tailoring, trivial 222. Your level: 205." The level is left out for a combine that names no tradeskill. */
export function wishedSkillText(wished: Pick<WishedCraft, 'recipe' | 'level'>): string {
  const { recipe, level } = wished
  const trivial = recipe.trivial === undefined ? NO_TRIVIAL_TEXT : `trivial ${String(recipe.trivial)}`
  if (recipe.tradeskill === undefined) return `${recipe.skillWord ?? 'No tradeskill named'}, ${trivial}.`
  const yours = level === null ? 'Not in your log.' : `Your level: ${String(level)}.`
  return `${recipe.tradeskill}, ${trivial}. ${yours}`
}

const MISSING_NAMES = 4

function missingText(missing: readonly WishedMissing[]): string {
  const names = missing.slice(0, MISSING_NAMES).map((m) => (m.toGet > 1 ? `${String(m.toGet)} x ${m.name}` : m.name))
  const more = missing.length - MISSING_NAMES
  return names.join(', ') + (more > 0 ? ` and ${String(more)} more` : '')
}

/**
 * What one of the item takes against what is held: "You hold 3 of the 5 materials one takes.
 * Still to get: 2 x Aviak Eggs, Griffon Feathers." With no held count, only how many it takes.
 */
export function wishedMaterialsText(wished: Pick<WishedCraft, 'materials' | 'covered' | 'missing'>): string {
  const { materials, covered, missing } = wished
  if (materials === 0) return PLAN_NO_MATERIALS_TEXT
  const count = materials === 1 ? '1 material' : `${String(materials)} materials`
  if (covered === null) return `One takes ${count}.`
  if (missing.length === 0) return `You hold everything one takes: ${count}.`
  const held = covered === 0 ? 'You hold none' : `You hold ${String(covered)}`
  return `${held} of the ${count} one takes. Still to get: ${missingText(missing)}.`
}

/** "You hold 2." for a wished item already held; '' for none, or when nothing says. */
export function wishedHeldText(wished: Pick<WishedCraft, 'held'>): string {
  return wished.held === null || wished.held === 0 ? '' : `You hold ${String(wished.held)}.`
}
