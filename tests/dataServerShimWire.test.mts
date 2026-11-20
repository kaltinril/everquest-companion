// THE READ SHIM'S ONE REQUEST PER QUESTION, AND A REPLY TOO LARGE TO SHOW (fork #9).
//
// `tests/dataServerShim.test.mts` is the shim's fallback matrix; this file is beside it because
// that one is near the file-size ceiling, and because every case here needs a clock it can move:
//
//   * A READ THAT TIMED OUT IS JOINED, NOT RE-SENT. The caller waits 2 s, the client waits 15 s.
//     The next poll used to send a second identical request while the first was still running.
//   * A MODULE READ WAITS LONGER than the meter does (`timeoutFor`).
//   * A REPLY TOO LARGE answers `tooLarge`, and is not asked for again in this read of the log.
//   * A LARGE REPLY'S NEXT REQUEST IS HELD for a floor, and whoever asks meanwhile shares it.
//
// TIME IS MOVED BY HAND: `delay` sleeps on a fake clock and `advance` wakes what came due.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createReadShim,
  SERVABLE,
  type FallbackReason,
  type Readiness,
  type ReadShim,
  type SizeGate
} from '../src/main/dataServer/readShim'
import { EngineError, type ParamsFor, type RequestOp, type ResultFor } from '../src/shared/dataServer/ops'
import { TransportError } from '../src/shared/dataServer/transport'
import { LARGE_MESSAGE_CHARS } from '../src/shared/dataServer/ndjson'
import { LARGE_REPLY_FLOOR_MS, MAX_FORWARD_CHARS, createReplySizes } from '../src/main/dataServer/replySizes'

const MODULE = 'module.snapshot'
const COMBAT = 'combat.snapshot'
const LOOT_KEY = 'module.snapshot {"module":"loot"}'

/** Let every settled promise run its continuations. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

interface Wire {
  readonly op: RequestOp
  readonly params: unknown
  answer(result: unknown): Promise<void>
  refuse(error: unknown): Promise<void>
}

interface Rig {
  readonly shim: ReadShim
  /** Every request that reached the wire, in order. */
  readonly wires: Wire[]
  /** Every finished read: `served`, or the reason it was not. */
  readonly seen: (FallbackReason | 'served')[]
  now(): number
  /** Move the clock, waking every sleeper that came due, in order. */
  advance(ms: number): Promise<void>
}

interface RigOptions {
  sizeGate?: SizeGate
  timeoutFor?: (op: RequestOp) => number | undefined
  readiness?: () => Readiness
}

function rig(opts: RigOptions = {}): Rig {
  let at = 1_000_000
  const sleepers: { due: number; wake: () => void }[] = []
  const wires: Wire[] = []
  const seen: (FallbackReason | 'served')[] = []
  const shim = createReadShim({
    readiness: () => SERVABLE,
    request: <O extends RequestOp>(op: O, params: ParamsFor<O>): Promise<ResultFor<O>> =>
      new Promise<ResultFor<O>>((resolve, reject) => {
        wires.push({
          op,
          params,
          answer: async (result) => {
            resolve(result as ResultFor<O>)
            await settle()
          },
          refuse: async (error) => {
            reject(error)
            await settle()
          }
        })
      }),
    note: () => undefined,
    now: () => at,
    timeoutMs: 2_000,
    noteEveryMs: 5_000,
    delay: (ms) =>
      new Promise<void>((resolve) => {
        sleepers.push({ due: at + ms, wake: resolve })
      }),
    observe: (_op, _ms, _phrase, why) => seen.push(why ?? 'served'),
    ...opts
  })
  return {
    shim,
    wires,
    seen,
    now: () => at,
    advance: async (ms) => {
      const until = at + ms
      for (;;) {
        const due = sleepers.filter((s) => s.due <= until).sort((a, b) => a.due - b.due)
        if (due.length === 0) break
        sleepers.splice(sleepers.indexOf(due[0]), 1)
        at = due[0].due
        due[0].wake()
        await settle()
      }
      at = until
      await settle()
    }
  }
}

const EMPTY = { seq: 0, state: 'the empty shape' }

function loot(seq: number): { module: string; seq: number; state: unknown } {
  return { module: 'loot', seq, state: { from: 'the engine' } }
}

function pollLoot(r: Rig): Promise<{ seq: number; state: unknown }> {
  return r.shim.serveShared(MODULE, { module: 'loot' }, (reply) => ({ seq: reply.seq, state: reply.state }), () => EMPTY)
}

function tooLargeError(): EngineError {
  return new EngineError('internal', 'the reply to module.snapshot was too large to read', 4, new TransportError('frameTooLarge', 'refused'))
}

// ---- 1. joined, not re-sent ----------------------------------------------------------------------

