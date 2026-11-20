// The publisher of the log-read status (fork #9, phase R2): `src/main/logReadStatus.ts`.
// What is said is pushed when it changes; numbers alone never storm; a verdict that moves with the
// clock is composed again without anybody poking.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS_NET_MS,
  STATUS_NUMBERS_EVERY_MS,
  STATUS_TICK_MS,
  createLogReadStatus,
  shouldTick,
  statusChanged
} from '../src/main/logReadStatus'
import type { LogReadFacts, LogReadReport } from '../src/shared/logReadReport'
import { MB, NOW, error, health, report } from './logReadFactsHarness.mts'

const SHOWN = { waitingSince: 0 }
const LIVE = { readiness: 'ok', health: health('live') }

// ---- 1. what counts as a change ----------------------------------------------------------------

test('NUMBERS ALONE ARE NOT A CHANGE OF STATUS', () => {
  const a = report(SHOWN)
  const moved = report({
    ...SHOWN,
    fold: { offset: 200 * MB, logSize: 413 * MB, events: 2_000_000, pct: 48.4 },
    lastOffset: 200 * MB,
    movedAt: NOW
  })
  assert.notEqual(a.offset, moved.offset)
  assert.notEqual(a.pct, moved.pct)
  assert.notEqual(a.events, moved.events)
  assert.notEqual(a.logBytes, moved.logBytes)
  assert.equal(statusChanged(a, moved), false)
  // Nor is the instant the wait is counted from, nor the engine's quoted lines.
  assert.equal(statusChanged(a, { ...a, waitingSince: 5, engineSaid: ['a new line'] }), false)
  assert.equal(statusChanged(a, { ...a }), false)
})

test('a change of what the player is told IS one, field by field', () => {
  const a = report(SHOWN)
  assert.equal(statusChanged(null, a), true, 'the first report is always news')
  const changes: [string, Partial<LogReadReport>][] = [
    ['wait', { wait: 'stalled' }],
    ['show', { show: false }],
    ['tryLine', { tryLine: 'Press Try again.' }],
    ['action', { action: 'reattach' }],
    ['engine', { engine: 'running, connecting (try 2 of 5)' }],
    ['lastError', { lastError: 'read: the reply was 71.2 MB, over the 64.0 MB limit' }],
    ['logFile', { logFile: 'eqlog_Other_freeport.txt' }],
    ['notes', { notes: [{ id: 'large', text: 'Your log is getting large.' }] }]
  ]
  for (const [field, over] of changes) {
    assert.equal(statusChanged(a, { ...a, ...over }), true, `${field} changed and nothing was pushed`)
  }
  // A note that changed its words, its Try line or its button is a change too.
  const noted = { ...a, notes: [{ id: 'large', text: 'Your log is getting large.' }] }
  assert.equal(statusChanged(noted, { ...noted, notes: [{ id: 'large', text: 'Your log is large.' }] }), true)
  assert.equal(statusChanged(noted, { ...noted, notes: [{ ...noted.notes[0], tryLine: 'Archive it.' }] }), true)
  assert.equal(statusChanged(noted, { ...noted, notes: [{ ...noted.notes[0] }] }), false)
})

test('`shouldTick` is false for ok, noCharacter and a shown terminal wait', () => {
  assert.equal(shouldTick(report(LIVE)), false)
  assert.equal(shouldTick(report({ logPath: null })), false)
  const terminal: Partial<LogReadFacts>[] = [
    { supervisor: 'absent' },
    { fault: { kind: 'exited', attempts: 3, detail: null } },
    { health: null, error: error('attach', 'badParams') },
    { health: health('idle'), error: error('fold') },
    { health: health('idle'), probe: { bytes: null, problem: 'missing', pendingMs: null } },
    { readiness: 'notAttached', health: health('live') }
  ]
  for (const over of terminal) {
    const r = report(over)
    assert.equal(r.show, true, r.wait)
    assert.equal(shouldTick(r), false, `${r.wait} is composed every second for nothing`)
  }
})

