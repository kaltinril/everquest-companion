// shared/tradeskillMoney.ts — what a recipe costs and brings back, from the player's own log
// (owner, 2026-11-20: level "efficently (for money reduction)"). Every number here is a price a
// merchant line in the log stated; where the log has no price, nothing is stated.
//
// - A material's price is the newest purchase line's, per unit (`crafting.unitCopper`).
// - A material never bought is costed from its own recipe when every input of that recipe has a
//   price (the cheapest such recipe, divided by what one combine yields).
// - A material the wiki marks as returned on success (a tool) costs a made combine nothing.
// - A material the wiki sources as "Bought + Enchanted" and names "Enchanted <X>" (Enchanted Gold
//   Bar) is never bought and has no wiki recipe: a spell makes it from a bought <X>. It costs what
//   the player last paid for <X>, and the parts text says so (owner, 2026-11-20). The spell's own
//   cost (mana, a reagent) is not in the log and is not counted.
// - A material with no purchase, no costed recipe and no such bar price leaves the recipe's cost
//   unknown: nothing is stated, and the panel names what has no price.
// - The sale line states no quantity, so a sale price is what one sale LINE paid. The difference
//   is stated only for a recipe that yields one item.

import { combineCost, unitCopper, type BoughtRow, type SoldRow } from './crafting'
import { sourceItemKey } from './itemSources'
import { subRecipes, type BookIndex, type BookIngredient, type BookRecipe } from './tradeskillBook'
import type { CraftBook } from './tradeskillHistory'

/**
 * Copper as platinum to two decimals, the one price format of the Tradeskills section (owner,
 * 2026-11-20, on a cell reading "141.748 pp"): "131.25 pp", "14.18 pp", "0.05 pp". A price
 * that is not nothing but would round to 0.00 reads "under 0.01 pp": it was paid.
 */
export function ppText(copper: number): string {
  const whole = Math.round(copper)
  if (whole > 0 && whole < 5) return 'under 0.01 pp'
  return `${(Math.round(whole / 10) / 100).toFixed(2)} pp`
}

/** Where and for how much the player last bought a material. */
export interface LastPaid {
  /** Copper for one, at the newest purchase line's price. */
  unit: number
  merchant: string
  /** The zone the player was in, when the log had stated one. */
  zone?: string
  ts: number
}

/** The newest purchase of a material, by its item key; null when the log shows none. */
export function lastPaid(craft: CraftBook, key: string): LastPaid | null {
  const row = craft.bought.get(key)
  const unit = row === undefined ? null : unitCopper(row)
  if (row === undefined || unit === null) return null
  return { unit, merchant: row.merchant, ...(row.zone === undefined ? {} : { zone: row.zone }), ts: row.ts }
}

/** One material's share of a combine's cost. */
export interface CostPart {
  name: string
  /** Copper for the quantity one combine takes. */
  copper: number
  /** The price came from costing the material's own recipe, not from a purchase. */
  crafted: boolean
  /** The price is this bar's: the material is that bar enchanted by a spell ("Gold Bar"). */
  bar?: string
}

export interface RecipeMoney {
  /** Copper one combine's materials cost at the newest prices; null when any has no price. */
  perCombine: number | null
  /** What `perCombine` adds up, in the recipe's order; empty when there is no cost. */
  parts: CostPart[]
  /** Materials with no price: never bought, and no recipe of their own that could be costed. */
  unpriced: string[]
  /** Materials left out of the cost because the wiki says the combine gives them back. */
  returned: string[]
  /** An enchanted material's bar, by the material's name: "Enchanted Gold Bar" to "Gold Bar". */
  bars: Record<string, string>
  /** The newest line a merchant paid for the made item. */
  sale: SoldRow | null
  /** `sale - perCombine` for a recipe that yields one item: above zero is money made. */
  difference: number | null
}

const RETURNED_ON_SUCCESS = /returned on (?:success|failure or success)/i

/** The wiki says a made combine gives this material back (a tool, a mold). */
export function returnedOnSuccess(ingredient: BookIngredient): boolean {
  return (ingredient.sources ?? []).some((word) => RETURNED_ON_SUCCESS.test(word))
}

