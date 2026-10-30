// scrape-delta's never-listed pages (owner, 2026-10-29): a wiki page our scrape never listed and nobody
// has edited since is in no change feed, so `--titles-from-compare` / `--extra` read it by title, in
// the same 50-a-request batches, and fold it like an edit. Stubbed wiki; no request leaves the process.
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { deltaPaths, parseArgs, run, type DeltaPaths } from '../scripts/scrape-delta.mts'
import { pacing } from '../scripts/sources/deltaApi'
import { addExtra, compareTitles, extraReport } from '../scripts/sources/deltaExtra'
import { emptyFeed, foldRcRow } from '../scripts/sources/deltaPages'

const STAMP = '2026-10-28T00:00:00.000Z'
const SHIELD = '{{Classic Era}}\n<onlyinclude>{{Itempage\n|itemname = Cracked Darkwood Shield\n|lucy_img_ID = 805\n|statsblock = \nSlot: SECONDARY<br>\nAC: 12<br>\n}}</onlyinclude>'
const LIVE: Record<string, { pageid: number; content: string }> = {
  'Cracked Darkwood Shield': { pageid: 900, content: SHIELD },
  'Drake lava powder': { pageid: 901, content: 'Drops from fire drakes in Lavastorm. Used in tinkering.' },
  'Old Item': { pageid: 902, content: '{{Itempage\n|lucy_img_ID=8\n}}' }
}

function wiki(calls: URLSearchParams[]) {
  return async (url: string | URL): Promise<Response> => {
    const q = new URL(String(url)).searchParams
    calls.push(q)
    if (q.get('list') === 'recentchanges') {
      const rows = q.get('rcdir') === 'newer' ? [{ timestamp: '2026-08-01T00:00:00Z' }] : []
      return new Response(JSON.stringify({ query: { recentchanges: rows } }))
    }
    const pages = (q.get('titles')?.split('|') ?? []).map((title) => {
      const p = LIVE[title]
      return p ? { pageid: p.pageid, ns: 0, title, revisions: [{ revid: 1, slots: { main: { content: p.content } } }] } : { title, ns: 0, missing: true }
    })
    return new Response(JSON.stringify({ query: { pages } }))
  }
}

function put(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

function seed(t: TestContext): { p: DeltaPaths; calls: URLSearchParams[]; out: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'scrape-delta-extra-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const calls: URLSearchParams[] = []
  const out: string[] = []
  pacing.delayMs = 0
  t.mock.method(globalThis, 'fetch', wiki(calls))
  t.mock.method(console, 'log', (line: unknown) => out.push(String(line)))
  const p = deltaPaths(root)
  put(p.items, JSON.stringify({ scrapedAt: STAMP, source: 'test', count: 1, items: { 'old item': { page: 'Old Item', iconId: 8 } } }))
  put(p.mobs, JSON.stringify({ scrapedAt: STAMP, source: 'test', mobs: [] }))
  return { p, calls, out }
}

const contentReads = (calls: URLSearchParams[]): URLSearchParams[] => calls.filter((q) => q.get('prop') === 'revisions')

test('--titles-from-compare reads the newest report\'s never-listed pages in one batch and folds the item page', async (t) => {
  const { p, calls, out } = seed(t)
  const eoz = join(p.root, 'scripts/sources/cache/eoz')
  // An older report, then the newest: only the newest is read.
  put(join(eoz, 'report-old.json'), JSON.stringify({ toRead: { items: ['Stale Title'], linked: [], mobs: [] } }))
  put(join(eoz, 'report-new.json'), JSON.stringify({ toRead: { items: ['Drake lava powder'], linked: ['Cracked Darkwood Shield', 'Old Item'], mobs: [] } }))
  const later = new Date(Date.now() + 5000)
  utimesSync(join(eoz, 'report-new.json'), later, later)
  await run(p, parseArgs(['--titles-from-compare']))

  const reads = contentReads(calls)
  assert.equal(reads.length, 1, 'every extra title in one request')
  assert.deepEqual(reads[0].get('titles')?.split('|').sort(), ['Cracked Darkwood Shield', 'Drake lava powder'], 'a page items.json holds is not read')
  const items = (JSON.parse(readFileSync(p.items, 'utf8')) as { items: Record<string, { page: string; iconId?: number }>; scrapedAt: string })
  assert.equal(items.items['cracked darkwood shield']?.page, 'Cracked Darkwood Shield')
  assert.equal(items.items['cracked darkwood shield']?.iconId, 805)
  assert.ok(!Object.values(items.items).some((e) => /drake/i.test(e.page)), 'free text is not folded')
  assert.notEqual(items.scrapedAt, STAMP)
  assert.ok(out.includes('  Cracked Darkwood Shield: folded'))
  assert.ok(out.includes('  Drake lava powder: no item or mob template: kept as a page, not folded (fix it on the wiki if it is one)'))
})

test('--extra names titles by hand; a dry run reads the feed only and counts them', async (t) => {
  const { p, calls } = seed(t)
  await run(p, parseArgs(['--dry-run', '--extra=Cracked Darkwood Shield|Nowhere Page']))
  assert.equal(contentReads(calls).length, 0)
  assert.ok(calls.every((q) => q.get('list') === 'recentchanges'))
  assert.equal(JSON.parse(readFileSync(p.items, 'utf8')).scrapedAt, STAMP)
})

test('a missing extra page is named, and holds no stamp back', async (t) => {
  const { p, out } = seed(t)
  await run(p, parseArgs(['--extra=Nowhere Page']))
  assert.ok(out.includes('  Nowhere Page: no such page'))
  assert.notEqual(JSON.parse(readFileSync(p.items, 'utf8')).scrapedAt, STAMP)
})

test('without --titles-from-compare or --extra no title is read', async (t) => {
  const { p, calls } = seed(t)
  await run(p, parseArgs([]))
  assert.equal(contentReads(calls).length, 0)
})

test('the options, an older report shape, and a title the feed already names', () => {
  const o = parseArgs(['--titles-from-compare=C:/r.json', '--extra=A|B', '--extra=C'])
  assert.equal(o.fromCompare, 'C:/r.json')
  assert.deepEqual(o.extra, ['A', 'B', 'C'])
  assert.equal(parseArgs([]).fromCompare, null)
  const dir = mkdtempSync(join(tmpdir(), 'delta-extra-'))
  try {
    const old = join(dir, 'report-old.json')
    writeFileSync(old, JSON.stringify({ items: { missingUnlisted: ['X'] }, mobs: { missingUnlisted: ['Y'] } }))
    assert.deepEqual(compareTitles(old), ['X', 'Y'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const feed = emptyFeed()
  foldRcRow({ type: 'edit', title: 'Edited', pageid: 5, timestamp: '2026-10-28T01:00:00Z' }, feed)
  addExtra(feed, ['Edited', 'Never Listed'], '2026-10-29T00:00:00Z')
  assert.deepEqual([...feed.titles], ['Never Listed'])
  assert.deepEqual(extraReport(['Moved'], new Map([['Moved', '#REDIRECT [[X]]']]), new Set()), ['Extra titles (never listed by our scrape):', '  Moved: a redirect, landing on no mob'])
})
