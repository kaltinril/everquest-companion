// shared/tradeskillHeld.ts — what the player can make from what is held right now: the Recipes
// tab's "can make" mark and its "Can make now" switch, the planner's mark, and whether anything
// says what is held at all (the same question the route's "Only use materials I have" asks).
//
// - Held counts are the section's own: the inventory dump, or the log's depot count for a
//   material when that line is newer (`tradeskillMaterials.haveLookup`). Nothing else is read.
// - A recipe can be made now when every material one combine uses up is held for at least one
//   combine, and every tool it gives back is held. The count is the fewest combines any one
//   material covers (`tradeskillMaterials.onHand`): a count of materials, never a forecast. A
//   failed combine uses its materials up too, and how often one fails is not measured.
// - A recipe that lists no material a combine uses up (the wiki lists none and the guide none, or
//   only tools) is never marked: there is nothing to count.
// - Each recipe is judged alone. Two marked recipes may want the same material; the route's
//   "Only use materials I have" is where one stock is shared out (tradeskillRouteHeld.ts).
// - With no dump and no depot line nothing says what is held: no mark is drawn and the switches
//   are disabled, with `HELD_UNKNOWN_TEXT` beside them.

import type { BookRecipe, LadderFilter } from './tradeskillBook'
import type { CraftBook } from './tradeskillHistory'
import { onHand, type HeldFacts, type MaterialFacts } from './tradeskillMaterials'
import { WIKI_GAP_FILTER } from './tradeskillWiki'

/** Whether anything says what the player holds: an inventory dump, or a depot line in the log. */
export function heldKnown(held: Pick<HeldFacts, 'index'>, craft: Pick<CraftBook, 'depot'>): boolean {
  return held.index !== null || craft.depot.size > 0
}

/** Beside a switch that needs the held counts: the short reason; the long one is its hover. */
export const HELD_UNKNOWN_SHORT = 'Needs an inventory dump or a depot count in your log.'

export const HELD_UNKNOWN_TEXT = 'Nothing says what you hold yet: write an inventory dump with /outputfile inventory, or use the tradeskill depot so your log states a count.'

/** How many combines of a recipe the held materials cover; 0 when it cannot be made now, or nothing can be counted. */
export function combinesHeld(facts: Pick<MaterialFacts, 'index' | 'guides' | 'have'>, recipe: BookRecipe): number {
  return onHand(facts, recipe)?.ready ?? 0
}

/** Every recipe of a list that can be made now, by its `id`, with the combines the held materials cover. */
export function makeableNow(facts: Pick<MaterialFacts, 'index' | 'guides' | 'have'>, recipes: readonly BookRecipe[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  for (const recipe of recipes) {
    const combines = combinesHeld(facts, recipe)
    if (combines > 0) out.set(recipe.id, combines)
  }
  return out
}

/** The Recipes tab's "Can make now" switch: only the recipes `makeableNow` holds. */
export function canMakeFilter(makeable: ReadonlyMap<string, number>): LadderFilter {
  return { keep: (recipe) => makeable.has(recipe.id), emptyText: 'You do not hold every material for any recipe listed here.' }
}

/** The switches of the recipe table that are on, as the ladder reads them. `makeable` null: "Can make now" is off. */
export function benchFilters(makeable: ReadonlyMap<string, number> | null, wikiGaps: boolean): LadderFilter[] {
  return [...(makeable === null ? [] : [canMakeFilter(makeable)]), ...(wikiGaps ? [WIKI_GAP_FILTER] : [])]
}

/** The switch's words, with how many of the tradeskill's recipes it keeps. */
export function canMakeSwitchLabel(count: number | null): string {
  return count === null ? 'Can make now' : `Can make now (${String(count)})`
}

/** The mark on a recipe: "can make 23". */
export function canMakeLabel(combines: number): string {
  return `can make ${String(combines)}`
}

/** The mark's hover: what was counted, and what was not. */
export function canMakeTip(combines: number): string {
  const count = combines === 1 ? '1 combine' : `${String(combines)} combines`
  return `You hold every material this recipe uses up, enough for ${count}. A failed combine uses its materials up too.`
}

export const CAN_MAKE_SWITCH_TIP = 'Only recipes you hold every material for, counted from your inventory dump and the depot counts in your log.'

// ---- the route's switch -----------------------------------------------------------------------

export const HELD_ONLY_LABEL = 'Only use materials I have'

export const HELD_ONLY_TIP = 'Builds the route only from recipes you hold every material for. A material you hold still counts at the price you last paid for it.'

/** Under the switch on a goal it does not change (Explore, the community route). */
export const HELD_ONLY_GOALS_TEXT = 'Applies to Cheapest and Fastest, and to Faction.'

/**
 * Why the route's switch cannot be used, or '' when it can: nothing says what is held, or the
 * goal is not one the switch changes (`climbing`: `tradeskillRoute.heldOnlyApplies`).
 */
export function heldOnlyBlockedText(known: boolean, climbing: boolean): string {
  if (!known) return HELD_UNKNOWN_SHORT
  return climbing ? '' : HELD_ONLY_GOALS_TEXT
}
