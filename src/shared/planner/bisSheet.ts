// planner/bisSheet.ts — THE BEST IN SLOT SHEET: one item per cell of the character sheet, chosen by the
// player's own tier board (plans/2026-11-24-bis-sheet.md "The sheet" and "Version 2 design";
// requirements/bis-sheet.md).
//
// The asks it answers (Malkil, 2026-11-24): *"select classes, which limits what gear can be
// recommended to only items that are usable"*; *"The BiS recommendations should be based upon the
// weights given to these stats"*; *"respect Lore Equipped when determining if multiple of a single
// item can be equipped"*; *"weapon ratios should never be considered for either of the two ANY
// slots"*. The scoring is `tierWeights.ts`; the exact choice is `bisSearch.ts`; caps are
// `bisCaps.ts`; this file builds the candidates per cell and reads the answer back.
//
// THE CELLS ARE THE BOARD'S 23 (`PLAN_SLOTS`): the paired slots twice, AMMO, and the two ANY cells,
// which host an item of any slot and read it as a stat stick (no ratio). A two-hander may sit only
// in PRIMARY (or an ANY cell, as a stat stick); three corpus rows also list SECONDARY and are kept
// out of it.
//
// LORE: any flag that starts with "Lore" limits an item to one cell. Measured 2026-11-24 over the
// 6,975 gear rows: "Lore Item" 2,628, "Lore Equipped" 520, "Lore" 4, "LORE EQUPPED" 1 (the wiki's
// spelling), "Lore Group: ..." 2. A Lore Group's members exclude EACH OTHER in the game; that is not
// modelled (two pages), each is only limited to itself.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import type { GearRow } from './gear'
import { improveUnderCaps, type CapCell, type CapRules } from './bisCaps'
import { searchLoadout, type HasteRate, type SearchCandidate, type SearchCell } from './bisSearch'
import { gearHandedness } from './roleWeights'
import { RATIO_CHIPS, activeChips, isRatioChip, tierWeight, type TierChip, type TierSetup } from './tierChips'
import { ratioCounts, round3, tierTerms, type TierModel, type TierTerm } from './tierWeights'
import { PLAN_SLOTS, equipSlotOf, isAnyCell, type PlanSlotId } from './types'
import { isUnobtainable } from './unobtainable'

export interface BisOptions {
  rows: readonly GearRow[]
  setup: TierSetup
  model: TierModel
  /** the picked classes; empty = not stated, which admits every row (law 1) */
  classes: readonly ClassAbbr[]
  /** the caller's other gates (Current era): absent admits every row */
  admit?: (row: GearRow) => boolean
  /** owned-only mode: item key -> copies owned (bags, bank, worn). Absent = best overall */
  owned?: ReadonlyMap<string, number>
}

export interface BisPick {
  row: GearRow
  /**
   * the item's points in this cell, with haste counted only ABOVE the best haste the rest of the
   * loadout already gives (owner, 2026-11-24: *"you cant' stack HASTE items ... you just get the
   * highest haste amongst all the items with haste"*)
   */
  score: number
  /** the haste percent that counted in `score`: 0 when another cell already gives as much; negative = a penalty */
  hasteCounted: number
  /** the weapon ratio it was ranked by first (`damageFirst`), when an S ratio counts in this cell */
  damageFirst?: number
}

export interface BisCell {
  cell: PlanSlotId
  pick?: BisPick & { reasons: TierTerm[] }
  /** the next best in this cell, picked or not elsewhere, scored against the same other-haste */
  runnersUp: BisPick[]
  /** the best haste percent the picks in the OTHER cells give (0 when none) */
  otherHaste: number
  /** SECONDARY left empty because a two-hander sits in PRIMARY */
  closedByTwoHander?: true
}

export interface BisSheet {
  cells: BisCell[]
  /** the loadout's points, haste counted once, caps applied */
  total: number
  /** the loadout's value per chip (HASTE is the best single haste; ratios left out) */
  totals: Partial<Record<TierChip, number>>
  /** how many cells have an item */
  filled: number
}

/** How many candidates per cell the exact search tries. Runners-up read the full list. */
export const SEARCH_WIDTH = 12
/** How many per cell the caps pass may move between (plus the best by uncapped stats). */
const CAP_WIDTH = 30
const RUNNERS_UP = 5
const REASONS = 3

/** Every flag spelling that starts with "Lore" (the census above). */
export function isLoreRow(row: Pick<GearRow, 'flags'>): boolean {
  return row.flags.some((f) => /^\s*lore\b/i.test(f))
}

export function usableBy(row: Pick<GearRow, 'classes'>, classes: readonly ClassAbbr[]): boolean {
  return classes.length === 0 || row.classes.length === 0 || row.classes.some((c) => classes.includes(c))
}

