// THE READ RECOVERS BY ITSELF WHEN A FACT CHANGES (fork #9, phase R4): `src/main/logReadRecovery.ts`.
//
// The policy and its caps are pinned in tests/dataServerReadRetry.test.mts. This drives the
// binding: the file watch, the one timed retry, what a new turn cancels, and each cap from the
// outside, with a hand-turned timer and a fake look at the file. A re-attach re-reads the whole
// log, so the cases that matter most are the ones where it must NOT be sent.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LogReadProbe } from '../src/shared/logReadReport'
import type { ReadEdge } from '../src/main/dataServer/readEdges'
import {
  AFTER_LIVE_WINDOW_MS,
  ENDED_RETRY_MS,
  FILE_BACK_CAP,
  FILE_WATCH_MS,
  STOPPED_AFTER_LIVE_LINE
} from '../src/main/dataServer/readRetry'
import { PROBE_KEEP_MS } from '../src/main/logProbe'
import { createLogReadRecovery, type LogReadRecovery } from '../src/main/logReadRecovery'

const LOG = 'C:\\EverQuest\\Logs\\eqlog_Alpha_test.txt'
const OTHER = 'C:\\EverQuest\\Logs\\eqlog_Bravo_test.txt'
const MIN = 60_000

type Seen = 'missing' | 'unreadable' | 'clean'

interface Rig {
  readonly recovery: LogReadRecovery
  /** How many times the engine was pointed at the log again. */
  reattaches: number
  /** Every "nothing more is tried" line, in order. */
  readonly stopped: string[]
  /** Every path main was asked to look at, in order. */
  readonly looks: string[]
  changes: number
  /** Timers armed and not yet run or cancelled. */
  pending(): number
  advance(ms: number): void
  /** The open of `path` that is out settles with `seen`. */
  answer(path: string, seen: Seen): void
  /** What main already knows about `path`, as a fresh answer with no open out. */
  known(path: string, seen: Seen): void
  edge(edge: ReadEdge, logPath?: string | null): void
}

function probeOf(seen: Seen): LogReadProbe {
  if (seen === 'clean') return { bytes: 4_096, problem: null, pendingMs: null }
  return { bytes: null, problem: seen, pendingMs: null }
}

function rig(): Rig {
  let now = 1_800_000_000_000
  let timers: { at: number; run: () => void }[] = []
  const last = new Map<string, { probe: LogReadProbe; at: number }>()
  const r: Rig = {
    reattaches: 0,
    stopped: [],
    looks: [],
    changes: 0,
    pending: () => timers.length,
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
    answer(path, seen) {
      last.set(path, { probe: probeOf(seen), at: now })
      r.recovery.probed()
    },
    known(path, seen) {
      last.set(path, { probe: probeOf(seen), at: now })
    },
    edge(edge, logPath = LOG) {
      r.recovery.edge(edge, logPath)
    },
    recovery: createLogReadRecovery({
      look: (path) => {
        r.looks.push(path)
        // `logProbe.ts look`: nothing while an open is out or the last answer is under 5 s old.
        const was = last.get(path)
        if (was !== undefined && (was.probe.pendingMs !== null || now - was.at < PROBE_KEEP_MS)) return
        // An open is out: whatever was known is old until it settles.
        const probe = { bytes: was?.probe.bytes ?? null, problem: was?.probe.problem ?? null, pendingMs: 0 }
        last.set(path, { probe, at: was?.at ?? 0 })
      },
      last: (path) => last.get(path)?.probe ?? null,
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
      changed: () => {
        r.changes += 1
      }
    })
  }
  return r
}

// ---- 1. the file main cannot open ----------------------------------------------------------------

test('A LOG THAT IS MISSING IS WATCHED EVERY 5 s, AND READ AGAIN THE MOMENT IT CAN BE OPENED', () => {
  const r = rig()
  r.edge('ended')
  assert.deepEqual(r.looks, [LOG], 'main looks at the file at once')
  r.answer(LOG, 'missing')
  assert.equal(r.recovery.watching(), true)
  assert.equal(r.reattaches, 0)
  // Three looks later it is still missing.
  for (let i = 0; i < 3; i += 1) {
    r.advance(FILE_WATCH_MS)
    r.answer(LOG, 'missing')
  }
  assert.equal(r.looks.length, 4)
  assert.equal(FILE_WATCH_MS, 5_000)
  // The player types /log on.
  r.advance(FILE_WATCH_MS)
  r.answer(LOG, 'clean')
  assert.equal(r.reattaches, 1)
  assert.equal(r.recovery.watching(), false)
  assert.equal(r.pending(), 0, 'nothing is left armed over the new read')
  assert.deepEqual(r.stopped, [])
  assert.equal(r.changes, 2, 'the status is told when the watch starts and when it ends')
})

