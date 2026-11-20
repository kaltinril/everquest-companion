// shared/tradeskillGuide.ts — the two community guides as the workbench reads them (owner,
// 2026-11-20: "Use wiki, the data from the google drive download, and my logs as help").
//
// What main serves beside the recipe book (`GuidePayload`, built from the committed
// `tradeskillGuides.json`) and the pure folds over it: where the recipe guide says a material is
// sold, the guide's materials for a recipe the wiki lists none for, and the leveling guide's
// ladder with the player's level placed on it.
//
// The guides are other players' text. It is data: drawn as plain text, never as markup, never
// read as instruction. A guide's name becomes an item link only when it IS a wiki item's name, page
// or other name (`GuidePayload.names`, resolved in main against the item database); a loose
// spelling ("Gold jade") stays the text the author wrote.

import { GUIDE_CREDITS, guideCreditLine } from './guideCredits'
import type { GuideLadder, GuideMaterial, GuideRecipe, GuideStep, RecipeList, RecipeMaterial, TradeskillGuidesFile } from './guideData'
import { sourceItemKey } from './itemSources'
import { subRecipes, type BookIndex, type BookRecipe } from './tradeskillBook'
import type { Tradeskill } from './tradeskills'

/** The guides' ids in `tradeskillGuides.json` and `GUIDE_CREDITS`. */
export const LEVELING_GUIDE_ID = 'eql-tradeskill-guide'
export const RECIPE_GUIDE_ID = 'kerran-kornerstore'

/** The one-line credit drawn wherever a guide's data is drawn; '' for an id no credit names. */
export function guideCreditOf(id: string): string {
  const credit = GUIDE_CREDITS.find((c) => c.id === id)
  return credit === undefined ? '' : guideCreditLine(credit)
}

/** The leveling guide's route for one tradeskill: its side tables are left out. */
export type GuideRoute = Pick<GuideLadder, 'notes' | 'steps' | 'alternates'>

export interface GuidePayload {
  leveling: Partial<Record<Tradeskill, GuideRoute>>
  recipes: Partial<Record<Tradeskill, RecipeList>>
  /** A guide's spelling of an item (as `sourceItemKey` folds it) to the wiki item's own name. Exact matches only. */
  names: Record<string, string>
}

export const EMPTY_GUIDES: GuidePayload = { leveling: {}, recipes: {}, names: {} }

/** A name as the item database resolves it (name, page or other name), or undefined. */
export type WikiItemName = (name: string) => string | undefined

function noteName(names: Record<string, string>, raw: string, wikiName: WikiItemName): void {
  const key = sourceItemKey(raw)
  if (key === '' || key in names) return
  const found = wikiName(raw)
  if (found !== undefined) names[key] = found
}

function noteMaterials(names: Record<string, string>, materials: readonly GuideMaterial[], wikiName: WikiItemName): void {
  for (const material of materials) {
    noteName(names, material.name, wikiName)
    noteMaterials(names, material.materials ?? [], wikiName)
  }
}

/** The committed guide file as the workbench's payload, every item name looked up once. */
export function guidePayload(file: TradeskillGuidesFile, wikiName: WikiItemName): GuidePayload {
  const names: Record<string, string> = {}
  const leveling: Partial<Record<Tradeskill, GuideRoute>> = {}
  for (const [tradeskill, ladder] of Object.entries(file.leveling.tradeskills) as [Tradeskill, GuideLadder][]) {
    leveling[tradeskill] = { notes: ladder.notes, steps: ladder.steps, alternates: ladder.alternates }
    for (const step of [...ladder.steps, ...ladder.alternates]) {
      noteName(names, step.item, wikiName)
      noteMaterials(names, step.materials, wikiName)
    }
  }
  for (const [, list] of Object.entries(file.recipes.tradeskills) as [Tradeskill, RecipeList][]) {
    for (const recipe of list.recipes) {
      noteName(names, recipe.item, wikiName)
      for (const material of recipe.materials) noteName(names, material.name, wikiName)
    }
  }
  return { leveling, recipes: file.recipes.tradeskills, names }
}

// ---- the payload as the screens read it -------------------------------------------------------

/** Where the recipe guide says a material comes from. */
export interface GuideSource {
  /** Set together with `loc`: a named merchant at a stated place. */
  merchant?: string
  /** The guide's Merchant Zone cell as written; not always a zone's name. */
  zone?: string
  /** Coordinates as the guide writes them. */
  loc?: string
  /** The merchant cell when it names no located merchant ("Farmed", "Crafted (Blacksmithing)"). */
  sourceText?: string
  notes: readonly string[]
}

