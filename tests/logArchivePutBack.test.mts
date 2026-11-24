// ============================================================================
// logArchivePutBack.test.mts — a put back that stops part-way (log archive, step 3.6).
// ============================================================================
//
// The clean run is in logArchiveRotate.test.mts. Here every test stops the put back somewhere, or
// starts from the files a stopped one left, and checks the one promise: every line is in the live
// log or in a file the reply names, and the next try finishes from those files, never writes over
// them. Each runs on a temp folder with an archive written here.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { sameFile } from '../src/main/logArchive/joinLive'
import { putBackLeftovers, restoreLog } from '../src/main/logArchive/rotate'
import { rotateBlockers } from '../src/shared/logArchive/preflight'
import { SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const ARCHIVED = '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!\r\n[Sun Aug 02 15:20:00 2026] You have slain a gnoll pup!\r\n'
const FRESH = '[Mon Aug 03 09:00:00 2026] after the archive\r\n'
const NEWER = '[Mon Aug 03 10:00:00 2026] after the first try\r\n'
const BYTES = Buffer.byteLength(ARCHIVED)

const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

interface Fixture {
  logPath: string
  dir: string
  seg: Segment
  /** The file the archive is unpacked to and the live log joined onto. */
  joined: string
}

/** An archived log, with FRESH written to the live log since. */
function archivedThenPlayed(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'logputback-'))
  roots.push(root)
  const dir = join(root, 'Logs', 'companion-archive')
  mkdirSync(dir, { recursive: true })
  const logPath = join(root, 'Logs', 'eqlog_Primitive_freeport.txt')
  const archivePath = join(dir, 'eqlog_Primitive_freeport_2026-08-02_to_2026-08-02.log.gz')
  writeFileSync(archivePath, gzipSync(Buffer.from(ARCHIVED)))
  writeFileSync(logPath, FRESH)
  const id = `primitive_freeport-20260802151205-${BYTES}`
  const seg: Segment = {
    v: SEGMENT_VERSION,
    id,
    character: 'primitive_freeport',
    state: 'sealed',
    log: { bytes: BYTES, sha256: sha(ARCHIVED), headBytes: BYTES, headSha256: sha(ARCHIVED), firstStamp: '2026-08-02 15:12:05', lastStamp: '2026-08-02 15:20:00' },
    producedBy: { app: '1.0.0', engine: '1.0.0' },
    archivePath,
    archiveSource: { bytes: BYTES, sha256: sha(ARCHIVED) },
    modules: {}
  }
  return { logPath, dir, seg, joined: join(dir, `${id}.restoring`) }
}

const scratch = (dir: string): string[] => readdirSync(dir).filter((x) => /\.(restoring|part|partial)$/.test(x))

const refused = (code: string) => (): void => {
  throw Object.assign(new Error(`${code}: refused`), { code })
}

