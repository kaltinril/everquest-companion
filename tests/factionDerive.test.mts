// The row-visibility rules (renderer/src/features/factions/factionDerive.ts visibleRows), pinned
// around the race-gate hunt: the hunt overrides the hide-toggles, the still-needed refinement
// drops settled gates, and the race picker keeps only the picked races' gates — a faction that
// gates Kerran AND Froglok answers a Kerran hunt, one that gates Froglok alone does not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SORT,
  huntedGates,
  visibleRows,
  type RowFilters
} from '../src/renderer/src/features/factions/factionDerive'
import type { FactionRowVm, RaceGate } from '../src/renderer/src/features/factions/useFactionRows'

/** A row with only what the visibility rules read; everything else is inert filler. */
function row(id: number, name: string, standing: number, unlocks: RaceGate[] = []): FactionRowVm {
  return {
    id,
    name,
    standing,
    dumpStanding: standing,
    drift: 0,
    exact: true,
    cap: 2000,
    toMax: 2000 - standing,
    label: 'indifferent',
    color: '#888',
    tierRank: 4,
    pct: 50,
    searchText: name.toLowerCase(),
    rewardText: name.toLowerCase(),
    work: null,
    raiseCount: 0,
    unlocks
  }
}

const OFF: RowFilters = {
  query: '',
  hideUntouched: true,
  hideMaxed: true,
  unlocksOnly: false,
  unlocksPending: false,
  races: [],
  rewardsOnly: false
}

const ROWS: readonly FactionRowVm[] = [
  // untouched, gates Kerran (pending) and Froglok (settled)
  row(1, 'Kerra Isle', 0, [
    { race: 'Kerran', done: false },
    { race: 'Froglok', done: true }
  ]),
  // untouched, gates Froglok only (pending)
  row(2, 'Guardians of the Vale', 0, [{ race: 'Froglok', done: false }]),
  // maxed, gates Kerran (settled)
  row(3, 'Kejek Village', 2000, [{ race: 'Kerran', done: true }]),
  // touched, gates nothing
  row(4, 'Merchants of Qeynos', 300)
]

const names = (f: RowFilters): string[] => visibleRows(ROWS, f, { key: 'name', dir: 'asc' }).map((r) => r.name)

test('the default view hides untouched and maxed rows', () => {
  assert.deepEqual(names(OFF), ['Merchants of Qeynos'])
})

test('the race-gate hunt shows every gating faction, settled or not, over the hide-toggles', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true }), ['Guardians of the Vale', 'Kejek Village', 'Kerra Isle'])
})

test('a race pick keeps only the factions gating THAT race', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Kerran'] }), ['Kejek Village', 'Kerra Isle'])
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Froglok'] }), ['Guardians of the Vale', 'Kerra Isle'])
})

test('several picked races are a union', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Kerran', 'Froglok'] }), [
    'Guardians of the Vale',
    'Kejek Village',
    'Kerra Isle'
  ])
})

test('a race pick and still-needed compose: only the unsettled gates of that race count', () => {
  // Kejek Village's Kerran gate is settled; Kerra Isle's is not.
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, unlocksPending: true, races: ['Kerran'] }), ['Kerra Isle'])
  // Kerra Isle's Froglok gate is settled, so a still-needed Froglok hunt leaves only the Vale.
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, unlocksPending: true, races: ['Froglok'] }), [
    'Guardians of the Vale'
  ])
})

test('the race pick is only read while the hunt is on — the default view ignores it', () => {
  assert.deepEqual(names({ ...OFF, races: ['Kerran'] }), ['Merchants of Qeynos'])
})

test('a race no faction gates shows an empty table rather than falling back to everything', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Iksar'] }), [])
})

test('a search under a race pick still has to carry a matching gate', () => {
  const f: RowFilters = { ...OFF, unlocksOnly: true, races: ['Kerran'], query: 'vale' }
  assert.deepEqual(names(f), [])
  assert.deepEqual(names({ ...f, query: 'kerra' }), ['Kerra Isle'])
})

test('huntedGates is the one list both refinements read', () => {
  const r = ROWS[0]!
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true }).map((g) => g.race), ['Kerran', 'Froglok'])
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true, unlocksPending: true }).map((g) => g.race), ['Kerran'])
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true, races: ['Froglok'] }).map((g) => g.race), ['Froglok'])
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true, unlocksPending: true, races: ['Froglok'] }), [])
})

test('the default sort is standing, biggest first', () => {
  assert.deepEqual(DEFAULT_SORT, { key: 'standing', dir: 'desc' })
})