/** Does this row go in this cell at all? */
function fitsCell(row: GearRow, cell: PlanSlotId): boolean {
  if (isAnyCell(cell)) return true
  const slot = equipSlotOf(cell)
  if (slot === null || !row.slots.includes(slot)) return false
  return !(slot === 'SECONDARY' && gearHandedness(row.skill) === '2h')
}

/** One scored candidate, with what the readout and the caps pass need beside the search's numbers. */
interface Scored extends SearchCandidate {
  row: GearRow
  terms: TierTerm[]
  /** its stats + its own positive haste, as if alone: the order the cell lists it in after `prio` */
  display: number
  /** the damage-first ratio (`damageFirst`); `base` carries it times `DAMAGE_FIRST` for the search */
  prio: number
}

function copiesOf(row: GearRow, owned: ReadonlyMap<string, number> | undefined): number {
  const cap = isLoreRow(row) ? 1 : Number.POSITIVE_INFINITY
  return owned === undefined ? cap : Math.min(cap, owned.get(row.key) ?? 0)
}

function hastePerPercent(opts: Pick<BisOptions, 'setup' | 'model'>): number {
  if (!activeChips(opts.setup.split).includes('HASTE')) return 0
  return tierWeight(opts.setup.board.HASTE, opts.setup.step) / opts.model.units.HASTE
}

/**
 * The haste percent an item adds when `other` is already worn: worn haste does not stack, only the
 * highest counts, so it is the part above `other` (each side under the HASTE cap). A penalty
 * (negative haste) always counts in full.
 */
export function hasteCounted(haste: number, other: number, cap: number | undefined): number {
  if (haste <= 0) return haste
  const under = (h: number): number => (cap === undefined ? h : Math.min(h, cap))
  return Math.max(0, under(haste) - under(Math.max(0, other)))
}

/** An item's score in one cell beside a loadout whose other cells give `otherHaste`. */
export interface CellScore {
  score: number
  hasteCounted: number
  /** the terms, HASTE as counted, best first */
  terms: TierTerm[]
}

/** What each card, each runner-up and the worn compare read, so the three can never disagree. */
export function cellScore(row: GearRow, cell: PlanSlotId, otherHaste: number, opts: Pick<BisOptions, 'setup' | 'model' | 'classes'>): CellScore {
  const terms = tierTerms(row, { model: opts.model, setup: opts.setup, slot: cell, classes: opts.classes, skipHaste: true })
  const counted = hasteCounted(row.stats.HASTE ?? 0, otherHaste, opts.setup.caps.HASTE)
  const rate = hastePerPercent(opts)
  if (counted !== 0 && rate !== 0) terms.push({ chip: 'HASTE', value: counted, points: counted * rate })
  terms.sort((a, b) => b.points - a.points)
  return { score: round3(terms.reduce((sum, t) => sum + t.points, 0)), hasteCounted: counted, terms }
}

/**
 * DAMAGE FIRST (owner, 2026-11-24: *"on weapons, the DAMAGE (ratio) should win out over stats and be
 * higher rated"*; *"if the ratio they chose is in the S slot, treat it as priortized ABOVE other stats
 * basically"*). His Wu's Fist of Mastery (ratio 0.73, no stats) lost Primary to Blood's Unity (0.55,
 * +15 to every stat), because a ratio counts in one cell while stats add up.
 *
 * So in a cell where an S-lane ratio chip counts (the hands, RANGE for a bow; never ANY), the weapon's
 * ratio, to two places, is ranked ABOVE everything else: the search sees it times `DAMAGE_FIRST`, a
 * weight no item's stats can reach, and stats only break a tie. The weight is taken back out of the
 * total and never shown: the cards show the ordinary score and say "damage first".
 */
export const DAMAGE_FIRST = 1_000_000

/** The ratio an item is ranked by first in this cell (two places), or 0 when no S ratio chip counts there. */
export function damageFirst(row: GearRow, cell: PlanSlotId, opts: Pick<BisOptions, 'setup' | 'model' | 'classes'>): number {
  const values = opts.model.valuesOf(row)
  let best = 0
  for (const chip of RATIO_CHIPS) {
    const v = values[chip]
    if (opts.setup.board[chip] === 'S' && v !== undefined && v > best && ratioCounts(chip, cell, opts.classes)) best = v
  }
  return Math.round(best * 100) / 100
}

