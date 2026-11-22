// A log the archive refused as too large (open work, item 6): the refusal is remembered so the
// capture's minute is not spent at every launch, it stops holding the moment the log or the app
// is a different one, and no line offers the player the archive for that log.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTooLargeMemory, readLogIdentity, type TooLargeDeps } from '../src/main/logArchive/tooLargeLog'
import { TOO_LARGE_REASON } from '../src/main/logArchive/captureReads'
import { normalizeLogArchivePrefs, type ArchiveRefusal } from '../src/shared/logArchive/prefs'
import { AUTO_ARCHIVE_BYTES, autoArchiveDue, rotateBlockers, type PreflightInput } from '../src/shared/logArchive/preflight'
import { refusalFor, refusalHolds, replyStopsCapture, TOO_LARGE_TO_ARCHIVE } from '../src/shared/logArchive/tooLarge'
import { LOG_READ_TRY, LOG_READ_TRY_NO_ARCHIVE } from '../src/shared/logReadWords'
import type { LogReadFacts } from '../src/shared/logReadReport'
import { health, report, MB, NOW } from './logReadFactsHarness.mts'

const REFUSAL: ArchiveRefusal = { headSha256: 'aa', bytes: 1_000, appVersion: '1.0.0' }
const LOG = { character: 'Name_server', logPath: 'C:/Logs/eqlog_Name_server.txt' }
const LIVE: Partial<LogReadFacts> = { readiness: 'ok', health: health('live') }

function memory(over: Partial<TooLargeDeps> = {}): { deps: TooLargeDeps; saved: ArchiveRefusal[]; reads: () => number; changes: () => number } {
  const saved: ArchiveRefusal[] = []
  let readCount = 0
  let changeCount = 0
  const deps: TooLargeDeps = {
    version: () => '1.0.0',
    refusal: () => saved[saved.length - 1],
    save: (_character, refusal) => {
      saved.push(refusal)
    },
    readLog: () => {
      readCount++
      return Promise.resolve({ headSha256: 'aa', bytes: 2_000 })
    },
    changed: () => {
      changeCount++
    },
    ...over
  }
  return { deps, saved, reads: () => readCount, changes: () => changeCount }
}

test('a refusal holds for the same log, grown, under the same version, and for nothing else', () => {
  assert.equal(refusalHolds(REFUSAL, { headSha256: 'aa', bytes: 1_000 }, '1.0.0'), true)
  assert.equal(refusalHolds(REFUSAL, { headSha256: 'aa', bytes: 5_000 }, '1.0.0'), true, 'the log only grows')
  assert.equal(refusalHolds(REFUSAL, { headSha256: 'bb', bytes: 5_000 }, '1.0.0'), false, 'another log')
  assert.equal(refusalHolds(REFUSAL, { headSha256: 'aa', bytes: 999 }, '1.0.0'), false, 'a shorter file is not that log')
  assert.equal(refusalHolds(REFUSAL, { headSha256: 'aa', bytes: 5_000 }, '1.0.1'), false, 'a new version tries once again')
  assert.equal(refusalHolds(REFUSAL, null, '1.0.0'), false, 'an unread log decides nothing')
  assert.equal(refusalHolds(undefined, { headSha256: 'aa', bytes: 5_000 }, '1.0.0'), false)
})

test('the stored refusals survive the normalizer, and a damaged one is dropped', () => {
  const kept = normalizeLogArchivePrefs({ enabled: true, refusedTooLarge: { A_b: REFUSAL, C_d: { bytes: 'x' }, E_f: null } })
  assert.deepEqual(kept, { enabled: true, refusedTooLarge: { A_b: REFUSAL } })
  assert.deepEqual(normalizeLogArchivePrefs({ enabled: true, refusedTooLarge: 'junk' }), { enabled: true })
  assert.deepEqual(normalizeLogArchivePrefs({ enabled: false }), { enabled: false })
  assert.equal(refusalFor(kept, 'A_b'), REFUSAL)
  assert.equal(refusalFor(kept, 'constructor'), undefined)
})

test('THE AUTOMATIC CHECK AND THE BUTTON BOTH STOP AT A REFUSED LOG, with the reason', () => {
  const due = { on: true, liveBytes: AUTO_ARCHIVE_BYTES, putBack: false }
  assert.equal(autoArchiveDue(due), true)
  assert.equal(autoArchiveDue({ ...due, tooLarge: true }), false)
  const clear: PreflightInput = { on: true, hasLog: true, engineLive: true, sameDrive: true, freeBytes: null, logBytes: 1, interrupted: false, busy: false }
  assert.deepEqual(rotateBlockers(clear), [])
  assert.deepEqual(rotateBlockers({ ...clear, tooLarge: true }), [TOO_LARGE_TO_ARCHIVE])
  assert.ok(TOO_LARGE_TO_ARCHIVE.split(' ').length <= 15)
})

