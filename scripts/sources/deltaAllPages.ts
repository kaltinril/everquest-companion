// deltaAllPages.ts — every ns0 article, whatever template it uses (owner, 2026-10-29: "we should scrape
// EVERY page, regardless of the 'template' it uses"). `--all-pages` lists them (list=allpages, 500 a
// request, redirects left to the redirect cache) and reads each page no cache or DB holds, by pageid
// with the feed's own reads; after that the feed re-reads any page when it is edited. A page with a
// known template folds where it always has. Every other page's text is kept in the committed page
// cache (`cache/pages`: pages.json, page-<id>.wikitext, index.json revids), and every page no DB keys
// is listed in PAGE_INDEX with the categories its own text writes, so the app can know it exists.
// Nothing is parsed into a record from free text.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { listAllPages } from './deltaApi'
import { CLASS_PAGES, type FeedChanges, type PageIds, type PageTexts } from './deltaPages'
import { readRevIndex, recordRevs, writeRevIndex } from './revIndex'

export const PAGE_CACHE = 'scripts/sources/cache/pages'
export const PAGE_INDEX = 'src/main/data/wikiPages.json'
export const PAGE_LIST = 'pages.json'
const DROP_GROUP_PAGES = 'scripts/sources/cache/drop-groups/pages.json'
const CLASS_CACHE = 'scripts/sources/cache/classes'

interface Listed {
  pageid: number
  title: string
}

const readJson = <T>(path: string, empty: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : empty)

function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

/** Every page of the item cache's batch files (gitignored; read where the run tree has it). */
function itemCachePages(dir: string): { pageid?: number; title?: string; ns?: number; text?: string }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.startsWith('batch-'))
    .flatMap((n) => readJson<{ pageid?: number; title?: string; ns?: number; revisions?: { slots?: { main?: { content?: string } } }[] }[]>(join(dir, n), []))
    .map((p) => ({ pageid: p.pageid, title: p.title, ns: p.ns, text: p.revisions?.[0]?.slots?.main?.content }))
}

/** What some cache or DB already holds, by pageid and by title. */
export interface HeldSet {
  ids: Set<number>
  titles: Set<string>
}

/** The DBs' own pages (titles and ids, as scrape-delta's Known has them). */
export interface Keyed {
  itemPages: ReadonlySet<string>
  mobPages: ReadonlySet<string>
  spellIds: ReadonlySet<number>
  spellTitles: ReadonlySet<string>
  questIds: ReadonlySet<number>
  questTitles: ReadonlySet<string>
}

export function heldSet(root: string, k: Keyed): HeldSet {
  const ids = new Set<number>([...k.spellIds, ...k.questIds])
  for (const p of itemCachePages(resolve(root, 'scripts/sources/cache/items'))) if (p.pageid) ids.add(p.pageid)
  for (const list of ['scripts/sources/cache/mobs/mob-pages.json', `${PAGE_CACHE}/${PAGE_LIST}`]) {
    for (const p of readJson<Listed[]>(resolve(root, list), [])) ids.add(p.pageid)
  }
  const groups = readJson<{ title: string }[]>(resolve(root, DROP_GROUP_PAGES), []).map((g) => g.title)
  const titles = new Set([...k.itemPages, ...k.mobPages, ...k.spellTitles, ...k.questTitles, ...CLASS_PAGES, ...groups])
  return { ids, titles }
}

/** The listed pages no cache or DB holds. */
export const neverRead = (listed: Listed[], held: HeldSet): Listed[] => listed.filter((p) => !held.ids.has(p.pageid) && !held.titles.has(p.title))

/** Into the feed as pages edited `at`, read by pageid with the feed's own edits; a page the feed names keeps its row. */
export function addPages(feed: FeedChanges, pages: Listed[], at: string): void {
  for (const p of pages) {
    if (feed.pageids.has(p.pageid)) continue
    feed.pageids.add(p.pageid)
    feed.named.add(p.title)
    feed.pageTitle.set(p.pageid, p.title)
    feed.pageTime.set(p.pageid, at)
  }
}

