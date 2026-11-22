// shared/tradeskillRouteStep.ts — one step of a goal route on a workbench, and the words it is
// drawn with. Every goal (tradeskillRoute.ts) builds its steps here, so a step states the same
// facts whatever chose it: the item, what one combine costs at the player's own prices, what a
// made one last sold for, how many combines the held materials cover, and the player's own record.
//
// THE LAW OF THIS FILE: nobody has measured this game's chance to make a combine or to gain a
// skill point from one. So no step states a chance, an expected number of combines, an expected
// loss or a total for a stretch of levels: each would need a guessed formula. A step states what
// the wiki, the guides and the player's own log state, and its `why` says what it was ranked on.

import type { CraftedItemRow } from './crafting'
import type { BookRecipe } from './tradeskillBook'
import { levelsText, recipeHistory } from './tradeskillHistory'
import { onHand, onHandText, recipeMaterials, type MaterialFacts, type OnHand } from './tradeskillMaterials'
import { differenceText, noCostText, ppText, type MoneyBook, type RecipeMoney } from './tradeskillMoney'
import type { Tradeskill } from './tradeskills'

/** What a route is built from: the recipe book, the player's log, the guides, the held counts and the costs. */
export interface RouteFacts extends MaterialFacts {
  money: MoneyBook
}

/** One tradeskill at one level: what every goal walks. */
export interface RouteCtx {
  facts: RouteFacts
  tradeskill: Tradeskill
  /** The log's level; a skill the log never showed is 0, as on the recipe book. */
  level: number
  /** The tradeskill's recipes in ladder order, the era setting already applied. */
  recipes: readonly BookRecipe[]
  /** The Recipes tab's Hide trivial switch. Explore then lists nothing at or under the level. */
  hideTrivial?: boolean
}

export interface RouteStep {
  /** Unique among a route's steps. */
  id: string
  /** The wiki recipe the step makes; null for a guide step whose name is no wiki item's. */
  recipe: BookRecipe | null
  name: string
  /** `name` is a wiki item's own: it gets the standard item link. */
  linked: boolean
  /** The stretch of skill, as words: "205 to 207", "trivial 215", or a guide's own range. */
  range: string
  /** The trivial the step runs to; null when the guide states no number. */
  to: number | null
  /** Why this recipe, in a few plain words: what it was ranked on. */
  why: string
  /** What else the data says of the stretch (a recipe whose materials are already held); '' for none. */
  aside: string
  /** Copper one combine costs at the prices last paid; null when any material has no price. */
  cost: number | null
  /** Copper the newest sale line of the made item paid; null when the log shows no sale. */
  sale: number | null
  /** The cost and the sale as sentences; '' when the data states neither and no reason. */
  money: string
  hand: OnHand | null
  /** "Materials on hand for 23."; '' when no count is known. */
  handText: string
  /** The player's own combines of it: "Your own record: failed 29 of 121 combines."; '' for none. */
  record: string
}

// ---- the words ------------------------------------------------------------------------------------

const RETURNED_ON_FAILURE = /returned on (?:failure|success or failure)/i

/** What a failed combine costs, from the wiki's own source words. */
function failText(recipe: BookRecipe): string {
  const back = recipe.ingredients.filter((i) => (i.sources ?? []).some((word) => RETURNED_ON_FAILURE.test(word))).map((i) => i.name)
  if (back.length === 0) return 'A failed combine loses its materials.'
  return `A failed combine loses its materials, but the wiki marks as returned on failure: ${back.join(', ')}.`
}

/** The cost of one combine, or why none is stated. */
function costText(recipe: BookRecipe, money: RecipeMoney, listed: boolean): string {
  if (money.perCombine !== null) return `${ppText(money.perCombine)} a combine at the prices you last paid.`
  if (!listed) return 'The wiki lists no materials for this recipe, so no cost is stated.'
  if (recipe.ingredients.length === 0) return 'Its materials are the recipe guide\'s list, which the cost does not read yet.'
  return noCostText(money)
}

