// shared/tradeskillMaterials.ts — a recipe's materials for a number of combines, set against what
// the player holds and opened through the recipes of the made materials the player lacks. The
// goal routes read it for "materials on hand for N" and "can it all be bought"; the shopping list
// reads it for need, have and what is still to get.
//
// What is known and what is not:
// - Held counts are the inventory dump's, or the log's depot count when that line is newer
//   (`tradeskillHistory.haveNow`, the recipe panel's own rule). With neither, a count is unknown
//   (null), never zero.
// - A material the wiki sources as "Bought + Enchanted" and names "Enchanted <X>" is one <X>
//   enchanted by a spell, one for one (`tradeskillMoney.enchantedFrom`, the cost rule's reading).
//   A shortfall of it rolls up to that many <X>.
// - A made material the player lacks rolls up to its own recipe's materials: the tradeskill's own
//   recipe first, then the lowest trivial. A material that can be bought is bought, not made.
// - A tool the combine gives back is needed once however many combines. The wiki's "Returned on
//   Success" says nothing of a failed combine, and no failure rate is measured, so one is stated.

import { sourceItemKey } from './itemSources'
import type { OwnershipIndex } from './planner/ownership'
import { heldCount, recipeOrder, subRecipes, type BookIndex, type BookIngredient, type BookRecipe } from './tradeskillBook'
import { guideMaterialsFor, locatedSource, type GuideIndex, type GuideSource } from './tradeskillGuide'
import { haveNow, type CraftBook } from './tradeskillHistory'
import { enchantedFrom, lastPaid, returnedOnSuccess } from './tradeskillMoney'

/** How many of a material the player holds, by its item key and name; null when nothing says. */
export type HaveLookup = (key: string, name: string) => number | null

/** The inventory dump as the section holds it (`tradeskillData.HeldState` fits). */
export interface HeldFacts {
  index: OwnershipIndex | null
  dumpedAt: number | null
}

/** The Have cell's own count for any material: the dump's, or the log's depot line when it is newer. */
export function haveLookup(held: HeldFacts, craft: Pick<CraftBook, 'depot'>): HaveLookup {
  return (key, name) => {
    const dump = held.index === null ? null : { count: heldCount(held.index, name), at: held.dumpedAt }
    return haveNow(dump, craft.depot.get(key))?.count ?? null
  }
}

export interface MaterialFacts {
  index: BookIndex
  craft: CraftBook
  guides: GuideIndex
  have: HaveLookup
}

/** One material of a recipe as the routes and the shopping list read it. */
export interface RecipeMaterial {
  ingredient: BookIngredient
  /** The combine gives it back: one is enough however many combines. */
  tool: boolean
  /** The name is a wiki item's own, so it gets the item link; a guide's loose spelling does not. */
  linked: boolean
  /** The recipe guide's source for it, when the list itself is the guide's. */
  guide?: GuideSource
}

/**
 * A recipe's materials: the wiki's list, or the recipe guide's when the wiki lists none (the
 * recipe panel's rule, `guideMaterialsFor`). Empty when neither lists any.
 */
export function recipeMaterials(guides: GuideIndex, recipe: BookRecipe): RecipeMaterial[] {
  if (recipe.ingredients.length > 0) {
    return recipe.ingredients.map((ingredient) => ({ ingredient, tool: returnedOnSuccess(ingredient), linked: true }))
  }
  return guideMaterialsFor(guides, recipe).map((line) => ({
    ingredient: { name: line.wikiName ?? line.name, key: line.key, ...(line.qty === undefined ? {} : { qty: line.qty }) },
    tool: line.returned,
    linked: line.wikiName !== null,
    guide: line.source
  }))
}

/** What says a material can be bought: a purchase in the log, the wiki's word, or a guide's merchant. */
export type BuyEvidence = 'log' | 'wiki' | 'guide'

const BOUGHT_WORD = /bought/i
const ENCHANTED_WORD = /enchanted/i

/** The wiki's source words say a merchant sells it as it is ("Bought", not "Bought + Enchanted"). */
function wikiSaysBought(ingredient: BookIngredient): boolean {
  return (ingredient.sources ?? []).some((word) => BOUGHT_WORD.test(word) && !ENCHANTED_WORD.test(word))
}

/** The evidence that a merchant sells a material, strongest first; null when nothing says so. */
export function buyEvidence(facts: Pick<MaterialFacts, 'craft' | 'guides'>, material: RecipeMaterial): BuyEvidence | null {
  const { ingredient } = material
  if (lastPaid(facts.craft, ingredient.key) !== null) return 'log'
  if (wikiSaysBought(ingredient)) return 'wiki'
  const guide = material.guide ?? locatedSource(facts.guides, ingredient.key)
  return guide?.merchant === undefined ? null : 'guide'
}