/** `--all-pages`: list every article and add the never-read ones to the feed. A dry run lists nothing and says what a run costs. */
export async function addAllPages(root: string, k: Keyed, feed: FeedChanges, dry: boolean): Promise<void> {
  if (dry) {
    console.log('--all-pages: a real run lists every ns0 article first (~23k, ~45 requests at 500 a request), then reads the never-read ones by pageid (50 a request).')
    return
  }
  console.log('Listing every ns0 article (list=allpages, redirects left out, 500 a request)…')
  const listed = await listAllPages()
  const never = neverRead(listed, heldSet(root, k))
  console.log(`  ${listed.length} articles; ${never.length} no cache or DB holds: read now`)
  addPages(feed, never, new Date().toISOString())
}

/** The read pages that are no redirect and fold into no DB: kept in the page cache. */
export function otherPages(pages: PageTexts, folded: ReadonlySet<string>): Set<string> {
  return new Set([...pages].filter(([t, wt]) => wt != null && !folded.has(t) && !/^\s*#REDIRECT/i.test(wt)).map(([t]) => t))
}

/**
 * The page cache under `dir`: each kept page's text written and listed (by pageid, so a move renames
 * it); a dropped title (gone, a redirect now, or folded into a DB) leaves the list, its file and its revid.
 * The revids of kept pages are recorded with the item and mob caches' (deltaSkip.recordCacheRevs).
 */
export function writePageCache(dir: string, reads: PageIds & { pages: PageTexts }, keep: ReadonlySet<string>, drop: ReadonlySet<string>): number {
  const read = readJson<Listed[]>(join(dir, PAGE_LIST), [])
  const dropped = read.filter((p) => drop.has(p.title) && !keep.has(p.title))
  const list = read.filter((p) => !dropped.includes(p))
  let n = 0
  for (const title of keep) {
    const pageid = reads.pageids.get(title)
    const text = reads.pages.get(title)
    if (pageid === undefined || text == null) continue
    mkdirSync(dir, { recursive: true })
    writeAtomic(join(dir, `page-${String(pageid)}.wikitext`), text)
    const at = list.find((p) => p.pageid === pageid)
    if (at) at.title = title
    else list.push({ pageid, title })
    n++
  }
  for (const p of dropped) rmSync(join(dir, `page-${String(p.pageid)}.wikitext`), { force: true })
  if (n === 0 && dropped.length === 0) return 0
  list.sort((a, b) => a.pageid - b.pageid)
  writeAtomic(join(dir, PAGE_LIST), `[\n${list.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`)
  if (dropped.length > 0) {
    const idx = readRevIndex(dir)
    recordRevs(idx, [], dropped.map((p) => p.pageid))
    writeRevIndex(dir, idx, new Date().toISOString())
  }
  return n
}

/** The categories a page's own text writes (`[[Category:X]]`, `[[Category:X|sort]]`), once each, in order. */
export function categoriesOf(wt: string): string[] {
  const out = [...wt.matchAll(/\[\[\s*Category\s*:\s*([^\]|]+?)\s*(?:\|[^\]]*)?\]\]/gi)].map((m) => m[1].replace(/_/g, ' '))
  return [...new Set(out)]
}

export interface PageIndexEntry {
  title: string
  categories: string[]
}

