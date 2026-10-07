// shared/bazaar.ts — the Bazaar tab's data: what trade chat asked and offered, per item.
//
// The engine's `bazaar` module (engine/crates/fold/src/modules/bazaar.rs) keeps one row per day,
// item, upgrade tier and direction; this turns those rows into the tab's list, one entry per item,
// tier and direction, newest first, with its days beneath it. Here rather than in the renderer
// because the renderer never filters or sorts served rows (owner ruling 4).

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
}

export interface BazaarSnap {
  rows: BazaarRow[]
}

export interface BazaarDay {
  day: string
  n: number
  unpriced: number
  low: number | null
  avg: number | null
  high: number | null
}

export interface BazaarEntry {
  key: string
  item: string
  tier: number
  dir: BazaarDir
  lastDay: string
  /** The average on the newest day that stated a price. */
  lastAvg: number | null
  low: number | null
  avg: number | null
  high: number | null
  offers: number
  unpriced: number
  /** Newest first. */
  days: BazaarDay[]
}

const DIR_ORDER: Record<BazaarDir, number> = { sell: 0, buy: 1, trade: 2 }

export interface BazaarQuery {
  /** Part of an item name, any case. */
  text: string
  dir: BazaarDir | 'all'
}

function dayOf(r: BazaarRow): BazaarDay {
  return { day: r.day, n: r.n, unpriced: r.unpriced, low: r.min, avg: r.n > 0 ? r.sum / r.n : null, high: r.max }
}

function entryOf(key: string, rows: BazaarRow[]): BazaarEntry {
  const days = rows.map(dayOf).sort((a, b) => b.day.localeCompare(a.day))
  const priced = rows.filter((r) => r.n > 0)
  const n = priced.reduce((s, r) => s + r.n, 0)
  const sum = priced.reduce((s, r) => s + r.sum, 0)
  const lows = priced.map((r) => r.min ?? Infinity)
  const highs = priced.map((r) => r.max ?? -Infinity)
  return {
    key,
    item: rows[0].item,
    tier: rows[0].tier,
    dir: rows[0].dir,
    lastDay: days[0].day,
    lastAvg: days.find((d) => d.avg !== null)?.avg ?? null,
    low: n > 0 ? Math.min(...lows) : null,
    avg: n > 0 ? sum / n : null,
    high: n > 0 ? Math.max(...highs) : null,
    offers: n,
    unpriced: rows.reduce((s, r) => s + r.unpriced, 0),
    days
  }
}

/** The tab's list: one entry per item, tier and direction that matches, most recently seen first. */
export function summarizeBazaar(snap: BazaarSnap | null, q: BazaarQuery): BazaarEntry[] {
  const text = q.text.trim().toLowerCase()
  const groups = new Map<string, BazaarRow[]>()
  for (const r of snap?.rows ?? []) {
    if (q.dir !== 'all' && r.dir !== q.dir) continue
    if (text !== '' && !r.item.toLowerCase().includes(text)) continue
    const key = `${r.dir}|${r.item}|${r.tier}`
    const g = groups.get(key)
    if (g === undefined) groups.set(key, [r])
    else g.push(r)
  }
  return [...groups].map(([key, rows]) => entryOf(key, rows)).sort(
    (a, b) =>
      b.lastDay.localeCompare(a.lastDay) ||
      b.offers + b.unpriced - (a.offers + a.unpriced) ||
      a.item.localeCompare(b.item) ||
      DIR_ORDER[a.dir] - DIR_ORDER[b.dir] ||
      a.tier - b.tier
  )
}

/** `20000` → `20k`, `2500` → `2.5k`, `75` → `75pp`, `0.5` → `5g`. */
export function formatPlat(pp: number | null): string {
  if (pp === null) return '-'
  if (pp >= 1000) return `${Number((pp / 1000).toFixed(pp >= 10000 ? 0 : 1))}k`
  if (pp >= 1) return `${Math.round(pp)}pp`
  return `${Number((pp * 10).toFixed(1))}g`
}
