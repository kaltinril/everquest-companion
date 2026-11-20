// shared/tradeskillHistory.ts — the player's own combines on a workbench (fork #6: "number of
// combines, successes and failures"): the engine's `crafting` snapshot keyed for lookup, one
// tradeskill's totals, pace and item rows, what the log says of one recipe, and the count held
// when the log's depot line is newer than the inventory dump.
//
// The counting is shared/crafting.ts; this file joins it to the recipe book. A combine's line
// never names its tradeskill, so an item no raise named is placed by the book's recipe for it.

import {
  craftingPace,
  itemTradeskill,
  tradeskillTotals,
  type BoughtRow,
  type CraftedItemRow,
  type CraftingPace,
  type CraftingSnap,
  type DepotRow,
  type RecipeTradeskill,
  type SoldRow,
  type TradeskillTotals
} from './crafting'
import { sourceItemKey } from './itemSources'
import { recipeOrder, type BookIndex, type BookRecipe } from './tradeskillBook'
import type { Tradeskill } from './tradeskills'

const NO_CRAFTING: CraftingSnap = { items: [], levels: [], spans: [], bought: [], sold: [], depot: [] }

/** The crafting snapshot as the workbench reads it. Every map is keyed by `sourceItemKey`. */
export interface CraftBook {
  /** False until the engine has served the crafting module: nothing is known yet, not "none". */
  served: boolean
  snap: CraftingSnap
  items: ReadonlyMap<string, CraftedItemRow>
  bought: ReadonlyMap<string, BoughtRow>
  sold: ReadonlyMap<string, SoldRow>
  depot: ReadonlyMap<string, DepotRow>
  /** An item's tradeskill from the recipe book, for `itemTradeskill`. */
  skillOf: RecipeTradeskill
}

/** Rows by item key; of two rows with one key (a `+N` copy) the newest stays. */
function newestByKey<Row extends { item: string }>(rows: readonly Row[], at: (row: Row) => number): Map<string, Row> {
  const out = new Map<string, Row>()
  for (const row of rows) {
    const key = sourceItemKey(row.item)
    const had = out.get(key)
    if (had === undefined || at(row) >= at(had)) out.set(key, row)
  }
  return out
}

/** The tradeskill of the first recipe (in ladder order) that makes the item and names one. */
export function recipeSkillLookup(index: BookIndex): RecipeTradeskill {
  return (item) => {
    const made = index.byItem.get(sourceItemKey(item)) ?? []
    return [...made].sort(recipeOrder).find((r) => r.tradeskill !== undefined)?.tradeskill
  }
}

export function indexCrafting(snap: CraftingSnap | null, index: BookIndex): CraftBook {
  const read = snap ?? NO_CRAFTING
  return {
    served: snap !== null,
    snap: read,
    items: newestByKey(read.items, (r) => r.lastTs),
    bought: newestByKey(read.bought, (r) => r.ts),
    sold: newestByKey(read.sold, (r) => r.ts),
    depot: newestByKey(read.depot, (r) => r.ts),
    skillOf: recipeSkillLookup(index)
  }
}

// ---- one recipe ---------------------------------------------------------------------------------

/**
 * What the log says of a recipe: the row of the item it makes, by the item's name or by what the
 * combine yields. Two recipes that make one item (two tradeskills, two wiki pages) share the row:
 * the log names the item, never the recipe.
 */
export function recipeHistory(craft: CraftBook, recipe: BookRecipe): CraftedItemRow | null {
  const own = craft.items.get(recipe.key)
  if (own !== undefined) return own
  return recipe.yieldItem === undefined ? null : (craft.items.get(sourceItemKey(recipe.yieldItem)) ?? null)
}

function raisesWords(row: CraftedItemRow): string {
  if (row.raises === 0) return ''
  const count = `${String(row.raises)} ${row.raises === 1 ? 'raise' : 'raises'}`
  if (row.firstRaise === undefined || row.lastRaise === undefined) return `, ${count}`
  const span = row.firstRaise === row.lastRaise ? `to ${String(row.lastRaise)}` : `${String(row.firstRaise)} to ${String(row.lastRaise)}`
  return `, ${count} (${span})`
}

/** "made 92, failed 29, 33 raises (114 to 146)". */
export function historyWords(row: CraftedItemRow): string {
  return `made ${String(row.made)}, failed ${String(row.failed)}${raisesWords(row)}`
}

/** The game's own trivial notice for the item: how often it printed and when last. Null when it never did. */
export function trivialNotice(row: CraftedItemRow | null): { count: number; ts: number | null } | null {
  if (row === null || row.trivial <= 0) return null
  return { count: row.trivial, ts: row.trivialTs ?? null }
}

export const NOTICE_LABEL = 'trivial for you'

