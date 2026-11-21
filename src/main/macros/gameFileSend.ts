// macros/gameFileSend.ts — the one place the app writes into the game folder (fork #11, P2): a
// set sent into a character file's `[Socials]` section, and a kept copy put back.
//
// WHAT IT MAY TOUCH there, and nothing else: a character file (`pickCharacterFiles` accepts its
// name, and the name is in the folder's own listing), the two dated copies beside it
// (shared/macros/backups.ts), and one scratch file (`<file>.companion-write.tmp`, gone on every
// path). The owner's rule: a copy is made and read back before any write; no copy, no write.
//
// No Electron here: the folder, the clock and the "is the game running" question are passed in,
// so tests/macroGameFileSend.test.mts drives it in a temp folder.

import { createHash } from 'node:crypto'
import { lstat, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { type BackupPlan, type FileBackups, backupsOf, listedBackups, parseBackupName, planBackup, planLastCopy } from '../../shared/macros/backups'
import { parseSocials, pickCharacterFiles } from '../../shared/macros/socials'
import { replaceSocials, sameOutsideSocials, socialsAfterSend } from '../../shared/macros/socialsWrite'
import type { GameMacro, GameWriteRefusal, GameWriteRefused, GameWriteResult } from '../../shared/macros/types'
import { unsavable } from '../../shared/macros/unsavable'

/** Every disk call this module makes, as one object a test can fail a step of. */
export interface GameFileIo {
  list(folder: string): Promise<string[]>
  /** True for a plain file: not a folder, not a link. */
  isFile(path: string): Promise<boolean>
  read(path: string): Promise<Buffer>
  /** Make a NEW file holding the bytes; fails when the name is taken. */
  createNew(path: string, bytes: Buffer): Promise<void>
  /** Swap a file's bytes whole: a scratch file beside it, flushed, renamed over it. */
  replace(path: string, bytes: Buffer): Promise<void>
  remove(path: string): Promise<void>
}

export function scratchPathFor(path: string): string {
  return `${path}.companion-write.tmp`
}

/** Write and flush a file. A failure removes what it made and rethrows. */
async function writeFlushed(path: string, bytes: Buffer, flag: 'wx' | 'w'): Promise<void> {
  const handle = await open(path, flag)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
  } catch (err) {
    // Closed before removed: Windows will not unlink an open file.
    await handle.close().catch(() => undefined)
    await rm(path, { force: true }).catch(() => undefined)
    throw err
  }
}

export const nodeGameFileIo: GameFileIo = {
  list: (folder) => readdir(folder),
  isFile: async (path) => (await lstat(path)).isFile(),
  read: (path) => readFile(path),
  createNew: (path, bytes) => writeFlushed(path, bytes, 'wx'),
  replace: async (path, bytes) => {
    const scratch = scratchPathFor(path)
    await writeFlushed(scratch, bytes, 'w')
    try {
      await rename(scratch, path)
    } catch (err) {
      await rm(scratch, { force: true }).catch(() => undefined)
      throw err
    }
  },
  remove: (path) => rm(path)
}

export interface GameFileDeps {
  /** Rejects when it cannot tell; that refuses the write too. */
  isGameRunning: () => Promise<boolean>
  now: () => Date
  io?: GameFileIo
}

export interface SendRequest {
  folder: string
  /** A file NAME; it must be one of the folder's character files. */
  file: string
  macros: GameMacro[]
  /** `stampOf` the file as the screen showed it. */
  expect: string
}

export interface RestoreRequest {
  folder: string
  file: string
  which: 'original' | 'last'
}

/** What a file's bytes were: the `expect` a send passes back. */
export function stampOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function refuse(reason: GameWriteRefusal): GameWriteRefused {
  return { ok: false, reason }
}

async function readOrNull(io: GameFileIo, path: string): Promise<Buffer | null> {
  try {
    return await io.read(path)
  } catch {
    return null
  }
}

