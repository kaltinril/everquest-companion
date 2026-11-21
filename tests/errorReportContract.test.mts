// ============================================================================
// THE ERROR FINGERPRINT'S INPUTS, ADVERSARIALLY — the redactor, the frames, the hash.
// ============================================================================
//
// `src/shared/errorReport.ts` holds the three pure functions the LOCAL error log's fingerprint is
// built from (JOS-100): the message redactor, the stack-frame parser and the fingerprint. They
// were written for the error reports the usage-analytics service received; that service is
// removed, and what this suite still pins is what the local budget (`errorBudget.ts`) rests on:
//
//   1. THE REDACTOR lets nothing through (real nasty messages, including the two the ticket
//      named: an ENOENT carrying a Windows user path, and a parse error quoting a mob name),
//      and its output is printable ASCII within the length bound.
//   2. THE FRAMES keep the bundle path and nothing above it.
//   3. THE FINGERPRINT groups by name and top frames.
//
// ITS SIBLING IS `tests/errorReportLocation.test.mts`, which asks the same of everything JOS-111
// added: the external frames and the message skeleton.
//
// No Electron, no network, no fixtures: this suite NEVER SKIPS.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  errorFingerprint,
  errorNameOf,
  normalizeFrameFile,
  parseStackFrames,
  redactMessage,
  FINGERPRINT_FRAMES,
  MAX_ERROR_FRAMES,
  MAX_REDACTED_MESSAGE,
  type ErrorFrame
} from '../src/shared/errorReport'

/** What a redacted message must be: PRINTABLE ASCII ONLY, and at most `MAX_REDACTED_MESSAGE` of
 *  it. An ESC, a NUL, a newline and a BiDi override are all outside the class. */
const REDACTED_MESSAGE_RE = /^[\x20-\x7E]{0,200}$/

const ch = (code: number): string => String.fromCharCode(code)
const ESC = ch(0x1b)
const BEL = ch(0x07)

// =========================================================================================
// 1. THE REDACTOR, over real nasty shapes
// =========================================================================================

test('the redactor eats a Windows user path out of an ENOENT — the shape that names a person', () => {
  const raw =
    "ENOENT: no such file or directory, open 'C:\\Users\\jmoye\\AppData\\Roaming\\everquest-companion\\alerts.json'"
  const out = redactMessage(raw)
  // The account name is the whole point: it must not survive in ANY form.
  assert.equal(out.includes('jmoye'), false, out)
  assert.equal(out.includes('C:'), false, out)
  assert.equal(out.includes('AppData'), false, out)
  // …and the DIAGNOSABLE half survives: which errno, and that the argument was a path. That is
  // the entire reason the path pass runs before the quote pass — a quote-first redactor would
  // have collapsed the whole thing to `<str>` and thrown away "it was a file".
  assert.equal(out, 'ENOENT: no such file or directory, open <path>')
})

test('the redactor eats a quoted mob name out of a parse error, and keeps the error', () => {
  const raw = "Unexpected token in parseDamage: 'Innoruuk`s Chosen hits YOU for 412 points'"
  const out = redactMessage(raw)
  assert.equal(out.includes('Innoruuk'), false, out)
  assert.equal(out.includes('hits YOU'), false, out)
  assert.equal(out, 'Unexpected token in parseDamage: <str>')
})

test('the redactor over the rest of the nasty catalogue', () => {
  const table: [string, string, string][] = [
    [
      'a POSIX home path',
      'EACCES: permission denied, scandir /home/josh/.config/everquest-companion/soundpacks',
      'EACCES: permission denied, scandir <path>'
    ],
    // THE SPACE CASE, which the first draft of PATH_RE got wrong and this row is why it is
    // segment-based now: `EverQuest Legends` is this game's own install directory and
    // `Program Files` is on every Windows machine, so a space-terminated path pattern leaks the
    // tail of nearly every real path.
    [
      'a UNC share whose segments contain spaces',
      'Cannot find module \\\\NAS01\\games\\EverQuest Legends\\Logs',
      'Cannot find module <path>'
    ],
    [
      'Program Files, and the sentence AFTER the path survives',
      'spawn C:\\Program Files\\eqc\\out\\main\\presence.exe failed after 3 retries',
      'spawn <path> failed after 3 retries'
    ],
    [
      'a two-segment POSIX home path — named directories, because /Users/josh and /v1/x are the same shape',
      'EACCES: open /Users/josh',
      'EACCES: open <path>'
    ],
    [
      'a URL path is NOT a filesystem path and is left alone',
      'POST /v1/telemetry failed with 503',
      'POST /v1/telemetry failed with 503'
    ],
    [
      'a double-quoted character name',
      'No character named "Primitive" is being tailed',
      'No character named <str> is being tailed'
    ],
    [
      'a property read, which V8 quotes',
      "Cannot read properties of undefined (reading 'characterName')",
      'Cannot read properties of undefined (reading <str>)'
    ],
    [
      'a long number is an id or an offset; a short one is diagnostic',
      'Tailer: seek to 1073741824 failed after 3 retries (errno -4058)',
      'Tailer: seek to <n> failed after 3 retries (errno -4058)'
    ],
    [
      'a file: URL from the renderer',
      'Failed to fetch file:///C:/Users/jmoye/app/out/renderer/index.html',
      'Failed to fetch <path>'
    ],
    ['nothing to redact is left completely alone', 'Maximum call stack size exceeded', 'Maximum call stack size exceeded'],
    ['whitespace the redaction left behind is collapsed', "open   'x'    now", 'open <str> now']
  ]
  for (const [name, raw, want] of table) assert.equal(redactMessage(raw), want, name)
})