/** Every admitted row in one cell, scored and sorted best-first: damage first where it applies, then the score. */
function scoreCell(cell: PlanSlotId, rows: readonly GearRow[], opts: BisOptions): Scored[] {
  const rate = hastePerPercent(opts)
  const ctx = { model: opts.model, setup: opts.setup, slot: cell, classes: opts.classes, skipHaste: true }
  const out: Scored[] = []
  for (const row of rows) {
    if (!fitsCell(row, cell)) continue
    const terms = tierTerms(row, ctx)
    const stats = round3(terms.reduce((sum, t) => sum + t.points, 0))
    const haste = row.stats.HASTE ?? 0
    const prio = damageFirst(row, cell, opts)
    out.push({ key: row.key, row, terms, base: stats + prio * DAMAGE_FIRST, prio, haste, copies: copiesOf(row, opts.owned), twoHand: gearHandedness(row.skill) === '2h', display: round3(stats + Math.max(0, haste) * rate) })
  }
  return out.sort((a, b) => b.prio - a.prio || b.display - a.display || a.row.name.localeCompare(b.row.name))
}

/** The rows the sheet may use at all: obtainable, the class picks, the caller's gates, owned-only. */
function admitted(opts: BisOptions): GearRow[] {
  return opts.rows.filter(
    (row) =>
      !isUnobtainable(row) && usableBy(row, opts.classes) && (opts.admit === undefined || opts.admit(row)) && (opts.owned === undefined || (opts.owned.get(row.key) ?? 0) > 0)
  )
}

/** PRIMARY before SECONDARY, so the two-hander rule sees the hand first; ANY cells last. */
function searchOrder(): PlanSlotId[] {
  const hands: PlanSlotId[] = ['PRIMARY', 'SECONDARY']
  return [...hands, ...PLAN_SLOTS.filter((c) => !hands.includes(c) && !isAnyCell(c)), ...PLAN_SLOTS.filter(isAnyCell)]
}

/** The caps that bind on the board: active chips with a cap and a lane. */
function capRules(opts: BisOptions): CapRules | undefined {
  const { setup, model } = opts
  const caps = new Map<TierChip, number>()
  const perValue = new Map<TierChip, number>()
  for (const chip of activeChips(setup.split)) {
    const cap = setup.caps[chip]
    if (cap === undefined || isRatioChip(chip) || setup.board[chip] === 'Off') continue
    if (chip !== 'HASTE') caps.set(chip, cap)
    perValue.set(chip, tierWeight(setup.board[chip], setup.step) / model.units[chip])
  }
  if (perValue.size === 0) return undefined
  return { caps, perValue, hastePerPercent: hastePerPercent(opts), hasteCap: setup.caps.HASTE }
}

/** Each cell's pool for the caps pass: the best by full score, plus the best by uncapped stats. */
function capPool(list: readonly Scored[], rules: CapRules): Scored[] {
  const uncapped = (s: Scored): number => s.terms.filter((t) => !rules.caps.has(t.chip)).reduce((sum, t) => sum + t.points, 0)
  const extra = [...list].sort((a, b) => uncapped(b) - uncapped(a)).slice(0, SEARCH_WIDTH)
  return [...new Set([...list.slice(0, CAP_WIDTH), ...extra])]
}

/** The choice under caps, as indices into each cell's full list; the loadout's capped value. */
function solveWithCaps(lists: readonly Scored[][], start: readonly number[], rules: CapRules): { choice: number[]; total: number } {
  const pools = lists.map((list) => capPool(list, rules))
  const cells: CapCell[] = searchOrder().map((cell, i) => ({ list: pools[i], isPrimary: cell === 'PRIMARY', isSecondary: cell === 'SECONDARY' }))
  const choice = start.map((idx, i) => (idx < 0 ? -1 : pools[i].indexOf(lists[i][idx])))
  const total = improveUnderCaps(cells, choice, rules)
  return { choice: choice.map((j, i) => (j < 0 ? -1 : lists[i].indexOf(pools[i][j]))), total }
}

/** How far down a cell's list the runners-up are re-scored against the loadout's haste before the top five are kept. */
const RUNNER_POOL = 40

function readCell(cell: PlanSlotId, list: readonly Scored[], index: number, { otherHaste, opts }: { otherHaste: number; opts: BisOptions }): BisCell {
  const picked = index >= 0 ? list[index] : undefined
  const runnersUp = list
    .filter((s) => s !== picked)
    .slice(0, RUNNER_POOL)
    .map((s) => {
      const c = cellScore(s.row, cell, otherHaste, opts)
      return { row: s.row, score: c.score, hasteCounted: c.hasteCounted, ...(s.prio > 0 ? { damageFirst: s.prio } : {}) }
    })
    .sort((a, b) => (b.damageFirst ?? 0) - (a.damageFirst ?? 0) || b.score - a.score || a.row.name.localeCompare(b.row.name))
    .slice(0, RUNNERS_UP)
  if (picked === undefined) return { cell, runnersUp, otherHaste }
  const c = cellScore(picked.row, cell, otherHaste, opts)
  const reasons = c.terms.filter((t) => t.points > 0).slice(0, REASONS)
  const pick = { row: picked.row, score: c.score, hasteCounted: c.hasteCounted, reasons, ...(picked.prio > 0 ? { damageFirst: picked.prio } : {}) }
  return { cell, pick, runnersUp, otherHaste }
}

