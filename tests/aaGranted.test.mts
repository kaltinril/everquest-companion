// Free AAs the game grants without a purchase line (src/shared/aaGranted.ts): held once the row's
// level and AA requirements are met, for the character's own rows; a pick still wins.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aaGrantedRank, aaRequirements, withGranted, type AaCharacter } from '../src/shared/aaGranted'
import { rankAas, type AaRanked } from '../src/shared/aaRanks'
import { AA_ROWS } from '../src/shared/aaOfficial'
import type { AaTableRow } from '../src/shared/aaTable.generated'
import { statCapOf } from '../src/shared/reincarnationCap'
import type { AASpendEvent } from '../src/shared/types'

const OWNER: AaCharacter = { level: 50, classes: ['WAR', 'SHM', 'MNK'] }
const T = Date.parse('2026-11-25T18:00:00')

const ranks = (ranked: readonly AaRanked[], name: string): number => ranked.find((r) => r.row.name === name)?.rank ?? -1
const sourceOf = (ranked: readonly AaRanked[], name: string): string | undefined => ranked.find((r) => r.row.name === name)?.source

test("the owner's five free AAs come out held at level 50 as WAR/SHM/MNK", () => {
  const ranked = withGranted(rankAas([], {}), OWNER)
  for (const name of ['Gather Party', 'Origin', 'Intimidation', 'Heroic Leap', 'Innate Fighters Tenacity']) {
    assert.equal(ranks(ranked, name), 1, name)
    assert.equal(sourceOf(ranked, name), 'granted', name)
  }
})

test('Unbound Wrath grants a rank per stated level: 3 at 50, 2 at 30, 1 at 12, 0 at 11', () => {
  for (const [level, want] of [[50, 3], [30, 2], [12, 1], [11, 0]] as const) {
    assert.equal(ranks(withGranted(rankAas([], {}), { level, classes: ['WAR'] }), 'Unbound Wrath'), want, `level ${String(level)}`)
  }
})

test('a free AA of a class the character lacks stays 0', () => {
  const ranked = withGranted(rankAas([], {}), OWNER)
  assert.equal(ranks(ranked, 'Unbound Destruction'), 0)
  assert.equal(ranks(ranked, 'Lay on Hands'), 0)
  assert.equal(sourceOf(ranked, 'Unbound Destruction'), 'none')
})

const TABLE: AaTableRow[] = [
  { section: 'general', name: 'First Aid', ranks: 3, cost: '1/2/3', text: 'Heals. Requirements: Level 1.' },
  { section: 'general', name: 'Free Bandage', ranks: 1, cost: '0', text: 'Requirements: Level 10, First Aid at Level 3.' },
  { section: 'general', name: 'Free Riddle', ranks: 1, cost: '0', text: 'Requirements: Level 1, a moon phase.' },
  { section: 'general', name: 'Free Cascade', ranks: 3, cost: '0', text: 'Requires First Aid rank 1/2/3. Requirements: Level 1.' },
  { section: 'special', name: 'Reincarnation: Completionist', ranks: 1, cost: '0', text: 'x' }
]

const firstAid = (rank: number): AASpendEvent => ({ ts: T + rank, ability: `First Aid ${String(rank)}`, cost: rank, rank })

test('a free AA with an unmet AA requirement stays 0, and is held once that AA reaches the rank', () => {
  const at = (spends: AASpendEvent[]): AaRanked[] => withGranted(rankAas(spends, {}, [], TABLE), { level: 50, classes: [] })
  assert.equal(ranks(at([firstAid(1), firstAid(2)]), 'Free Bandage'), 0)
  assert.equal(ranks(at([firstAid(1), firstAid(2), firstAid(3)]), 'Free Bandage'), 1)
  assert.equal(ranks(at([firstAid(1), firstAid(2)]), 'Free Cascade'), 2)
  // A pick counts as the AA's rank too.
  assert.equal(ranks(withGranted(rankAas([], { 'First Aid': 3 }, [], TABLE), { level: 50, classes: [] }), 'Free Bandage'), 1)
  // Below the level stated, nothing.
  assert.equal(ranks(withGranted(rankAas([firstAid(1), firstAid(2), firstAid(3)], {}, [], TABLE), { level: 9, classes: [] }), 'Free Bandage'), 0)
})

test('a requirement it cannot read grants nothing', () => {
  assert.equal(aaRequirements(TABLE[2]), null)
  assert.equal(aaGrantedRank(TABLE[2], { level: 50, classes: [] }, () => 0), 0)
  assert.deepEqual(aaRequirements(TABLE[1]), { levels: [10], aas: [{ name: 'First Aid', ranks: [3] }] })
})

test('every free row of the table reads its requirements', () => {
  const free = AA_ROWS.filter((r) => r.section !== 'special' && r.cost.trim() === '0')
  assert.ok(free.length > 20)
  assert.deepEqual(free.filter((r) => aaRequirements(r) === null).map((r) => r.name), [])
})

test("a pick of 0 overrides a grant; the log's rank wins over a lower grant", () => {
  assert.equal(ranks(withGranted(rankAas([], { 'Gather Party': 0 }), OWNER), 'Gather Party'), 0)
  assert.equal(sourceOf(withGranted(rankAas([], { 'Gather Party': 0 }), OWNER), 'Gather Party'), 'pick')
  const logged: AASpendEvent[] = [{ ts: T, ability: 'Unbound Wrath 3', cost: 0, rank: 3 }]
  const ranked = withGranted(rankAas(logged, {}), { level: 12, classes: ['WAR'] })
  assert.equal(ranks(ranked, 'Unbound Wrath'), 3)
  assert.equal(sourceOf(ranked, 'Unbound Wrath'), 'log')
})

test('Special rows are never granted; an unknown level grants nothing', () => {
  assert.equal(ranks(withGranted(rankAas([], {}, [], TABLE), { level: 50, classes: [] }), 'Reincarnation: Completionist'), 0)
  const ranked = withGranted(rankAas([], {}), { level: null, classes: ['WAR', 'SHM', 'MNK'] })
  assert.ok(ranked.every((r) => r.source !== 'granted'))
  assert.equal(ranks(ranked, 'Gather Party'), 0)
})

test('grants leave the race rows and the stat cap as they were', () => {
  const plain = rankAas([], {}, ['Human'])
  const granted = withGranted(plain, OWNER)
  const race = (rs: readonly AaRanked[]): number[] => rs.filter((r) => r.row.section === 'special').map((r) => r.rank)
  assert.deepEqual(race(granted), race(plain))
  assert.deepEqual(statCapOf(granted, [T]), statCapOf(plain, [T]))
})
