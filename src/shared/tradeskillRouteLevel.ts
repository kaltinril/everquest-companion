// shared/tradeskillRouteLevel.ts — the two goal routes that climb the ladder from the player's
// level: Cheapest and Fastest (owner, 2026-11-20: level "efficently (for money reduction) or fast
// (you got the cash, just get me to the max level the fastest way)").
//
// Neither ranks on a chance to make a combine or to gain a point: nobody has measured either.
//
//   Cheapest  step by step, the recipe above the level whose one combine costs least at the
//             prices the player last paid. Equal costs: the one more of whose materials are held,
//             then the lower trivial. Recipes with no known cost come after every priced one.
//   Fastest   fewest stops: the highest trivial above the level whose materials can all be
//             bought, run to its trivial, then again. When none is left, the highest trivial
//             that lists its materials, and last the highest the wiki holds.

import { sourceWords, subRecipes, type BookRecipe } from './tradeskillBook'
import { buyEvidence, onHand, recipeMaterials, spellBar, type RecipeMaterial } from './tradeskillMaterials'
import { ppText } from './tradeskillMoney'
import { firstBy, levelRange, recipeStep, type RouteCtx, type RouteStep } from './tradeskillRouteStep'

/** A recipe with a trivial, and what the two routes rank on. */
interface Rated {
  recipe: BookRecipe
  trivial: number
  /** Copper per combine at the player's prices; null when any material has no price. */
  cost: number | null
  /** Combines the held materials cover; -1 when no count is known. */
  ready: number
}

function ratedRecipes(ctx: RouteCtx): Rated[] {
  const out: Rated[] = []
  for (const recipe of ctx.recipes) {
    if (recipe.trivial === undefined) continue
    out.push({ recipe, trivial: recipe.trivial, cost: ctx.facts.money.of(recipe).perCombine, ready: onHand(ctx.facts, recipe)?.ready ?? -1 })
  }
  return out
}

const byName = (a: Rated, b: Rated): number => a.recipe.item.localeCompare(b.recipe.item)

// ---- cheapest -------------------------------------------------------------------------------------

/** Least cost per combine; then more held; then the lower trivial. */
function cheaperFirst(a: Rated, b: Rated): number {
  return (a.cost ?? Infinity) - (b.cost ?? Infinity) || b.ready - a.ready || a.trivial - b.trivial || byName(a, b)
}

/** With no cost to rank on: what is held first, then the next trivial up. */
function heldThenNext(a: Rated, b: Rated): number {
  return Math.max(0, b.ready) - Math.max(0, a.ready) || a.trivial - b.trivial || byName(a, b)
}

interface CheapPick {
  pick: Rated
  /** Recipes above the level the log can price. */
  priced: number
  /** Recipes at or under the pick's trivial, above the level, that have no known cost. */
  passed: number
  /** A recipe above the level, not the pick, more of whose materials are held than any other's. */
  held: Rated | null
}

/** The most combines on hand first, then the lower trivial. */
function mostHeld(a: Rated, b: Rated): number {
  return b.ready - a.ready || a.trivial - b.trivial || byName(a, b)
}

function cheapestPick(above: readonly Rated[]): CheapPick | null {
  const priced = above.filter((r) => r.cost !== null)
  const pick = priced.length > 0 ? firstBy(priced, cheaperFirst) : firstBy(above, heldThenNext)
  if (pick === null) return null
  const passed = above.filter((r) => r !== pick && r.cost === null && r.trivial <= pick.trivial).length
  const held = firstBy(above.filter((r) => r !== pick && r.ready > 0), mostHeld)
  return { pick, priced: priced.length, passed, held }
}

/** The step's aside: a recipe the ranking passed over whose materials the player already holds. */
function heldAside(held: Rated | null): string {
  if (held === null) return ''
  const cost = held.cost === null ? '' : `, at ${ppText(held.cost)} a combine`
  return `Not picked, but on hand: materials for ${String(held.ready)} ${held.recipe.item} (trivial ${String(held.trivial)})${cost}.`
}

function passedText(passed: number, trivial: number): string {
  if (passed === 0) return ''
  const recipes = passed === 1 ? '1 other recipe' : `${String(passed)} other recipes`
  return ` ${recipes} up to ${String(trivial)} ${passed === 1 ? 'has' : 'have'} no cost in your log.`
}

function cheapestWhy(at: number, found: CheapPick): string {
  const { pick, priced, passed } = found
  const tail = passedText(passed, pick.trivial)
  if (priced === 0) {
    const held = pick.ready > 0 ? 'You hold materials for this one.' : 'This is the next trivial up.'
    return `No recipe above ${String(at)} has a cost in your log. ${held}`
  }
  if (priced === 1) return `The only recipe above ${String(at)} your log can price.${tail}`
  return `The lowest cost per combine of the ${String(priced)} recipes above ${String(at)} your log can price.${tail}`
}

/** The cheapest route's steps, from the level to the highest trivial the recipes hold. */
export function cheapestSteps(ctx: RouteCtx): RouteStep[] {
  const rated = ratedRecipes(ctx)
  const steps: RouteStep[] = []
  let at = ctx.level
  for (;;) {
    const found = cheapestPick(rated.filter((r) => r.trivial > at))
    if (found === null) return steps
    const { pick } = found
    const place = { id: pick.recipe.id, range: levelRange(at, pick.trivial), to: pick.trivial, why: cheapestWhy(at, found), aside: heldAside(found.held) }
    steps.push(recipeStep(ctx.facts, pick.recipe, place))
    at = pick.trivial
  }
}

