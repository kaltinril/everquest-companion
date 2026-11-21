// shared/tradeskillRouteExplore.ts — the two goal routes that are not a ranking: Explore and the
// community route (owner, 2026-11-20: "fun (you want to explore more trivial or unique or fun
// recipes)"; "Use wiki, the data from the google drive download, and my logs as help").
//
//   Explore    recipes the player has never made, from a little under the level up, grouped by
//              what the data says sets each apart: a quest takes the made item, a community guide
//              names it, a combine yields something else or uses a container few recipes use, a
//              material is dropped and not sold, the made item has stats or effects of its own.
//              A recipe sits in the first group that fits. The reasons are the data's own words:
//              no flavour text is written here.
//   Community  the leveling guide's steps from the player's level, in the guide's order, each
//              joined to the wiki recipe its name is exactly. Another player's work: credited.

import { sourceItemKey } from './itemSources'
import { yieldText, type BookRecipe } from './tradeskillBook'
import type { GuideStep } from './guideData'
import { placedLadder, stepRange, wikiNameOf, type PlacedStep } from './tradeskillGuide'
import { recipeHistory } from './tradeskillHistory'
import { lastPaid } from './tradeskillMoney'
import { plainStep, recipeStep, type RouteCtx, type RouteStep } from './tradeskillRouteStep'

/** How far under the level a never-made recipe still counts as near it. */
export const EXPLORE_NEAR = 20
/** Steps listed per group before the rest become a count. */
export const EXPLORE_GROUP_CAP = 8
/** A container is unusual when under this share of the tradeskill's recipes use it. */
const UNUSUAL_SHARE = 0.05
/** ... and only once the tradeskill has this many recipes that state a container. */
const UNUSUAL_FLOOR = 20
const STATS_SHOWN = 4

export const EXPLORE_GROUPS = ['quest', 'guide', 'odd', 'dropped', 'worn'] as const

export type ExploreGroupId = (typeof EXPLORE_GROUPS)[number]

export const EXPLORE_HEADINGS: Record<ExploreGroupId, string> = {
  quest: 'Used in a quest',
  guide: 'Named by a community guide',
  odd: 'A different yield or an unusual container',
  dropped: 'Needs a dropped material',
  worn: 'Has stats or effects of its own'
}

export interface ExploreGroup {
  id: ExploreGroupId
  heading: string
  steps: RouteStep[]
  /** Recipes of the group past the cap. */
  more: number
}

export interface Explored {
  groups: ExploreGroup[]
  /** Never-made recipes in range, whether or not a group took them. */
  total: number
  /** Of those, the ones nothing in the data sets apart: not listed. */
  plain: number
  /** The lowest trivial looked at. */
  floor: number
}

/** One key for a guide's spelling of an item and the wiki's name of the same item. */
function guideItemKey(ctx: RouteCtx, raw: string): string {
  return sourceItemKey(wikiNameOf(ctx.facts.guides, raw) ?? raw)
}

/** The items the leveling guide's route names for the tradeskill, alternates included. */
function routeCallouts(ctx: RouteCtx, out: Map<string, string>): void {
  const route = ctx.facts.guides.payload.leveling[ctx.tradeskill]
  if (route === undefined) return
  for (const step of [...route.steps, ...route.alternates]) {
    const key = guideItemKey(ctx, step.item)
    if (!out.has(key)) out.set(key, `On the leveling guide's route for ${stepRange(step)}.`)
  }
}

/** The items the recipe guide lists for the tradeskill, with the guide's own remarks. */
function recipeCallouts(ctx: RouteCtx, out: Map<string, string>): void {
  for (const recipe of ctx.facts.guides.payload.recipes[ctx.tradeskill]?.recipes ?? []) {
    const key = guideItemKey(ctx, recipe.item)
    // A recipe filed on this tab that the guide says belongs to another tradeskill is not this one's.
    const own = recipe.tradeskill === undefined || recipe.tradeskill === ctx.tradeskill
    if (out.has(key) || !own) continue
    const notes = recipe.notes.length === 0 ? '' : ` It notes: ${recipe.notes.join('; ')}.`
    out.set(key, `Listed in the recipe guide.${notes}`)
  }
}