test('A REFUSAL IS REMEMBERED, and the next launch knows it before any capture', async () => {
  const first = memory()
  const firstRun = createTooLargeMemory(first.deps)
  assert.equal(await firstRun.check(LOG), false)
  assert.equal(first.reads(), 0, 'with nothing on record the log is not even opened')
  await firstRun.remember(LOG)
  assert.deepEqual(first.saved, [{ headSha256: 'aa', bytes: 2_000, appVersion: '1.0.0' }])
  assert.equal(firstRun.known(LOG), true)
  assert.equal(first.changes(), 1, 'the status is composed again')

  const nextLaunch = createTooLargeMemory({ ...first.deps })
  assert.equal(await nextLaunch.check(LOG), true)
})

test('known answers from memory and looks at the file in the background, once', async () => {
  const m = memory({ refusal: () => ({ ...REFUSAL, bytes: 2_000 }) })
  const run = createTooLargeMemory(m.deps)
  assert.equal(run.known(null), false)
  assert.equal(run.known(LOG), false, 'the first ask does not wait on the disk')
  assert.equal(run.known(LOG), false)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(m.reads(), 1)
  assert.equal(run.known(LOG), true)
  assert.equal(m.changes(), 1)
})

test('a log that cannot be read is not recorded as refused', async () => {
  const m = memory({ readLog: () => Promise.resolve(null) })
  const run = createTooLargeMemory(m.deps)
  await run.remember(LOG)
  assert.deepEqual(m.saved, [])
  assert.equal(run.known(LOG), false)
})

test('reading a log for its identity leaves the file exactly as it was', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-too-large-'))
  try {
    const path = join(dir, 'eqlog_Name_server.txt')
    const text = '[Sat Nov 21 12:00:00 2026] Welcome to EverQuest!\r\n'.repeat(4_000)
    writeFileSync(path, text)
    const identity = await readLogIdentity(path)
    assert.equal(identity?.bytes, text.length)
    assert.match(identity?.headSha256 ?? '', /^[0-9a-f]{64}$/)
    assert.equal(readFileSync(path, 'utf8'), text)
    assert.equal(await readLogIdentity(join(dir, 'missing.txt')), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('only a refused reply a capture needs says the archive cannot work', () => {
  assert.equal(replyStopsCapture({ op: 'module.snapshot', module: 'loot', refused: true }), true)
  assert.equal(replyStopsCapture({ op: 'combat.snapshot', module: null, refused: true }), true)
  assert.equal(replyStopsCapture({ op: 'module.snapshot', module: 'loot', refused: false }), false, 'read but not shown: the archive still works')
  assert.equal(replyStopsCapture({ op: 'module.snapshot', module: 'notCaptured', refused: true }), false)
  assert.equal(replyStopsCapture({ op: 'mob.lookup', module: null, refused: true }), false)
})

test('NO LINE OFFERS THE ARCHIVE FOR A LOG IT CANNOT WORK ON', () => {
  const read = (why: 'tooLarge' | 'timedOut'): LogReadFacts['combatReads'][number] => ({ key: 'fight', unserved: 'no', why, code: null, at: NOW, since: NOW })
  for (const archiveOn of [false, true]) {
    const notes = report({ ...LIVE, archiveOn, archiveWontHelp: true, tooLargeModules: ['loot'] }).notes
    assert.equal(notes.length, 1)
    assert.equal(notes[0].tryLine, 'This log is too large to archive, so the app cannot shrink it.')
    assert.deepEqual(report({ ...LIVE, archiveOn, archiveWontHelp: true, large: { op: 'module.snapshot', module: 'loot', chars: 20 * MB, refused: false, limit: null, at: NOW } }).notes, [])
    for (const why of ['tooLarge', 'timedOut'] as const) {
      const r = report({ ...LIVE, archiveOn, archiveWontHelp: true, combatReads: [read(why)] })
      assert.doesNotMatch(r.tryLine ?? '', /Summarize/, r.wait)
    }
  }
  // Without the fact, the lines are the ones they were.
  assert.equal(report({ ...LIVE, combatReads: [read('tooLarge')] }).tryLine, LOG_READ_TRY.replyTooLarge)
  assert.equal(report({ ...LIVE, combatReads: [read('timedOut')] }).tryLine, LOG_READ_TRY.panelSlow)
})

test('the new lines are short sentences, and every Try line that offers the archive has one', () => {
  for (const [wait, line] of Object.entries(LOG_READ_TRY)) {
    if (line?.includes('Summarize') === true) assert.ok(wait in LOG_READ_TRY_NO_ARCHIVE, wait)
  }
  for (const line of Object.values(LOG_READ_TRY_NO_ARCHIVE)) {
    const words = line.split(' ').length
    assert.ok(words >= 7 && words <= 15, line)
    assert.match(line, /\.$/)
  }
})

test('the capture refusal the memory listens for is the one the card prints', () => {
  assert.equal(TOO_LARGE_REASON, 'this log is too large to summarize in one piece')
})
