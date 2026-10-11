// The Buffs tab's conflict rows, from the engine's `buffConflicts` state (src/shared/buffConflicts.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conflictKey, conflictOutcome, conflictTarget, type BuffConflictRow } from '../src/shared/buffConflicts'

const row = (over: Partial<BuffConflictRow>): BuffConflictRow => ({
  kind: 'blocked',
  spell: 'Journeyman Boots',
  count: 25,
  firstTs: 1,
  lastTs: 2,
  ...over
})

test('a blocked cast names its blocker, and one with no reason says so', () => {
  assert.equal(conflictOutcome(row({ blockedBy: 'Illusion Benefit Dena' })), 'Blocked by Illusion Benefit Dena')
  assert.equal(conflictOutcome(row({})), 'Did not take hold')
})

test('an overwritten buff reads as overwritten', () => {
  assert.equal(conflictOutcome(row({ kind: 'overwritten', spell: 'Resist Fire', target: 'Malkil' })), 'Overwritten')
})

test('a row with no target was cast on you', () => {
  assert.equal(conflictTarget(row({})), 'you')
  assert.equal(conflictTarget(row({ target: 'Malkil' })), 'Malkil')
})

test('the key tells apart what happened, the blocker and the target, and ignores the count', () => {
  const keys = new Set([
    conflictKey(row({})),
    conflictKey(row({ blockedBy: 'Rune IV' })),
    conflictKey(row({ target: 'Malkil' })),
    conflictKey(row({ kind: 'overwritten' }))
  ])
  assert.equal(keys.size, 4)
  assert.equal(conflictKey(row({ count: 1 })), conflictKey(row({ count: 9 })))
})
