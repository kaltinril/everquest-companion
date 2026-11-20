// shared/tradeskillRoute.ts — the goal routes of a workbench (owner, 2026-11-20: "level
// efficently (for money reduction) or fast ... or fun ... or even faction based ... or lastly
// maybe it's for an item you need"; "this person should think DANG this is THE PLACE to go").
//
// One tradeskill, the player's level, a goal: a route from the level up, as steps the screen
// only maps over. Four goals are built:
//
//   cheapest   tradeskillRouteLevel.ts   least cost per combine at the player's own prices
//   fastest    tradeskillRouteLevel.ts   fewest stops, bought materials only
//   explore    tradeskillRouteExplore.ts never-made recipes, grouped by what the data says
//   guide      tradeskillRouteExplore.ts the community leveling guide's steps, credited
//
// "Only use materials I have" (`RouteAsk.heldOnly`, tradeskillRouteHeld.ts) narrows Cheapest and
// Fastest to recipes the player holds every material for. It never re-orders a route: holding a
// material does not change its price (owner, 2026-11-20).
//
// Faction is NOT a goal here: no record holds what a quest rewards, so there is nothing to rank
// and no placeholder is drawn. The one-item goal is the planner's, not a workbench route.
//
// WHAT NO ROUTE STATES: a chance to make a combine, a chance to gain a point, a number of
// combines to a level, a loss per point, a total cost of a stretch. Nobody has measured this
// game's success or skill-up rate, and each of those would need a guessed formula
// (tradeskillRouteStep.ts). `basis` says what a route IS ranked on, `caveats` what it is not.

import { skillRecipes, type BookRecipe } from './tradeskillBook'
import { LEVELING_GUIDE_ID, RECIPE_GUIDE_ID, guideCreditOf, levelingCreditText, noRouteText } from './tradeskillGuide'
import { communitySteps, explore, type Explored } from './tradeskillRouteExplore'
import { HELD_BASIS, HELD_NOT_MEASURED, HELD_SHARED, heldEmptyText, heldEndText, heldSteps, isHeldGoal, type HeldGoal } from './tradeskillRouteHeld'
import { cheapestSteps, fastestSteps } from './tradeskillRouteLevel'
import type { RouteCtx, RouteFacts, RouteStep } from './tradeskillRouteStep'
import type { Tradeskill } from './tradeskills'

export const ROUTE_GOALS = ['cheapest', 'fastest', 'explore', 'guide'] as const

export type RouteGoal = (typeof ROUTE_GOALS)[number]

export const GOAL_LABELS: Record<RouteGoal, string> = {
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  explore: 'Explore',
  guide: 'Community route'
}

/** A stored or typed goal, or the default: anything unreadable is Cheapest. */
export function asGoal(raw: unknown): RouteGoal {
  return ROUTE_GOALS.find((goal) => goal === raw) ?? 'cheapest'
}

/** Steps listed on a climbing route before the rest become a count. */
export const ROUTE_STEP_CAP = 12

export interface RouteGroup {
  id: string
  /** '' for a route that is one list. */
  heading: string
  steps: RouteStep[]
  /** Steps past the cap, counted and not listed. */
  more: number
}

export interface Route {
  goal: RouteGoal
  /** Built only from recipes the player holds every material for (Cheapest and Fastest). */
  heldOnly: boolean
  /** What the route ranks on, in one or two plain sentences. */
  basis: string
  /** What it does not know or does not rank on, each a sentence of its own. */
  caveats: string[]
  groups: RouteGroup[]
  /** The step the shopping list is for: the route's first. */
  next: RouteStep | null
  /** The highest trivial the tradeskill's listed recipes hold; null when none is rated. */
  top: number | null
  /** The credit of each guide the route drew from. */
  credits: string[]
  /** Why the route has no step; '' when it has. */
  empty: string
}

export interface RouteAsk {
  tradeskill: Tradeskill
  /** Null: the log never showed the skill. Routes then start from 0, as the recipe book does. */
  level: number | null
  goal: RouteGoal
  /** "Only use materials I have". Read by Cheapest and Fastest; the other goals ignore it. */
  heldOnly?: boolean
}

const NOT_MEASURED = 'Nobody has measured how often a combine fails or raises the skill in this game, so no chance, no number of combines and no total is shown.'