test('THE FIXED POINT: redacting twice is redacting once — the server check rests on it', () => {
  const inputs = [
    "ENOENT: open 'C:\\Users\\jmoye\\a\\b.json'",
    'Cannot find module /usr/lib/node_modules/x/y.js',
    'a "b" c 1234567890 D:\\e\\f',
    '<path> <str> <n>',
    'x'.repeat(MAX_REDACTED_MESSAGE + 400),
    // A cut that lands mid-path is exactly the case that would break idempotence if the cap ran
    // BEFORE the redaction. It runs after, so there is no path left to cut into.
    `${'y'.repeat(MAX_REDACTED_MESSAGE - 5)} C:\\Users\\jmoye\\deep\\path\\file.json`,
    '',
    'no quotes but an apostrophe: don\u2019t'
  ]
  for (const raw of inputs) {
    const once = redactMessage(raw)
    assert.equal(redactMessage(once), once, JSON.stringify(raw).slice(0, 60))
    assert.ok(REDACTED_MESSAGE_RE.test(once), `must satisfy its own wire regex: ${once}`)
  }
})

test('THE BRIGHT LINE: an EQ log line reaching a message is swallowed whole', () => {
  // A `throw new Error(line)` in the parser is a plausible future accident, and the redactor
  // cannot know that "You slash a rat" is gameplay — it CAN know that everything after an EQ
  // timestamp is. The prefix is the one signature a log line cannot be written without.
  const table = [
    '[Sat Aug 01 13:00:28 2026] You slash a rat for 12 points of damage.',
    "parse failed: [Thu Aug 06 12:44:20 2026] Jaber says, 'My leader is Primitive.'",
    '[Sun Jul  6 09:01:02 2026] Kahaptra Z`Taj hits YOU for 412 points of damage.'
  ]
  for (const raw of table) {
    const out = redactMessage(raw)
    assert.ok(out.endsWith('<logline>'), out)
    for (const leak of ['slash', 'rat', 'Jaber', 'Primitive', 'Kahaptra', 'points']) {
      assert.equal(out.includes(leak), false, `${leak} survived: ${out}`)
    }
    assert.equal(redactMessage(out), out, 'still a fixed point')
  }
})

test('the redactor is a sanitizer too: control characters, ANSI and invisibles never survive', () => {
  const nasty = `${ESC}]0;pwned${BEL}broke\nat ${ch(0x202e)}line${ch(0x00)}`
  const out = redactMessage(nasty)
  assert.ok(REDACTED_MESSAGE_RE.test(out), out)
  for (const code of [0x1b, 0x07, 0x00, 0x0a, 0x09, 0x202e, 0xfeff]) {
    assert.equal(out.includes(ch(code)), false, `U+${code.toString(16)} survived: ${out}`)
  }
  assert.equal(out.includes('pwned'), false, 'an OSC payload leaves with its ESC')
})

test('the redactor is total: a thrown non-string has no message and that is fine', () => {
  for (const junk of [undefined, null, 42, {}, [], Symbol('x')]) {
    assert.equal(redactMessage(junk), '')
  }
})

// =========================================================================================
// 2. FRAMES — the absolute prefix is cut off before the value exists
// =========================================================================================

test('normalizeFrameFile keeps the bundle path and nothing above it', () => {
  const table: [string, string | null][] = [
    ['C:\\Users\\jmoye\\AppData\\Local\\Programs\\eqc\\resources\\app.asar\\out\\main\\index.js', 'out/main/index.js'],
    ['file:///C:/Users/jmoye/dev/eqc/out/renderer/assets/index-a1b2.js', 'out/renderer/assets/index-a1b2.js'],
    ['/home/josh/eqc/out/preload/index.js', 'out/preload/index.js'],
    ['out/main/session.js', 'out/main/session.js'],
    // THE GREEDY-MATCH TRIPWIRE. `scout` contains the letters `out`, so a lazy regex with an
    // optional separator returns `out/app/out/main/index.js` and publishes a directory the user
    // named themselves. This assertion is the whole reason BUNDLE_ROOT_RE is written the way it is.
    ['C:\\Users\\scout\\app\\out\\main\\index.js', 'out/main/index.js'],
    // THE HARNESS ROOT NORMALIZES TO THE SHIPPED ONE. `out-e2e/` is the same files from the same
    // sources, built to a different directory so the headless suite never races the dev watcher.
    // The e2e spec found this: it asserted on frames and got an empty list, because every
    // renderer frame under the harness was being dropped for having the "wrong" root.
    ['C:\\eqc\\out-e2e\\renderer\\assets\\index-a1b2.js', 'out/renderer/assets/index-a1b2.js'],
    ['out-e2e/main/index.js', 'out/main/index.js'],
    ['node:internal/modules/cjs/loader', null],
    ['electron/js2c/browser_init', null],
    ['C:\\Users\\jmoye\\secret\\notes.txt', null]
  ]
  for (const [raw, want] of table) assert.equal(normalizeFrameFile(raw), want, raw)
})

