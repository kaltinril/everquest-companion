// scrape-delta's item fold keeps scrape-items.ts's key law: a page's title key is its own, an
// `|itemname` alias takes a key no page is titled with, every key a change touches is re-awarded.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldRcRow, type PageLogEvent, type RcRow } from '../scripts/scrape-delta.mts'
import { foldItems } from '../scripts/sources/deltaItems'
import { itemKey, type ItemDbEntry, type ItemDbFile } from '../src/main/itemsDb'

const CANON: ItemDbEntry = {
  page: 'A Sealed Letter',
  statsBlock: 'QUEST ITEM  NO TRADE  WT: 0.1 Size: SMALL',
  iconId: 708
}
const VARIANT = 'A Sealed Letter (Thex Dagger Quest)'

function file(entries: ItemDbEntry[]): ItemDbFile {
  const items: Record<string, ItemDbEntry> = {}
  for (const e of entries) {
    items[itemKey(e.page) ?? ''] = e
    if (e.name) items[itemKey(e.name) ?? ''] = e
  }
  return { scrapedAt: '2026-09-01T00:00:00.000Z', source: 'test', count: entries.length, items }
}

const page = (fields: string): string => `{{Itempage\n${fields}\n}}`

/** Fold over `f` in place, the way the run writes the result. */
function fold(f: ItemDbFile, pages: Map<string, string>): ReturnType<typeof foldItems> {
  const r = foldItems(f, pages)
  f.items = r.items
  return r
}

test('an edited variant page does not repoint the canonical key its |itemname names', () => {
  const f = file([CANON])
  const variant = page('|itemname=A Sealed Letter\n|lucy_img_ID=708')
  const { folded: n } = fold(f, new Map([[VARIANT, variant]]))
  assert.equal(n, 1)
  assert.equal(f.items[itemKey(CANON.page) ?? ''], CANON)
  assert.equal(f.items[itemKey(VARIANT) ?? '']?.page, VARIANT)
})

test("a page's newer revision replaces its own keys even when it is poorer", () => {
  const f = file([CANON])
  fold(f, new Map([[CANON.page, page('|lucy_img_ID=709')]]))
  const now = f.items[itemKey(CANON.page) ?? '']
  assert.equal(now?.page, CANON.page)
  assert.equal(now?.statsBlock, undefined)
})

test('a richer record still wins a key held by another page', () => {
  const thin: ItemDbEntry = { page: 'Cyclops skull', iconId: 1 }
  const f = file([thin])
  const richPage = page('|statsblock=MAGIC ITEM  WT: 1.0\n|lucy_img_ID=2')
  fold(f, new Map([['Cyclops Skull', richPage]]))
  assert.equal(f.items[itemKey('Cyclops skull') ?? '']?.page, 'Cyclops Skull')
})

test("an edited page's old |itemname key is dropped, another page's key is not", () => {
  const renamed: ItemDbEntry = { page: 'Rusty Thing (quest)', name: 'Old Name', iconId: 3 }
  const other: ItemDbEntry = { page: 'Bystander', iconId: 4 }
  const f = file([renamed, other])
  fold(f, new Map([[renamed.page, page('|itemname=New Name\n|lucy_img_ID=3')]]))
  assert.equal(f.items[itemKey('Old Name') ?? ''], undefined)
  assert.equal(f.items[itemKey('New Name') ?? '']?.page, renamed.page)
  assert.equal(f.items[itemKey('Bystander') ?? ''], other)
})

test('a key a changed page stops naming goes to the unchanged page that still claims it', () => {
  // The wiki's Armadillo Tail page carried |itemname=Armadillo Tooth, a typo, and held that key.
  const tail: ItemDbEntry = { page: 'Armadillo Tail', name: 'Armadillo Tooth', iconId: 5 }
  const tooth: ItemDbEntry = { page: 'Armadillo Tooth', name: 'Tooth of an Armadillo', iconId: 6 }
  const f = file([tooth, tail])
  assert.equal(f.items['armadillo tooth'], tail)
  const { orphans } = fold(f, new Map([[tail.page, page('|lucy_img_ID=5')]]))
  assert.equal(f.items['armadillo tooth'], tooth)
  assert.deepEqual(orphans, [])
})

