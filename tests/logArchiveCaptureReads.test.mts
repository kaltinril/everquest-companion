// ============================================================================
// logArchiveCaptureReads.test.mts — a capture is refused when one of its reads failed (fork #9).
// ============================================================================
//
// A capture asks the engine for every module and the fight list, and then the log is moved aside
// behind it. A read that FAILED (the reply was too large, the engine did not answer, the
// connection dropped) used to be taken for "the engine has no such module": the module was left
// out, the capture came back good, and the log was archived without it. These cases hold the
// other way round: nothing is moved with a module missing, and the card is told why.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EngineError } from '../src/shared/dataServer/ops'
import { TransportError } from '../src/shared/dataServer/transport'
import type { SegmentLog } from '../src/shared/logArchive/segment'
import { captureSegment, type CaptureDeps } from '../src/main/logArchive/capture'
import { ALL_FIGHTS } from '../src/shared/logArchive/mergeFights'
import {
  CaptureReadError,
  captureRead,
  engineCaptureReads,
  readFailure,
  servedOrUnread,
  type CaptureRequest
} from '../src/main/logArchive/captureReads'

const TOO_LARGE = new EngineError(
  'internal',
  'the reply to module.snapshot was too large to read',
  7,
  new TransportError('frameTooLarge', 'a message of 70000000 characters was refused')
)
const NOT_FOUND = new EngineError('notFound', 'this engine folds no module named "bazaar"', 8)
const TIMED_OUT = new EngineError('timeout', 'the engine did not answer module.snapshot in time', 9)
const LINK_LOST = new EngineError('unavailable', 'the connection is failed')

const LOG: SegmentLog = { bytes: 10, sha256: 'x', headBytes: 10, headSha256: 'x', firstStamp: '2026-08-01 10:00:00', lastStamp: '2026-08-01 11:00:00' }

interface Rig {
  readonly deps: CaptureDeps
  /** How many times the log's bytes were read: the step right before the move. */
  prefixReads: number
  readonly asked: string[]
}

function rig(over: Partial<CaptureDeps> = {}): Rig {
  const r: Rig = {
    prefixReads: 0,
    asked: [],
    deps: {
      on: () => true,
      attached: () => ({ character: 'primitive_freeport', logPath: 'live.txt' }),
      health: () => Promise.resolve({ status: 'live', mark: { log: 'live.txt', offset: 10 }, events: 4 }),
      snapshot: (module) => {
        r.asked.push(module)
        return Promise.resolve({ seq: 1, state: { of: module } })
      },
      fights: () => Promise.resolve([]),
      readPrefix: () => {
        r.prefixReads += 1
        return Promise.resolve(LOG)
      },
      producedBy: () => ({ app: '1.0.0', engine: '1.0.0' }),
      ...over
    }
  }
  return r
}

/** Every module answers, except `module`, whose read rejects with `error`. */
function failing(module: string, error: unknown): Partial<CaptureDeps> {
  return {
    snapshot: (m) => (m === module ? Promise.reject(error) : Promise.resolve({ seq: 1, state: { of: m } }))
  }
}

// ---- the three ways a read can end -------------------------------------------------------------

test('captureRead: an answer is kept, notFound is "the engine has none", anything else is a failed read', async () => {
  assert.deepEqual(await captureRead('loot', Promise.resolve({ seq: 3, state: [] })), { seq: 3, state: [] })
  assert.equal(await captureRead('loot', Promise.resolve(null)), null)
  assert.equal(await captureRead('bazaar', Promise.reject(NOT_FOUND)), null)
  for (const error of [TOO_LARGE, TIMED_OUT, LINK_LOST, new Error('the engine answered about kills, not loot')]) {
    await assert.rejects(captureRead('loot', Promise.reject(error)), (err: unknown) => {
      assert.ok(err instanceof CaptureReadError)
      assert.equal(err.what, 'loot')
      assert.equal(err.cause, error)
      return true
    })
  }
})

test('readFailure: too large has its own words; any other failed read names what did not answer', () => {
  assert.deepEqual(readFailure(new CaptureReadError('loot', TOO_LARGE)), {
    ok: false,
    reason: 'this log is too large to summarize in one piece'
  })
  assert.deepEqual(readFailure(new CaptureReadError('loot', TIMED_OUT)), {
    ok: false,
    reason: 'the data engine did not answer for loot; try again in a minute'
  })
  // Not a failed read at all: not this function's to turn into a sentence.
  const bug = new TypeError('a bug')
  assert.throws(() => readFailure(bug), (err: unknown) => err === bug)
})

