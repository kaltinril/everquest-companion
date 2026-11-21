// shared/tradeskillPlanLevels.ts — "Where you stand" and "Shortest way there" for a planned item:
// every tradeskill the tree's recipes need and the trivial each needs it at, against the level
// the player's log last stated, and for each tradeskill that is short, what to make on the way.
//
// - The level needed is the highest trivial among that tradeskill's recipes in the tree.
// - The way there is the leveling guide's route steps that cover the stretch from the player's
//   level to that trivial, credited; where the guide has no step there, the wiki's recipes that
//   go trivial inside the stretch, lowest first, cut to a few and counted.
// - NO success chance and NO number of combines is stated anywhere here. Nobody has measured this
//   game's rates, so nothing that rests on a guessed formula is shown; the screen says so.

import type { GuideStep } from './guideData'
import type { SkillRow } from './skills'
import { skillRecipes, tradeskillLevel, type BookRecipe } from './tradeskillBook'
import { LEVELING_GUIDE_ID, guideCreditOf, guideMaterialTail, guideQtyPrefix, stepRange, wikiNameOf } from './tradeskillGuide'
import { treeRecipes, type PlanDeps, type PlanRecipe } from './tradeskillPlan'
import type { Tradeskill } from './tradeskills'

// ---- where you stand ---------------------------------------------------------------------------

/**
 * `met` the level is at or past the trivial; `short` it is under it; `unseen` the log never
 * showed the skill go up; `unrated` the wiki gives no trivial for any of the tradeskill's recipes.
 */
export type SkillStand = 'met' | 'short' | 'unseen' | 'unrated'

export interface SkillNeed {
  tradeskill: Tradeskill
  /** The highest trivial among the tradeskill's recipes in the tree; null when none states one. */
  trivial: number | null
  /** The item whose recipe sets that trivial (the first of the tradeskill's when none states one). */
  item: string
  /** The tradeskill's other recipes in the tree, highest trivial first. */
  also: readonly BookRecipe[]
  /** Null: the log has not shown this skill go up. */
  level: number | null
  stand: SkillStand
}

/** A recipe in the tree that names no tradeskill (a quest's combine). */
export interface UnskilledRecipe {
  item: string
  /** The wiki's own word for how it is made, when it gives one. */
  word: string | null
}

export interface PlanSkills {
  /** The planned item's own tradeskill first, then the highest trivial first. */
  needs: SkillNeed[]
  other: UnskilledRecipe[]
}

function standOf(trivial: number | null, level: number | null): SkillStand {
  if (trivial === null) return 'unrated'
  if (level === null) return 'unseen'
  return level >= trivial ? 'met' : 'short'
}

/** Highest trivial first; a recipe with no trivial after every one with. */
function byTrivialDown(a: BookRecipe, b: BookRecipe): number {
  return (b.trivial ?? -1) - (a.trivial ?? -1) || a.item.localeCompare(b.item)
}

/** Every tradeskill the tree needs, with the level the log last stated for it. */
export function skillNeeds(root: PlanRecipe, rows: readonly SkillRow[]): PlanSkills {
  const bySkill = new Map<Tradeskill, BookRecipe[]>()
  const other: UnskilledRecipe[] = []
  for (const recipe of treeRecipes(root)) {
    if (recipe.tradeskill === undefined) {
      other.push({ item: recipe.item, word: recipe.skillWord ?? null })
      continue
    }
    const list = bySkill.get(recipe.tradeskill)
    if (list) list.push(recipe)
    else bySkill.set(recipe.tradeskill, [recipe])
  }
  const needs = [...bySkill].map(([tradeskill, recipes]): SkillNeed => {
    const [top, ...also] = [...recipes].sort(byTrivialDown)
    const trivial = top.trivial ?? null
    const level = tradeskillLevel(rows, tradeskill)
    return { tradeskill, trivial, item: top.item, also, level, stand: standOf(trivial, level) }
  })
  const first = root.recipe.tradeskill
  needs.sort((a, b) => Number(b.tradeskill === first) - Number(a.tradeskill === first) || (b.trivial ?? -1) - (a.trivial ?? -1) || a.tradeskill.localeCompare(b.tradeskill))
  return { needs, other }
}

