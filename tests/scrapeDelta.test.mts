// scrape-delta's item fold keeps scrape-items.ts's key law: a key changes hands only to its own
// page's newer revision or to a richer record, and an edited page's stale `|itemname` key goes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldItems, foldRcRow, type PageLogEvent, type RcRow } from '../scripts/scrape-delta.mts'
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

test('an edited variant page does not repoint the canonical key its |itemname names', () => {
  const f = file([CANON])
  const n = foldItems(f, new Map([[VARIANT, page('|itemname=A Sealed Letter\n|lucy_img_ID=708')]]))
  assert.equal(n, 1)
  assert.equal(f.items[itemKey(CANON.page) ?? ''], CANON)
  assert.equal(f.items[itemKey(VARIANT) ?? '']?.page, VARIANT)
})

test("a page's newer revision replaces its own keys even when it is poorer", () => {
  const f = file([CANON])
  foldItems(f, new Map([[CANON.page, page('|lucy_img_ID=709')]]))
  const now = f.items[itemKey(CANON.page) ?? '']
  assert.equal(now?.page, CANON.page)
  assert.equal(now?.statsBlock, undefined)
})

test('a richer record still wins a key held by another page', () => {
  const thin: ItemDbEntry = { page: 'Cyclops skull', iconId: 1 }
  const f = file([thin])
  const richPage = page('|statsblock=MAGIC ITEM  WT: 1.0\n|lucy_img_ID=2')
  foldItems(f, new Map([['Cyclops Skull', richPage]]))
  assert.equal(f.items[itemKey('Cyclops skull') ?? '']?.page, 'Cyclops Skull')
})

test("an edited page's old |itemname key is dropped, another page's key is not", () => {
  const renamed: ItemDbEntry = { page: 'Rusty Thing (quest)', name: 'Old Name', iconId: 3 }
  const other: ItemDbEntry = { page: 'Bystander', iconId: 4 }
  const f = file([renamed, other])
  foldItems(f, new Map([[renamed.page, page('|itemname=New Name\n|lucy_img_ID=3')]]))
  assert.equal(f.items[itemKey('Old Name') ?? ''], undefined)
  assert.equal(f.items[itemKey('New Name') ?? '']?.page, renamed.page)
  assert.equal(f.items[itemKey('Bystander') ?? ''], other)
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
