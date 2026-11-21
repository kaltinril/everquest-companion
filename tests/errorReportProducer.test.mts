// ============================================================================
// THE FINGERPRINT OF A CAUGHT ERROR (JOS-100, JOS-111) — what `logError` budgets by.
// ============================================================================
//
// `tests/errorReportContract.test.mts` pins the pure pieces (redactor, frames, hash). This pins
// what `src/main/telemetry/errorReports.ts` makes of a real payload: that one error is one
// fingerprint however often it happens, that two different errors are two, that an error with no
// stack of its own is still told apart by where it was caught, and that the door into the
// session budget cannot throw.
//
// (This suite used to cover the error REPORT the usage-analytics service received: the exemplar,
// its breadcrumb ring, its view and its drain. That service was removed on 2026-11-20 and those
// parts went with it. The fingerprint stayed because the local errors.log budget is keyed by it.)
//
// It drives the real leaf module directly. It imports no Electron and no store, so this suite
// NEVER SKIPS.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorBudgetSpent, errorBudgetTracked, resetErrorBudget } from '../src/main/errorBudget'
import { fingerprintOf, noteError } from '../src/main/telemetry/errorReports'
import { errorFingerprint } from '../src/shared/errorReport'

/** Every test starts from a clean budget; the module is process-global by design. */
function fresh(): void {
  resetErrorBudget()
}

/** A real Error with a stack shaped like a packaged build's — an absolute path above `out/`. */
function thrown(message: string, fn = 'foldEvent', line = 120): Error {
  const err = new TypeError(message)
  err.stack = [
    `TypeError: ${message}`,
    `    at ${fn} (C:\\Users\\jmoye\\eqc\\out\\main\\pipeline.js:${String(line)}:15)`,
    '    at LogBus.emit (C:\\Users\\jmoye\\eqc\\out\\main\\log\\bus.js:78:20)'
  ].join('\n')
  return err
}

// =========================================================================================
// 1. ONE ERROR, ONE FINGERPRINT
// =========================================================================================

test('THE SAME ERROR TWICE IS ONE FINGERPRINT, and the budget counts both', () => {
  fresh()
  const fp = fingerprintOf('main:uncaughtException', thrown('x is not a function'))
  assert.match(fp, /^[0-9a-f]{16}$/)
  assert.equal(fingerprintOf('main:uncaughtException', thrown('x is not a function')), fp)
  // THE MESSAGE IS NOT IN THE HASH when there are frames: the same throw site with a different
  // interpolated value is the same issue.
  assert.equal(fingerprintOf('main:uncaughtException', thrown('y is not a function')), fp)

  noteError('main:uncaughtException', thrown('x is not a function'))
  noteError('main:uncaughtException', thrown('x is not a function'))
  assert.equal(errorBudgetSpent(fp), 2, 'both occurrences are spent against the one fingerprint')
  assert.equal(errorBudgetTracked(), 1)
})

test('different errors are different fingerprints', () => {
  fresh()
  const a = fingerprintOf('main:uncaughtException', thrown('boom', 'foldEvent', 120))
  const b = fingerprintOf('main:uncaughtException', thrown('boom', 'foldEvent', 121))
  const c = fingerprintOf('main:uncaughtException', new RangeError('boom'))
  assert.notEqual(a, b, 'a different line is a different throw site')
  assert.notEqual(a, c, 'a different name is a different error')
})

test('an error WITH frames hashes name + top frames, and nothing else', () => {
  // The capture site is not consulted when the payload has a stack of its own.
  assert.equal(
    fingerprintOf('main:uncaughtException', thrown('boom'), () => {
      throw new Error('the capture site must not be asked')
    }),
    errorFingerprint('TypeError', [
      { file: 'out/main/pipeline.js', line: 120, col: 15, func: 'foldEvent' },
      { file: 'out/main/log/bus.js', line: 78, col: 20, func: 'LogBus.emit' }
    ])
  )
})

// =========================================================================================
// 2. THE DOOR INTO THE BUDGET
// =========================================================================================

test('the door is TOTAL: anything at all can be thrown at it', () => {
  fresh()
  for (const junk of [undefined, null, 42, 'a bare string', {}, [], new Error()]) {
    assert.deepEqual(noteError('main:unhandledRejection', junk), { report: true, notice: null })
  }
})