/** Per cell, the best positive haste among the picks in every OTHER cell. */
function othersHaste(picks: readonly (Scored | undefined)[]): number[] {
  return picks.map((_, i) => picks.reduce((best, p, j) => (j === i || p === undefined ? best : Math.max(best, p.haste)), 0))
}

/** What one picked item gives, added into the loadout's totals. */
function addTotals(totals: Partial<Record<TierChip, number>>, row: GearRow, opts: BisOptions): void {
  const values = opts.model.valuesOf(row)
  for (const chip of activeChips(opts.setup.split)) {
    const v = values[chip]
    if (v === undefined || isRatioChip(chip)) continue
    totals[chip] = chip === 'HASTE' ? Math.max(totals.HASTE ?? v, v) : (totals[chip] ?? 0) + v
  }
}

/** The cells that come in twos: the same slot, so either holds the other's pick at the same score. */
const PAIRS: readonly (readonly [PlanSlotId, PlanSlotId])[] = [['EAR', 'EAR2'], ['WRIST', 'WRIST2'], ['FINGER', 'FINGER2'], ['ANY1', 'ANY2']]

/**
 * LAY EACH PAIR ON THE SIDE THE PLAYER ALREADY WEARS IT (owner, 2026-11-24: *"i have earring of
 * bashing, just on the other ear....."*, *"if an item is lore i can't equip 2...."*). The search
 * puts a pair's two picks in either order, so an item worn in the second ear could be shown in the
 * first, read as a second copy, with an amber border on both. Swapping the two cells (pick, its
 * other-haste and runners-up together) changes no score and no total: only the side.
 */
export function alignPairsToWorn(sheet: BisSheet, wornKey: (cell: PlanSlotId) => string | undefined): BisSheet {
  const cells = [...sheet.cells]
  const hit = (c: BisCell | undefined, side: PlanSlotId): number => (c?.pick !== undefined && c.pick.row.key === wornKey(side) ? 1 : 0)
  for (const [a, b] of PAIRS) {
    const i = cells.findIndex((c) => c.cell === a)
    const j = cells.findIndex((c) => c.cell === b)
    if (i < 0 || j < 0 || hit(cells[j], a) + hit(cells[i], b) <= hit(cells[i], a) + hit(cells[j], b)) continue
    const first = cells[i]
    cells[i] = { ...cells[j], cell: a }
    cells[j] = { ...first, cell: b }
  }
  return { ...sheet, cells }
}

/**
 * THE SHEET. Scores every admitted row once per cell, keeps the top `SEARCH_WIDTH` per cell for the
 * exact assignment, applies the caps pass when a cap is set, and reads the answer in `PLAN_SLOTS` order.
 */
export function buildBisSheet(opts: BisOptions): BisSheet {
  const rows = admitted(opts)
  const order = searchOrder()
  const lists = order.map((cell) => scoreCell(cell, rows, opts))
  const cells: SearchCell[] = order.map((cell, i) => ({ candidates: lists[i].slice(0, SEARCH_WIDTH), isPrimary: cell === 'PRIMARY', isSecondary: cell === 'SECONDARY' }))
  const rate: HasteRate = { perPercent: hastePerPercent(opts) }
  const exact = searchLoadout(cells, rate)
  const rules = capRules(opts)
  const { choice, total } = rules === undefined ? exact : solveWithCaps(lists, exact.choice, rules)
  const byCell = new Map<PlanSlotId, BisCell>()
  const totals: Partial<Record<TierChip, number>> = {}
  const other = othersHaste(order.map((_, i) => (choice[i] >= 0 ? lists[i][choice[i]] : undefined)))
  order.forEach((cell, i) => {
    const read = readCell(cell, lists[i], choice[i], { otherHaste: other[i], opts })
    if (read.pick !== undefined) addTotals(totals, read.pick.row, opts)
    byCell.set(cell, read)
  })
  const secondary = byCell.get('SECONDARY')
  if (secondary !== undefined && gearHandedness(byCell.get('PRIMARY')?.pick?.row.skill) === '2h') secondary.closedByTwoHander = true
  const cellsOut = PLAN_SLOTS.map((cell) => byCell.get(cell) ?? { cell, runnersUp: [], otherHaste: 0 })
  // The damage-first weight ranks; it is no part of what the loadout is worth.
  const ranked = order.reduce((sum, _, i) => sum + (choice[i] >= 0 ? lists[i][choice[i]].prio : 0), 0)
  return { cells: cellsOut, total: round3(total - ranked * DAMAGE_FIRST), totals, filled: cellsOut.filter((c) => c.pick !== undefined).length }
}
