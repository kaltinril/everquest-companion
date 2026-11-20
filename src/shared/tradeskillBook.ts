// shared/tradeskillBook.ts — the Tradeskills section's recipe book: what main serves (every wiki
// recipe, and where each material comes from) and the pure folds the screens draw: the ladder for
// one tradeskill at the player's level, the Home tiles, and a material's own recipe.
//
// Here, not in the renderer: order, filter and the "next" mark are domain logic
// (eqc/no-domain-munging), and tests/tradeskillBook.test.mts runs them on the committed data.

import { sourceItemKey, type ItemSource } from './itemSources'
import { mobOutOfEra } from './mobEra'
import { eraVerdict, type EraDerivation } from './planner/era'
import { ownedCount, ownershipRowsFor, type OwnershipIndex } from './planner/ownership'
import type { SkillRow } from './skills'
import type { GuidePayload } from './tradeskillGuide'
import { TRADESKILLS, tradeskillOf, type Tradeskill } from './tradeskills'
import type { ItemCraftIngredient, ItemDropSource } from './types'

export const TRADESKILL_BOOK_VERSION = 1

/** A recipe's material, with the item database's key for it (aliases resolved in main). */
export interface BookIngredient extends ItemCraftIngredient {
  key: string
}

/** What a made item's own window states: `STR +3`, `SV MAGIC +5`, and the names of its effects. */
export interface BookWorn {
  stats: string[]
  effects: string[]
}

/** One wiki recipe. `key`, `eraTag`, `eraDerived` and `wikiSources` are the era join's subject. */
export interface BookRecipe {
  /** One recipe's own handle (`<page key>#<n>`): a page can state several, and pages can share a name. */
  id: string
  /** The made item's database key. */
  key: string
  item: string
  /** The wiki page's title, kept only when it is not the item's name (a bow's Linen, Hemp and Silk pages). */
  page?: string
  /** Absent when the wiki's word names no tradeskill ("Non-Tradeskill", a quest's name). */
  tradeskill?: Tradeskill
  /** The wiki's own word, kept only when it folds to no tradeskill. */
  skillWord?: string
  trivial?: number
  container?: string
  yieldItem?: string
  yieldQty?: number
  ingredients: BookIngredient[]
  eraTag?: string
  eraDerived?: EraDerivation
  wikiSources?: ItemDropSource[]
  /** The quests that take the made item (its page's quest uses; a quest that only hands it out is left out). */
  quests?: string[]
  /** For a quest of `quests` the wiki hosts on a page of another title (a page of several quests): quest name to page title. */
  questPages?: Record<string, string>
  /** The made item's own stats, saves and effects, as its window words them; absent when it has none. */
  worn?: BookWorn
}

/** Where a material comes from, off its own item page. */
export interface BookMaterial {
  dropsFrom?: ItemDropSource[]
  foraged?: string[]
  foragedNote?: string
}

export interface TradeskillBookPayload {
  version: number
  recipes: BookRecipe[]
  /** By material key; a material the item database does not hold has no entry. */
  materials: Record<string, BookMaterial>
  /** The two community guides as data (shared/tradeskillGuide.ts); absent reads as no guide. */
  guides?: GuidePayload
  /** When the wiki data the recipes come from was scraped (items.json's own `scrapedAt`, ISO 8601); absent when not stated. */
  scrapedAt?: string
}

export const EMPTY_BOOK: TradeskillBookPayload = { version: TRADESKILL_BOOK_VERSION, recipes: [], materials: {} }

/** Ladder order: trivial ascending, then name; a recipe with no trivial after every one with. */
export function recipeOrder(a: BookRecipe, b: BookRecipe): number {
  if (a.trivial === undefined || b.trivial === undefined) {
    if (a.trivial !== b.trivial) return a.trivial === undefined ? 1 : -1
    return a.item.localeCompare(b.item)
  }
  return a.trivial - b.trivial || a.item.localeCompare(b.item)
}

