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
// reaches back to scrapedAt (it ages out), so the run refuses when it does not. A move, delete or
// restore is applied by re-reading its titles: a page that no longer reads as an item or mob
// leaves the DB. A page that could not be read keeps scrapedAt where it was.
//
// This file deliberately does not touch the full scrapers: importing scrape-items.ts would run
// its main, so its three tiny page->record helpers are mirrored in sources/deltaItems.ts — the real
// parsing lives in src/main/itemLookupParse.ts and scripts/sources/mobPage.ts and is imported.
//
// After a run that changed anything: `npm run gen:data-weight` (the ledger pins exact bytes).

import { readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { itemKey, type ItemDbFile } from '../src/main/itemsDb'
import { foldItems } from './sources/deltaItems'
import {
  foldMobs,
  foldRcRow,
  nextScrapedAt,
  readRevPages,
  type PageLogEvent,
  type PageTexts,
  type RcRow,
  type RevPage
} from './sources/deltaPages'

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

/** Every ns0 title edited, created or named by a log row since `sinceIso`, deduped; plus logs. */
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

/**
 * A `continue` here means the wiki cut the batch short (a response-size limit) and some pages came
 * back without content. Skipping them would drop their edits from the delta without a word.
 */
async function fetchWikitext(titles: string[], out: PageTexts, unapplied: string[]): Promise<void> {
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
    readRevPages(j.query?.pages ?? [], out, unapplied)
    console.log(`  content ${Math.min(i + BATCH, titles.length)}/${titles.length}`)
  }
}

function main(): void {
  void run()
}

interface MobsFile {
  scrapedAt: string
  source: string
  mobs: { page: string }[]
}

async function run(): Promise<void> {
  const itemsFile = JSON.parse(readFileSync(ITEMS_PATH, 'utf8')) as ItemDbFile
  const mobsFile = JSON.parse(readFileSync(MOBS_PATH, 'utf8')) as MobsFile
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
  await applyDelta(itemsFile, mobsFile, changed)
}

async function applyDelta(itemsFile: ItemDbFile, mobsFile: MobsFile, changed: string[]): Promise<void> {
  const pages: PageTexts = new Map()
  const unapplied: string[] = []
  await fetchWikitext(changed, pages, unapplied)
  let itemFold = foldItems(itemsFile, pages)
  // A key whose last known claimant let go may still have a page of that name: read it and refold.
  const orphans = itemFold.orphans.filter((t) => !pages.has(t))
  if (orphans.length > 0) {
    console.log(`  ${orphans.length} item keys lost their holder; reading those titles`)
    await fetchWikitext(orphans, pages, unapplied)
    itemFold = foldItems(itemsFile, pages)
  }
  const now = new Date().toISOString()
  const distinctPages = new Set(Object.values(itemFold.items).map((e) => e.page)).size
  const itemsOut: ItemDbFile = {
    scrapedAt: nextScrapedAt(itemsFile.scrapedAt, unapplied, now),
    source: deltaSource(itemsFile.source),
    count: distinctPages,
    items: Object.fromEntries(
      Object.entries(itemFold.items).sort((a, b) => a[0].localeCompare(b[0]))
    )
  }
  const mobFold = foldMobs(mobsFile.mobs, pages)
  const mobsOut = {
    scrapedAt: nextScrapedAt(mobsFile.scrapedAt, unapplied, now),
    source: deltaSource(mobsFile.source),
    mobs: [...mobFold.byPage.values()].sort((a, b) => a.page.localeCompare(b.page))
  }

  writeAtomic(ITEMS_PATH, JSON.stringify(itemsOut))
  writeAtomic(MOBS_PATH, JSON.stringify(mobsOut))
  console.log(
    `\nFolded ${itemFold.folded} item pages and ${mobFold.folded} mob pages over the committed DBs.`
  )
  printRemoved('item', itemFold.removed)
  printRemoved('mob', mobFold.removed)
  console.log(`items.json count: ${itemsFile.count} → ${distinctPages}`)
  printStamp(unapplied)
  console.log(`Next: npm run gen:data-weight  (the ledger pins exact bytes)`)
  console.log(
    'Not refreshed by the delta: pageEra.json (npm run scrape:page-era), posky.json ' +
      '(npm run scrape:posky) and, where the build carries it, mobRaces.json (gen-mob-races.mts).'
  )
}

function deltaSource(source: string): string {
  return source.includes('delta') ? source : `${source} + recentchanges delta (scripts/scrape-delta.mts)`
}

/** Write beside, then rename: an interrupted run never leaves a truncated committed DB. */
function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

/** Moves and deletes, for the record: their titles were re-read like any edit. */
function printPageLogs(logs: PageLogEvent[]): void {
  if (logs.length === 0) return
  console.log(`  ${logs.length} ns0 move/delete log entries (applied by re-reading their titles):`)
  for (const l of logs) {
    console.log(`    ${l.logtype}/${l.logaction}: ${l.title}${l.target ? ` → ${l.target}` : ''}`)
  }
}

function printRemoved(kind: string, pages: string[]): void {
  if (pages.length === 0) return
  console.log(`  ${pages.length} ${kind} pages removed (gone, a redirect, or no ${kind} page now):`)
  console.log(`    ${pages.join(' | ')}`)
}

function printStamp(unapplied: string[]): void {
  if (unapplied.length === 0) {
    console.log('Both scrapedAt → now.')
    return
  }
  console.log(
    `scrapedAt NOT moved: ${unapplied.length} changed pages came back without readable content ` +
      `(a hidden revision?), so the next run covers this window again: ${unapplied.join(' | ')}`
  )
}

if ((process.argv[1] ?? '').endsWith('scrape-delta.mts')) main()
