// main/logArchive/rotate.ts — MOVE THE LIVE LOG INTO THE ARCHIVE, AND PUT ONE BACK (steps 3.3, 3.4, 3.6).
//
// Every path is an argument, so the whole sequence runs on temp folders in tests. The order is the
// safety design (phase-3-rotation.md):
//
//   1. the captured segment is written (the log is untouched so far);
//   2. a journal entry names the log, the moved file and the segment;
//   3. the live log is renamed into the archive folder, a single operation on one drive;
//   4. an empty live log is created if the game has not already made one (never truncating);
//   5. the moved file is checked to begin with exactly the captured bytes, and any lines the game
//      wrote between the capture and the rename are counted (`gapLines`);
//   6. the moved file is compressed and verified, the segment sealed, its faction lines kept as a
//      ledger beside it (step 4.16, while the moved file still exists), the moved file deleted, and
//      the journal cleared.
//
// Before step 3 nothing in the game's folder has changed. After it, the moved file stays in the
// archive folder until a verified compressed copy exists. `recoverRotation` finishes an
// interrupted run from wherever it stopped, at the next launch.
//
// The game may be running throughout: it opens the log by name for every line (ruling 0.5).

import { appendFileSync, closeSync, existsSync, linkSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statfsSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { createReadStream, createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { Segment, SegmentLog } from '../../shared/logArchive/segment'
import type { BackupRequest, BackupResult } from './backup'
import { archiveName } from './backup'
import { logNameOf, type LedgerSource } from './factionLedgerFile'
import { readLogPrefix } from './logPrefix'

export const JOURNAL = 'rotation-journal.json'

export type JournalStep = 'moving' | 'moved'

export interface Journal {
  v: 1
  logPath: string
  movedPath: string
  segmentId: string
  step: JournalStep
}

export interface RotateDeps {
  backup: (req: BackupRequest) => Promise<BackupResult>
  readPrefix: (path: string, bytes: number) => Promise<SegmentLog>
  writeSegment: (dir: string, s: Segment) => void
  readSegment: (dir: string, id: string) => Segment | null
  /** Step 4.16: keep the moved log's faction lines beside the segment. A failure is the caller's to
   *  note; it never stops the archive. */
  factionLedger?: (dir: string, segmentId: string, source: LedgerSource) => Promise<void>
  /** Test seam: throw here to simulate a crash after the named step. */
  crashAfter?: (step: string) => void
}

export type RotateResult = { ok: true; segment: Segment } | { ok: false; reason: string; logTouched: boolean }

function writeJournal(dir: string, j: Journal): void {
  writeFileSync(join(dir, JOURNAL), JSON.stringify(j))
}

export function readJournal(dir: string): Journal | null {
  try {
    const j = JSON.parse(readFileSync(join(dir, JOURNAL), 'utf8')) as Journal
    return j.v === 1 && typeof j.movedPath === 'string' ? j : null
  } catch {
    return null
  }
}

function clearJournal(dir: string): void {
  rmSync(join(dir, JOURNAL), { force: true })
}

/** Create an empty file at `path` unless one is there. Never truncates what the game made. */
export function ensureFile(path: string): void {
  try {
    closeSync(openSync(path, 'wx'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }
}

/** Newlines in bytes [from, to) of a file: the lines written after the capture point. */
function countLines(path: string, from: number, to: number): number {
  if (to <= from) return 0
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(to - from)
    readSync(fd, buf, 0, buf.length, from)
    let n = 0
    for (const b of buf) if (b === 0x0a) n++
    return n
  } finally {
    closeSync(fd)
  }
}

/** Steps 5 and 6, from a moved file onwards. Safe to run again after a crash at any point. */
async function finishFromMoved(dir: string, j: Journal, deps: RotateDeps): Promise<Segment> {
  ensureFile(j.logPath)
  let seg = deps.readSegment(dir, j.segmentId)
  if (seg === null) throw new Error(`the archive record ${j.segmentId} is missing; the old log is kept at ${j.movedPath}`)
  if (seg.state === 'captured') {
    if (!existsSync(j.movedPath)) throw new Error(`the moved log is missing: ${j.movedPath}`)
    const moved = statSync(j.movedPath).size
    const prefix = await deps.readPrefix(j.movedPath, seg.log.bytes)
    if (prefix.sha256 !== seg.log.sha256) {
      throw new Error(`the moved log does not begin with the captured bytes; it is kept at ${j.movedPath}`)
    }
    const name = archiveName(j.logPath.split(/[\\/]/).pop() ?? 'eqlog', seg.log.firstStamp, seg.log.lastStamp)
    const b = await deps.backup({ source: j.movedPath, bytes: moved, expectSha256: null, dir, name })
    if (!b.ok) throw new Error(`the archive could not be written (${b.reason}); the old log is kept at ${j.movedPath}`)
    seg = {
      ...seg,
      state: 'backed-up',
      archivePath: b.path,
      archiveSource: { bytes: b.bytes, sha256: b.sha256 },
      archiveGzBytes: b.gzBytes,
      gapLines: countLines(j.movedPath, seg.log.bytes, moved)
    }
    deps.writeSegment(dir, seg)
    deps.crashAfter?.('backed-up')
  }
  if (seg.state === 'backed-up') {
    seg = { ...seg, state: 'sealed' }
    deps.writeSegment(dir, seg)
    deps.crashAfter?.('sealed')
  }
  if (deps.factionLedger !== undefined && existsSync(j.movedPath)) {
    await deps.factionLedger(dir, seg.id, { path: j.movedPath, gz: false, logName: logNameOf(j.logPath) }).catch(() => undefined)
  }
  rmSync(j.movedPath, { force: true })
  clearJournal(dir)
  return seg
}

/** Archive the live log behind a captured segment. The caller has run the preflight. */
export async function rotateLog(logPath: string, dir: string, captured: Segment, deps: RotateDeps): Promise<RotateResult> {
  const j: Journal = { v: 1, logPath, movedPath: join(dir, `${captured.id}.moving`), segmentId: captured.id, step: 'moving' }
  // A log captured again at the same length has the same id as the history kept from it (Back up,
  // then Keep, then Archive with nothing played): a move that fails must leave that record as it was.
  const prior = deps.readSegment(dir, captured.id)
  try {
    deps.writeSegment(dir, captured)
    writeJournal(dir, j)
    deps.crashAfter?.('journal')
    renameSync(logPath, j.movedPath)
  } catch (err) {
    clearJournal(dir)
    if (prior !== null) deps.writeSegment(dir, prior)
    const busy = (err as NodeJS.ErrnoException).code === 'EBUSY' || (err as NodeJS.ErrnoException).code === 'EPERM'
    const reason = busy
      ? 'another program is holding the log open, so it was not moved. Nothing has changed.'
      : `the log was not moved (${(err as Error).message}). Nothing has changed.`
    return { ok: false, reason, logTouched: false }
  }
  writeJournal(dir, { ...j, step: 'moved' })
  try {
    deps.crashAfter?.('moved')
    return { ok: true, segment: await finishFromMoved(dir, { ...j, step: 'moved' }, deps) }
  } catch (err) {
    return { ok: false, reason: afterMove(err, j), logTouched: true }
  }
}

/**
 * Step 3.4: finish or clear an interrupted rotation. Run at launch before the engine attaches.
 * Returns what it did, or null when there was no journal.
 */
export async function recoverRotation(dir: string, deps: RotateDeps): Promise<string | null> {
  const j = readJournal(dir)
  if (j === null) return null
  if (j.step === 'moving' && !existsSync(j.movedPath)) {
    clearJournal(dir)
    return 'an archive was interrupted before the log was moved; nothing had changed'
  }
  try {
    const seg = await finishFromMoved(dir, { ...j, step: 'moved' }, deps)
    return `finished an interrupted archive: ${seg.id}`
  } catch (err) {
    return `${NOT_FINISHED}${afterMove(err, j)}`
  }
}

const NOT_FINISHED = 'an interrupted archive could not be finished: '

/** Why the steps after the move stopped, always with where the old log is while it is there. */
function afterMove(err: unknown, j: Journal): string {
  const why = (err as Error).message
  return why.includes(j.movedPath) || !existsSync(j.movedPath) ? why : `${why}; the old log is kept at ${j.movedPath}`
}

/** Why the recovery could not finish, from what `recoverRotation` answered; null when it did, or
 *  had nothing to do. The card shows it (preflight.ts `interruptedReason`). */
export function unfinishedReason(done: string | null): string | null {
  return done?.startsWith(NOT_FINISHED) === true ? done.slice(NOT_FINISHED.length) : null
}

const RESTORING = '.restoring'
const PART = '.part'

/** The scratch files a put-back that stopped part-way left in `dir`. They hold log lines. */
export function putBackLeftovers(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith(RESTORING) || f.endsWith(PART))
}

/** Test seams: the two steps of a put-back that the disk can refuse. */
export interface RestoreIo {
  append?: (path: string, bytes: Buffer) => void
  link?: (from: string, to: string) => void
}

/** A stretch of the live log set aside as `<id>.<at>.part`: `at` is how long the joined file was
 *  before the piece was added, so a half-added copy can be cut off and the piece added again.
 *  NaN for a name without it (an older version's `<id>.part`). */
interface Piece {
  path: string
  at: number
}

function piecesOf(dir: string, id: string): Piece[] {
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${id}.`) && f.endsWith(PART))
  return mine.map((f) => {
    const at = f.slice(id.length + 1, -PART.length)
    return { path: join(dir, f), at: /^\d+$/.test(at) ? Number(at) : NaN }
  })
}

/** Two names of one file (a hard link). */
function sameFile(a: string, b: string): boolean {
  const fileOf = (path: string): string | null => {
    const s = statSync(path, { bigint: true, throwIfNoEntry: false })
    return s === undefined ? null : `${s.dev}:${s.ino}`
  }
  const x = fileOf(a)
  return x !== null && x === fileOf(b)
}

/** Add a piece to the end of `joined`, first cutting off any half-added copy of it. */
function addPiece(joined: string, p: Piece, io: RestoreIo): void {
  truncateSync(joined, Math.min(p.at, statSync(joined).size))
  ;(io.append ?? appendFileSync)(joined, readFileSync(p.path))
  rmSync(p.path)
}

/** Move the live log aside and add its bytes to the end of `joined`. Nothing when there is none. */
function absorbLive(logPath: string, joined: string, io: RestoreIo): void {
  if (!existsSync(logPath)) return
  const at = statSync(joined).size
  const piece: Piece = { path: `${joined.slice(0, -RESTORING.length)}.${at}${PART}`, at }
  // A rename replaces what is at the new name, and a piece there would be the only copy of its lines.
  if (existsSync(piece.path)) throw new Error(`an earlier try left ${piece.path}`)
  renameSync(logPath, piece.path)
  try {
    addPiece(joined, piece, io)
  } catch (err) {
    // Undo the round: cut the half-added copy off and give the log its name back. When either
    // fails the piece keeps its name, which says where it belongs, and the next put-back adds it.
    try {
      truncateSync(joined, at)
      if (linkIfFree(piece.path, logPath)) rmSync(piece.path)
    } catch {
      // The piece stays.
    }
    throw err
  }
}

/** Link `from` to the name `to`; false when the name is taken (the game recreated it). */
function linkIfFree(from: string, to: string, link: (from: string, to: string) => void = linkSync): boolean {
  try {
    link(from, to)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  }
}

async function unpack(archive: string, to: string): Promise<string> {
  const h = createHash('sha256')
  const gun = createGunzip()
  gun.on('data', (c) => h.update(c as Buffer))
  // The archive's own stream is in the pipeline, so one that cannot be read ends the wait.
  await pipeline(createReadStream(archive), gun, createWriteStream(to))
  return h.digest('hex')
}

function roomFor(dir: string, bytes: number): boolean {
  try {
    const s = statfsSync(dir)
    return s.bavail * s.bsize >= bytes
  } catch {
    return true
  }
}

/**
 * `joined` holding the verified archive: the file an earlier try kept, or unpacked now under a
 * `.partial` name (swept at launch, backup.ts) and named only once its bytes are checked. A file
 * already there is never opened for writing: it may hold the only copy of the lines since.
 */
async function archiveBase(archive: string, joined: string, source: { bytes: number; sha256: string }, logPath: string): Promise<void> {
  if (existsSync(joined)) {
    const kept = statSync(joined).size >= source.bytes ? (await readLogPrefix(joined, source.bytes)).sha256 : null
    if (kept === source.sha256) return
    throw new Error(`an earlier try left ${joined}, which does not begin with this archive. Move it somewhere safe, then try again`)
  }
  const live = statSync(logPath, { throwIfNoEntry: false })?.size ?? 0
  if (!roomFor(dirname(joined), source.bytes + live)) throw new Error('there is not enough free space to put the log back')
  const tmp = `${joined}.partial`
  try {
    if ((await unpack(archive, tmp)) !== source.sha256) throw new Error('the archive did not unpack to the bytes it was made from')
    renameSync(tmp, joined)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

/** The pieces of `id` an earlier try set aside. Throws, naming the file, when this version cannot
 *  say where one belongs: a second piece, or a name without a length past the archive's. */
function waitingPieces(dir: string, id: string, archiveBytes: number): Piece[] {
  const waiting = piecesOf(dir, id)
  const lost = waiting.length > 1 ? waiting[1] : waiting.find((p) => !(p.at >= archiveBytes))
  if (lost === undefined) return waiting
  throw new Error(`an earlier try left ${lost.path}, which holds lines from your log. Move it somewhere safe, then try again`)
}

/** Add what is waiting, then the live log, and give the result the live name. */
function joinAndLink(logPath: string, joined: string, waiting: Piece[], io: RestoreIo): void {
  for (const p of waiting) {
    // A piece that is the live log's second name (the undo's link held, its delete did not) is in the log.
    if (sameFile(p.path, logPath)) rmSync(p.path)
    else addPiece(joined, p, io)
  }
  for (let round = 0; round < 50; round++) {
    absorbLive(logPath, joined, io)
    if (linkIfFree(joined, logPath, io.link)) {
      // The log is whole under its own name from here, so nothing after the link is a failure.
      try {
        rmSync(joined)
      } catch {
        // A second name for the log is left; it costs nothing while the log is there.
      }
      return
    }
  }
  throw new Error('the game kept recreating the log; try again in a quiet moment')
}

/** What a put-back that stopped has left, in the player's words. An unpacked copy holding nothing
 *  but the archive is removed, so the folder is as it was. */
function stopped(why: string, dir: string, seg: Segment, joined: string): string {
  const held = [joined, ...piecesOf(dir, seg.id).map((p) => p.path)].filter((p) => existsSync(p))
  const onlyArchive = held.length === 1 && held[0] === joined && statSync(joined).size === seg.archiveSource?.bytes
  if (held.length === 0 || onlyArchive) {
    rmSync(joined, { force: true })
    return `${why}. Nothing has changed.`
  }
  const them = held.length > 1 ? 'them' : 'it'
  return `${why}. The lines since the archive are safe in ${held.join(' and ')}. Leave ${them} there and press Put back again to finish.`
}

/**
 * Step 3.6: put an archived log back in front of the live one. The archive is unpacked and
 * verified, then joined with the live log the way ruling 0.5's test did by hand: move the live log
 * aside, add its bytes to the end, and link the result to the live name, which fails if the game
 * recreated the name meanwhile, in which case it goes round again. No line is removed or changed.
 *
 * A TRY THAT STOPS IS FINISHED BY THE NEXT ONE. Whatever stops it (a full disk, a refused link, the
 * app killed), every line is then in the live log, in the joined file, or in a piece whose name
 * says where it belongs, and the reply names the files. The next try starts from them: it never
 * unpacks over the joined file and never renames over a piece.
 */
export async function restoreLog(logPath: string, dir: string, seg: Segment, io: RestoreIo = {}): Promise<{ ok: boolean; reason: string }> {
  if (seg.archivePath === null || seg.archiveSource === undefined) return { ok: false, reason: 'this history has no archive' }
  const joined = join(dir, `${seg.id}${RESTORING}`)
  const source = seg.archiveSource
  let based = false
  try {
    // A try that died right after the link: the log is whole and `joined` is its second name.
    if (sameFile(joined, logPath)) {
      rmSync(joined)
      return { ok: true, reason: 'restored' }
    }
    const waiting = waitingPieces(dir, seg.id, source.bytes)
    await archiveBase(seg.archivePath, joined, source, logPath)
    based = true
    joinAndLink(logPath, joined, waiting, io)
    return { ok: true, reason: 'restored' }
  } catch (err) {
    const why = (err as Error).message
    if (!based) return { ok: false, reason: `${why}. Nothing has changed.` }
    // As the archive does (step 4): the log keeps its name, empty, never truncating the game's own.
    try {
      ensureFile(logPath)
    } catch {
      // The game makes it on its next line.
    }
    return { ok: false, reason: stopped(why, dir, seg, joined) }
  }
}
