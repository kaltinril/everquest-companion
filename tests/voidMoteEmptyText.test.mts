// WHAT THE VOID MOTES TAB SAYS WHEN IT HAS NO LIST (bug hunt, 2026-11-19). The tab joins two reads:
// the item data (`useGearIndex`) and the inventory dump. With the item data still loading, refused
// or unread, no worn item finds its row, and the tab used to say every piece was already +10.
// `moteEmptyText` is the whole rule; `VoidMotePanel` only prints it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moteEmptyText, type MoteEmptyState } from '../src/renderer/src/features/gear/voidMotePrefs'

const MAXED = 'Nothing you wear can go higher: every piece the item data knows is already +10.'

/** Everything read and a dump on disk: the one state the "+10" sentence is true in. */
const SETTLED: MoteEmptyState = {
  indexReady: true,
  indexRefused: false,
  hasRows: true,
  inventoryReady: true,
  hasDump: true,
  command: '/outputfile inventory'
}

test('moteEmptyText: while the item data loads the tab says so, never that everything is +10', () => {
  const text = moteEmptyText({ ...SETTLED, indexReady: false, hasRows: false })
  assert.equal(text, 'Reading the item database…')
})

test('moteEmptyText: item data this build cannot read is named, never read as "all +10"', () => {
  const refused = moteEmptyText({ ...SETTLED, indexRefused: true, hasRows: false })
  assert.equal(refused, 'This build cannot read the gear index it was served - it states a newer version.')
  // The read settled with nothing in it (the fetch failed): no worn item can be judged.
  const unread = moteEmptyText({ ...SETTLED, hasRows: false })
  assert.equal(unread, 'The item data could not be read, so nothing can be ranked.')
})

test('moteEmptyText: the inventory states come next, and no dump is the command', () => {
  assert.equal(moteEmptyText({ ...SETTLED, inventoryReady: false, hasDump: false }), 'Reading your inventory…')
  assert.equal(moteEmptyText({ ...SETTLED, hasDump: false }), 'No inventory dump for this character yet. Type /outputfile inventory in game.')
})

test('moteEmptyText: "already +10" is said only when both reads settled and a dump exists', () => {
  assert.equal(moteEmptyText(SETTLED), MAXED)
  const flags = ['indexReady', 'hasRows', 'inventoryReady', 'hasDump'] as const
  for (const flag of flags) assert.notEqual(moteEmptyText({ ...SETTLED, [flag]: false }), MAXED, `${flag} false`)
  assert.notEqual(moteEmptyText({ ...SETTLED, indexRefused: true }), MAXED, 'indexRefused true')
})
