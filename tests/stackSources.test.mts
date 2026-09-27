// THE STACKING ROWS, AND WHAT EACH ONE CASTS WITH ITSELF (src/main/resist/stackSources.ts).
//
// Hand-authored rows to the shape the parser produces, `spellStack.test.mts`'s own law: not one
// byte of the client file is in this repo.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stackViewsFor } from '../src/main/resist/stackSources'
import { spellCanonKey } from '../src/shared/spellKey'
import type { SpellEffectSlot, SpellResistInfo, SpellResistTable } from '../src/shared/resistTypes'

const at = (slot: number, effect: number, base: number, limit = 0): SpellEffectSlot => ({
  slot,
  effect,
  base,
  limit,
  calc: 100,
  max: 0
})

function row(id: number, slots: SpellEffectSlot[] | undefined): SpellResistInfo {
  return {
    id,
    axis: null,
    resistAdj: 0,
    castMs: 0,
    targetType: 6,
    ...(slots === undefined ? {} : { slots, goodEffect: true, durationFormula: 3, durationValue: 360 })
  }
}

const table: SpellResistTable = {
  [spellCanonKey('Wolf Shape')]: row(427, [at(1, 58, 796), at(2, 475, 100, 40593)]),
  [spellCanonKey('Shape Benefit')]: row(40593, [at(2, 3, 35), at(3, 2, 1)]),
  [spellCanonKey('Plain Buff')]: row(60, [at(1, 46, 10)]),
  [spellCanonKey('Points Nowhere')]: row(61, [at(1, 475, 100, 99999)]),
  [spellCanonKey('Points At An Instant')]: row(62, [at(1, 475, 100, 63)]),
  [spellCanonKey('An Instant')]: row(63, undefined)
}

test('a row that casts a second spell carries that spell`s row with it', () => {
  const out = stackViewsFor(table, ['Wolf Shape', 'Plain Buff'])
  assert.equal(out['Wolf Shape'].id, 427)
  assert.deepEqual(
    out['Wolf Shape'].triggers?.map((t) => [t.id, t.slots?.length]),
    [[40593, 2]]
  )
  // A row that triggers nothing says nothing, rather than an empty list.
  assert.equal('triggers' in out['Plain Buff'], false)
})

test('a trigger the table cannot answer for is left off, never invented', () => {
  const out = stackViewsFor(table, ['Points Nowhere', 'Points At An Instant'])
  assert.equal('triggers' in out['Points Nowhere'], false)
  // A row with no duration kept no slots, so it is nothing a stacking question can use.
  assert.equal('triggers' in out['Points At An Instant'], false)
})

test('the door still refuses what it refused', () => {
  assert.deepEqual(stackViewsFor(table, [42, '', 'x'.repeat(200), 'Nobody Wrote This', 'An Instant']), {})
})
