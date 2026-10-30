// Fork issue #2 — the `handins` count source, "Log only (loot minus hand-ins)": loot adds (the
// currency tab included), every completed hand-over to an NPC removes whether or not it completes a
// known quest, a destroy removes, and the `/outputfile inventory` export is ignored. A cancelled or
// refused offer is already out of the engine's `given` (turnins.rs pins that half).
//
// Run: `node --import tsx --test tests/skyLogOnlyCount.test.mts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcile } from '../src/renderer/src/features/inventory/reconcile'
import { computeHeldCounts, computeLogOnlyCounts } from '../src/renderer/src/features/posky/heldCounts'
import type { CountSource, LootEvent, PoskyQuest, TurnInEvent } from '../src/shared/types'

const RUNE = 'Wind Rune Kala'
const KEY = 'wind rune kala'
const T = 1_700_000_000_000

const loot = (ts: number, count: number, disposition?: LootEvent['disposition']): LootEvent => ({
  ts: T + ts,
  item: RUNE,
  count,
  ...(disposition ? { disposition } : {})
})
const trade = (ts: number, npc: string, given: TurnInEvent['given'], items = [RUNE]): TurnInEvent => ({
  ts: T + ts,
  npc,
  items,
  given
})

// A quest that names the rune, so the old `log` source has something to subtract for contrast.
const QUEST: PoskyQuest = {
  className: 'Druid',
  name: 'Test of Wind',
  giver: 'Kizdean Gix',
  items: [{ name: RUNE, count: 2, who: [], where: 'Island 1' }]
}

function net(
  history: LootEvent[],
  trades: TurnInEvent[],
  countSource: CountSource,
  inv: Record<string, number> = {}
): number {
  return (
    reconcile({
      log: computeHeldCounts(history),
      inv,
      lootNames: {},
      countSource,
      turnIns: {},
      quests: [QUEST],
      logOnly: computeLogOnlyCounts(history, trades)
    }).net[KEY] ?? 0
  )
}

test('loot adds, the currency tab included', () => {
  assert.equal(net([loot(1, 3), loot(2, 2, 'currency')], [], 'handins'), 5)
})

test('a hand-over to any NPC removes its stack, quest or no quest', () => {
  const history = [loot(1, 17, 'currency')]
  const trades = [
    trade(2, 'Kizdean Gix', [{ item: RUNE, count: 5 }]),
    trade(3, 'A Curious Gnome', [{ item: RUNE, count: 1 }])
  ]
  assert.equal(net(history, trades, 'handins'), 11)
  // The old log source subtracts only completed known turn-ins, and none was recorded here.
  assert.equal(net(history, trades, 'log'), 17)
})

test('a cancelled or refused offer removes nothing', () => {
  // The engine left both out of `given`; the trade row still lists the offer in `items`.
  const trades = [trade(2, 'a froglok', []), trade(3, 'Lord Ollix Everling', [], [RUNE, RUNE])]
  assert.equal(net([loot(1, 4)], trades, 'handins'), 4)
})

test('a destroy removes', () => {
  assert.equal(net([loot(1, 6), loot(2, 2, 'destroyed')], [], 'handins'), 4)
})

test('the export is ignored, whatever it says', () => {
  const history = [loot(1, 3)]
  const trades = [trade(2, 'Kizdean Gix', [{ item: RUNE, count: 1 }])]
  assert.equal(net(history, trades, 'handins', { [KEY]: 40 }), 2)
  assert.equal(net(history, trades, 'handins', { [KEY]: 0 }), 2)
  assert.equal(net(history, trades, 'both', { [KEY]: 40 }), 40, 'contrast: both reads the export')
})

test('the row shows the hand-overs as consumed, blamed on the NPC', () => {
  const r = reconcile({
    log: computeHeldCounts([loot(1, 5)]),
    inv: { [KEY]: 9 },
    lootNames: {},
    countSource: 'handins',
    turnIns: {},
    quests: [QUEST],
    logOnly: computeLogOnlyCounts([loot(1, 5)], [trade(2, 'Kizdean Gix', [{ item: RUNE, count: 2 }])])
  })
  const row = r.rows.find((x) => x.key === KEY)
  assert.ok(row)
  assert.deepEqual(
    { base: row.base, consumed: row.consumed, net: row.net, by: row.consumedBy },
    { base: 5, consumed: 2, net: 3, by: ['Kizdean Gix'] }
  )
})

test('in time order: a hand-over takes only what the log saw, and later loot is fresh', () => {
  // Runes held from before this log was handed in first; the 3 looted after are all still held.
  const trades = [trade(1, 'Kizdean Gix', [{ item: RUNE, count: 5 }])]
  assert.equal(net([loot(2, 3)], trades, 'handins'), 3)
  // A loot line in the same instant as the trade folds first.
  assert.equal(net([loot(5, 2)], [trade(5, 'Kizdean Gix', [{ item: RUNE, count: 2 }])], 'handins'), 0)
})

test('a trade row from before `given` existed counts each listed item once', () => {
  const old: TurnInEvent = { ts: T + 2, npc: 'Kizdean Gix', items: [RUNE, RUNE] }
  assert.equal(net([loot(1, 5)], [old], 'handins'), 3)
})

test('with no fold supplied, `handins` answers as `log`', () => {
  const r = reconcile({
    log: { [KEY]: 4 },
    inv: { [KEY]: 9 },
    lootNames: {},
    countSource: 'handins',
    turnIns: {},
    quests: [QUEST]
  })
  assert.equal(r.net[KEY], 4)
})
