// shared/tradeskillPlan.ts — "Make an item" (owner, 2026-11-20: "perhaps you want to level a
// tradeskill to make 1 specific item (like the quiver everyone wants)"): every craftable item as
// a search choice, which recipe a choice opens, and the item's recipe as a tree, each made
// material opened to its own recipe down to the leaves.
//
// - A recipe's materials are the wiki's. Where the wiki lists none, they are the recipe guide's
//   for the same tradeskill and item (`tradeskillGuide.guideMaterialsFor`; Fleeting Quiver).
// - A material some recipe makes is opened to the first such recipe that lists materials, in
//   `planOrder`. The depth limit and the loop guard are `tradeskillBook.subRecipes`'s.
// - The reader can close a made material (get it instead of making it): `PlanAsk.closed`.
// - A guide's spelling that names no wiki item stays the text its author wrote: a leaf, no link.
//
// The skills the tree needs and the way to them are tradeskillPlanLevels.ts; what to gather for
// N of the item is tradeskillPlanGather.ts. Components only map over what these return.

import { recipeFacts, recipeOrder, subRecipes, type BookIndex, type BookIngredient, type BookRecipe } from './tradeskillBook'
import { guideMaterialsFor, type GuideIndex, type GuideMaterialLine } from './tradeskillGuide'
import { returnedOnSuccess } from './tradeskillMoney'

/** What a plan is built against: the recipe book and the two guides. */
export interface PlanDeps {
  index: BookIndex
  guides: GuideIndex
}

// ---- which recipe ------------------------------------------------------------------------------

/** A recipe lists something to gather: the wiki's materials, or the guide's where the wiki has none. */
export function hasMaterials(deps: PlanDeps, recipe: BookRecipe): boolean {
  return recipe.ingredients.length > 0 || guideMaterialsFor(deps.guides, recipe).length > 0
}

/**
 * The order an item's recipes are offered in, and so which one opens first: one that lists
 * materials before one that lists none, a tradeskill's before a combine that names no tradeskill,
 * then the ladder's order (lowest trivial, then name).
 */
export function planOrder(deps: PlanDeps): (a: BookRecipe, b: BookRecipe) => number {
  const rank = (r: BookRecipe): number => (hasMaterials(deps, r) ? 0 : 2) + (r.tradeskill === undefined ? 1 : 0)
  return (a, b) => rank(a) - rank(b) || recipeOrder(a, b)
}

const NO_RECIPES: readonly BookRecipe[] = []

/** Every recipe that makes an item, whatever its era, in `planOrder`. */
export function itemRecipes(deps: PlanDeps, key: string): readonly BookRecipe[] {
  const made = deps.index.byItem.get(key)
  return made === undefined ? NO_RECIPES : [...made].sort(planOrder(deps))
}

/** The recipe a plan shows: the reader's pick while it is one of the item's, else the first in `planOrder`. */
export function pickRecipe(recipes: readonly BookRecipe[], id: string | null): BookRecipe | null {
  return recipes.find((r) => r.id === id) ?? recipes.at(0) ?? null
}

// ---- the search --------------------------------------------------------------------------------

/** One craftable item, and the recipes that make it (several tradeskills, or several wiki pages of one name). */
export interface PlanChoice {
  key: string
  item: string
  recipes: readonly BookRecipe[]
}

export interface PlanChoices {
  /** By name. */
  list: PlanChoice[]
  /** Items left out because the era setting hides every recipe that makes them. */
  eraHidden: number
}

/**
 * Every item some recipe makes, across all tradeskills and the combines that name none. `hidden`
 * is the era verdict the recipe book's index takes (`indexBook`); an item is left out, and
 * counted, only when it hides every recipe that makes it.
 */
export function planChoices(deps: PlanDeps, hidden?: (recipe: BookRecipe) => boolean): PlanChoices {
  const order = planOrder(deps)
  const list: PlanChoice[] = []
  let eraHidden = 0
  for (const [key, made] of deps.index.byItem) {
    const shown = hidden === undefined ? [...made] : made.filter((r) => !hidden(r))
    if (shown.length === 0) {
      eraHidden += 1
      continue
    }
    shown.sort(order)
    list.push({ key, item: shown[0].item, recipes: shown })
  }
  list.sort((a, b) => a.item.localeCompare(b.item))
  return { list, eraHidden }
}

/** How many results the search lists before the rest become a count. */
export const PLAN_SEARCH_CAP = 40

export interface PlanSearch {
  shown: PlanChoice[]
  /** Matches past the cap. */
  more: number
}

/** How well a name answers the search: the whole name, its start, the start of one of its words, anywhere. */
function matchRank(name: string, needle: string): number | null {
  const at = name.indexOf(needle)
  if (at < 0) return null
  if (name === needle) return 0
  if (at === 0) return 1
  return name.includes(` ${needle}`) ? 2 : 3
}

/**
 * The items whose name holds the typed text, any case: best match first, then by name. An empty
 * search lists nothing: the box is a lookup, not a catalog of 2,400 names.
 */
