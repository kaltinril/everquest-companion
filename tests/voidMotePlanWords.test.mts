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
import { moteHours, motePlan, type MotePlanStep } from '../src/shared/planner/voidMotes'
import {
  DEFAULT_MOTE_PREFS,
  MOTES_ON_HAND,
  moteHoursText,
  moteLegendText,
  motePlanLine,
  motePlanReasons,
  sanitizeMotePrefs
} from '../src/renderer/src/features/gear/voidMotePrefs'

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

// ---- 2. what the highlight means, under every sort ----------------------------------------------

test('the plan line names how many motes each item gets', () => {
  const { hosts, byKey } = worn([gear('Shield of Rainbow Hues', RAID), gear('Slime Blood', RAID, { AC: 4 })], [8, 7])
  const plan = motePlan(hosts, byKey, OPTS, 3)
  assert.deepEqual(plan.map((s) => s.name), ['Shield of Rainbow Hues', 'Shield of Rainbow Hues', 'Slime Blood'])
  assert.equal(motePlanLine(plan, 3), 'This week: Shield of Rainbow Hues +8→+10 (2 motes) · Slime Blood +7→+8 (1 mote)')
})

test("Malkil's report: under every sort the highlight is said to be where the motes go, the number how many, and the sort only the order", () => {
  const { hosts, byKey } = worn([gear('Shield', RAID)], [8])
  const plan = motePlan(hosts, byKey, OPTS, 2)
  const recommended = moteLegendText('recommended', plan)
  assert.equal(recommended, "Highlighted rows are where this week's motes go; the number is how many motes that item gets. Sorting changes only the order.")
  for (const order of ['gain', 'effort'] as const) {
    const text = moteLegendText(order, plan)
    assert.ok(text.startsWith(`Sorted by ${order === 'gain' ? 'biggest gain' : 'most hours saved'}.`), text)
    assert.ok(text.includes('still the Recommended plan'), text)
    assert.ok(text.includes('the number is how many motes that item gets'), text)
  }
  assert.equal(moteLegendText('gain', []), '', 'nothing highlighted, nothing to explain')
})

// ---- 3. the reasoning beneath the list ----------------------------------------------------------

test('each planned mote records why it was planned: its gain, its hours, and whether either led the ready rows', () => {
  const { hosts, byKey } = worn([gear('Shield', RAID), gear('Slime Blood', RAID, { AC: 4 })], [8, 7])
  const plan = motePlan(hosts, byKey, OPTS, 3)
  const [first, , last] = plan
  assert.ok(first && last)
  assert.deepEqual([first.why.ready, first.why.mostGain, first.why.mostHours, first.why.gate], [2, true, true, 'pick'])
  assert.equal(first.why.hours, moteHours(8, RAID).hours)
  assert.equal(first.why.supply, RAID)
  assert.equal(last.why.ready, 1, 'with the shield at +10 only the slime blood is left')
})

test("Malkil's ask: one plain line per planned item says why the motes go there, from what the ranking computed", () => {
  const { hosts, byKey } = worn([gear('Shield of Rainbow Hues', RAID), gear('Slime Blood', RAID, { AC: 4 })], [8, 7])
  const lines = motePlanReasons(motePlan(hosts, byKey, OPTS, 3), 'AC', 3)
  const h8 = moteHoursText(moteHours(8, RAID))
  const h7 = moteHoursText(moteHours(7, RAID))
  assert.deepEqual(lines, [
    `2 motes on Shield of Rainbow Hues, +8 to +10: the biggest gain for AC (+3) and the most hours saved (${h8}), and still first when weighed again a tier up; copies come from Cazic Thule (Raid boss: weekly kill, 1 in 8).`,
    `1 mote on Slime Blood, +7 to +8: the only item ready for one (+1 AC, saves ${h7}); copies come from Cazic Thule (Raid boss: weekly kill, 1 in 8).`
  ])
})

test('the reasoning says only what the numbers support: neither biggest gain nor most hours is "the best mix"', () => {
  const step = (why: Partial<MotePlanStep['why']>, name = 'Robe'): MotePlanStep => ({
    cell: 'CHEST',
    key: name.toLowerCase(),
    name,
    tier: 7,
    why: { gain: 2.5, hours: 300, gate: 'pick', ready: 4, mostGain: false, mostHours: false, supply: CAMP, ...why }
  })
  assert.equal(
    motePlanReasons([step({})], 'balanced', 1)[0],
    '1 mote on Robe, +7 to +8: the best gain times hours saved (+2.5 Balanced over 300 h); copies come from an orc centurion (Camp: 1 in 2, 10 min respawn).'
  )
  assert.ok(motePlanReasons([step({ mostGain: true })], 'balanced', 1)[0]?.includes(': the biggest gain for Balanced (+2.5), saving 300 h;'))
  assert.ok(motePlanReasons([step({ mostHours: true })], 'balanced', 1)[0]?.includes(': the most hours saved (300 h), for +2.5 Balanced;'))
  const rare = motePlanReasons([step({ gate: 'rare', supply: undefined })], 'balanced', 1)[0] ?? ''
  assert.ok(rare.includes(', allowed below +7 because copies barely exist'), rare)
  assert.ok(rare.endsWith('; no page lists where copies come from.'), rare)
  const many = motePlanReasons([step({ supply: { ...RAID, roads: 4 } })], 'balanced', 1)[0] ?? ''
  assert.ok(many.endsWith('copies come from Cazic Thule and 3 others (Raid boss: weekly kill, 1 in 8).'), many)
})

test('the reasoning names the motes held, and says nothing when there is no plan', () => {
  const { hosts, byKey } = worn([gear('Shield', RAID), gear('Belt', CAMP)], [9, 3])
  const lines = motePlanReasons(motePlan(hosts, byKey, OPTS, 2), 'AC', 2)
  assert.equal(lines.length, 2)
  assert.equal(lines[1], 'Hold 1: nothing else you wear is ready for one yet.')
  assert.deepEqual(motePlanReasons([], 'AC', 3), [], 'the line above already says to hold them')
  assert.deepEqual(motePlanReasons([], 'AC', 0), [])
})
