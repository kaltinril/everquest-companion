// ============================================================================
// logArchiveInterrupted.test.mts — an archive that could not be finished says why (log archive, step 3.4).
// ============================================================================
//
// The launch recovery finishes an interrupted archive. When it cannot, the card used to say
// "Restart the app to finish it first", whatever the cause, and the cause went to the error log
// only. A fault that is still there at the next start made that advice untrue. The card now gives
// the reason the recovery gave, with where the old log is kept.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupLog } from '../src/main/logArchive/backup'
import { readLogPrefix } from '../src/main/logArchive/logPrefix'
import { JOURNAL, readJournal, recoverRotation, unfinishedReason, type RotateDeps } from '../src/main/logArchive/rotate'
import { listSegments, writeSegment } from '../src/main/logArchive/segmentStore'
import { rotateBlockers } from '../src/shared/logArchive/preflight'
import { SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const MOVED = '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!\r\n'
const BYTES = Buffer.byteLength(MOVED)
const ID = `primitive_freeport-20260802151205-${BYTES}`

const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/** An archive stopped after the move: the captured record, the moved log, and the journal. */
function interrupted(): { dir: string; movedPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'loginterrupted-'))
  roots.push(root)
  const dir = join(root, 'companion-archive')
  mkdirSync(dir)
  const movedPath = join(dir, `${ID}.moving`)
  writeFileSync(movedPath, MOVED)
  const captured: Segment = {
    v: SEGMENT_VERSION,
    id: ID,
    character: 'primitive_freeport',
    state: 'captured',
    log: { bytes: BYTES, sha256: sha(MOVED), headBytes: BYTES, headSha256: sha(MOVED), firstStamp: '2026-08-02 15:12:05', lastStamp: '2026-08-02 15:12:05' },
    producedBy: { app: '1.0.0', engine: '1.0.0' },
    archivePath: null,
    modules: {}
  }
  writeSegment(dir, captured)
  const journal = { v: 1, logPath: join(root, 'eqlog_Primitive_freeport.txt'), movedPath, segmentId: ID, step: 'moved' }
  writeFileSync(join(dir, JOURNAL), JSON.stringify(journal))
  return { dir, movedPath }
}

const deps = (over: Partial<RotateDeps> = {}): RotateDeps => ({
  backup: backupLog,
  readPrefix: readLogPrefix,
  writeSegment,
  readSegment: (dir, id) => listSegments(dir).segments.find((s) => s.id === id) ?? null,
  ...over
})

// Since 2026-11-23 a recovery that cannot finish puts the moved log back in front of the live one
// (logArchiveRecover.test.mts). The card's reason is then for the case where that stops too.

const fullDisk = { append: (): never => { throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' }) } }

test('recovery: an archive that cannot be finished or put back gives both reasons, and a later start puts it back', async () => {
  const f = interrupted()
  const failed = await recoverRotation(f.dir, deps({ backup: async () => ({ ok: false, reason: 'the disk refused the write' }), joinIo: fullDisk }))
  const why = unfinishedReason(failed)
  assert.ok(why !== null && why.includes('the disk refused the write') && why.includes('ENOSPC'), String(failed))
  assert.ok(why.includes(f.movedPath), 'the reason says where the old log is kept')
  assert.equal(readFileSync(f.movedPath, 'utf8'), MOVED, 'the moved log is kept')
  assert.notEqual(readJournal(f.dir), null)

  const done = await recoverRotation(f.dir, deps())
  assert.equal(unfinishedReason(done), null)
  assert.equal(readJournal(f.dir), null)
  assert.ok(!existsSync(f.movedPath))
  assert.ok(readFileSync(join(f.dir, '..', 'eqlog_Primitive_freeport.txt'), 'utf8').startsWith(MOVED), 'the old lines are back in the log')
})

test('recovery: a reason that does not name the old log has its place added', async () => {
  const f = interrupted()
  const shorter = async (): Promise<never> => {
    throw new Error('the log is 5 bytes, shorter than the 9 captured')
  }
  const why = unfinishedReason(await recoverRotation(f.dir, deps({ readPrefix: shorter, joinIo: fullDisk })))
  assert.equal(why, `the log is 5 bytes, shorter than the 9 captured; it could not be put back in front of your log either (ENOSPC: no space left). Its lines are safe in ${f.movedPath}`)
})

test('recovery: nothing to finish, or finished, gives no reason', () => {
  assert.equal(unfinishedReason(null), null)
  assert.equal(unfinishedReason('finished an interrupted archive: x'), null)
  assert.equal(unfinishedReason('an archive was interrupted before the log was moved; nothing had changed'), null)
})

test('preflight: an archive that could not be finished shows its reason, not advice to restart', () => {
  const ok = { on: true, hasLog: true, engineLive: true, sameDrive: true, freeBytes: 10, logBytes: 5, interrupted: true, busy: false }
  const reason = 'the archive could not be written (EPERM); the old log is kept at C:/Logs/companion-archive/x.moving'
  const known = rotateBlockers({ ...ok, interruptedReason: reason })
  assert.equal(known.length, 1)
  assert.ok(known[0].includes(reason), known[0])
  assert.doesNotMatch(known[0], /Restart the app/)
  assert.match(known[0], /puts your log back whole/)
  // A run that died mid-archive has no reason yet: the next start finishes it.
  assert.match(rotateBlockers(ok)[0], /Restart the app to finish it first/)
  assert.match(rotateBlockers({ ...ok, interruptedReason: null })[0], /Restart the app to finish it first/)
})
