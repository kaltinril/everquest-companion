// The met-in-log evidence: the name lists an archived segment's modules give (`shared/metNames.ts`),
// the archive join (`logArchive/mergeMet.ts`), and the root feed that folds the engine's `met`
// module only when a list moved (`lib/useMetInLog.ts`). Pure halves only (the hook is one
// `useModule` and one effect over the feeder).
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConsiderSnap, KillsSnap, LootSnap, ProgressionSnap } from '../src/shared/types'
import { createMetFeed, sameNames } from '../src/renderer/src/lib/useMetInLog'
import { metFromModules, metItemNames, metMobNames, metZoneNames, type MetSnap } from '../src/shared/metNames'
import { mergeModule } from '../src/shared/logArchive/mergeRules'
import { metVersion, setMet, wasMet, type MetKind } from '../src/shared/metInLog'

const KILLS = {
  v: 5,
  mobs: { 'a gnoll pup': { display: 'A gnoll pup' }, 'lord nagafen': { display: 'Lord Nagafen' } }
} as unknown as KillsSnap

const LOOT: LootSnap = [
  { ts: 1, item: 'Wasp Wing', source: 'a giant wasp drone', zone: 'Greater Faydark' },
  { ts: 2, item: 'Bone Chips' },
  { ts: 3, item: 'Ghoulbane +1', source: '' }
]

const CONSIDER = [
  { id: 'a fire beetle', mob: 'a fire beetle', zone: 'Misty Thicket' },
  { id: 'a bat', mob: 'a bat' }
] as unknown as ConsiderSnap

test('mobs: every mob killed, every corpse looted from, every mob conned', () => {
  assert.deepEqual(metMobNames(KILLS, LOOT, CONSIDER), [
    'A gnoll pup',
    'Lord Nagafen',
    'a giant wasp drone',
    'a fire beetle',
    'a bat'
  ])
})

test('items: every item looted', () => {
  assert.deepEqual(metItemNames(LOOT), ['Wasp Wing', 'Bone Chips', 'Ghoulbane +1'])
})

test('zones: the zone timeline, then the zone of every loot and con', () => {
  const prog = { zoneName: ['Lower Guk', 'Plane of Fear'] } as unknown as ProgressionSnap
  assert.deepEqual(metZoneNames(prog, LOOT, CONSIDER), [
    'Lower Guk',
    'Plane of Fear',
    'Greater Faydark',
    'Misty Thicket'
  ])
})

test('no state yet is no evidence, never a throw', () => {
  assert.deepEqual(metMobNames(null, null, null), [])
  assert.deepEqual(metItemNames(null), [])
  assert.deepEqual(metZoneNames(null, null, null), [])
})

// ---- the archive: a segment's evidence rebuilt from what it captured, joined to the live met ----

const met = (mobs: string[], items: string[], zones: string[], bosses = {}): MetSnap =>
  ({ mobs, items, zones, bosses }) as MetSnap

test('an archived segment gives the names its modules give, and no bosses', () => {
  const seg = metFromModules({
    kills: { state: KILLS },
    loot: { state: LOOT },
    consider: { state: CONSIDER },
    progression: { state: { zoneName: ['Lower Guk'] } }
  })
  assert.deepEqual(seg.mobs, metMobNames(KILLS, LOOT, CONSIDER))
  assert.deepEqual(seg.items, metItemNames(LOOT))
  assert.deepEqual(seg.zones, ['Lower Guk', 'Greater Faydark', 'Misty Thicket'])
  assert.deepEqual(seg.bosses, {})
  assert.deepEqual(metFromModules({}), met([], [], []), 'a segment that captured none of them')
})

