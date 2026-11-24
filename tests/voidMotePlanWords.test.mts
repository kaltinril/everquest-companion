// THE VOID MOTES TAB'S PLAN, IN WORDS (2026-11-23: the owner's "allow the user to define if they
// have 0, 1, 2, or 3 void motes available", and the tester Malkil's screenshots: "When I click on
// Biggest Gain it changes the order, but keeps the recommendations from Recommended", "Perhaps it
// needs to describe its reasoning beneath the list"). The ranking itself is tests/voidMotes.test.mts;
// this file pins how many motes the plan spends and what the tab says about it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import type { PlannerInventoryHost } from '../src/shared/planner/inventorySlots'
import type { ItemSupply } from '../src/shared/planner/itemSupply'
import { motePlan } from '../src/shared/planner/voidMotes'
import { DEFAULT_MOTE_PREFS, MOTES_ON_HAND, motePlanLine, sanitizeMotePrefs } from '../src/renderer/src/features/gear/voidMotePrefs'

/** A weekly raid boss's drop, as the build would price it: about 1 experience a week. */
const RAID: ItemSupply = { kind: 'raid', from: 'Cazic Thule', perWeek: 1, roads: 1, chance: 0.125, kills: 1, hard: ['raid'] }
/** A quick camp: copies come fast. */
const CAMP: ItemSupply = { kind: 'camp', from: 'an orc centurion', perWeek: 400, roads: 1, chance: 0.5, respawn: 600 }

function gear(name: string, supply: ItemSupply, stats: GearRow['stats'] = { AC: 30 }): GearRow {
  const key = name.toLowerCase()
  return { key, name, searchKey: key, slots: ['CHEST'], classes: [], races: ['ALL'], flags: [], quest: false, playerCrafted: false, stats, effects: [], supply }
}

const CELLS = ['CHEST', 'LEGS', 'ARMS', 'HEAD'] as const

function worn(rows: readonly GearRow[], tiers: readonly number[]): { hosts: PlannerInventoryHost[]; byKey: Map<string, GearRow> } {
  const hosts = rows.map((r, i) => ({ slot: CELLS[i] ?? 'ANY1', name: r.name, key: r.key, tier: tiers[i] ?? 0 }))
  return { hosts, byKey: new Map(rows.map((r) => [r.key, r])) }
}

const OPTS = { target: 'AC', classes: [] } as const

// ---- 1. motes on hand ---------------------------------------------------------------------------

test('motes on hand: the picker offers 0 to 3, defaults to 3, and a stored value falls back alone', () => {
  assert.deepEqual(MOTES_ON_HAND, [0, 1, 2, 3])
  assert.equal(DEFAULT_MOTE_PREFS.onHand, 3)
  for (const n of [0, 1, 2, 3]) assert.equal(sanitizeMotePrefs({ onHand: n }).onHand, n)
  for (const bad of [4, -1, '2', 1.5, null]) assert.equal(sanitizeMotePrefs({ onHand: bad }).onHand, 3, String(bad))
  assert.deepEqual(sanitizeMotePrefs({ target: 'tank', order: 'gain', onHand: 0 }), { target: 'tank', order: 'gain', onHand: 0 })
})

test('motes on hand: the plan spends exactly that many, and at 0 nothing is planned', () => {
  const { hosts, byKey } = worn([gear('Shield', RAID), gear('Robe', RAID, { AC: 10 })], [8, 7])
  for (const n of [0, 1, 2, 3]) assert.equal(motePlan(hosts, byKey, OPTS, n).length, n, String(n))
  assert.deepEqual(motePlan(hosts, byKey, OPTS, 0), [])
})

test('motes on hand: at 0 the line says there are none to spend, not that nothing is ready', () => {
  assert.equal(motePlanLine([], 0), 'No void motes to spend this week')
  assert.equal(motePlanLine([], 2), 'Nothing you wear is ready for a mote yet: hold them')
  const { hosts, byKey } = worn([gear('Shield', RAID), gear('Belt', CAMP)], [9, 3])
  const plan = motePlan(hosts, byKey, OPTS, 2)
  assert.equal(plan.length, 1, 'one mote finishes the shield; the +3 belt takes none')
  assert.ok(motePlanLine(plan, 2).endsWith('hold 1'), motePlanLine(plan, 2))
})
