// shared/gapIcons.ts - an item page with no icon id (owner, 2026-11-20: "another thing we need to add
// to the wiki gaps is items with missing lucy IDs like Dark Ironbound Tome ... our gaps page doesn't
// show us that").
//
// An item page states its icon as `|lucy_img_ID = <number>`; the app draws `File:Item <id>.png` from
// it. A page with the field empty is a page the app shows with no picture, and the wiki shows with
// a broken one. Main answers which pages in the wiki data state none (`main/gapItemIcons.ts`, 25 of
// 11,861 on 2026-11-19); this file turns the ones the PLAYER HAS MET into Items rows.
//
// EVIDENCE, AS EVERY GAPS ROW HAS: the item was looted (the loot module) or is in an inventory
// export (the held index). A page nobody here has met is no row: the tab is the player's own
// measurements, and a row with no evidence has nothing to offer the wiki but its name.
//
// THE ROW IS AN UPDATE (`gapJob.ts`): the page exists and lacks one field. Its Copy is that one
// field's line, with the number when a capture's icon match gave one (`itemShots`), blank for the
// editor to fill otherwise. The app does not guess an icon.
//
// STALE DATA. A page fixed on the wiki since the last data refresh still reads as lacking the
// field here: the row stays until the refresh, or until it is marked Done.

import { itemBaseName } from './itemStats'
import { logStamp } from './gapExtraItems'
import type { HeldIndex } from './gapHeld'
import type { GapKind, GapRow, GapTally } from './gaps'
import type { LootEvent } from './types'

/** One item page the wiki data holds with no icon id. */
export interface IconlessPage {
  /** the item's in-game name, as the page states it */
  name: string
  /** the wiki page's title, for the edit link */
  page: string
}

/** What an Items row for an existing page with no icon asks to add (`GapRow.iconUpdate`). */
export interface IconUpdate {
  page: string
}

/** What the player has met: the loot lines and the inventory exports' holders. */
export interface IconSeen {
  loot: readonly LootEvent[]
  held: HeldIndex
}

/** One key for an item whatever its ` +N` tier or capitals: an icon belongs to the item, not a tier. */
export const iconKey = (name: string): string => itemBaseName(name).trim().toLowerCase()

/** The eight most frequent of `names`, as a row's details tally them. */
function tally(names: readonly string[]): GapTally | undefined {
  if (names.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  const entries = [...counts].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  return { entries: entries.slice(0, 8), distinct: entries.length, all: entries.map((e) => e.name) }
}

interface Met {
  kinds: Set<GapKind>
  count: number
  stamps: string[]
  zones: string[]
  sources: string[]
}

const met = (by: Map<string, Met>, key: string): Met => {
  let m = by.get(key)
  if (m === undefined) {
    m = { kinds: new Set(), count: 0, stamps: [], zones: [], sources: [] }
    by.set(key, m)
  }
  return m
}

/** What the loot lines say of the iconless pages. */
function lootEvidence(by: Map<string, Met>, wanted: ReadonlySet<string>, loot: readonly LootEvent[]): void {
  for (const e of loot) {
    const key = iconKey(e.item)
    if (!wanted.has(key)) continue
    const m = met(by, key)
    m.kinds.add('looted')
    m.count += e.count ?? 1
    m.stamps.push(logStamp(new Date(e.ts).toISOString()))
    if (e.zone) m.zones.push(e.zone)
    if (e.source) m.sources.push(e.source)
  }
}

/** What the inventory exports add. A looted item is already counted by its loot lines; an export adds the copies only it shows. */
function heldEvidence(by: Map<string, Met>, wanted: ReadonlySet<string>, held: HeldIndex): void {
  for (const [tierKey, holders] of held) {
    const key = iconKey(holders.find((h) => h.exported !== undefined)?.exported?.name ?? tierKey)
    if (!wanted.has(key)) continue
    const m = met(by, key)
    const looted = m.kinds.has('looted')
    m.kinds.add('held')
    for (const h of holders) {
      if (!looted) m.count += h.total
      m.stamps.push(logStamp(h.exportedAt))
    }
  }
}

/** Everything the loot and the exports say of the iconless pages, by `iconKey`. */
function evidence(wanted: ReadonlySet<string>, loot: readonly LootEvent[], held: HeldIndex): Map<string, Met> {
  const by = new Map<string, Met>()
  lootEvidence(by, wanted, loot)
  heldEvidence(by, wanted, held)
  return by
}

/**
 * One Items row per iconless page the player has met, none for an item an Items row already names
 * (that row is the item's, and a new-page row's Copy carries the icon field anyway). `rows` is the
 * snapshot's; `more` is the rows added beside it (an export's or a capture's item, gapExtraItems.ts).
 */
export function iconRows(iconless: readonly IconlessPage[], seen: IconSeen, rows: readonly GapRow[], more: readonly GapRow[] = []): GapRow[] {
  if (iconless.length === 0) return []
  const pages = new Map(iconless.map((p) => [iconKey(p.name), p]))
  const named = new Set([...rows, ...more].filter((r) => r.domain === 'item').map((r) => iconKey(r.name)))
  const out: GapRow[] = []
  for (const [key, m] of evidence(new Set(pages.keys()), seen.loot, seen.held)) {
    const page = pages.get(key)
    if (page === undefined || named.has(key)) continue
    const stamps = m.stamps.filter((s) => s !== '').sort()
    const zones = tally(m.zones)
    const sources = tally(m.sources)
    out.push({
      domain: 'item',
      name: page.name,
      kinds: [...m.kinds].sort(),
      count: Math.max(1, m.count),
      first: stamps[0] ?? '',
      last: stamps.at(-1) ?? '',
      details: { ...(zones === undefined ? {} : { zones }), ...(sources === undefined ? {} : { sources }), samples: [] },
      iconUpdate: { page: page.page }
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The chip's words: what the page lacks. */
export function iconWhy(item: string): string {
  return `The page for ${item} has no icon id (lucy_img_ID), so the item shows with no picture.`
}

/** The buttons' words for an icon row. */
export function iconButtons(u: IconUpdate): { edit: string; page: string; copyTip: string } {
  return { edit: 'Edit item page', page: u.page, copyTip: `The one line to set on the page ${u.page}: its lucy_img_ID.` }
}

/**
 * Exactly the line to set: the field with the icon a capture of the item's window matched, or with
 * nothing after the `=` for the editor to fill. Never a guessed number.
 */
export function iconAddText(iconId?: number): string {
  return `|lucy_img_ID        = ${iconId === undefined ? '' : String(iconId)}\n`
}