export function searchChoices(choices: readonly PlanChoice[], query: string, cap: number = PLAN_SEARCH_CAP): PlanSearch {
  const needle = query.trim().toLowerCase()
  if (needle === '') return { shown: [], more: 0 }
  const hits: { choice: PlanChoice; rank: number }[] = []
  for (const choice of choices) {
    const rank = matchRank(choice.item.toLowerCase(), needle)
    if (rank !== null) hits.push({ choice, rank })
  }
  // `choices` is by name already, and the sort is stable.
  hits.sort((a, b) => a.rank - b.rank)
  return { shown: hits.slice(0, cap).map((h) => h.choice), more: Math.max(0, hits.length - cap) }
}

// ---- the tree ----------------------------------------------------------------------------------

/** Where a recipe's materials came from; `none`: neither the wiki nor the guide lists any. */
export type MaterialsFrom = 'wiki' | 'guide' | 'none'

/** A recipe with its materials resolved. */
export interface PlanRecipe {
  recipe: BookRecipe
  from: MaterialsFrom
  materials: PlanNode[]
}

/**
 * Why a material some recipe makes is not opened:
 * `reader` the reader gets it instead of making it; `loop` it is already open above (Water Flask
 * from Water Flask); `depth` past the depth limit; `unlisted` no recipe for it lists materials.
 */
export type ClosedWhy = 'reader' | 'loop' | 'depth' | 'unlisted'

/** One material of a recipe in the tree. */
export interface PlanNode {
  /** Its place in the tree, unique: the keys from the root down. */
  id: string
  /** The item key: the wiki item's, or the guide's spelling's when it names no wiki item. */
  key: string
  name: string
  /** False for a guide's spelling that names no wiki item: drawn as plain text. */
  linked: boolean
  /** How many one combine takes; 1 when the source states no count. */
  qty: number
  /** A tool the combine gives back: one is needed however many are made. */
  returned: boolean
  /** The material as the recipe panel's lines read it. */
  ingredient: BookIngredient
  /** The guide's own line for it, when the recipe's materials are the guide's. */
  guide: GuideMaterialLine | null
  /** How many recipes make it; 0 for a material nothing makes. */
  recipes: number
  /** Its own recipe, opened; null for a leaf. */
  made: PlanRecipe | null
  /** Why it is a leaf although a recipe makes it; null when opened, or when nothing makes it. */
  closed: ClosedWhy | null
  /** The recipe that opens when the reader chooses to make it; set with `closed: 'reader'`. */
  makeable: BookRecipe | null
}

export interface PlanAsk {
  /** Item keys of made materials the reader gets instead of making. */
  closed?: ReadonlySet<string>
}

/** A material before the tree decides whether it opens. */
type Line = Pick<PlanNode, 'key' | 'name' | 'linked' | 'qty' | 'returned' | 'ingredient' | 'guide'>

function wikiLine(ingredient: BookIngredient): Line {
  return {
    key: ingredient.key,
    name: ingredient.name,
    linked: true,
    qty: ingredient.qty ?? 1,
    returned: returnedOnSuccess(ingredient),
    ingredient,
    guide: null
  }
}

function guideLine(line: GuideMaterialLine): Line {
  const name = line.wikiName ?? line.name
  return {
    key: line.key,
    name,
    linked: line.wikiName !== null,
    qty: line.qty ?? 1,
    returned: line.returned,
    ingredient: { name, key: line.key, ...(line.qty === undefined ? {} : { qty: line.qty }) },
    guide: line
  }
}

function linesOf(deps: PlanDeps, recipe: BookRecipe): { from: MaterialsFrom; lines: Line[] } {
  if (recipe.ingredients.length > 0) return { from: 'wiki', lines: recipe.ingredients.map(wikiLine) }
  const guide = guideMaterialsFor(deps.guides, recipe)
  return guide.length > 0 ? { from: 'guide', lines: guide.map(guideLine) } : { from: 'none', lines: [] }
}

type Opened = Pick<PlanNode, 'recipes' | 'made' | 'closed' | 'makeable'>

const LEAF: Opened = { recipes: 0, made: null, closed: null, makeable: null }

/** Whether a material opens, and to which recipe. `trail` is the keys open above it, the root's first. */
function openOf(deps: PlanDeps, ask: PlanAsk, line: Line, trail: readonly string[]): Opened {
  const all = line.linked ? (deps.index.byItem.get(line.key) ?? NO_RECIPES) : NO_RECIPES
  if (all.length === 0) return LEAF
  const shut = (closed: ClosedWhy, makeable: BookRecipe | null = null): Opened => ({ recipes: all.length, made: null, closed, makeable })
  if (trail.includes(line.key)) return shut('loop')
  if (subRecipes(deps.index, line.key, trail).length === 0) return shut('depth')
  const first = itemRecipes(deps, line.key).find((r) => hasMaterials(deps, r))
  if (first === undefined) return shut('unlisted')
  if (ask.closed?.has(line.key) === true) return shut('reader', first)
  return { recipes: all.length, made: build(deps, ask, first, [...trail, line.key]), closed: null, makeable: null }
}