test('put back: lines an earlier try had already joined are kept, and the second try finishes it', async () => {
  const f = archivedThenPlayed()
  // Where a first try stops when the link is refused: the live lines are only in the joined file.
  writeFileSync(f.joined, ARCHIVED + FRESH)
  writeFileSync(f.logPath, NEWER)
  const back = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: a refused link keeps the newest lines, says where, and the second try finishes it', async () => {
  const f = archivedThenPlayed()
  // The link to the log's name is refused, and so is the copy that stands in for it (a program
  // holding the joined file, say).
  const link = (from: string, to: string): void => (to === f.logPath ? refused('EPERM')() : linkSync(from, to))
  const first = await restoreLog(f.logPath, f.dir, f.seg, { link, copy: refused('EPERM') })
  assert.equal(first.ok, false)
  assert.ok(first.reason.includes(f.joined), first.reason)
  assert.match(first.reason, /Put back again/)
  assert.equal(readFileSync(f.joined, 'utf8'), ARCHIVED + FRESH, 'the joined file holds the archive and the lines since')
  assert.equal(readFileSync(f.logPath).length, 0, 'the log keeps its name, empty')
  assert.deepEqual(putBackLeftovers(f.dir), [`${f.seg.id}.restoring`])
  appendFileSync(f.logPath, NEWER)
  const second = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(second.ok, second.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

// A drive without hard links (exFAT, FAT32) refuses every link (owner, 2026-11-23: "do the most
// efficient for the scenario, if hard link fails, can we fall back to copy?"). The join is then
// copied to the log's name, created exclusively, so a log the game made first is never replaced.

for (const code of ['EPERM', 'ENOTSUP', 'EISDIR', 'EXDEV']) {
  test(`put back: a drive that refuses hard links (${code}) gets the log back by a copy`, async () => {
    const f = archivedThenPlayed()
    const back = await restoreLog(f.logPath, f.dir, f.seg, { link: refused(code) })
    assert.ok(back.ok, back.reason)
    assert.equal(back.how, 'copy')
    assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH)
    assert.deepEqual(scratch(f.dir), [])
    assert.deepEqual(scratch(join(f.dir, '..')), [], 'nothing is left beside the log')
    assert.deepEqual(putBackLeftovers(f.dir), [])
  })
}

test('put back: lines an earlier try left on such a drive are joined and finished now', async () => {
  const f = archivedThenPlayed()
  // What a version before the fallback left there: the lines since the archive, only in the joined file.
  writeFileSync(f.joined, ARCHIVED + FRESH)
  writeFileSync(f.logPath, NEWER)
  const back = await restoreLog(f.logPath, f.dir, f.seg, { link: refused('EISDIR') })
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: a log the game makes just before the copy is never written over; its lines are joined', async () => {
  const f = archivedThenPlayed()
  let game = true
  // The game writes a line in the moment before the name is taken (seams for either way of naming).
  const gameFirst = <A extends unknown[]>(real: (...a: A) => void) => (...a: A): void => {
    if (game) writeFileSync(f.logPath, NEWER)
    game = false
    real(...a)
  }
  const io = { link: refused('ENOTSUP'), copy: gameFirst(copyFileSync), rename: gameFirst(renameSync) }
  const back = await restoreLog(f.logPath, f.dir, f.seg, io)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: a copy that stops half-way leaves no half log, keeps every line, and the next try finishes', async () => {
  const f = archivedThenPlayed()
  const halfCopy = (from: string, to: string): void => {
    writeFileSync(to, readFileSync(from).subarray(0, 10))
    refused('ENOSPC')()
  }
  const first = await restoreLog(f.logPath, f.dir, f.seg, { link: refused('EXDEV'), copy: halfCopy })
  assert.equal(first.ok, false)
  assert.ok(first.reason.includes(f.joined), first.reason)
  assert.match(first.reason, /Put back again/)
  assert.equal(readFileSync(f.joined, 'utf8'), ARCHIVED + FRESH)
  assert.equal(readFileSync(f.logPath).length, 0, 'the log keeps its name, never a half copy')
  assert.deepEqual(scratch(f.dir).filter((x) => x !== `${f.seg.id}.restoring`), [], 'the half copy is not kept as a piece')
  appendFileSync(f.logPath, NEWER)
  const second = await restoreLog(f.logPath, f.dir, f.seg, { link: refused('EXDEV') })
  assert.ok(second.ok, second.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
})

test('put back: a half copy a killed try left under the log’s name is not joined twice', async () => {
  const f = archivedThenPlayed()
  writeFileSync(f.joined, ARCHIVED + FRESH)
  writeFileSync(f.logPath, (ARCHIVED + FRESH).slice(0, 30))
  const back = await restoreLog(f.logPath, f.dir, f.seg, { link: refused('EXDEV') })
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH)
})

test('put back: a copy with no room for it is not started, and every line is kept', async () => {
  const f = archivedThenPlayed()
  const back = await restoreLog(f.logPath, f.dir, f.seg, { link: refused('EXDEV'), freeBytes: () => 5 })
  assert.equal(back.ok, false)
  assert.match(back.reason, /not enough free space/)
  assert.equal(readFileSync(f.joined, 'utf8'), ARCHIVED + FRESH)
  assert.deepEqual(scratch(join(f.dir, '..')), [])
})

test('put back: a piece the launch recovery left for another log does not block Put back', async () => {
  const f = archivedThenPlayed()
  // The recovery's pieces are `<id>.moving.<at>.part`; a capture of the same bytes shares the id.
  const other = join(f.dir, `${f.seg.id}.moving.${BYTES}.part`)
  writeFileSync(other, 'the recovery’s lines\r\n')
  const back = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH)
  assert.equal(readFileSync(other, 'utf8'), 'the recovery’s lines\r\n', 'left byte for byte')
})

test('put back: a volume that reports file id 0 for every file never has two files taken for one', () => {
  const f = archivedThenPlayed()
  writeFileSync(f.joined, ARCHIVED)
  const zero = (): { dev: bigint; ino: bigint } => ({ dev: 7n, ino: 0n })
  assert.equal(sameFile(f.joined, f.logPath, zero), false)
  assert.equal(sameFile(f.joined, f.logPath, () => ({ dev: 0n, ino: 5n })), false)
  assert.equal(sameFile(f.joined, f.logPath, () => ({ dev: 7n, ino: 5n })), true, 'a real id is trusted')
})

test('put back: a try that died after its copy was named is finished without joining the archive twice', async () => {
  const f = archivedThenPlayed()
  writeFileSync(f.joined, ARCHIVED + FRESH)
  writeFileSync(f.logPath, ARCHIVED + FRESH + NEWER)
  const back = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: a join that fails leaves the live log where it was, and the next try works', async () => {
  const f = archivedThenPlayed()
  const first = await restoreLog(f.logPath, f.dir, f.seg, { append: refused('ENOSPC') })
  assert.equal(first.ok, false)
  assert.match(first.reason, /Nothing has changed/)
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH)
  assert.deepEqual(scratch(f.dir), [])
  const second = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(second.ok, second.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH)
})