test('A READ THAT TIMED OUT IS JOINED, NOT RE-SENT: three polls, one request, the third is served', async () => {
  const r = rig()

  // A request the engine takes nearly 6 s to answer, polled every 2 s by a caller that waits 2 s.
  const first = pollLoot(r)
  await r.advance(2_000)
  assert.equal(await first, EMPTY, 'the first poll gave up at its own 2 s')
  const second = pollLoot(r)
  await r.advance(2_000)
  assert.equal(await second, EMPTY)
  const third = pollLoot(r)
  await r.advance(1_900)
  assert.equal(r.wires.length, 1, 'a poll that found its question still on the wire sent it again')

  await r.wires[0].answer(loot(9))
  assert.deepEqual(await third, { seq: 9, state: { from: 'the engine' } }, 'the third poll took the one reply')
  assert.deepEqual(r.seen, ['timedOut', 'timedOut', 'served'])

  // Not a cache: the request settled, so the next poll asks again.
  const fourth = pollLoot(r)
  await settle()
  assert.equal(r.wires.length, 2)
  await r.wires[1].answer(loot(10))
  assert.equal((await fourth).seq, 10)
})

test('a request the client itself gives up on is rejected for whoever is still waiting, then asked again', async () => {
  const r = rig()
  const first = pollLoot(r)
  await r.advance(2_000)
  await first
  const second = pollLoot(r)
  // The client's own 15 s deadline, as the rejection it produces.
  await r.wires[0].refuse(new EngineError('timeout', 'the engine did not answer module.snapshot in time', 1))
  assert.equal(await second, EMPTY)
  assert.deepEqual(r.seen, ['timedOut', 'refused'])

  void pollLoot(r)
  await settle()
  assert.equal(r.wires.length, 2, 'the question is asked again once its request has ended')
})

// ---- 2. the wait is per op -----------------------------------------------------------------------

test('module.snapshot waits 10 s by timeoutFor while combat.snapshot waits 2 s', async () => {
  const r = rig({ timeoutFor: (op) => (op === MODULE ? 10_000 : undefined) })
  let moduleDone = false
  let combatDone = false
  const module = pollLoot(r).then((got) => {
    moduleDone = true
    return got
  })
  const combat = r.shim
    .serveShared(COMBAT, { opts: {} }, (reply) => reply.snapshot, () => 'hydrating')
    .then((got) => {
      combatDone = true
      return got
    })

  await r.advance(2_000)
  assert.equal(combatDone, true, 'the meter keeps its 2 s')
  assert.equal(await combat, 'hydrating')
  assert.equal(moduleDone, false, 'a module read is still waiting')
  await r.advance(7_999)
  assert.equal(moduleDone, false)
  await r.advance(1)
  assert.equal(await module, EMPTY)
  assert.deepEqual(r.seen, ['timedOut', 'timedOut'])
})

// ---- 3. too large --------------------------------------------------------------------------------

test('A BLOCKED QUESTION ANSWERS tooLarge WITH NO REQUEST SENT', async () => {
  const gate: SizeGate = { blocked: (key) => key === LOOT_KEY, delayFor: () => 0, sent: () => undefined }
  const r = rig({ sizeGate: gate })

  const outcome = await r.shim.ask(MODULE, { module: 'loot' }, (reply) => reply.state)
  assert.deepEqual(outcome, { served: false, why: 'tooLarge', detail: 'the reply was too large to show' })
  assert.equal(await pollLoot(r), EMPTY)
  assert.equal(r.wires.length, 0, 'asking again for a reply that can only have grown')
  assert.deepEqual(r.seen, ['tooLarge', 'tooLarge'])

  // Another question is asked as ever.
  const kills = r.shim.ask(MODULE, { module: 'kills' }, (reply) => reply.state)
  await settle()
  assert.equal(r.wires.length, 1)
  await r.wires[0].answer({ module: 'kills', seq: 1, state: 'served' })
  assert.deepEqual(await kills, { served: true, value: 'served' })
})

test('a reply the client could not read is tooLarge; any other rejection stays refused', async () => {
  const r = rig()
  const big = r.shim.ask(MODULE, { module: 'loot' }, (reply) => reply.state)
  await settle()
  await r.wires[0].refuse(tooLargeError())
  const outcome = await big
  assert.equal(outcome.served, false)
  assert.equal(outcome.served ? null : outcome.why, 'tooLarge')

  const refused = r.shim.ask(MODULE, { module: 'loot' }, (reply) => reply.state)
  await settle()
  await r.wires[1].refuse(new EngineError('notFound', 'this engine folds no module named "loot"', 5))
  const other = await refused
  assert.equal(other.served ? null : other.why, 'refused')
  assert.ok(!other.served && other.detail.includes('notFound'))
  assert.deepEqual(r.seen, ['tooLarge', 'refused'])
})