// ---- the capture -------------------------------------------------------------------------------

test('A MODULE TOO LARGE TO READ REFUSES THE CAPTURE, and the log is never read for the move', async () => {
  const r = rig(failing('loot', TOO_LARGE))
  const result = await captureSegment(r.deps)
  assert.deepEqual(result, { ok: false, reason: 'this log is too large to summarize in one piece' })
  assert.equal(r.prefixReads, 0, 'the capture went on towards the move with a module missing')
  // The two sentences the cards print around it (actions.ts `rotateNow` and `backupNow`).
  assert.equal(
    `Not archived: ${result.ok ? '' : result.reason}. Nothing has changed.`,
    'Not archived: this log is too large to summarize in one piece. Nothing has changed.'
  )
  assert.equal(`Not backed up: ${result.ok ? '' : result.reason}.`, 'Not backed up: this log is too large to summarize in one piece.')
})

test('a module the engine did not answer for refuses the capture, by name', async () => {
  for (const error of [TIMED_OUT, LINK_LOST]) {
    const r = rig(failing('kills', error))
    const result = await captureSegment(r.deps)
    assert.deepEqual(result, { ok: false, reason: 'the data engine did not answer for kills; try again in a minute' })
    assert.equal(r.prefixReads, 0)
  }
})

test('A MODULE THE ENGINE DOES NOT CARRY IS STILL LEFT OUT, and the capture is good', async () => {
  const r = rig(failing('bazaar', NOT_FOUND))
  const result = await captureSegment(r.deps)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal('bazaar' in result.segment.modules, false)
  assert.deepEqual(result.segment.modules.loot, { seq: 1, state: { of: 'loot' } })
  assert.equal(r.prefixReads, 1)
  // …and so is one the capture is handed null for, as before.
  const none = await captureSegment(rig({ snapshot: () => Promise.resolve(null) }).deps)
  assert.ok(none.ok)
  if (none.ok) assert.deepEqual(none.segment.modules, {})
})

test('a fight list that could not be read refuses the capture too', async () => {
  const tooLarge = rig({ fights: () => Promise.reject(TOO_LARGE) })
  assert.deepEqual(await captureSegment(tooLarge.deps), {
    ok: false,
    reason: 'this log is too large to summarize in one piece'
  })
  assert.equal(tooLarge.prefixReads, 0)

  const silent = rig({ fights: () => Promise.reject(TIMED_OUT) })
  assert.deepEqual(await captureSegment(silent.deps), {
    ok: false,
    reason: 'the data engine did not answer for the fight list; try again in a minute'
  })

  // An engine with no fight list to give still leaves the field out (step 4.7).
  const none = await captureSegment(rig({ fights: () => Promise.reject(NOT_FOUND) }).deps)
  assert.ok(none.ok)
  if (none.ok) assert.equal('fights' in none.segment, false)
})

test('a failed read stops the capture there: the modules after it are not asked for', async () => {
  const r = rig()
  const ask = r.deps.snapshot
  r.deps.snapshot = (m) => (m === 'loot' ? Promise.reject(TIMED_OUT) : ask(m))
  await captureSegment(r.deps)
  assert.deepEqual(r.asked, ['combo', 'roster'], 'the capture kept reading after a read had failed')
})

// ---- the reads the product hands the capture (actions.ts `captureDeps`) ---------------------------

interface Asked {
  op: string
  params: unknown
}

/** `engineRequest`, faked: `answer` returns the op's result, or throws what the client would. */
function fakeEngine(answer: (asked: Asked) => unknown): { request: CaptureRequest; asked: Asked[] } {
  const asked: Asked[] = []
  const request = ((op: string, params: unknown) => {
    asked.push({ op, params })
    return new Promise((resolve) => {
      resolve(answer({ op, params }))
    })
  }) as CaptureRequest
  return { request, asked }
}

/** An engine that answers every module and the fight list, except where `fail` throws first. */
function answering(fail: (asked: Asked) => void = () => undefined): ReturnType<typeof fakeEngine> {
  return fakeEngine((asked) => {
    fail(asked)
    if (asked.op === 'combat.snapshot') return { snapshot: { segments: [] } }
    const module = (asked.params as { module: string }).module
    return { module, seq: 5, state: { of: module } }
  })
}

function failModule(module: string, error: unknown): (asked: Asked) => void {
  return (asked) => {
    if (asked.op === 'module.snapshot' && (asked.params as { module: string }).module === module) throw error
  }
}