const BASIS: Record<RouteGoal, string> = {
  cheapest:
    'Step by step from your level: the recipe whose one combine costs least at the prices you last paid. A made item can be sold back; a failed combine loses its materials.',
  fastest: 'Fewest stops: from your level, the highest trivial whose materials can all be bought, run to its trivial, then the next. Cost is not ranked.',
  explore: 'Recipes you have never made, grouped by what the wiki and the guides say of each. Nothing here is ranked.',
  guide: 'The community leveling guide\'s steps from your level, in the guide\'s own order.'
}

const FAR_BELOW = 'More combines fail the further your level is below a recipe\'s trivial, and a recipe run from far below it fails most. The rate is not measured, so it is not in this ranking.'

/** Under an Explore route that drew a reason from a guide. */
const GUIDE_REASONS_CREDIT = `What a guide says of a recipe is from ${guideCreditOf(LEVELING_GUIDE_ID)} and ${guideCreditOf(RECIPE_GUIDE_ID)}.`

function topTrivial(recipes: readonly BookRecipe[]): number | null {
  let top: number | null = null
  for (const recipe of recipes) {
    if (recipe.trivial !== undefined && (top === null || recipe.trivial > top)) top = recipe.trivial
  }
  return top
}

function capped(steps: RouteStep[]): RouteGroup[] {
  if (steps.length === 0) return []
  return [{ id: 'route', heading: '', steps: steps.slice(0, ROUTE_STEP_CAP), more: Math.max(0, steps.length - ROUTE_STEP_CAP) }]
}

/** Why a climbing route has no step. */
function ladderEmpty(ctx: RouteCtx, top: number | null): string {
  if (top === null) return `The wiki lists no ${ctx.tradeskill} recipe with a trivial, so there is nothing to route.`
  return `Your level is at or past ${String(top)}, the highest ${ctx.tradeskill} trivial the wiki holds.`
}

/** Nothing above the level has a price: say what would give the route one. */
function unpricedCaveat(steps: readonly RouteStep[]): string[] {
  if (steps.length === 0 || steps.some((step) => step.cost !== null)) return []
  return ['Your log shows no price for any recipe above your level, so nothing here is ranked on cost. Buy one of each material and the cost of its recipes appears.']
}

function exploreBasis(found: Explored): string {
  const recipes = found.total === 1 ? '1 recipe' : `${String(found.total)} recipes`
  return `${recipes} you have never made, from trivial ${String(found.floor)} up, grouped by what the wiki and the guides say of each. Nothing here is ranked.`
}

function exploreCaveats(found: Explored): string[] {
  if (found.plain === 0) return []
  const recipes = found.plain === 1 ? '1 more never-made recipe has' : `${String(found.plain)} more never-made recipes have`
  return [`${recipes} nothing in the data to set them apart. They are on the Recipes tab.`]
}

function exploreEmpty(ctx: RouteCtx, found: Explored): string {
  if (!ctx.facts.craft.served) return 'Your log is still being read: what you have made is not known yet.'
  if (found.total === 0) return `Your log shows you have made every ${ctx.tradeskill} recipe the wiki rates from trivial ${String(found.floor)} up.`
  return found.groups.length === 0 ? 'Nothing in the data sets the recipes you have not made apart from each other.' : ''
}

interface Built {
  groups: RouteGroup[]
  basis: string
  caveats: string[]
  credits: string[]
  empty: string
}

function cheapestRoute(ctx: RouteCtx, top: number | null): Built {
  const steps = cheapestSteps(ctx)
  return {
    groups: capped(steps),
    basis: BASIS.cheapest,
    caveats: [...unpricedCaveat(steps), FAR_BELOW, NOT_MEASURED],
    credits: [],
    empty: steps.length === 0 ? ladderEmpty(ctx, top) : ''
  }
}

function fastestRoute(ctx: RouteCtx, top: number | null): Built {
  const steps = fastestSteps(ctx)
  return { groups: capped(steps), basis: BASIS.fastest, caveats: [FAR_BELOW, NOT_MEASURED], credits: [], empty: steps.length === 0 ? ladderEmpty(ctx, top) : '' }
}