test('`shouldTick` is true while the verdict can move with the clock, shown or not', () => {
  const clocked: Partial<LogReadFacts>[] = [
    {},
    { supervisor: 'backoff' },
    { connection: 'failed' },
    { fold: null, movedAt: null, lastOffset: null, health: health('attaching', 60_000) },
    { movedAt: NOW - 60_000 },
    { fold: null, logSize: 400 * MB, lastOffset: 400 * MB, movedAt: NOW - 120_000 },
    { probe: { bytes: null, problem: null, pendingMs: 15_000 }, movedAt: NOW - 60_000 },
    { ...LIVE, combatReads: [{ key: 'a', unserved: 'refused', why: 'refused', code: null, at: NOW, since: NOW - 60_000 }] },
    // The meter's verdicts lapse with the clock, whichever of the three they are.
    { ...LIVE, combatReads: [{ key: 'a', unserved: 'timed out', why: 'timedOut', code: null, at: NOW, since: NOW - 60_000 }] },
    { ...LIVE, combatReads: [{ key: 'a', unserved: 'too large', why: 'tooLarge', code: null, at: NOW, since: NOW - 60_000 }] }
  ]
  const seen: string[] = []
  for (const over of clocked) {
    for (const waitingSince of [NOW, 0]) {
      const r = report({ ...over, waitingSince })
      seen.push(r.wait)
      assert.equal(shouldTick(r), true, `${r.wait} (show ${String(r.show)}) is left to go stale`)
    }
  }
  for (const wait of ['reading', 'engineStarting', 'connecting', 'opening', 'stalled', 'finishing', 'logHung', 'notAnswering', 'panelSlow', 'replyTooLarge']) {
    assert.ok(seen.includes(wait), `${wait} was not exercised`)
  }
  // Any wait that is not shown yet will be once it has run long: it ticks until then.
  const quiet = report({ health: null, error: error('attach', 'timeout'), waitingSince: NOW })
  assert.equal(quiet.show, false)
  assert.equal(shouldTick(quiet), true)
})

// ---- 2. the publisher --------------------------------------------------------------------------

interface Rig {
  status: ReturnType<typeof createLogReadStatus>
  sent: LogReadReport[]
  built: { count: number }
  clock: { now: number }
  /** Run what `defer` was handed. */
  settle(): void
  /** Move the clock and fire every timer that came due, in order. */
  advance(ms: number): void
  set(next: LogReadReport): void
  pending: { on: boolean }
}

function rig(first: LogReadReport): Rig {
  let current = first
  const sent: LogReadReport[] = []
  const built = { count: 0 }
  const clock = { now: 50_000 }
  const pending = { on: false }
  let deferred: (() => void)[] = []
  let timers: { at: number; run: () => void }[] = []
  const status = createLogReadStatus({
    build: () => {
      built.count += 1
      return current
    },
    send: (r) => sent.push(r),
    timer: (run, ms) => {
      const entry = { at: clock.now + ms, run }
      timers.push(entry)
      return () => {
        timers = timers.filter((t) => t !== entry)
      }
    },
    now: () => clock.now,
    defer: (run) => deferred.push(run),
    pending: () => pending.on
  })
  return {
    status,
    sent,
    built,
    clock,
    pending,
    settle: () => {
      const runs = deferred
      deferred = []
      for (const run of runs) run()
    },
    advance: (ms) => {
      const until = clock.now + ms
      for (;;) {
        const next = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0]
        if (next === undefined) break
        timers = timers.filter((t) => t !== next)
        clock.now = next.at
        next.run()
      }
      clock.now = until
    },
    set: (next) => {
      current = next
    }
  }
}

test('the first report is sent when the publisher starts, and `last` is what was sent', () => {
  const r = rig(report(LIVE))
  assert.equal(r.status.last(), null)
  r.status.poke()
  r.settle()
  assert.equal(r.sent.length, 0, 'nothing is sent before it is started')
  r.status.start()
  assert.equal(r.sent.length, 1)
  assert.equal(r.status.last(), r.sent[0])
})

test('ANY NUMBER OF POKES IN ONE BREATH COMPOSE THE REPORT ONCE', () => {
  const r = rig(report(LIVE))
  r.status.start()
  const before = r.built.count
  for (let i = 0; i < 200; i += 1) r.status.poke()
  assert.equal(r.built.count, before, 'a poke composes nothing itself: the code that poked is still running')
  r.settle()
  assert.equal(r.built.count, before + 1)
  assert.equal(r.sent.length, 1, 'nothing changed, so nothing was sent')
})

test('A CHANGE OF STATUS IS SENT AT ONCE', () => {
  const r = rig(report(LIVE))
  r.status.start()
  r.set(report({ health: health('idle'), error: error('fold') }))
  r.status.poke()
  r.settle()
  assert.equal(r.sent.length, 2)
  assert.equal(r.sent[1].wait, 'readerStopped')
})

test('NUMBERS ALONE NEVER STORM: at most one send every 2 s while the status shows', () => {
  const r = rig(report(SHOWN))
  r.status.start()
  // A fold reporting progress four times a second for ten seconds, each frame a poke.
  for (let i = 1; i <= 40; i += 1) {
    r.advance(250)
    r.set(report({ ...SHOWN, lastOffset: i * MB, fold: { offset: i * MB, logSize: 400 * MB, events: i, pct: i / 4 } }))
    r.status.poke()
    r.settle()
  }
  const numbers = r.sent.length - 1
  assert.ok(numbers <= 10_000 / STATUS_NUMBERS_EVERY_MS, `${String(numbers)} sends in 10 s`)
  assert.ok(numbers >= 4, 'the numbers on screen were left to go stale')
  for (let i = 1; i < r.sent.length; i += 1) assert.equal(statusChanged(r.sent[i - 1], r.sent[i]), false)
})