export interface BookIndex {
  /** Each tradeskill's recipes in ladder order, era-hidden ones left out. */
  bySkill: ReadonlyMap<Tradeskill, readonly BookRecipe[]>
  /** Every recipe that makes an item, by the item's key: a material's own recipe. Nothing hidden. */
  byItem: ReadonlyMap<string, readonly BookRecipe[]>
  /** Every recipe by its own `id`, era-hidden ones included: what a link in from another tab resolves. */
  byId: ReadonlyMap<string, BookRecipe>
  materials: ReadonlyMap<string, BookMaterial>
  /** How many recipes of each tradeskill the era setting left out. */
  eraHidden: ReadonlyMap<Tradeskill, number>
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * The payload as the screens read it. `hidden` is the era verdict, injected the way the Gear
 * filter takes it (`GearFilterDeps.eraHidden`); absent, nothing is hidden.
 */
export function indexBook(payload: TradeskillBookPayload, hidden?: (recipe: BookRecipe) => boolean): BookIndex {
  const bySkill = new Map<Tradeskill, BookRecipe[]>(TRADESKILLS.map((t) => [t, []]))
  const byItem = new Map<string, BookRecipe[]>()
  const byId = new Map<string, BookRecipe>()
  const eraHidden = new Map<Tradeskill, number>()
  for (const recipe of payload.recipes) {
    pushTo(byItem, recipe.key, recipe)
    byId.set(recipe.id, recipe)
    if (recipe.tradeskill === undefined) continue
    if (hidden?.(recipe) === true) eraHidden.set(recipe.tradeskill, (eraHidden.get(recipe.tradeskill) ?? 0) + 1)
    else pushTo(bySkill, recipe.tradeskill, recipe)
  }
  for (const list of bySkill.values()) list.sort(recipeOrder)
  return { bySkill, byItem, byId, materials: new Map(Object.entries(payload.materials)), eraHidden }
}

export const NO_RECIPES: readonly BookRecipe[] = []

export function skillRecipes(index: BookIndex, tradeskill: Tradeskill): readonly BookRecipe[] {
  return index.bySkill.get(tradeskill) ?? NO_RECIPES
}

/** A stored or typed name as a tradeskill of the section, or null. */
export function asTradeskill(raw: string | null): Tradeskill | null {
  return tradeskillOf(raw ?? undefined) ?? null
}

// ---- the player's level ---------------------------------------------------------------------

/**
 * The level the log last stated for a tradeskill, or null when it never showed that skill go up.
 * Two spellings of one skill ("Research", "Spell Research") fold together; the newest line wins.
 */
export function tradeskillLevel(rows: readonly SkillRow[], tradeskill: Tradeskill): number | null {
  let best: SkillRow | null = null
  for (const row of rows) {
    if (tradeskillOf(row.skill) !== tradeskill) continue
    if (best === null || row.lastTs > best.lastTs) best = row
  }
  return best === null ? null : best.value
}

/** The first recipe above the level: what to make next. A recipe with no trivial is never it. */
export function nextRecipe(recipes: readonly BookRecipe[], level: number | null): BookRecipe | null {
  const at = level ?? 0
  return recipes.find((r) => r.trivial !== undefined && r.trivial > at) ?? null
}

// ---- Home -----------------------------------------------------------------------------------

export interface TradeskillTile {
  tradeskill: Tradeskill
  /** Null: the log has not shown this skill go up. */
  level: number | null
  /** Wiki recipes shown under the era setting. */
  recipes: number
  next: BookRecipe | null
}

/** One tile per tradeskill: the ones the log has seen first, highest level first, then by name. */
export function tradeskillTiles(index: BookIndex, rows: readonly SkillRow[]): TradeskillTile[] {
  const tiles = TRADESKILLS.map((tradeskill): TradeskillTile => {
    const recipes = skillRecipes(index, tradeskill)
    const level = tradeskillLevel(rows, tradeskill)
    return { tradeskill, level, recipes: recipes.length, next: nextRecipe(recipes, level) }
  })
  return tiles.sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.tradeskill.localeCompare(b.tradeskill))
}

// ---- the workbench's ladder -----------------------------------------------------------------

/** `trivial`: at or under the level. `next`: the first above it. `unrated`: the wiki gives no trivial. */
export type LadderState = 'trivial' | 'next' | 'above' | 'unrated'

/** One line of the recipe table: a recipe, or the heading that sets the unrated ones apart. */
export type LadderLine =
  | { kind: 'recipe'; recipe: BookRecipe; state: LadderState }
  | { kind: 'unrated-heading'; count: number }

