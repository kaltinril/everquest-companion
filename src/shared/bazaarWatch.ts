// shared/bazaarWatch.ts — the Bazaar watchlist: items the player watches, for any reason, and
// which trade-chat offers on them alert (asked by Malkil, 2026-10-07; made simple 2026-10-08).
//
// A watch is an item, a tier or every tier, and two independent switches:
//   * `wts`: alert when someone is selling it (a WTS offer);
//   * `wtb`: alert when someone is buying it (a WTB offer).
// Either, both or neither: with neither the item is only watched (the My watchlist filter).
// What an alert sounds and looks like is not here: it fires the 'bazaarWatch' app signal, and the
// Alerts tab's "Bazaar watchlist match" alert says it, like any other alert.
// One app-wide list, not per character: what an item sells for does not change with who asks.
// Stored through the settings store (main/storeBazaarWatch.ts) and normalized on both sides.

import { formatPlat, type BazaarSnap, type LiveOffer } from './bazaar'

export interface BazaarWatch {
  /** The item page's spelling, as the bazaar rows carry it. */
  item: string
  /** One upgrade tier, or null for every tier. */
  tier: number | null
  /** Alert on a WTS (someone selling). */
  wts: boolean
  /** Alert on a WTB (someone buying). */
  wtb: boolean
}

export interface BazaarWatchlist {
  entries: BazaarWatch[]
}

export const EMPTY_WATCHLIST: BazaarWatchlist = { entries: [] }
export const MAX_WATCHES = 300

function tierOf(x: unknown): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 20 ? x : null
}

function watchOf(raw: unknown): BazaarWatch | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const item = typeof r.item === 'string' ? r.item.trim().slice(0, 120) : ''
  if (item === '') return null
  // The first shape (2026-10-07) had one status and one alert switch: want to buy alerted on a
  // WTS, want to sell on a WTB, watching on neither.
  const alert = r.alert === true
  return {
    item,
    tier: tierOf(r.tier),
    wts: r.wts === true || (r.status === 'buy' && alert),
    wtb: r.wtb === true || (r.status === 'sell' && alert)
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

/** Does this live offer alert under this watch? */
export function watchAlerts(w: BazaarWatch, o: LiveOffer): boolean {
  if (o.item.toLowerCase() !== w.item.toLowerCase()) return false
  if (w.tier !== null && w.tier !== o.tier) return false
  return o.dir === 'sell' ? w.wts : o.dir === 'buy' ? w.wtb : false
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
 * the alert's banner or spoken phrase can say `{item} {what}` or `{offer}`.
 */
export function watchAlertCaptures(o: LiveOffer): Record<string, string> {
  return {
    item: `${o.item}${o.tier > 0 ? ` +${o.tier}` : ''}`,
    seller: o.speaker,
    price: o.price === null ? 'no price' : formatPlat(o.price),
    what: o.dir === 'sell' ? 'for sale' : 'wanted',
    offer: watchAlertText(o)
  }
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
    if (w !== null && watchAlerts(w, o)) alerts.push({ offer: o, text: watchAlertText(o) })
  }
  return { newest, alerts }
}