// ---- the way there -----------------------------------------------------------------------------

/** How many wiki recipes a stretch lists before the rest become a count. */
export const WIKI_RUNG_CAP = 10

/** One thing to make on the way. */
export interface RouteLine {
  id: string
  /** The skill range as the guide writes it, or "trivial 102" for a wiki recipe. */
  range: string
  /** The item as its source spells it. */
  item: string
  /** The wiki item the name is, for the standard item link; null for a guide's loose spelling. */
  wikiName: string | null
  /** A guide step's materials and remark as one line of plain text; '' for a wiki recipe. */
  detail: string
}

export interface SkillRoute {
  tradeskill: Tradeskill
  /** The level the stretch starts at: the player's, or 0 when the log never showed the skill. */
  from: number
  /** The trivial to reach. */
  to: number
  /** False when the log never showed the skill: `from` is 0 for want of a level. */
  placed: boolean
  /** `guide`: the leveling guide's steps. `wiki`: the recipe book's ladder. */
  source: 'guide' | 'wiki'
  lines: RouteLine[]
  /** Wiki recipes inside the stretch past the cap. */
  more: number
  /** Where the guide's steps stop, when that is under `to`; null otherwise. */
  guideEnds: number | null
}

/** A step's materials as the guide wrote them, the top level only, and its remark. */
function stepDetail(step: GuideStep): string {
  const materials = step.materials.map((m) => `${guideQtyPrefix(m)}${m.name}${guideMaterialTail(m)}`).join(', ')
  if (step.note === undefined) return materials
  return materials === '' ? step.note : `${materials}. ${step.note}`
}

/**
 * The leveling guide's steps that cover any of the stretch: a step counts from its bottom to its
 * top, and a step with no stated top runs to where the next one starts (`placedLadder`'s rule).
 */
function guideLines(deps: PlanDeps, tradeskill: Tradeskill, from: number, to: number): { lines: RouteLine[]; ends: number } {
  const steps = deps.guides.payload.leveling[tradeskill]?.steps ?? []
  const lines: RouteLine[] = []
  let ends = from
  for (const [i, step] of steps.entries()) {
    const next = steps.at(i + 1)
    const top = step.to ?? (next === undefined ? Infinity : next.from - 1)
    if (top <= from || step.from > to) continue
    lines.push({ id: `${String(i)}:${step.item}`, range: stepRange(step), item: step.item, wikiName: wikiNameOf(deps.guides, step.item), detail: stepDetail(step) })
    ends = Math.max(ends, top)
  }
  return { lines, ends }
}

/** The recipe book's listed recipes of a tradeskill that go trivial above `from` and at or under `to`, lowest first. */
function wikiLines(deps: PlanDeps, tradeskill: Tradeskill, from: number, to: number): { lines: RouteLine[]; more: number } {
  const lines: RouteLine[] = []
  let more = 0
  for (const recipe of skillRecipes(deps.index, tradeskill)) {
    if (recipe.trivial === undefined || recipe.trivial <= from || recipe.trivial > to) continue
    if (lines.length >= WIKI_RUNG_CAP) more += 1
    else lines.push({ id: recipe.id, range: `trivial ${String(recipe.trivial)}`, item: recipe.item, wikiName: recipe.item, detail: '' })
  }
  return { lines, more }
}

function routeFor(deps: PlanDeps, need: SkillNeed, to: number): SkillRoute {
  const from = need.level ?? 0
  const base = { tradeskill: need.tradeskill, from, to, placed: need.level !== null }
  const guide = guideLines(deps, need.tradeskill, from, to)
  if (guide.lines.length > 0) return { ...base, source: 'guide', lines: guide.lines, more: 0, guideEnds: guide.ends < to ? guide.ends : null }
  return { ...base, source: 'wiki', ...wikiLines(deps, need.tradeskill, from, to), guideEnds: null }
}