test('put back: when the game made a new log during a failed join, the old lines keep a named file and their place', async () => {
  const f = archivedThenPlayed()
  const first = await restoreLog(f.logPath, f.dir, f.seg, {
    append: () => {
      writeFileSync(f.logPath, NEWER)
      refused('ENOSPC')()
    }
  })
  assert.equal(first.ok, false)
  const piece = join(f.dir, `${f.seg.id}.${BYTES}.part`)
  assert.ok(first.reason.includes(piece), first.reason)
  assert.equal(readFileSync(piece, 'utf8'), FRESH)
  assert.equal(readFileSync(f.joined, 'utf8'), ARCHIVED, 'the half-added copy was cut off')
  assert.equal(readFileSync(f.logPath, 'utf8'), NEWER, 'the game’s new log is not touched')
  const second = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(second.ok, second.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: a piece set aside by a try that died is joined once, in order, never written over', async () => {
  const f = archivedThenPlayed()
  // Killed half-way through adding FRESH: the piece is whole, the joined file has half of it.
  writeFileSync(f.joined, ARCHIVED + FRESH.slice(0, 20))
  writeFileSync(join(f.dir, `${f.seg.id}.${BYTES}.part`), FRESH)
  writeFileSync(f.logPath, NEWER)
  const back = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH + NEWER)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: a try that died right after the link is finished without joining the archive twice', async () => {
  const f = archivedThenPlayed()
  writeFileSync(f.logPath, ARCHIVED + FRESH)
  linkSync(f.logPath, f.joined)
  const back = await restoreLog(f.logPath, f.dir, f.seg)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH)
  assert.deepEqual(scratch(f.dir), [])
})

test('put back: scratch files this version cannot place are refused by name and left byte for byte', async () => {
  const f = archivedThenPlayed()
  // An older version's piece carries no place in its name.
  const part = join(f.dir, `${f.seg.id}.part`)
  writeFileSync(part, 'stranded lines\r\n')
  writeFileSync(f.joined, ARCHIVED + 'earlier lines\r\n')
  const withPart = await restoreLog(f.logPath, f.dir, f.seg)
  assert.equal(withPart.ok, false)
  assert.ok(withPart.reason.includes(part), withPart.reason)
  assert.equal(readFileSync(part, 'utf8'), 'stranded lines\r\n')
  assert.equal(readFileSync(f.joined, 'utf8'), ARCHIVED + 'earlier lines\r\n')
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH)

  rmSync(part)
  writeFileSync(f.joined, 'not this archive\r\n' + ARCHIVED)
  const wrongBase = await restoreLog(f.logPath, f.dir, f.seg)
  assert.equal(wrongBase.ok, false)
  assert.ok(wrongBase.reason.includes(f.joined), wrongBase.reason)
  assert.equal(readFileSync(f.joined, 'utf8'), 'not this archive\r\n' + ARCHIVED)
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH)
})

test('put back: an archive that does not unpack to its recorded bytes leaves no copy behind', async () => {
  const f = archivedThenPlayed()
  const back = await restoreLog(f.logPath, f.dir, { ...f.seg, archiveSource: { bytes: BYTES, sha256: sha('x') } })
  assert.equal(back.ok, false)
  assert.match(back.reason, /Nothing has changed/)
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH)
  assert.deepEqual(scratch(f.dir), [], 'nothing is left to stop the next try')
})

// The record stores the archive's full path; the folder moves with the game's Logs folder.

test('put back: after the game folder moved, the archive is found by its name in the archive folder', async () => {
  const f = archivedThenPlayed()
  const stale = { ...f.seg, archivePath: join(f.dir, 'old-install', 'eqlog_Primitive_freeport_2026-08-02_to_2026-08-02.log.gz') }
  const back = await restoreLog(f.logPath, f.dir, stale)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), ARCHIVED + FRESH)
})

test('put back: an archive that is gone is refused at once and nothing is touched', { timeout: 5000 }, async () => {
  const f = archivedThenPlayed()
  rmSync(f.seg.archivePath ?? '')
  const back = await restoreLog(f.logPath, f.dir, f.seg)
  assert.equal(back.ok, false)
  assert.match(back.reason, /its archive is missing from .+ Nothing has changed/)
  assert.equal(readFileSync(f.logPath, 'utf8'), FRESH)
  assert.deepEqual(scratch(f.dir), [])
})

test('preflight: an unfinished put back stops a new archive, which would end that archive being the newest', () => {
  const ok = { on: true, hasLog: true, engineLive: true, sameDrive: true, freeBytes: 10, logBytes: 5, interrupted: false, busy: false }
  const why = rotateBlockers({ ...ok, putBackUnfinished: true })
  assert.equal(why.length, 1)
  assert.match(why[0], /Put back on the newest archive/)
})
