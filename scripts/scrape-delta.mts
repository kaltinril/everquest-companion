// scrape-delta.mts — top up the committed wiki DBs from MediaWiki's OWN change feed, instead of
// re-reading 18,000 pages that did not change.
//
//   npx tsx scripts/scrape-delta.mts [--dry-run]
//
// `list=recentchanges` is what the wiki PUBLISHES so consumers do not have to re-scrape: every
// ns0 edit/creation since `items.json`'s scrapedAt, a few index requests in total. Only those
// pages' wikitext is then fetched (50 per request, the same serialized one-request-per-second
// etiquette scrape-items.ts states as law), parsed through the SAME parsers the full scrapers
// use, and folded over the committed records. Full-scrape @ T plus every change since T is the
// wiki's state now, so scrapedAt moves to now honestly.
//
// This file deliberately does not touch the full scrapers: importing scrape-items.ts would run
// its main, so its three tiny page->record helpers are mirrored here (marked below) — the real
// parsing lives in src/main/itemLookupParse.ts and scripts/sources/mobPage.ts and is imported.
//
// After a run that changed anything: `npm run gen:data-weight` (the ledger pins exact bytes).

import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { parseItemWikitext, templateField } from '../src/main/itemLookupParse'
import { itemKey, type ItemDbEntry, type ItemDbFile } from '../src/main/itemsDb'
import { isMobPage, parseMobPage } from './sources/mobPage'

const HERE = dirname(fileURLToPath(import.meta.url))
const ITEMS_PATH = resolve(HERE, '../src/main/data/items.json')
const MOBS_PATH = resolve(HERE, '../src/renderer/src/data/eqlegends/mobs.json')
const API = 'https://eqlwiki.com/api.php'
const UA = 'eqcompanion-delta (fork of jmoyers/everquest-companion; one serialized req/s)'
const DELAY_MS = 1000
const BATCH = 50
const DRY = process.argv.includes('--dry-run')

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function api<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    await sleep(DELAY_MS)
    if (res.ok) return (await res.json()) as T
    if (attempt >= 5) throw new Error(`${res.status} for ${url}`)
    await sleep(DELAY_MS * 2 ** attempt)
  }
}

/** Every ns0 page edited or created since `sinceIso`, newest first, deduped. */
async function changedTitles(sinceIso: string): Promise<string[]> {
  const seen = new Set<string>()
  let rccontinue: string | undefined
  for (;;) {
    const params: Record<string, string> = {
      action: 'query',
      list: 'recentchanges',
      rcend: sinceIso, // rc walks backward in time; end = oldest bound
      rclimit: '500',
      rcprop: 'title',
      rctype: 'edit|new',
      rcnamespace: '0'
    }
    if (rccontinue) params.rccontinue = rccontinue
    const j = await api<{
      query?: { recentchanges?: { title: string }[] }
      continue?: { rccontinue?: string }
    }>(params)
    for (const rc of j.query?.recentchanges ?? []) seen.add(rc.title)
    rccontinue = j.continue?.rccontinue
    if (!rccontinue) break
  }
  return [...seen]
}

interface RevPage {
  title: string
  missing?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

async function fetchWikitext(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < titles.length; i += BATCH) {
    const j = await api<{ query?: { pages?: RevPage[] } }>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: titles.slice(i, i + BATCH).join('|')
    })
    for (const p of j.query?.pages ?? []) {
      const wt = p.revisions?.[0]?.slots?.main?.content
      if (!p.missing && wt != null) out.set(p.title, wt)
    }
    console.log(`  content ${Math.min(i + BATCH, titles.length)}/${titles.length}`)
  }
  return out
}

// ---- mirrored from scripts/scrape-items.ts (whose import would run its main) -------------------