test('parseStackFrames takes app frames, skips the rest, and caps at ten', () => {
  const stack = [
    'TypeError: x is not a function',
    '    at Object.foldEvent (C:\\Users\\jmoye\\eqc\\out\\main\\pipeline.js:120:15)',
    '    at node:internal/modules/cjs/loader:1105:14',
    '    at C:\\Users\\jmoye\\eqc\\out\\main\\index.js:44:3',
    '    at file:///C:/eqc/out/renderer/assets/index-a1b2.js:9:1'
  ].join('\n')
  const frames = parseStackFrames(stack)
  assert.deepEqual(frames, [
    { file: 'out/main/pipeline.js', line: 120, col: 15, func: 'Object.foldEvent' },
    { file: 'out/main/index.js', line: 44, col: 3, func: '<anonymous>' },
    { file: 'out/renderer/assets/index-a1b2.js', line: 9, col: 1, func: '<anonymous>' }
  ])
  // The cap counts APP frames, so a stack of forty yields ten.
  const many = Array.from({ length: 40 }, (_, i) => `    at f${String(i)} (out/main/a.js:${String(i + 1)}:1)`).join('\n')
  assert.equal(parseStackFrames(many).length, MAX_ERROR_FRAMES)
  // A function name that is not identifier-shaped degrades to <anonymous>; the LOCATION is the
  // diagnostic half and losing a whole frame over its label would be the wrong trade. `async
  // Promise.all` is V8's own spelling and really does contain a space.
  const spaced = '    at async Promise.all (index 0) (C:\\eqc\\out\\main\\a.js:1:2)'
  assert.deepEqual(parseStackFrames(spaced), [
    { file: 'out/main/a.js', line: 1, col: 2, func: '<anonymous>' }
  ])
  assert.deepEqual(parseStackFrames(undefined), [])
  assert.deepEqual(parseStackFrames('no frames here'), [])
})

// =========================================================================================
// 3. THE FINGERPRINT
// =========================================================================================

const frame = (file: string, line: number, func = 'f'): ErrorFrame => ({ file, line, col: 1, func })

test('the fingerprint groups by name and top frames, and ignores the varying parts', () => {
  const a = [frame('out/main/a.js', 10), frame('out/main/b.js', 20), frame('out/main/c.js', 30)]
  assert.match(errorFingerprint('TypeError', a), /^[0-9a-f]{16}$/)
  // deterministic
  assert.equal(errorFingerprint('TypeError', a), errorFingerprint('TypeError', a))
  // the NAME separates
  assert.notEqual(errorFingerprint('TypeError', a), errorFingerprint('RangeError', a))
  // a different top frame separates
  assert.notEqual(errorFingerprint('TypeError', a), errorFingerprint('TypeError', [frame('out/main/z.js', 10), ...a.slice(1)]))
  // COLUMNS DO NOT: a minifier moves them between builds, and an issue that re-fingerprints on
  // every release cannot be tracked across one.
  const shiftedCols = a.map((f) => ({ ...f, col: f.col + 99 }))
  assert.equal(errorFingerprint('TypeError', shiftedCols), errorFingerprint('TypeError', a))
  // and neither does anything past FINGERPRINT_FRAMES — a deeper caller changing is the same bug
  const deeper = [...a, frame('out/main/deep.js', 999)]
  assert.equal(errorFingerprint('TypeError', deeper), errorFingerprint('TypeError', a))
  assert.equal(FINGERPRINT_FRAMES, 3)
})

test('errorNameOf refuses prose and falls back honestly', () => {
  assert.equal(errorNameOf('TypeError'), 'TypeError')
  assert.equal(errorNameOf('a Nisch Mas Mender'), 'Error', 'a name with spaces is prose')
  assert.equal(errorNameOf(undefined), 'Error')
})

test('the redactor bound and the regex above are one number', () => {
  assert.equal(MAX_REDACTED_MESSAGE, 200)
  assert.ok(REDACTED_MESSAGE_RE.test('a'.repeat(MAX_REDACTED_MESSAGE)))
  assert.equal(REDACTED_MESSAGE_RE.test('a'.repeat(MAX_REDACTED_MESSAGE + 1)), false)
})
