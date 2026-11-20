// What main remembers about the log read (fork #9): `src/main/dataServer/logReadState.ts`.
// The state is module-level (one app, one engine) and the wait outlives a launch, so every case
// starts with `fresh`: a turn for a log no other case used, then a new launch.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  logReadFacts,
  noteCombatRead,
  noteEngineSaid,
  noteLogReadConnection,
  noteLogReadError,
  noteLogReadHealth,
  noteLogReadTouched,
  noteLogReadTurn,
  noteReplySize,
  onLogReadChange
} from '../src/main/dataServer/logReadState'

const MIB = 1024 * 1024

let logs = 0
/** A log nobody has waited on yet, and a launch that has said nothing. Returns the log's path. */
function fresh(at: number): string {
  logs += 1
  const path = `C:\\Logs\\eqlog_Case${String(logs)}_test.txt`
  noteLogReadTurn(at, path)
  noteLogReadConnection(at)
  return path
}

function say(count: number, prefix: string): void {
  for (let i = 1; i <= count; i += 1) noteEngineSaid(`${prefix} ${String(i)}`)
}

// ---- 1. errors and what the engine said --------------------------------------------------------

test('an error keeps the last four lines the engine said, newest last', () => {
  fresh(1_000)
  say(20, 'line')
  noteLogReadError('attach', 'badParams: no such file', 2_000, 'badParams')
  const { error } = logReadFacts()
  assert.deepEqual(error, {
    step: 'attach',
    code: 'badParams',
    detail: 'badParams: no such file',
    at: 2_000,
    said: ['line 17', 'line 18', 'line 19', 'line 20']
  })
  // A snapshot: what the engine says afterwards does not rewrite what the error saw.
  say(3, 'later')
  assert.deepEqual(logReadFacts().error?.said, ['line 17', 'line 18', 'line 19', 'line 20'])
  // An error noted with no code has none, never an invented one.
  noteLogReadError('health', 'the connection closed', 2_500)
  assert.equal(logReadFacts().error?.code, null)
})

test('A READ THAT ENDED PICKS UP THE REASON LINE THAT ARRIVES AFTER IT WAS RECORDED', () => {
  // The idle answer comes over the socket and the reason over stderr, another pipe: the error is
  // recorded first and the line that explains it lands a moment later.
  fresh(1_000)
  noteEngineSaid('[engined] attached')
  noteLogReadError('fold', 'the engine reports idle after an accepted attach', 2_000)
  assert.deepEqual(logReadFacts().error?.said, ['[engined] attached'])
  noteEngineSaid('[engined] the ingest ended: Access is denied. (os error 5)')
  assert.deepEqual(logReadFacts().error?.said, [
    '[engined] attached',
    '[engined] the ingest ended: Access is denied. (os error 5)'
  ])
  // Still the newest four, however many arrive.
  say(6, 'more')
  assert.deepEqual(logReadFacts().error?.said, ['more 3', 'more 4', 'more 5', 'more 6'])
})

test('THE RING IS CLEARED ON A NEW LAUNCH: a new engine is not quoted with the last one-s words', () => {
  fresh(1_000)
  say(8, 'old engine')
  noteLogReadConnection(2_000)
  noteEngineSaid('the new engine')
  noteLogReadError('fold', 'idle', 3_000)
  assert.deepEqual(logReadFacts().error?.said, ['the new engine'])
  noteLogReadError('connect', 'ECONNREFUSED', 3_500)
  assert.deepEqual(logReadFacts().error?.said, ['the new engine'])
})

test('a new turn clears attach, health and fold errors', () => {
  for (const step of ['attach', 'health', 'fold'] as const) {
    const path = fresh(1_000)
    noteLogReadError(step, 'refused', 2_000)
    noteLogReadTurn(3_000, path)
    assert.equal(logReadFacts().error, null, `${step} survived the turn`)
  }
})

test('A CONNECT ERROR OUTLIVES A TURN, because the connection is per launch', () => {
  const path = fresh(1_000)
  noteLogReadError('connect', 'ECONNREFUSED', 2_000)
  noteLogReadTurn(3_000, path)
  assert.equal(logReadFacts().error?.step, 'connect')
  noteLogReadConnection(4_000)
  assert.equal(logReadFacts().error, null, 'a new launch starts clean')
})

// ---- 2. how long the app has been waiting ------------------------------------------------------

test('THE WAIT SURVIVES A NEW LAUNCH AND A REBUILD OF THE SAME LOG', () => {
  const path = fresh(1_000)
  noteLogReadHealth('folding', 4096, 5_000)
  // The engine died and was started again, twice; the world was rebuilt on the same log.
  noteLogReadConnection(20_000)
  noteLogReadTurn(21_000, path)
  noteLogReadConnection(40_000)
  noteLogReadTurn(41_000, path)
  assert.equal(logReadFacts().waitingSince, 1_000, 'a crash loop restarted the clock the box waits on')
})