export interface LadderAsk {
  /** Null reads as 0: nothing is trivial yet. */
  level: number | null
  /** Part of an item or material name, any case. */
  query: string
  hideTrivial: boolean
  /** Switches that each keep only the recipes they accept ("Can make now", "Missing on the wiki"); absent keeps all. */
  only?: readonly LadderFilter[]
}

/** One switch of the recipe table that narrows the list, and the line it leaves when nothing passes. */
export interface LadderFilter {
  keep: (recipe: BookRecipe) => boolean
  /** Why the table is empty when this switch took the last line away. */
  emptyText: string
}

export interface Ladder {
  lines: LadderLine[]
  /** Recipes on the lines, the heading not counted. */
  shown: number
  /** The tradeskill's recipes before the search and the switch. */
  total: number
  /** The recipe to make next, whether or not the search kept it. */
  next: BookRecipe | null
  /** The line the table opens on: the next recipe, else the first above the level, else the top. */
  openLine: number
}

function stateOf(recipe: BookRecipe, level: number, next: BookRecipe | null): LadderState {
  if (recipe.trivial === undefined) return 'unrated'
  if (recipe === next) return 'next'
  return recipe.trivial <= level ? 'trivial' : 'above'
}

function matches(recipe: BookRecipe, needle: string): boolean {
  if (needle === '') return true
  if (recipe.item.toLowerCase().includes(needle)) return true
  return recipe.ingredients.some((i) => i.name.toLowerCase().includes(needle))
}

/** Where the table opens: the next recipe's line, else the first recipe above the level. */
function openLineOf(lines: readonly LadderLine[]): number {
  const next = lines.findIndex((l) => l.kind === 'recipe' && l.state === 'next')
  if (next >= 0) return next
  const above = lines.findIndex((l) => l.kind === 'recipe' && l.state === 'above')
  return above >= 0 ? above : 0
}

/**
 * One tradeskill's recipes (in ladder order, as `indexBook` leaves them) as the table's lines.
 * The marks are set against the whole list, then the search and the switch take lines away, so
 * a search never moves "next" onto another recipe.
 */
export function recipeLadder(recipes: readonly BookRecipe[], ask: LadderAsk): Ladder {
  const level = ask.level ?? 0
  const next = nextRecipe(recipes, level)
  const needle = ask.query.trim().toLowerCase()
  const lines: LadderLine[] = []
  const unrated: LadderLine[] = []
  for (const recipe of recipes) {
    const state = stateOf(recipe, level, next)
    if (ask.hideTrivial && state === 'trivial') continue
    if (!matches(recipe, needle)) continue
    if (ask.only?.some((filter) => !filter.keep(recipe)) === true) continue
    const line: LadderLine = { kind: 'recipe', recipe, state }
    if (state === 'unrated') unrated.push(line)
    else lines.push(line)
  }
  const shown = lines.length + unrated.length
  if (unrated.length > 0) lines.push({ kind: 'unrated-heading', count: unrated.length }, ...unrated)
  return { lines, shown, total: recipes.length, next, openLine: openLineOf(lines) }
}

/** The line a recipe (by its `id`) sits on, or -1 when the search or the switch took it away. */
export function lineOfRecipe(lines: readonly LadderLine[], id: string | null): number {
  if (id === null) return -1
  return lines.findIndex((l) => l.kind === 'recipe' && l.recipe.id === id)
}

/** The recipe the detail panel shows: the picked one while it is listed, else the one the table opens on. */
export function pickedRecipe(ladder: Ladder, id: string | null): BookRecipe | null {
  const at = lineOfRecipe(ladder.lines, id)
  const line = ladder.lines.at(at >= 0 ? at : ladder.openLine)
  if (line?.kind === 'recipe') return line.recipe
  // The open line can be the heading only when every listed recipe is unrated: take the first.
  const first = ladder.lines.find((l) => l.kind === 'recipe')
  return first?.kind === 'recipe' ? first.recipe : null
}

// ---- a link in from another tab --------------------------------------------------------------

