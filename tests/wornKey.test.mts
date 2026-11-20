// A WORN ITEM'S KEY IS ITS RECORD'S OWN (screen pass, 2026-11-19).
//
// The Void motes tab called a worn "Djarn's Amethyst Ring +1" "not in the item data" while the
// item card for the same name showed its stats. The export spells the ring with an apostrophe; the
// wiki page is "Djarns Amethyst Ring" and carries the apostrophe spelling as a redirect. The item
// index resolves either spelling, but the Gear rows are keyed by the record's own name, and the
// worn item was keyed by the export's spelling: found in one map, missing from the other.
//
// `wornKey` is the join. The cases below are the ones a bare `itemKey` gets wrong, the ones it
// already got right (which must not move), and the committed data's own ring.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildItemDbIndex, itemKey, wornKey, type ItemDbFile } from '../src/main/itemsDb'

const SMALL: ItemDbFile = {
  items: {
    'djarns amethyst ring': { page: 'Djarns Amethyst Ring', otherNames: ["Djarn's Amethyst Ring"] },
    'cloak of flames': { page: 'Cloak of Flames' },
    // An `|itemname` alias page: the record's name is not its page title, and the name is the key.
    'golden efreeti boots': { page: 'Golden Efreeti Boots (Sky)', name: 'Golden Efreeti Boots' }
  }
} as unknown as ItemDbFile

test('a worn item spelled by a redirect is keyed by the record it lands on', () => {
  const index = buildItemDbIndex(SMALL)
  assert.equal(itemKey("Djarn's Amethyst Ring +1"), "djarn's amethyst ring", 'the bare key keeps the export`s spelling')
  assert.equal(wornKey("Djarn's Amethyst Ring +1", index), 'djarns amethyst ring')
  assert.equal(wornKey("Djarn's Amethyst Ring", index), 'djarns amethyst ring')
  assert.equal(wornKey('Djarns Amethyst Ring +3', index), 'djarns amethyst ring')
})

test('a worn item spelled as its record is keyed as before, tier suffix and case folded', () => {
  const index = buildItemDbIndex(SMALL)
  assert.equal(wornKey('Cloak of Flames +4', index), 'cloak of flames')
  assert.equal(wornKey('CLOAK OF FLAMES', index), 'cloak of flames')
  // The record's NAME is the key where it differs from the page title: that is what a Gear row carries.
  assert.equal(wornKey('Golden Efreeti Boots +2', index), 'golden efreeti boots')
})

test('a worn item the index does not hold keeps its own key', () => {
  const index = buildItemDbIndex(SMALL)
  assert.equal(wornKey('Sword Nobody Scraped +1', index), 'sword nobody scraped')
  assert.equal(wornKey('', index), '')
})

test('the committed item data: a redirect spelling keys the way its record`s own name does', () => {
  const file = JSON.parse(readFileSync(new URL('../src/main/data/items.json', import.meta.url), 'utf8')) as ItemDbFile
  const index = buildItemDbIndex(file)
  assert.equal(wornKey("Djarn's Amethyst Ring +1", index), 'djarns amethyst ring')
  // A Gear row's key is `itemKey` of the record's name (gearIndex.ts), so that is what every
  // spelling that lands on the record must come out as.
  let aliases = 0
  let moved = 0
  for (const record of Object.values(file.items ?? {})) {
    const rowKey = itemKey(record.name ?? record.page)
    for (const other of record.otherNames ?? []) {
      // An alias fills only a free key: one another record already owns is that record's.
      if (index.get(itemKey(other)) !== record) continue
      aliases++
      assert.equal(wornKey(other, index), rowKey, other)
      if (itemKey(other) !== rowKey) moved++
    }
  }
  assert.ok(aliases > 100, `only ${String(aliases)} redirect spellings checked`)
  assert.ok(moved > 0, 'no redirect spelling differs from its record: this test checks nothing')
})
