// What main remembers about the log read (fork #9): `src/main/dataServer/logReadState.ts`.
// The state is module-level (one app, one engine), so every case starts from a new connection,
// which clears everything except the engine's own words.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  logReadFacts,
  noteCombatRead,
  noteEngineSaid,
  noteLogReadConnection,
  noteLogReadError,
  noteLogReadHealth,
  noteLogReadTurn,
  noteReplySize
} from '../src/main/dataServer/logReadState'

const MIB = 1024 * 1024

function say(count: number, prefix: string): void {
  for (let i = 1; i <= count; i += 1) noteEngineSaid(`${prefix} ${String(i)}`)
}

test('an error keeps the last four lines the engine said, newest last', () => {
  noteLogReadConnection(1_000)
  say(20, 'line')
  noteLogReadError('fold', 'the engine reports idle after an accepted attach', 2_000)
  const { error } = logReadFacts()
  assert.deepEqual(error, {
    step: 'fold',
    detail: 'the engine reports idle after an accepted attach',
    at: 2_000,
    said: ['line 17', 'line 18', 'line 19', 'line 20']
  })
  // A snapshot: what the engine says afterwards does not rewrite what the error saw.
  say(3, 'later')
  assert.deepEqual(logReadFacts().error?.said, ['line 17', 'line 18', 'line 19', 'line 20'])
})

test('what the engine said outlives a new connection', () => {
  noteLogReadConnection(1_000)
  say(8, 'kept')
  noteLogReadConnection(2_000)
  noteEngineSaid('the newest')
  noteLogReadError('connect', 'ECONNREFUSED', 3_000)
  assert.deepEqual(logReadFacts().error?.said, ['kept 6', 'kept 7', 'kept 8', 'the newest'])
})

test('a new turn clears attach, health and fold errors', () => {
  for (const step of ['attach', 'health', 'fold'] as const) {
    noteLogReadConnection(1_000)
    noteLogReadError(step, 'refused', 2_000)
    noteLogReadTurn(3_000)
    assert.equal(logReadFacts().error, null, `${step} survived the turn`)
  }
})

test('A CONNECT ERROR OUTLIVES A TURN, because the connection is per launch', () => {
  noteLogReadConnection(1_000)
  noteLogReadError('connect', 'ECONNREFUSED', 2_000)
  noteLogReadTurn(3_000)
  assert.equal(logReadFacts().error?.step, 'connect')
  noteLogReadConnection(4_000)
  assert.equal(logReadFacts().error, null, 'a new launch starts clean')
})

test('a new turn restarts the wait and forgets the last health answer', () => {
  noteLogReadConnection(1_000)
  noteLogReadHealth('folding', 4096, 1_500)
  noteLogReadTurn(9_000)
  assert.deepEqual(logReadFacts(), {
    health: null,
    movedAt: null,
    waitingSince: 9_000,
    error: null,
    lastCombatRead: null,
    tooLarge: null,
    large: null
  })
})

test('a new connection clears everything it can', () => {
  noteLogReadConnection(1_000)
  noteLogReadHealth('folding', 4096, 1_500)
  noteLogReadError('health', 'timeout', 1_600)
  noteCombatRead('the engine did not answer in time', 'timedOut', 1_700)
  noteReplySize({ op: 'combat.snapshot', module: null, chars: 70 * MIB, refused: true, limit: 64 * MIB }, 1_800)
  noteReplySize({ op: 'module.snapshot', module: 'loot', chars: 20 * MIB, refused: false, limit: null }, 1_900)
  noteLogReadConnection(5_000)
  assert.deepEqual(logReadFacts(), {
    health: null,
    movedAt: null,
    waitingSince: 5_000,
    error: null,
    lastCombatRead: null,
    tooLarge: null,
    large: null
  })
})

test('the newest reply that could not be shown and the newest large one are kept apart', () => {
  noteLogReadConnection(1_000)
  const refused = { op: 'module.snapshot', module: 'loot', chars: 70 * MIB, refused: true, limit: 64 * MIB }
  const unshown = { op: 'combat.snapshot', module: null, chars: 40 * MIB, refused: false, limit: 32 * MIB }
  const shown = { op: 'module.snapshot', module: 'events', chars: 20 * MIB, refused: false, limit: null }

  noteReplySize(refused, 2_000)
  assert.deepEqual(logReadFacts().tooLarge, { ...refused, at: 2_000 })
  assert.equal(logReadFacts().large, null)

  // A large reply that WAS shown does not displace the one that was not.
  noteReplySize(shown, 2_100)
  assert.deepEqual(logReadFacts().tooLarge, { ...refused, at: 2_000 })
  assert.deepEqual(logReadFacts().large, { ...shown, at: 2_100 })

  // The newest of each kind wins.
  noteReplySize(unshown, 2_200)
  noteReplySize({ ...shown, chars: 21 * MIB }, 2_300)
  assert.deepEqual(logReadFacts().tooLarge, { ...unshown, at: 2_200 })
  assert.equal(logReadFacts().large?.chars, 21 * MIB)
})

test('A NEW TURN FORGETS BOTH: a reply-s size is a fact about one read of the log', () => {
  noteLogReadConnection(1_000)
  noteReplySize({ op: 'combat.snapshot', module: null, chars: 70 * MIB, refused: true, limit: 64 * MIB }, 2_000)
  noteReplySize({ op: 'module.snapshot', module: 'loot', chars: 20 * MIB, refused: false, limit: null }, 2_100)
  noteLogReadTurn(3_000)
  assert.equal(logReadFacts().tooLarge, null)
  assert.equal(logReadFacts().large, null)
})

test('LIVE CLEARS THE ERROR: the read it was about has landed', () => {
  noteLogReadConnection(1_000)
  noteLogReadError('health', 'timeout', 2_000)
  noteLogReadHealth('folding', 10, 2_500)
  assert.equal(logReadFacts().error?.step, 'health', 'a folding answer proves nothing yet')
  noteLogReadHealth('live', 20, 3_000)
  assert.equal(logReadFacts().error, null)
  assert.deepEqual(logReadFacts().health, { status: 'live', at: 3_000 })
})

test('movedAt advances only when the offset grows', () => {
  noteLogReadConnection(1_000)
  noteLogReadHealth('starting', undefined, 1_100)
  assert.equal(logReadFacts().movedAt, null, 'no mark is not movement')
  noteLogReadHealth('folding', 4096, 1_200)
  assert.equal(logReadFacts().movedAt, 1_200)
  noteLogReadHealth('folding', 4096, 1_600)
  noteLogReadHealth('folding', 4000, 2_000)
  assert.equal(logReadFacts().movedAt, 1_200, 'the same mark, or an older one, is not movement')
  assert.deepEqual(logReadFacts().health, { status: 'folding', at: 2_000 })
  noteLogReadHealth('folding', 8192, 2_400)
  assert.equal(logReadFacts().movedAt, 2_400)
  // A new turn re-folds from byte zero, so its first mark counts as movement again.
  noteLogReadTurn(3_000)
  noteLogReadHealth('folding', 512, 3_400)
  assert.equal(logReadFacts().movedAt, 3_400)
})

test('the last combat read is remembered, served or not', () => {
  noteLogReadConnection(1_000)
  noteCombatRead('the engine refused', 'refused', 1_500)
  assert.deepEqual(logReadFacts().lastCombatRead, { unserved: 'the engine refused', why: 'refused', at: 1_500 })
  noteCombatRead(null, null, 1_900)
  assert.deepEqual(logReadFacts().lastCombatRead, { unserved: null, why: null, at: 1_900 })
})
