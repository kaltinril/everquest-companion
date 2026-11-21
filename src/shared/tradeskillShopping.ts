// shared/tradeskillShopping.ts — the shopping list for a route's next step: for a number of
// combines, each material with how many are needed, held and still to get, where it comes from,
// and what the trip costs at the player's own prices.
//
// - The expansion is tradeskillMaterials.ts: a made or enchanted material the player lacks rolls
//   up to what it takes in turn, and one held stock serves every place a material is used.
// - Where, strongest first: the player's last merchant and price (the log), else the recipe
//   guide's merchant with zone and loc, else where it drops or is foraged, else the wiki's words.
// - The total is stated only when every material still to buy has a price in the log. One missing
//   price and there is no total: the list names what has none.
// - The copied text is plain text, one material per line.

import type { ItemSource } from './itemSources'
import { materialDrops, type BookRecipe, type MaterialDrops } from './tradeskillBook'
import { locatedSource, type GuideSource } from './tradeskillGuide'
import { expandMaterials, type MaterialFacts, type NeedLine } from './tradeskillMaterials'
import { lastPaid, ppText, type LastPaid } from './tradeskillMoney'

export interface ShoppingFacts extends MaterialFacts {
  /** A material's drop sources, by its key: the Loot page's own join, handed in by the screen. */
  drops: (key: string) => readonly ItemSource[]
  /** The Current era setting: out-of-era mobs are left out of a material's drops and counted. */
  eraOnly: boolean
}

/** Where a material comes from, as the strongest fact the data has for it. */
export type ShoppingWhere =
  | { kind: 'paid'; paid: LastPaid }
  | { kind: 'guide'; source: GuideSource }
  | { kind: 'found'; drops: MaterialDrops; forage: readonly string[]; forageNote?: string }
  | { kind: 'made'; recipe: BookRecipe; combines: number }
  | { kind: 'enchant'; bar: string }
  | { kind: 'words'; text: string }
  | { kind: 'none' }

export interface ShoppingLine extends NeedLine {
  where: ShoppingWhere
  /** Copper for one at the price last paid; null when the log has none, or the line is not bought. */
  unit: number | null
  /** Copper for what is still to buy; null with no price, 0 with nothing to buy. */
  cost: number | null
}

export interface ShoppingList {
  recipe: BookRecipe
  combines: number
  lines: ShoppingLine[]
  /** Copper for everything still to buy; null when any of it has no price in the log. */
  total: number | null
  /** Materials still to buy that have no price in the log. */
  unpriced: string[]
  /** True when the held counts cover every material. */
  covered: boolean
  /** False when a held count is unknown: every "to buy" is then the full need. */
  haveKnown: boolean
  /** The materials are the recipe guide's list (the wiki lists none). */
  fromGuide: boolean
}

export const COMBINES_DEFAULT = 20
export const COMBINES_MAX = 1000

/** A stored or typed number of combines: whole, 1 to 1000; anything else is the default. */
export function asCombines(raw: string | number | null): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return COMBINES_DEFAULT
  return Math.min(COMBINES_MAX, Math.max(1, Math.trunc(n)))
}

function foundWhere(facts: ShoppingFacts, line: NeedLine): ShoppingWhere | null {
  const drops = materialDrops(facts.drops(line.key), facts.eraOnly)
  const material = facts.index.materials.get(line.key)
  const forage = material?.foraged ?? []
  if (drops.shown.length === 0 && forage.length === 0 && material?.foragedNote === undefined) return null
  return { kind: 'found', drops, forage, ...(material?.foragedNote === undefined ? {} : { forageNote: material.foragedNote }) }
}

/** Where a bought (or farmed) material comes from, strongest fact first. */
function boughtWhere(facts: ShoppingFacts, line: NeedLine): ShoppingWhere {
  const paid = lastPaid(facts.craft, line.key)
  if (paid !== null) return { kind: 'paid', paid }
  const guide = line.guide ?? locatedSource(facts.guides, line.key)
  if (guide !== null) return { kind: 'guide', source: guide }
  const found = foundWhere(facts, line)
  if (found !== null) return found
  return line.sources.length === 0 ? { kind: 'none' } : { kind: 'words', text: line.sources.join(', ') }
}

function whereOf(facts: ShoppingFacts, line: NeedLine): ShoppingWhere {
  if (line.bar !== undefined) return { kind: 'enchant', bar: line.bar }
  if (line.action === 'make' && line.made !== undefined) return { kind: 'made', recipe: line.made.recipe, combines: line.made.combines }
  return boughtWhere(facts, line)
}

function shoppingLine(facts: ShoppingFacts, line: NeedLine): ShoppingLine {
  const unit = line.action === 'buy' ? (lastPaid(facts.craft, line.key)?.unit ?? null) : null
  return { ...line, where: whereOf(facts, line), unit, cost: unit === null ? null : unit * line.short }
}

/** The shopping list for `combines` combines of a recipe. */
export function shoppingList(facts: ShoppingFacts, recipe: BookRecipe, combines: number): ShoppingList {
  const plan = expandMaterials(facts, recipe, combines)
  const lines = plan.lines.map((line) => shoppingLine(facts, line))
  const toBuy = lines.filter((line) => line.action === 'buy' && line.short > 0)
  const unpriced = toBuy.filter((line) => line.cost === null).map((line) => line.name)
  return {
    recipe,
    combines,
    lines,
    total: unpriced.length > 0 ? null : toBuy.reduce((sum, line) => sum + (line.cost ?? 0), 0),
    unpriced,
    covered: lines.every((line) => line.short === 0),
    haveKnown: plan.haveKnown,
    fromGuide: plan.fromGuide
  }
}

