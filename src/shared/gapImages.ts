// shared/gapImages.ts — mobs the player met whose wiki page has no image (owner ask, 2026-10-18:
// "Marda didn't have one ... So the page existed, but no npc_marda.png existed"). A mob is met when
// the kills ledger holds it, a loot line names it as the corpse, or the player conned it (Marda was
// conned and hailed, never killed: review 2026-10-19); the catalog marks a page whose
// image is missing (mobs.json `noImage`, scrape-wiki-files.ts checks every named file against the
// wiki's file list). A name any page of which has an image is not a row. A mob the catalog does not
// have at all is a mob row already.

import type { GapRow } from './gaps'
import { spanStamps, widen, type Span } from './gapTimes'
import type { KillMap } from './kills'
import { gapMobKey as mobKey, perObject } from './gapMemo'
import type { MobEntry } from './mobTypes'
import { mobSourceOf } from './rewardChest'
import type { LootEvent } from './types'
import { npcImageName } from './wikiPage'
import { zoneKey } from './zones'

/** A catalog record as this reads it; `otherNames` and the image fields are absent on a branch without them. */
type CatalogMob = Pick<MobEntry, 'name' | 'page'> & { otherNames?: string[]; image?: string; noImage?: true; zones?: string[] }

/**
 * Every catalog name → its pages, all of them with no image; a name with one image anywhere is left
 * out. Built once per catalog (perf audit, 2026-10-20: gapMemo.ts), so read-only.
 */
const imagelessByMob = perObject((catalog: readonly CatalogMob[]): ReadonlyMap<string, readonly CatalogMob[]> => {
  const out = new Map<string, CatalogMob[]>()
  const pictured = new Set<string>()
  for (const m of catalog) {
    for (const key of new Set([m.name, m.page, ...(m.otherNames ?? [])].map(mobKey))) {
      if (m.noImage !== true) pictured.add(key)
      else out.set(key, [...(out.get(key) ?? []), m])
    }
  }
  for (const key of pictured) out.delete(key)
  return out
})

interface Met {
  name: string
  kills: number
  loots: number
  cons: number
  /** every zone a loot or a con placed it in, with how often; kills carry no zone */
  zones: Map<string, number>
  /** the zone it was last placed in, and when (epoch ms; -Infinity for a con with no time) */
  zone: string
  zoneTs: number
  /** first and last met by a kill or a loot (a con carries no time here) */
  span?: Span
}

const unmet = (name: string): Met => ({ name, kills: 0, loots: 0, cons: 0, zones: new Map(), zone: '', zoneTs: -Infinity })

/**
 * A loot or a con places the mob: every zone is kept, so "Zone I'm in" finds the row wherever it was
 * met (owner, 2026-11-01: a lizardman warrior conned in the Rathe Mountains was filed under The
 * Feerrott, where one was looted two weeks before, and the filter hid it), and the newest names it.
 */
function placeAt(m: Met, zone: string | undefined, n: number, ts: number | undefined): void {
  if (zone === undefined || zone === '') return
  m.zones.set(zone, (m.zones.get(zone) ?? 0) + n)
  const at = ts ?? -Infinity
  if (m.zone === '' || at >= m.zoneTs) {
    m.zone = zone
    m.zoneTs = at
  }
}

/** A /con as this reads it (the consider module's row): who, where, how often. */
export interface ConMet {
  mob: string
  zone?: string
  cons: number
  /** the most recent con, epoch ms (the consider module's row) */
  ts?: number
}

/** The mobs met, by key: kills from the ledger, loot sources (never the Reward Chest) with the zone last looted in, cons with theirs. */
function metMobs(kills: KillMap, loot: readonly LootEvent[], cons: readonly ConMet[]): Map<string, Met> {
  const out = new Map<string, Met>()
  for (const k of Object.values(kills)) out.set(mobKey(k.display), { ...unmet(k.display), kills: k.count, span: widen(widen(undefined, k.firstTs), k.lastTs) })
  for (const e of loot) {
    const mob = mobSourceOf(e)
    if (mob === undefined) continue
    const m = out.get(mobKey(mob)) ?? unmet(mob)
    m.loots++
    placeAt(m, e.zone, 1, e.ts)
    m.span = widen(m.span, e.ts)
    out.set(mobKey(mob), m)
  }
  // A con places a mob the player only killed (kills carry no zone) or only looked at, and a newer
  // con than the last loot moves it to where the player is now.
  for (const c of cons) {
    const m = out.get(mobKey(c.mob)) ?? unmet(c.mob)
    m.cons += c.cons
    m.span = widen(m.span, c.ts)
    placeAt(m, c.zone, c.cons, c.ts)
    out.set(mobKey(c.mob), m)
  }
  return out
}

/** Every zone the mob was placed in, the newest first (it heads the row and its group), then by count. */
function zoneTally(met: Met): NonNullable<GapRow['details']['zones']> {
  const rest = [...met.zones].filter(([z]) => z !== met.zone).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const entries = [{ name: met.zone, n: met.zones.get(met.zone) ?? 1 }, ...rest.map(([name, n]) => ({ name, n }))]
  return { entries, distinct: entries.length, all: entries.map((e) => e.name) }
}