/**
 * The bar a spell enchants into this material, when that is how the player gets it: the cost
 * rule's reading (`enchantedFrom`), for a material nothing in the book makes.
 */
export function spellBar(index: BookIndex, ingredient: BookIngredient): string | null {
  const bar = enchantedFrom(ingredient)
  return bar === null || (index.byItem.get(ingredient.key) ?? []).length > 0 ? null : bar
}

/**
 * The recipe a lacked material is made with, or null when it is bought or nothing makes it. Of
 * several, the parent's own tradeskill first, then ladder order. `trail` is `subRecipes`' guard.
 */
export function makeRecipe(facts: MaterialFacts, material: RecipeMaterial, parent: BookRecipe, trail: readonly string[]): BookRecipe | null {
  if (buyEvidence(facts, material) !== null) return null
  const made = subRecipes(facts.index, material.ingredient.key, trail).filter((r) => r.ingredients.length > 0)
  const own = (r: BookRecipe): number => (r.tradeskill === parent.tradeskill ? 0 : 1)
  return [...made].sort((a, b) => own(a) - own(b) || recipeOrder(a, b)).at(0) ?? null
}

// ---- materials on hand ----------------------------------------------------------------------------

export interface OnHand {
  /** Combines the held materials cover as they are. */
  ready: number
  /** Combines covered once the plain bars held are enchanted; null when that adds none. */
  enchanted: number | null
  /** The bars that count toward `enchanted`. */
  bars: string[]
}

/** How many combines one material covers, as held and with its plain bars counted in. */
function covers(facts: Pick<MaterialFacts, 'index' | 'have'>, material: RecipeMaterial): { now: number; withBars: number; bar: string | null } | null {
  const { ingredient } = material
  const have = facts.have(ingredient.key, ingredient.name)
  if (have === null) return null
  if (material.tool) return { now: have > 0 ? Infinity : 0, withBars: have > 0 ? Infinity : 0, bar: null }
  const qty = Math.max(1, ingredient.qty ?? 1)
  const bar = spellBar(facts.index, ingredient)
  const bars = bar === null ? 0 : (facts.have(sourceItemKey(bar), bar) ?? 0)
  return { now: Math.floor(have / qty), withBars: Math.floor((have + bars) / qty), bar: bars > 0 ? bar : null }
}

/**
 * How many combines of a recipe the held materials cover. Null when the recipe lists nothing a
 * combine uses up, or when a material's count is unknown (no inventory dump): no number then.
 */
export function onHand(facts: Pick<MaterialFacts, 'index' | 'guides' | 'have'>, recipe: BookRecipe): OnHand | null {
  let ready = Infinity
  let enchanted = Infinity
  const bars: string[] = []
  for (const material of recipeMaterials(facts.guides, recipe)) {
    const of = covers(facts, material)
    if (of === null) return null
    ready = Math.min(ready, of.now)
    enchanted = Math.min(enchanted, of.withBars)
    if (of.bar !== null && !bars.includes(of.bar)) bars.push(of.bar)
  }
  if (!Number.isFinite(ready)) return null
  return enchanted > ready ? { ready, enchanted, bars } : { ready, enchanted: null, bars: [] }
}

/** "Materials on hand for 23." with what enchanting the held bars would add; '' when unknown. */
export function onHandText(hand: OnHand | null): string {
  if (hand === null) return ''
  if (hand.enchanted === null) return `Materials on hand for ${String(hand.ready)}.`
  return `Materials on hand for ${String(hand.ready)}, or for ${String(hand.enchanted)} once the ${hand.bars.join(' and ')} you hold is enchanted.`
}

// ---- the expansion --------------------------------------------------------------------------------

/** How a shortfall is met: bought (or farmed), made from its own recipe, or enchanted from a bar. */
export type NeedAction = 'buy' | 'make' | 'enchant'

export interface NeedLine {
  key: string
  name: string
  linked: boolean
  tool: boolean
  /** How many the combines take in all, sub-combines included. */
  need: number
  /** Held, or null when neither the dump nor the log says. */
  have: number | null
  /** Still to get, by `action`. */
  short: number
  action: NeedAction
  /** The made or enchanted materials this one goes into; empty when the recipe itself takes it. */
  into: string[]
  sources: string[]
  guide?: GuideSource
  /** The bar a spell enchants into it, when that is how the player gets it. */
  bar?: string
  /** `make`: the recipe it is made with, and how many combines of it cover the shortfall. */
  made?: { recipe: BookRecipe; combines: number }
}

