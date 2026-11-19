// WHERE A VOID MOTE GOES (owner ask, 2026-11-18): `src/shared/planner/voidMotes.ts` ranks the worn
// items a Void-Touched Potential could lift, and `features/gear/voidMotePrefs.ts` holds the panel's
// words and stored choice. Hand-built rows: the rules are what is pinned, not today's corpus.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import type { PlannerInventoryHost } from '../src/shared/planner/inventorySlots'
import {
  MOTE_HIGH_LEVEL,
  MOTE_SOURCE_STEPS,
  isMotePick,
  moteAdvice,
  moteEffort,
  moteSource,
  raidFactsOf,
  sortMoteAdvice,
  type MoteAdvice
} from '../src/shared/planner/voidMotes'
import {
  DEFAULT_MOTE_PREFS,
  moteChangesText,
  moteCopiesText,
  moteGainText,
  moteSourceTitle,
  moteTargetLabel,
  sanitizeMotePrefs
} from '../src/renderer/src/features/gear/voidMotePrefs'

function gear(name: string, over: Partial<GearRow> = {}): GearRow {
  const key = name.toLowerCase()
  return {
    key,
    name,
    searchKey: key,
    slots: ['CHEST'],
    classes: [],
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects: [],
    ...over
  }
}

const RAID = raidFactsOf([
  { name: 'Innoruuk', category: 'Plane of Hate', match: ['Innoruuk'], zone: 'Plane of Hate' },
  { name: 'Thunder Spirit Princess', category: 'Plane of Sky', match: ['a thunder spirit princess'], zone: 'Plane of Sky — Island 1' },
  { name: 'Lord Nagafen', category: 'Open World', match: ['Lord Nagafen'], zone: "Nagafen's Lair" }
])

function worn(rows: readonly GearRow[], tiers: readonly (number | undefined)[]): { hosts: PlannerInventoryHost[]; byKey: Map<string, GearRow> } {
  const cells = ['CHEST', 'LEGS', 'ARMS', 'HEAD', 'FEET'] as const
  const hosts = rows.map((r, i) => {
    const host: PlannerInventoryHost = { slot: cells[i] ?? 'ANY1', name: r.name, key: r.key }
    const tier = tiers[i]
    if (tier !== undefined) host.tier = tier
    return host
  })
  return { hosts, byKey: new Map(rows.map((r) => [r.key, r])) }
}

const OPTS = { target: 'AC', classes: [], raid: RAID } as const

// ---- where copies come from -------------------------------------------------------------------

test('raidFactsOf: every match name is a raid mob, and only a zone the roster names a category after is a raid zone', () => {
  assert.ok(RAID.mobs.has('innoruuk'))
  assert.ok(RAID.mobs.has('thunder spirit princess'), 'the leading article is folded')
  assert.deepEqual([...RAID.zones].sort(), ['plane of hate', 'plane of sky'], 'the island suffix is cut; a dragon lair is not a raid zone')
})

test('moteSource: a raid target, or a drop only inside a raid zone, is a raid item', () => {
  assert.equal(moteSource(gear('A', { dropMobs: ['Innoruuk'], dropLevels: ['65'], dropZones: ['Plane of Hate'] }), RAID).source, 'raid')
  const trash = moteSource(gear('B', { dropMobs: ['a repulsive rat'], dropLevels: ['48'], dropZones: ['The Plane of Hate'] }), RAID)
  assert.deepEqual(trash, { source: 'raid', from: 'a repulsive rat' })
  assert.equal(moteSource(gear('C', { dropMobs: ['Lord Nagafen'], dropLevels: ['55'], dropZones: ["Nagafen's Lair"] }), RAID).source, 'raid')
})

test('moteSource: the easiest stated road wins, and a camp with no stated level is never called high level', () => {
  const both = gear('D', { dropMobs: ['Lord Nagafen', 'a fire giant'], dropLevels: ['55', '38-42'], dropZones: ["Nagafen's Lair"] })
  assert.deepEqual(moteSource(both, RAID), { source: 'farm', from: 'a fire giant (38-42)' })
  const high = gear('E', { dropMobs: ['Trakanon Guard'], dropLevels: [String(MOTE_HIGH_LEVEL)], dropZones: ['Old Sebilis'] })
  assert.equal(moteSource(high, RAID).source, 'high')
  const below = gear('F', { dropMobs: ['a guard'], dropLevels: [String(MOTE_HIGH_LEVEL - 1)], dropZones: ['Old Sebilis'] })
  assert.equal(moteSource(below, RAID).source, 'farm')
  const silent = gear('G', { dropMobs: ['Stomples', 'a quiet mob'], dropLevels: ['63', ''], dropZones: ['Somewhere'] })
  assert.deepEqual(moteSource(silent, RAID), { source: 'farm', from: 'a quiet mob' })
})