// ---- fastest --------------------------------------------------------------------------------------

/** Whether every material of a recipe can be bought, and what else getting them takes. */
export interface Buyable {
  /** Every material can be bought, enchanted from a bought bar, or made from bought materials. */
  ok: boolean
  /** The recipe lists materials at all (the wiki's, or the recipe guide's). */
  listed: boolean
  /** Materials a spell enchants from a bought bar. */
  enchant: string[]
  /** Materials made first, from bought materials. */
  made: string[]
  /** Materials nothing says can be bought, each with the wiki's source words. */
  blockers: string[]
}

interface BuyCheck {
  ctx: RouteCtx
  memo: Map<string, Buyable>
}

/** A made material whose own recipe takes only bought materials. */
function madeFromBought(check: BuyCheck, material: RecipeMaterial, trail: readonly string[]): boolean {
  const { key } = material.ingredient
  return subRecipes(check.ctx.facts.index, key, trail).some((made) => buyableOf(check, made, [...trail, key]).ok)
}

function blockerText(material: RecipeMaterial): string {
  const words = sourceWords(material.ingredient)
  return words === '' ? material.ingredient.name : `${material.ingredient.name} (${words})`
}

/** Sorts one material into what it takes to get it. */
function noteMaterial(check: BuyCheck, material: RecipeMaterial, trail: readonly string[], out: Buyable): void {
  const { facts } = check.ctx
  const { ingredient } = material
  // A tool already in the bags needs no trip.
  if (material.tool && (facts.have(ingredient.key, ingredient.name) ?? 0) > 0) return
  if (spellBar(facts.index, ingredient) !== null) {
    out.enchant.push(ingredient.name)
    return
  }
  if (buyEvidence(facts, material) !== null) return
  if (madeFromBought(check, material, trail)) out.made.push(ingredient.name)
  else out.blockers.push(blockerText(material))
}

function buyableOf(check: BuyCheck, recipe: BookRecipe, trail: readonly string[]): Buyable {
  const had = check.memo.get(recipe.id)
  if (had !== undefined) return had
  const materials = recipeMaterials(check.ctx.facts.guides, recipe)
  const out: Buyable = { ok: false, listed: materials.length > 0, enchant: [], made: [], blockers: [] }
  for (const material of materials) noteMaterial(check, material, trail, out)
  out.ok = out.listed && out.blockers.length === 0
  // Kept only for a recipe judged from its own top: one reached deep under another may have had
  // its own made materials cut off by the depth guard.
  if (trail.length === 1) check.memo.set(recipe.id, out)
  return out
}

/** Whether a recipe can be made from bought materials alone (sub-combines and enchanting included). */
export function recipeBuyable(ctx: RouteCtx, recipe: BookRecipe): Buyable {
  return buyableOf({ ctx, memo: new Map() }, recipe, [recipe.key])
}

interface Stop {
  rated: Rated
  buy: Buyable
}

/** The highest trivial first; of equals, the one with a known and lower cost. */
function higherFirst(a: Stop, b: Stop): number {
  return b.rated.trivial - a.rated.trivial || (a.rated.cost ?? Infinity) - (b.rated.cost ?? Infinity) || byName(a.rated, b.rated)
}

function boughtWhy(at: number, buy: Buyable): string {
  const base = `The highest trivial above ${String(at)} whose materials can all be bought.`
  const spell = buy.enchant.length === 0 ? '' : ` A spell has to enchant: ${buy.enchant.join(', ')}.`
  const made = buy.made.length === 0 ? '' : ` Made first, from bought materials: ${buy.made.join(', ')}.`
  return `${base}${spell}${made}`
}

function tailWhy(ctx: RouteCtx, at: number, buy: Buyable): string {
  if (!buy.listed) return `The highest trivial the wiki holds for ${ctx.tradeskill}. The wiki lists no materials for it.`
  return `No recipe above ${String(at)} can be made from bought materials alone. This is the highest trivial that lists its materials. Not sold: ${buy.blockers.join(', ')}.`
}

/** The next stop: all bought if any recipe above is, else one that lists materials, else the highest. */
function nextStop(above: readonly Stop[]): Stop | null {
  const bought = above.filter((s) => s.buy.ok)
  if (bought.length > 0) return firstBy(bought, higherFirst)
  const listed = above.filter((s) => s.buy.listed)
  return firstBy(listed.length > 0 ? listed : above, higherFirst)
}

/** The fastest route's steps: as few stops as the bought materials allow. */
export function fastestSteps(ctx: RouteCtx): RouteStep[] {
  const check: BuyCheck = { ctx, memo: new Map() }
  const stops = ratedRecipes(ctx).map((rated): Stop => ({ rated, buy: buyableOf(check, rated.recipe, [rated.recipe.key]) }))
  const steps: RouteStep[] = []
  let at = ctx.level
  for (;;) {
    const stop = nextStop(stops.filter((s) => s.rated.trivial > at))
    if (stop === null) return steps
    const { recipe, trivial } = stop.rated
    const why = stop.buy.ok ? boughtWhy(at, stop.buy) : tailWhy(ctx, at, stop.buy)
    steps.push(recipeStep(ctx.facts, recipe, { id: recipe.id, range: levelRange(at, trivial), to: trivial, why }))
    at = trivial
  }
}
