// ============================================================================
// childProcessGone.test.mts — JOS-364, JOS-418: a lost GPU process is reported, and says why.
// ============================================================================
//
// It drives the PURE module `src/main/childProcessGone.ts`, which takes its emitter as an argument,
// so it runs with no Electron in the process.
//
// (This file was `setupSnapshot.test.mts`. Its first half covered the machine-class snapshot the
// usage-analytics service received, and its child-process half also pinned two analytics counters.
// Both went with that service on 2026-11-20; the error line for a lost GPU process stayed.)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GPU_LOSS_ERROR_NAME,
  noteChildProcessGone,
  watchChildProcessGone,
  type ChildLossReport,
  type ChildProcessGoneEmitter
} from '../src/main/childProcessGone'

// ---------------------------------------------------------------- the lost children

/** The smallest thing that is an `app` to `watchChildProcessGone` — which is the point of taking
 *  an emitter rather than importing `electron`. */
function fakeApp(): ChildProcessGoneEmitter & { fire(details: unknown): void } {
  let listener: ((e: unknown, details: unknown) => void) | undefined
  return {
    on(_event, cb) {
      listener = cb
      return this
    },
    fire(details) {
      listener?.(null, details)
    }
  }
}

test('a GPU process loss files exactly one report', () => {
  const seen: ChildLossReport[] = []
  const app = fakeApp()
  watchChildProcessGone(app, (info) => seen.push(info))
  app.fire({ type: 'GPU', reason: 'crashed', exitCode: 5 })
  // The report carries WHY it died and with what code. Both are
  // closed-vocabulary or numeric — there is no shape here that could carry a path or a name.
  assert.deepEqual(seen, [
    {
      name: GPU_LOSS_ERROR_NAME,
      message: 'GPU process gone: reason=crashed, exitCode=5',
      code: 5,
      reason: 'crashed',
      exitCode: 5
    }
  ])
  app.fire({ type: 'GPU', reason: 'oom', exitCode: 9 })
  assert.equal(seen.length, 2)
})

// ---------------------------------------------------------------------------------------
// JOS-418 — THE REPORT SAYS WHAT IT KNOWS
// ---------------------------------------------------------------------------------------
// For four releases this site handed `logError` a bare `{ reason, exitCode }`. `caughtFields`
// reads `name`/`message`/`stack`/`code` off a payload and that object has none of them, so the
// error was recorded as the literal text `Error: `.
//
// These pin the three properties that make that impossible: the message is never blank for any
// input, the error NAME is what gives the diagnosis its own fingerprint, and the exit code rides
// in `code` as well as in the sentence.

test('THE MESSAGE IS NEVER EMPTY — no payload this site can be handed produces a blank', () => {
  const seen: ChildLossReport[] = []
  const report = (info: ChildLossReport): void => {
    seen.push(info)
  }
  // Everything absent; every field the sentence needs has a fallback above it.
  noteChildProcessGone({ type: 'GPU' }, report)
  // A reason of the wrong SHAPE is refused rather than repeated — this is the gate that stops an
  // outside string becoming a free-text channel, and `unknown` is the honest thing to say instead.
  noteChildProcessGone({ type: 'GPU', reason: 'a rat says hello', exitCode: 0 }, report)
  noteChildProcessGone({ type: 'GPU', reason: 'crashed', exitCode: 3_221_225_477 }, report)
  for (const info of seen) {
    assert.notEqual(info.message.trim(), '', 'a blank message is the whole bug')
    assert.equal(info.name, GPU_LOSS_ERROR_NAME)
    assert.equal(info.code, info.exitCode, 'the code field is the exit code, verbatim')
  }
  assert.equal(seen[0].message, 'GPU process gone: reason=unknown, exitCode=-1')
  assert.equal(seen[1].message, 'GPU process gone: reason=unknown, exitCode=0')
  // The ten-digit access-violation code, whole.
  assert.equal(seen[2].code, 3_221_225_477)
})

test('WHICH CHILD: Chromium name, then mojo name, and neither if it is not name-shaped', () => {
  const seen: ChildLossReport[] = []
  const report = (info: ChildLossReport): void => {
    seen.push(info)
  }
  noteChildProcessGone({ type: 'GPU', reason: 'crashed', exitCode: 1, name: 'GPU Process' }, report)
  noteChildProcessGone(
    { type: 'GPU', reason: 'crashed', exitCode: 1, serviceName: 'viz.mojom.VizMain' },
    report
  )
  // The human name wins when both are there: `Audio Service` is what a reader can act on.
  noteChildProcessGone(
    { type: 'GPU', reason: 'oom', exitCode: 2, name: 'Audio Service', serviceName: 'audio.mojom.X' },
    report
  )
  // …and a value that is not Chromium-constant-shaped is DROPPED, not repaired. This is the same
  // bright line `describeChildLoss`'s header states: nothing that could spell a path, a character
  // name or a line of anyone's log reaches the sentence.
  noteChildProcessGone(
    { type: 'GPU', reason: 'crashed', exitCode: 1, name: "C:\\Users\\someone\\'Primitive'" },
    report
  )
  assert.deepEqual(
    seen.map((i) => i.message),
    [
      'GPU process (GPU Process) gone: reason=crashed, exitCode=1',
      'GPU process (viz.mojom.VizMain) gone: reason=crashed, exitCode=1',
      'GPU process (Audio Service) gone: reason=oom, exitCode=2',
      'GPU process gone: reason=crashed, exitCode=1'
    ]
  )
  assert.equal(seen[3].child, undefined, 'the refused name is absent, not blanked')
})

test('a UTILITY loss files NOTHING — it is not an error', () => {
  const seen: unknown[] = []
  const app = fakeApp()
  watchChildProcessGone(app, (info) => seen.push(info))
  app.fire({ type: 'Utility', reason: 'crashed', exitCode: 1, serviceName: 'audio.mojom.AudioService' })
  assert.deepEqual(seen, [], 'a helper that comes and goes by design does not file an error')
})

test('A CLEAN EXIT IS NOT A LOSS — otherwise every ordinary quit reports one', () => {
  // The one judgement in that module, pinned: Chromium tears its children down on the way out,
  // and a report that included that would log a GPU loss on every session this app has run.
  const seen: unknown[] = []
  const app = fakeApp()
  watchChildProcessGone(app, (info) => seen.push(info))
  app.fire({ type: 'GPU', reason: 'clean-exit', exitCode: 0 })
  app.fire({ type: 'Utility', reason: 'clean-exit', exitCode: 0 })
  assert.deepEqual(seen, [])
})

test('an unrecognised payload is ignored rather than reported under a guess', () => {
  const ignored: ChildLossReport[] = []
  noteChildProcessGone({}, (info) => ignored.push(info))
  noteChildProcessGone({ type: 'Zygote', reason: 'crashed' }, (info) => ignored.push(info))
  noteChildProcessGone({ type: 'Pepper Plugin', reason: 'killed', exitCode: 1 }, (info) => ignored.push(info))
  assert.deepEqual(ignored, [])
  // …and a GPU loss with no reason at all is still reported, with the reason it can honestly give.
  const seen: ChildLossReport[] = []
  noteChildProcessGone({ type: 'GPU' }, (info) => seen.push(info))
  assert.deepEqual(seen, [
    {
      name: GPU_LOSS_ERROR_NAME,
      message: 'GPU process gone: reason=unknown, exitCode=-1',
      code: -1,
      reason: 'unknown',
      exitCode: -1
    }
  ])
})
