// shared/tradeskillWiki.ts — wiki first (owner, 2026-11-20: "WIKI is our PRIMARY source, and
// others are secondary. If there are issues with the wiki, the users need to find out and fix the
// wiki, that's the point of a wiki").
//
// Three things rest on that ruling, all folds over the recipe book and the two guides:
//
//   the page    which wiki page a recipe is on, so the screen can send the reader there.
//   the gap     a recipe the wiki lists no materials or no trivial for. The screen says so beside
//               the recipe and the Recipes tab can list only those, each with its page link.
//               ONE line says it: where the recipe guide's materials stand in, or there is
//               nothing to draw, that is a clause of the same line (`GapNote`), never a second
//               line that repeats "the wiki lists no materials" (seen on Fleeting Quiver).
//   the guides  where a guide lists a recipe the wiki also lists, the wiki's is what every screen
//               shows and counts with (`tradeskillMaterials.recipeMaterials`,
//               `tradeskillPlan.planTree`, the cost). A guide that lists it differently is said
//               in one quiet line under the wiki's, credited, never swapped in.
//
// WHEN TWO LISTS DIFFER. A guide writes loose names ("Fresh Fresh", "Medium Quality Folded
// Sheet"), and a name is joined to a wiki item only when it is that item's name exactly. So a
// loose name cannot be told from the wiki's own material, and it is NOT called a difference on
// its own. A difference is one of:
//   - a material both lists name, at another count;
//   - a material the guide names that IS a wiki item and is not in the wiki's list;
//   - what is left over on each side differing in how many, or in their counts.
// Measured on the committed data, 2026-11-20: of 36 recipes both the wiki and the recipe guide
// list materials for, 7 differ by this rule and 6 more differ only by a loose name.
//
// No link to a guide is built here or anywhere in the app: the credit is text (owner, 2026-11-20).

import type { GuideMaterial } from './guideData'
import type { BookIngredient, BookRecipe, LadderFilter } from './tradeskillBook'
import { LEVELING_GUIDE_ID, RECIPE_GUIDE_ID, guideCreditOf, guideKey, guideMaterialsFor, guideRecipeFor, wikiNameOf, type GuideIndex } from './tradeskillGuide'
import { wikiPageUrl } from './wiki'

// ---- the page ---------------------------------------------------------------------------------

/** The title of the wiki page a recipe is on: its own page where several share one item name. */
export function recipeWikiPage(recipe: Pick<BookRecipe, 'item' | 'page'>): string {
  return recipe.page ?? recipe.item
}

/** The page's address, built where every wiki address is (`shared/wiki.ts`). */
export function recipeWikiUrl(recipe: Pick<BookRecipe, 'item' | 'page'>): string | undefined {
  return wikiPageUrl(recipeWikiPage(recipe))
}

export const WIKI_LINK_TIP = 'open on eqlwiki.com'

/** The words of a link to a recipe's page: "Open Fleeting Quiver on the wiki". */
export function wikiLinkLabel(recipe: Pick<BookRecipe, 'item' | 'page'>): string {
  return `Open ${recipeWikiPage(recipe)} on the wiki`
}

// ---- the gap ----------------------------------------------------------------------------------

/** What a recipe's wiki page does not state. */
export interface WikiGap {
  materials: boolean
  trivial: boolean
}

/** What the wiki lacks for a recipe, or null when it states both its materials and its trivial. */
export function wikiGap(recipe: Pick<BookRecipe, 'ingredients' | 'trivial'>): WikiGap | null {
  const materials = recipe.ingredients.length === 0
  const trivial = recipe.trivial === undefined
  return materials || trivial ? { materials, trivial } : null
}

/** How many of a list of recipes the wiki lacks something for. */
export function wikiGapCount(recipes: readonly BookRecipe[]): number {
  let count = 0
  for (const recipe of recipes) if (wikiGap(recipe) !== null) count += 1
  return count
}

/** The Recipes tab's "Missing on the wiki" switch: only recipes with a gap. */
export const WIKI_GAP_FILTER: LadderFilter = {
  keep: (recipe) => wikiGap(recipe) !== null,
  emptyText: 'No recipe listed here is missing its materials or its trivial on the wiki.'
}

/** The switch's words, with how many of the tradeskill's recipes it keeps. */
export function wikiGapSwitchLabel(count: number): string {
  return `Missing on the wiki (${String(count)})`
}

export const WIKI_GAP_TIP = 'Only recipes the wiki lists no materials or no trivial for. Each one links to its wiki page, where a player who knows can add them.'