test('numbers are not sent at all while nothing is drawing them', () => {
  const r = rig(report({ waitingSince: NOW }))
  r.status.start()
  assert.equal(r.sent[0].show, false)
  for (let i = 1; i <= 40; i += 1) {
    r.advance(250)
    r.set(report({ waitingSince: NOW, lastOffset: i * MB, fold: { offset: i * MB, logSize: 400 * MB, events: i, pct: i / 4 } }))
    r.status.poke()
    r.settle()
  }
  assert.equal(r.sent.length, 1)
})

test('numbers that were held back are sent when their 2 s is up, with no further poke', () => {
  // The reason line of a read that ended arrives on stderr a moment after the status was sent.
  const stopped = report({ health: health('idle'), error: error('fold') })
  const r = rig(stopped)
  r.status.start()
  r.advance(100)
  r.set({ ...stopped, engineSaid: ['[engined] the ingest ended: Access is denied.'] })
  r.status.poke()
  r.settle()
  assert.equal(r.sent.length, 1, 'inside the 2 s it waits')
  r.advance(STATUS_NUMBERS_EVERY_MS)
  assert.equal(r.sent.length, 2, 'the line never reached the box')
  assert.deepEqual(r.sent[1].engineSaid, ['[engined] the ingest ended: Access is denied.'])
})

test('A VERDICT THAT MOVES WITH THE CLOCK IS COMPOSED AGAIN EVERY SECOND, with nobody poking', () => {
  const r = rig(report({ waitingSince: NOW }))
  r.status.start()
  const before = r.built.count
  r.advance(STATUS_TICK_MS * 5)
  assert.equal(r.built.count - before, 5)
  // The clock made it stalled: that is a change, and it is sent.
  r.set(report({ movedAt: NOW - 60_000 }))
  r.advance(STATUS_TICK_MS)
  assert.equal(r.sent.at(-1)?.wait, 'stalled')
})

test('a status that only an event can change is composed by the 10 s net and nothing else', () => {
  const r = rig(report(LIVE))
  r.status.start()
  const before = r.built.count
  r.advance(STATUS_NET_MS * 3)
  assert.equal(r.built.count - before, 3)
  assert.equal(r.sent.length, 1, 'the net sends nothing when nothing changed')
  // A poke nobody sent is caught by it.
  r.set(report({ health: health('idle'), error: error('fold') }))
  r.advance(STATUS_NET_MS)
  assert.equal(r.sent.length, 2)
})

test('it ticks while main-s open of the log is out, whatever the wait', () => {
  const r = rig(report({ health: health('idle'), error: error('fold') }))
  r.pending.on = true
  r.status.start()
  const before = r.built.count
  r.advance(STATUS_TICK_MS * 3)
  assert.equal(r.built.count - before, 3)
  r.pending.on = false
  r.advance(STATUS_TICK_MS)
  const settled = r.built.count
  r.advance(STATUS_TICK_MS * 4)
  assert.equal(r.built.count, settled, 'it went on ticking after the open came back')
})

test('stop ends every timer and ignores pokes', () => {
  const r = rig(report({ waitingSince: NOW }))
  r.status.start()
  r.status.stop()
  const before = r.built.count
  r.status.poke()
  r.settle()
  r.advance(STATUS_NET_MS * 3)
  assert.equal(r.built.count, before)
  assert.equal(r.sent.length, 1)
})

test('a compose that throws does not end the net', () => {
  let fail = false
  let builds = 0
  let timers: { at: number; run: () => void }[] = []
  let now = 0
  const status = createLogReadStatus({
    build: () => {
      builds += 1
      if (fail) throw new Error('compose failed')
      return report(LIVE)
    },
    send: () => undefined,
    timer: (run, ms) => {
      const entry = { at: now + ms, run }
      timers.push(entry)
      return () => {
        timers = timers.filter((t) => t !== entry)
      }
    },
    now: () => now,
    defer: (run) => {
      run()
    }
  })
  status.start()
  fail = true
  const due = timers
  timers = []
  now = STATUS_NET_MS
  assert.throws(() => {
    for (const t of due) t.run()
  })
  fail = false
  assert.equal(timers.length, 1, 'the net was not armed again')
  const before = builds
  now = STATUS_NET_MS * 2
  timers[0].run()
  assert.equal(builds, before + 1)
})
