// shared/bazaar.ts — the Bazaar tab's data: what trade chat asked and offered, per item.
//
// The engine's `bazaar` module (engine/crates/fold/src/modules/bazaar.rs) keeps one row per day,
// item, upgrade tier and direction, with every priced offer's platinum per unit. This turns those
// rows into the tab: one entry per item and tier, its asking (WTS) and offered (WTB) prices side by
// side, day by day. Here rather than in the renderer because the renderer never filters or sorts
// served rows (owner ruling 4).
//
// MEDIANS, AND OUTLIERS LEFT OUT. Trade chat is noisy: a typo, a price for a stack read as a price
// for one, a joke. So every number here is a median, and a price more than OUTLIER times away from
// the median of all that item's prices in that direction is left out (counted in `outliers`), once
// there are at least three to judge by.

export const BAZAAR_MODULE_ID = 'bazaar'

export type BazaarDir = 'sell' | 'buy' | 'trade'

/** One day's offers for one item, tier and direction, as the engine serves it. Prices in platinum. */
export interface BazaarRow {
  /** `YYYY-MM-DD`, the log's own date. */
  day: string
  dir: BazaarDir
  item: string
  tier: number
  /** Offers that stated a price; a seller repeating one offer in a day counts once. */
  n: number
  /** Offers that stated none. */
  unpriced: number
  min: number | null
  max: number | null
  sum: number
  /** Every priced offer, platinum per unit. Absent in rows from before 2026-10-06. */
  prices?: number[]
}

export interface BazaarSnap {
  rows: BazaarRow[]
}

/** One direction on one day, outliers left out. */
export interface BazaarSide {
  median: number | null
  low: number | null
  high: number | null
  /** Priced offers counted. */
  n: number
  unpriced: number
}

export interface BazaarPoint {
  day: string
  sell: BazaarSide
  buy: BazaarSide
  trades: number
}

export interface BazaarItem {
  key: string
  item: string
  tier: number
  lastDay: string
  /** Median of the newest RECENT priced days. */
  asking: number | null
  offered: number | null
  /** Asking now against the RECENT priced days before them, as a fraction (0.1 = up 10%). */
  askingMove: number | null
  sellOffers: number
  buyOffers: number
  trades: number
  outliers: number
  /** Every day with any offer, oldest first. */
  points: BazaarPoint[]
}

export type BazaarSort = 'recent' | 'offers' | 'price' | 'move'

export interface BazaarQuery {
  /** Part of an item name, any case. */
  text: string
  /** Keep items with offers in this direction. */
  dir: BazaarDir | 'all'
  sort: BazaarSort
}

export interface BazaarSummary {
  items: BazaarItem[]
  /** Across the whole log, before the query. */
  days: number
  offers: number
  /** The newest day any offer was seen, where the sparklines end. */
  lastDay: string | null
}

const OUTLIER = 4
const RECENT = 3

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** A row's prices; an older row without the list stands for its average, `n` times. */
function pricesOf(r: BazaarRow): number[] {
  if (r.prices !== undefined) return r.prices
  return r.n > 0 ? Array<number>(r.n).fill(r.sum / r.n) : []
}

const EMPTY: BazaarSide = { median: null, low: null, high: null, n: 0, unpriced: 0 }

function sideOf(rows: readonly BazaarRow[], keep: (p: number) => boolean): BazaarSide {
  const ps = rows.flatMap(pricesOf).filter(keep)
  return {
    median: median(ps),
    low: ps.length > 0 ? Math.min(...ps) : null,
    high: ps.length > 0 ? Math.max(...ps) : null,
    n: ps.length,
    unpriced: rows.reduce((s, r) => s + r.unpriced, 0)
  }
}

/** Keeps a price within OUTLIER times of the median of `all`, once there are three to judge by. */
function keeper(all: readonly number[]): (p: number) => boolean {
  const m = median(all)
  if (m === null || all.length < 3) return () => true
  return (p) => p >= m / OUTLIER && p <= m * OUTLIER
}

/** Median of the newest RECENT priced days, and of the RECENT before them. */
function recentAndBefore(points: readonly BazaarPoint[], dir: 'sell' | 'buy'): [number | null, number | null] {
  const priced = points.map((p) => p[dir].median).filter((m): m is number => m !== null)
  const now = priced.slice(-RECENT)
  const before = priced.slice(-2 * RECENT, -RECENT)
  return [median(now), median(before)]
}

function pointOf(day: string, rows: readonly BazaarRow[], keep: Record<'sell' | 'buy', (p: number) => boolean>): BazaarPoint {
  const on = rows.filter((r) => r.day === day)
  const d = (dir: BazaarDir): BazaarRow[] => on.filter((r) => r.dir === dir)
  return {
    day,
    sell: d('sell').length > 0 ? sideOf(d('sell'), keep.sell) : EMPTY,
    buy: d('buy').length > 0 ? sideOf(d('buy'), keep.buy) : EMPTY,
    trades: d('trade').reduce((s, r) => s + r.unpriced + r.n, 0)
  }
}

