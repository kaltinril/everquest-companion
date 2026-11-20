// THE TURN AND THE RECOVERY TOGETHER (fork #9, phase R4): a read ends, the recovery hears the
// edge, and what it does is a new turn against the same fake engine. Each half has its own suite
// (dataServerAttachTurn, logReadRecovery); this joins them the way `engineClientHost.ts` does, to
// count the one thing that matters end to end: HOW MANY TIMES THE WHOLE LOG IS READ.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LogReadProbe } from '../src/shared/logReadReport'
import { ENDED_RETRY_MS, FILE_WATCH_MS } from '../src/main/dataServer/readRetry'
import { createLogReadRecovery, type LogReadRecovery } from '../src/main/logReadRecovery'
import { LOG_A, held, rig, settle, type AttachAnswer, type Rig } from './dataServerAttachTurnRig.mts'

interface Flow {
  readonly r: Rig
  readonly recovery: LogReadRecovery
  readonly stopped: string[]
  /** Main's own look at the file: what an open of it answers. */
  file: 'missing' | 'unreadable' | 'clean'
  /** Run the timers due in the next `ms`, then let the turns they started run. */
  advance(ms: number): Promise<void>
  /** The open of the log that is out settles with what the file is now. */
  looked(): Promise<void>
}

function probeOf(file: Flow['file'], pending: boolean): LogReadProbe {
  const problem = file === 'clean' ? null : file
  return { bytes: file === 'clean' ? 4_096 : null, problem, pendingMs: pending ? 0 : null }
}

function flow(): Flow {
  const r = rig()
  let now = 1_800_000_000_000
  let timers: { at: number; run: () => void }[] = []
  let last: LogReadProbe | null = null
  let answeredAt: number | null = null
  const f: Flow = {
    r,
    stopped: [],
    file: 'clean',
    async advance(ms) {
      const until = now + ms
      for (;;) {
        const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0]
        if (due === undefined) break
        timers = timers.filter((t) => t !== due)
        now = due.at
        due.run()
        await settle()
      }
      now = until
    },
    async looked() {
      last = probeOf(f.file, false)
      answeredAt = now
      f.recovery.probed()
      await settle()
    },
    recovery: createLogReadRecovery({
      // Every look opens the file: the answer comes when the case says `looked`.
      look: () => {
        if (last?.pendingMs === null || last === null) last = probeOf(f.file, true)
      },
      last: () => last,
      answeredAt: () => answeredAt,
      // `reattachEngineLog`: a new turn that forgets the attach.
      reattach: () => {
        r.attached = null
        void r.turn(LOG_A)
      },
      stopped: (line) => f.stopped.push(line),
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
  r.edges = (edge, logPath) => {
    f.recovery.edge(edge, logPath)
  }
  return f
}

test('THE LOG WAS MISSING AT LAUNCH AND APPEARS LATER: read once it can be opened, with nobody pressing anything', async () => {
  const f = flow()
  f.r.engineCanOpen = false
  f.file = 'missing'
  await f.r.turn(LOG_A)
  assert.deepEqual(f.r.failed, [['ended', 'the engine reports idle after an accepted attach']])
  await f.looked()
  assert.equal(f.recovery.watching(), true)
  // A minute of looking at a file that is not there sends nothing.
  for (let i = 0; i < 12; i += 1) {
    await f.advance(FILE_WATCH_MS)
    await f.looked()
  }
  assert.equal(f.r.attaches.length, 1)
  // The player types /log on.
  f.r.engineCanOpen = true
  f.file = 'clean'
  await f.advance(FILE_WATCH_MS)
  await f.looked()
  assert.equal(f.r.attaches.length, 2, 'the engine was pointed at the log again')
  assert.deepEqual(f.r.liveOn, [LOG_A])
  assert.equal(f.recovery.watching(), false)
  assert.deepEqual(f.stopped, [])
})

test('A READ THAT ENDS EVERY TIME (a line the engine cannot get past) IS READ TWICE AND NO MORE', async () => {
  const f = flow()
  f.r.engineCanOpen = false
  f.file = 'clean'
  await f.r.turn(LOG_A)
  await f.looked()
  assert.equal(f.r.attaches.length, 1)
  await f.advance(ENDED_RETRY_MS)
  await f.looked()
  assert.equal(f.r.attaches.length, 2, 'the one retry')
  assert.deepEqual(f.stopped, ['stopped twice; not trying again by itself'])
  // An hour later nothing more was sent.
  await f.advance(3_600_000)
  assert.equal(f.r.attaches.length, 2)
  assert.deepEqual(f.r.liveOn, [])
})

test('A RETRY NEVER STARTS WHILE ANOTHER READ OF THE LOG IS RUNNING', async () => {
  const f = flow()
  f.r.engineCanOpen = false
  f.file = 'clean'
  await f.r.turn(LOG_A)
  await f.looked()
  // Inside the two seconds the player presses Try again: a read whose attach is still out.
  f.r.engineCanOpen = true
  const reply = held<AttachAnswer>()
  f.r.attachScripts.push({ reply })
  f.r.attached = null
  const manual = f.r.turn(LOG_A)
  await settle()
  assert.equal(f.r.attaches.length, 2)
  await f.advance(60_000)
  assert.equal(f.r.attaches.length, 2, 'the timed retry fired into a running read')
  reply.resolve({ epoch: 2, accepted: true })
  await manual
  assert.deepEqual(f.r.liveOn, [LOG_A])
  assert.equal(f.r.attaches.length, 2)
})

test('the retry that lands gives the retry back: a later end is tried once more again', async () => {
  const f = flow()
  f.r.engineCanOpen = false
  await f.r.turn(LOG_A)
  await f.looked()
  f.r.engineCanOpen = true
  await f.advance(ENDED_RETRY_MS)
  assert.deepEqual(f.r.liveOn, [LOG_A])
  // Hours later a rebuild's read ends.
  f.r.engineCanOpen = false
  f.r.attached = null
  await f.advance(3_600_000)
  await f.r.turn(LOG_A)
  await f.looked()
  f.r.engineCanOpen = true
  await f.advance(ENDED_RETRY_MS)
  assert.equal(f.r.attaches.length, 4)
  assert.deepEqual(f.r.liveOn, [LOG_A, LOG_A])
  assert.deepEqual(f.stopped, [])
})