test('moteSource: with no drop listed it is crafted, then quest, then not listed at all', () => {
  assert.equal(moteSource(gear('H', { playerCrafted: true, quest: true }), RAID).source, 'crafted')
  assert.equal(moteSource(gear('I', { quest: true }), RAID).source, 'quest')
  assert.equal(moteSource(gear('J'), RAID).source, 'unknown')
  assert.equal(moteSource(gear('K', { quest: true, dropMobs: ['a rat'], dropLevels: ['3'] }), RAID).source, 'farm', 'a listed drop outranks the quest flag')
})

test('the source steps keep the owner order: raid, then quests and high-level camps, then farmable', () => {
  assert.ok(MOTE_SOURCE_STEPS.raid > MOTE_SOURCE_STEPS.quest)
  assert.equal(MOTE_SOURCE_STEPS.quest, MOTE_SOURCE_STEPS.high)
  assert.ok(MOTE_SOURCE_STEPS.high > MOTE_SOURCE_STEPS.farm)
  assert.equal(MOTE_SOURCE_STEPS.unknown, 0, 'no stated source claims no difficulty')
})

// ---- the advice ---------------------------------------------------------------------------------

test('moteAdvice: one row per worn item below +10, read at the tier its name states', () => {
  const plate = gear('Plate', { stats: { AC: 30, STR: 20 } })
  const capped = gear('Capped', { stats: { AC: 50 } })
  const { hosts, byKey } = worn([plate, capped, gear('Unknown To Corpus')], [3, 10, 2])
  byKey.delete('unknown to corpus')
  const list = moteAdvice(hosts, byKey, OPTS)
  assert.equal(list.length, 1, 'a +10 item and an item the corpus does not know are left out')
  const [a] = list
  assert.ok(a)
  assert.equal(a.tier, 3)
  assert.equal(a.copies, 8, 'tier 3 to 4 costs 2^3 copies')
  // floor(30 + 30 * 3 / 10) = 39 at +3, floor(30 + 30 * 4 / 10) = 42 at +4 (itemUpgrade's primary rule)
  assert.equal(a.gain, 3)
  assert.deepEqual(a.changes, [
    { key: 'AC', from: 39, to: 42 },
    { key: 'STR', from: 26, to: 28 }
  ])
  assert.equal(a.opens, 'Proc', 'tier 4 opens the Proc socket')
})

test('moteAdvice: a name with no +N is tier 0, one copy, and its next tier opens the Focus socket', () => {
  const { hosts, byKey } = worn([gear('Fresh', { stats: { AC: 20 } })], [undefined])
  const [a] = moteAdvice(hosts, byKey, OPTS)
  assert.ok(a)
  assert.deepEqual([a.tier, a.copies, a.opens, a.gain], [0, 1, 'Focus', 2])
})

test('moteAdvice: a tier past the socket unlocks opens nothing, and a stat the item lacks gains nothing', () => {
  const { hosts, byKey } = worn([gear('Late', { stats: { STR: 20 } })], [6])
  const [a] = moteAdvice(hosts, byKey, OPTS)
  assert.ok(a)
  assert.equal(a.opens, undefined)
  assert.equal(a.gain, 0)
  assert.equal(a.score, 0)
})

test('moteAdvice: a focus target scores through the role model, and the class gate decides what counts', () => {
  const { hosts, byKey } = worn([gear('Robe', { stats: { INT: 30 } })], [2])
  const [caster] = moteAdvice(hosts, byKey, { target: 'dd', classes: ['WIZ'], raid: RAID })
  const [melee] = moteAdvice(hosts, byKey, { target: 'dd', classes: ['WAR'], raid: RAID })
  assert.ok(caster && melee)
  assert.ok(caster.gain > 0, 'INT is a wizard mana stat')
  assert.equal(melee.gain, 0, 'INT is nothing to a warrior')
})

test('moteAdvice: the score is the gain times one plus the tier and the source steps', () => {
  const raidPlate = gear('Hate Plate', { stats: { AC: 30 }, dropMobs: ['Innoruuk'], dropLevels: ['65'], dropZones: ['Plane of Hate'] })
  const { hosts, byKey } = worn([raidPlate], [5])
  const [a] = moteAdvice(hosts, byKey, OPTS)
  assert.ok(a)
  assert.equal(a.source, 'raid')
  assert.equal(moteEffort(a), 5 + MOTE_SOURCE_STEPS.raid)
  assert.equal(a.score, a.gain * (1 + 5 + MOTE_SOURCE_STEPS.raid))
})