test('a log another program holds is watched the same way, through a change of problem', () => {
  const r = rig()
  r.edge('ended')
  r.answer(LOG, 'unreadable')
  r.advance(FILE_WATCH_MS)
  r.answer(LOG, 'missing')
  assert.equal(r.reattaches, 0, 'one problem turning into another is not the file coming back')
  r.advance(FILE_WATCH_MS)
  r.answer(LOG, 'clean')
  assert.equal(r.reattaches, 1)
})

test('A DRIVE THAT NEVER ANSWERS is looked at and nothing more: no re-attach, no verdict', () => {
  const r = rig()
  r.edge('ended')
  r.advance(10 * MIN)
  assert.equal(r.reattaches, 0)
  assert.deepEqual(r.stopped, [])
  assert.equal(r.looks.length, 1 + (10 * MIN) / FILE_WATCH_MS)
  assert.equal(r.pending(), 1)
})

test('THE FILE COMING BACK RE-ATTACHES 5 TIMES AND THEN STOPS, and the screen stops promising', () => {
  const r = rig()
  // A lock that comes and goes for ever: every re-read ends on it again. Driven far past the cap.
  for (let flap = 0; flap < 20; flap += 1) {
    // The read runs a while before the lock ends it (past the cap, a person starts it).
    r.edge('turn', null)
    r.advance(10_000)
    r.edge('ended')
    r.answer(LOG, 'unreadable')
    assert.equal(r.recovery.watching(), flap < FILE_BACK_CAP, `flap ${String(flap)}`)
    assert.equal(r.pending(), flap < FILE_BACK_CAP ? 1 : 0, `flap ${String(flap)}`)
    r.advance(FILE_WATCH_MS)
    r.answer(LOG, 'clean')
  }
  assert.equal(r.reattaches, FILE_BACK_CAP, 'never a sixth, whatever the file does')
  assert.equal(r.stopped[0], 'stopped 6 times; not trying again by itself')
  assert.equal(r.stopped.length, 20 - FILE_BACK_CAP, 'every end past the cap says so again')
  assert.equal(r.recovery.watching(), false, 'a Try line may promise a retry only while one will come')
  assert.equal(r.pending(), 0)
})

test('with the cap used up, a look still out does not promise a retry either', () => {
  const r = rig()
  for (let i = 0; i < FILE_BACK_CAP; i += 1) {
    r.advance(10_000)
    r.edge('ended')
    r.answer(LOG, 'missing')
    r.advance(FILE_WATCH_MS)
    r.answer(LOG, 'clean')
  }
  assert.equal(r.reattaches, FILE_BACK_CAP)
  r.advance(10_000)
  r.edge('ended')
  assert.equal(r.pending(), 1, 'the look is waited for')
  assert.equal(r.recovery.watching(), false, 'the answer is not in, and no answer can lead to a re-attach')
  assert.deepEqual(r.stopped, [])
})

// ---- 2. a read that ended with the file openable -------------------------------------------------

test('A READ THAT ENDED WITH THE FILE OPENABLE IS TRIED ONCE MORE AFTER 2 s; the second end stops', () => {
  const r = rig()
  r.known(LOG, 'clean')
  r.edge('ended')
  assert.equal(r.recovery.watching(), false, 'a timed retry is not a file watch')
  r.advance(ENDED_RETRY_MS - 1)
  assert.equal(r.reattaches, 0)
  r.advance(1)
  assert.equal(r.reattaches, 1)
  // The retry ends the same way (a line the engine cannot get past).
  r.known(LOG, 'clean')
  r.edge('ended')
  assert.deepEqual(r.stopped, ['stopped twice; not trying again by itself'])
  r.advance(10 * MIN)
  assert.equal(r.reattaches, 1, 'never a third read by itself')
  assert.equal(r.pending(), 0)
  // A read a person started that ends again says the true count, and is not retried.
  r.known(LOG, 'clean')
  r.edge('turn', null)
  r.edge('ended')
  assert.deepEqual(r.stopped[1], 'stopped 3 times; not trying again by itself')
  r.advance(10 * MIN)
  assert.equal(r.reattaches, 1)
})

test('THE FIRST ANSWER AFTER THE END DECIDES: a file that was openable all along is one retry, not five', () => {
  const r = rig()
  r.edge('ended')
  // The open was out when the read ended; it comes back clean.
  r.answer(LOG, 'clean')
  assert.equal(r.reattaches, 0, 'not a file that came back: nothing said it was ever gone')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 1)
  r.edge('ended')
  r.answer(LOG, 'clean')
  assert.deepEqual(r.stopped, ['stopped twice; not trying again by itself'])
  r.advance(10 * MIN)
  assert.equal(r.reattaches, 1)
})

// ---- 3. nothing fires into a read that is running ------------------------------------------------

test('A NEW TURN CANCELS THE TIMED RETRY: a retry never starts while another read is running', () => {
  const r = rig()
  r.known(LOG, 'clean')
  r.edge('ended')
  // The player picks the character again inside the two seconds.
  r.edge('turn', null)
  r.advance(10 * MIN)
  assert.equal(r.reattaches, 0)
  assert.equal(r.pending(), 0)
})

