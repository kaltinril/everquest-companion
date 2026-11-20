// THE LINK KEEPER (fork #9): `src/main/dataServer/linkKeeper.ts`.
//
// Main opened ONE connection to its engine and never another: a connect that failed, or a
// connection that dropped while the engine was fine, left every panel on "Reading log..." for the
// life of that launch. The keeper reopens it, and every case below is one of its caps, because a
// recovery that loops blindly is a defect of its own.
//
// NOTHING HERE WAITS. The connect, the timer and the clock are handed in, so the ladder's 23.5
// seconds and the 60-second hold are driven by hand.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EngineError } from '../src/shared/dataServer/client'
import {
  LINK_MAX_RETRIES,
  LINK_RETRY_DELAYS_MS,
  LINK_STABLE_MS,
  createLinkKeeper,
  type LinkKeeper
} from '../src/main/dataServer/linkKeeper'

interface Channel {
  readonly n: number
  closed: boolean
  close(): void
}

interface Timer {
  readonly run: () => void
  readonly ms: number
  cancelled: boolean
  fired: boolean
}

interface Rig {
  readonly keeper: LinkKeeper
  /** How many connects were started. */
  connects: number
  readonly adopted: Channel[]
  readonly opened: Channel[]
  readonly timers: Timer[]
  readonly notes: string[]
  /** Settle the connect in flight. */
  open(): Promise<Channel>
  refuse(reason: string): Promise<void>
  /** Fire the one waiting timer of `ms`, moving the clock to it. */
  fire(ms: number): void
  waiting(): number[]
  now: number
}

