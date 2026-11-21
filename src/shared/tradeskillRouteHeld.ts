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
// MADE ON THE WAY (owner, 2026-11-20: "silk bandages with the silk thread i just made... this seems
// like the easy way why isn't it recommending this"). Two things count as held besides what the
// dump lists:
//   - what a step above makes: its combines' yield joins the stock, and the step that uses it says
//     the count is one fewer for each combine above that fails;
//   - a material the stock is short of that one recipe of this tradeskill makes from what IS
//     held: the step says to make it first. One level deep: that recipe's own materials must be
//     held as they are.
//
// EQUALS. Recipes at the picked one's trivial and cost that the stock also covers are named on the
// step, so a tie hides nothing. Between equals the pick is the one more later recipes of the
// tradeskill use as a material, then the name.
//
// A step states how many combines the held materials cover. That is a count of materials. It is
// NOT how many combines the stretch takes: nobody has measured how often a combine raises the
// skill or fails, so the route cannot say whether the materials reach the step's trivial, and
// its lines say so.

import type { BookRecipe } from './tradeskillBook'
import { recipeMaterials, type HaveLookup, type RecipeMaterial } from './tradeskillMaterials'
import { firstBy, levelRange, recipeStep, type RouteCtx, type RouteStep } from './tradeskillRouteStep'

/** The goals the switch changes: the two that climb the ladder. */
export type HeldGoal = 'cheapest' | 'fastest'

export function isHeldGoal(goal: string): goal is HeldGoal {
  return goal === 'cheapest' || goal === 'fastest'
}

/** What is held and not yet taken by a step above, by item key, with what the steps above make. */
interface Stock {
  base: HaveLookup
  left: Map<string, number>
  /** The items a step above makes, by key, with the name to say. */
  made: Map<string, string>
}

/** A material made first, from what is held, because the stock is short of it. */
interface Premake {
  recipe: BookRecipe
  combines: number
}

/** What a number of combines of a recipe leaves of the stock, and what has to be made first. */
interface Cover {
  combines: number
  premakes: Premake[]
  /** The stock's counts after it, for the keys it touches. */
  left: Map<string, number>
  /** Materials it draws that a step above makes. */
  fromAbove: string[]
}

/** A recipe the stock covers at least one combine of. */
interface Ready {
  recipe: BookRecipe
  trivial: number
  /** Copper per combine at the player's prices; null when any material has no price. */
  cost: number | null
  cover: Cover
  /** Recipes of the tradeskill above this one that use what it makes. */
  feeds: number
}

/** No recipe is counted past this many combines: a search bound, far above any stock. */
const MAX_COMBINES = 1 << 16

const yieldOf = (recipe: BookRecipe): number => Math.max(1, recipe.yieldQty ?? 1)

/** This tradeskill's own recipe for a material, the lowest trivial first; null when none lists materials. */
function makerOf(ctx: RouteCtx, material: RecipeMaterial, parent: BookRecipe): BookRecipe | null {
  const makers = (ctx.facts.index.byItem.get(material.ingredient.key) ?? []).filter(
    (r) => r.id !== parent.id && r.tradeskill === ctx.tradeskill && r.trivial !== undefined && recipeMaterials(ctx.facts.guides, r).length > 0
  )
  return firstBy(makers, (a, b) => (a.trivial ?? 0) - (b.trivial ?? 0))
}

/**
 * Whether the stock covers `combines` of a recipe, each material taken in turn from one running
 * count. A material the stock is short of is made first when `makerOf` has a recipe whose own
 * materials the stock covers. Null when it does not reach, or when a count is unknown.
 */
