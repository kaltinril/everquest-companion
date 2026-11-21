// The read-only tail read of the game log (src/main/feedback/slice.ts): `lineTs` and `readTail`,
// the two functions the factions evidence reader uses. (The feedback log slice this file also
// covered is removed with the feedback feature.)
//
// EVERY FIXTURE HERE IS SYNTHESIZED INTO A TEMP DIR. The real game log is never read, never
// opened, and never named by this suite — the app opens it read-only and a test has even less
// business near it. One test below additionally PROVES the read-only contract by hashing the
// synthetic log before and after a read.
//
// No Electron, no network, no committed fixtures, so this suite never skips.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lineTs, readTail } from '../src/main/feedback/slice'

// ---- synthetic-log helpers ---------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number): string => String(n).padStart(2, '0')

/** `[Sat Aug 01 13:00:28 2026]` — the real prefix, in LOCAL time (parseEqTimestamp's base). */
function stamp(ms: number): string {
  const d = new Date(ms)
  const hms = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `[${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${hms} ${d.getFullYear()}]`
}

const at = (ms: number, text: string): string => `${stamp(ms)} ${text}`

/** A fixed, deliberately-not-now anchor: Sat Aug 01 2026 14:32:00 local. */
const ANCHOR = new Date(2026, 7, 1, 14, 32, 0).getTime()
const MIN = 60_000

interface Fixture {
  dir: string
  path: string
}

function writeLog(lines: readonly string[]): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-log-tail-'))
  const path = join(dir, 'eqlog_Testchar_freeport.txt')
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
  return { dir, path }
}

const cleanup = (fx: Fixture): void => {
  rmSync(fx.dir, { recursive: true, force: true })
}

// ---- the line timestamp ---------------------------------------------------------------------

test('lineTs reads the log prefix and nothing else', () => {
  assert.equal(lineTs(at(ANCHOR, 'You slash a gnoll for 120 points of damage.')), ANCHOR)
  assert.equal(lineTs('no prefix at all'), 0)
  assert.equal(lineTs('[not a timestamp] hello'), 0)
  assert.equal(lineTs(''), 0)
})

// ---- the tail read --------------------------------------------------------------------------

test('a log under the cap is read whole and is not marked truncated', async () => {
  const lines = [at(ANCHOR - MIN, 'You have entered Plane of Sky.'), at(ANCHOR, 'You have slain a gnoll!')]
  const fx = writeLog(lines)
  try {
    const tail = await readTail(fx.path, 1024 * 1024)
    assert.ok(tail)
    assert.equal(tail.truncated, false)
    assert.equal(tail.text, `${lines.join('\n')}\n`)
  } finally {
    cleanup(fx)
  }
})

test('the cap bounds the read — the head of a log over the cap is never seen', async () => {
  // A marker at the very TOP of an over-cap file. If it appears in the read, the whole file was
  // loaded — which is the memory failure the cap exists to prevent.
  const marker = 'MARKER-THE-TAIL-CAP-MUST-EXCLUDE-THIS'
  const filler = 'You slash a gnoll for 137 points of damage. Fillerfillerfiller.'
  const cap = 64 * 1024
  const lines = [at(ANCHOR - 59 * MIN, marker)]
  const per = at(ANCHOR, filler).length + 1
  for (let i = 0; i < Math.ceil((cap * 1.5) / per); i++) lines.push(at(ANCHOR - 58 * MIN + i * 1000, filler))
  const fx = writeLog(lines)
  try {
    assert.ok(statSync(fx.path).size > cap, 'the fixture must exceed the cap to test it')
    const tail = await readTail(fx.path, cap)
    assert.ok(tail)
    assert.equal(tail.truncated, true, 'a read that started mid-file says so')
    assert.equal(Buffer.byteLength(tail.text, 'utf8'), cap, 'exactly the last `cap` bytes')
    assert.ok(!tail.text.includes(marker), 'the tail cap must bound what is read')
    assert.ok(tail.text.endsWith(`${at(ANCHOR - 58 * MIN + (lines.length - 2) * 1000, filler)}\n`))
  } finally {
    cleanup(fx)
  }
})

// ---- degenerate inputs ----------------------------------------------------------------------

test('an empty log reads as null, and a missing one rejects for the caller to handle', async () => {
  const fx = writeLog(['[Sat Aug 01 14:32:00 2026] anything'])
  try {
    const empty = join(fx.dir, 'empty.txt')
    writeFileSync(empty, '', 'utf8')
    assert.equal(await readTail(empty, 1024), null)
    await assert.rejects(readTail(join(fx.dir, 'nope.txt'), 1024))
  } finally {
    cleanup(fx)
  }
})

// ---- THE ONE RULE ---------------------------------------------------------------------------

test('THE GAME LOG IS OPENED READ-ONLY AND IS NEVER WRITTEN TO', async () => {
  const fx = writeLog([
    at(ANCHOR - 5 * MIN, 'You have entered Plane of Sky.'),
    at(ANCHOR, 'You have slain a gnoll!')
  ])
  try {
    const before = readFileSync(fx.path)
    const beforeStat = statSync(fx.path)
    for (const cap of [16, 64, 1024 * 1024]) assert.ok(await readTail(fx.path, cap))
    const after = readFileSync(fx.path)
    const afterStat = statSync(fx.path)
    assert.ok(before.equals(after), 'the log bytes must be untouched')
    assert.equal(afterStat.size, beforeStat.size)
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs, 'a write would move mtime')
  } finally {
    cleanup(fx)
  }
})