export interface MaterialPlan {
  recipe: BookRecipe
  combines: number
  /** The recipe's own materials in its order, each followed by what it rolls up to. */
  lines: NeedLine[]
  /** The list is the recipe guide's: the wiki lists no materials for the recipe. */
  fromGuide: boolean
  /** False when any line's held count is unknown. */
  haveKnown: boolean
}

interface Walk {
  facts: MaterialFacts
  lines: Map<string, NeedLine>
  /** Held counts not yet spoken for, by key: one stock serves every place a material is used. */
  left: Map<string, number>
}

interface NeedAsk {
  material: RecipeMaterial
  qty: number
  parent: BookRecipe
  trail: readonly string[]
  into: string | null
}

function lineFor(w: Walk, material: RecipeMaterial): NeedLine {
  const { ingredient } = material
  const had = w.lines.get(ingredient.key)
  if (had !== undefined) return had
  const bar = spellBar(w.facts.index, ingredient)
  const line: NeedLine = {
    key: ingredient.key,
    name: ingredient.name,
    linked: material.linked,
    tool: material.tool,
    need: 0,
    have: w.facts.have(ingredient.key, ingredient.name),
    short: 0,
    action: 'buy',
    into: [],
    sources: ingredient.sources ?? [],
    ...(material.guide === undefined ? {} : { guide: material.guide }),
    ...(bar === null ? {} : { bar })
  }
  w.lines.set(line.key, line)
  return line
}

/** Takes `qty` from what is held and not yet spoken for; returns what is still missing. */
function takeHeld(w: Walk, line: NeedLine, qty: number): number {
  const left = w.left.get(line.key) ?? line.have ?? 0
  const used = Math.min(left, qty)
  w.left.set(line.key, left - used)
  return qty - used
}

/** The plain bar as a material of its own: the wiki's "Bought + Enchanted" says the bar is bought. */
function barMaterial(bar: string): RecipeMaterial {
  return { ingredient: { name: bar, key: sourceItemKey(bar), qty: 1, sources: ['Bought'] }, tool: false, linked: true }
}

/** Rolls a shortfall up: to the bar a spell enchants, or to the recipe that makes the material. */
function rollUp(w: Walk, line: NeedLine, short: number, ask: NeedAsk): void {
  if (line.bar !== undefined) {
    line.action = 'enchant'
    addNeed(w, { ...ask, material: barMaterial(line.bar), qty: short, into: line.name })
    return
  }
  const made = makeRecipe(w.facts, ask.material, ask.parent, ask.trail)
  if (made === null) return
  const combines = Math.ceil(short / Math.max(1, made.yieldQty ?? 1))
  line.action = 'make'
  line.made = { recipe: made, combines: (line.made?.combines ?? 0) + combines }
  walk(w, { recipe: made, combines, trail: [...ask.trail, line.key], into: line.name })
}

function addNeed(w: Walk, ask: NeedAsk): void {
  const line = lineFor(w, ask.material)
  if (ask.into !== null && !line.into.includes(ask.into)) line.into.push(ask.into)
  // A tool is needed once: a second recipe that takes the same tool adds nothing.
  const qty = ask.material.tool ? Math.max(0, 1 - line.need) : ask.qty
  if (qty === 0) return
  line.need += qty
  const short = takeHeld(w, line, qty)
  if (short === 0) return
  line.short += short
  rollUp(w, line, short, ask)
}

interface WalkAsk {
  recipe: BookRecipe
  combines: number
  trail: readonly string[]
  into: string | null
}

function walk(w: Walk, ask: WalkAsk): void {
  for (const material of recipeMaterials(w.facts.guides, ask.recipe)) {
    const qty = Math.max(1, material.ingredient.qty ?? 1) * ask.combines
    addNeed(w, { material, qty, parent: ask.recipe, trail: ask.trail, into: ask.into })
  }
}

/**
 * Everything `combines` combines of a recipe take, against what is held: each material once, with
 * the made and enchanted ones the player lacks opened into what they take in turn.
 */
export function expandMaterials(facts: MaterialFacts, recipe: BookRecipe, combines: number): MaterialPlan {
  const w: Walk = { facts, lines: new Map(), left: new Map() }
  walk(w, { recipe, combines, trail: [recipe.key], into: null })
  const lines = [...w.lines.values()]
  return {
    recipe,
    combines,
    lines,
    fromGuide: recipe.ingredients.length === 0 && lines.length > 0,
    haveKnown: lines.every((line) => line.have !== null)
  }
}