const ENCHANTED_WORD = /bought\s*\+\s*enchanted/i
const ENCHANTED_NAME = /^enchanted\s+(\S.*)$/i

/**
 * The bar an enchanted material is made from by a spell: "Gold Bar" for an "Enchanted Gold Bar"
 * the wiki sources as "Bought + Enchanted". Null for anything else: the rule needs both the
 * wiki's own words and the name.
 */
export function enchantedFrom(ingredient: Pick<BookIngredient, 'name' | 'sources'>): string | null {
  if (!(ingredient.sources ?? []).some((word) => ENCHANTED_WORD.test(word))) return null
  const bar = ENCHANTED_NAME.exec(ingredient.name.trim())?.[1]
  return bar === undefined ? null : bar.trim()
}

export interface MoneyBook {
  of: (recipe: BookRecipe) => RecipeMoney
}

/** A purchase row standing for a material costed from its own recipe. */
function costedRow(name: string, copper: number): BoughtRow {
  return { item: name, qty: 1, copper, lastQty: 1, lastCopper: copper, merchant: '', ts: 0 }
}

interface Costing {
  craft: CraftBook
  index: BookIndex
}

interface UnitCost {
  copper: number
  crafted: boolean
  bar?: string
}

/**
 * Copper for one enchanted material at its bar's newest price. Only for a material nothing in
 * the book makes: one with a recipe of its own is costed from that recipe or not at all.
 */
function barCost(c: Costing, ingredient: BookIngredient): UnitCost | null {
  const bar = enchantedFrom(ingredient)
  if (bar === null || (c.index.byItem.get(ingredient.key) ?? []).length > 0) return null
  const paid = lastPaid(c.craft, sourceItemKey(bar))
  return paid === null ? null : { copper: paid.unit, crafted: false, bar }
}

/**
 * Copper for one of a material: its newest purchase, else the cheapest of its own recipes whose
 * every input has a price, per item yielded, else its bar's price when a spell enchants it from
 * a bought bar. `trail` is the loop guard `subRecipes` reads.
 */
function unitCost(c: Costing, ingredient: BookIngredient, trail: readonly string[]): UnitCost | null {
  const paid = lastPaid(c.craft, ingredient.key)
  if (paid !== null) return { copper: paid.unit, crafted: false }
  let best: number | null = null
  for (const made of subRecipes(c.index, ingredient.key, trail)) {
    const cost = costOf(c, made, [...trail, ingredient.key]).perCombine
    if (cost === null) continue
    const each = cost / Math.max(1, made.yieldQty ?? 1)
    if (best === null || each < best) best = each
  }
  return best === null ? barCost(c, ingredient) : { copper: best, crafted: true }
}

/** Each enchanted material's bar, by the material's name. */
function barsOf(ingredients: readonly BookIngredient[]): Record<string, string> {
  const bars: Record<string, string> = {}
  for (const ingredient of ingredients) {
    const bar = enchantedFrom(ingredient)
    if (bar !== null) bars[ingredient.name] = bar
  }
  return bars
}

function saleOf(craft: CraftBook, recipe: BookRecipe): SoldRow | null {
  const own = craft.sold.get(recipe.key)
  if (own !== undefined) return own
  return recipe.yieldItem === undefined ? null : (craft.sold.get(sourceItemKey(recipe.yieldItem)) ?? null)
}

