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
// AN ARCHIVE THAT CANNOT BE FINISHED IS UNDONE (owner, 2026-11-23: "if the archivable fails, we need
// to recover for the user so they aren't screwed with no log data"). While the run that moved the
// log goes on, nothing is missing: the engine keeps every line it read before the move. The next
// launch is where the player would lose them, because the engine then reads only the fresh log and
// an unsealed archive is not shown. So the launch recovery first tries to finish, as before; when it
// cannot, it joins the moved file back in front of the live log under the log's own name (journal
// step `returning`, joinLive.ts), before the engine reads anything. That one was chosen over the
// others because the moved file is, byte for byte, what the log held at the move, whatever went
// wrong after it (a refused compressed copy, a record that no longer matches, a missing record), so
// moved + live is exactly the log the game would have had. Finishing needs the cause gone; pointing
// the reader at the moved file needs the engine to read two files as one. A sealed archive is never
// undone: its history is shown, and only the moved file's delete is left for the next start.
//
// The game may be running throughout: it opens the log by name for every line (ruling 0.5).

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { createReadStream, createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { Segment, SegmentLog } from '../../shared/logArchive/segment'
import type { BackupRequest, BackupResult } from './backup'
import { archiveName } from './backup'
import { logNameOf, type LedgerSource } from './factionLedgerFile'
import { alreadyJoined, joinAndName, PART, piecesOf, waitingPieces, type Named, type RestoreIo } from './joinLive'
import { readLogPrefix } from './logPrefix'
import { resolveArchivePath } from './segmentStore'

export type { RestoreIo } from './joinLive'

export const JOURNAL = 'rotation-journal.json'

/** `returning`: the moved log is being joined back in front of the live one; never finish it then. */
export type JournalStep = 'moving' | 'moved' | 'returning'

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
  /** Test seam: the disk steps of putting a moved log back (joinLive.ts). */
  joinIo?: RestoreIo
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
  // A rename replaces what is at the new name, and a moved file left there holds the player's lines.
  if (existsSync(j.movedPath)) {
    const reason = `an earlier archive left ${j.movedPath}, which holds lines from your log, so the log was not moved. Move that file somewhere safe, then try again. Nothing has changed.`
    return { ok: false, reason, logTouched: false }
  }
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
 * Step 3.4: finish or clear an interrupted rotation, or put the moved log back when it cannot be
 * finished. Run at launch before the engine attaches. Returns what it did, or null when there was
 * no journal.
 */
export async function recoverRotation(dir: string, deps: RotateDeps): Promise<string | null> {
  const j = readJournal(dir)
  if (j === null) return null
  if (j.step === 'moving' && !existsSync(j.movedPath)) {
    clearJournal(dir)
    return 'an archive was interrupted before the log was moved; nothing had changed'
  }
  // A put back under way is finished, never archived: the moved file may hold some of the live log.
  // The journal is cleared before the moved file is removed, so a moved file gone in this step was
  // taken outside the app, not joined.
  if (j.step === 'returning') return existsSync(j.movedPath) ? putMovedBack(dir, j, null, deps) : gone(dir, j)
  try {
    const seg = await finishFromMoved(dir, { ...j, step: 'moved' }, deps)
    return `finished an interrupted archive: ${seg.id}`
  } catch (err) {
    return undoOrSay(dir, j, err, deps)
  }
}

const NOT_FINISHED = 'an interrupted archive could not be finished: '
const PUT_BACK = 'an interrupted archive could not be finished, so the log was put back whole: '
const GONE = 'an interrupted archive was cleared: its old log is no longer at '
const LAST_START = 'the last start began putting it back'

/** Why the steps after the move stopped, always with where the old log is while it is there. */
function afterMove(err: unknown, j: Journal): string {
  const why = (err as Error).message
  return why.includes(j.movedPath) || !existsSync(j.movedPath) ? why : `${why}; the old log is kept at ${j.movedPath}`
}

/** The cause alone, without the "kept at" the finishing steps add: once the log is back it is not. */
function causeOf(err: unknown, j: Journal): string {
  return (err as Error).message.replace(`; the old log is kept at ${j.movedPath}`, '').replace(`; it is kept at ${j.movedPath}`, '')
}

/** The finish failed: undo it when that is safe, otherwise say why. */
async function undoOrSay(dir: string, j: Journal, err: unknown, deps: RotateDeps): Promise<string> {
  // A sealed archive is shown on the tabs; only the moved file's delete is left. Never undone.
  if (deps.readSegment(dir, j.segmentId)?.state === 'sealed') return `${NOT_FINISHED}${afterMove(err, j)}`
  if (!existsSync(j.movedPath)) return gone(dir, j)
  return putMovedBack(dir, j, causeOf(err, j), deps)
}

/** The moved file was moved or deleted outside the app. Nothing can be put back, and a journal
 *  kept would block every archive for good. Lines a put back had set aside are named, never moved. */
function gone(dir: string, j: Journal): string {
  clearJournal(dir)
  const aside = piecesOf(j.movedPath).map((p) => p.path)
  const kept = aside.length > 0 ? `; lines set aside from your log are kept in ${aside.join(' and ')}` : ''
  return `${GONE}${j.movedPath}, so nothing could be put back${kept}`
}

/** After a put back the record must not stand for a finished backup: a `backed-up` record whose
 *  head the live log begins with reads as a log the player put back, which pauses the automatic
 *  archive (eligible.ts `putBackInLive`). The compressed copy itself is kept. */
function demoteRecord(dir: string, j: Journal, deps: RotateDeps): void {
  try {
    const seg = deps.readSegment(dir, j.segmentId)
    if (seg?.state === 'backed-up') deps.writeSegment(dir, { ...seg, state: 'captured' })
  } catch {
    // The automatic archive then waits for Archive now; nothing is lost.
  }
}

/** Join the moved file back in front of the live log, under the log's name. `why` is the reason
 *  the archive could not be finished; null when a put back an earlier start began is continued. */
async function putMovedBack(dir: string, j: Journal, why: string | null, deps: RotateDeps): Promise<string> {
  try {
    writeJournal(dir, { ...j, step: 'returning' })
    if (!(await alreadyJoined(j.movedPath, j.logPath))) {
      waitingPieces(j.movedPath, 0)
      joinAndName(j.logPath, j.movedPath, j.movedPath, deps.joinIo ?? {})
    }
    demoteRecord(dir, j, deps)
    // The journal goes first: a moved file that is gone in step `returning` was not joined.
    clearJournal(dir)
    try {
      rmSync(j.movedPath, { force: true })
    } catch {
      // A spare copy of lines the log now holds; it costs disk space only.
    }
    return `${PUT_BACK}${why ?? LAST_START}`
  } catch (err) {
    try {
      ensureFile(j.logPath)
    } catch {
      // The game makes it on its next line.
    }
    const held = [j.movedPath, ...piecesOf(j.movedPath).map((p) => p.path)].filter((p) => existsSync(p))
    const safe = held.length > 0 ? `. Its lines are safe in ${held.join(' and ')}` : ''
    const stop = (err as Error).message
    const what = why === null ? `putting the log back stopped (${stop})` : `${why}; it could not be put back in front of your log either (${stop})`
    return `${NOT_FINISHED}${what}${safe}`
  }
}

/** Why the recovery could not finish, from what `recoverRotation` answered; null when it did, or
 *  had nothing to do. The card shows it (preflight.ts `interruptedReason`). */
export function unfinishedReason(done: string | null): string | null {
  return done?.startsWith(NOT_FINISHED) === true ? done.slice(NOT_FINISHED.length) : null
}

/** What the card says when the recovery put the log back, or found nothing to put back; null
 *  otherwise. Kept in memory until an archive succeeds (actions.ts `autoStopped`). */
export function recoveredNote(done: string | null): string | null {
  if (done?.startsWith(PUT_BACK) === true) {
    return `An archive could not be finished (${done.slice(PUT_BACK.length)}), so the app put your log back whole. Nothing is missing.`
  }
  if (done?.startsWith(GONE) === true) {
    const [where, kept = ''] = done.slice(GONE.length).split(', so nothing could be put back')
    return `An archive could not be finished, and its old log is no longer at ${where} (moved or deleted outside the app), so nothing could be put back${kept}.`
  }
  return null
}

const RESTORING = '.restoring'

/** The scratch files a put-back that stopped part-way left in `dir`. They hold log lines. */
export function putBackLeftovers(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith(RESTORING) || f.endsWith(PART))
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
async function archiveBase(archive: string | null, joined: string, source: { bytes: number; sha256: string }, logPath: string): Promise<void> {
  if (existsSync(joined)) {
    const kept = statSync(joined).size >= source.bytes ? (await readLogPrefix(joined, source.bytes)).sha256 : null
    if (kept === source.sha256) return
    throw new Error(`an earlier try left ${joined}, which does not begin with this archive. Move it somewhere safe, then try again`)
  }
  if (archive === null) throw new Error(`its archive is missing from ${dirname(joined)}`)
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

/** What a put-back that stopped has left, in the player's words. An unpacked copy holding nothing
 *  but the archive is removed, so the folder is as it was. */
function stopped(err: Error, dir: string, seg: Segment, joined: string): string {
  const why = err.message
  const held = [joined, ...piecesOf(join(dir, seg.id)).map((p) => p.path)].filter((p) => existsSync(p))
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
 * verified, then joined with the live log (joinLive.ts): move the live log aside, add its bytes to
 * the end, and give the result the live name, by a hard link, or on a drive without them by a
 * copy that cannot replace a log the game made. No line is removed or changed.
 *
 * A TRY THAT STOPS IS FINISHED BY THE NEXT ONE. Whatever stops it (a full disk, a refused link, the
 * app killed), every line is then in the live log, in the joined file, or in a piece whose name
 * says where it belongs, and the reply names the files. The next try starts from them: it never
 * unpacks over the joined file and never renames over a piece.
 */
export async function restoreLog(logPath: string, dir: string, seg: Segment, io: RestoreIo = {}): Promise<{ ok: boolean; reason: string; how?: Named }> {
  if (seg.archivePath === null || seg.archiveSource === undefined) return { ok: false, reason: 'this history has no archive' }
  const joined = join(dir, `${seg.id}${RESTORING}`)
  const stem = join(dir, seg.id)
  const source = seg.archiveSource
  let based = false
  try {
    // A try that died right after the name was given: the log is whole and holds all of `joined`.
    if (await alreadyJoined(joined, logPath)) {
      rmSync(joined)
      return { ok: true, reason: 'restored' }
    }
    waitingPieces(stem, source.bytes)
    await archiveBase(resolveArchivePath(dir, seg), joined, source, logPath)
    based = true
    const how = joinAndName(logPath, joined, stem, io)
    // The log is whole under its own name from here, so nothing after it is a failure.
    try {
      rmSync(joined)
    } catch {
      // A second name or a spare copy of the log is left; the next Put back finds it already joined.
    }
    return { ok: true, reason: 'restored', how }
  } catch (err) {
    const why = (err as Error).message
    if (!based) return { ok: false, reason: `${why}. Nothing has changed.` }
    // As the archive does (step 4): the log keeps its name, empty, never truncating the game's own.
    try {
      ensureFile(logPath)
    } catch {
      // The game makes it on its next line.
    }
    return { ok: false, reason: stopped(err as Error, dir, seg, joined) }
  }
}
