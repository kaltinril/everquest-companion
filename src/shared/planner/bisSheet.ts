// planner/bisSheet.ts — THE BEST IN SLOT SHEET: one item per cell of the character sheet, chosen by the
// player's own tier board (plans/2026-11-24-bis-sheet.md "The sheet"; requirements/bis-sheet.md).
//
// The asks it answers (Malkil, 2026-11-24): *"select classes, which limits what gear can be
// recommended to only items that are usable"*; *"The BiS recommendations should be based upon the
// weights given to these stats"*; *"respect Lore Equipped when determining if multiple of a single
// item can be equipped"*; *"weapon ratios should never be considered for either of the two ANY
// slots"*. The scoring is `tierWeights.ts`; the choosing is `bisSearch.ts`; this file builds the
// candidates per cell and reads the answer back as rows, reasons, runners-up and totals.
//
// THE CELLS ARE THE BOARD'S 23 (`PLAN_SLOTS`): the paired slots twice, AMMO, and the two ANY cells,
// which host an item of any slot and read it as a stat stick (no ratio). A two-hander may sit only
// in PRIMARY (or an ANY cell, as a stat stick); three corpus rows also list SECONDARY and are kept
// out of it (roleWeights.ts's census calls that corpus dirt).
//
// LORE: any flag that starts with "Lore" limits an item to one cell. Measured 2026-11-24 over the
// 6,975 gear rows: "Lore Item" 2,628, "Lore Equipped" 520, "Lore" 4, "LORE EQUPPED" 1 (the wiki's
// spelling), "Lore Group: ..." 2. A Lore Group's members exclude EACH OTHER in the game; that is not
// modelled (two pages), each is only limited to itself.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import type { GearRow } from './gear'
import { gearHandedness } from './roleWeights'
import { searchLoadout, type HasteRate, type SearchCandidate, type SearchCell } from './bisSearch'
import { CHIP_KEYS, TIER_WEIGHT, isRatioChip, type TierBoard, type TierChip } from './tierChips'
import { chipValue, round3, tierTerms, type TierScale, type TierTerm } from './tierWeights'
import { PLAN_SLOTS, equipSlotOf, isAnyCell, type PlanSlotId } from './types'

export interface BisOptions {
  rows: readonly GearRow[]
  board: TierBoard
  scale: TierScale
  /** the picked classes; empty = not stated, which admits every row (law 1) */
  classes: readonly ClassAbbr[]
  /** the caller's other gates (Current era, a level cap): absent admits every row */
  admit?: (row: GearRow) => boolean
  /** owned-only mode: item key -> copies owned (bags, bank, worn). Absent = best overall */
  owned?: ReadonlyMap<string, number>
}

export interface BisPick {
  row: GearRow
  /** the item's points in this cell, its own haste counted as if it were the only haste worn */
  score: number
}

export interface BisCell {
  cell: PlanSlotId
  pick?: BisPick & { reasons: TierTerm[] }
  /** the next best in this cell, picked or not elsewhere */
  runnersUp: BisPick[]
  /** SECONDARY left empty because a two-hander sits in PRIMARY */
  closedByTwoHander?: true
}

export interface BisSheet {
  cells: BisCell[]
  /** the loadout's points, haste counted once */
  total: number
  /** stated totals per chip over the picks (ratios left out; HASTE is the best single haste) */
  totals: Partial<Record<TierChip, number>>
  /** picked or runner-up rows whose page states no classes: shown, and flagged */
  unknownClasses: ReadonlySet<string>
}

/** How many candidates per cell the search tries (plan: 12). Runners-up read the full list. */
export const SEARCH_WIDTH = 12
const RUNNERS_UP = 5
const REASONS = 3

/** Every flag spelling that starts with "Lore" (the census above). */
export function isLoreRow(row: Pick<GearRow, 'flags'>): boolean {
  return row.flags.some((f) => /^\s*lore\b/i.test(f))
}

function usableBy(row: GearRow, classes: readonly ClassAbbr[]): boolean {
  return classes.length === 0 || row.classes.length === 0 || row.classes.some((c) => classes.includes(c))
}

/** Does this row go in this cell at all? */
function fitsCell(row: GearRow, cell: PlanSlotId): boolean {
  if (isAnyCell(cell)) return true
  const slot = equipSlotOf(cell)
  if (slot === null || !row.slots.includes(slot)) return false
  return !(slot === 'SECONDARY' && gearHandedness(row.skill) === '2h')
}

/** One scored candidate, with what the readout needs beside the search's numbers. */
interface Scored extends SearchCandidate {
  row: GearRow
  /** base + the item's own positive haste, as if alone: the order the cell lists it in */
  display: number
}

function copiesOf(row: GearRow, owned: ReadonlyMap<string, number> | undefined): number {
  const cap = isLoreRow(row) ? 1 : Number.POSITIVE_INFINITY
  return owned === undefined ? cap : Math.min(cap, owned.get(row.key) ?? 0)
}