function itemOf(key: string, rows: readonly BazaarRow[]): BazaarItem {
  const pricesIn = (d: BazaarDir): number[] => rows.filter((r) => r.dir === d).flatMap(pricesOf)
  const keep = { sell: keeper(pricesIn('sell')), buy: keeper(pricesIn('buy')) }
  const days = [...new Set(rows.map((r) => r.day))].sort()
  const points = days.map((day) => pointOf(day, rows, keep))
  const [asking, askedBefore] = recentAndBefore(points, 'sell')
  const [offered] = recentAndBefore(points, 'buy')
  const counted = (dir: 'sell' | 'buy'): number => points.reduce((s, p) => s + p[dir].n + p[dir].unpriced, 0)
  const kept = points.reduce((s, p) => s + p.sell.n + p.buy.n, 0)
  return {
    key,
    item: rows[0].item,
    tier: rows[0].tier,
    lastDay: days[days.length - 1],
    asking,
    offered,
    askingMove: asking !== null && askedBefore !== null && askedBefore > 0 ? asking / askedBefore - 1 : null,
    sellOffers: counted('sell'),
    buyOffers: counted('buy'),
    trades: points.reduce((s, p) => s + p.trades, 0),
    outliers: pricesIn('sell').length + pricesIn('buy').length - kept,
    points
  }
}

function compare(sort: BazaarSort): (a: BazaarItem, b: BazaarItem) => number {
  const offers = (x: BazaarItem): number => x.sellOffers + x.buyOffers + x.trades
  const price = (x: BazaarItem): number => x.asking ?? x.offered ?? -1
  const move = (x: BazaarItem): number => Math.abs(x.askingMove ?? -1)
  const primary: Record<BazaarSort, (a: BazaarItem, b: BazaarItem) => number> = {
    recent: (a, b) => b.lastDay.localeCompare(a.lastDay) || offers(b) - offers(a),
    offers: (a, b) => offers(b) - offers(a),
    price: (a, b) => price(b) - price(a),
    move: (a, b) => move(b) - move(a)
  }
  return (a, b) => primary[sort](a, b) || a.item.localeCompare(b.item) || a.tier - b.tier
}

function matches(rows: readonly BazaarRow[], q: BazaarQuery, text: string): boolean {
  if (text !== '' && !rows[0].item.toLowerCase().includes(text)) return false
  return q.dir === 'all' || rows.some((r) => r.dir === q.dir)
}

/** The tab: one entry per item and tier that matches, in the asked order, with the log's totals. */
export function summarizeBazaar(snap: BazaarSnap | null, q: BazaarQuery): BazaarSummary {
  const rows = snap?.rows ?? []
  const groups = new Map<string, BazaarRow[]>()
  for (const r of rows) {
    const key = `${r.item}|${r.tier}`
    const g = groups.get(key)
    if (g === undefined) groups.set(key, [r])
    else g.push(r)
  }
  const text = q.text.trim().toLowerCase()
  const items = [...groups]
    .filter(([, g]) => matches(g, q, text))
    .map(([key, g]) => itemOf(key, g))
    .sort(compare(q.sort))
  const days = [...new Set(rows.map((r) => r.day))].sort()
  return {
    items,
    days: days.length,
    offers: rows.reduce((s, r) => s + r.n + r.unpriced, 0),
    lastDay: days.length > 0 ? days[days.length - 1] : null
  }
}

export interface Spark {
  sell: (number | null)[]
  buy: (number | null)[]
}

/** The `n` calendar days ending `endDay`, one median per day per direction (null where none). */
export function sparkline(points: readonly BazaarPoint[], endDay: string, n: number): Spark {
  const end = Date.parse(`${endDay}T00:00:00Z`)
  const at = new Map(points.map((p) => [p.day, p]))
  const out: Spark = { sell: [], buy: [] }
  for (let i = n - 1; i >= 0; i--) {
    const p = at.get(new Date(end - i * 86_400_000).toISOString().slice(0, 10))
    out.sell.push(p?.sell.median ?? null)
    out.buy.push(p?.buy.median ?? null)
  }
  return out
}

/** `20000` → `20k`, `2500` → `2.5k`, `75` → `75pp`, `0.5` → `5g`. */
export function formatPlat(pp: number | null): string {
  if (pp === null) return '-'
  if (pp >= 1000) return `${Number((pp / 1000).toFixed(pp >= 10000 ? 0 : 1))}k`
  if (pp >= 1) return `${Math.round(pp)}pp`
  return `${Number((pp * 10).toFixed(1))}g`
}

/** `0.12` → `+12%`, `-0.05` → `-5%`. */
export function formatMove(f: number | null): string {
  if (f === null) return ''
  const pct = Math.round(f * 100)
  return pct === 0 ? '0%' : `${pct > 0 ? '+' : ''}${pct}%`
}