/** What the two guides say of the tradeskill's items, by the made item's key: the route's word first. */
function guideCallouts(ctx: RouteCtx): Map<string, string> {
  const out = new Map<string, string>()
  routeCallouts(ctx, out)
  recipeCallouts(ctx, out)
  return out
}

/** How many of the tradeskill's recipes use each container, and how many state one. */
function containerCounts(recipes: readonly BookRecipe[]): { by: Map<string, number>; stated: number } {
  const by = new Map<string, number>()
  let stated = 0
  for (const recipe of recipes) {
    if (recipe.container === undefined) continue
    stated += 1
    by.set(recipe.container, (by.get(recipe.container) ?? 0) + 1)
  }
  return { by, stated }
}

interface Reasons {
  ctx: RouteCtx
  callouts: Map<string, string>
  containers: { by: Map<string, number>; stated: number }
}

function questWhy(recipe: BookRecipe): string | null {
  const quests = recipe.quests ?? []
  if (quests.length === 0) return null
  if (quests.length === 1) return `The quest ${quests[0] ?? ''} takes it.`
  return `The quest ${quests[0] ?? ''} and ${String(quests.length - 1)} more take it.`
}

function oddWhy(r: Reasons, recipe: BookRecipe): string | null {
  const makes = yieldText(recipe)
  if (makes !== null) return `One combine makes ${makes}.`
  const { by, stated } = r.containers
  const uses = recipe.container === undefined ? 0 : (by.get(recipe.container) ?? 0)
  if (recipe.container === undefined || stated < UNUSUAL_FLOOR || uses / stated >= UNUSUAL_SHARE) return null
  return `Made in a ${recipe.container}: ${String(uses)} of ${String(stated)} ${r.ctx.tradeskill} recipes use one.`
}

const DROPPED_WORD = /dropped/i
const BOUGHT_WORD = /bought/i

function droppedWhy(r: Reasons, recipe: BookRecipe): string | null {
  const names = recipe.ingredients
    .filter((i) => {
      const words = i.sources ?? []
      if (!words.some((w) => DROPPED_WORD.test(w)) || words.some((w) => BOUGHT_WORD.test(w))) return false
      return lastPaid(r.ctx.facts.craft, i.key) === null
    })
    .map((i) => i.name)
  return names.length === 0 ? null : `Dropped, and not sold by a merchant: ${names.join(', ')}.`
}

function wornWhy(recipe: BookRecipe): string | null {
  const worn = recipe.worn
  if (worn === undefined) return null
  const shown = worn.stats.slice(0, STATS_SHOWN).join(', ')
  const more = worn.stats.length > STATS_SHOWN ? ` and ${String(worn.stats.length - STATS_SHOWN)} more` : ''
  const stats = shown === '' ? '' : `Its own stats: ${shown}${more}.`
  const effects = worn.effects.length === 0 ? '' : `Effect: ${worn.effects.join(', ')}.`
  return [stats, effects].filter((part) => part !== '').join(' ')
}

/** The first group that fits a recipe, with the data's own reason; null when nothing sets it apart. */
function reasonOf(r: Reasons, recipe: BookRecipe): { group: ExploreGroupId; why: string } | null {
  const tries: [ExploreGroupId, string | null][] = [
    ['quest', questWhy(recipe)],
    ['guide', r.callouts.get(recipe.key) ?? null],
    ['odd', oddWhy(r, recipe)],
    ['dropped', droppedWhy(r, recipe)],
    ['worn', wornWhy(recipe)]
  ]
  const found = tries.find(([, why]) => why !== null)
  return found === undefined || found[1] === null ? null : { group: found[0], why: found[1] }
}

function exploreRange(trivial: number, level: number): string {
  return trivial > level ? `trivial ${String(trivial)}` : `trivial ${String(trivial)}, at or under your level`
}

/**
 * The never-made recipes near and above the level, grouped. Empty until the engine has served
 * the crafting module: what the player has made is not known before that.
 */