test('THE WAIT RESTARTS ON ANOTHER LOG AND WHEN THE READ GOES LIVE', () => {
  const path = fresh(1_000)
  noteLogReadTurn(9_000, `${path}.other`)
  assert.equal(logReadFacts().waitingSince, 9_000, 'another log is another wait')
  noteLogReadTurn(12_000, null)
  assert.equal(logReadFacts().waitingSince, 12_000, 'no log is a change too')
  noteLogReadTurn(15_000, path)
  noteLogReadHealth('folding', 10, 16_000)
  assert.equal(logReadFacts().waitingSince, 15_000)
  noteLogReadHealth('live', 20, 30_000)
  assert.equal(logReadFacts().waitingSince, 30_000, 'going live ends the wait for the log')
  // Live is an edge: the answers after it do not move the clock again.
  noteLogReadHealth('live', 20, 31_000)
  assert.equal(logReadFacts().waitingSince, 30_000)
})

test('AFTER A READ LANDED, THE NEXT TURN OR LAUNCH STARTS A NEW WAIT', () => {
  // Hours after going live, a rebuild of the same log must not read as "waiting for hours".
  const path = fresh(1_000)
  noteLogReadHealth('live', 20, 2_000)
  noteLogReadTurn(9_000_000, path)
  assert.equal(logReadFacts().waitingSince, 9_000_000)
  // That turn has not landed, so the one after it continues the same wait.
  noteLogReadTurn(9_005_000, path)
  assert.equal(logReadFacts().waitingSince, 9_000_000)
  noteLogReadHealth('live', 20, 9_006_000)
  noteLogReadConnection(9_900_000)
  assert.equal(logReadFacts().waitingSince, 9_900_000, 'a new launch after a landed read')
})

// ---- 3. what a turn and a launch forget --------------------------------------------------------

test('a new turn forgets the last health answer, the offset and the meter-s last read', () => {
  const path = fresh(1_000)
  noteLogReadHealth('folding', 4096, 1_500)
  noteCombatRead('the engine is still folding', 'notLive', 1_600)
  noteLogReadTurn(9_000, path)
  assert.deepEqual(logReadFacts(), {
    health: null,
    lastOffset: null,
    movedAt: null,
    waitingSince: 1_000,
    error: null,
    lastCombatRead: null,
    tooLarge: null,
    large: null
  })
})

test('a new launch clears everything except how long the app has waited', () => {
  fresh(1_000)
  noteLogReadHealth('folding', 4096, 1_500)
  noteLogReadError('health', 'timeout', 1_600)
  noteCombatRead('the engine did not answer in time', 'timedOut', 1_700)
  noteReplySize({ op: 'combat.snapshot', module: null, chars: 70 * MIB, refused: true, limit: 64 * MIB }, 1_800)
  noteReplySize({ op: 'module.snapshot', module: 'loot', chars: 20 * MIB, refused: false, limit: null }, 1_900)
  noteLogReadConnection(5_000)
  assert.deepEqual(logReadFacts(), {
    health: null,
    lastOffset: null,
    movedAt: null,
    waitingSince: 1_000,
    error: null,
    lastCombatRead: null,
    tooLarge: null,
    large: null
  })
})

test('the newest reply that could not be shown and the newest large one are kept apart', () => {
  fresh(1_000)
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
  const path = fresh(1_000)
  noteReplySize({ op: 'combat.snapshot', module: null, chars: 70 * MIB, refused: true, limit: 64 * MIB }, 2_000)
  noteReplySize({ op: 'module.snapshot', module: 'loot', chars: 20 * MIB, refused: false, limit: null }, 2_100)
  noteLogReadTurn(3_000, path)
  assert.equal(logReadFacts().tooLarge, null)
  assert.equal(logReadFacts().large, null)
})

// ---- 4. health answers -------------------------------------------------------------------------

test('LIVE CLEARS THE ERROR: the read it was about has landed', () => {
  fresh(1_000)
  noteLogReadError('health', 'timeout', 2_000)
  noteLogReadHealth('folding', 10, 2_500)
  assert.equal(logReadFacts().error?.step, 'health', 'a folding answer proves nothing yet')
  noteLogReadHealth('live', 20, 3_000)
  assert.equal(logReadFacts().error, null)
  assert.deepEqual(logReadFacts().health, { status: 'live', at: 3_000, since: 3_000 })
})