/**
 * The pages a met name's row belongs to. Several pages can share a name, one per zone (`A Kobold
 * Scout` in Steamfont, `A kobold scout (Toxxulia)`): the page whose `|zone` the mob was met in is
 * the row, with only those zones on it (owner, 2026-11-11: a Toxxulia kobold scout's row opened the
 * Steamfont page). Met in no page's zone, or nowhere: the first page, as before.
 */
function pagesMet(met: Met, pages: readonly CatalogMob[]): { met: Met; page: CatalogMob }[] {
  if (pages.length <= 1) return pages.map((page) => ({ met, page }))
  const out: { met: Met; page: CatalogMob }[] = []
  for (const page of pages) {
    const keys = new Set((page.zones ?? []).map(zoneKey))
    const zones = new Map([...met.zones].filter(([z]) => keys.has(zoneKey(z))))
    if (zones.size === 0) continue
    const zone = zones.has(met.zone) ? met.zone : [...zones].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    out.push({ met: { ...met, zones, zone }, page })
  }
  return out.length > 0 ? out : [{ met, page: pages[0] }]
}

/** One met spelling's row for a page, before it is named: its tallies, its times, its zones. */
function metRow(met: Met, page: string, n: number): GapRow {
  return {
    domain: 'image',
    name: met.name,
    page,
    kinds: met.kills > 0 ? ['killed'] : met.loots > 0 ? ['looted'] : ['considered'],
    count: n,
    ...spanStamps(met.span),
    details: {
      samples: [],
      sources: { entries: [{ name: page, n }], distinct: 1 },
      ...(met.zone === '' ? {} : { zones: zoneTally(met) })
    }
  }
}

/** The met mobs whose pages have no image, as Gaps rows named by the page, the file on the row. */
export function imageGaps(kills: KillMap, loot: readonly LootEvent[], catalog: readonly CatalogMob[], cons: readonly ConMet[] = []): GapRow[] {
  const imageless = imagelessByMob(catalog)
  // One row per PAGE: two spellings met (a name and a redirect, say) can lead to one page, and two
  // rows of one name broke the table (owner, 2026-10-19). The busiest spelling's tallies stand.
  // The row is named by the spelling that is the page's title or in-game name, when the log met it.
  const byPage = new Map<string, { row: GapRow; page: CatalogMob }>()
  const named = new Map<string, string>()
  for (const [key, seen] of metMobs(kills, loot, cons)) {
    for (const { met, page } of pagesMet(seen, imageless.get(key) ?? [])) {
      if ([page.page, page.name].map(mobKey).includes(key)) named.set(page.page, met.name)
      const n = Math.max(met.kills, met.loots, met.cons)
      if ((byPage.get(page.page)?.row.count ?? -1) >= n) continue
      byPage.set(page.page, { row: metRow(met, page.page, n), page })
    }
  }
  const rows = [...byPage].map(([title, { row, page }]) => ({ ...row, ...imageNames(named.get(title) ?? row.name, page) }))
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** An image row's page title when the row is named otherwise (`A lizard man scout` beside `a lizardman scout`). */
export function otherPageTitle(row: GapRow): string | undefined {
  return row.domain === 'image' && row.page !== undefined && mobKey(row.page) !== mobKey(row.name) ? row.page : undefined
}

/** A title naming its page's place, `A goblin (Feerrott)`: several pages share the mob's name. */
const QUALIFIED = /\s\([^()]+\)$/

/**
 * An image row's name and file. The name is the game's spelling as the log met it (owner, 2026-10-19:
 * "a lesser kobold", not the title's forced capital), and the file is named after it, never a
 * misspelled title (owner, 2026-10-21: "yes name after real name not misspelling":
 * `npc_a_lizardman_scout.png` for the page A lizard man scout). Never the page's `|name`: a page
 * reached by its title can name another mob there (A cave bat says `a giant cave bat`), and that
 * file is another page's. A page whose own `imagefilename` names another file keeps it in
 * `pageImage`, so the row can say so. A qualified title (`A goblin (Feerrott)`) stays the row's
 * name, and its page's file stands: the bare name's file may be another page's picture.
 */
function imageNames(metName: string, page: CatalogMob): Pick<GapRow, 'name' | 'image' | 'pageImage'> {
  if (QUALIFIED.test(page.page)) return { name: page.page, image: page.image ?? npcImageName(page.name) }
  const image = npcImageName(metName)
  return page.image === undefined || sameWikiFile(page.image, image) ? { name: metName, image } : { name: metName, image, pageImage: page.image }
}

/** The wiki's one file: a space is `_`, a run of them one, and only the first letter's case is free. */
const wikiFileKey = (file: string): string => {
  const f = file.trim().replace(/[\s_]+/g, '_')
  return f.charAt(0).toUpperCase() + f.slice(1)
}

/** Whether two file names name one file on the wiki (`Npc_guard_e`tru.png` is `npc_guard_e`tru.png`). */
export const sameWikiFile = (a: string, b: string): boolean => wikiFileKey(a) === wikiFileKey(b)

/** The served snapshot with the image rows joined in and counted, so the tab treats them as a domain. */
export function withImageRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  met: { kills: KillMap; loot: readonly LootEvent[]; cons?: readonly ConMet[] },
  catalog: readonly CatalogMob[]
): S {
  const rows = imageGaps(met.kills, met.loot, catalog, met.cons ?? [])
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, image: rows.length } }
}