/** One route per tradeskill that is under the trivial it is needed at, in `needs` order. */
export function skillRoutes(deps: PlanDeps, needs: readonly SkillNeed[]): SkillRoute[] {
  const routes: SkillRoute[] = []
  for (const need of needs) {
    if (need.trivial === null || need.stand === 'met') continue
    routes.push(routeFor(deps, need, need.trivial))
  }
  return routes
}

// ---- the words on screen -----------------------------------------------------------------------

/** The level beside a tradeskill's name: "150", or that the log has not shown it. */
export function levelText(need: SkillNeed): string {
  return need.level === null ? 'not in your log' : String(need.level)
}

/** What the tree asks of a tradeskill, and how far the player is from it. */
export function skillNeedText(need: SkillNeed): string {
  if (need.trivial === null) return `Needed for ${need.item}. The wiki gives no trivial for it.`
  const at = `${need.item} is trivial at ${String(need.trivial)}.`
  if (need.level === null) return `${at} Your log has not shown this skill go up.`
  if (need.stand === 'met') return `${at} You are past it.`
  return `${at} ${String(need.trivial - need.level)} to go.`
}

/** The tradeskill's other recipes in the tree: "Also here: Aviak Egg Oil (trivial 102)"; '' for none. */
export function alsoText(need: SkillNeed): string {
  if (need.also.length === 0) return ''
  const parts = need.also.map((r) => (r.trivial === undefined ? r.item : `${r.item} (trivial ${String(r.trivial)})`))
  return `Also in this plan: ${parts.join(', ')}`
}

/** A combine in the tree that needs no tradeskill. */
export function unskilledText(recipe: UnskilledRecipe): string {
  return recipe.word === null ? `${recipe.item} is a combine that names no tradeskill.` : `${recipe.item}: ${recipe.word}. No tradeskill level is needed.`
}

export const CHANCE_NOTE = 'You can try a recipe below its trivial. Failure rates have not been measured for this game, so no chance is shown.'

export const ALL_MET_TEXT = 'Your log shows every skill this plan needs at or past its trivial.'

/**
 * True when the plan asks nothing more of the player's skills: every tradeskill in it is at or
 * past its trivial and no combine in it needs a line of its own. The plan then says so on one
 * line in its head instead of a "Where you stand" panel (owner, 2026-11-20).
 */
export function skillsAllMet(skills: PlanSkills): boolean {
  return skills.needs.length > 0 && skills.other.length === 0 && skills.needs.every((need) => need.stand === 'met')
}

/** Beside a met skill's level on that one line: "past the 106 this plan needs". */
export function skillMetText(need: SkillNeed): string {
  return need.trivial === null ? '' : `past the ${String(need.trivial)} this plan needs`
}

/** "Tailoring, 150 to 222". */
export function routeHeading(route: SkillRoute): string {
  return `${route.tradeskill}, ${String(route.from)} to ${String(route.to)}`
}

/** Where a route's lines come from. The guide's are credited (owner, 2026-11-20). */
export function routeSourceText(route: SkillRoute): string {
  if (route.source === 'guide') return `Route steps from ${guideCreditOf(LEVELING_GUIDE_ID)}.`
  return 'The leveling guide has no step for this stretch. These are the wiki recipes that go trivial inside it, lowest first.'
}

/** "The guide's route stops at 200."; '' when it reaches the trivial. */
export function guideEndsText(route: SkillRoute): string {
  return route.guideEnds === null ? '' : `The guide's route stops at ${String(route.guideEnds)}.`
}

/** "and 31 more on the Brewing workbench"; '' when the list is whole. */
export function routeMoreText(route: SkillRoute): string {
  return route.more > 0 ? `and ${String(route.more)} more on the ${route.tradeskill} workbench` : ''
}

export const ROUTE_UNPLACED_TEXT = 'Your log has not shown this skill go up, so the stretch starts at 0.'

/** A stretch neither the guide nor the wiki has a recipe for. */
export const ROUTE_EMPTY_TEXT = 'Neither the guide nor the wiki lists a recipe that goes trivial inside this stretch.'
