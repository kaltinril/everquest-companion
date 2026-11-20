// shared/tradeskillRouteHeld.ts — "Only use materials I have" on a workbench's route (owner,
// 2026-11-20: "the price of the materials doesn't change just because I already have them. but...
// you can add a 'only use materials i have' option that would be helpful for some people perhaps?").
//
// With the switch on, Cheapest and Fastest climb the ladder through recipes the player holds
// every material for, and nothing else:
//
//   Cheapest  of the recipes above the level that can be made from what is held, the one whose
//             combine costs least at the prices last paid. A held material still counts at its
//             price: holding it changes which recipes are on the list, never their order.
//             Recipes the log cannot price come after every priced one, lowest trivial first.
//   Fastest   of those same recipes, the highest trivial.
//
// ONE STOCK. A step takes every combine its held materials cover, and what it uses is taken out
// before the next step is looked for, so one Ruby is never promised to two steps. A tool the
// combine gives back is not used up. The count is the Have cell's own (the inventory dump, or
// the log's newer depot line); a material nothing states a count for is not held.
//
// A step states how many combines the held materials cover. That is a count of materials. It is
// NOT how many combines the stretch takes: nobody has measured how often a combine raises the
// skill or fails, so the route cannot say whether the materials reach the step's trivial, and
// its lines say so.

import type { BookRecipe } from './tradeskillBook'
import { onHand, recipeMaterials, type HaveLookup } from './tradeskillMaterials'
import { firstBy, levelRange, recipeStep, type RouteCtx, type RouteStep } from './tradeskillRouteStep'

/** The goals the switch changes: the two that climb the ladder. */
export type HeldGoal = 'cheapest' | 'fastest'

export function isHeldGoal(goal: string): goal is HeldGoal {
  return goal === 'cheapest' || goal === 'fastest'
}

/** What is held and not yet taken by a step above, by item key. */
interface Stock {
  base: HaveLookup
  left: Map<string, number>
}

function haveLeft(stock: Stock): HaveLookup {
  return (key, name) => stock.left.get(key) ?? stock.base(key, name)
}

/** A recipe the stock covers at least one combine of. */
interface Ready {
  recipe: BookRecipe
  trivial: number
  /** Copper per combine at the player's prices; null when any material has no price. */
  cost: number | null
  combines: number
}

/** The recipes above `at` that what is left of the stock can make. */
function readyAbove(ctx: RouteCtx, stock: Stock, at: number): Ready[] {
  const facts = { index: ctx.facts.index, guides: ctx.facts.guides, have: haveLeft(stock) }
  const out: Ready[] = []
  for (const recipe of ctx.recipes) {
    if (recipe.trivial === undefined || recipe.trivial <= at) continue
    const combines = onHand(facts, recipe)?.ready ?? 0
    if (combines > 0) out.push({ recipe, trivial: recipe.trivial, cost: ctx.facts.money.of(recipe).perCombine, combines })
  }
  return out
}

/** Takes out of the stock what a step's combines use up. */
function take(ctx: RouteCtx, stock: Stock, pick: Ready): void {
  for (const material of recipeMaterials(ctx.facts.guides, pick.recipe)) {
    if (material.tool) continue
    const { key, name, qty } = material.ingredient
    const left = stock.left.get(key) ?? stock.base(key, name) ?? 0
    stock.left.set(key, Math.max(0, left - Math.max(1, qty ?? 1) * pick.combines))
  }
}

const byName = (a: Ready, b: Ready): number => a.recipe.item.localeCompare(b.recipe.item)

/** Cost alone, then the lower trivial. How much is held is not in the order. */
function cheaperFirst(a: Ready, b: Ready): number {
  return (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.trivial - b.trivial || byName(a, b)
}

function higherFirst(a: Ready, b: Ready): number {
  return b.trivial - a.trivial || byName(a, b)
}

function heldWhy(goal: HeldGoal, at: number, ready: readonly Ready[], pick: Ready): string {
  const pool = `above ${String(at)} you hold every material for`
  if (ready.length === 1) return `The only recipe ${pool}.`
  const all = `the ${String(ready.length)} recipes ${pool}`
  if (goal === 'fastest') return `The highest trivial of ${all}.`
  if (pick.cost === null) return `None of ${all} has a cost in your log. This is the lowest trivial of them.`
  const priced = ready.filter((r) => r.cost !== null).length
  if (priced < ready.length) return `The lowest cost per combine of the ${String(priced)} your log can price, out of ${all}.`
  return `The lowest cost per combine of ${all}.`
}

/** "Your held materials cover 23 combines." On a later step: what the steps above use is already out. */
export function heldCoverText(combines: number, later: boolean): string {
  const count = combines === 1 ? '1 combine' : `${String(combines)} combines`
  return `Your held materials cover ${count}${later ? ', after what the steps above use' : ''}.`
}

/** The held-only route's steps for one goal: each made from what the steps above left. */
export function heldSteps(ctx: RouteCtx, goal: HeldGoal): RouteStep[] {
  const stock: Stock = { base: ctx.facts.have, left: new Map() }
  const order = goal === 'cheapest' ? cheaperFirst : higherFirst
  const steps: RouteStep[] = []
  let at = ctx.level
  for (;;) {
    const ready = readyAbove(ctx, stock, at)
    const pick = firstBy(ready, order)
    if (pick === null) return steps
    const place = { id: pick.recipe.id, range: levelRange(at, pick.trivial), to: pick.trivial, why: heldWhy(goal, at, ready, pick) }
    // The step's count is what is LEFT of the stock, not the whole of what is held.
    const hand = { ready: pick.combines, enchanted: null, bars: [] }
    steps.push({ ...recipeStep(ctx.facts, pick.recipe, place), hand, handText: heldCoverText(pick.combines, steps.length > 0) })
    take(ctx, stock, pick)
    at = pick.trivial
  }
}

// ---- the words on screen ----------------------------------------------------------------------

export const HELD_BASIS: Record<HeldGoal, string> = {
  cheapest:
    'Only recipes you hold every material for. Step by step from your level: of those, the one whose combine costs least at the prices you last paid. A material you hold still counts at its price.',
  fastest: 'Only recipes you hold every material for. From your level: the highest trivial among them, then the next. Cost is not ranked.'
}

export const HELD_SHARED = 'A step counts the combines your held materials cover, and what a step uses is not counted again for a later one.'

export const HELD_NOT_MEASURED =
  'Nobody has measured how often a combine fails or raises the skill in this game, so no chance and no total is shown, and the route cannot say whether the combines you hold materials for reach a step\'s trivial.'

/** Why the held-only route has no step, in one line. */
export function heldEmptyText(ctx: RouteCtx): string {
  return `You do not hold every material for any ${ctx.tradeskill} recipe above ${String(ctx.level)}.`
}

/** Where the held-only route ends; '' for a route with no step. */
export function heldEndText(steps: readonly RouteStep[]): string {
  const to = steps.at(-1)?.to
  return to == null ? '' : `The route stops at ${String(to)}: you hold every material for no recipe above it.`
}
