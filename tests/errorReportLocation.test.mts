// ============================================================================
// WHERE IT BROKE — the frameless error's location, adversarially (JOS-111).
// ============================================================================
//
// `tests/errorReportContract.test.mts` is the redactor, the bundle frames and the fingerprint.
// THIS suite is the half JOS-111 added.
//
// WHAT IT GUARDS. An error with no in-bundle stack used to hash `Error` and nothing else, so
// every such error shared one fingerprint (and, in the local log, one session budget). The fix
// gives such an error a LOCATION (an external frame, a capture site, an unwrapped nested error)
// or, failing all of those, a coarse shape of its own already-redacted message:
//
//   1. THE CLASSIFIER truncates every external location to a PUBLIC module name. Everything to
//      the left of the `node_modules/` boundary is the install path and therefore somebody's
//      account name; everything to the right of the package is detail the package already
//      implies.
//   2. THE SKELETON groups a message by shape.
//
// (The parts of this suite that checked the usage-analytics error report's wire format went
// with that service on 2026-11-20.)
//
// No Electron, no network, no fixtures: this suite NEVER SKIPS.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStackFrames } from '../src/shared/errorReport'
import {
  classifyExternalFrameFile,
  messageSkeleton,
  parseExternalFrames,
  MAX_EXTERNAL_FRAMES,
  MAX_MESSAGE_SKELETON
} from '../src/shared/errorReportLocation'

// =========================================================================================
// THE CLASSIFIER AND THE PARSERS
// =========================================================================================

test('the CLASSIFIER truncates to the package, and an unrecognizable location is dropped', () => {
  const cases: [string, string | null][] = [
    ['C:\\Users\\jmoye\\AppData\\Local\\Programs\\eqc\\node_modules\\chokidar\\lib\\handler.js', 'node_modules/chokidar'],
    ['/home/josh/app/node_modules/@aws-sdk/client-s3/dist-cjs/index.js', 'node_modules/@aws-sdk/client-s3'],
    // A NESTED dependency resolves to the package that actually holds the frame, and the LAST
    // boundary is what guarantees nothing to the left of it can survive.
    ['/app/node_modules/a/node_modules/b/index.js', 'node_modules/b'],
    ['node:internal/fs/promises', 'node:internal/fs/promises'],
    ['node:fs', 'node:fs'],
    // Truncated at three segments, so a deep internal path cannot grow without bound.
    ['node:internal/streams/readable/extra/more', 'node:internal/streams/readable'],
    ['node:electron/js2c/renderer_init', 'electron/js2c/renderer_init'],
    ['file:///C:/Users/jmoye/eqc/node_modules/electron/dist/resources/x.js', 'node_modules/electron'],
    // Nothing recognizable: refused rather than repaired. A location we cannot classify is a
    // location we cannot promise is not somebody's home directory.
    ['C:\\Users\\jmoye\\Documents\\thing.js', null],
    ['/home/josh/secret/plan.js', null],
    ['<anonymous>', null],
    ['out/main/index.js', null]
  ]
  for (const [raw, want] of cases) {
    assert.equal(classifyExternalFrameFile(raw), want, raw)
  }
  // …and whatever it does return names no account.
  for (const [raw] of cases) {
    const got = classifyExternalFrameFile(raw)
    if (got === null) continue
    assert.equal(got.includes('jmoye'), false, 'no account name survives')
  }
})

test('a stack with no bundle in it still yields EXTERNAL frames, newest first', () => {
  const stack = [
    'Error: ENOENT: no such file or directory',
    '    at Object.readFileSync (node:fs:452:20)',
    '    at async open (node:internal/fs/promises:601:12)',
    '    at FSWatcher._handle (C:\\Users\\jmoye\\eqc\\node_modules\\chokidar\\lib\\handler.js:88:9)',
    '    at Timeout._onTimeout (C:\\Users\\jmoye\\Documents\\private.js:1:1)'
  ].join('\n')
  assert.deepEqual(parseStackFrames(stack), [], 'nothing in the bundle — this is the frameless case')
  assert.deepEqual(parseExternalFrames(stack), [
    { file: 'node:fs', line: 452, col: 20, func: 'Object.readFileSync' },
    // `async open` has a SPACE in it, so it degrades to `<anonymous>` exactly as an app frame
    // would: the location is the diagnostic half and losing a frame over its label is worse.
    { file: 'node:internal/fs/promises', line: 601, col: 12, func: '<anonymous>' },
    { file: 'node_modules/chokidar', line: 88, col: 9, func: 'FSWatcher._handle' }
  ])
  assert.equal(JSON.stringify(parseExternalFrames(stack)).includes('jmoye'), false)
  // The cap holds against a stack that is nothing but external frames.
  const many = Array.from({ length: 40 }, (_, i) => `    at f${String(i)} (node:fs:${String(i + 1)}:1)`).join('\n')
  assert.equal(parseExternalFrames(many).length, MAX_EXTERNAL_FRAMES)
})

test('the message SKELETON groups by shape and never carries what the message did not', () => {
  // Two occurrences of one failure, one issue…
  assert.equal(
    messageSkeleton('Failed to load resource: the server responded with a status of 404'),
    messageSkeleton('Failed to load resource: the server responded with a status of 503')
  )
  // …and two different failures, two.
  assert.notEqual(
    messageSkeleton('Failed to load resource'),
    messageSkeleton('did-fail-load errorCode -105')
  )
  // Its input is the ALREADY-REDACTED message, so the placeholders survive as themselves and
  // there is nothing in it the redactor had already taken out.
  assert.equal(messageSkeleton('ENOENT: open <path> after 3 tries'), 'enoent open <path> after 0 tries')
  assert.ok(messageSkeleton('x'.repeat(500)).length <= MAX_MESSAGE_SKELETON)
})