test('a reply main could read but may not show is tooLarge, and is not asked for again', async () => {
  const sizes = createReplySizes()
  const r = rig({ sizeGate: sizes })
  const first = pollLoot(r)
  await settle()
  // The client reports a large reply before it delivers it (`onOversize`, refused false).
  sizes.note(LOOT_KEY, MAX_FORWARD_CHARS + 1, false)
  await r.wires[0].answer(loot(3))
  assert.equal(await first, EMPTY, 'a reply over the show limit was handed to a window')

  assert.equal(await pollLoot(r), EMPTY)
  assert.equal(r.wires.length, 1)
  assert.deepEqual(r.seen, ['tooLarge', 'tooLarge'])

  // A new read of the log starts again.
  sizes.reset()
  void pollLoot(r)
  await settle()
  assert.equal(r.wires.length, 2)
})

// ---- 4. the floor for a large reply --------------------------------------------------------------

test('A LARGE QUESTION IS SENT AT MOST ONCE PER FLOOR, and whoever asks meanwhile shares the request', async () => {
  const sizes = createReplySizes()
  const r = rig({ sizeGate: sizes })
  const first = pollLoot(r)
  await settle()
  sizes.note(LOOT_KEY, LARGE_MESSAGE_CHARS, false)
  await r.wires[0].answer(loot(1))
  assert.equal((await first).seq, 1, 'large, and still shown')

  // Asked again 100 ms later: the request is held, not sent.
  await r.advance(100)
  const second = pollLoot(r)
  await r.advance(1_000)
  const joiner = r.shim.serve(MODULE, { module: 'loot' }, (reply) => reply.seq, () => -1)
  await r.advance(LARGE_REPLY_FLOOR_MS - 1_101)
  assert.equal(r.wires.length, 1, 'the next request went out before the floor had passed')
  await r.advance(1)
  assert.equal(r.wires.length, 2, 'the held request was never sent')

  // A caller's 2 s wait is extended by the hold: main holding a request is not the engine's silence.
  await r.wires[1].answer(loot(2))
  assert.equal((await second).seq, 2)
  assert.equal(await joiner, 2)
  assert.deepEqual(r.seen, ['served', 'served', 'served'])

  // After the floor has passed with nobody asking, the next request goes straight out.
  await r.advance(LARGE_REPLY_FLOOR_MS)
  void pollLoot(r)
  await settle()
  assert.equal(r.wires.length, 3)
})

// ---- 5. readiness is asked again after every wait --------------------------------------------------

test('A REQUEST HELD WHILE THE ENGINE STOPS BEING SERVABLE IS NEVER SENT, and its joiners fall back', async () => {
  const sizes = createReplySizes()
  let ready: Readiness = SERVABLE
  const r = rig({ sizeGate: sizes, readiness: () => ready })
  const first = pollLoot(r)
  await settle()
  sizes.note(LOOT_KEY, LARGE_MESSAGE_CHARS, false)
  await r.wires[0].answer(loot(1))
  await first

  // Asked again inside the floor, so the request is held; a joiner shares the hold.
  await r.advance(2_000)
  const held = r.shim.ask(MODULE, { module: 'loot' }, (reply) => reply.seq)
  await r.advance(1_000)
  const joiner = pollLoot(r)
  // The player switches character during the hold: the engine is reading another log.
  ready = { ok: false, why: 'notLive' }
  await r.advance(LARGE_REPLY_FLOOR_MS)

  assert.equal(r.wires.length, 1, 'a request held across a character switch was sent into the new read')
  assert.deepEqual(await held, { served: false, why: 'notLive', detail: 'the engine is still folding' })
  assert.equal(await joiner, EMPTY)
  assert.deepEqual(r.seen, ['served', 'notLive', 'notLive'])

  // The question is not stuck: once the engine is servable it is asked again.
  ready = SERVABLE
  void pollLoot(r)
  await r.advance(LARGE_REPLY_FLOOR_MS)
  assert.equal(r.wires.length, 2)
})

test('A REPLY THAT LANDS AFTER THE ENGINE STOPPED BEING SERVABLE IS NOT SERVED', async () => {
  let ready: Readiness = SERVABLE
  const r = rig({ timeoutFor: () => 10_000, readiness: () => ready })
  const asked = r.shim.ask(MODULE, { module: 'loot' }, (reply) => reply.seq)
  const joiner = pollLoot(r)
  await r.advance(6_000)
  // The world changed hands while the request was out: its reply is about the last one.
  ready = { ok: false, why: 'notAttached' }
  await r.wires[0].answer(loot(7))

  assert.deepEqual(await asked, { served: false, why: 'notAttached', detail: 'the engine is on another log' })
  assert.equal(await joiner, EMPTY, 'a reply from before a character switch was served as current')
  assert.equal(r.wires.length, 1)
  assert.deepEqual(r.seen, ['notAttached', 'notAttached'])
})