function usesItem(recipe: BookRecipe, key: string): boolean {
  // The material's own key is its record's; the recipe may spell it the way a redirect does.
  return recipe.ingredients.some((i) => i.key === key || sourceItemKey(i.name) === key)
}

/**
 * The recipe a link from another tab opens on a tradeskill's workbench: the first (in ladder
 * order) that makes the item, or failing that the first that uses it as a material; null when
 * the tradeskill has neither. A recipe the era setting hides is found too, after the listed
 * ones of its kind, so a link to an out-of-era item still lands on its own recipe.
 */
export function recipeForItem(index: BookIndex, tradeskill: Tradeskill, item: string): BookRecipe | null {
  const key = sourceItemKey(item)
  const listed = skillRecipes(index, tradeskill)
  const every = [...index.byId.values()].filter((r) => r.tradeskill === tradeskill).sort(recipeOrder)
  return (
    listed.find((r) => r.key === key) ??
    every.find((r) => r.key === key) ??
    listed.find((r) => usesItem(r, key)) ??
    every.find((r) => usesItem(r, key)) ??
    null
  )
}

/** What the workbench remembers of its pick. `linked`: a link from another tab chose it. */
export interface BenchPick {
  id: string | null
  linked: boolean
}

/**
 * The recipe the detail panel shows. A recipe a link opened stays up even when the table does
 * not list it (Hide trivial, the era setting), until the player picks another or searches; any
 * other pick shows only while it is listed (`pickedRecipe`).
 */
export function benchRecipe(index: BookIndex, ladder: Ladder, pick: BenchPick): BookRecipe | null {
  const linked = pick.linked && pick.id !== null ? index.byId.get(pick.id) : undefined
  return linked ?? pickedRecipe(ladder, pick.id)
}

/** Why the panel's recipe is not in the table under it, or null when it is listed. */
export function unlistedText(ladder: Ladder, recipe: BookRecipe | null): string | null {
  if (recipe === null || lineOfRecipe(ladder.lines, recipe.id) >= 0) return null
  return 'This recipe is not in the list below: a filter above is hiding it.'
}

// ---- a material's own recipe ----------------------------------------------------------------

/** How many recipes deep a material opens in place. */
export const MAX_RECIPE_DEPTH = 4

/**
 * The recipes that make a material, for opening it in place. `trail` is the keys of the items
 * already open above it: none is returned past `MAX_RECIPE_DEPTH`, or for an item already on the
 * trail (Water Flask made from Water Flask would open forever).
 */
export function subRecipes(index: BookIndex, key: string, trail: readonly string[]): readonly BookRecipe[] {
  if (trail.length >= MAX_RECIPE_DEPTH || trail.includes(key)) return NO_RECIPES
  return index.byItem.get(key) ?? NO_RECIPES
}

/** The wiki's source words for a material, as one phrase; '' when it states none. */
export function sourceWords(ingredient: ItemCraftIngredient): string {
  return (ingredient.sources ?? []).join(', ')
}

/** What a combine makes when it is not one of the item itself: "5 x Arrow", or null. */
export function yieldText(recipe: BookRecipe): string | null {
  const other = recipe.yieldItem !== undefined && recipe.yieldItem.toLowerCase() !== recipe.item.toLowerCase()
  const qty = recipe.yieldQty ?? 1
  if (!other && qty <= 1) return null
  return `${String(qty)} x ${other ? (recipe.yieldItem ?? recipe.item) : recipe.item}`
}

/** A list cut to `cap`, and how many it left out. */
export function capped<T>(list: readonly T[], cap: number): { shown: readonly T[]; more: number } {
  return list.length <= cap ? { shown: list, more: 0 } : { shown: list.slice(0, cap), more: list.length - cap }
}

// ---- where a material drops -----------------------------------------------------------------

/** How many mobs a material lists before the rest become a count. */
export const MATERIAL_MOB_CAP = 4

export interface MaterialDrops {
  shown: readonly ItemSource[]
  /** Listed mobs past the cap. */
  more: number
  /** Mobs the era setting left out. */
  outOfEra: number
}

/** The data build's verdict on the mob (the player's log over it), or every stated zone a later expansion. */
function sourceOutOfEra(source: ItemSource): boolean {
  if (mobOutOfEra({ name: source.mob, page: source.mobPage, outOfEra: source.outOfEra })) return true
  return eraVerdict(source.zones) === 'out-of-era'
}