function tryCover(ctx: RouteCtx, stock: Stock, recipe: BookRecipe, combines: number): Cover | null {
  const left = new Map<string, number>()
  const fromAbove: string[] = []
  /** Takes a material for `runs` combines: the shortfall, or null when nothing states a count. */
  const spend = (material: RecipeMaterial, runs: number): number | null => {
    const { key, name, qty } = material.ingredient
    const have = left.get(key) ?? stock.left.get(key) ?? stock.base(key, name)
    if (have === null) return null
    if (stock.made.has(key) && !fromAbove.includes(name)) fromAbove.push(name)
    if (material.tool) return have > 0 ? 0 : 1
    const need = Math.max(1, qty ?? 1) * runs
    left.set(key, Math.max(0, have - need))
    return Math.max(0, need - have)
  }
  const premakes: Premake[] = []
  for (const material of recipeMaterials(ctx.facts.guides, recipe)) {
    const short = spend(material, combines)
    if (short === null) return null
    if (short === 0) continue
    const maker = makerOf(ctx, material, recipe)
    if (maker === null) return null
    const runs = Math.ceil(short / yieldOf(maker))
    if (recipeMaterials(ctx.facts.guides, maker).some((input) => spend(input, runs) !== 0)) return null
    left.set(material.ingredient.key, runs * yieldOf(maker) - short)
    premakes.push({ recipe: maker, combines: runs })
  }
  return { combines, premakes, left, fromAbove }
}

/** The most combines of a recipe the stock covers; null for none, or for a recipe a combine uses nothing up in. */
function coverOf(ctx: RouteCtx, stock: Stock, recipe: BookRecipe): Cover | null {
  if (recipeMaterials(ctx.facts.guides, recipe).every((material) => material.tool)) return null
  let best = tryCover(ctx, stock, recipe, 1)
  if (best === null) return null
  let over = 2
  for (let next = tryCover(ctx, stock, recipe, over); next !== null && over < MAX_COMBINES; next = tryCover(ctx, stock, recipe, over)) {
    best = next
    over *= 2
  }
  // The answer is in [best.combines, over): halve the gap.
  while (over - best.combines > 1) {
    const mid = Math.floor((best.combines + over) / 2)
    const at = tryCover(ctx, stock, recipe, mid)
    if (at === null) over = mid
    else best = at
  }
  return best
}

/** How many recipes above a recipe's trivial use what it makes: the tradeskill's own ladder. */
function feedCounter(ctx: RouteCtx): (recipe: BookRecipe) => number {
  const users = new Map<string, number[]>()
  for (const recipe of ctx.recipes) {
    if (recipe.trivial === undefined) continue
    for (const { ingredient } of recipeMaterials(ctx.facts.guides, recipe)) users.set(ingredient.key, [...(users.get(ingredient.key) ?? []), recipe.trivial])
  }
  return (recipe) => (users.get(recipe.key) ?? []).filter((trivial) => trivial > (recipe.trivial ?? 0)).length
}

/** The recipes above `at` that what is left of the stock can make. */
function readyAbove(ctx: RouteCtx, stock: Stock, at: number, feeds: (recipe: BookRecipe) => number): Ready[] {
  const out: Ready[] = []
  for (const recipe of ctx.recipes) {
    if (recipe.trivial === undefined || recipe.trivial <= at) continue
    const cover = coverOf(ctx, stock, recipe)
    if (cover !== null) out.push({ recipe, trivial: recipe.trivial, cost: ctx.facts.money.of(recipe).perCombine, cover, feeds: feeds(recipe) })
  }
  return out
}

/** Takes out of the stock what a step uses, and puts in what its combines make. */
function take(stock: Stock, pick: Ready): void {
  for (const [key, count] of pick.cover.left) stock.left.set(key, count)
  const { key, item } = pick.recipe
  const had = stock.left.get(key) ?? stock.base(key, item) ?? 0
  stock.left.set(key, had + pick.cover.combines * yieldOf(pick.recipe))
  stock.made.set(key, item)
}

/** Between equals: the one more later recipes use, then the name. */
const amongEquals = (a: Ready, b: Ready): number => b.feeds - a.feeds || a.recipe.item.localeCompare(b.recipe.item)