/** The hover of the "trivial for you" mark; `when` is the newest notice's date, already formatted. */
export function noticeTip(count: number, when: string): string {
  const times = count === 1 ? 'once' : `${String(count)} times`
  const last = when === '' ? '' : `, last on ${when}`
  return `The game said "You can no longer advance your skill from making this item" ${times}${last}. This is the game's own word, apart from the level mark.`
}

export const NO_HISTORY_TEXT = 'Your log shows no combine of this recipe.'

// ---- one tradeskill -----------------------------------------------------------------------------

export interface HistoryRow {
  row: CraftedItemRow
  combines: number
  /** `made / combines`, 0 to 1. */
  successRate: number | null
  /** The tradeskill's recipe that makes the item, for opening it; null when the book has none. */
  recipeId: string | null
}

/** Items the log shows combined that neither a raise nor the recipe book places in a tradeskill. */
export interface UnplacedItems {
  items: number
  combines: number
  names: string[]
}

export interface SkillHistory {
  /** Null when the log shows no combine of the tradeskill. */
  totals: TradeskillTotals | null
  pace: CraftingPace
  /** One row per item, the newest combine first. */
  rows: HistoryRow[]
  unplaced: UnplacedItems
}

/**
 * The tradeskill's recipes by the key of the item the log would name: the made item's, and what
 * the combine yields when that has another name. The first in ladder order wins a shared key.
 */
function recipeIds(index: BookIndex, tradeskill: Tradeskill): Map<string, string> {
  const recipes = [...index.byId.values()].filter((r) => r.tradeskill === tradeskill).sort(recipeOrder)
  const out = new Map<string, string>()
  for (const recipe of recipes) if (!out.has(recipe.key)) out.set(recipe.key, recipe.id)
  for (const recipe of recipes) {
    const yields = recipe.yieldItem === undefined ? recipe.key : sourceItemKey(recipe.yieldItem)
    if (!out.has(yields)) out.set(yields, recipe.id)
  }
  return out
}

export function skillHistory(craft: CraftBook, index: BookIndex, tradeskill: Tradeskill): SkillHistory {
  const rows: HistoryRow[] = []
  const ids = recipeIds(index, tradeskill)
  const unplaced: UnplacedItems = { items: 0, combines: 0, names: [] }
  for (const row of craft.snap.items) {
    const of = itemTradeskill(row, craft.skillOf)
    const combines = row.made + row.failed
    if (of === undefined) {
      unplaced.items += 1
      unplaced.combines += combines
      unplaced.names.push(row.item)
    }
    if (of !== tradeskill) continue
    rows.push({ row, combines, successRate: combines > 0 ? row.made / combines : null, recipeId: ids.get(sourceItemKey(row.item)) ?? null })
  }
  rows.sort((a, b) => b.row.lastTs - a.row.lastTs || a.row.item.localeCompare(b.row.item))
  unplaced.names.sort((a, b) => a.localeCompare(b))
  const totals = tradeskillTotals(craft.snap.items, craft.skillOf).find((t) => t.tradeskill === tradeskill) ?? null
  return { totals, pace: craftingPace(craft.snap, tradeskill), rows, unplaced }
}

/** How many of a tradeskill's listed recipes the log shows made at least once. */
export function madeRecipes(craft: CraftBook, recipes: readonly BookRecipe[]): number {
  let made = 0
  for (const recipe of recipes) if ((recipeHistory(craft, recipe)?.made ?? 0) > 0) made += 1
  return made
}

// ---- the words on screen ------------------------------------------------------------------------

/** `0.7603` as "76%"; '' for no rate. */
export function percentText(rate: number | null): string {
  return rate === null ? '' : `${String(Math.round(rate * 100))}%`
}

/** One decimal under 100, none above: "3.7", "121". */
export function rateText(n: number | null): string {
  if (n === null) return ''
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)
}

/** The workbench head's short count: "121 combines in your log: 92 made, 29 failed". '' for none. */
export function totalsLine(totals: TradeskillTotals | null): string {
  if (totals === null || totals.combines === 0) return ''
  const word = totals.combines === 1 ? 'combine' : 'combines'
  return `${String(totals.combines)} ${word} in your log: ${String(totals.made)} made, ${String(totals.failed)} failed`
}

/** A figure of the history tab's totals: a label and its value, already worded. */
export interface HistoryFigure {
  id: string
  label: string
  value: string
}

/** The totals as figures, in reading order; a rate with nothing under it is left out. */
export function totalsFigures(totals: TradeskillTotals): HistoryFigure[] {
  const figures: HistoryFigure[] = [
    { id: 'combines', label: 'Combines', value: String(totals.combines) },
    { id: 'made', label: 'Made', value: String(totals.made) },
    { id: 'failed', label: 'Failed', value: String(totals.failed) },
    { id: 'success', label: 'Success', value: percentText(totals.successRate) },
    { id: 'raises', label: 'Raises', value: String(totals.raises) },
    { id: 'per-raise', label: 'Combines per raise', value: rateText(totals.combinesPerRaise) }
  ]
  return figures.filter((f) => f.value !== '')
}