// ---- the order ----------------------------------------------------------------------------------

function ranked(): MoteAdvice[] {
  const rows = [
    gear('Farm Low', { stats: { AC: 100 }, dropMobs: ['a rat'], dropLevels: ['5'] }),
    gear('Raid High', { stats: { AC: 30 }, dropMobs: ['Innoruuk'], dropLevels: ['65'], dropZones: ['Plane of Hate'] }),
    gear('No Gain', { stats: { STR: 30 }, dropMobs: ['Innoruuk'], dropLevels: ['65'], dropZones: ['Plane of Hate'] }),
    gear('Quest Mid', { stats: { AC: 40 }, quest: true })
  ]
  const { hosts, byKey } = worn(rows, [0, 8, 9, 4])
  return moteAdvice(hosts, byKey, OPTS)
}

test('sortMoteAdvice: each order ranks by its own key, and a row that gains nothing sinks in all of them', () => {
  const list = ranked()
  // gains: Farm Low +10 at tier 0 (score 10), Raid High +3 at tier 8 (score 36), Quest Mid +4 at tier 4 (score 28)
  assert.deepEqual(sortMoteAdvice(list, 'recommended').map((a) => a.name), ['Raid High', 'Quest Mid', 'Farm Low', 'No Gain'])
  assert.deepEqual(sortMoteAdvice(list, 'gain').map((a) => a.name), ['Farm Low', 'Quest Mid', 'Raid High', 'No Gain'])
  assert.deepEqual(sortMoteAdvice(list, 'effort').map((a) => a.name), ['Raid High', 'Quest Mid', 'Farm Low', 'No Gain'])
  assert.equal(list[0]?.name, 'Farm Low', 'the input is not reordered')
})

test('isMotePick: the first three rows that gain something are the week picks', () => {
  const sorted = sortMoteAdvice(ranked(), 'recommended')
  assert.deepEqual(sorted.map((_, i) => isMotePick(sorted, i)), [true, true, true, false])
  const none = sorted.map((a) => ({ ...a, gain: 0 }))
  assert.equal(isMotePick(none, 0), false, 'a top row that gains nothing is not a pick')
})

// ---- the stored choice and the words ------------------------------------------------------------

test('sanitizeMotePrefs: each field falls back alone, and garbage is the default', () => {
  assert.deepEqual(sanitizeMotePrefs(null), DEFAULT_MOTE_PREFS)
  assert.deepEqual(sanitizeMotePrefs('open'), DEFAULT_MOTE_PREFS)
  assert.deepEqual(sanitizeMotePrefs({ open: true, target: 'tank', order: 'effort' }), { open: true, target: 'tank', order: 'effort' })
  assert.deepEqual(sanitizeMotePrefs({ open: true, target: 'WEIGHT', order: 'best' }), { open: true, target: 'balanced', order: 'recommended' })
  assert.equal(sanitizeMotePrefs({ target: 'SV_FIRE' }).target, 'SV_FIRE')
})

test('the panel words: target names, the gain, the changes, the copies and the source hover', () => {
  assert.equal(moteTargetLabel('dps2h'), '2H DPS')
  assert.equal(moteTargetLabel('SV_FIRE'), 'SV FIRE')
  assert.equal(moteGainText({ gain: 11.52 }, 'tank'), '+11.5')
  assert.equal(moteGainText({ gain: 4 }, 'AC'), '+4')
  assert.equal(moteGainText({ gain: 0 }, 'AC'), '', 'no gain is a blank cell')
  const changes = [
    { key: 'AC', from: 66, to: 70 },
    { key: 'SV_VOID', to: 1 },
    { key: 'WEIGHT', from: 1.5, to: 0.8 }
  ] as const
  assert.equal(moteChangesText({ changes: [...changes] }), 'AC 66→70 · SV VOID -→1 · WEIGHT 1.5→0.8')
  assert.equal(moteCopiesText({ copies: 1 }), '1 copy')
  assert.equal(moteCopiesText({ copies: 1024 }), '1,024 copies')
  assert.equal(moteSourceTitle({ source: 'raid', from: 'Innoruuk' }), 'Raid: Innoruuk')
  assert.equal(moteSourceTitle({ source: 'unknown' }), 'The item data lists no source for it')
})
