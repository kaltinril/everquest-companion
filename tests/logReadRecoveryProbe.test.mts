// THE RECOVERY ON THE REAL PROBE (fork #9, phase R4): `src/main/logReadRecovery.ts` bound to
// `src/main/logProbe.ts` the way `src/main/logReadReport.ts` binds them.
//
// tests/logReadRecovery.test.mts drives the recovery with a hand-made look at the file. The probe
// keeps a settled answer for 5 s, and that rule is what once let the recovery decide a read's end
// on a look taken BEFORE the engine tried the file. So here the probe is the real one: only the
// open (a hand-made promise), the clock and the timer are faked.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENDED_RETRY_MS, FILE_BACK_CAP, FILE_WATCH_MS } from '../src/main/dataServer/readRetry'
import { PROBE_MAX_FLIGHTS, createLogProbe } from '../src/main/logProbe'
import { createLogReadRecovery, type LogReadRecovery } from '../src/main/logReadRecovery'

const LOG = 'C:\\EverQuest\\Logs\\eqlog_Alpha_test.txt'
const B = 'D:\\Share\\eqlog_Bravo_test.txt'
const C = 'D:\\Share\\eqlog_Charlie_test.txt'

type Seen = 'missing' | 'unreadable' | 'clean'

interface Flight {
  readonly path: string
  resolve(bytes: number): void
  reject(err: unknown): void
}

interface Rig {
  readonly recovery: LogReadRecovery
  readonly probe: ReturnType<typeof createLogProbe>
  /** Every open of a file main started, in order. */
  readonly flights: Flight[]
  reattaches: number
  readonly stopped: string[]
  advance(ms: number): void
  /** The open numbered `index` comes back. */
  settle(index: number, seen: Seen): Promise<void>
  /** The last open started comes back. */
  answer(seen: Seen): Promise<void>
}

function rig(): Rig {
  let now = 1_800_000_000_000
  let timers: { at: number; run: () => void }[] = []
  const flights: Flight[] = []
  const probe = createLogProbe({
    open: (path) =>
      new Promise<number>((resolve, reject) => {
        flights.push({ path, resolve, reject })
      }),
    now: () => now
  })
  const r: Rig = {
    probe,
    flights,
    reattaches: 0,
    stopped: [],
    advance(ms) {
      const until = now + ms
      for (;;) {
        const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0]
        if (due === undefined) break
        timers = timers.filter((t) => t !== due)
        now = due.at
        due.run()
      }
      now = until
    },
    async settle(index, seen) {
      if (seen === 'clean') flights[index].resolve(4_096)
      else flights[index].reject(Object.assign(new Error(seen), { code: seen === 'missing' ? 'ENOENT' : 'EBUSY' }))
      await new Promise<void>((resolve) => setImmediate(resolve))
    },
    answer: (seen) => r.settle(flights.length - 1, seen),
    recovery: createLogReadRecovery({
      look: (path, since) => {
        probe.look(path, since)
      },
      last: (path) => probe.last(path),
      answeredAt: (path) => probe.answeredAt(path),
      reattach: () => {
        r.reattaches += 1
        // What the host does: a re-attach is a new turn.
        r.recovery.edge('turn', null)
      },
      stopped: (line) => r.stopped.push(line),
      timer: (run, ms) => {
        const timer = { at: now + ms, run }
        timers.push(timer)
        return () => {
          timers = timers.filter((t) => t !== timer)
        }
      },
      now: () => now,
      note: () => undefined,
      changed: () => undefined
    })
  }
  probe.onSettled(() => {
    r.recovery.probed()
  })
  return r
}

test('A LOCK THAT COMES AND GOES EVERY FEW SECONDS: 5 file-back re-attaches, never the plain retry, then stop', async () => {
  const r = rig()
  r.recovery.edge('ended', LOG)
  await r.answer('unreadable')
  assert.equal(r.recovery.watching(), true)
  // Driven far past the cap. Every re-read ends 200 ms after main saw the file openable.
  for (let flap = 0; flap < 20; flap += 1) {
    const opens = r.flights.length
    r.advance(FILE_WATCH_MS)
    // Past the cap nothing watches the file, so no open is out to answer.
    if (r.flights.length > opens) await r.answer('clean')
    r.advance(200)
    r.recovery.edge('ended', LOG)
    assert.equal(r.probe.pending(LOG), true, `flap ${String(flap)}: the end is decided on a new open`)
    await r.answer('unreadable')
    assert.equal(r.recovery.watching(), flap + 1 < FILE_BACK_CAP, `flap ${String(flap)}`)
    // The two seconds of a plain retry pass: none was armed.
    r.advance(ENDED_RETRY_MS)
    assert.equal(r.reattaches, Math.min(flap + 1, FILE_BACK_CAP), `flap ${String(flap)}`)
  }
  assert.equal(r.reattaches, FILE_BACK_CAP)
  assert.equal(r.stopped[0], 'stopped 6 times; not trying again by itself')
  assert.equal(r.recovery.watching(), false)
})

test('THE RETRY-S OWN END IS DECIDED ON A NEW OPEN: a file that went missing meanwhile is watched, not given up', async () => {
  const r = rig()
  r.recovery.edge('ended', LOG)
  await r.answer('clean')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 1)
  // The retry ends 300 ms later; main's "clean" is 2.3 s old, inside the probe's 5 s keep.
  r.advance(300)
  r.recovery.edge('ended', LOG)
  assert.equal(r.flights.length, 2)
  assert.deepEqual(r.stopped, [], 'nothing is said on the old answer')
  await r.answer('missing')
  assert.equal(r.recovery.watching(), true)
  assert.deepEqual(r.stopped, [])
  r.advance(FILE_WATCH_MS)
  await r.answer('clean')
  assert.equal(r.reattaches, 2)
})

test('an end with the file openable is still one retry and then the stopped line', async () => {
  const r = rig()
  r.recovery.edge('ended', LOG)
  await r.answer('clean')
  r.advance(ENDED_RETRY_MS)
  r.advance(300)
  r.recovery.edge('ended', LOG)
  await r.answer('clean')
  assert.equal(r.reattaches, 1)
  assert.deepEqual(r.stopped, ['stopped twice; not trying again by itself'])
  assert.equal(r.flights.length, 2, 'one open per end')
})

test('AN OPEN THAT NEVER COMES BACK IS STILL ISSUED ONCE, however many reads end', () => {
  const r = rig()
  for (let i = 0; i < 50; i += 1) {
    r.recovery.edge('ended', LOG)
    r.advance(700)
    r.recovery.edge('turn', null)
    r.advance(700)
  }
  assert.equal(r.flights.length, 1)
  assert.equal(r.reattaches, 0)
  assert.deepEqual(r.stopped, [])
})

test('WHEN NO OPEN CAN BE STARTED the old answer is waited out, not decided on', async () => {
  const r = rig()
  r.probe.look(LOG)
  await r.answer('clean')
  r.advance(1_000)
  // Two other logs sit on a share that has stopped answering: the probe will start no third open.
  r.probe.look(B)
  r.probe.look(C)
  assert.equal(r.flights.length, 1 + PROBE_MAX_FLIGHTS)
  r.recovery.edge('ended', LOG)
  assert.equal(r.flights.length, 1 + PROBE_MAX_FLIGHTS)
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 0, 'the answer is from before the end')
  // One of the hung opens comes back: the next look at the watched log gets through.
  await r.settle(1, 'missing')
  assert.equal(r.reattaches, 0)
  r.advance(FILE_WATCH_MS)
  assert.equal(r.flights.at(-1)?.path, LOG)
  await r.answer('clean')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 1)
})