function hasteRate(opts: BisOptions): HasteRate {
  return { perPercent: TIER_WEIGHT[opts.board.HASTE] / opts.scale.units.HASTE }
}

/** Every admitted row in one cell, scored and sorted best-first. */
function scoreCell(cell: PlanSlotId, rows: readonly GearRow[], opts: BisOptions): Scored[] {
  const rate = hasteRate(opts).perPercent
  const ctx = { scale: opts.scale, slot: cell, classes: opts.classes, skipHaste: true }
  const out: Scored[] = []
  for (const row of rows) {
    if (!fitsCell(row, cell)) continue
    const base = round3(tierTerms(row, opts.board, ctx).reduce((sum, t) => sum + t.points, 0))
    const haste = row.stats.HASTE ?? 0
    out.push({
      key: row.key,
      row,
      base,
      haste,
      copies: copiesOf(row, opts.owned),
      twoHand: gearHandedness(row.skill) === '2h',
      display: round3(base + haste * rate)
    })
  }
  return out.sort((a, b) => b.display - a.display || a.row.name.localeCompare(b.row.name))
}

/** The rows the sheet may use at all: the class picks, the caller's gates, owned-only. */
function admitted(opts: BisOptions): GearRow[] {
  return opts.rows.filter(
    (row) =>
      usableBy(row, opts.classes) &&
      (opts.admit === undefined || opts.admit(row)) &&
      (opts.owned === undefined || (opts.owned.get(row.key) ?? 0) > 0)
  )
}

/** PRIMARY before SECONDARY, so the two-hander rule sees the hand first; ANY cells last. */
function searchOrder(): PlanSlotId[] {
  const hands: PlanSlotId[] = ['PRIMARY', 'SECONDARY']
  const any = PLAN_SLOTS.filter(isAnyCell)
  return [...hands, ...PLAN_SLOTS.filter((c) => !hands.includes(c) && !isAnyCell(c)), ...any]
}

/** What one picked item states, added into the loadout's totals. */
function addTotals(totals: Partial<Record<TierChip, number>>, row: GearRow): void {
  for (const chip of CHIP_KEYS) {
    if (isRatioChip(chip)) continue
    const v = chipValue(chip, row)
    if (v === undefined) continue
    totals[chip] = chip === 'HASTE' ? Math.max(totals.HASTE ?? v, v) : (totals[chip] ?? 0) + v
  }
}

function readCell(cell: PlanSlotId, list: readonly Scored[], index: number, opts: BisOptions): BisCell {
  const picked = index >= 0 ? list[index] : undefined
  const runnersUp = list
    .filter((s) => s !== picked)
    .slice(0, RUNNERS_UP)
    .map((s) => ({ row: s.row, score: s.display }))
  if (picked === undefined) return { cell, runnersUp }
  const reasons = tierTerms(picked.row, opts.board, { scale: opts.scale, slot: cell, classes: opts.classes })
    .filter((t) => t.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, REASONS)
  return { cell, pick: { row: picked.row, score: picked.display, reasons }, runnersUp }
}

/**
 * THE SHEET. Scores every admitted row once per cell (~7k rows, a few milliseconds), keeps the top
 * `SEARCH_WIDTH` per cell for the exact assignment, and reads the answer back in `PLAN_SLOTS` order.
 */
export function buildBisSheet(opts: BisOptions): BisSheet {
  const rows = admitted(opts)
  const order = searchOrder()
  const lists = order.map((cell) => scoreCell(cell, rows, opts))
  const cells: SearchCell[] = order.map((cell, i) => ({
    candidates: lists[i].slice(0, SEARCH_WIDTH),
    isPrimary: cell === 'PRIMARY',
    isSecondary: cell === 'SECONDARY'
  }))
  const result = searchLoadout(cells, hasteRate(opts))
  const byCell = new Map<PlanSlotId, BisCell>()
  const totals: Partial<Record<TierChip, number>> = {}
  const unknownClasses = new Set<string>()
  order.forEach((cell, i) => {
    const read = readCell(cell, lists[i], result.choice[i], opts)
    if (read.pick !== undefined) addTotals(totals, read.pick.row)
    for (const r of [read.pick?.row, ...read.runnersUp.map((p) => p.row)]) {
      if (r?.classes.length === 0) unknownClasses.add(r.key)
    }
    byCell.set(cell, read)
  })
  const secondary = byCell.get('SECONDARY')
  if (secondary !== undefined && gearHandedness(byCell.get('PRIMARY')?.pick?.row.skill) === '2h') {
    secondary.closedByTwoHander = true
  }
  return {
    cells: PLAN_SLOTS.map((cell) => byCell.get(cell) ?? { cell, runnersUp: [] }),
    total: round3(result.total),
    totals,
    unknownClasses
  }
}
