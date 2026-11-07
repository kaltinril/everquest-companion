// progressionSettle.test.mts — the XP overlay's "did only the clock move?" read (shared/progressionSettle.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import { sameButLastTs } from '../src/shared/progressionSettle'
import { EMPTY_PROGRESSION } from '../src/renderer/src/features/leveling/progressionDelta'

const T = 1_700_000_000_000

function snap(over: Partial<ProgressionSnap>): ProgressionSnap {
  return { ...EMPTY_PROGRESSION, ...over }
}

test('a push that moved only lastTs reads the same; an identical snapshot does too', () => {
  const a = snap({ expTs: [T, T + 1000], expPct: [1, 2], lastTs: T + 1000 })
  const b = snap({ expTs: [T, T + 1000], expPct: [1, 2], lastTs: T + 5000 })
  assert.equal(sameButLastTs(a, b), true)
  assert.equal(sameButLastTs(a, { ...a }), true)
  assert.equal(sameButLastTs(a, a), true)
})

test('a column that grew, or whose last entry changed, is a real move', () => {
  const a = snap({ expTs: [T], expPct: [1], lastTs: T })
  assert.equal(sameButLastTs(a, snap({ expTs: [T, T + 1], expPct: [1, 2], lastTs: T + 1 })), false)
  assert.equal(sameButLastTs(a, snap({ expTs: [T], expPct: [1.5], lastTs: T + 1 })), false)
  // An object row compares by its fields, not its identity: a re-deserialized push is the same row.
  const k = snap({ recentKills: [{ ts: T, name: 'a rat', credit: 0, zone: 'Qeynos Hills' }], lastTs: T })
  const same = snap({ recentKills: [{ ts: T, name: 'a rat', credit: 0, zone: 'Qeynos Hills' }], lastTs: T + 9 })
  const moved = snap({ recentKills: [{ ts: T + 1, name: 'a bat', credit: 0, zone: 'Qeynos Hills' }], lastTs: T + 9 })
  assert.equal(sameButLastTs(k, same), true)
  assert.equal(sameButLastTs(k, moved), false)
})

test('a scalar other than lastTs moving is a real move', () => {
  const a = snap({ lastTs: T, dropped: 0 })
  assert.equal(sameButLastTs(a, snap({ lastTs: T + 1, dropped: 3 })), false)
  assert.equal(sameButLastTs(a, snap({ lastTs: T + 1, windowStart: T - 1 })), false)
})