/** What a made one brought back. The sale line states no quantity, so a recipe that yields several says so. */
function saleText(money: RecipeMoney, single: boolean): string {
  if (money.sale === null) return money.perCombine === null ? '' : 'Your log shows no sale of it.'
  const paid = ppText(money.sale.lastCopper)
  if (!single) return `Your last sale line of it paid ${paid}; the line states no quantity.`
  const against = differenceText(money)
  return against === '' ? `A made one last sold for ${paid}.` : `A made one last sold for ${paid}: ${against}.`
}

/**
 * A recipe's money as sentences: what a combine costs, what a made one last sold for, and what a
 * failed one loses. Only prices the player's log states; a missing one is named, never filled in.
 */
export function stepMoneyText(recipe: BookRecipe, money: RecipeMoney, listed: boolean): string {
  const parts = [costText(recipe, money, listed), saleText(money, (recipe.yieldQty ?? 1) === 1)]
  if (money.perCombine !== null) parts.push(failText(recipe))
  return parts.filter((part) => part !== '').join(' ')
}

/**
 * The player's own combines of a recipe's item, as a record and never as a forecast:
 * "Your own record: failed 29 of 121 combines, 33 raises (114 to 146)."
 */
export function recordText(row: CraftedItemRow | null): string {
  const combines = row === null ? 0 : row.made + row.failed
  if (row === null || combines === 0) return ''
  const word = combines === 1 ? 'combine' : 'combines'
  const levels = levelsText(row)
  const raises = row.raises === 0 ? '' : `, ${String(row.raises)} ${row.raises === 1 ? 'raise' : 'raises'}${levels === '' ? '' : ` (${levels})`}`
  return `Your own record: failed ${String(row.failed)} of ${String(combines)} ${word}${raises}.`
}

/** "205 to 207". */
export function levelRange(from: number, to: number): string {
  return `${String(from)} to ${String(to)}`
}

// ---- building a step ------------------------------------------------------------------------------

/** Where a step sits on its route and why it is there. */
export interface StepPlace {
  id: string
  range: string
  to: number | null
  why: string
  aside?: string
}

/**
 * Where a step's combine is done, beside its name: "in a Loom". '' when the wiki names no
 * container. A step has to say it (owner, 2026-11-20: "it looks like some things require a LOOM"):
 * a sewing kit is carried, a loom is where the game put it.
 */
export function containerText(recipe: Pick<BookRecipe, 'container'> | null): string {
  const container = recipe?.container?.replace(/\s+/g, ' ').trim() ?? ''
  if (container === '') return ''
  return `in ${/^[aeiou]/i.test(container) ? 'an' : 'a'} ${container}`
}

/** A step that makes a wiki recipe, with everything the data states of it. */
export function recipeStep(facts: RouteFacts, recipe: BookRecipe, place: StepPlace): RouteStep {
  const money = facts.money.of(recipe)
  const hand = onHand(facts, recipe)
  const listed = recipeMaterials(facts.guides, recipe).length > 0
  return {
    ...place,
    aside: place.aside ?? '',
    recipe,
    name: recipe.item,
    linked: true,
    cost: money.perCombine,
    sale: money.sale?.lastCopper ?? null,
    money: stepMoneyText(recipe, money, listed),
    hand,
    handText: onHandText(hand),
    record: recordText(recipeHistory(facts.craft, recipe))
  }
}

/** A step no wiki recipe is joined to: a guide's name, `linked` when it is still a wiki item's own. */
export function plainStep(name: string, linked: boolean, place: StepPlace): RouteStep {
  return { ...place, aside: place.aside ?? '', recipe: null, name, linked, cost: null, sale: null, money: '', hand: null, handText: '', record: '' }
}

/** The one of a list an order puts first; null for an empty list. A scan, not a sort. */
export function firstBy<T>(list: readonly T[], order: (a: T, b: T) => number): T | null {
  let best: T | null = null
  for (const item of list) {
    if (best === null || order(item, best) < 0) best = item
  }
  return best
}
