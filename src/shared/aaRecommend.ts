// aaRecommend.ts — what to spend AA points on next, for the Alt. Advancement tab's Recommendations and
// its "Spend your points" card (owner, 2026-11-25: "The recommendations"). Pure.
//
// Only rows the combo can use and buy with points (shared/aaBoard.ts `buyable`). The PLAN buys the
// cheapest next rank first, a rank at a time, until the points run out; each item then says how far
// the plan reaches it ("fits your 20 points", "fits to rank 2"). A rank whose price is not stated is
// listed but never planned. Points never buy Banestrike (Slayer achievements) or the reincarnation lines.

import { AA_POINT_CAP } from './aaPointsWarn'
import type { AaBoardRow } from './aaBoard'
import { aaEffectValue } from './aaEffects'
import { aaRankCosts } from './aaRanks'

/** The game stops experience at this many unspent points (the mockup's "points bank up to 50"). */
export const AA_BANK_CAP = AA_POINT_CAP

export interface AaRecItem {
  b: AaBoardRow
  /** The next rank's price; null when the table does not state it. */
  next: number | null
  /** Points from the held rank to the top. */
  toMax: number
  /** What the next rank gives; null when it has no number. */
  gives: string | null
  /** The rank the plan reaches with the points given. */
  reach: number
}

export interface AaRecs {
  /** Cheapest next rank first, then the least to max, then by name. */
  items: AaRecItem[]
  /** Points the plan spends. */
  used: number
  /** Points to max every item. */
  total: number
}

/** One rank's price from the corrected cost cell; null when unstated. */
const priceAt = (b: AaBoardRow, rank: number): number | null => aaRankCosts(b.r.row)[rank - 1] ?? null

const orderOf = (n: number | null): number => n ?? Number.POSITIVE_INFINITY

/** The cheapest next rank among the rows at their planned ranks; null when none has a stated price. */
function cheapestStep(rows: readonly AaBoardRow[], reach: ReadonlyMap<AaBoardRow, number>): { b: AaBoardRow; c: number } | null {
  let best: { b: AaBoardRow; c: number } | null = null
  for (const b of rows) {
    const k = reach.get(b) ?? 0
    const c = k < b.max ? priceAt(b, k + 1) : null
    if (c === null) continue
    if (best === null || c < best.c || (c === best.c && b.r.key < best.b.r.key)) best = { b, c }
  }
  return best
}

/** The next ranks to buy and how far `budget` points go, cheapest first. */
export function aaRecommend(board: readonly AaBoardRow[], budget: number): AaRecs {
  const rows = board.filter((b) => b.buyable)
  const reach = new Map(rows.map((b) => [b, b.r.rank]))
  let left = Math.max(0, budget)
  for (let step = cheapestStep(rows, reach); step !== null && step.c <= left; step = cheapestStep(rows, reach)) {
    reach.set(step.b, (reach.get(step.b) ?? 0) + 1)
    left -= step.c
  }
  const items = rows.map((b) => ({
    b,
    next: b.cost?.next ?? null,
    toMax: b.cost === null ? 0 : b.cost.total - b.cost.spent,
    gives: aaEffectValue(b.effect, b.r.rank + 1),
    reach: reach.get(b) ?? b.r.rank
  }))
  items.sort((x, y) => orderOf(x.next) - orderOf(y.next) || x.toMax - y.toMax || x.b.r.key.localeCompare(y.b.r.key))
  return { items, used: Math.max(0, budget) - left, total: items.reduce((s, i) => s + i.toMax, 0) }
}

/** "fits your 20 points" / "fits to rank 2" / null, for one item of the plan. */
export function aaRecFit(item: AaRecItem, budget: number): string | null {
  if (item.reach >= item.b.max) return `fits your ${String(budget)} points`
  if (item.reach > item.b.r.rank) return `fits to rank ${String(item.reach)}`
  return null
}

export interface AaNotForPoints {
  /** Banestrike's rank and top; null when the table lacks it. */
  banestrike: { rank: number; max: number } | null
}

/** What points cannot buy: Banestrike (Slayer achievements) and the reincarnation lines. */
export function aaNotForPoints(board: readonly AaBoardRow[]): AaNotForPoints {
  const bane = board.find((b) => b.r.row.name === 'Banestrike')
  return { banestrike: bane === undefined ? null : { rank: bane.r.rank, max: bane.max } }
}