/** The folder's names when `file` is one of its character files and a plain file, else null. */
async function characterFileListing(io: GameFileIo, folder: string, file: unknown): Promise<string[] | null> {
  if (typeof file !== 'string' || basename(file) !== file) return null
  try {
    const names = await io.list(folder)
    const known = pickCharacterFiles(names).some((f) => f.file === file)
    return known && (await io.isFile(join(folder, file))) ? names : null
  } catch {
    return null
  }
}

async function isPlainFile(io: GameFileIo, path: string): Promise<boolean> {
  try {
    return await io.isFile(path)
  } catch {
    return false
  }
}

async function gameRefusal(deps: GameFileDeps): Promise<GameWriteRefusal | null> {
  try {
    return (await deps.isGameRunning()) ? 'game-running' : null
  } catch {
    return 'game-unknown'
  }
}

/** Make a copy and read it back. A copy this call made that does not read back equal is removed. */
async function makeCopy(io: GameFileIo, path: string, bytes: Buffer): Promise<boolean> {
  try {
    await io.createNew(path, bytes)
  } catch {
    // The name was taken, or the write failed (and cleaned up after itself).
    return false
  }
  const back = await readOrNull(io, path)
  if (back !== null && back.length === bytes.length && back.equals(bytes)) return true
  await io.remove(path).catch(() => undefined)
  return false
}

/** One write, from the copy already made to the check after it. */
interface WriteJob {
  io: GameFileIo
  folder: string
  file: string
  /** The file's bytes before the write; the copy `plan.create` holds them. */
  before: Buffer
  next: Buffer
  plan: BackupPlan
  /** What the text read back must satisfy, beyond being the bytes written. */
  check: (text: string) => boolean
}

/** Put the file back from the copy just made. */
async function putBack(job: WriteJob): Promise<GameWriteRefused> {
  const failed: GameWriteRefused = { ok: false, reason: 'verify-failed', putBack: false, backup: job.plan.create }
  const path = join(job.folder, job.file)
  try {
    const good = await job.io.read(join(job.folder, job.plan.create))
    if (!good.equals(job.before)) return failed
    await job.io.replace(path, good)
    return { ...failed, putBack: (await job.io.read(path)).equals(good) }
  } catch {
    return failed
  }
}

/** Remove this file's older last copies. A failure is a note, not a failed write. */
async function removeOld(job: WriteJob): Promise<{ removed: string[]; note?: string }> {
  const removed: string[] = []
  const stuck: string[] = []
  for (const name of job.plan.removeAfter) {
    const parsed = parseBackupName(name)
    // Only ever a last copy of this file, and never the one just made.
    if (parsed?.kind !== 'last' || parsed.file.toLowerCase() !== job.file.toLowerCase() || name === job.plan.create) continue
    try {
      await job.io.remove(join(job.folder, name))
      removed.push(name)
    } catch {
      stuck.push(name)
    }
  }
  return stuck.length === 0 ? { removed } : { removed, note: `An older copy could not be removed: ${stuck.join(', ')}` }
}

/** Write, read back, check; put the file back when the check fails; then drop the older copies. */
async function writeChecked(job: WriteJob): Promise<GameWriteResult> {
  const path = join(job.folder, job.file)
  // The copy holds `before`; the file must still be that.
  const still = await readOrNull(job.io, path)
  if (!still?.equals(job.before)) return refuse('changed-since-read')
  try {
    await job.io.replace(path, job.next)
  } catch {
    // The rename is the only step that touches the file: it is as it was.
    return { ...refuse('write-failed'), backup: job.plan.create }
  }
  const after = await readOrNull(job.io, path)
  if (after === null || !after.equals(job.next) || !job.check(after.toString('latin1'))) return putBack(job)
  return { ok: true, backup: job.plan.create, ...(await removeOld(job)) }
}

