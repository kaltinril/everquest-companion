// The engine keys the observed-rank map under its own rule (apostrophes kept); every TypeScript
// reader asks under `spellLineKey` (apostrophes dropped). `normalizeObservedRanks` is the join,
// and it is idempotent so a reader need not know which side wrote the map (2026-09-25).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeObservedRanks, observedRankRow, type ObservedSpellRanksSnap } from '../src/shared/spellRanks'
import { debuffAmount } from '../src/shared/resistTerms'
import { SPELLS } from './resistFixtures.mts'

const ENGINE_KEYED: ObservedSpellRanksSnap = {
  "denon's disruptive discord": {
    key: "denon's disruptive discord",
    name: "Denon's Disruptive Discord",
    rank: 4,
    merges: 0,
    firstAt: 1,
    lastAt: 2
  },
  mesmerization: { key: 'mesmerization', name: 'Mesmerization', rank: 3, merges: 0, firstAt: 1, lastAt: 2 }
}

test('an engine-keyed apostrophe line answers under the TypeScript key once normalized', () => {
  assert.equal(observedRankRow(ENGINE_KEYED, "Denon's Disruptive Discord IV"), undefined)
  const folded = normalizeObservedRanks(ENGINE_KEYED)
  assert.equal(observedRankRow(folded, "Denon's Disruptive Discord IV")?.rank, 4)
  assert.equal(observedRankRow(folded, 'Mesmerization VII')?.rank, 3)
  // The row keeps the engine's spelling of its key; only the index moved.
  assert.equal(folded['denons disruptive discord']?.key, "denon's disruptive discord")
  assert.deepEqual(normalizeObservedRanks(folded), folded)
})

test('a resist-debuff key as the engine writes it reaches the client table', () => {
  // The fixture's key is already folded; an engine key with an apostrophe must find the same row.
  assert.equal(debuffAmount("test's malo", 'magic', 60, { "tests malo": SPELLS['test malo'] }), 40)
})