// ---- the words on screen and on the clipboard ---------------------------------------------------

/** The To buy cell: "6", "make 3", "enchant 37", or "0". */
export function toGetText(line: Pick<NeedLine, 'action' | 'short'>): string {
  if (line.short === 0 || line.action === 'buy') return String(line.short)
  return `${line.action} ${String(line.short)}`
}

/** "for Enchanted Gold Bar": what a rolled-up material goes into; '' for the recipe's own. */
export function intoText(line: Pick<NeedLine, 'into'>): string {
  return line.into.length === 0 ? '' : `for ${line.into.join(', ')}`
}

function guideWords(source: GuideSource): string {
  const parts = [source.merchant ?? source.sourceText, source.zone, source.loc === undefined ? undefined : `loc ${source.loc}`, ...source.notes]
  return parts.filter((part): part is string => part !== undefined && part !== '').join(', ')
}

function foundWords(where: Extract<ShoppingWhere, { kind: 'found' }>): string {
  const mobs = where.drops.shown.map((s) => (s.zones.length === 0 ? s.mob : `${s.mob} (${s.zones.join(', ')})`)).join('; ')
  const more = where.drops.more > 0 ? ` and ${String(where.drops.more)} more` : ''
  const drops = mobs === '' ? '' : `Drops: ${mobs}${more}.`
  const zones = [...where.forage, ...(where.forageNote === undefined ? [] : [where.forageNote])].join(', ')
  const forage = zones === '' ? '' : `Forage: ${zones}.`
  return [drops, forage].filter((part) => part !== '').join(' ')
}

/** "2 combines" of a made material's own recipe. */
export function madeWords(recipe: BookRecipe, combines: number): string {
  const skill = recipe.tradeskill ?? recipe.skillWord
  const trivial = recipe.trivial === undefined ? '' : `trivial ${String(recipe.trivial)}`
  const facts = [skill, trivial].filter((part) => part !== undefined && part !== '').join(', ')
  const count = `${String(combines)} ${combines === 1 ? 'combine' : 'combines'}`
  return facts === '' ? `Made by you: ${count}.` : `Made by you (${facts}): ${count}.`
}

export function enchantWords(bar: string): string {
  return `A spell enchants it from a ${bar}.`
}

/** "Last bought for 131.25 pp each from Jade in North Freeport." */
export function paidWords(paid: LastPaid): string {
  return `Last bought for ${ppText(paid.unit)} each from ${paid.merchant}${paid.zone === undefined ? '' : ` in ${paid.zone}`}.`
}

/** Where a material comes from, as one plain sentence; '' when the data states nothing. */
export function whereText(where: ShoppingWhere): string {
  switch (where.kind) {
    case 'paid':
      return paidWords(where.paid)
    case 'guide':
      return `Guide: ${guideWords(where.source)}.`
    case 'found':
      return foundWords(where)
    case 'made':
      return madeWords(where.recipe, where.combines)
    case 'enchant':
      return enchantWords(where.bar)
    case 'words':
      return `Wiki: ${where.text}.`
    case 'none':
      return ''
  }
}

/** The line under the list: the total, or why there is none. */
export function totalText(list: ShoppingList): string {
  if (list.lines.length === 0) return ''
  if (list.covered) return `Nothing to buy: you hold everything for ${String(list.combines)} ${list.combines === 1 ? 'combine' : 'combines'}.`
  if (list.total === null) return `No total: your log has no price for ${list.unpriced.join(', ')}.`
  if (list.total === 0) return 'Nothing to buy from a merchant.'
  return `To buy, at the prices you last paid: ${ppText(list.total)}.`
}

/**
 * Where Have comes from, under the list; `dumped` is the inventory dump's date, formatted, or
 * null with no dump. '' when neither the dump nor the log says what is held.
 */
export function haveFromText(dumped: string | null, logInUse: boolean): string {
  if (dumped === null) return logInUse ? 'Have is the depot count your log last stated, for the materials it names.' : ''
  return `Have is from your inventory dump of ${dumped}.${logInUse ? ' Where your log states a newer depot count for a material, that count is used.' : ''}`
}

export const HAVE_UNKNOWN_TEXT = 'A blank Have is not known: there is no inventory dump to count it from, so its To buy is the full need.'

function headLine(list: ShoppingList): string {
  const { recipe } = list
  const facts = [recipe.tradeskill ?? recipe.skillWord, recipe.trivial === undefined ? undefined : `trivial ${String(recipe.trivial)}`, recipe.container]
  const stated = facts.filter((part): part is string => part !== undefined).join(', ')
  return `${recipe.item} x ${String(list.combines)}${stated === '' ? '' : ` (${stated})`}`
}

function copyLine(line: ShoppingLine): string {
  const into = intoText(line)
  const name = into === '' ? line.name : `${line.name} (${into})`
  const have = line.have === null ? 'have not known' : `have ${String(line.have)}`
  // A material no merchant is known for is farmed, not bought.
  const verb = line.where.kind === 'found' ? 'get' : 'buy'
  const get = line.action === 'buy' ? `${verb} ${String(line.short)}` : toGetText(line)
  const where = whereText(line.where)
  return `${name}: need ${String(line.need)}, ${have}, ${get}.${where === '' ? '' : ` ${where}`}`
}

/** The list as plain text for the clipboard: a head line, a line per material, the total. */
export function shoppingCopyText(list: ShoppingList): string {
  const lines = [headLine(list), ...list.lines.map(copyLine)]
  if (!list.haveKnown) lines.push(HAVE_UNKNOWN_TEXT)
  const total = totalText(list)
  if (total !== '') lines.push(total)
  return lines.join('\n')
}
