// Main's own look at the log file (fork #9, phase R2): `src/main/logProbe.ts`. The case that
// matters cannot be staged against a real disk: an open that never comes back. So the open is a
// hand-made promise and the clock a number.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROBE_KEEP_MS,
  PROBE_MAX_FLIGHTS,
  createLogProbe,
  probeProblem,
  worthALook
} from '../src/main/logProbe'

const A = 'D:\\EverQuest\\Logs\\eqlog_A_test.txt'
const B = 'D:\\EverQuest\\Logs\\eqlog_B_test.txt'

interface Flight {
  readonly path: string
  resolve(bytes: number): void
  reject(err: unknown): void
}

function rig(): {
  probe: ReturnType<typeof createLogProbe>
  flights: Flight[]
  clock: { now: number }
  settled: { count: number }
} {
  const flights: Flight[] = []
  const clock = { now: 1_000_000 }
  const settled = { count: 0 }
  const probe = createLogProbe({
    open: (path) =>
      new Promise<number>((resolve, reject) => {
        flights.push({ path, resolve, reject })
      }),
    now: () => clock.now
  })
  probe.onSettled(() => {
    settled.count += 1
  })
  return { probe, flights, clock, settled }
}

function errno(code: string): Error {
  return Object.assign(new Error(`${code}: operation failed`), { code })
}

/** Let a settled open's `then` run. */
async function turn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

test('AN OPEN THAT NEVER RESOLVES IS ISSUED ONCE, however many times anything looks', () => {
  const { probe, flights, clock } = rig()
  assert.equal(probe.last(A), null, 'nothing was ever asked')
  for (let i = 0; i < 500; i += 1) {
    probe.look(A)
    clock.now += 3_000
  }
  assert.equal(flights.length, 1, 'a hung drive was handed more than one pool thread')
  assert.equal(probe.pending(A), true)
})

test('`last` answers at once with how long the open has been out', () => {
  const { probe, clock } = rig()
  probe.look(A)
  assert.deepEqual(probe.last(A), { bytes: null, problem: null, pendingMs: 0 })
  clock.now += 3_000
  assert.equal(probe.last(A)?.pendingMs, 3_000)
  clock.now += 12_000
  assert.equal(probe.last(A)?.pendingMs, 15_000)
  clock.now += 3_600_000
  assert.equal(probe.last(A)?.pendingMs, 3_615_000, 'it keeps growing for as long as the drive is silent')
})

test('A SETTLED ANSWER IS KEPT 5 s, and then a look opens the file again', async () => {
  const { probe, flights, clock, settled } = rig()
  probe.look(A)
  flights[0].resolve(4096)
  await turn()
  assert.deepEqual(probe.last(A), { bytes: 4096, problem: null, pendingMs: null })
  assert.equal(settled.count, 1, 'whoever is waiting on the answer was told')
  assert.equal(probe.pending(A), false)

  clock.now += PROBE_KEEP_MS - 1
  probe.look(A)
  assert.equal(flights.length, 1, 'a fresh answer was asked for again')

  clock.now += 1
  probe.look(A)
  assert.equal(flights.length, 2)
  // While the second open is out the first answer is still what is known, with the wait beside it.
  clock.now += 2_000
  assert.deepEqual(probe.last(A), { bytes: 4096, problem: null, pendingMs: 2_000 })
  flights[1].reject(errno('ENOENT'))
  await turn()
  assert.deepEqual(probe.last(A), { bytes: null, problem: 'missing', pendingMs: null })
  assert.equal(settled.count, 2)
})

test('ENOENT is missing; EACCES, EBUSY and anything else is unreadable', async () => {
  assert.equal(probeProblem(errno('ENOENT')), 'missing')
  for (const code of ['EACCES', 'EBUSY', 'EPERM', 'EISDIR', 'EIO']) {
    assert.equal(probeProblem(errno(code)), 'unreadable', code)
  }
  assert.equal(probeProblem(new Error('no code at all')), 'unreadable')
  assert.equal(probeProblem(null), 'unreadable')

  const { probe, flights } = rig()
  probe.look(A)
  flights[0].reject(errno('EBUSY'))
  await turn()
  assert.deepEqual(probe.last(A), { bytes: null, problem: 'unreadable', pendingMs: null })
})