test('the join keeps every name either side met, and the live bosses', () => {
  const live = met(['a bat'], ['Bone Chips'], ['Lower Guk'], { 'lord nagafen': { count: 1 } })
  const archived = [met(['a gnoll', 'a bat'], ['Wasp Wing'], []), met(['an orc'], [], ['Lower Guk', 'Befallen'])]
  const { state, used } = mergeModule('met', archived, live)
  assert.equal(used, 2)
  assert.deepEqual(state, {
    mobs: ['a gnoll', 'a bat', 'an orc'],
    items: ['Wasp Wing', 'Bone Chips'],
    zones: ['Lower Guk', 'Befallen'],
    bosses: { 'lord nagafen': { count: 1 } }
  })
  assert.equal(mergeModule('met', [{ nope: 1 }], live).state, live, 'a state of another shape is left out')
})

// ---- the feeder: a kind re-folds only when its list moved ----

function clearAll(): void {
  setMet('mobs', [])
  setMet('items', [])
  setMet('zones', [])
}

/** A feeder over a counting `setMet`: which kinds each push folded. */
function countingFeed(): { feed: (s: MetSnap | null) => boolean; folds: MetKind[] } {
  const folds: MetKind[] = []
  const feed = createMetFeed((kind, names) => {
    folds.push(kind)
    setMet(kind, names)
  })
  return { feed, folds }
}

test('sameNames: same order and length only', () => {
  assert.equal(sameNames(['a', 'b'], ['a', 'b']), true)
  assert.equal(sameNames([], []), true)
  assert.equal(sameNames(['a', 'b'], ['a', 'b', 'c']), false)
  assert.equal(sameNames(['a', 'x', 'c'], ['a', 'y', 'c']), false, 'a middle change with the same ends')
})

test('a push that moved one list folds that kind alone', () => {
  const { feed, folds } = countingFeed()
  try {
    const s0 = met(['Lord Nagafen'], ['Wasp Wing'], ['Lower Guk'])
    assert.equal(feed(s0), true)
    assert.deepEqual(folds, ['mobs', 'items', 'zones'], 'the first push folds every kind')
    folds.length = 0
    assert.equal(feed({ ...s0, bosses: { 'lord nagafen': {} } } as MetSnap), false, 'a boss record is no new name')
    assert.deepEqual(folds, [])
    assert.equal(feed({ ...s0, zones: ['Lower Guk', "Sleeper's Tomb"] }), true)
    assert.deepEqual(folds, ['zones'])
    assert.equal(wasMet('zones', "Sleeper's Tomb"), true)
    assert.equal(wasMet('mobs', 'lord nagafen'), true)
    assert.equal(wasMet('items', 'wasp wing'), true)
    assert.equal(feed(null), true, 'a character switch empties it')
    assert.equal(wasMet('mobs', 'lord nagafen'), false)
  } finally {
    clearAll()
  }
})

test('evidence parity: the feeder holds what a fold of every kind on every push holds', () => {
  const NAMES = ['a gnoll pup', 'Lord Nagafen', 'Wasp Wing', 'Ghoulbane +1', 'Lower Guk', "Sleeper's Tomb"]
  let seed = 7 // mulberry32: a seeded walk, the same every run
  const rand = (n: number): number => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
  const some = (): string[] => NAMES.filter(() => rand(3) === 0)
  const held = (): string => (['mobs', 'items', 'zones'] as const).map((k) => NAMES.map((n) => (wasMet(k, n) ? n : '-')).join('|')).join(' / ')
  const { feed } = countingFeed()
  let s: MetSnap | null = null
  try {
    for (let step = 0; step < 500; step++) {
      const r = rand(5)
      if (r === 0) s = null
      else if (r === 1 || s === null) s = met(some(), some(), some())
      else s = { ...s, [(['mobs', 'items', 'zones'] as const)[rand(3)]]: some() }
      const before = metVersion()
      const said = feed(s)
      const fed = held()
      assert.equal(said, metVersion() !== before, `step ${String(step)}: a move is reported exactly when one happened`)
      for (const k of ['mobs', 'items', 'zones'] as const) setMet(k, s?.[k] ?? [])
      assert.equal(fed, held(), `step ${String(step)}: the feeder's evidence matches the full fold`)
    }
  } finally {
    clearAll()
  }
})