function costOf(c: Costing, recipe: BookRecipe, trail: readonly string[]): RecipeMoney {
  const consumed = recipe.ingredients.filter((i) => !returnedOnSuccess(i))
  const rows: BoughtRow[] = []
  const parts: CostPart[] = []
  for (const ingredient of consumed) {
    const unit = unitCost(c, ingredient, trail)
    if (unit === null) continue
    rows.push(costedRow(ingredient.name, unit.copper))
    parts.push({
      name: ingredient.name,
      copper: unit.copper * (ingredient.qty ?? 1),
      crafted: unit.crafted,
      ...(unit.bar === undefined ? {} : { bar: unit.bar })
    })
  }
  const sale = saleOf(c.craft, recipe)
  // The sum and the "every material has a price" rule are `crafting.combineCost`'s.
  const cost = combineCost({ bought: rows, sold: [] }, { item: recipe.item, made: 0, failed: 0 }, consumed)
  const single = (recipe.yieldQty ?? 1) === 1
  return {
    perCombine: cost.perCombine,
    parts: cost.perCombine === null ? [] : parts,
    unpriced: cost.unpriced,
    returned: recipe.ingredients.filter(returnedOnSuccess).map((i) => i.name),
    bars: barsOf(consumed),
    sale,
    difference: cost.perCombine === null || sale === null || !single ? null : sale.lastCopper - cost.perCombine
  }
}

/** Costs every recipe asked of it once: the table asks per line, the panel per recipe. */
export function moneyBook(craft: CraftBook, index: BookIndex): MoneyBook {
  const memo = new Map<string, RecipeMoney>()
  const c: Costing = { craft, index }
  return {
    of: (recipe) => {
      const had = memo.get(recipe.id)
      if (had !== undefined) return had
      const money = costOf(c, recipe, [recipe.key])
      memo.set(recipe.id, money)
      return money
    }
  }
}

// ---- the words on screen ------------------------------------------------------------------------

/** The Cost cell of a recipe line: the price, or nothing. */
export function costCell(money: RecipeMoney): string {
  return money.perCombine === null ? '' : ppText(money.perCombine)
}

/** The Sells cell of a recipe line: what the newest sale line paid, or nothing. */
export function sellsCell(money: RecipeMoney): string {
  return money.sale === null ? '' : ppText(money.sale.lastCopper)
}

/** How a part came by its price when it was not bought as itself; '' for a plain purchase. */
function partMark(part: CostPart): string {
  if (part.bar !== undefined) return ` (the price of a ${part.bar}, enchanted by a spell)`
  return part.crafted ? ' (from its own recipe)' : ''
}

/**
 * "Enchanted Gold Bar 10.50 pp (the price of a Gold Bar, enchanted by a spell) + Ruby 131.25 pp",
 * with "(from its own recipe)" on a material costed from its recipe.
 */
export function costPartsText(money: RecipeMoney): string {
  return money.parts.map((p) => `${p.name} ${ppText(p.copper)}${partMark(p)}`).join(' + ')
}

/**
 * Why a recipe with materials has no cost; '' when it has one, or lists no material at all. An
 * enchanted material is named by the bar whose purchase would price it.
 */
export function noCostText(money: RecipeMoney): string {
  if (money.perCombine !== null || money.unpriced.length === 0) return ''
  const names = money.unpriced.map((name) => {
    const bar = money.bars[name]
    return bar === undefined ? name : `${bar} (the bar a spell enchants into ${name})`
  })
  return `No cost stated: your log shows no purchase of ${names.join(', ')}.`
}

/** A sale this close to the materials' cost reads as the same: one part in a hundred. */
export const SAME_PRICE_SHARE = 0.01

/**
 * A sale against the cost of the materials: "2.25 pp over the materials", "4.75 pp under the
 * materials", or "the same as the materials" when the two are within one percent of the cost (a
 * ring that cost 141.748 pp and sold for 141.75 pp made nothing worth a line); '' when not stated.
 */
export function differenceText(money: RecipeMoney): string {
  if (money.difference === null || money.perCombine === null) return ''
  if (Math.abs(money.difference) <= money.perCombine * SAME_PRICE_SHARE) return 'the same as the materials'
  return money.difference > 0 ? `${ppText(money.difference)} over the materials` : `${ppText(-money.difference)} under the materials`
}

export const COST_TIP =
  'What one combine takes, at the price your log shows you last paid for each material. An enchanted bar counts at the price of the bar it is enchanted from. Blank when a material has no price in your log.'
export const SELLS_TIP = 'What a merchant last paid you for this item, from your log. The sale line states no quantity: for a stack it is the whole stack.'
export const YOU_TIP = 'Your own combines of this recipe, from your log.'
