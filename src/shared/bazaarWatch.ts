// shared/bazaarWatch.ts — the Bazaar watchlist: items the player wants to buy, wants to sell, or
// only watches, and the alerts a live trade-chat offer raises against them (asked by Malkil,
// 2026-10-07).
//
// A watch is an item, a tier or every tier, and a status:
//   * WANT TO BUY: a WTS (or "selling") offer alerts when it is at or under the watch's price, or
//     at or under a share of the item's 7-day median asking. With neither set, any WTS alerts.
//   * WANT TO SELL: a WTB (or "buying") offer alerts when it is at or over the watch's price, or
//     states no price (someone wants it; the price is a conversation). With no price set, any WTB.
//   * WATCHING: a filter only, never an alert.
// One app-wide list, not per character: what an item sells for does not change with who asks.
// Stored through the settings store (main/storeBazaarWatch.ts) and normalized on both sides.

import { formatPlat, median, type BazaarRow, type BazaarSnap, type LiveOffer } from './bazaar'

export type WatchStatus = 'buy' | 'sell' | 'watch'

export const WATCH_STATUS_LABEL: Record<WatchStatus, string> = {
  buy: 'Want to buy',
  sell: 'Want to sell',
  watch: 'Watching'
}

export interface BazaarWatch {
  /** The item page's spelling, as the bazaar rows carry it. */
  item: string
  /** One upgrade tier, or null for every tier. */
  tier: number | null
  status: WatchStatus
  /** Raise an alert when a live offer matches (never for `watch`). */
  alert: boolean
  /** Buy: a WTS at or under this; sell: a WTB at or over this. Platinum; null for any price. */
  price: number | null
  /** Buy only: a WTS at or under this share of the 7-day median asking (0.8 = 80%). */
  medianShare: number | null
}

export interface BazaarWatchlist {
  entries: BazaarWatch[]
}

export const EMPTY_WATCHLIST: BazaarWatchlist = { entries: [] }
export const MAX_WATCHES = 300

const STATUSES: readonly WatchStatus[] = ['buy', 'sell', 'watch']

function positive(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null
}

function tierOf(x: unknown): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 20 ? x : null
}

function watchOf(raw: unknown): BazaarWatch | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const item = typeof r.item === 'string' ? r.item.trim().slice(0, 120) : ''
  const status = STATUSES.find((s) => s === r.status)
  if (item === '' || status === undefined) return null
  const tier = tierOf(r.tier)
  const share = positive(r.medianShare)
  return {
    item,
    tier,
    status,
    alert: status !== 'watch' && r.alert === true,
    price: positive(r.price),
    medianShare: status === 'buy' && share !== null ? Math.min(share, 1) : null
  }
}

/** Any stored value, made a watchlist. Never throws; drops what it cannot read and repeats. */
export function normalizeBazaarWatchlist(raw: unknown): BazaarWatchlist {
  const list = raw !== null && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : undefined
  if (!Array.isArray(list)) return EMPTY_WATCHLIST
  const seen = new Set<string>()
  const entries: BazaarWatch[] = []
  for (const x of list) {
    const w = watchOf(x)
    if (w === null || seen.has(watchKey(w.item, w.tier))) continue
    seen.add(watchKey(w.item, w.tier))
    entries.push(w)
    if (entries.length === MAX_WATCHES) break
  }
  return { entries }
}

export function watchKey(item: string, tier: number | null): string {
  return `${item.toLowerCase()}|${tier ?? '*'}`
}

/** The watch that covers this item and tier: its own tier's first, else the every-tier one. */
export function findWatch(list: BazaarWatchlist, item: string, tier: number): BazaarWatch | null {
  const lower = item.toLowerCase()
  const on = list.entries.filter((w) => w.item.toLowerCase() === lower)
  return on.find((w) => w.tier === tier) ?? on.find((w) => w.tier === null) ?? null
}

/** Any watch on this item, its tier's or not: the row's chip, when a row stands for every tier. */
export function watchOnItem(list: BazaarWatchlist, item: string): BazaarWatch | null {
  const lower = item.toLowerCase()
  return list.entries.find((w) => w.item.toLowerCase() === lower) ?? null
}

