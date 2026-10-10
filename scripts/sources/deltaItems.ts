// deltaItems.ts — scrape-delta.mts's item fold: changed pages over the committed items.json.
// Pure (no network, no files). Importing scrape-items.ts would run its main, so its three tiny
// page->record helpers are mirrored here; the real parsing is src/main/itemLookupParse.ts.

import { parseItemWikitext, templateField } from '../../src/main/itemLookupParse'
import { itemKey, type ItemDbEntry, type ItemDbFile } from '../../src/main/itemsDb'

// ---- mirrored from scripts/scrape-items.ts ----------------------------------------------------

export function isItemPage(wikitext: string): boolean {
  return /\{\{\s*Itempage\b/i.test(wikitext)
}

function displayName(wikitext: string, title: string): string | undefined {
  const raw = templateField(wikitext, 'itemname')?.replace(/\s+/g, ' ').trim()
  if (!raw || raw.length > 80) return undefined
  if (/[{}[\]|<>]/.test(raw)) return undefined
  return raw === title ? undefined : raw
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === false || (Array.isArray(v) && v.length === 0)
}

function toEntry(title: string, wikitext: string): ItemDbEntry | null {
  const parsed = parseItemWikitext(title, wikitext)
  const name = displayName(wikitext, title)
  const full = { page: title, ...parsed, ...(name ? { name } : {}) }
  const kept = Object.entries(full).filter(([, v]) => !isEmptyValue(v))
  const entry = Object.fromEntries(kept) as unknown as ItemDbEntry
  return Object.keys(entry).length > 1 ? entry : null
}

// ------------------------------------------------------------------------------------------------

/** The keys a record registers: its page title and, when it differs, its `|itemname`. */
function entryKeys(entry: ItemDbEntry): string[] {
  const keys = [itemKey(entry.page), entry.name ? itemKey(entry.name) : null]
  return keys.filter((k): k is string => !!k)
}

export interface ItemFold {
  items: Record<string, ItemDbEntry>
  /** item pages folded */
  folded: number
  /** `|itemname`s whose key lost its last known claimant: fetch these titles and fold again */
  orphans: string[]
}

/**
 * Items: scrape-items.ts's `addKeys` law, applied to a delta. A key changes hands only to its own
 * page's newer revision or to a RICHER record, so an edited variant page (A Sealed Letter (Thex
 * Dagger Quest), `|itemname` "A Sealed Letter") never repoints the canonical page's key. A key a
 * changed page no longer names is re-offered to the committed records that still claim it.
 * Does not mutate `itemsFile`.
 */
export function foldItems(itemsFile: ItemDbFile, wikitext: Map<string, string>): ItemFold {
  const changed = changedEntries(wikitext)
  const items: Record<string, ItemDbEntry> = {}
  const dropped = new Map<string, ItemDbEntry>()
  const pool = new Map<string, ItemDbEntry>()
  for (const [k, prev] of Object.entries(itemsFile.items)) {
    const next = changed.get(prev.page)
    if (!next) pool.set(prev.page, prev)
    if (next && !entryKeys(next).includes(k)) dropped.set(k, prev)
    else items[k] = prev
  }
  for (const entry of changed.values()) {
    pool.set(entry.page, entry)
    for (const k of entryKeys(entry)) if (claims(entry, items[k])) items[k] = entry
  }
  const orphans = reoffer(items, dropped, claimantsByKey(pool.values()))
  return { items, folded: changed.size, orphans }
}

function changedEntries(wikitext: Map<string, string>): Map<string, ItemDbEntry> {
  const changed = new Map<string, ItemDbEntry>()
  for (const [title, wt] of wikitext) {
    const entry = isItemPage(wt) ? toEntry(title, wt) : null
    if (entry) changed.set(entry.page, entry)
  }
  return changed
}

/** Each dropped key to its best remaining claimant; the `|itemname`s that found none. */
function reoffer(
  items: Record<string, ItemDbEntry>,
  dropped: Map<string, ItemDbEntry>,
  claimants: Map<string, ItemDbEntry[]>
): string[] {
  const orphans: string[] = []
  for (const [k, prev] of dropped) {
    if (items[k]) continue
    const holder = pickHolder(claimants.get(k) ?? [])
    if (holder) items[k] = holder
    else if (prev.name && itemKey(prev.name) === k) orphans.push(prev.name)
  }
  return orphans
}

/** Does `entry` take a key `prev` holds? Its own page's newer revision does, else only richer. */
function claims(entry: ItemDbEntry, prev: ItemDbEntry | undefined): boolean {
  if (!prev || prev.page === entry.page) return true
  return JSON.stringify(entry).length > JSON.stringify(prev).length
}

function claimantsByKey(records: Iterable<ItemDbEntry>): Map<string, ItemDbEntry[]> {
  const out = new Map<string, ItemDbEntry[]>()
  for (const r of records) {
    for (const k of new Set(entryKeys(r))) out.set(k, [...(out.get(k) ?? []), r])
  }
  return out
}

const size = (e: ItemDbEntry): number => JSON.stringify(e).length

/** scrape-items' winner: the richer record, ties to the first title in sort order. */
function pickHolder(claimants: ItemDbEntry[]): ItemDbEntry | undefined {
  return [...claimants].sort((a, b) => size(b) - size(a) || a.page.localeCompare(b.page))[0]
}
