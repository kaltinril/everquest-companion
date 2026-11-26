// aaCost.ts — what an AA costs in all, not only a rank at a time (owner, 2026-11-25: "Innate regen shows
// 7 tickets 7/7, but each one is not 1 point ... show somewhere the total cost for all so someone can
// say i'm gonna save up 25 points"). Pure.
//
// Prices are the corrected table's (shared/aaOfficial.ts `AA_ROWS`) through `aaRankCosts`, which reads
// "2/4/6", "3" and "1 for all ranks". A free rank costs 0. A rank whose price the table does not state
// ("3/6/?", or a rank past the wiki's count that the log shows) makes the total a floor: "18+ pts".

import { aaRankCosts } from './aaRanks'
import type { AaRow } from './aaOfficial'

export interface AaRowCost {
  /** Points the held ranks cost. */
  spent: number
  /** Points every rank up to the top costs. */
  total: number
  /** A rank's price is not stated, so the sums are floors. */
  unknown: boolean
  /** The next rank's price; null at the top or when it is not stated. */
  next: number | null
}

/** What a row's ranks cost; null for a Special row (not bought with points) or a removed one. */
export function aaRowCost(row: AaRow, rank: number, max: number): AaRowCost | null {
  if (row.section === 'special' || row.removed !== undefined) return null
  const priced = aaRankCosts(row)
  const costs = Array.from({ length: max }, (_, i) => priced[i] ?? null)
  const sum = (list: readonly (number | null)[]): number => list.reduce<number>((s, c) => s + (c ?? 0), 0)
  return {
    spent: sum(costs.slice(0, rank)),
    total: sum(costs),
    unknown: costs.some((c) => c === null),
    next: rank < max ? (costs[rank] ?? null) : null
  }
}

const pts = (n: number, unknown: boolean): string => `${String(n)}${unknown ? '+' : ''} pts`

/** The row's points column: "18 pts" once maxed, else "6 of 18 pts"; "+" where a price is unknown. */
export function aaCostText(cost: AaRowCost, rank: number, max: number): string {
  if (rank >= max) return pts(cost.total, cost.unknown)
  return `${String(cost.spent)} of ${pts(cost.total, cost.unknown)}`
}

export interface AaCostSum {
  spent: number
  total: number
  unknown: boolean
}

/** The sum of several rows' costs, for a tab's line ("373 of 393 pts"). */
export function aaCostSum(costs: readonly (AaRowCost | null)[]): AaCostSum {
  const out: AaCostSum = { spent: 0, total: 0, unknown: false }
  for (const c of costs) {
    if (c === null) continue
    out.spent += c.spent
    out.total += c.total
    out.unknown ||= c.unknown
  }
  return out
}

/** "373 of 393 pts", or "393 pts" when all is spent. */
export function aaCostSumText(sum: AaCostSum): string {
  return sum.spent >= sum.total ? pts(sum.total, sum.unknown) : `${String(sum.spent)} of ${pts(sum.total, sum.unknown)}`
}