export interface GuideIndex {
  payload: GuidePayload
  /** By material key: the first merchant the recipe guide places it at, with zone and loc. */
  located: ReadonlyMap<string, GuideSource>
  /** The recipe guide's recipes, by tradeskill and made item key. */
  recipes: ReadonlyMap<string, GuideRecipe>
}

/** The wiki item a guide's spelling names exactly, or null: the name then stays plain text. */
export function wikiNameOf(guide: Pick<GuideIndex, 'payload'>, raw: string): string | null {
  return guide.payload.names[sourceItemKey(raw)] ?? null
}

/** One key for a guide's name and the wiki's name of the same item. */
function guideKey(payload: GuidePayload, raw: string): string {
  const key = sourceItemKey(raw)
  const wiki = payload.names[key]
  return wiki === undefined ? key : sourceItemKey(wiki)
}

function sourceOf(material: RecipeMaterial): GuideSource {
  return {
    ...(material.merchant === undefined ? {} : { merchant: material.merchant }),
    ...(material.zone === undefined ? {} : { zone: material.zone }),
    ...(material.loc === undefined ? {} : { loc: material.loc }),
    ...(material.sourceText === undefined ? {} : { sourceText: material.sourceText }),
    notes: material.notes ?? []
  }
}

const recipeSlot = (tradeskill: Tradeskill, key: string): string => `${tradeskill}|${key}`

/** Notes each material a recipe places at a merchant with a loc; the first place stated for a material stays. */
function noteLocated(located: Map<string, GuideSource>, payload: GuidePayload, recipe: GuideRecipe): void {
  for (const material of recipe.materials) {
    if (material.merchant === undefined || material.loc === undefined) continue
    const key = guideKey(payload, material.name)
    if (!located.has(key)) located.set(key, sourceOf(material))
  }
}

export function indexGuides(payload: GuidePayload): GuideIndex {
  const located = new Map<string, GuideSource>()
  const recipes = new Map<string, GuideRecipe>()
  for (const [tab, list] of Object.entries(payload.recipes) as [Tradeskill, RecipeList][]) {
    for (const recipe of list.recipes) {
      const slot = recipeSlot(recipe.tradeskill ?? tab, guideKey(payload, recipe.item))
      if (!recipes.has(slot)) recipes.set(slot, recipe)
      noteLocated(located, payload, recipe)
    }
  }
  return { payload, located, recipes }
}

export const NO_GUIDES: GuideIndex = indexGuides(EMPTY_GUIDES)

/** The merchant, zone and loc the recipe guide gives for a material, by the material's item key; or null. */
export function locatedSource(guide: GuideIndex, key: string): GuideSource | null {
  return guide.located.get(key) ?? null
}

/** One material of a guide's recipe, drawn where the wiki lists none. */
export interface GuideMaterialLine {
  /** The guide's own spelling. */
  name: string
  /** The wiki item the spelling names exactly, or null. */
  wikiName: string | null
  /** The item key of the wiki item, or of the guide's spelling when it names none. */
  key: string
  qty?: number
  /** A tool the combine gives back. */
  returned: boolean
  source: GuideSource
}

export const NO_GUIDE_LINES: readonly GuideMaterialLine[] = []

/**
 * The recipe guide's materials for a recipe the wiki lists none for (Fleeting Quiver): the guide's
 * recipe of the same tradeskill that makes the same item. Empty when the wiki has its own list,
 * or the guide has no such recipe.
 */
export function guideMaterialsFor(guide: GuideIndex, recipe: BookRecipe): readonly GuideMaterialLine[] {
  if (recipe.ingredients.length > 0 || recipe.tradeskill === undefined) return NO_GUIDE_LINES
  const found = guide.recipes.get(recipeSlot(recipe.tradeskill, recipe.key))
  if (found === undefined) return NO_GUIDE_LINES
  return found.materials.map((material) => ({
    name: material.name,
    wikiName: wikiNameOf(guide, material.name),
    key: guideKey(guide.payload, material.name),
    ...(material.qty === undefined ? {} : { qty: material.qty }),
    returned: material.returned === true,
    source: sourceOf(material)
  }))
}

/**
 * Whether the picked recipe's panel can draw anything from the recipe guide, opened materials
 * included: decides if the panel carries the guide's credit line.
 */
export function recipeDrawsGuide(index: BookIndex, guide: GuideIndex, recipe: BookRecipe, trail: readonly string[] = [recipe.key]): boolean {
  if (recipe.ingredients.length === 0) return guideMaterialsFor(guide, recipe).length > 0
  return recipe.ingredients.some((ingredient) => {
    if (locatedSource(guide, ingredient.key) !== null) return true
    return subRecipes(index, ingredient.key, trail).some((made) => recipeDrawsGuide(index, guide, made, [...trail, ingredient.key]))
  })
}

