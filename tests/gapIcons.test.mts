// An item page with no icon id is a Gaps row (owner, 2026-11-20: "another thing we need to add to
// the wiki gaps is items with missing lucy IDs like Dark Ironbound Tome ... our gaps page doesn't
// show us that"). The rule is shared/gapIcons.ts: an Items UPDATE row for a page the wiki data
// holds with no `|lucy_img_ID`, for the items the player has looted or holds, and nothing else.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iconAddText, iconButtons, iconKey, iconRows, iconWhy, type IconlessPage } from '../src/shared/gapIcons'
import { gapActions, type GapRow } from '../src/shared/gaps'
import { gapJob } from '../src/shared/gapJob'
import type { GapHeld, HeldIndex } from '../src/shared/gapHeld'
import type { LootEvent } from '../src/shared/types'
import { wikiPageText } from '../src/shared/wikiPage'
import { iconlessItems, iconlessPages } from '../src/main/gapItemIcons'
import type { ItemDbEntry } from '../src/main/itemsDb'

const TOME: IconlessPage = { name: 'Dark Ironbound Tome', page: 'Dark Ironbound Tome' }
const MEAT: IconlessPage = { name: 'Bat Meat', page: 'Bat Meat' }
const ICONLESS = [TOME, MEAT]
const NO_HELD: HeldIndex = new Map()

const AT = Date.UTC(2026, 10, 19, 22, 0, 0)
const loot = (item: string, over: Partial<LootEvent> = {}): LootEvent => ({ ts: AT, item, source: 'The Head Librarian', zone: 'Nektropos Castle', ...over })
const holder = (name: string, total = 1): GapHeld => ({ total, parts: [], exportedAt: '2026-11-19T23:00:00.000Z', exported: { name, slots: ['General 1'] } }) as unknown as GapHeld
const itemRow = (name: string): GapRow => ({ domain: 'item', name, kinds: ['looted'], count: 1, first: '', last: '', details: { samples: [] } })

test('a looted item whose page has no icon id is one Items update row, with where it came from', () => {
  const rows = iconRows(ICONLESS, { loot: [loot('Dark Ironbound Tome'), loot('Dark Ironbound Tome +2', { ts: AT + 60_000 }), loot('Cloak of Flames')], held: NO_HELD }, [])
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.domain, 'item')
  assert.equal(row.name, 'Dark Ironbound Tome')
  assert.deepEqual(row.kinds, ['looted'])
  // Two loots, one of a higher tier: an icon belongs to the item, not to a tier.
  assert.equal(row.count, 2)
  assert.deepEqual(row.iconUpdate, { page: 'Dark Ironbound Tome' })
  assert.deepEqual(row.details.zones?.all, ['Nektropos Castle'])
  assert.deepEqual(row.details.sources?.entries, [{ name: 'The Head Librarian', n: 2 }])
  assert.ok(row.first !== '' && row.first <= row.last, `${row.first} .. ${row.last}`)
  assert.equal(gapJob(row), 'update')
})

test('an item only an inventory export shows is a row too, and one both show is one row', () => {
  const held: HeldIndex = new Map([['bat meat', [holder('Bat Meat', 4)]]])
  const only = iconRows(ICONLESS, { loot: [], held: held }, [])
  assert.deepEqual(only.map((r) => [r.name, r.kinds, r.count]), [['Bat Meat', ['held'], 4]])
  const both = iconRows(ICONLESS, { loot: [loot('Bat Meat', { count: 2 })], held: held }, [])
  assert.deepEqual(both.map((r) => [r.name, r.kinds, r.count]), [['Bat Meat', ['held', 'looted'], 2]])
})

test('no evidence, no row: a page nobody here has met, or a page that has its icon', () => {
  assert.deepEqual(iconRows(ICONLESS, { loot: [], held: NO_HELD }, []), [])
  assert.deepEqual(iconRows(ICONLESS, { loot: [loot('Cloak of Flames')], held: NO_HELD }, []), [])
  assert.deepEqual(iconRows([], { loot: [loot('Dark Ironbound Tome')], held: NO_HELD }, []), [])
})

