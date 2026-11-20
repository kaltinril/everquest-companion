// shared/tradeskillPicked.ts — the material lines of a workbench's picked recipe: the count a
// line states, and which of a material's own recipes can be opened under it.
//
// - Need. A material whose source states no count takes one a combine. That is what every count
//   in the section already reads it as (`crafting.combineCost`, `tradeskillMaterials.onHand`,
//   the planner's tree, the Have cell's "enough"), so the line prints 1 instead of a blank. The
//   recipe guide states no counts at all: every guide line reads 1.
// - Opening. A material some recipe makes opens in place to that recipe only when the recipe has
//   something to show: materials on the wiki, or the guide's where the wiki lists none. A recipe
//   that lists nothing (Water Flask: a Brewing recipe with a trivial and no materials) is said
//   in one line with its wiki page, and is never opened onto an empty list.

import { recipeFacts, subRecipes, type BookIndex, type BookRecipe } from './tradeskillBook'
import { guideMaterialsFor, type GuideIndex } from './tradeskillGuide'

/** How many of a material one combine takes: the stated count, or one when the source states none. */
export function needQty(material: { qty?: number }): number {
  return material.qty ?? 1
}

/** A material's own recipes, split by whether opening one would show anything. */
export interface MadeBy {
  /** Recipes with materials to show: the wiki's, or the guide's where the wiki lists none. */
  open: BookRecipe[]
  /** Recipes that list no materials anywhere: named in one line, never opened. */
  bare: BookRecipe[]
}

/**
 * The recipes that make a material, for the picked recipe's panel. `trail` is the keys of the
 * items open above it (`subRecipes`'s depth limit and loop guard): past either, both lists are
 * empty and the material reads as a leaf.
 */
export function madeBy(deps: { index: BookIndex; guides: GuideIndex }, key: string, trail: readonly string[]): MadeBy {
  const made: MadeBy = { open: [], bare: [] }
  for (const recipe of subRecipes(deps.index, key, trail)) {
    const shows = recipe.ingredients.length > 0 || guideMaterialsFor(deps.guides, recipe).length > 0
    if (shows) made.open.push(recipe)
    else made.bare.push(recipe)
  }
  return made
}

/**
 * The line for a recipe that makes a material but lists nothing to open: "Also made with Brewing
 * · trivial 21 · Brew Barrel: the wiki lists no materials for it." Its wiki page link follows.
 */
export function bareRecipeText(recipe: BookRecipe): string {
  return `Also made with ${recipeFacts(recipe, true)}: the wiki lists no materials for it.`
}