/**
 * What a screen does about materials the wiki page does not list, said IN the gap line: the
 * screen draws no second sentence that opens with the same words.
 *   guide      the materials drawn under the line are the recipe guide's
 *   guideNone  the planner looked in the recipe guide too, and it lists none
 *   noList     the shopping list has nothing to list
 */
export type GapNote = 'guide' | 'guideNone' | 'noList'

const GAP_NOTE: Record<GapNote, string> = {
  guide: ", so the materials shown are the recipe guide's",
  guideNone: ', and the recipe guide lists none',
  noList: ', so there is nothing to shop for'
}

/** The note a recipe's gap line carries wherever its materials are drawn: `guide` when the recipe guide's list stands in. */
export function gapNote(guides: GuideIndex, recipe: BookRecipe): GapNote | undefined {
  return guideMaterialsFor(guides, recipe).length > 0 ? 'guide' : undefined
}

/**
 * What the page lacks and where to mend it, as one plain line; the page's link follows it. A
 * note is about the materials, so a page that lacks only its trivial takes none.
 */
export function wikiGapText(gap: WikiGap, note?: GapNote): string {
  if (!gap.materials) return 'The wiki page states no trivial for this recipe. If you know it, that page is where to add it.'
  const lacks = gap.trivial ? 'no materials and no trivial' : 'no materials'
  return `The wiki page lists ${lacks} for this recipe${note === undefined ? '' : GAP_NOTE[note]}. If you know them, that page is where to add them.`
}

/** A table line's empty Materials cell. */
export const NO_WIKI_MATERIALS_CELL = 'none on the wiki'

/** A table line's link to the page: short, it shares the Item cell with the marks. */
export const WIKI_CELL_LINK = 'wiki'

/** A table line's one link to its wiki page, for a recipe the wiki lacks something for. */
export interface WikiRowLink {
  /** `materials`: in the Materials cell the wiki left empty. `item`: beside the item's name. */
  place: 'materials' | 'item'
  /** The link's hover: what the page lacks. */
  tip: string
}

/**
 * Where a table line draws its wiki link and what its hover says; null for a recipe with no gap.
 * The Trivial cell stays empty for a recipe with no trivial: the table's own checks read it as a
 * number or nothing.
 */
export function wikiRowLink(recipe: Pick<BookRecipe, 'ingredients' | 'trivial'>): WikiRowLink | null {
  const gap = wikiGap(recipe)
  if (gap === null) return null
  const opens = 'Opens its page on eqlwiki.com, where'
  if (!gap.materials) return { place: 'item', tip: `The wiki states no trivial for this recipe. ${opens} it can be added.` }
  const lacks = gap.trivial ? 'no materials and no trivial' : 'no materials'
  return { place: 'materials', tip: `The wiki lists ${lacks} for this recipe. ${opens} they can be added.` }
}

/**
 * The recipe guide's trivial for a recipe the wiki states none for, said as the guide's:
 * "The recipe guide lists trivial 162. From <credit>." '' when the wiki has one or the guide none.
 * The wiki's ladder is not re-ordered by it: the recipe stays among the unrated.
 */
export function guideTrivialText(guides: GuideIndex, recipe: BookRecipe): string {
  if (recipe.trivial !== undefined) return ''
  const trivial = guideRecipeFor(guides, recipe)?.trivial
  return trivial === undefined ? '' : `The recipe guide lists trivial ${String(trivial)}. From ${guideCreditOf(RECIPE_GUIDE_ID)}.`
}

// ---- the guides -------------------------------------------------------------------------------

/** One guide's own reading of a recipe the wiki also states, where the two are not the same. */
export interface GuideDifference {
  /** The guide's id in `GUIDE_CREDITS`. */
  guideId: string
  /** "The recipe guide" or "The leveling guide". */
  label: string
  /** The guide's materials in its own words, when its list differs from the wiki's; else null. */
  materials: string | null
  /** The guide's trivial, when it states another than the wiki's; else null. */
  trivial: number | null
}

/** A guide's material as the comparison reads it. */
interface GuideEntry {
  name: string
  key: string
  qty: number
  /** The spelling is a wiki item's own. */
  named: boolean
  returned: boolean
}

function entryOf(guides: GuideIndex, material: Pick<GuideMaterial, 'name' | 'qty' | 'returned'>): GuideEntry {
  return {
    name: material.name,
    key: guideKey(guides.payload, material.name),
    qty: Math.max(1, material.qty ?? 1),
    named: wikiNameOf(guides, material.name) !== null,
    returned: material.returned === true
  }
}

interface Tallied {
  qty: number
  named: boolean
}