test('THE PRODUCT-S OWN READS REJECT WHEN THE READ FAILED: a failure is never turned into null', async () => {
  for (const error of [TOO_LARGE, TIMED_OUT, LINK_LOST, NOT_FOUND]) {
    const engine = fakeEngine(() => {
      throw error
    })
    const reads = engineCaptureReads(engine.request)
    // The very rejection, untouched: `captureRead` is the one place that decides what it means.
    await assert.rejects(reads.snapshot('loot'), (err: unknown) => err === error)
    await assert.rejects(reads.fights(), (err: unknown) => err === error)
  }
})

test('an answer about another module is a failed read, not an empty one', async () => {
  const engine = fakeEngine(() => ({ module: 'kills', seq: 2, state: {} }))
  await assert.rejects(engineCaptureReads(engine.request).snapshot('loot'), /answered about kills, not loot/)
})

test('a good read is the snapshot as a segment keeps it, and the fight list asked for whole', async () => {
  const engine = answering()
  const reads = engineCaptureReads(engine.request)
  assert.deepEqual(await reads.snapshot('loot'), { seq: 5, state: { of: 'loot' } })
  assert.deepEqual(await reads.fights(), [])
  assert.deepEqual(engine.asked, [
    { op: 'module.snapshot', params: { module: 'loot' } },
    { op: 'combat.snapshot', params: { opts: { maxSegments: ALL_FIGHTS } } }
  ])
  // What the engine serves apart is put back through the same request (capturedShape.ts).
  await reads.snapshot('gaps')
  assert.deepEqual(engine.asked.slice(2).map((a) => (a.params as { module: string }).module), ['gaps', 'killFactionSamples'])
})

test('A CAPTURE OVER THE PRODUCT-S READS IS REFUSED when a reply was too large, and nothing is read for the move', async () => {
  const loot = rig(engineCaptureReads(answering(failModule('loot', TOO_LARGE)).request))
  assert.deepEqual(await captureSegment(loot.deps), { ok: false, reason: 'this log is too large to summarize in one piece' })
  assert.equal(loot.prefixReads, 0, 'the log was on its way aside without loot')

  const silent = rig(engineCaptureReads(answering(failModule('kills', TIMED_OUT)).request))
  assert.deepEqual(await captureSegment(silent.deps), {
    ok: false,
    reason: 'the data engine did not answer for kills; try again in a minute'
  })

  const fights = rig(
    engineCaptureReads(
      answering((asked) => {
        if (asked.op === 'combat.snapshot') throw TOO_LARGE
      }).request
    )
  )
  assert.deepEqual(await captureSegment(fights.deps), { ok: false, reason: 'this log is too large to summarize in one piece' })
  assert.equal(fights.prefixReads, 0)

  // A module the engine does not carry is the one rejection that still leaves the capture good.
  const none = rig(engineCaptureReads(answering(failModule('bazaar', NOT_FOUND)).request))
  const result = await captureSegment(none.deps)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal('bazaar' in result.segment.modules, false)
  assert.deepEqual(result.segment.modules.loot, { seq: 5, state: { of: 'loot' } })
  assert.deepEqual(result.segment.fights, [])
})

test('actions.ts hands the capture those reads, and writes no `snapshot` or `fights` of its own', () => {
  // actions.ts imports Electron, so no test can load it: its capture block is pinned as text.
  const source = readFileSync(new URL('../src/main/logArchive/actions.ts', import.meta.url), 'utf8')
  const block = /const captureDeps: CaptureDeps = \{[\s\S]*?\n\}/.exec(source)?.[0] ?? ''
  assert.ok(block.includes('...engineCaptureReads(engineRequest)'), 'the capture is not handed the tested reads')
  assert.doesNotMatch(block, /\b(snapshot|fights):/)
})

// ---- which modules the engine serves -----------------------------------------------------------

test('servedOrUnread: only notFound means the engine lacks the module; a failed read counts as served', async () => {
  assert.deepEqual(await servedOrUnread(Promise.resolve({ seq: 4, state: { learned: [] } })), { seq: 4, state: { learned: [] } })
  assert.equal(await servedOrUnread(Promise.resolve(null)), null)
  assert.equal(await servedOrUnread(Promise.reject(NOT_FOUND)), null)
  for (const error of [TOO_LARGE, TIMED_OUT, LINK_LOST]) {
    assert.deepEqual(await servedOrUnread(Promise.reject(error)), { seq: 0, state: null })
  }
})