test('A NEW TURN CANCELS THE FILE WATCH, and the file coming back then re-attaches nothing', () => {
  const r = rig()
  r.edge('ended')
  r.answer(LOG, 'missing')
  r.edge('turn', null)
  assert.equal(r.recovery.watching(), false)
  const looks = r.looks.length
  r.advance(10 * MIN)
  r.answer(LOG, 'clean')
  assert.equal(r.reattaches, 0)
  assert.equal(r.looks.length, looks, 'nothing looks at the file for a read that was replaced')
})

test('going live cancels what was armed, and the settle of another log-s open changes nothing', () => {
  const r = rig()
  r.edge('ended')
  r.answer(LOG, 'missing')
  r.answer(OTHER, 'clean')
  assert.equal(r.reattaches, 0)
  r.edge('live')
  r.advance(10 * MIN)
  r.answer(LOG, 'clean')
  assert.equal(r.reattaches, 0)
  assert.equal(r.pending(), 0)
})

test('an edge with no log arms nothing', () => {
  const r = rig()
  r.edge('ended', null)
  r.edge('endedAfterLive', null)
  assert.equal(r.pending(), 0)
  assert.deepEqual(r.looks, [])
})

// ---- 4. what going live clears -------------------------------------------------------------------

test('GOING LIVE GIVES THE PLAIN RETRY AND THE FILE WATCH BACK', () => {
  const r = rig()
  r.known(LOG, 'clean')
  r.edge('ended')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 1)
  r.edge('live')
  // Hours later another read of the same log ends.
  r.known(LOG, 'clean')
  r.edge('ended')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 2)
  assert.deepEqual(r.stopped, [])
})

test('a new engine launch gives them back too, and each log has its own counts', () => {
  const r = rig()
  r.known(LOG, 'clean')
  r.edge('ended')
  r.advance(ENDED_RETRY_MS)
  r.known(LOG, 'clean')
  r.edge('ended')
  assert.equal(r.stopped.length, 1)
  // Another character's log has used nothing.
  r.known(OTHER, 'clean')
  r.edge('ended', OTHER)
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 2)
  r.edge('launch', null)
  r.known(LOG, 'clean')
  r.edge('ended')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 3)
})

// ---- 5. the engine stopped reading after it was live ---------------------------------------------

test('AFTER LIVE: read again once, and NOT A SECOND TIME INSIDE 30 MINUTES, however often it went live', () => {
  const r = rig()
  r.edge('live')
  r.edge('endedAfterLive')
  assert.equal(r.reattaches, 0, 'a beat later, so the status says it stopped first')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 1)
  // The re-read lands, and ten minutes later the reader dies again. Driven past the cap.
  for (let i = 0; i < 10; i += 1) {
    r.edge('live')
    r.advance(2 * MIN)
    r.edge('turn', null)
    r.edge('endedAfterLive')
    r.advance(ENDED_RETRY_MS)
  }
  assert.equal(r.reattaches, 1, 'going live must not reset the after-live window')
  assert.equal(r.stopped.length, 10)
  assert.ok(r.stopped.every((line) => line === STOPPED_AFTER_LIVE_LINE))
  assert.equal(r.pending(), 0)
})

test('the same two ends 31 minutes apart are both read again; a new launch does not clear the window', () => {
  const r = rig()
  r.edge('live')
  r.edge('endedAfterLive')
  r.advance(ENDED_RETRY_MS)
  r.edge('live')
  r.edge('launch', null)
  r.advance(10 * MIN)
  r.edge('endedAfterLive')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 1, 'a relaunch inside the window is not a reason to read again')
  r.edge('live')
  r.advance(AFTER_LIVE_WINDOW_MS + MIN)
  r.edge('endedAfterLive')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 2)
})

test('A PERSON PRESSING TRY AGAIN CLEARS EVERY COUNT, the after-live window included', () => {
  const r = rig()
  r.edge('live')
  r.edge('endedAfterLive')
  r.advance(ENDED_RETRY_MS)
  r.edge('live')
  r.edge('endedAfterLive')
  assert.deepEqual(r.stopped, [STOPPED_AFTER_LIVE_LINE])
  // Try again: the host re-attaches (a new turn), then says a person asked.
  r.edge('turn', null)
  r.edge('manual', null)
  r.edge('live')
  r.edge('endedAfterLive')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 2)
  // And the plain retry is whole again as well.
  r.known(LOG, 'clean')
  r.edge('ended')
  r.advance(ENDED_RETRY_MS)
  r.known(LOG, 'clean')
  r.edge('ended')
  assert.equal(r.stopped.length, 2)
  r.edge('manual', null)
  r.known(LOG, 'clean')
  r.edge('ended')
  r.advance(ENDED_RETRY_MS)
  assert.equal(r.reattaches, 4)
})

test('a new turn inside the beat cancels the after-live re-read too', () => {
  const r = rig()
  r.edge('live')
  r.edge('endedAfterLive')
  r.edge('turn', null)
  r.advance(10 * MIN)
  assert.equal(r.reattaches, 0)
})