/** Every held page no DB keys and no redirect, first text per title winning, sorted by title. */
export function pageIndex(texts: Iterable<[string, string]>, keyed: (title: string) => boolean): PageIndexEntry[] {
  const out = new Map<string, PageIndexEntry>()
  for (const [title, wt] of texts) {
    if (out.has(title) || keyed(title) || /^\s*#REDIRECT/i.test(wt)) continue
    out.set(title, { title, categories: categoriesOf(wt) })
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/** Every held text by title: the page cache first (newest), then the item cache, drop groups and class pages. */
function* heldTexts(root: string): Generator<[string, string]> {
  const dir = resolve(root, PAGE_CACHE)
  for (const p of readJson<Listed[]>(join(dir, PAGE_LIST), [])) {
    const file = join(dir, `page-${String(p.pageid)}.wikitext`)
    if (existsSync(file)) yield [p.title, readFileSync(file, 'utf8')]
  }
  for (const p of itemCachePages(resolve(root, 'scripts/sources/cache/items'))) {
    if (p.title && p.text != null && (p.ns ?? 0) === 0) yield [p.title, p.text]
  }
  for (const g of readJson<{ title: string; content?: string }[]>(resolve(root, DROP_GROUP_PAGES), [])) if (g.content != null) yield [g.title, g.content]
  for (const title of CLASS_PAGES) {
    const file = resolve(root, CLASS_CACHE, `${title.replace(/[^A-Za-z0-9]+/g, '_')}.wikitext`)
    if (existsSync(file)) yield [title, readFileSync(file, 'utf8')]
  }
}

/** PAGE_INDEX's entries from the caches under `root`. */
export const pageIndexAt = (root: string, keyed: (title: string) => boolean): PageIndexEntry[] => pageIndex(heldTexts(root), keyed)

/** The pages a DB keys, as written: items, mobs, spells, quests, and every known redirect. */
export function keyedOnDisk(root: string): (title: string) => boolean {
  const at = (p: string): string => resolve(root, p)
  const items = readJson<{ items: Record<string, { page: string }> }>(at('src/main/data/items.json'), { items: {} })
  const mobs = readJson<{ mobs: { page: string }[] }>(at('src/renderer/src/data/eqlegends/mobs.json'), { mobs: [] })
  const spells = readJson<{ titles?: Record<string, string> }>(at('scripts/sources/cache/spells/index.json'), {})
  const quests = readJson<Listed[]>(at('scripts/sources/cache/quests/quest-pages.json'), [])
  const redirects = readJson<{ redirects: { from: string }[] }>(at('scripts/sources/cache/redirects/redirects.json'), { redirects: [] })
  const keyed = new Set([
    ...Object.values(items.items).map((e) => e.page),
    ...mobs.mobs.map((m) => m.page),
    ...Object.values(spells.titles ?? {}),
    ...quests.map((q) => q.title),
    ...redirects.redirects.map((r) => r.from)
  ])
  return (title) => keyed.has(title)
}

/**
 * PAGE_INDEX rebuilt from the caches (zero requests): every held page no DB keys (`keyed`). Needs the
 * item cache, which holds most of them; without it the index is left as it is and named stale.
 */
export function writePageIndex(root: string, keyed: (title: string) => boolean): boolean {
  if (!existsSync(resolve(root, 'scripts/sources/cache/items'))) {
    console.log(`${PAGE_INDEX} not rebuilt: no scripts/sources/cache/items in this checkout`)
    return false
  }
  const pages = pageIndexAt(root, keyed)
  const path = resolve(root, PAGE_INDEX)
  if (JSON.stringify(readJson<{ pages?: unknown }>(path, {}).pages) === JSON.stringify(pages)) {
    console.log(`${PAGE_INDEX}: ${pages.length} pages no DB keys, unchanged`)
    return true
  }
  const body = pages.map((p) => JSON.stringify(p)).join(',\n')
  const head = { scrapedAt: new Date().toISOString(), source: 'eqlwiki.com ns0 pages no other DB keys (scripts/sources/deltaAllPages.ts)', count: pages.length }
  writeAtomic(path, `${JSON.stringify(head).slice(0, -1)},"pages":[\n${body}\n]}\n`)
  console.log(`${PAGE_INDEX}: ${pages.length} pages no DB keys`)
  return true
}