/** The list with `w` in place of the watch on the same item and tier, or added. */
export function setWatch(list: BazaarWatchlist, w: BazaarWatch): BazaarWatchlist {
  const k = watchKey(w.item, w.tier)
  const rest = list.entries.filter((x) => watchKey(x.item, x.tier) !== k)
  return normalizeBazaarWatchlist({ entries: [...rest, w] })
}

export function removeWatch(list: BazaarWatchlist, item: string, tier: number | null): BazaarWatchlist {
  const k = watchKey(item, tier)
  return { entries: list.entries.filter((x) => watchKey(x.item, x.tier) !== k) }
}

const DAY_MS = 86_400_000

/** Median asking for one item and tier over the 7 days ending `endDay`; null with none. */
export function weekMedianAsking(rows: readonly BazaarRow[], item: string, tier: number, endDay: string): number | null {
  const end = Date.parse(endDay)
  const prices = rows
    .filter((r) => r.dir === 'sell' && r.item === item && r.tier === tier && end - Date.parse(r.day) < 7 * DAY_MS)
    .flatMap((r) => r.prices ?? (r.n > 0 ? Array<number>(r.n).fill(r.sum / r.n) : []))
  return median(prices)
}

/** Why this live offer alerts under this watch, or null when it does not. */
export function watchAlertReason(w: BazaarWatch, o: LiveOffer, weekMedian: number | null): string | null {
  if (!w.alert || o.item.toLowerCase() !== w.item.toLowerCase()) return null
  if (w.tier !== null && w.tier !== o.tier) return null
  if (w.status === 'buy' && o.dir === 'sell') return buyReason(w, o.price, weekMedian)
  if (w.status === 'sell' && o.dir === 'buy') return sellReason(w, o.price)
  return null
}

function buyReason(w: BazaarWatch, price: number | null, weekMedian: number | null): string | null {
  if (w.price === null && w.medianShare === null) return 'on your want-to-buy list'
  if (price === null) return null
  if (w.price !== null && price <= w.price) return `at or under your ${formatPlat(w.price)}`
  const cap = w.medianShare !== null && weekMedian !== null ? w.medianShare * weekMedian : null
  if (cap !== null && price <= cap) return `${Math.round((price / (weekMedian ?? price)) * 100)}% of the 7-day median ${formatPlat(weekMedian)}`
  return null
}

function sellReason(w: BazaarWatch, price: number | null): string | null {
  if (w.price === null) return 'on your want-to-sell list'
  if (price === null) return 'no price stated'
  return price >= w.price ? `at or over your ${formatPlat(w.price)}` : null
}

/** The banner line for an alert: `Leric WTS Fleeting Quiver +4 18k (at or under your 20k)`. */
export function watchAlertText(o: LiveOffer, reason: string): string {
  const what = `${o.item}${o.tier > 0 ? ` +${o.tier}` : ''}`
  const verb = o.dir === 'sell' ? 'WTS' : 'WTB'
  const price = o.price === null ? '' : ` ${formatPlat(o.price)}`
  return `${o.speaker} ${verb} ${what}${price} (${reason})`.slice(0, 120)
}

export interface WatchAlert {
  offer: LiveOffer
  text: string
}

/**
 * The live offers newer than `after` that a watch alerts on, and the newest seq seen. With `after`
 * null the snapshot is a baseline: nothing alerts, and its newest seq is where the next look starts.
 */
export function freshWatchAlerts(snap: BazaarSnap, list: BazaarWatchlist, after: number | null): { newest: number; alerts: WatchAlert[] } {
  const live = snap.live ?? []
  const newest = live.reduce((m, o) => Math.max(m, o.seq), after ?? 0)
  if (after === null) return { newest, alerts: [] }
  const alerts: WatchAlert[] = []
  for (const o of live) {
    if (o.seq <= after) continue
    const w = findWatch(list, o.item, o.tier)
    const reason = w === null ? null : watchAlertReason(w, o, weekMedianAsking(snap.rows, o.item, o.tier, o.at.slice(0, 10)))
    if (reason !== null) alerts.push({ offer: o, text: watchAlertText(o, reason) })
  }
  return { newest, alerts }
}