test('an item an Items row already names gets no second row', () => {
  assert.deepEqual(iconRows(ICONLESS, { loot: [loot('Dark Ironbound Tome')], held: NO_HELD }, [itemRow('dark ironbound tome +1')]), [])
  // A row of another domain with the same name is not the item's row.
  const mob: GapRow = { ...itemRow('Dark Ironbound Tome'), domain: 'mob' }
  assert.equal(iconRows(ICONLESS, { loot: [loot('Dark Ironbound Tome')], held: NO_HELD }, [mob]).length, 1)
})

test('the chip, the buttons and the copy say one thing: set the icon id on the item`s page', () => {
  const [row] = iconRows(ICONLESS, { loot: [loot('Dark Ironbound Tome')], held: NO_HELD }, [])
  const actions = gapActions(row, 'unchecked')
  assert.equal(actions.length, 1)
  assert.equal(actions[0].kind, 'addToWiki')
  assert.equal(actions[0].label, 'Add icon to item page')
  assert.equal(actions[0].why, iconWhy('Dark Ironbound Tome'))
  assert.ok(actions[0].why.includes('lucy_img_ID'))
  assert.ok(actions[0].href?.includes('Dark_Ironbound_Tome') || actions[0].href?.includes('Dark%20Ironbound%20Tome') || actions[0].href?.includes('Dark+Ironbound+Tome'), actions[0].href)
  assert.deepEqual(iconButtons({ page: 'Dark Ironbound Tome' }), { edit: 'Edit item page', page: 'Dark Ironbound Tome', copyTip: 'The one line to set on the page Dark Ironbound Tome: its lucy_img_ID.' })
  // The copy is the one line. Blank after the `=` when no capture matched an icon: never a guess.
  assert.equal(iconAddText(), '|lucy_img_ID        = \n')
  assert.equal(iconAddText(1001), '|lucy_img_ID        = 1001\n')
  assert.equal(wikiPageText(row, [], new Map()), iconAddText())
  assert.equal(wikiPageText(row, [], new Map(), { itemShots: { 'Dark Ironbound Tome': { iconId: 812 } } }), iconAddText(812))
})

test('the key folds a tier suffix and capitals', () => {
  assert.equal(iconKey('Dark Ironbound Tome +3'), 'dark ironbound tome')
  assert.equal(iconKey(' DARK IRONBOUND TOME '), 'dark ironbound tome')
})

test('main: a page with no icon id is listed once, by the name its page gives the item', () => {
  const corpus = {
    'dark ironbound tome': { page: 'Dark Ironbound Tome' },
    'cloak of flames': { page: 'Cloak of Flames', iconId: 678 },
    // An `|itemname` alias page is keyed twice in the corpus: one page, one entry.
    'golden boots': { page: 'Golden Boots (Sky)', name: 'Golden Boots' },
    'golden boots (sky)': { page: 'Golden Boots (Sky)', name: 'Golden Boots' }
  } as unknown as Record<string, ItemDbEntry>
  assert.deepEqual(iconlessPages(corpus), [
    { name: 'Dark Ironbound Tome', page: 'Dark Ironbound Tome' },
    { name: 'Golden Boots', page: 'Golden Boots (Sky)' }
  ])
})

test('the committed data: the iconless pages are few, and each names its page', () => {
  const pages = iconlessItems()
  console.log(`item pages with no icon id in the committed data: ${String(pages.length)}`)
  // A handful, not a parser regression: a scrape that lost the field would put thousands here.
  assert.ok(pages.length < 200, `${String(pages.length)} item pages have no icon id: the scrape lost the field`)
  for (const p of pages) assert.ok(p.name !== '' && p.page !== '', JSON.stringify(p))
  assert.equal(new Set(pages.map((p) => p.page)).size, pages.length, 'a page is listed twice')
})

test('an item a row added beside the snapshot already names (an export`s, a capture`s) gets no second row', () => {
  const extra = [itemRow('Dark Ironbound Tome')]
  assert.deepEqual(iconRows(ICONLESS, { loot: [loot('Dark Ironbound Tome')], held: NO_HELD }, [], extra), [])
  assert.equal(iconRows(ICONLESS, { loot: [loot('Dark Ironbound Tome')], held: NO_HELD }, [], [itemRow('Bat Meat')]).length, 1)
})
