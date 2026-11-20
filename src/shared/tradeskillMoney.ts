// shared/tradeskillMoney.ts — what a recipe costs and brings back, from the player's own log
// (owner, 2026-11-20: level "efficently (for money reduction)"). Every number here is a price a
// merchant line in the log stated; where the log has no price, nothing is stated.
//
// - A material's price is the newest purchase line's, per unit (`crafting.unitCopper`).
// - A material never bought is costed from its own recipe when every input of that recipe has a
//   price (the cheapest such recipe, divided by what one combine yields).
// - A material the wiki marks as returned on success (a tool) costs a made combine nothing.
// - A material with neither a purchase nor a costed recipe leaves the recipe's cost unknown.
//   Enchanted Gold Bar is the plain case: made by a spell from a bought Gold Bar, never bought, no
//   wiki recipe. No rule is made up for it: the recipe has no cost and the panel names the bar.
// - The sale line states no quantity, so a sale price is what one sale LINE paid. The difference
//   is stated only for a recipe that yields one item.

import { combineCost, unitCopper, type BoughtRow, type SoldRow } from './crafting'
import { sourceItemKey } from './itemSources'
import { subRecipes, type BookIndex, type BookIngredient, type BookRecipe } from './tradeskillBook'
import type { CraftBook } from './tradeskillHistory'

/** Copper as platinum, to the copper: "131.25 pp", "14.175 pp", "0.05 pp". */
export function ppText(copper: number): string {
  const fixed = (Math.round(copper) / 1000).toFixed(3)
  return `${fixed.endsWith('0') ? fixed.slice(0, -1) : fixed} pp`
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

/**
 * Copper for one of a material: its newest purchase, else the cheapest of its own recipes whose
 * every input has a price, per item yielded. `trail` is the loop guard `subRecipes` reads.
 */
function unitCost(c: Costing, ingredient: BookIngredient, trail: readonly string[]): { copper: number; crafted: boolean } | null {
  const paid = lastPaid(c.craft, ingredient.key)
  if (paid !== null) return { copper: paid.unit, crafted: false }
  let best: number | null = null
  for (const made of subRecipes(c.index, ingredient.key, trail)) {
    const cost = costOf(c, made, [...trail, ingredient.key]).perCombine
    if (cost === null) continue
    const each = cost / Math.max(1, made.yieldQty ?? 1)
    if (best === null || each < best) best = each
  }
  return best === null ? null : { copper: best, crafted: true }
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
    parts.push({ name: ingredient.name, copper: unit.copper * (ingredient.qty ?? 1), crafted: unit.crafted })
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

/** "Enchanted Gold Bar 10.50 pp + Ruby 131.25 pp", with "(from its own recipe)" on a costed one. */
export function costPartsText(money: RecipeMoney): string {
  return money.parts.map((p) => `${p.name} ${ppText(p.copper)}${p.crafted ? ' (from its own recipe)' : ''}`).join(' + ')
}

/** Why a recipe with materials has no cost; '' when it has one, or lists no material at all. */
export function noCostText(money: RecipeMoney): string {
  if (money.perCombine !== null || money.unpriced.length === 0) return ''
  return `No cost stated: your log shows no purchase of ${money.unpriced.join(', ')}.`
}

/** "made 10.50 pp", "lost 4.75 pp", "the same" against the cost; '' when not stated. */
export function differenceText(money: RecipeMoney): string {
  if (money.difference === null) return ''
  if (money.difference === 0) return 'the same as the materials'
  return money.difference > 0 ? `${ppText(money.difference)} over the materials` : `${ppText(-money.difference)} under the materials`
}

export const COST_TIP = 'What one combine takes, at the price your log shows you last paid for each material. Blank when a material has no price in your log.'
export const SELLS_TIP = 'What a merchant last paid you for this item, from your log. The sale line states no quantity: for a stack it is the whole stack.'
export const YOU_TIP = 'Your own combines of this recipe, from your log.'
