// planner/bisCaps.ts — CAPS ON THE BEST IN SLOT SHEET (plans/2026-11-24-bis-sheet.md, "Crossing a stat
// off"): above a cap, more of a stat is worth nothing (owner, 2026-11-24: *"Perhaps i'm max STR so i
// want it not to matter as much anymore, or perhaps i'm max haste"*).
//
// WHY A SECOND PASS AND NOT THE EXACT SEARCH: a cap makes a stat's worth depend on the WHOLE loadout
// (the tenth DEX item is worth nothing once nine reach the cap), so the cells no longer add up
// independently and the assignment in `bisSearch.ts` cannot price it. The sheet therefore solves
// exactly without caps, then this file improves that answer one cell at a time under the capped value
// until no single change helps (coordinate ascent). It is exact when no cap binds and a local optimum
// when one does; the tests pin that a capped stat stops counting and that the pass never makes the
// loadout worse. Each cell's pool is the best rows by full score PLUS the best by the uncapped stats
// alone, so the item the cap makes attractive is in reach.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { TierChip } from './tierChips'
import type { TierTerm } from './tierWeights'

/** One candidate as the pass sees it. */
export interface CapCandidate {
  key: string
  copies: number
  twoHand: boolean
  /** the item's terms in this cell, haste left out */
  terms: readonly TierTerm[]
  /** stated haste percent, 0 when none */
  haste: number
  /** a bow: in RANGE it keeps AMMO on its arrow */
  bow?: boolean
}

export interface CapCell {
  list: readonly CapCandidate[]
  isPrimary: boolean
  isSecondary: boolean
  isRange?: boolean
  /** AMMO: the arrow it must hold while RANGE holds a bow (bisSearch.ts rule 4) */
  arrowKey?: string
}

export interface CapRules {
  /** chip -> cap on the loadout's total value */
  caps: ReadonlyMap<TierChip, number>
  /** points one value unit of a capped chip is worth (lane weight / unit) */
  perValue: ReadonlyMap<TierChip, number>
  /** points one haste percent is worth; 0 when HASTE is Off */
  hastePerPercent: number
  /** the cap on haste, if any */
  hasteCap?: number
}

/** The loadout's points: uncapped terms added, capped chips summed then capped, haste once. */
export function cappedValue(cells: readonly CapCell[], choice: readonly number[], rules: CapRules): number {
  let points = 0
  let bestHaste = 0
  let penalty = 0
  const totals = new Map<TierChip, number>()
  cells.forEach((cell, i) => {
    const c = choice[i] >= 0 ? cell.list[choice[i]] : undefined
    if (c === undefined) return
    if (c.haste > 0) bestHaste = Math.max(bestHaste, c.haste)
    else penalty += c.haste
    for (const t of c.terms) {
      if (rules.caps.has(t.chip)) totals.set(t.chip, (totals.get(t.chip) ?? 0) + t.value)
      else points += t.points
    }
  })
  for (const [chip, total] of totals) points += Math.min(total, rules.caps.get(chip) ?? total) * (rules.perValue.get(chip) ?? 0)
  const haste = Math.min(bestHaste, rules.hasteCap ?? bestHaste) + penalty
  return points + haste * rules.hastePerPercent
}

function used(cells: readonly CapCell[], choice: readonly number[], skip: number): Map<string, number> {
  const out = new Map<string, number>()
  cells.forEach((cell, i) => {
    if (i === skip || choice[i] < 0) return
    const key = cell.list[choice[i]].key
    out.set(key, (out.get(key) ?? 0) + 1)
  })
  return out
}

/** A bow in RANGE keeps AMMO on its arrow: would `cand` in cell `i` keep that true? */
function bowRuleHolds(cells: readonly CapCell[], choice: readonly number[], i: number, cand: CapCandidate): boolean {
  const ammo = cells.findIndex((c) => c.arrowKey !== undefined)
  const range = cells.findIndex((c) => c.isRange === true)
  if (ammo < 0 || range < 0) return true
  const arrowKey = cells[ammo].arrowKey
  if (i === range) return cand.bow !== true || choice[ammo] < 0 || cells[ammo].list[choice[ammo]].key === arrowKey
  if (i === ammo) return choice[range] < 0 || cells[range].list[choice[range]].bow !== true || cand.key === arrowKey
  return true
}

/** Would putting candidate `j` (or nothing, -1) in cell `i` keep the loadout legal? */
function legal(cells: readonly CapCell[], choice: readonly number[], i: number, j: number): boolean {
  if (j < 0) return true
  const cand = cells[i].list[j]
  if ((used(cells, choice, i).get(cand.key) ?? 0) + 1 > cand.copies || !bowRuleHolds(cells, choice, i, cand)) return false
  const primary = cells.findIndex((c) => c.isPrimary)
  const secondary = cells.findIndex((c) => c.isSecondary)
  if (cells[i].isPrimary && cand.twoHand) return secondary < 0 || choice[secondary] < 0
  if (cells[i].isSecondary && primary >= 0 && choice[primary] >= 0) return !cells[primary].list[choice[primary]].twoHand
  return true
}

const MAX_SWEEPS = 8

/** Try every legal option in cell `i`, keeping the best that beats `value`; its value, or undefined. */
function bestInCell(state: { cells: readonly CapCell[]; choice: number[]; rules: CapRules }, i: number, value: number): number | undefined {
  const { cells, choice, rules } = state
  let best = value
  for (let j = -1; j < cells[i].list.length; j++) {
    if (j === choice[i] || !legal(cells, choice, i, j)) continue
    const before = choice[i]
    choice[i] = j
    const v = cappedValue(cells, choice, rules)
    if (v > best + 1e-9) best = v
    else choice[i] = before
  }
  return best > value ? best : undefined
}

/** Improve `choice` (indices into each cell's list) in place under the capped value. Returns the value. */
export function improveUnderCaps(cells: readonly CapCell[], choice: number[], rules: CapRules): number {
  let value = cappedValue(cells, choice, rules)
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let improved = false
    for (let i = 0; i < cells.length; i++) {
      const next = bestInCell({ cells, choice, rules }, i, value)
      if (next === undefined) continue
      value = next
      improved = true
    }
    if (!improved) break
  }
  return value
}
