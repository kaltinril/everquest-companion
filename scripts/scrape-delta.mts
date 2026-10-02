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
// wiki's state now, so scrapedAt moves to now honestly. That holds only while the feed still
// reaches back to scrapedAt (it ages out), so the run refuses when it does not. Moves and
// deletes are listed for a human, never applied.
//
// This file deliberately does not touch the full scrapers: importing scrape-items.ts would run
// its main, so its three tiny page->record helpers are mirrored here (marked below) — the real
// parsing lives in src/main/itemLookupParse.ts and scripts/sources/mobPage.ts and is imported.
//
// After a run that changed anything: `npm run gen:data-weight` (the ledger pins exact bytes).

import { readFileSync, renameSync, writeFileSync } from 'fs'
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
const MAX_RETRIES = 5
const BATCH = 50
const DRY = process.argv.includes('--dry-run')

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Wait before a retry: the server's Retry-After when it gave a usable one, else our backoff. */
function retryDelayMs(res: Response, backoff: number): number {
  const retryAfter = Number(res.headers.get('retry-after'))
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff
}

/** The response, or null for a network failure worth retrying (the last one is thrown). */
async function fetchOnce(url: string, lastTry: boolean): Promise<Response | null> {
  try {
    return await fetch(url, { headers: { 'User-Agent': UA } })
  } catch (err) {
    if (lastTry) throw err
    return null
  }
}

/**
 * The body, or null to retry: 429/5xx, and a maxlag deferral (HTTP 200 with an error body).
 * A permanent 4xx throws at once. Any other error body throws too: a delta built on a
 * half-answered query is silently wrong.
 */
async function readBody<T>(res: Response, lastTry: boolean, what: string): Promise<T | null> {
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && !lastTry) return null
    throw new Error(`${res.status} ${res.statusText} for ${what}`)
  }
  const j = (await res.json()) as T & { error?: { code?: string } }
  if (j.error?.code === 'maxlag' && !lastTry) return null
  if (j.error) throw new Error(`wiki error ${j.error.code ?? '?'} for ${what}`)
  return j
}

/**
 * One serialized GET, scrape-items.ts's contract: maxlag=5, the 1s gap after EVERY request
 * (failed ones included), exponential backoff honouring Retry-After on every retry.
 */
async function api<T>(params: Record<string, string>): Promise<T> {
  const query = { format: 'json', formatversion: '2', maxlag: '5', ...params }
  const url = `${API}?${new URLSearchParams(query).toString()}`
  const what = `${params.action} ${params.list ?? params.prop ?? ''}`
  let wait = DELAY_MS
  for (let attempt = 0; ; attempt++) {
    const lastTry = attempt >= MAX_RETRIES
    const res = await fetchOnce(url, lastTry)
    await sleep(DELAY_MS)
    const j = res ? await readBody<T>(res, lastTry, what) : null
    if (j) return j
    await sleep(res ? retryDelayMs(res, wait) : wait)
    wait *= 2
  }
}

/**
 * The wiki keeps recentchanges for a limited age ($wgRCMaxAge, 90 days by default). If its
 * OLDEST row of any kind is newer than `sinceIso`, changes in the gap are gone from the feed and
 * a delta would silently miss them: refuse, and say a full scrape is due.
 */
async function assertFeedReaches(sinceIso: string): Promise<void> {
  const j = await api<{ query?: { recentchanges?: { timestamp: string }[] } }>({
    action: 'query',
    list: 'recentchanges',
    rcdir: 'newer',
    rclimit: '1',
    rcprop: 'timestamp'
  })
  const oldest = j.query?.recentchanges?.[0]?.timestamp
  if (!oldest || Date.parse(oldest) > Date.parse(sinceIso)) {
    throw new Error(
      `recentchanges reaches back only to ${oldest ?? '(empty)'}, not to ${sinceIso}: ` +
        'the delta cannot see the gap. Run the full scrapers (npm run scrape:items, scrape:mobs).'
    )
  }
}

/** A move or delete in ns0: listed for a human, never applied (the delta only adds/updates). */
export interface PageLogEvent {
  logtype: string
  logaction: string
  title: string
  target?: string
}

export interface RcRow {
  type: string
  title: string
  logtype?: string
  logaction?: string
  logparams?: { target_title?: string }
}

