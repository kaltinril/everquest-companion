// ============================================================================
// logArchiveRecover.test.mts — an archive that cannot be finished puts the log back by itself.
// ============================================================================
//
// Owner, 2026-11-23: "if the archivable fails, we need to recover for the user so they aren't
// screwed with no log data". An archive that moved the log aside and then stopped (a crash, a quit,
// a disk that refused the compressed copy, a record that no longer matches) left the player's old
// lines in `<id>.moving`, out of the log the app reads, until someone relinked it by hand. The
// launch recovery still finishes the archive when it can. When it cannot, it now joins the moved
// file back in front of the live log, so the log is whole under its own name again.
//
// Each test builds the interrupted state by hand in a temp folder: the captured record, the moved
// file, the journal, and a live log holding what the game wrote since the move.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupLog } from '../src/main/logArchive/backup'
import { readLogPrefix } from '../src/main/logArchive/logPrefix'
import { JOURNAL, readJournal, recoverRotation, recoveredNote, unfinishedReason, type RotateDeps } from '../src/main/logArchive/rotate'
import { listSegments, writeSegment } from '../src/main/logArchive/segmentStore'
import { SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const MOVED = '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!\r\n[Sun Aug 02 15:20:00 2026] You have slain a gnoll pup!\r\n'
const FRESH = '[Mon Aug 03 09:00:00 2026] after the move\r\n'
const NEWER = '[Mon Aug 03 10:00:00 2026] after the first launch\r\n'
const BYTES = Buffer.byteLength(MOVED)
const ID = `primitive_freeport-20260802151205-${BYTES}`

const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

interface Interrupted {
  dir: string
  logPath: string
  movedPath: string
}

/** An archive stopped after the move: the record, the moved log, the journal, and FRESH in the live log. */
function interrupted(opts: { moved?: string; state?: Segment['state']; record?: boolean } = {}): Interrupted {
  const root = mkdtempSync(join(tmpdir(), 'logrecover-'))
  roots.push(root)
  const dir = join(root, 'Logs', 'companion-archive')
  mkdirSync(dir, { recursive: true })
  const logPath = join(root, 'Logs', 'eqlog_Primitive_freeport.txt')
  const movedPath = join(dir, `${ID}.moving`)
  writeFileSync(movedPath, opts.moved ?? MOVED)
  writeFileSync(logPath, FRESH)
  if (opts.record !== false) {
    writeSegment(dir, {
      v: SEGMENT_VERSION,
      id: ID,
      character: 'primitive_freeport',
      state: opts.state ?? 'captured',
      log: { bytes: BYTES, sha256: sha(MOVED), headBytes: BYTES, headSha256: sha(MOVED), firstStamp: '2026-08-02 15:12:05', lastStamp: '2026-08-02 15:20:00' },
      producedBy: { app: '1.0.0', engine: '1.0.0' },
      archivePath: null,
      modules: {}
    })
  }
  writeFileSync(join(dir, JOURNAL), JSON.stringify({ v: 1, logPath, movedPath, segmentId: ID, step: 'moved' }))
  return { dir, logPath, movedPath }
}

const deps = (over: Partial<RotateDeps> = {}): RotateDeps => ({
  backup: backupLog,
  readPrefix: readLogPrefix,
  writeSegment,
  readSegment: (dir, id) => listSegments(dir).segments.find((s) => s.id === id) ?? null,
  ...over
})

const refusedBackup = deps({ backup: async () => ({ ok: false, reason: 'the disk refused the write' }) })

const refused = (code: string) => (): never => {
  throw Object.assign(new Error(`${code}: refused`), { code })
}

/** Files in the archive folder that hold log lines out of the log. */
const strays = (dir: string): string[] => readdirSync(dir).filter((x) => /\.(moving|part|partial|restoring)$/.test(x))

test('recover: an archive that cannot be finished puts the old log back in front of the new lines', async () => {
  const f = interrupted()
  const done = await recoverRotation(f.dir, refusedBackup)
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH, 'every line is back under the log’s own name, in order')
  assert.equal(readJournal(f.dir), null, 'nothing is left to block the next archive')
  assert.deepEqual(strays(f.dir), [])
  assert.equal(unfinishedReason(done), null, 'the card shows no blocker')
  const note = recoveredNote(done)
  assert.ok(note !== null && note.includes('the disk refused the write'), String(done))
  assert.match(note, /put your log back whole/)
  assert.ok(!note.includes(f.movedPath), 'the note does not send the player to a file that is gone')
  assert.notEqual(listSegments(f.dir).segments[0].state, 'sealed', 'the history is not shown as archived')
})

test('recover: a moved file that does not match its record is still the player’s log, and goes back', async () => {
  const other = '[Sat Aug 01 08:00:00 2026] another start\r\n' + MOVED
  const f = interrupted({ moved: other })
  const done = await recoverRotation(f.dir, deps())
  assert.equal(readFileSync(f.logPath, 'utf8'), other + FRESH)
  assert.match(recoveredNote(done) ?? '', /does not begin with the captured bytes/)
  assert.equal(readJournal(f.dir), null)
})

test('recover: a record that is missing does not strand the moved log', async () => {
  const f = interrupted({ record: false })
  const done = await recoverRotation(f.dir, deps())
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH)
  assert.match(recoveredNote(done) ?? '', /record .+ is missing/)
})

test('recover: a live log the game has not made again is no obstacle', async () => {
  const f = interrupted()
  rmSync(f.logPath)
  await recoverRotation(f.dir, refusedBackup)
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED)
})

