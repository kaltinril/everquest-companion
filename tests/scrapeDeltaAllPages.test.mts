// scrape-delta --all-pages (owner, 2026-10-29: "we should scrape EVERY page, regardless of the 'template'
// it uses"): every ns0 article is listed, each page no cache or DB holds is read once, a page with a
// known template folds as before, every other page is kept raw and indexed, and the feed keeps them
// current. Stubbed wiki; no request leaves the process.
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { deltaPaths, parseArgs, run, type DeltaPaths } from '../scripts/scrape-delta.mts'
import { pacing } from '../scripts/sources/deltaApi'
import { categoriesOf, neverRead, otherPages, PAGE_INDEX, pageIndex } from '../scripts/sources/deltaAllPages'

const STAMP = '2026-10-28T00:00:00.000Z'
const ITEM = (icon: number): string => `{{Itempage\n|lucy_img_ID = ${icon}\n|statsblock = \nSlot: SECONDARY<br>\n}}`
const ZONE = '{{Zonepage}}\nA gnoll hold.\n[[Category:Zones]]\n[[Category:Loc Mapped|H]]'
const POWDER = 'Drops from fire drakes.\n[[Category:Lavastorm Mountains]]'

interface Page {
  pageid: number
  title: string
  revid: number
  content: string
}

/** The wiki now; `feed` is what the change feed answers. */
interface Wiki {
  pages: Page[]
  feed: object[]
}

function stub(w: Wiki, calls: URLSearchParams[]) {
  return async (url: string | URL): Promise<Response> => {
    const q = new URL(String(url)).searchParams
    calls.push(q)
    const json = (body: object): Response => new Response(JSON.stringify(body))
    if (q.get('list') === 'recentchanges') {
      if (q.get('rcdir') === 'newer') return json({ query: { recentchanges: [{ timestamp: '2026-08-01T00:00:00Z' }] } })
      return json({ query: { recentchanges: q.get('rcnamespace') === '0' ? w.feed : [] } })
    }
    if (q.get('list') === 'allpages') {
      // Two answers: the list continues once, as a real one does every 500.
      const all = w.pages.map((p) => ({ pageid: p.pageid, ns: 0, title: p.title }))
      const second = q.get('apcontinue') === 'M'
      return json({ query: { allpages: second ? all.slice(2) : all.slice(0, 2) }, ...(second ? {} : { continue: { apcontinue: 'M' } }) })
    }
    const ids = q.get('pageids')?.split('|').map(Number) ?? []
    const pages = ids.map((id) => {
      const p = w.pages.find((x) => x.pageid === id)
      return p ? { pageid: id, ns: 0, title: p.title, revisions: [{ revid: p.revid, slots: { main: { content: p.content } } }] } : { pageid: id, missing: true }
    })
    return json({ query: { pages } })
  }
}