function isItemPage(wikitext: string): boolean {
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

function main(): void {
  void run()
}

/** Items: the newest revision simply replaces what the key held — a delta has no older rival. */
function foldItems(itemsFile: ItemDbFile, wikitext: Map<string, string>): number {
  let touched = 0
  for (const [title, wt] of wikitext) {
    if (!isItemPage(wt)) continue
    const entry = toEntry(title, wt)
    if (!entry) continue
    for (const k of [itemKey(entry.page), entry.name ? itemKey(entry.name) : null]) {
      if (k) itemsFile.items[k] = entry
    }
    touched++
  }
  return touched
}

/** Mobs: the same fold, keyed by page over the committed sorted list. */
function foldMobs(
  mobs: { page: string }[],
  wikitext: Map<string, string>
): { byPage: Map<string, { page: string }>; mobsTouched: number } {
  const byPage = new Map(mobs.map((m) => [m.page, m]))
  let mobsTouched = 0
  for (const [title, wt] of wikitext) {
    if (!isMobPage(wt)) continue
    const entry = parseMobPage(title, wt)
    if (!entry) continue
    byPage.set(title, entry)
    mobsTouched++
  }
  return { byPage, mobsTouched }
}

async function run(): Promise<void> {
  const itemsFile = JSON.parse(readFileSync(ITEMS_PATH, 'utf8')) as ItemDbFile
  const mobsFile = JSON.parse(readFileSync(MOBS_PATH, 'utf8')) as {
    scrapedAt: string
    source: string
    mobs: { page: string }[]
  }
  // One overlap hour absorbs any clock skew between the scrape host and the wiki.
  const oldest = new Date(
    Math.min(Date.parse(itemsFile.scrapedAt), Date.parse(mobsFile.scrapedAt)) - 3600_000
  ).toISOString()

  console.log(`Changed ns0 pages since ${oldest}…`)
  const changed = await changedTitles(oldest)
  console.log(`  ${changed.length} pages changed`)
  if (DRY) {
    const knownItems = changed.filter((t) => itemsFile.items[itemKey(t) ?? '']).length
    const mobPages = new Set(mobsFile.mobs.map((m) => m.page))
    const knownMobs = changed.filter((t) => mobPages.has(t)).length
    console.log(`  of which already-known items: ${knownItems}, already-known mobs: ${knownMobs}`)
    console.log(`  (content not fetched — dry run; new pages resolve only by content)`)
    return
  }

  const wikitext = await fetchWikitext(changed)

  const itemsTouched = foldItems(itemsFile, wikitext)
  const distinctPages = new Set(Object.values(itemsFile.items).map((e) => e.page)).size
  const itemsOut: ItemDbFile = {
    scrapedAt: new Date().toISOString(),
    source: itemsFile.source.includes('delta')
      ? itemsFile.source
      : `${itemsFile.source} + recentchanges delta (scripts/scrape-delta.mts)`,
    count: distinctPages,
    items: Object.fromEntries(
      Object.entries(itemsFile.items).sort((a, b) => a[0].localeCompare(b[0]))
    )
  }

  const { byPage, mobsTouched } = foldMobs(mobsFile.mobs, wikitext)
  const mobsOut = {
    scrapedAt: new Date().toISOString(),
    source: mobsFile.source.includes('delta')
      ? mobsFile.source
      : `${mobsFile.source} + recentchanges delta (scripts/scrape-delta.mts)`,
    mobs: [...byPage.values()].sort((a, b) => a.page.localeCompare(b.page))
  }

  writeFileSync(ITEMS_PATH, JSON.stringify(itemsOut), 'utf8')
  writeFileSync(MOBS_PATH, JSON.stringify(mobsOut), 'utf8')
  console.log(
    `\nFolded ${itemsTouched} item pages and ${mobsTouched} mob pages over the committed DBs.`
  )
  console.log(`items.json count: ${itemsFile.count} → ${distinctPages}; both scrapedAt → now.`)
  console.log(`Next: npm run gen:data-weight  (the ledger pins exact bytes)`)
}

main()