test('recover: an archive that can be finished is finished, not undone', async () => {
  const f = interrupted()
  const done = await recoverRotation(f.dir, deps())
  assert.match(done ?? '', /finished/)
  assert.equal(recoveredNote(done), null)
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH, 'the old lines are in the archive, not back in the log')
  assert.equal(listSegments(f.dir).segments[0].state, 'sealed')
})

test('recover: a moved file deleted outside the app clears the journal and says so', async () => {
  const f = interrupted()
  rmSync(f.movedPath)
  const done = await recoverRotation(f.dir, deps())
  assert.equal(readJournal(f.dir), null, 'a journal that can never finish no longer blocks archiving for good')
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH, 'the live log is left alone')
  assert.equal(unfinishedReason(done), null)
  assert.match(recoveredNote(done) ?? '', /no longer at .+nothing could be put back/)
})

test('recover: an archive already sealed is never undone; only its leftover waits for the next start', async () => {
  const f = interrupted({ state: 'sealed' })
  // A moved file the delete cannot remove (here a folder in its place).
  rmSync(f.movedPath)
  mkdirSync(f.movedPath)
  const done = await recoverRotation(f.dir, deps())
  assert.notEqual(unfinishedReason(done), null, String(done))
  assert.equal(recoveredNote(done), null)
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH)
  assert.notEqual(readJournal(f.dir), null)
})

// ── the put back on drives without hard links ─────────────────────────────────────────────────────

for (const code of ['EPERM', 'ENOTSUP', 'EISDIR']) {
  test(`recover: a drive that refuses hard links (${code}) still gets the log back`, async () => {
    const f = interrupted()
    await recoverRotation(f.dir, { ...refusedBackup, joinIo: { link: refused(code) } })
    assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH)
    assert.deepEqual(strays(f.dir), [])
    assert.equal(readJournal(f.dir), null)
  })
}

test('recover: a log folder on another drive from the archive folder gets the log back by a copy', async () => {
  const f = interrupted()
  const io = { link: refused('EXDEV'), rename: refused('EXDEV') }
  const done = await recoverRotation(f.dir, { ...refusedBackup, joinIo: io })
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH)
  assert.deepEqual(strays(f.dir), [])
  assert.deepEqual(readdirSync(join(f.dir, '..')).filter((x) => x.endsWith('.partial')), [], 'no half copy is left beside the log')
  assert.ok(recoveredNote(done) !== null)
})

// ── a put back that stops, and the start after it ─────────────────────────────────────────────────

test('recover: a put back that stops keeps every line in named files, and the next start finishes it without archiving', async () => {
  const f = interrupted()
  const first = await recoverRotation(f.dir, { ...refusedBackup, joinIo: { append: refused('ENOSPC') } })
  const why = unfinishedReason(first)
  assert.ok(why !== null && why.includes('ENOSPC'), String(first))
  assert.ok(why.includes(f.movedPath), 'the reason says where the old log is')
  assert.equal(readFileSync(f.movedPath, 'utf8'), MOVED, 'a half-added copy was cut off')
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH, 'the new lines kept their name')
  assert.equal(readJournal(f.dir)?.step, 'returning')
  writeFileSync(f.logPath, FRESH + NEWER)
  // A disk that now has room for the compressed copy must not archive a log already half put back.
  let archived = false
  const second = await recoverRotation(f.dir, deps({ backup: async (req) => ((archived = true), backupLog(req)) }))
  assert.equal(archived, false)
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH + NEWER)
  assert.ok(recoveredNote(second) !== null, String(second))
  assert.equal(readJournal(f.dir), null)
  assert.deepEqual(strays(f.dir), [])
})

test('recover: a piece set aside by a put back that died is joined once, in order', async () => {
  const f = interrupted()
  // Killed half-way through adding the live log: the piece is whole, the moved file has half of it.
  writeFileSync(f.movedPath, MOVED + FRESH.slice(0, 10))
  writeFileSync(join(f.dir, `${ID}.moving.${BYTES}.part`), FRESH)
  writeFileSync(f.logPath, NEWER)
  writeFileSync(join(f.dir, JOURNAL), JSON.stringify({ ...readJournal(f.dir), step: 'returning' }))
  await recoverRotation(f.dir, deps())
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH + NEWER)
  assert.deepEqual(strays(f.dir), [])
})

test('recover: a put back that died right after the link is finished without joining twice', async () => {
  const f = interrupted()
  writeFileSync(f.movedPath, MOVED + FRESH)
  rmSync(f.logPath)
  linkSync(f.movedPath, f.logPath)
  writeFileSync(join(f.dir, JOURNAL), JSON.stringify({ ...readJournal(f.dir), step: 'returning' }))
  await recoverRotation(f.dir, deps())
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH)
  assert.equal(readJournal(f.dir), null)
  assert.deepEqual(strays(f.dir), [])
})

test('recover: a put back that died after its copy was named is finished without joining twice', async () => {
  const f = interrupted()
  writeFileSync(f.movedPath, MOVED + FRESH)
  // The copy holds the moved file, and the game has written since.
  writeFileSync(f.logPath, MOVED + FRESH + NEWER)
  writeFileSync(join(f.dir, JOURNAL), JSON.stringify({ ...readJournal(f.dir), step: 'returning' }))
  await recoverRotation(f.dir, deps())
  assert.equal(readFileSync(f.logPath, 'utf8'), MOVED + FRESH + NEWER)
  assert.equal(existsSync(f.movedPath), false)
  assert.equal(readJournal(f.dir), null)
})