test('a failure INSIDE the error logger is not budgeted against the error logger', () => {
  // `logError` tags its own last-resort line `[errorLog]`. Budgeting that source would be a
  // decision about the path that is already failing to write, made by the writer that failed.
  fresh()
  assert.deepEqual(noteError('errorLog', thrown('failed to write errors.log')), { report: true, notice: null })
  assert.equal(errorBudgetTracked(), 0, 'nothing was spent')
})

// =========================================================================================
// 3. THE FRAMELESS CASE (JOS-111) — an error with no in-bundle stack
// =========================================================================================

/** What `errorLog.ts` hands over as the capture-site thunk, with a stack we can state. `logError`
 *  uses `Error.captureStackTrace(holder, logError)` so the top frame really is the caller; here
 *  the caller is spelled out, which is the same thing without a bundle to build. */
const site = (fn: string, line: number) => (): string =>
  [
    '[object Object]',
    `    at ${fn} (C:\\Users\\jmoye\\eqc\\out\\main\\index.js:${String(line)}:9)`,
    '    at EventEmitter.emit (node:events:518:28)'
  ].join('\n')

/** The console forwarder's payload, verbatim: no stack, no name, and never had either. */
const forwarded = (message: string): { level: number; message: string; source: string } => ({
  level: 3,
  message,
  source: 'index.html:1'
})

test('TWO FRAMELESS ERRORS FROM DIFFERENT PLACES ARE TWO FINGERPRINTS, not one', () => {
  // THE HEADLINE DEFECT. Before JOS-111 both of these hashed `Error` and nothing else, so every
  // frameless failure in the app — a forwarded console error, a failed load, a rejected string —
  // shared one fingerprint, and with it one session budget.
  const console1 = fingerprintOf('renderer:console', forwarded('Failed to load resource'), site('forwardConsole', 5178))
  const load = fingerprintOf('main:did-fail-load', { errorCode: -105, isMainFrame: true }, site('onDidFailLoad', 5310))
  assert.notEqual(console1, load, 'two capture sites are two issues')
  // …and the capture site's frames are what was hashed: the catch site, cut down to the bundle.
  assert.equal(
    console1,
    errorFingerprint('Error', [{ file: 'out/main/index.js', line: 5178, col: 9, func: 'forwardConsole' }])
  )
})

test('a NESTED error is unwrapped: `{ preloadPath, error }` hashes the real stack', () => {
  // The `main:preload-error` shape, verbatim. The outer object has no message, no name and no
  // stack; the whole error is one property down, and the old read gave up at the top level.
  const inner = thrown('preload blew up')
  assert.equal(
    fingerprintOf('main:preload-error', { preloadPath: 'C:\\Users\\jmoye\\eqc\\out\\preload\\index.js', error: inner }),
    fingerprintOf('main:preload-error', inner),
    'the inner error names it and locates it'
  )
})

test('EXTERNAL frames are what the fingerprint falls back on', () => {
  const enoent = new Error('ENOENT: no such file or directory, open <path>')
  enoent.stack = [
    'Error: ENOENT',
    '    at Object.readFileSync (node:fs:452:20)',
    '    at FSWatcher._handle (C:\\Users\\jmoye\\eqc\\node_modules\\chokidar\\lib\\handler.js:88:9)'
  ].join('\n')
  const other = new Error('ENOENT: no such file or directory, open <path>')
  other.stack = 'Error: ENOENT\n    at Object.statSync (node:fs:1600:3)'
  assert.notEqual(
    fingerprintOf('main:uncaughtException', enoent),
    fingerprintOf('main:uncaughtException', other),
    'same name, same message, different module — two issues'
  )
})

test('with no location at all, the MESSAGE SHAPE is what stops the collision', () => {
  const network = fingerprintOf('renderer:unhandledrejection', { message: 'the network went away' })
  const disk = fingerprintOf('renderer:unhandledrejection', { message: 'the disk went away' })
  assert.notEqual(network, disk, 'two shapes, two issues')
  // …and two occurrences of the SAME failure are still one issue, because the skeleton is coarse.
  assert.equal(fingerprintOf('renderer:unhandledrejection', { message: 'the network went away' }), network)
  assert.equal(
    fingerprintOf('renderer:unhandledrejection', { message: 'retry 3 of 5 failed' }),
    fingerprintOf('renderer:unhandledrejection', { message: 'retry 4 of 5 failed' }),
    'digits are folded, so a counter in the message does not mint a new issue'
  )
})