/** Cheapest or Fastest from what is held alone. Past the top of the ladder it says that, as the open route does. */
function heldRoute(ctx: RouteCtx, goal: HeldGoal, top: number | null): Built {
  const steps = heldSteps(ctx, goal)
  const built = { groups: capped(steps), basis: HELD_BASIS[goal], caveats: [HELD_SHARED, FAR_BELOW, HELD_NOT_MEASURED], credits: [] }
  if (steps.length > 0) return { ...built, empty: '' }
  const past = top === null || ctx.level >= top
  return { ...built, empty: past ? ladderEmpty(ctx, top) : heldEmptyText(ctx) }
}

function exploreRoute(ctx: RouteCtx): Built {
  const found = explore(ctx)
  const drewGuide = found.groups.some((group) => group.id === 'guide')
  return {
    groups: found.groups,
    basis: found.total === 0 ? BASIS.explore : exploreBasis(found),
    caveats: exploreCaveats(found),
    credits: drewGuide ? [GUIDE_REASONS_CREDIT] : [],
    empty: exploreEmpty(ctx, found)
  }
}

function guideRoute(ctx: RouteCtx, level: number | null): Built {
  const steps = communitySteps(ctx, level)
  if (steps === null) return { basis: BASIS.guide, caveats: [], groups: [], credits: [], empty: noRouteText(ctx.tradeskill) }
  const empty = steps.length === 0 ? 'Your level is past the last step of the guide\'s route.' : ''
  return { basis: BASIS.guide, caveats: [], groups: capped(steps), credits: [levelingCreditText()], empty }
}

/** The route for one goal: what to make from the level up, and what the choice rests on. */
export function buildRoute(facts: RouteFacts, ask: RouteAsk): Route {
  const recipes = skillRecipes(facts.index, ask.tradeskill)
  const ctx: RouteCtx = { facts, tradeskill: ask.tradeskill, level: ask.level ?? 0, recipes }
  const top = topTrivial(recipes)
  const builders: Record<RouteGoal, () => Built> = {
    cheapest: () => cheapestRoute(ctx, top),
    fastest: () => fastestRoute(ctx, top),
    explore: () => exploreRoute(ctx),
    guide: () => guideRoute(ctx, ask.level)
  }
  const held = ask.heldOnly === true && isHeldGoal(ask.goal) ? ask.goal : null
  const built = held === null ? builders[ask.goal]() : heldRoute(ctx, held, top)
  return { goal: ask.goal, heldOnly: held !== null, ...built, next: built.groups.at(0)?.steps.at(0) ?? null, top }
}

// ---- the words on screen --------------------------------------------------------------------------

/** What a cap left out: "8 more steps, up to 295, not listed." on a climbing route; '' when nothing was cut. */
export function moreStepsText(group: RouteGroup, top: number | null): string {
  if (group.more === 0) return ''
  if (group.heading !== '') return `${String(group.more)} more of these, on the Recipes tab.`
  const steps = group.more === 1 ? '1 more step' : `${String(group.more)} more steps`
  return top === null ? `${steps}, not listed.` : `${steps}, up to ${String(top)}, not listed.`
}

/** The top `moreStepsText` names for a route's capped steps: the wiki's, or none on a held-only route, which stops earlier. */
export function capTop(route: Route): number | null {
  return route.heldOnly ? null : route.top
}

/** The foot of a climbing route: where the data ends. '' for a route that does not climb. */
export function routeEndText(route: Route, tradeskill: Tradeskill): string {
  if (route.top === null || route.empty !== '' || !isHeldGoal(route.goal)) return ''
  // A held-only route ends where the held materials do. With steps past the cap the listed ones are not its end.
  if (route.heldOnly) return route.groups.some((group) => group.more > 0) ? '' : heldEndText(route.groups.flatMap((group) => group.steps))
  return `The route stops at ${String(route.top)}: the highest ${tradeskill} trivial the wiki holds.`
}

export const ROUTE_STEP_TIP = 'Open this recipe on the Recipes tab.'

export const NO_NEXT_STEP_TEXT = 'No step to shop for.'

export const NO_STEP_RECIPE_TEXT = 'This step has no wiki recipe to list materials from. The guide\'s own materials for it are on the From the guides tab.'