/**
 * One row per mob NAME: the first page's link, every page's zones (`itemSources.dropDetails`'s
 * rule: the catalog names "a bandit" on four pages, and the line should say it once).
 */
function byMobName(sources: readonly ItemSource[]): ItemSource[] {
  const out = new Map<string, ItemSource>()
  for (const source of sources) {
    const id = source.mob.trim().toLowerCase()
    const had = out.get(id)
    if (had === undefined) out.set(id, { ...source, zones: [...source.zones] })
    else had.zones.push(...source.zones.filter((zone) => !had.zones.includes(zone)))
  }
  return [...out.values()]
}

/**
 * The mobs to show for a material, in the catalog's own order. Under the era setting this is a
 * list that recommends, so out-of-era mobs are left out and counted (`withoutOutOfEraMobs`'s rule).
 */
export function materialDrops(sources: readonly ItemSource[], eraOnly: boolean, cap: number = MATERIAL_MOB_CAP): MaterialDrops {
  const all = byMobName(sources)
  const kept = eraOnly ? byMobName(sources.filter((s) => !sourceOutOfEra(s))) : all
  const cut = capped(kept, cap)
  return { shown: cut.shown, more: cut.more, outOfEra: all.length - kept.length }
}

// ---- what the player holds ------------------------------------------------------------------

/**
 * How many of a material the inventory dump lists: bags, bank, shared bank and the tradeskill
 * depot (`Personal-Depot<n>`) together, every plus level. A copy socketed into another item is
 * not counted: it cannot go into a combine.
 */
export function heldCount(index: OwnershipIndex, name: string): number {
  return ownedCount(ownershipRowsFor(index, name).filter((row) => row.containment !== 'socket'))
}

// ---- the words on screen --------------------------------------------------------------------

export const NO_TRIVIAL_TEXT = 'no trivial on the wiki'

/** A recipe's stated facts as one line: "Baking · trivial 12 · Oven · makes 5 x Arrow". */
export function recipeFacts(recipe: BookRecipe, withSkill: boolean): string {
  const parts: string[] = []
  const skill = recipe.tradeskill ?? recipe.skillWord
  if (withSkill && skill !== undefined) parts.push(skill)
  parts.push(recipe.trivial === undefined ? NO_TRIVIAL_TEXT : `trivial ${String(recipe.trivial)}`)
  if (recipe.container !== undefined) parts.push(recipe.container)
  const makes = yieldText(recipe)
  if (makes !== null) parts.push(`makes ${makes}`)
  return parts.join(' · ')
}

/** The quantity before a material's name: "2 x ", or nothing for one or an unstated count. */
export function qtyPrefix(ingredient: ItemCraftIngredient): string {
  return ingredient.qty !== undefined && ingredient.qty > 1 ? `${String(ingredient.qty)} x ` : ''
}

/** A recipe's materials as plain text, for a cut-off cell's hover. */
export function materialsText(recipe: BookRecipe): string {
  return recipe.ingredients
    .map((i) => {
      const words = sourceWords(i)
      return `${qtyPrefix(i)}${i.name}${words === '' ? '' : ` (${words})`}`
    })
    .join(', ')
}

export const NO_MATERIALS_TEXT = 'The wiki lists no materials for this recipe.'

/** Why the recipe table is empty, or null when it has lines. */
export function ladderEmptyText(ladder: Ladder, ask: LadderAsk, eraOnly: boolean): string | null {
  if (ladder.shown > 0) return null
  if (ladder.total === 0) return eraOnly ? 'The wiki lists no recipes here in the current era.' : 'The wiki lists no recipes here.'
  if (ask.query.trim() !== '') return 'No recipe or material matches the search.'
  // A switch that narrows the list says so in its own words; two of them on share one line.
  const [first, second] = ask.only ?? []
  if (first !== undefined) return second === undefined ? first.emptyText : 'No recipe here passes every switch that is on.'
  return 'Every recipe here is already trivial for you.'
}

/** The line under a workbench's level when the log never showed the skill. */
export const LEVEL_UNSEEN_TEXT = 'Your log has not shown this skill go up, so recipes are listed from level 0.'