export function explore(ctx: RouteCtx): Explored {
  const floor = Math.max(0, ctx.level - EXPLORE_NEAR)
  const reasons: Reasons = { ctx, callouts: guideCallouts(ctx), containers: containerCounts(ctx.recipes) }
  const groups = new Map<ExploreGroupId, ExploreGroup>(EXPLORE_GROUPS.map((id) => [id, { id, heading: EXPLORE_HEADINGS[id], steps: [], more: 0 }]))
  const out: Explored = { groups: [], total: 0, plain: 0, floor }
  if (!ctx.facts.craft.served) return out
  for (const recipe of ctx.recipes) {
    if (recipe.trivial === undefined || recipe.trivial < floor) continue
    if ((recipeHistory(ctx.facts.craft, recipe)?.made ?? 0) > 0) continue
    out.total += 1
    const reason = reasonOf(reasons, recipe)
    const group = reason === null ? undefined : groups.get(reason.group)
    if (reason === null || group === undefined) out.plain += 1
    else if (group.steps.length >= EXPLORE_GROUP_CAP) group.more += 1
    else group.steps.push(recipeStep(ctx.facts, recipe, { id: recipe.id, range: exploreRange(recipe.trivial, ctx.level), to: recipe.trivial, why: reason.why }))
  }
  out.groups = [...groups.values()].filter((group) => group.steps.length > 0)
  return out
}

// ---- the community route --------------------------------------------------------------------------

/** The tradeskill's own recipe that makes a guide's item, else any recipe that makes it. */
function recipeNamed(ctx: RouteCtx, wikiName: string): BookRecipe | null {
  const key = sourceItemKey(wikiName)
  return ctx.recipes.find((r) => r.key === key) ?? ctx.facts.index.byItem.get(key)?.at(0) ?? null
}

/** What the app could join to a guide's step: a wiki recipe, only a wiki item, or nothing. */
type Joined = 'recipe' | 'item' | 'nothing'

const UNJOINED: Record<Joined, string> = {
  recipe: '',
  item: ' The wiki has a page for it but no recipe, so no cost is shown.',
  nothing: ' No wiki item has this exact name, so it has no link and no cost.'
}

/**
 * "The guide's materials: 2 Mandrake Root." for a step no wiki recipe is joined to, each name the
 * wiki's own where the guide's is one (owner, 2026-11-20, of Woven mandrake: "what is that and
 * why can't i click on it"). '' when the guide lists none.
 */
export function guideMaterialsLine(guides: RouteCtx['facts']['guides'], step: Pick<GuideStep, 'materials'>): string {
  if (step.materials.length === 0) return ''
  const parts = step.materials.map((m) => `${m.qty !== undefined && m.qty > 1 ? `${String(m.qty)} ` : ''}${wikiNameOf(guides, m.name) ?? m.name}`)
  return `The guide's materials: ${parts.join(', ')}.`
}

function joinedOf(recipe: BookRecipe | null, wikiName: string | null): Joined {
  if (recipe !== null) return 'recipe'
  return wikiName === null ? 'nothing' : 'item'
}

function guideWhy(placed: PlacedStep, joined: Joined): string {
  const where = placed.state === 'here' ? 'Your level is inside this step of the guide.' : 'A later step of the guide.'
  const note = placed.step.note === undefined ? '' : ` The guide notes: ${placed.step.note.replace(/[.\s]+$/, '')}.`
  return `${where}${note}${UNJOINED[joined]}`
}

/** The leveling guide's steps the level has not finished, in the guide's order; null when it has no route. */
export function communitySteps(ctx: RouteCtx, level: number | null): RouteStep[] | null {
  const ladder = placedLadder(ctx.facts.guides, ctx.tradeskill, level)
  if (ladder === null) return null
  const steps: RouteStep[] = []
  for (const [i, placed] of ladder.steps.entries()) {
    if (placed.state === 'done') continue
    const wikiName = wikiNameOf(ctx.facts.guides, placed.step.item)
    const recipe = wikiName === null ? null : recipeNamed(ctx, wikiName)
    const aside = recipe === null ? guideMaterialsLine(ctx.facts.guides, placed.step) : ''
    const place = { id: `guide:${String(i)}`, range: placed.range, to: placed.step.to ?? null, why: guideWhy(placed, joinedOf(recipe, wikiName)), aside }
    steps.push(recipe === null ? plainStep(wikiName ?? placed.step.item, wikiName !== null, place) : recipeStep(ctx.facts, recipe, place))
  }
  return steps
}
