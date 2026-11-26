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

import { countedAmount, type Attribute, type StatCap } from './statCaps'
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
  /** the item's stated attributes, for the caps on STA, INT and WIS (which count inside HP and mana) */
  attrs?: Readonly<Partial<Record<Attribute, number>>>
  /** a ranking weight outside the terms (damage first), counted `prioWeight` a point */
  prio?: number
}

export interface CapCell {
  list: readonly CapCandidate[]
  isPrimary: boolean
  isSecondary: boolean
  isRange?: boolean
  /** AMMO: the arrow it must hold while RANGE holds a bow (bisSearch.ts rule 4) */
  arrowKey?: string
}

/** An attribute that counts inside a chip (STA in HP, INT and WIS in mana) and its cap. */
export interface FoldedCap {
  attr: Attribute
  chip: TierChip
  cap: StatCap
  /** the chip's value per attribute point */
  perPoint: number
}

export interface CapRules {
  /** chip -> cap on the loadout's total value */
  caps: ReadonlyMap<TierChip, StatCap>
  /** attribute caps inside HP and mana; their chips are in `perValue` */
  folded?: readonly FoldedCap[]
  /** points a candidate's `prio` is worth (the damage-first weight), so the pass keeps damage first */
  prioWeight?: number
  /** points one value unit of a capped chip is worth (lane weight / unit) */
  perValue: ReadonlyMap<TierChip, number>
  /** points one haste percent is worth; 0 when HASTE is Off */
  hastePerPercent: number
  /** the cap on haste, if any */
  hasteCap?: number
}

/** A loadout added up: uncapped points, capped chips' and folded attributes' totals, the best haste and the penalties. */
interface Sums {
  points: number
  totals: Map<string, number>
  attrs: Map<string, number>
  bestHaste: number
  penalty: number
}

function addTo(map: Map<string, number>, key: string, v: number): void {
  map.set(key, (map.get(key) ?? 0) + v)
}

function sumLoadout(cells: readonly CapCell[], choice: readonly number[], rules: CapRules): Sums {
  const sums: Sums = { points: 0, totals: new Map(), attrs: new Map(), bestHaste: 0, penalty: 0 }
  cells.forEach((cell, i) => {
    const c = choice[i] >= 0 ? cell.list[choice[i]] : undefined
    if (c === undefined) return
    if (c.haste > 0) sums.bestHaste = Math.max(sums.bestHaste, c.haste)
    else sums.penalty += c.haste
    sums.points += (c.prio ?? 0) * (rules.prioWeight ?? 0)
    for (const t of c.terms) {
      if (rules.caps.has(t.chip)) addTo(sums.totals, t.chip, t.value)
      else sums.points += t.points
    }
    for (const f of rules.folded ?? []) addTo(sums.attrs, f.attr, c.attrs?.[f.attr] ?? 0)
  })
  return sums
}

/** The chip value each folded attribute's points above its cap no longer give (STA's HP, INT's and WIS's mana). */
function foldedLoss(sums: Sums, rules: CapRules): Map<string, number> {
  const lost = new Map<string, number>()
  for (const f of rules.folded ?? []) {
    const total = sums.attrs.get(f.attr) ?? 0
    addTo(lost, f.chip, (total - countedAmount(total, f.cap)) * f.perPoint)
  }
  return lost
}

/** The loadout's points: uncapped terms added, capped chips summed then capped, folded attributes' excess taken out, haste once. */
export function cappedValue(cells: readonly CapCell[], choice: readonly number[], rules: CapRules): number {
  const sums = sumLoadout(cells, choice, rules)
  const lost = foldedLoss(sums, rules)
  const rate = (chip: string): number => rules.perValue.get(chip as TierChip) ?? 0
  let points = sums.points
  for (const [chip, v] of lost) if (!rules.caps.has(chip as TierChip)) points -= v * rate(chip)
  for (const [chip, total] of sums.totals) points += countedAmount(total - (lost.get(chip) ?? 0), rules.caps.get(chip as TierChip)) * rate(chip)
  const haste = Math.min(sums.bestHaste, rules.hasteCap ?? sums.bestHaste) + sums.penalty
  return points + haste * rules.hastePerPercent
}

/**
 * Does any cap bind on this loadout? When none does, the exact answer is already the best: a capped
 * value is never above the uncapped one, and here they are equal.
 */
export function capsBind(cells: readonly CapCell[], choice: readonly number[], rules: CapRules): boolean {
  const sums = sumLoadout(cells, choice, rules)
  for (const [chip, total] of sums.totals) if (total > (rules.caps.get(chip as TierChip)?.value ?? Number.POSITIVE_INFINITY)) return true
  if ((rules.folded ?? []).some((f) => (sums.attrs.get(f.attr) ?? 0) > f.cap.value)) return true
  return rules.hasteCap !== undefined && sums.bestHaste > rules.hasteCap
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
  if (!capsBind(cells, choice, rules)) return value
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
