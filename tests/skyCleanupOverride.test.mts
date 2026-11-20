// The Cleanup row under a hand-stated count (upstream #73): the pencil on the Cleanup row writes
// the same statement the quest row writes, so this drives the real `reconcile` into the real
// `cleanupRows` with a statement keyed the way the pencil keys it (`itemCountKey(row.name)`).
//
// A hand-built one-item quest, as tests/skyItemOverrides.test.mts does: the claim is arithmetic,
// and a re-scrape must not be able to move it.
//
// Run: `node --import tsx --test tests/skyCleanupOverride.test.mts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyItemOverride, clearItemOverride, itemOverridesByKey } from '../src/shared/itemOverrides'
import { reconcile, type ReconcileInput } from '../src/renderer/src/features/inventory/reconcile'
import {
  cleanupRows,
  decisionLine,
  setsLine,
  type CleanupQuest,
  type CleanupRow
} from '../src/renderer/src/features/posky/cleanup'
import { questKey } from '../src/renderer/src/features/posky/keys'
import { itemCountKey } from '../src/renderer/src/lib/itemName'
import type { ItemCountOverride, PoskyQuest } from '../src/shared/types'

const SKIN: PoskyQuest = {
  className: 'Beastlord',
  name: 'Test of Skin',
  giver: 'Animist Kratho',
  reward: 'Skin Wristwraps',
  items: [{ name: 'Azarack Skin', count: 1, who: [], where: 'Island 2' }],
  source: 'test'
}
const SKIN_KEY = questKey(SKIN)
const skin = itemCountKey('Azarack Skin')
const SHAPED: CleanupQuest[] = [
  {
    key: SKIN_KEY,
    className: SKIN.className,
    name: SKIN.name,
    giver: SKIN.giver,
    reward: SKIN.reward,
    items: SKIN.items.map((it) => ({ name: it.name, count: it.count }))
  }
]

const T0 = 1_700_000_000_000
const HOUR = 3_600_000

/** Three looted, the quest turned in once, an hour BEFORE any statement below is made. */
const BASE: ReconcileInput = {
  log: { [skin]: 3 },
  inv: {},
  lootNames: { [skin]: 'Azarack Skin' },
  countSource: 'both',
  turnIns: { [SKIN_KEY]: 1 },
  turnInInstants: { [SKIN_KEY]: [T0 - HOUR] },
  quests: [SKIN]
}

/** The Cleanup rows the tab would draw for one reconcile input. */
function rowsFor(over: Partial<ReconcileInput> = {}): CleanupRow[] {
  const input = { ...BASE, ...over }
  return cleanupRows(SHAPED, input.turnIns, reconcile(input).net)
}

/** The statement the pencil writes: keyed off the NAME the row drew, at T0. */
function statedFrom(row: CleanupRow, count: number): ItemCountOverride[] {
  return applyItemOverride([], { key: itemCountKey(row.name), name: row.name, count, setAt: T0 })
}

test('with no statement the turned-in quest leaves one Cleanup row at the reconciled count', () => {
  const rows = rowsFor()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Azarack Skin')
  assert.equal(rows[0].quantity, 2, 'three looted less the one turn-in')
  assert.equal(itemCountKey(rows[0].name), rows[0].key, 'the name the pencil hands over lands on the row key')
})

test('a statement of 0 takes the row off Cleanup', () => {
  const [row] = rowsFor()
  const overrides = itemOverridesByKey(statedFrom(row, 0))
  assert.equal(reconcile({ ...BASE, overrides }).net[skin], 0)
  assert.deepEqual(rowsFor({ overrides }), [])
})

test('loot after a statement of 0 brings the row back with that count', () => {
  const [row] = rowsFor()
  const overrides = itemOverridesByKey(statedFrom(row, 0))
  const rows = rowsFor({ overrides, lootSinceOverride: { [skin]: 2 } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].quantity, 2)
})

test('a statement of 1 is the count the row reads, under both and under handins', () => {
  const [row] = rowsFor()
  const overrides = itemOverridesByKey(statedFrom(row, 1))
  const logOnly = { held: { [skin]: 5 }, givenTo: {} }
  for (const countSource of ['both', 'handins'] as const) {
    // Neither source answers 1 unstated, so the statement is what answers.
    assert.notEqual(rowsFor({ countSource, logOnly })[0].quantity, 1, countSource)
    const rows = rowsFor({ countSource, overrides, logOnly })
    assert.equal(rows.length, 1, countSource)
    assert.equal(rows[0].quantity, 1, countSource)
  }
})

test('a stated count does not list an item while another quest that names it is not turned in', () => {
  const other: PoskyQuest = { ...SKIN, className: 'Monk', name: 'Test of Hide' }
  const quests = [SKIN, other]
  const shaped: CleanupQuest[] = [...SHAPED, { ...SHAPED[0], key: questKey(other), className: 'Monk', name: 'Test of Hide' }]
  const overrides = itemOverridesByKey(statedFrom(rowsFor()[0], 4))
  const net = reconcile({ ...BASE, quests, overrides }).net
  assert.equal(net[skin], 4, 'the statement is the count')
  assert.deepEqual(cleanupRows(shaped, BASE.turnIns, net), [], 'the Monk has not turned his in')
  const both = cleanupRows(shaped, { ...BASE.turnIns, [questKey(other)]: 1 }, net)
  assert.deepEqual(both.map((r) => [r.name, r.quantity, r.turnIns.length]), [['Azarack Skin', 4, 2]])
})

test('a stated count is what the row`s advice is worked from', () => {
  const five: PoskyQuest = { ...SKIN, items: [{ ...SKIN.items[0], count: 5 }] }
  const shaped: CleanupQuest[] = [{ ...SHAPED[0], items: [{ name: 'Azarack Skin', count: 5 }] }]
  const turnInFor = (count: number): CleanupRow['turnIns'][number] => {
    const overrides = itemOverridesByKey(statedFrom(rowsFor()[0], count))
    const net = reconcile({ ...BASE, quests: [five], overrides }).net
    return cleanupRows(shaped, BASE.turnIns, net)[0].turnIns[0]
  }
  const ten = turnInFor(10)
  assert.equal(ten.sets, 2)
  assert.equal(setsLine(ten), 'you hold enough for 2 more turn-ins')
  assert.ok(decisionLine(ten).startsWith('keep them: turning in again gives another Skin Wristwraps'))
  const three = turnInFor(3)
  assert.equal(three.sets, 0)
  assert.equal(decisionLine(three), 'you hold 3 of the 5 needed for another turn-in')
})

test('clearing the statement restores exactly the rows there were before it', () => {
  const before = rowsFor()
  const stated = statedFrom(before[0], 0)
  assert.deepEqual(rowsFor({ overrides: itemOverridesByKey(stated) }), [])
  assert.deepEqual(rowsFor({ overrides: itemOverridesByKey(clearItemOverride(stated, before[0].key)) }), before)
})