/** Time spent combining as "2 h 5 min" or "35 min". */
function craftingTime(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours === 0 ? `${String(minutes)} min` : `${String(hours)} h ${String(minutes % 60)} min`
}

/**
 * The pace line: "85 combines and 12.4 raises per crafting hour, over 2 h 5 min of crafting in 3
 * runs that raised the skill." '' until the runs add up to enough time to state a rate.
 */
export function paceLine(pace: CraftingPace): string {
  if (pace.combinesPerHour === null || pace.raisesPerHour === null) return ''
  const runs = pace.spans === 1 ? '1 run' : `${String(pace.spans)} runs`
  return `${rateText(pace.combinesPerHour)} combines and ${rateText(pace.raisesPerHour)} raises per crafting hour, over ${craftingTime(pace.ms)} of crafting in ${runs} that raised the skill.`
}

export const PACE_TIP =
  'A crafting hour is time spent combining: a run ends when five minutes pass with no combine. Only runs that raised this skill are counted, because the log names a combine\'s tradeskill no other way.'

/** Some run raised the skill, but the runs are too short together to state a rate. */
export function paceTooShort(pace: CraftingPace): boolean {
  return pace.spans > 0 && pace.combinesPerHour === null
}

export const PACE_SHORT_TEXT = 'Not enough crafting time yet to state a pace.'

/** "114 to 146", "to 207" for one raise, '' for none. */
export function levelsText(row: CraftedItemRow): string {
  if (row.firstRaise === undefined || row.lastRaise === undefined) return ''
  return row.firstRaise === row.lastRaise ? String(row.lastRaise) : `${String(row.firstRaise)} to ${String(row.lastRaise)}`
}

export function noCombinesText(tradeskill: Tradeskill): string {
  return `Your log shows no ${tradeskill} combine.`
}

const UNPLACED_NAMES = 6

/** The line for combines no tradeskill claims, or '' when every item is placed. */
export function unplacedText(unplaced: UnplacedItems): string {
  if (unplaced.items === 0) return ''
  const shown = unplaced.names.slice(0, UNPLACED_NAMES).join(', ')
  const more = unplaced.names.length > UNPLACED_NAMES ? ` and ${String(unplaced.names.length - UNPLACED_NAMES)} more` : ''
  const items = unplaced.items === 1 ? '1 item' : `${String(unplaced.items)} items`
  return `Not on any workbench: ${String(unplaced.combines)} combines of ${items} that no raise named and the wiki has no recipe for (${shown}${more}).`
}

/** ", 31 made by you" after the recipe count; '' when the log shows none made. */
export function madeByYouText(made: number): string {
  return made > 0 ? `, ${String(made)} made by you` : ''
}

// ---- what the player holds now ------------------------------------------------------------------

export interface HaveNow {
  count: number
  /** `depot`: the log's newest `leaving N`, which counts the tradeskill depot only. */
  source: 'dump' | 'depot'
  /** When that source was written, epoch ms; null for a dump whose time could not be read. */
  ts: number | null
}

/**
 * How many of a material the player holds: the inventory dump's count, or the log's depot count
 * when that line is newer than the dump (or there is no dump). A dump whose time is unknown is
 * kept: nothing says the log is newer.
 */
export function haveNow(dump: { count: number; at: number | null } | null, depot: DepotRow | undefined): HaveNow | null {
  if (depot !== undefined && (dump === null || (dump.at !== null && depot.ts > dump.at))) {
    return { count: depot.left, source: 'depot', ts: depot.ts }
  }
  return dump === null ? null : { count: dump.count, source: 'dump', ts: dump.at }
}

/** The hover of a count taken from the log; the dates come already formatted. */
export function depotTip(when: string, dumped: string): string {
  const than = dumped === '' ? '' : `, newer than your inventory dump of ${dumped}`
  return `Your log's depot count on ${when}${than}. It counts the tradeskill depot only, not bags or bank.`
}

/** A depot line in the log is newer than the dump (or there is no dump): some count may be the log's. */
export function logCountsInUse(craft: CraftBook, dump: { at: number | null } | null): boolean {
  for (const row of craft.depot.values()) {
    if (dump === null || (dump.at !== null && row.ts > dump.at)) return true
  }
  return false
}

/** The line under the materials saying where Have comes from; `dumped` is the dump's date, formatted, or null. */
export function haveSourceText(dumped: string | null, logInUse: boolean): string {
  const log = logInUse ? 'A count marked log is the depot count your log stated last.' : ''
  if (dumped === null) return log
  return `Have is from your inventory dump of ${dumped}.${logInUse ? ' A count marked log is the depot count your log stated after it.' : ''}`
}