/** One count per material: a list that names a material twice asks for the sum. */
function tally(entries: readonly { key: string; qty: number; named: boolean }[]): Map<string, Tallied> {
  const out = new Map<string, Tallied>()
  for (const entry of entries) {
    const had = out.get(entry.key)
    if (had === undefined) out.set(entry.key, { qty: entry.qty, named: entry.named })
    else had.qty += entry.qty
  }
  return out
}

/** The counts of the materials only one list holds, in order, as one comparable word. */
function leftover(mine: ReadonlyMap<string, Tallied>, theirs: ReadonlyMap<string, Tallied>): string {
  const counts: number[] = []
  for (const [key, entry] of mine) if (!theirs.has(key)) counts.push(entry.qty)
  return counts.sort((a, b) => a - b).join(',')
}

/** Whether a guide's list is shown to differ from the wiki's (the header's three cases). */
function listsDiffer(wiki: readonly BookIngredient[], guide: readonly GuideEntry[]): boolean {
  const ours = tally(wiki.map((i) => ({ key: i.key, qty: Math.max(1, i.qty ?? 1), named: true })))
  const theirs = tally(guide)
  for (const [key, entry] of theirs) {
    const same = ours.get(key)
    if (same === undefined ? entry.named : same.qty !== entry.qty) return true
  }
  return leftover(ours, theirs) !== leftover(theirs, ours)
}

/** A guide's list as it writes it: "Water Flask, 2 x Packet of Kiola Sap, Smithy Hammer (returned)". */
function listText(guide: readonly GuideEntry[]): string {
  return guide.map((entry) => `${entry.qty > 1 ? `${String(entry.qty)} x ` : ''}${entry.name}${entry.returned ? ' (returned)' : ''}`).join(', ')
}

/** The guide's list as text when it differs from the wiki's; null when either lists none, or they are not shown to differ. */
function otherMaterials(recipe: BookRecipe, guide: readonly GuideEntry[]): string | null {
  if (recipe.ingredients.length === 0 || guide.length === 0) return null
  return listsDiffer(recipe.ingredients, guide) ? listText(guide) : null
}

function recipeGuideDifference(guides: GuideIndex, recipe: BookRecipe): GuideDifference | null {
  const found = guideRecipeFor(guides, recipe)
  if (found === null) return null
  const materials = otherMaterials(recipe, found.materials.map((material) => entryOf(guides, material)))
  const trivial = recipe.trivial !== undefined && found.trivial !== undefined && found.trivial !== recipe.trivial ? found.trivial : null
  return materials === null && trivial === null ? null : { guideId: RECIPE_GUIDE_ID, label: 'The recipe guide', materials, trivial }
}

/** The leveling guide's step for the same item on the same tradeskill's route. Its top is a skill range, not a trivial. */
function levelingGuideDifference(guides: GuideIndex, recipe: BookRecipe): GuideDifference | null {
  const route = recipe.tradeskill === undefined ? undefined : guides.payload.leveling[recipe.tradeskill]
  if (route === undefined) return null
  const step = [...route.steps, ...route.alternates].find((s) => s.materials.length > 0 && guideKey(guides.payload, s.item) === recipe.key)
  if (step === undefined) return null
  const materials = otherMaterials(recipe, step.materials.map((material) => entryOf(guides, material)))
  return materials === null ? null : { guideId: LEVELING_GUIDE_ID, label: 'The leveling guide', materials, trivial: null }
}

/**
 * Where a guide reads a recipe otherwise than the wiki does: the recipe guide's recipe for the
 * same tradeskill and item, and the leveling guide's step for it. Empty when neither lists it, or
 * neither is shown to differ. The wiki's stays what is shown and used.
 */
export function guideDifferences(guides: GuideIndex, recipe: BookRecipe): GuideDifference[] {
  const found = [recipeGuideDifference(guides, recipe), levelingGuideDifference(guides, recipe)]
  return found.filter((difference): difference is GuideDifference => difference !== null)
}

/**
 * The quiet line under the wiki's own: "The wiki's materials are shown. The recipe guide lists:
 * Water Flask, Bottle, Packet of Kiola Sap. From <credit>."
 */
export function guideDifferenceText(difference: GuideDifference): string {
  const { label, materials, trivial } = difference
  const credit = `From ${guideCreditOf(difference.guideId)}.`
  if (materials === null) return `The wiki's trivial is shown. ${label} lists trivial ${String(trivial ?? 0)}. ${credit}`
  if (trivial === null) return `The wiki's materials are shown. ${label} lists: ${materials}. ${credit}`
  return `The wiki's materials and trivial are shown. ${label} lists: ${materials}, at trivial ${String(trivial)}. ${credit}`
}