function rig(): Rig {
  let settle: { resolve: (c: Channel) => void; reject: (e: Error) => void } | null = null
  const r: Rig = {
    connects: 0,
    adopted: [],
    opened: [],
    timers: [],
    notes: [],
    now: 1_000_000,
    keeper: undefined as unknown as LinkKeeper,
    open: async () => {
      const channel: Channel = {
        n: r.opened.length + 1,
        closed: false,
        close() {
          channel.closed = true
        }
      }
      r.opened.push(channel)
      settle?.resolve(channel)
      settle = null
      await Promise.resolve()
      return channel
    },
    refuse: async (reason) => {
      settle?.reject(new Error(reason))
      settle = null
      await Promise.resolve()
    },
    fire: (ms) => {
      const due = r.timers.filter((t) => !t.cancelled && !t.fired && t.ms === ms)
      assert.equal(due.length, 1, `expected one waiting ${String(ms)} ms timer, found ${String(due.length)}`)
      due[0].fired = true
      r.now += ms
      due[0].run()
    },
    waiting: () => r.timers.filter((t) => !t.cancelled && !t.fired).map((t) => t.ms)
  }
  ;(r as { keeper: LinkKeeper }).keeper = createLinkKeeper<Channel>({
    connect: () => {
      r.connects += 1
      return new Promise<Channel>((resolve, reject) => {
        settle = { resolve, reject }
      })
    },
    adopt: (channel) => r.adopted.push(channel),
    timer: (run, ms) => {
      const timer: Timer = { run, ms, cancelled: false, fired: false }
      r.timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    now: () => r.now,
    note: (line) => r.notes.push(line)
  })
  return r
}

/** Refuse the connect in flight and every retry after it, until the keeper stops asking. */
async function refuseUntilGivenUp(r: Rig): Promise<void> {
  await r.refuse('ECONNREFUSED')
  for (const ms of LINK_RETRY_DELAYS_MS) {
    r.fire(ms)
    await r.refuse('ECONNREFUSED')
  }
}

test('A FAILED FIRST CONNECT IS RETRIED ON THE LADDER', async () => {
  const r = rig()
  assert.equal(r.keeper.facts().everConnected, false)
  r.keeper.start()
  assert.equal(r.connects, 1)
  assert.deepEqual(r.keeper.facts(), {
    tries: 0,
    of: 5,
    nextAt: null,
    gaveUp: false,
    lastReason: null,
    everConnected: false
  })

  await r.refuse('ECONNREFUSED')
  assert.deepEqual(r.waiting(), [500])
  assert.deepEqual(r.keeper.facts(), {
    tries: 1,
    of: 5,
    nextAt: r.now + 500,
    gaveUp: false,
    lastReason: 'ECONNREFUSED',
    everConnected: false
  })
  assert.equal(r.connects, 1, 'the retry waits its turn')

  r.fire(500)
  assert.equal(r.connects, 2)
  assert.equal(r.keeper.facts().nextAt, null, 'nothing is waiting while a connect is in flight')
  await r.refuse('ETIMEDOUT')
  assert.deepEqual(r.waiting(), [1_000])
  assert.equal(r.keeper.facts().tries, 2)
  assert.equal(r.keeper.facts().lastReason, 'ETIMEDOUT')

  r.fire(1_000)
  const channel = await r.open()
  assert.deepEqual(r.adopted, [channel])
  assert.equal(r.keeper.facts().everConnected, true)
  assert.equal(r.keeper.facts().gaveUp, false)
  assert.equal(r.connects, 3)
})

test('FIVE FAILED TRIES IN A ROW GIVE UP, and tryNow starts again', async () => {
  const r = rig()
  r.keeper.start()
  await refuseUntilGivenUp(r)

  assert.deepEqual(
    r.timers.map((t) => t.ms),
    [500, 1_000, 2_000, 5_000, 15_000],
    'the ladder'
  )
  assert.equal(r.connects, 6, 'the first connect and five tries')
  assert.deepEqual(r.waiting(), [], 'nothing more is scheduled')
  const gaveUp = r.keeper.facts()
  assert.equal(gaveUp.gaveUp, true)
  assert.equal(gaveUp.tries, 5)
  assert.equal(gaveUp.nextAt, null)
  assert.equal(gaveUp.lastReason, 'ECONNREFUSED')
  assert.ok(r.notes[r.notes.length - 1].includes('gave up after 5 tries'))

  // A person asked: one connect now, and a fresh count in a row.
  r.keeper.tryNow()
  assert.equal(r.connects, 7)
  assert.equal(r.keeper.facts().gaveUp, false)
  assert.equal(r.keeper.facts().tries, 0)
  await r.refuse('ECONNREFUSED')
  assert.deepEqual(r.waiting(), [500], 'and the ladder starts from its first rung')
})

test('tryNow while a retry is waiting connects at once; while connected it does nothing', async () => {
  const r = rig()
  r.keeper.start()
  await r.refuse('ECONNREFUSED')
  r.fire(500)
  await r.refuse('ECONNREFUSED')
  assert.deepEqual(r.waiting(), [1_000])

  r.keeper.tryNow()
  assert.deepEqual(r.waiting(), [], 'the waiting retry was cancelled, not left to fire a second connect')
  assert.equal(r.connects, 3)
  r.keeper.tryNow()
  assert.equal(r.connects, 3, 'a connect is already in flight')

  await r.open()
  r.keeper.tryNow()
  assert.equal(r.connects, 3, 'a connection is up')
})

test('A LOST CONNECTION IS REOPENED, and 60 s of holding clears the count', async () => {
  const r = rig()
  r.keeper.start()
  await r.open()
  assert.deepEqual(r.waiting(), [LINK_STABLE_MS])

  // Lost before it had held: the count in a row climbs.
  r.keeper.lost(new EngineError('unavailable', 'the transport failed'))
  assert.deepEqual(r.waiting(), [500], 'the hold timer went with the connection')
  assert.equal(r.keeper.facts().tries, 1)
  assert.equal(r.keeper.facts().lastReason, 'unavailable: the transport failed')
  r.fire(500)
  await r.open()
  r.keeper.lost(new EngineError('unavailable', 'the transport failed'))
  assert.deepEqual(r.waiting(), [1_000])
  assert.equal(r.keeper.facts().tries, 2)
  r.fire(1_000)
  await r.open()

  // This one holds.
  r.fire(LINK_STABLE_MS)
  assert.equal(r.keeper.facts().tries, 0)
  r.keeper.lost(null)
  assert.deepEqual(r.waiting(), [500], 'a drop after a long hold starts the ladder again')
  assert.equal(r.keeper.facts().lastReason, 'the connection was lost')
  assert.equal(r.adopted.length, 3)
})

test('a loss while a retry is pending, or a connect is in flight, schedules nothing', async () => {
  const r = rig()
  r.keeper.start()
  r.keeper.lost(new EngineError('unavailable', 'late news about nothing'))
  assert.deepEqual(r.waiting(), [], 'a connect is in flight')
  await r.open()
  r.keeper.lost(new EngineError('unavailable', 'the transport failed'))
  r.keeper.lost(new EngineError('unavailable', 'the same loss, told twice'))
  assert.deepEqual(r.waiting(), [500])
  assert.equal(r.keeper.facts().tries, 1)
  assert.equal(r.keeper.facts().lastReason, 'unavailable: the transport failed')
})

test('A WRONG PROTOCOL VERSION OR A REFUSED TOKEN IS NEVER RETRIED', async () => {
  for (const code of ['protocolMismatch', 'unauthorized'] as const) {
    const r = rig()
    r.keeper.start()
    await r.open()
    r.keeper.lost(new EngineError(code, 'the engine said no'))
    assert.deepEqual(r.waiting(), [], `${code} was retried`)
    assert.equal(r.connects, 1)
    const facts = r.keeper.facts()
    assert.equal(facts.gaveUp, true)
    assert.equal(facts.lastReason, `${code}: the engine said no`)
    assert.equal(facts.tries, 0, 'it never tried')
  }
})

test('AT MOST 20 RETRIES PER ENGINE LAUNCH, however often the count in a row is cleared', async () => {
  const r = rig()
  r.keeper.start()
  await r.open()
  // A connection that holds a minute and then drops, for ever: the count in a row never passes 1.
  for (let i = 0; i < LINK_MAX_RETRIES; i++) {
    r.fire(LINK_STABLE_MS)
    r.keeper.lost(new EngineError('unavailable', 'dropped again'))
    assert.equal(r.keeper.facts().tries, 1)
    r.fire(500)
    await r.open()
  }
  assert.equal(r.connects, 1 + LINK_MAX_RETRIES)
  r.fire(LINK_STABLE_MS)
  r.keeper.lost(new EngineError('unavailable', 'dropped again'))
  assert.deepEqual(r.waiting(), [], 'retry 21 was scheduled')
  assert.equal(r.keeper.facts().gaveUp, true)
  assert.ok(r.notes[r.notes.length - 1].includes('20 retries since the engine started'))

  // A person asking still gets one attempt.
  r.keeper.tryNow()
  assert.equal(r.connects, 2 + LINK_MAX_RETRIES)
  await r.refuse('ECONNREFUSED')
  assert.equal(r.keeper.facts().gaveUp, true, 'and no automatic retry after it')
  assert.deepEqual(r.waiting(), [])
})

test('stop cancels a waiting retry, and closes a connection that opens afterwards', async () => {
  const waiting = rig()
  waiting.keeper.start()
  await waiting.refuse('ECONNREFUSED')
  waiting.keeper.stop()
  assert.deepEqual(waiting.waiting(), [])
  waiting.keeper.tryNow()
  waiting.keeper.lost(null)
  waiting.keeper.start()
  assert.equal(waiting.connects, 1, 'a stopped keeper connects for nobody')

  const inFlight = rig()
  inFlight.keeper.start()
  inFlight.keeper.stop()
  const late = await inFlight.open()
  assert.deepEqual(inFlight.adopted, [], 'a stopped keeper adopted a connection')
  assert.equal(late.closed, true, 'the connection nobody wanted was left open')
  assert.equal(inFlight.keeper.facts().everConnected, false)

  const up = rig()
  up.keeper.start()
  await up.open()
  up.keeper.stop()
  assert.deepEqual(up.waiting(), [], 'the hold timer outlived the keeper')
})

test('a connection nobody could adopt is closed and counted as a failed try', async () => {
  const notes: string[] = []
  const timers: number[] = []
  let closed = 0
  const keeper = createLinkKeeper({
    connect: () => Promise.resolve({ close: () => void (closed += 1) }),
    adopt: () => {
      throw new Error('the host was not ready')
    },
    timer: (_run, ms) => {
      timers.push(ms)
      return () => undefined
    },
    now: () => 0,
    note: (line) => notes.push(line)
  })
  keeper.start()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(closed, 1)
  assert.equal(keeper.facts().tries, 1)
  assert.equal(keeper.facts().lastReason, 'the host was not ready')
  assert.deepEqual(timers, [LINK_STABLE_MS, 500])
})