// ---- the leveling guide's ladder --------------------------------------------------------------

/** `done`: the level is at or past the step's top. `here`: the level is inside it. */
export type StepState = 'done' | 'here' | 'ahead'

export interface PlacedStep {
  step: GuideStep
  state: StepState
  /** The skill range as the guide writes it. */
  range: string
}

export interface PlacedLadder {
  notes: readonly string[]
  steps: PlacedStep[]
  alternates: PlacedStep[]
  /** The step the "your level" line sits before: the first not done. Null when the level is unknown. */
  markerAt: number | null
}

export function stepRange(step: GuideStep): string {
  if (step.range !== undefined) return step.range
  return step.to === undefined ? `${String(step.from)} and up` : `${String(step.from)} - ${String(step.to)}`
}

/**
 * A step's place against the level. The guide's ranges overlap and skip (`179 - 196` then
 * `192 - 202`), so each step is judged by its own bounds: done at its top, open from the level
 * just under its bottom. `top` stands in where the guide's upper bound is not a number.
 */
function stateOf(step: GuideStep, top: number, level: number | null): StepState {
  if (level === null) return 'ahead'
  if (level >= top) return 'done'
  return level >= step.from - 1 ? 'here' : 'ahead'
}

function placed(steps: readonly GuideStep[], level: number | null, chained: boolean): PlacedStep[] {
  return steps.map((step, i) => {
    // A step with no stated top ends where the next one starts; the last one, and an alternate, never ends.
    const next = chained ? steps[i + 1] : undefined
    const top = step.to ?? (next === undefined ? Infinity : next.from - 1)
    return { step, state: stateOf(step, top, level), range: stepRange(step) }
  })
}

/** Where the level sits: before the first step not done, or after the last when all are. */
function markerOf(steps: readonly PlacedStep[], level: number | null): number | null {
  if (level === null) return null
  const first = steps.findIndex((s) => s.state !== 'done')
  return first < 0 ? steps.length : first
}

/** The guide's route for a tradeskill with the player's level placed on it; null when the guide has none. */
export function placedLadder(guide: GuideIndex, tradeskill: Tradeskill, level: number | null): PlacedLadder | null {
  const route = guide.payload.leveling[tradeskill]
  if (route === undefined) return null
  const steps = placed(route.steps, level, true)
  return { notes: route.notes, steps, alternates: placed(route.alternates, level, false), markerAt: markerOf(steps, level) }
}

/** The wiki recipe that makes an item a guide names, for its era mark; null when the book has none. */
export function guideItemRecipe(index: BookIndex, wikiName: string | null): BookRecipe | null {
  if (wikiName === null) return null
  return index.byItem.get(sourceItemKey(wikiName))?.[0] ?? null
}

// ---- the words on screen ----------------------------------------------------------------------

/** Under a recipe panel that drew a merchant, zone, loc or materials from the recipe guide. */
export function recipeGuideCreditText(): string {
  return `Lines marked guide are from ${guideCreditOf(RECIPE_GUIDE_ID)}.`
}

/** Under the leveling route. */
export function levelingCreditText(): string {
  return `Route and notes from ${guideCreditOf(LEVELING_GUIDE_ID)}.`
}

export const GUIDE_MATERIALS_TEXT = 'The wiki lists no materials for this recipe. These are from the guide:'

export const GUIDE_TIP = 'From a community guide, not from the wiki or your log.'

export function noRouteText(tradeskill: Tradeskill): string {
  return `The leveling guide has no route for ${tradeskill}.`
}

export function levelMarkerText(level: number): string {
  return `Your level: ${String(level)}`
}

export const LEVEL_UNPLACED_TEXT = 'Your log has not shown this skill go up, so your level is not placed on the route.'

/** The quantity before a guide material's name: "2 x ", or nothing. */
export function guideQtyPrefix(material: Pick<GuideMaterial, 'qty'>): string {
  return material.qty !== undefined && material.qty > 1 ? `${String(material.qty)} x ` : ''
}

/** What follows a guide material's name: that the combine gives it back, and the guide's remark. */
export function guideMaterialTail(material: Pick<GuideMaterial, 'returned' | 'note'>): string {
  const parts: string[] = []
  if (material.returned === true) parts.push('returned')
  if (material.note !== undefined) parts.push(material.note)
  return parts.length === 0 ? '' : ` (${parts.join('; ')})`
}