async function send(req: SendRequest, deps: GameFileDeps): Promise<GameWriteResult> {
  const io = deps.io ?? nodeGameFileIo
  const names = await characterFileListing(io, req.folder, req.file)
  if (names === null) return refuse('not-a-character-file')
  const problems = unsavable(req.macros)
  if (problems.length > 0) return { ...refuse('unsavable'), problems }
  const game = await gameRefusal(deps)
  if (game !== null) return refuse(game)
  const before = await readOrNull(io, join(req.folder, req.file))
  if (before === null) return refuse('read-failed')
  if (stampOf(before) !== req.expect) return refuse('changed-since-read')
  // latin1 both ways: every byte the section does not hold comes back as it was.
  const text = before.toString('latin1')
  const next = Buffer.from(replaceSocials(text, req.macros), 'latin1')
  const wanted = socialsAfterSend(text, req.macros)
  const check = (after: string): boolean => isDeepStrictEqual(parseSocials(after), wanted) && sameOutsideSocials(text, after)
  // Checked on the bytes in hand first, so a text that would not read back right is never written.
  if (!check(next.toString('latin1'))) return refuse('check-failed')
  const plan = planBackup(req.file, names, deps.now())
  // A name that looks like the original but is not a plain file is not a copy: stop.
  if (plan.original !== null && !(await isPlainFile(io, join(req.folder, plan.original)))) return refuse('backup-failed')
  if (!(await makeCopy(io, join(req.folder, plan.create), before))) return refuse('backup-failed')
  return writeChecked({ io, folder: req.folder, file: req.file, before, next, plan, check })
}

async function restore(req: RestoreRequest, deps: GameFileDeps): Promise<GameWriteResult> {
  const io = deps.io ?? nodeGameFileIo
  const names = await characterFileListing(io, req.folder, req.file)
  if (names === null) return refuse('not-a-character-file')
  const game = await gameRefusal(deps)
  if (game !== null) return refuse(game)
  const copies = backupsOf(req.file, names)
  const source = req.which === 'original' ? copies.originals.at(0) : copies.lasts.at(-1)
  if (source === undefined) return refuse('no-backup')
  const before = await readOrNull(io, join(req.folder, req.file))
  const good = await readOrNull(io, join(req.folder, source))
  if (before === null || good === null) return refuse('read-failed')
  if (good.equals(before)) return refuse('already-same')
  // The file as it is now becomes the last copy, so the restore can be undone. The copy restored
  // from is in `removeAfter` at most: it goes only after the write has been checked.
  const plan = planLastCopy(req.file, names, deps.now())
  if (!(await makeCopy(io, join(req.folder, plan.create), before))) return refuse('backup-failed')
  return writeChecked({ io, folder: req.folder, file: req.file, before, next: good, plan, check: () => true })
}

/**
 * Send a set into a character file's `[Socials]` section. In order, stopping at the first that
 * fails: the name is a character file of the folder; the macros can be written faithfully; the
 * game is not running; the file is what the screen showed; a copy is made and read back; the
 * write; the read back (put back from the copy when wrong); the older last copies go. Never throws.
 */
export async function sendSet(req: SendRequest, deps: GameFileDeps): Promise<GameWriteResult> {
  try {
    return await send(req, deps)
  } catch {
    return refuse('unexpected')
  }
}

/**
 * Put a kept copy back, WHOLE: the one write that changes bytes outside `[Socials]`. The file as
 * it is now is kept as the last copy first. The original copy is never removed. Never throws.
 */
export async function restoreBackup(req: RestoreRequest, deps: GameFileDeps): Promise<GameWriteResult> {
  try {
    return await restore(req, deps)
  } catch {
    return refuse('unexpected')
  }
}

/** The original and the newest last copy of a character file; none when the folder will not list. */
export async function listBackups(req: { folder: string; file: string }, io: GameFileIo = nodeGameFileIo): Promise<FileBackups> {
  try {
    return listedBackups(req.file, await io.list(req.folder))
  } catch {
    return { original: null, last: null }
  }
}