/** Cost alone, then the lower trivial. How much is held is not in the order. */
function cheaperFirst(a: Ready, b: Ready): number {
  return (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.trivial - b.trivial || amongEquals(a, b)
}

function higherFirst(a: Ready, b: Ready): number {
  return b.trivial - a.trivial || amongEquals(a, b)
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

const countOf = (n: number, one: string): string => (n === 1 ? `1 ${one}` : `${String(n)} ${one}s`)

/** How many equals a step names before the rest become a count. */
const EQUALS_CAP = 4

/** "Same trivial, and your materials cover it too: Silk Thread."; '' when the pick has no equal. */
export function equalsText(names: readonly string[]): string {
  if (names.length === 0) return ''
  const more = names.length > EQUALS_CAP ? ` and ${String(names.length - EQUALS_CAP)} more` : ''
  return `Same trivial, and your materials cover ${names.length === 1 ? 'it' : 'them'} too: ${names.slice(0, EQUALS_CAP).join(', ')}${more}.`
}

/** "Silk Swatch is a material in 12 Tailoring recipes above it."; '' for none. */
export function feedsText(item: string, tradeskill: string, feeds: number): string {
  return feeds === 0 ? '' : `${item} is a material in ${countOf(feeds, `${tradeskill} recipe`)} above it.`
}

/** "Make first, from what you hold: Silk Thread (100 combines, trivial 15)."; '' when nothing is. */
export function premakeText(premakes: readonly { item: string; combines: number; trivial?: number }[]): string {
  if (premakes.length === 0) return ''
  const parts = premakes.map((p) => `${p.item} (${countOf(p.combines, 'combine')}${p.trivial === undefined ? '' : `, trivial ${String(p.trivial)}`})`)
  return `Make first, from what you hold: ${parts.join(', ')}.`
}

/** "Your held materials cover 23 combines." On a later step: what the steps above use is already out. */
export function heldCoverText(combines: number, later: boolean): string {
  return `Your held materials cover ${countOf(combines, 'combine')}${later ? ', after what the steps above use' : ''}.`
}

/** What a count that leans on an earlier step's output has to say; '' when it leans on none. */
export function fromAboveText(names: readonly string[]): string {
  return names.length === 0 ? '' : ` That counts the ${names.join(' and ')} the steps above make: one fewer for each combine there that fails.`
}

/** What else the step says: what to make first, its equals, and what its item goes into. */
function heldAside(ctx: RouteCtx, ready: readonly Ready[], pick: Ready): string {
  const equals = ready.filter((r) => r !== pick && r.trivial === pick.trivial && r.cost === pick.cost).map((r) => r.recipe.item)
  const premakes = pick.cover.premakes.map((p) => ({ item: p.recipe.item, combines: p.combines, trivial: p.recipe.trivial }))
  return [premakeText(premakes), equalsText(equals), feedsText(pick.recipe.item, ctx.tradeskill, pick.feeds)].filter((part) => part !== '').join(' ')
}

/** The held-only route's steps for one goal: each made from what the steps above left. */
export function heldSteps(ctx: RouteCtx, goal: HeldGoal): RouteStep[] {
  const stock: Stock = { base: ctx.facts.have, left: new Map(), made: new Map() }
  const order = goal === 'cheapest' ? cheaperFirst : higherFirst
  const feeds = feedCounter(ctx)
  const steps: RouteStep[] = []
  let at = ctx.level
  for (;;) {
    const ready = readyAbove(ctx, stock, at, feeds)
    const pick = firstBy(ready, order)
    if (pick === null) return steps
    const place = { id: pick.recipe.id, range: levelRange(at, pick.trivial), to: pick.trivial, why: heldWhy(goal, at, ready, pick), aside: heldAside(ctx, ready, pick) }
    // The step's count is what is LEFT of the stock, not the whole of what is held.
    const hand = { ready: pick.cover.combines, enchanted: null, bars: [] }
    const handText = heldCoverText(pick.cover.combines, steps.length > 0) + fromAboveText(pick.cover.fromAbove)
    steps.push({ ...recipeStep(ctx.facts, pick.recipe, place), hand, handText })
    take(stock, pick)
    at = pick.trivial
  }
}

// ---- the words on screen ----------------------------------------------------------------------

const HELD_POOL = 'Only recipes you hold every material for. A material you can make from what you hold counts.'

export const HELD_BASIS: Record<HeldGoal, string> = {
  cheapest: `${HELD_POOL} Step by step from your level: the one whose combine costs least at the prices you last paid. A material you hold still counts at its price.`,
  fastest: `${HELD_POOL} From your level: the highest trivial among them, then the next. Cost is not ranked.`
}

export const HELD_SHARED =
  'A step counts the combines your held materials cover, what a step uses is not counted again for a later one, and what a step makes can be used by a later one.'

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
