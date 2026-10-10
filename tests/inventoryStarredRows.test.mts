// ============================================================================
// A starred inventory-dump row counts as the item it names.
// ============================================================================
//
// The game's `/outputfile inventory` writes some rows with a trailing `*` — the committed dump
// (`Primitive_freeport-Inventory.txt`) has `Bandages*` and `Backpack*` — and the file never states
// what the star means. `heldCountsFromDump` keys counts by the raw lowercased name, so the star
// reached the Sky reconcile intact: `bandages*` never pooled with a quest's `Bandages`, and
// `sword +3*` kept its tier because the ` +N` strip is END-anchored. The planner
// (`parseItemName`) already reads a starred row as the item, so the reconcile's fold now drops
// the star before the ` +N` strip. A ` (Exaltation)` row keeps its own key on purpose.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseInventoryDump } from '../src/main/outputs/inventoryParse'
import { heldCountsFromDump } from '../src/shared/outputs/inventory'
import { reconcile } from '../src/renderer/src/features/inventory/reconcile'
import type { PoskyQuest } from '../src/shared/types'

const DUMP = readFileSync(
  join(import.meta.dirname, 'fixtures', 'Primitive_freeport-Inventory.txt'),
  'utf8'
)

function netFor(inv: Record<string, number>): Record<string, number> {
  return reconcile({
    log: {},
    inv,
    lootNames: {},
    countSource: 'inventory',
    turnIns: {},
    quests: [] as PoskyQuest[]
  }).net
}

test("the committed dump's Bandages* row counts as Bandages", () => {
  const inv = heldCountsFromDump(parseInventoryDump(DUMP))
  assert.equal(inv['bandages*'], 20, 'the dump key still carries the star')
  const net = netFor(inv)
  assert.equal(net['bandages'], 20)
  assert.equal(net['bandages*'], undefined)
})

test('a starred +N row folds onto its base name and pools with the plain row', () => {
  const net = netFor({ 'sword +3*': 1, sword: 2 })
  assert.equal(net['sword'], 3)
})

test('an Exaltation row stays its own key: a socketed copy is not a turn-in copy', () => {
  const net = netFor({ 'sword (exaltation)': 1, sword: 1 })
  assert.equal(net['sword'], 1)
  assert.equal(net['sword (exaltation)'], 1)
})