test('movedAt advances only when the offset grows, and the offset outlives a read that ended', () => {
  const path = fresh(1_000)
  noteLogReadHealth('starting', undefined, 1_100)
  assert.equal(logReadFacts().movedAt, null, 'no mark is not movement')
  assert.equal(logReadFacts().lastOffset, null)
  noteLogReadHealth('folding', 4096, 1_200)
  assert.equal(logReadFacts().movedAt, 1_200)
  noteLogReadHealth('folding', 4096, 1_600)
  noteLogReadHealth('folding', 4000, 2_000)
  assert.equal(logReadFacts().movedAt, 1_200, 'the same mark, or an older one, is not movement')
  noteLogReadHealth('folding', 8192, 2_400)
  assert.equal(logReadFacts().movedAt, 2_400)
  // The read ends: the engine goes idle and reports no mark. Where it stopped is still known.
  noteLogReadHealth('idle', undefined, 2_800)
  noteLogReadError('fold', 'idle', 2_800)
  assert.equal(logReadFacts().lastOffset, 8192)
  // A new turn re-folds from byte zero, so its first mark counts as movement again.
  noteLogReadTurn(3_000, path)
  noteLogReadHealth('folding', 512, 3_400)
  assert.equal(logReadFacts().movedAt, 3_400)
  assert.equal(logReadFacts().lastOffset, 512)
})

test('`since` is when a status was first heard in a row, and opening the log is one status', () => {
  fresh(1_000)
  noteLogReadHealth('starting', undefined, 1_100)
  noteLogReadHealth('starting', undefined, 1_500)
  assert.deepEqual(logReadFacts().health, { status: 'starting', at: 1_500, since: 1_100 })
  // `starting` then `attaching` is still the engine opening the log.
  noteLogReadHealth('attaching', undefined, 1_900)
  assert.deepEqual(logReadFacts().health, { status: 'attaching', at: 1_900, since: 1_100 })
  noteLogReadHealth('folding', 10, 2_300)
  noteLogReadHealth('folding', 20, 2_700)
  assert.deepEqual(logReadFacts().health, { status: 'folding', at: 2_700, since: 2_300 })
})

// ---- 5. the meter's last read ------------------------------------------------------------------

test('the last combat read is remembered, served or not, with when it began going unserved', () => {
  fresh(1_000)
  noteCombatRead('the engine refused', 'refused', 1_500)
  noteCombatRead('the engine did not answer in time', 'timedOut', 2_500)
  assert.deepEqual(logReadFacts().lastCombatRead, {
    unserved: 'the engine did not answer in time',
    why: 'timedOut',
    at: 2_500,
    since: 1_500
  })
  noteCombatRead(null, null, 2_900)
  assert.deepEqual(logReadFacts().lastCombatRead, { unserved: null, why: null, at: 2_900, since: null })
  // One served read ends the run: the next unserved one starts its own.
  noteCombatRead('the engine refused', 'refused', 3_300)
  assert.equal(logReadFacts().lastCombatRead?.since, 3_300)
})

test('GOING LIVE FORGETS WHAT THE METER WAS TOLD WHILE THE LOG WAS BEING READ', () => {
  fresh(1_000)
  noteCombatRead('the engine is still folding', 'notLive', 1_500)
  noteLogReadHealth('folding', 10, 1_600)
  assert.equal(logReadFacts().lastCombatRead?.why, 'notLive')
  noteLogReadHealth('live', 20, 2_000)
  assert.equal(logReadFacts().lastCombatRead, null)
  // After live it is kept: a second live answer is not the edge.
  noteCombatRead('the engine refused', 'refused', 2_500)
  noteLogReadHealth('live', 20, 2_600)
  assert.equal(logReadFacts().lastCombatRead?.why, 'refused')
})

// ---- 6. the change listener --------------------------------------------------------------------

test('EVERY NOTE CALLS THE CHANGE LISTENER ONCE', () => {
  const path = fresh(1_000)
  let calls = 0
  onLogReadChange(() => {
    calls += 1
  })
  const notes: [string, () => void][] = [
    ['noteEngineSaid', () => noteEngineSaid('a line')],
    ['noteLogReadConnection', () => noteLogReadConnection(2_000)],
    ['noteLogReadTurn', () => noteLogReadTurn(2_100, path)],
    ['noteLogReadError', () => noteLogReadError('attach', 'refused', 2_200)],
    ['noteLogReadHealth', () => noteLogReadHealth('folding', 10, 2_300)],
    ['noteLogReadHealth live', () => noteLogReadHealth('live', 20, 2_400)],
    ['noteCombatRead', () => noteCombatRead(null, null, 2_500)],
    ['noteReplySize', () => noteReplySize({ op: 'combat.snapshot', module: null, chars: 1, refused: false, limit: null }, 2_600)],
    ['noteLogReadTouched', () => noteLogReadTouched()]
  ]
  for (const [name, note] of notes) {
    calls = 0
    note()
    assert.equal(calls, 1, `${name} called the listener ${String(calls)} times`)
  }
  // With no listener a note is still a note.
  onLogReadChange(null)
  assert.doesNotThrow(() => noteLogReadTouched())
})

test('the listener is called after the state changed, so it reads the new facts', () => {
  fresh(1_000)
  let seen: string | undefined
  onLogReadChange(() => {
    seen = logReadFacts().health?.status
  })
  noteLogReadHealth('folding', 10, 2_000)
  onLogReadChange(null)
  assert.equal(seen, 'folding')
})
