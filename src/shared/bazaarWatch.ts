// shared/bazaarWatch.ts — the Bazaar watchlist: items the player watches, for any reason, and
// which trade-chat offers on them alert (asked by Malkil, 2026-10-07; made simple 2026-10-08).
//
// A watch is an item, a tier or every tier, and two independent switches:
//   * `wts`: alert when someone is selling it (a WTS offer), at or under `wtsMax`, or at or under
//     `wtsShare` of the item's 7-day median asking; with neither set, any WTS.
//   * `wtb`: alert when someone is buying it (a WTB offer), at or over `wtbMin`, or naming no
//     price (someone wants it; the price is a conversation); with no price set, any WTB.
// Either, both or neither: with neither the item is only watched (the My watchlist filter).
// What an alert sounds and looks like is not here: it fires the 'bazaarWatch' app signal, and the
// Alerts tab's "Bazaar watchlist match" alert says it, like any other alert.
// One app-wide list, not per character: what an item sells for does not change with who asks.
// Stored through the settings store (main/storeBazaarWatch.ts) and normalized on both sides.

import { formatPlat, median, type BazaarRow, type BazaarSnap, type LiveOffer } from './bazaar'

export interface BazaarWatch {
  /** The item page's spelling, as the bazaar rows carry it. */
  item: string
  /** One upgrade tier, or null for every tier. */
  tier: number | null
  /** Alert on a WTS (someone selling). */
  wts: boolean
  /** Alert on a WTB (someone buying). */
  wtb: boolean
  /** WTS: a sale at or under this alerts. Platinum; null for any price. */
  wtsMax: number | null
  /** WTS: a sale at or under this share of the 7-day median asking alerts (0.8 = 80%). */
  wtsShare: number | null
  /** WTB: a buyer at or over this alerts (or one naming no price). Platinum; null for any. */
  wtbMin: number | null
}

export interface BazaarWatchlist {
  entries: BazaarWatch[]
}

export const EMPTY_WATCHLIST: BazaarWatchlist = { entries: [] }
export const MAX_WATCHES = 300

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
  if (item === '') return null
  const share = positive(r.wtsShare)
  return {
    item,
    tier: tierOf(r.tier),
    wts: r.wts === true,
    wtb: r.wtb === true,
    wtsMax: positive(r.wtsMax),
    wtsShare: share === null ? null : Math.min(share, 1),
    wtbMin: positive(r.wtbMin)
  }
}

/**
 * The first shape (2026-10-07) in this one's fields: one status, one alert switch and one price.
 * Want to buy alerted on a WTS at or under it, want to sell on a WTB at or over it, watching on
 * neither. Any other value passes through.
 */
function fromFirstShape(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || !('status' in raw)) return raw
  const r = raw as Record<string, unknown>
  const buy = r.status === 'buy' && r.alert === true
  const sell = r.status === 'sell' && r.alert === true
  return {
    item: r.item,
    tier: r.tier,
    wts: buy,
    wtb: sell,
    wtsMax: r.status === 'buy' ? r.price : null,
    wtsShare: r.status === 'buy' ? r.medianShare : null,
    wtbMin: r.status === 'sell' ? r.price : null
  }
}

/** Any stored value, made a watchlist. Never throws; drops what it cannot read and repeats. */
export function normalizeBazaarWatchlist(raw: unknown): BazaarWatchlist {
  const list = raw !== null && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : undefined
  if (!Array.isArray(list)) return EMPTY_WATCHLIST
  const seen = new Set<string>()
  const entries: BazaarWatch[] = []
  for (const x of list) {
    const w = watchOf(fromFirstShape(x))
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
  if (o.item.toLowerCase() !== w.item.toLowerCase()) return null
  if (w.tier !== null && w.tier !== o.tier) return null
  if (o.dir === 'sell' && w.wts) return wtsReason(w, o.price, weekMedian)
  if (o.dir === 'buy' && w.wtb) return wtbReason(w, o.price)
  return null
}

function wtsReason(w: BazaarWatch, price: number | null, weekMedian: number | null): string | null {
  if (w.wtsMax === null && w.wtsShare === null) return 'on your watchlist'
  if (price === null) return null
  if (w.wtsMax !== null && price <= w.wtsMax) return `at or under your ${formatPlat(w.wtsMax)}`
  const cap = w.wtsShare !== null && weekMedian !== null ? w.wtsShare * weekMedian : null
  if (cap !== null && price <= cap) return `${Math.round((price / (weekMedian ?? price)) * 100)}% of the 7-day median ${formatPlat(weekMedian)}`
  return null
}

function wtbReason(w: BazaarWatch, price: number | null): string | null {
  if (w.wtbMin === null) return 'on your watchlist'
  if (price === null) return 'no price stated'
  return price >= w.wtbMin ? `at or over your ${formatPlat(w.wtbMin)}` : null
}

/** The offer as one line: `Leric WTS Fleeting Quiver +4 18k`. */
export function watchAlertText(o: LiveOffer): string {
  const what = `${o.item}${o.tier > 0 ? ` +${o.tier}` : ''}`
  const verb = o.dir === 'sell' ? 'WTS' : 'WTB'
  const price = o.price === null ? '' : ` ${formatPlat(o.price)}`
  return `${o.speaker} ${verb} ${what}${price}`.slice(0, 120)
}

/**
 * The tokens the 'bazaarWatch' app signal fills (shared/alertCaptures.ts APP_SIGNAL_CAPTURES), so
 * the alert's banner or spoken phrase can say `{item} {what}` or `{offer} - {why}`.
 */
export function watchAlertCaptures(o: LiveOffer, reason: string): Record<string, string> {
  return {
    item: `${o.item}${o.tier > 0 ? ` +${o.tier}` : ''}`,
    seller: o.speaker,
    price: o.price === null ? 'no price' : formatPlat(o.price),
    what: o.dir === 'sell' ? 'for sale' : 'wanted',
    offer: watchAlertText(o),
    why: reason
  }
}

export interface WatchAlert {
  offer: LiveOffer
  reason: string
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
    if (reason !== null) alerts.push({ offer: o, reason, text: `${watchAlertText(o)} (${reason})` })
  }
  return { newest, alerts }
}