test('a key with no known claimant left is dropped and its name is offered for a read', () => {
  const tail: ItemDbEntry = { page: 'Armadillo Tail', name: 'Armadillo Tooth', iconId: 5 }
  const f = file([tail])
  const edited = page('|lucy_img_ID=5')
  const first = foldItems(f, new Map([[tail.page, edited]]))
  assert.equal(first.items['armadillo tooth'], undefined)
  assert.deepEqual(first.orphans, ['Armadillo Tooth'])
  const tooth = page('|lucy_img_ID=6')
  const second = foldItems(f, new Map([[tail.page, edited], ['Armadillo Tooth', tooth]]))
  assert.equal(second.items['armadillo tooth']?.page, 'Armadillo Tooth')
  assert.equal(f.items['armadillo tooth'], tail, 'the committed file is not mutated')
})

test('a page titled with a key takes it back from an edited alias holder, however rich', () => {
  const quest: ItemDbEntry = { page: 'Rusty Dagger (quest)', name: 'Rusty Dagger', iconId: 7 }
  const real: ItemDbEntry = { page: 'Rusty Dagger', name: 'RD', iconId: 8 }
  const f = file([real, quest])
  const rich = page('|itemname=Rusty Dagger\n|lucy_img_ID=7\n|statsblock=MAGIC ITEM  WT: 1.0')
  fold(f, new Map([[quest.page, rich]]))
  assert.equal(f.items['rusty dagger'], real)
  assert.equal(f.items['rusty dagger (quest)']?.page, quest.page)
})

test('an edited case-variant page that is now poorer loses its key to the richer variant', () => {
  const rich: ItemDbEntry = { page: 'Cyclops skull', name: 'Skull of a Cyclops', iconId: 1 }
  const edited: ItemDbEntry = { page: 'Cyclops Skull', iconId: 2, statsBlock: 'MAGIC ITEM WT: 1' }
  const f = file([rich, edited])
  assert.equal(f.items['cyclops skull'], edited)
  fold(f, new Map([['Cyclops Skull', page('|lucy_img_ID=2')]]))
  assert.equal(f.items['cyclops skull'], rich)
})

test('equal claimants of a key go to the first title in sort order', () => {
  const a: ItemDbEntry = { page: 'Bone Chips', name: 'X1', iconId: 1 }
  const f = file([a])
  fold(f, new Map([['Bone chips', page('|itemname=X2\n|lucy_img_ID=1')]]))
  const first = ['Bone Chips', 'Bone chips'].sort((x, y) => x.localeCompare(y))[0]
  assert.equal(f.items['bone chips']?.page, first)
})

test('recentchanges rows: edits are fetched, moves and deletes are only listed', () => {
  const seen = new Set<string>()
  const logs: PageLogEvent[] = []
  const rows: RcRow[] = [
    { type: 'edit', title: 'Cyclops Skull' },
    { type: 'new', title: 'Brand New Item' },
    {
      type: 'log',
      title: 'Old Title',
      logtype: 'move',
      logaction: 'move',
      logparams: { target_title: 'New Title' }
    },
    { type: 'log', title: 'Gone Page', logtype: 'delete', logaction: 'delete' },
    { type: 'log', title: 'Someone', logtype: 'newusers', logaction: 'create' }
  ]
  for (const rc of rows) foldRcRow(rc, seen, logs)
  assert.deepEqual([...seen], ['Cyclops Skull', 'Brand New Item'])
  assert.deepEqual(logs, [
    { logtype: 'move', logaction: 'move', title: 'Old Title', target: 'New Title' },
    { logtype: 'delete', logaction: 'delete', title: 'Gone Page', target: undefined }
  ])
})