function put(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

/** items.json and the item cache hold Old Item; the mob cache holds A gnoll. */
function seed(t: TestContext, w: Wiki): { p: DeltaPaths; calls: URLSearchParams[] } {
  const root = mkdtempSync(join(tmpdir(), 'scrape-delta-all-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const calls: URLSearchParams[] = []
  pacing.delayMs = 0
  t.mock.method(globalThis, 'fetch', stub(w, calls))
  t.mock.method(console, 'log', () => undefined)
  t.mock.method(console, 'warn', () => undefined)
  const p = deltaPaths(root)
  put(p.items, JSON.stringify({ scrapedAt: STAMP, source: 'test', count: 1, items: { 'old item': { page: 'Old Item', iconId: 8 } } }))
  put(p.mobs, JSON.stringify({ scrapedAt: STAMP, source: 'test', mobs: [] }))
  put(join(p.itemCache, 'batch-1-50.json'), JSON.stringify([{ pageid: 1, ns: 0, title: 'Old Item', revisions: [{ slots: { main: { content: ITEM(8) } } }] }]))
  put(join(p.mobCache, 'mob-pages.json'), JSON.stringify([{ pageid: 2, ns: 0, title: 'A gnoll' }]))
  return { p, calls }
}

const LIVE = (): Page[] => [
  { pageid: 1, title: 'Old Item', revid: 10, content: ITEM(8) },
  { pageid: 2, title: 'A gnoll', revid: 20, content: '{{Namedmobpage}}' },
  { pageid: 900, title: 'Cracked Darkwood Shield', revid: 90, content: ITEM(805) },
  { pageid: 901, title: 'Drake lava powder', revid: 91, content: POWDER },
  { pageid: 902, title: 'Highpass Hold', revid: 92, content: ZONE }
]

const json = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const contentIds = (calls: URLSearchParams[]): string[][] => calls.filter((q) => q.get('prop') === 'revisions').map((q) => q.get('pageids')?.split('|') ?? [])

test('--all-pages lists every article, reads only the never-read ones in one batch, folds items and keeps the rest', async (t) => {
  const w: Wiki = { pages: LIVE(), feed: [] }
  const { p, calls } = seed(t, w)
  await run(p, parseArgs(['--all-pages']))

  assert.equal(calls.filter((q) => q.get('list') === 'allpages').length, 2)
  assert.ok(calls.filter((q) => q.get('list') === 'allpages').every((q) => q.get('apfilterredir') === 'nonredirects' && q.get('aplimit') === '500'))
  assert.deepEqual(contentIds(calls), [['900', '901', '902']], 'held pages are not read; the rest in one request')

  const items = json<{ items: Record<string, { page: string }> }>(p.items).items
  assert.equal(items['cracked darkwood shield']?.page, 'Cracked Darkwood Shield')
  assert.deepEqual(json<{ pageid: number; title: string }[]>(join(p.pageCache, 'pages.json')), [
    { pageid: 901, title: 'Drake lava powder' },
    { pageid: 902, title: 'Highpass Hold' }
  ])
  assert.equal(readFileSync(join(p.pageCache, 'page-901.wikitext'), 'utf8'), POWDER)
  assert.ok(!existsSync(join(p.pageCache, 'page-900.wikitext')), 'an item page folds into items.json, not the page cache')
  assert.deepEqual(json<{ revs: Record<string, number> }>(join(p.pageCache, 'index.json')).revs, { 901: 91, 902: 92 })
  const index = json<{ count: number; pages: { title: string; categories: string[] }[] }>(join(p.root, PAGE_INDEX))
  assert.deepEqual(index.pages, [
    { title: 'Drake lava powder', categories: ['Lavastorm Mountains'] },
    { title: 'Highpass Hold', categories: ['Zones', 'Loc Mapped'] }
  ])
})

test('after it the feed keeps the page cache current: an unchanged revision is skipped, a page that became an item leaves', async (t) => {
  const w: Wiki = { pages: LIVE(), feed: [] }
  const { p, calls } = seed(t, w)
  await run(p, parseArgs(['--all-pages']))
  const indexBefore = readFileSync(join(p.root, PAGE_INDEX), 'utf8')
  calls.length = 0
  // Drake lava powder gains an item box; Highpass Hold's row carries the revision we hold.
  w.pages = w.pages.map((x) => (x.pageid === 901 ? { ...x, revid: 95, content: ITEM(1076) } : x))
  // After the first run's stamp, so inside every window.
  const at = new Date(Date.now() + 60_000).toISOString()
  w.feed = [
    { type: 'edit', title: 'Drake lava powder', pageid: 901, revid: 95, timestamp: at },
    { type: 'edit', title: 'Highpass Hold', pageid: 902, revid: 92, timestamp: at }
  ]
  await run(p, parseArgs([]))
  assert.equal(calls.filter((q) => q.get('list') === 'allpages').length, 0, 'a normal delta lists nothing')
  assert.deepEqual(contentIds(calls), [['901']])
  assert.ok(Object.values(json<{ items: Record<string, { page: string }> }>(p.items).items).some((e) => e.page === 'Drake lava powder'))
  assert.deepEqual(json<{ title: string }[]>(join(p.pageCache, 'pages.json')).map((x) => x.title), ['Highpass Hold'])
  assert.ok(!existsSync(join(p.pageCache, 'page-901.wikitext')))
  assert.notEqual(readFileSync(join(p.root, PAGE_INDEX), 'utf8'), indexBefore)
  assert.deepEqual(json<{ pages: { title: string }[] }>(join(p.root, PAGE_INDEX)).pages.map((x) => x.title), ['Highpass Hold'])
})

test('a dry run with --all-pages lists nothing', async (t) => {
  const { p, calls } = seed(t, { pages: LIVE(), feed: [] })
  await run(p, parseArgs(['--dry-run', '--all-pages']))
  assert.ok(calls.every((q) => q.get('list') === 'recentchanges'))
  assert.ok(!existsSync(p.pageCache))
})

test('the pure halves: never-read pages, categories, the index, the pages kept', () => {
  const held = { ids: new Set([1]), titles: new Set(['Old Title']) }
  assert.deepEqual(neverRead([{ pageid: 1, title: 'A' }, { pageid: 2, title: 'Old Title' }, { pageid: 3, title: 'New' }], held), [{ pageid: 3, title: 'New' }])
  assert.deepEqual(categoriesOf('[[Category:Zones]] [[ category : Loc_Mapped |H]] [[Category:Zones]]'), ['Zones', 'Loc Mapped'])
  const texts: [string, string][] = [['B', 'x [[Category:C]]'], ['A', '#REDIRECT [[B]]'], ['Item', ITEM(1)], ['B', 'older copy']]
  assert.deepEqual(pageIndex(texts, (t) => t === 'Item'), [{ title: 'B', categories: ['C'] }])
  assert.deepEqual([...otherPages(new Map([['A', '#REDIRECT [[B]]'], ['B', 'text'], ['C', null], ['D', 'folded']]), new Set(['D']))], ['B'])
})
