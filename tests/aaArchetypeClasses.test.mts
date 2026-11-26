// Which classes have each Archetype AA (src/shared/aaArchetypeClasses.ts), from the game's
// /alternateadv list runs of 2026-11-25, and the Archetype tab's My classes filter over it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARCHETYPE_BY_CLASS, WAR_OR_MNK_UNSPLIT, archetypeFit, archetypeRows } from '../src/shared/aaArchetypeClasses'
import { AA_TABLE } from '../src/shared/aaTable.generated'
import { aaSectionRows, rankAas } from '../src/shared/aaRanks'
import type { AASpendEvent } from '../src/shared/types'

const WIKI = new Set(AA_TABLE.filter((r) => r.section === 'archetype').map((r) => r.name))
const MAPPED = [...WAR_OR_MNK_UNSPLIT, ...Object.values(ARCHETYPE_BY_CLASS).flat()]

test('every name in the map is a wiki Archetype row, and every wiki Archetype row was in some run', () => {
  for (const name of MAPPED) assert.ok(WIKI.has(name), name)
  for (const name of WIKI) assert.ok(MAPPED.includes(name), name)
})

test("each class has exactly the run's list (MEASURED.md counts), no name twice", () => {
  const counts = Object.fromEntries(Object.entries(ARCHETYPE_BY_CLASS).map(([c, names]) => [c, names.length]))
  assert.deepEqual(counts, { SHM: 19, SHD: 13, WIZ: 14, NEC: 19, PAL: 13, RNG: 15, ROG: 1, DRU: 21, ENC: 17, MAG: 16, BRD: 12, BST: 17, BER: 0, CLR: 17 })
  for (const [c, names] of Object.entries(ARCHETYPE_BY_CLASS)) assert.equal(new Set(names).size, names.length, c)
  assert.equal(WAR_OR_MNK_UNSPLIT.length, 10)
  assert.ok(!('WAR' in ARCHETYPE_BY_CLASS) && !('MNK' in ARCHETYPE_BY_CLASS), 'WAR and MNK are kept unsplit, not guessed')
})

test('the ten unsplit AAs are mine with WAR or MNK, and only may apply without either', () => {
  assert.equal(archetypeFit('Rampage', ['WAR', 'SHM']), 'mine')
  assert.equal(archetypeFit('Point Blank Fire', ['MNK']), 'mine')
  assert.equal(archetypeFit('Rampage', ['SHM', 'CLR']), 'mayApply')
  assert.equal(archetypeFit('Exodus', ['WIZ']), 'mine')
  assert.equal(archetypeFit('Exodus', ['SHM', 'WAR']), 'other')
  assert.equal(archetypeFit("Thiefs Intuition", ['ROG']), 'mine', 'apostrophes do not count')
  assert.equal(archetypeFit('A New Archetype AA', ['ROG']), 'mayApply', 'never measured')
})

test('My classes on the owner\'s WAR/SHM/MNK: the shaman list and the ten; a rank held always shows', () => {
  const spends: AASpendEvent[] = [{ ts: 1, ability: 'Exodus', cost: 9 }]
  const rows = aaSectionRows(rankAas(spends, {}), 'archetype')
  const mine = archetypeRows(rows, ['WAR', 'SHM', 'MNK'])
  assert.equal(mine.mayApply.length, 0)
  const names = new Set(mine.mine.map((r) => r.row.name))
  assert.equal(names.size, 10 + 19 + 1, 'the ten, the 19 shaman AAs, and Exodus (held)')
  assert.ok(names.has('Exodus') && !names.has('Innate Camouflage'))
  const rogue = archetypeRows(rows, ['ROG', 'BER'])
  assert.deepEqual(rogue.mine.map((r) => r.row.name).sort(), ['Exodus', "Thief's Intuition"])
  assert.equal(rogue.mayApply.length, 10, 'the ten, under May apply')
})
