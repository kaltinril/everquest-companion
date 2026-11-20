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
import { EngineError } from '../src/shared/dataServer/ops'
import { TransportError } from '../src/shared/dataServer/transport'
import type { SegmentLog } from '../src/shared/logArchive/segment'
import { captureSegment, type CaptureDeps } from '../src/main/logArchive/capture'
import { CaptureReadError, captureRead, readFailure, servedOrUnread } from '../src/main/logArchive/captureReads'

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

// ---- which modules the engine serves -----------------------------------------------------------

test('servedOrUnread: only notFound means the engine lacks the module; a failed read counts as served', async () => {
  assert.deepEqual(await servedOrUnread(Promise.resolve({ seq: 4, state: { learned: [] } })), { seq: 4, state: { learned: [] } })
  assert.equal(await servedOrUnread(Promise.resolve(null)), null)
  assert.equal(await servedOrUnread(Promise.reject(NOT_FOUND)), null)
  for (const error of [TOO_LARGE, TIMED_OUT, LINK_LOST]) {
    assert.deepEqual(await servedOrUnread(Promise.reject(error)), { seq: 0, state: null })
  }
})