test('a second path has its own flight and its own answer', async () => {
  const { probe, flights } = rig()
  probe.look(A)
  probe.look(B)
  assert.deepEqual(flights.map((f) => f.path), [A, B])
  flights[1].resolve(7)
  await turn()
  assert.deepEqual(probe.last(B), { bytes: 7, problem: null, pendingMs: null })
  assert.equal(probe.last(A)?.pendingMs, 0, 'the first path is still out')
  assert.equal(probe.pending(B), false)
})

test('NO MORE THAN TWO OPENS ARE EVER OUT: hung opens on several logs cannot take the whole pool', async () => {
  const { probe, flights } = rig()
  const paths = [A, B, 'D:\\Logs\\eqlog_C_test.txt', 'D:\\Logs\\eqlog_D_test.txt', 'D:\\Logs\\eqlog_E_test.txt']
  for (const path of paths) probe.look(path)
  assert.equal(flights.length, PROBE_MAX_FLIGHTS)
  // The third path was never opened, so nothing is claimed about it.
  assert.equal(probe.last(paths[2]), null)
  // One comes back: there is room for one more.
  flights[0].reject(errno('EACCES'))
  await turn()
  probe.look(paths[2])
  assert.equal(flights.length, PROBE_MAX_FLIGHTS + 1)
  assert.equal(flights[2].path, paths[2])
})

test('an open that throws instead of rejecting is an answer, not a crash', async () => {
  const probe = createLogProbe({
    open: () => {
      throw errno('ENOENT')
    },
    now: () => 5
  })
  assert.doesNotThrow(() => probe.look(A))
  await turn()
  assert.deepEqual(probe.last(A), { bytes: null, problem: 'missing', pendingMs: null })
})

// ---- when the report looks at all --------------------------------------------------------------

const NOW = 2_000_000
function health(status: string, forMs: number): { status: string; at: number; since: number } {
  return { status, at: NOW, since: NOW - forMs }
}

test('THE FILE IS OPENED ONLY ON THE FAILURE PATH: a healthy read never has main look', () => {
  const healthy = { error: null, health: health('folding', 600_000), movedAt: NOW - 400 }
  assert.equal(worthALook(healthy, NOW), false)
  assert.equal(worthALook({ error: null, health: null, movedAt: null }, NOW), false, 'nothing known yet')
  assert.equal(worthALook({ error: null, health: health('live', 9_000_000), movedAt: NOW - 9_000_000 }, NOW), false)
  assert.equal(worthALook({ error: null, health: health('attaching', 14_999), movedAt: null }, NOW), false)
  // An attach or health error says nothing about the file.
  const attach = { step: 'attach', code: 'badParams', detail: 'refused', at: NOW, said: [] } as const
  assert.equal(worthALook({ error: attach, health: null, movedAt: null }, NOW), false)
})

test('it looks when the read ended, has been opening for 15 s, or has not moved for a minute', () => {
  const fold = { step: 'fold', code: null, detail: 'idle', at: NOW, said: [] } as const
  assert.equal(worthALook({ error: fold, health: null, movedAt: null }, NOW), true)
  assert.equal(worthALook({ error: null, health: health('idle', 0), movedAt: null }, NOW), true)
  assert.equal(worthALook({ error: null, health: health('starting', 15_000), movedAt: null }, NOW), true)
  assert.equal(worthALook({ error: null, health: health('attaching', 15_000), movedAt: null }, NOW), true)
  assert.equal(worthALook({ error: null, health: health('folding', 90_000), movedAt: NOW - 60_000 }, NOW), true)
  assert.equal(worthALook({ error: null, health: health('folding', 90_000), movedAt: NOW - 59_999 }, NOW), false)
})