function build(deps: PlanDeps, ask: PlanAsk, recipe: BookRecipe, trail: readonly string[]): PlanRecipe {
  const { from, lines } = linesOf(deps, recipe)
  const path = trail.join('/')
  const materials = lines.map((line, i): PlanNode => ({ id: `${path}/${line.key}#${String(i)}`, ...line, ...openOf(deps, ask, line, trail) }))
  return { recipe, from, materials }
}

/** A recipe as a tree: its materials, and under each made material its own recipe, to the leaves. */
export function planTree(deps: PlanDeps, recipe: BookRecipe, ask: PlanAsk = {}): PlanRecipe {
  return build(deps, ask, recipe, [recipe.key])
}

/** Every recipe in the tree, the root's first, each once. */
export function treeRecipes(root: PlanRecipe): BookRecipe[] {
  const out = new Map<string, BookRecipe>()
  const walk = (plan: PlanRecipe): void => {
    if (!out.has(plan.recipe.id)) out.set(plan.recipe.id, plan.recipe)
    for (const node of plan.materials) if (node.made !== null) walk(node.made)
  }
  walk(root)
  return [...out.values()]
}

/** Whether any line of the tree is the recipe guide's: the tree then carries the guide's credit. */
export function treeDrawsGuide(deps: PlanDeps, root: PlanRecipe): boolean {
  if (root.from === 'guide') return true
  return root.materials.some((node) => deps.guides.located.has(node.key) || (node.made !== null && treeDrawsGuide(deps, node.made)))
}

// ---- the words on screen -----------------------------------------------------------------------

const CHOICE_FACTS_CAP = 3

function skillAndTrivial(recipe: BookRecipe): string {
  const skill = recipe.tradeskill ?? recipe.skillWord ?? 'no tradeskill named'
  return recipe.trivial === undefined ? skill : `${skill} ${String(recipe.trivial)}`
}

/** A search result's facts: "Tailoring 222", or "Fletching 135, Fletching 162 +1 more" for several recipes. */
export function choiceFacts(choice: PlanChoice): string {
  const facts = [...new Set(choice.recipes.map(skillAndTrivial))]
  const more = facts.length - CHOICE_FACTS_CAP
  return facts.slice(0, CHOICE_FACTS_CAP).join(', ') + (more > 0 ? ` +${String(more)} more` : '')
}

/** "3 recipes make this item. Shown:" above the recipe picker; '' for one recipe. */
export function recipeCountText(count: number): string {
  return count > 1 ? `${String(count)} recipes make this item. Shown:` : ''
}

const OPTION_MATERIALS_CAP = 3

/** One recipe in the picker: its facts, then its first materials, so two pages of one name can be told apart. */
export function recipeOptionText(deps: PlanDeps, recipe: BookRecipe): string {
  const names = linesOf(deps, recipe).lines.map((line) => line.name)
  const more = names.length - OPTION_MATERIALS_CAP
  const materials = names.length === 0 ? 'no materials listed' : names.slice(0, OPTION_MATERIALS_CAP).join(', ') + (more > 0 ? ` +${String(more)} more` : '')
  return `${recipeFacts(recipe, true)}: ${materials}`
}

/** Under a made material: which recipe is opened, and that it is one of several. */
export function madeWithText(node: PlanNode): string {
  if (node.made === null) return ''
  const facts = recipeFacts(node.made.recipe, true)
  return node.recipes > 1 ? `Made with (the first of ${String(node.recipes)} recipes): ${facts}` : `Made with: ${facts}`
}

const CLOSED_TEXT: Record<ClosedWhy, string> = {
  reader: 'You chose to get this one instead of making it.',
  loop: 'Also made by a recipe, which is already open above.',
  depth: 'Also made by a recipe. It is not opened this deep: plan that item on its own.',
  unlisted: 'Also made by a recipe, but neither the wiki nor the guide lists its materials.'
}

/** Why a material that some recipe makes is drawn as a leaf; '' when it is opened or nothing makes it. */
export function closedText(node: PlanNode): string {
  return node.closed === null ? '' : CLOSED_TEXT[node.closed]
}

/** Home's "Working towards" line for a wished item whose recipe lists nothing. The planner's own tree says it through the wiki gap line. */
export const PLAN_NO_MATERIALS_TEXT = 'Neither the wiki nor the guide lists materials for this recipe.'

export const PLAN_SEARCH_HINT = 'Type part of an item name to plan it.'

/** Home's one-row door to the planner: the heading's hover says what a plan is. */
export const PLAN_HOME_TIP = 'Plan any craftable item: its materials, the skills it takes, what to gather.'

export function searchEmptyText(eraOnly: boolean): string {
  return eraOnly ? 'No craftable item in the current era matches.' : 'No craftable item matches.'
}

/** "and 12 more: keep typing to narrow it"; '' when the list is whole. */
export function searchMoreText(more: number): string {
  return more > 0 ? `and ${String(more)} more: keep typing to narrow it` : ''
}

/** How many items the search covers: "2,384 craftable items". */
export function choiceCountText(count: number): string {
  return `${count.toLocaleString('en-US')} craftable items`
}
