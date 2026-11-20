// ============================================================================
// logArchiveAutoDue.test.mts — when the automatic archive runs (log archive, autoArchive.ts).
// ============================================================================
//
// A log the app archived on its own was over the limit, so the log a Put back joins is over it
// too. The put back restarts the app, and the launch check then archived the joined log again
// within a minute: the Put back did nothing that lasted. A log the player put back now waits for
// Archive now. The app knows such a log from what is already on disk: the live log begins with an
// archive whose record is back in state `backed-up`.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logWasPutBack } from '../src/main/logArchive/history'
import { writeSegment } from '../src/main/logArchive/segmentStore'
import { putBackInLive, type LiveLog } from '../src/shared/logArchive/eligible'
import { AUTO_ARCHIVE_BYTES, autoArchiveDue } from '../src/shared/logArchive/preflight'
import { SEGMENT_VERSION, type Segment, type SegmentState } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const ARCHIVED = '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!\r\n'
const FRESH = '[Mon Aug 03 09:00:00 2026] after the archive\r\n'
const BYTES = Buffer.byteLength(ARCHIVED)

function segment(state: SegmentState, character = 'primitive_freeport'): Segment {
  return {
    v: SEGMENT_VERSION,
    id: `${character}-20260802151205-${BYTES}`,
    character,
    state,
    log: { bytes: BYTES, sha256: sha(ARCHIVED), headBytes: BYTES, headSha256: sha(ARCHIVED), firstStamp: '2026-08-02 15:12:05', lastStamp: '2026-08-02 15:12:05' },
    producedBy: { app: '1.0.0', engine: '1.0.0' },
    archivePath: 'C:/Logs/companion-archive/x.log.gz',
    modules: {}
  }
}

/** The live log as the eligibility rules read it. */
function liveOf(text: string): LiveLog {
  const head = Buffer.from(text)
  return { headSha256: (n) => (head.length < n ? null : sha(head.subarray(0, n))), firstStamp: null }
}

test('automatic archive: due only with the switch on, the log at the limit, and no put back', () => {
  const over = { on: true, liveBytes: AUTO_ARCHIVE_BYTES, putBack: false }
  assert.equal(autoArchiveDue(over), true)
  assert.equal(autoArchiveDue({ ...over, putBack: true }), false, 'a log the player put back waits for Archive now')
  assert.equal(autoArchiveDue({ ...over, on: false }), false)
  assert.equal(autoArchiveDue({ ...over, liveBytes: AUTO_ARCHIVE_BYTES - 1 }), false)
})

test('put back: the live log begins with an archive of this character that is no longer kept', () => {
  const joined = liveOf(ARCHIVED + FRESH)
  assert.equal(putBackInLive([segment('backed-up')], 'primitive_freeport', joined), true)
  assert.equal(putBackInLive([segment('sealed')], 'primitive_freeport', joined), false, 'a kept archive is not a put back')
  assert.equal(putBackInLive([segment('backed-up', 'alt_freeport')], 'primitive_freeport', joined), false, 'another character’s')
  assert.equal(putBackInLive([segment('backed-up')], 'primitive_freeport', liveOf(FRESH)), false, 'archived again: the log is fresh')
  assert.equal(putBackInLive([], 'primitive_freeport', joined), false)
})

const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

test('put back: read off the files a Put back leaves, and over once the log is archived again', () => {
  const root = mkdtempSync(join(tmpdir(), 'logautodue-'))
  roots.push(root)
  const dir = join(root, 'companion-archive')
  mkdirSync(dir)
  const logPath = join(root, 'eqlog_Primitive_freeport.txt')
  // What restoreNow leaves: the joined log, and the record back in `backed-up`.
  writeFileSync(logPath, ARCHIVED + FRESH)
  writeSegment(dir, segment('backed-up'))
  assert.equal(logWasPutBack(dir, 'primitive_freeport', logPath), true)
  assert.equal(logWasPutBack(dir, 'alt_freeport', logPath), false)
  // Archive now moves the joined log away and a fresh one starts.
  writeFileSync(logPath, FRESH)
  assert.equal(logWasPutBack(dir, 'primitive_freeport', logPath), false)
  assert.equal(logWasPutBack(dir, 'primitive_freeport', join(root, 'missing.txt')), false, 'an unreadable log decides nothing')
})