/** Every ns0 page edited or created since `sinceIso`, newest first, deduped; plus moves/deletes. */
async function changedTitles(
  sinceIso: string
): Promise<{ titles: string[]; logs: PageLogEvent[] }> {
  const seen = new Set<string>()
  const logs: PageLogEvent[] = []
  let rccontinue: string | undefined
  for (;;) {
    const params: Record<string, string> = {
      action: 'query',
      list: 'recentchanges',
      rcend: sinceIso, // rc walks backward in time; end = oldest bound
      rclimit: '500',
      rcprop: 'title|loginfo',
      rctype: 'edit|new|log',
      rcnamespace: '0'
    }
    if (rccontinue) params.rccontinue = rccontinue
    const j = await api<{
      query?: { recentchanges?: RcRow[] }
      continue?: { rccontinue?: string }
    }>(params)
    for (const rc of j.query?.recentchanges ?? []) foldRcRow(rc, seen, logs)
    rccontinue = j.continue?.rccontinue
    if (!rccontinue) break
  }
  return { titles: [...seen], logs }
}

export function foldRcRow(rc: RcRow, seen: Set<string>, logs: PageLogEvent[]): void {
  if (rc.type !== 'log') {
    seen.add(rc.title)
    return
  }
  if (rc.logtype !== 'move' && rc.logtype !== 'delete') return
  const target = rc.logparams?.target_title
  logs.push({ logtype: rc.logtype, logaction: rc.logaction ?? '', title: rc.title, target })
}

interface RevPage {
  title: string
  missing?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

/**
 * A `continue` here means the wiki cut the batch short (a response-size limit) and some pages came
 * back without content. Skipping them would drop their edits from the delta without a word.
 */
async function fetchWikitext(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < titles.length; i += BATCH) {
    const j = await api<{ query?: { pages?: RevPage[] }; continue?: unknown }>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: titles.slice(i, i + BATCH).join('|')
    })
    if (j.continue) {
      throw new Error(`revisions batch at ${i} came back continued; content would be missing`)
    }
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

/** The keys a record registers: its page title and, when it differs, its `|itemname`. */
function entryKeys(entry: ItemDbEntry): string[] {
  const keys = [itemKey(entry.page), entry.name ? itemKey(entry.name) : null]
  return keys.filter((k): k is string => !!k)
}

/**
 * Items: scrape-items.ts's `addKeys` law, applied to a delta. A key changes hands only to its own
 * page's newer revision or to a RICHER record, so an edited variant page (A Sealed Letter (Thex
 * Dagger Quest), `|itemname` "A Sealed Letter") never repoints the canonical page's key. Keys a
 * changed page held under an older `|itemname` are dropped before the fold.
 */
export function foldItems(itemsFile: ItemDbFile, wikitext: Map<string, string>): number {
  const entries = new Map<string, ItemDbEntry>()
  for (const [title, wt] of wikitext) {
    const entry = isItemPage(wt) ? toEntry(title, wt) : null
    if (entry) entries.set(entry.page, entry)
  }
  const items = Object.fromEntries(
    Object.entries(itemsFile.items).filter(([k, prev]) => {
      const next = entries.get(prev.page)
      return !next || entryKeys(next).includes(k)
    })
  )
  for (const entry of entries.values()) {
    for (const k of entryKeys(entry)) if (claims(entry, items[k])) items[k] = entry
  }
  itemsFile.items = items
  return entries.size
}

/** Does `entry` take a key `prev` holds? Its own page's newer revision does, else only richer. */
function claims(entry: ItemDbEntry, prev: ItemDbEntry | undefined): boolean {
  if (!prev || prev.page === entry.page) return true
  return JSON.stringify(entry).length > JSON.stringify(prev).length
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

  await assertFeedReaches(oldest)
  console.log(`Changed ns0 pages since ${oldest}…`)
  const { titles: changed, logs } = await changedTitles(oldest)
  console.log(`  ${changed.length} pages changed`)
  printPageLogs(logs)
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

  writeAtomic(ITEMS_PATH, JSON.stringify(itemsOut))
  writeAtomic(MOBS_PATH, JSON.stringify(mobsOut))
  console.log(
    `\nFolded ${itemsTouched} item pages and ${mobsTouched} mob pages over the committed DBs.`
  )
  console.log(`items.json count: ${itemsFile.count} → ${distinctPages}; both scrapedAt → now.`)
  console.log(`Next: npm run gen:data-weight  (the ledger pins exact bytes)`)
  console.log(
    'Not refreshed by the delta: pageEra.json (npm run scrape:page-era), posky.json ' +
      '(npm run scrape:posky) and, where the build carries it, mobRaces.json (gen-mob-races.mts).'
  )
}

/** Write beside, then rename: an interrupted run never leaves a truncated committed DB. */
function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

/** Moves and deletes are a human's call: the delta lists them and changes nothing for them. */
function printPageLogs(logs: PageLogEvent[]): void {
  if (logs.length === 0) return
  console.log(`  ${logs.length} ns0 move/delete log entries (not applied; check by hand):`)
  for (const l of logs) {
    console.log(`    ${l.logtype}/${l.logaction}: ${l.title}${l.target ? ` → ${l.target}` : ''}`)
  }
}

if ((process.argv[1] ?? '').endsWith('scrape-delta.mts')) main()
