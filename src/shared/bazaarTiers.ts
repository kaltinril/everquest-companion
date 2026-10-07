// shared/bazaarTiers.ts — "All tiers as one" (owner ask, 2026-10-07): every tier of an item read as
// the price of its +0, so an item listed at +0, +3 and +4 is one row with one estimate.
//
// HOW MUCH A TIER ADDS is measured per item: a weighted line through the log of each tier's
// median price, weighted by how many offers each tier had. Held between 1 (a higher tier is never
// cheaper) and 2 (two of a tier combine into the next, so it is never worth more than two). An
// item seen priced at only one tier gets DEFAULT_TIER_RATE, measured on the owner's archived log
// (2026-08-12 to 2026-10-07): across 41 pairs of neighbouring tiers, the median step was 1.22.
// Not 2: low tiers drop often and sell near +0, and the price jumps at +4 and above.

import type { BazaarRow } from './bazaar'

export const DEFAULT_TIER_RATE = 1.22
const MAX_RATE = 2

function med(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Each tier's prices in one direction, from rows that state them. */
function pricesByTier(rows: readonly BazaarRow[], dir: 'sell' | 'buy'): Map<number, number[]> {
  const by = new Map<number, number[]>()
  for (const r of rows) {
    if (r.dir !== dir) continue
    const ps = r.prices ?? (r.n > 0 ? Array<number>(r.n).fill(r.sum / r.n) : [])
    if (ps.length > 0) by.set(r.tier, [...(by.get(r.tier) ?? []), ...ps])
  }
  return by
}

/** The weighted slope of log price over tier, as a rate per tier; null with fewer than two tiers. */
function fitRate(by: Map<number, number[]>): number | null {
  const pts = [...by].map(([t, ps]) => ({ t, y: Math.log(med(ps)), w: ps.length }))
  if (pts.length < 2) return null
  const W = pts.reduce((s, p) => s + p.w, 0)
  const tBar = pts.reduce((s, p) => s + p.w * p.t, 0) / W
  const yBar = pts.reduce((s, p) => s + p.w * p.y, 0) / W
  const sxx = pts.reduce((s, p) => s + p.w * (p.t - tBar) ** 2, 0)
  const sxy = pts.reduce((s, p) => s + p.w * (p.t - tBar) * (p.y - yBar), 0)
  return sxx > 0 ? Math.exp(sxy / sxx) : null
}

/** How much one tier adds to this item's price: asking prices first, offered when asking has too few tiers. */
export function tierRate(rows: readonly BazaarRow[]): number {
  const rate = fitRate(pricesByTier(rows, 'sell')) ?? fitRate(pricesByTier(rows, 'buy')) ?? DEFAULT_TIER_RATE
  return Math.min(MAX_RATE, Math.max(1, rate))
}

/** A row read as tier +0: every price divided by `rate` once per tier. `fromTier` keeps where it came from. */
export interface BaseTierRow extends BazaarRow {
  fromTier: number
}

export function asBaseTier(rows: readonly BazaarRow[], rate: number): BaseTierRow[] {
  return rows.map((r) => {
    const f = rate ** -r.tier
    const scale = (x: number | null): number | null => (x === null ? null : x * f)
    return {
      ...r,
      tier: 0,
      fromTier: r.tier,
      min: scale(r.min),
      max: scale(r.max),
      sum: r.sum * f,
      prices: r.prices?.map((p) => p * f)
    }
  })
}
