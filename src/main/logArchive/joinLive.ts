// main/logArchive/joinLive.ts — JOIN A FILE IN FRONT OF THE LIVE LOG AND GIVE IT THE LOG'S NAME.
//
// Two things put old lines back in front of the live log: Put back (step 3.6, the archive unpacked
// into `<id>.restoring`) and the launch recovery of an archive that could not be finished (the moved
// log, `<id>.moving`, owner 2026-11-23). Both do it the way ruling 0.5's test did by hand: move the
// live log aside as a piece, add its bytes to the end of the joined file, then give the joined file
// the log's name only while that name is free. If the game recreated the log meanwhile, go round.
// No line is removed or changed.
//
// A TRY THAT STOPS IS FINISHED BY THE NEXT ONE. Every line is then in the live log, in the joined
// file, or in a piece named `<stem>.<at>.part`, where `at` is how long the joined file was before the
// piece was added, so a half-added copy can be cut off and the piece added again.
//
// GIVING THE NAME, MOST EFFICIENT FIRST (owner, 2026-11-23: "do the most efficient for the scenario,
// if hard link fails, can we fall back to copy?"):
//   1. a hard link: one step, and it fails rather than replace a log the game has just made;
//   2. on a drive without hard links (FAT32, exFAT; EPERM, ENOTSUP and the like), a rename of the
//      joined file, which is the app's own and already on the log's drive, so no copy is needed.
//      A rename replaces what is at the name, so it is made only once the name is seen to be free;
//      the gap between the look and the rename is two system calls, and a log the game made and
//      closed inside it would be replaced. The link has no such gap, which is why it goes first;
//   3. when the archive folder is on another drive from the log (EXDEV), a copy to a temporary name
//      beside the log, checked, then renamed the same way. A half-written copy never has the log's
//      name, and the next try removes it: the joined file still holds every byte.

import { appendFileSync, copyFileSync, existsSync, linkSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync, truncateSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { readLogPrefix } from './logPrefix'

export const PART = '.part'

/** Test seams: the steps the disk can refuse. */
export interface RestoreIo {
  append?: (path: string, bytes: Buffer) => void
  link?: (from: string, to: string) => void
  rename?: (from: string, to: string) => void
  copy?: (from: string, to: string) => void
  /** Free bytes on the log's drive, for the copy. */
  freeBytes?: (dir: string) => number | null
}

/** How the joined file got the log's name. */
export type Named = 'link' | 'rename' | 'copy'

/** A stretch of the live log set aside as `<stem>.<at>.part`. `at` is NaN for a name without it
 *  (an older version's `<id>.part`). */
export interface Piece {
  path: string
  at: number
}

/** The pieces named after `stem` (a path without the `.<at>.part`). */
export function piecesOf(stem: string): Piece[] {
  const dir = dirname(stem)
  const name = basename(stem)
  if (!existsSync(dir)) return []
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${name}.`) && f.endsWith(PART))
  return mine.map((f) => {
    const at = f.slice(name.length + 1, -PART.length)
    return { path: join(dir, f), at: /^\d+$/.test(at) ? Number(at) : NaN }
  })
}

/** The pieces of `stem` an earlier try set aside. Throws, naming the file, when this version cannot
 *  say where one belongs: a second piece, or a name without a length of at least `least`. */
export function waitingPieces(stem: string, least: number): Piece[] {
  const waiting = piecesOf(stem)
  const lost = waiting.length > 1 ? waiting[1] : waiting.find((p) => !(p.at >= least))
  if (lost === undefined) return waiting
  throw new Error(`an earlier try left ${lost.path}, which holds lines from your log. Move it somewhere safe, then try again`)
}

/** Two names of one file (a hard link). */
export function sameFile(a: string, b: string): boolean {
  const fileOf = (path: string): string | null => {
    const s = statSync(path, { bigint: true, throwIfNoEntry: false })
    return s === undefined ? null : `${s.dev}:${s.ino}`
  }
  const x = fileOf(a)
  return x !== null && x === fileOf(b)
}

/**
 * The log already holds the whole joined file: a try died after the name was given and before the
 * joined file was removed. A link shows as one file; a copy shows as a log that begins with every
 * byte of the joined file (the game may have added lines since).
 */
export async function alreadyJoined(joined: string, logPath: string): Promise<boolean> {
  if (sameFile(joined, logPath)) return true
  const j = statSync(joined, { throwIfNoEntry: false })
  const l = statSync(logPath, { throwIfNoEntry: false })
  if (j === undefined || l === undefined || j.size === 0 || l.size < j.size) return false
  const [a, b] = await Promise.all([readLogPrefix(joined, j.size), readLogPrefix(logPath, j.size)])
  return a.sha256 === b.sha256
}

/** Add a piece to the end of `joined`, first cutting off any half-added copy of it. */
function addPiece(joined: string, p: Piece, io: RestoreIo): void {
  truncateSync(joined, Math.min(p.at, statSync(joined).size))
  ;(io.append ?? appendFileSync)(joined, readFileSync(p.path))
  rmSync(p.path)
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

/** Move the live log aside and add its bytes to the end of `joined`. Nothing when there is none. */
function absorbLive(logPath: string, joined: string, stem: string, io: RestoreIo): void {
  if (!existsSync(logPath)) return
  const at = statSync(joined).size
  const piece: Piece = { path: `${stem}.${at}${PART}`, at }
  // A rename replaces what is at the new name, and a piece there would be the only copy of its lines.
  if (existsSync(piece.path)) throw new Error(`an earlier try left ${piece.path}`)
  renameSync(logPath, piece.path)
  try {
    addPiece(joined, piece, io)
  } catch (err) {
    // Undo the round: cut the half-added copy off and give the log its name back. When either
    // fails the piece keeps its name, which says where it belongs, and the next try adds it.
    try {
      truncateSync(joined, at)
      if (linkIfFree(piece.path, logPath)) rmSync(piece.path)
    } catch {
      // The piece stays.
    }
    throw err
  }
}

function freeOn(dir: string): number | null {
  try {
    const s = statfsSync(dir)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

/** Remove a file whose bytes are safe elsewhere; a failure leaves a spare copy, never a loss. */
function dropQuietly(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // Left; it costs disk space only.
  }
}

/** Step 3: copy `joined` beside the log, check it, and rename it to the log's name if that is free. */
function copyIn(joined: string, logPath: string, io: RestoreIo): boolean {
  const tmp = `${logPath}.putback.partial`
  const size = statSync(joined).size
  const free = (io.freeBytes ?? freeOn)(dirname(logPath))
  if (free !== null && free < size) throw new Error('there is not enough free space beside the log to copy it into place')
  try {
    rmSync(tmp, { force: true })
    ;(io.copy ?? copyFileSync)(joined, tmp)
    if (statSync(tmp).size !== size) throw new Error('the copy of the log came out short')
    if (existsSync(logPath)) {
      rmSync(tmp)
      return false
    }
    // Beside the log, so always on its drive.
    renameSync(tmp, logPath)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  dropQuietly(joined)
  return true
}

/** Give `joined` the log's name; null when the game took the name first. */
function giveName(joined: string, logPath: string, io: RestoreIo): Named | null {
  try {
    if (!linkIfFree(joined, logPath, io.link)) return null
    // The log is whole under its own name from here, so nothing after the link is a failure.
    dropQuietly(joined)
    return 'link'
  } catch {
    // No hard links here: below.
  }
  if (existsSync(logPath)) return null
  try {
    ;(io.rename ?? renameSync)(joined, logPath)
    return 'rename'
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
  }
  return copyIn(joined, logPath, io) ? 'copy' : null
}

/** Add what is waiting, then the live log, and give the result the live name. */
export function joinAndName(logPath: string, joined: string, stem: string, io: RestoreIo): Named {
  for (const p of piecesOf(stem)) {
    // A piece that is the live log's second name (the undo's link held, its delete did not) is in the log.
    if (sameFile(p.path, logPath)) rmSync(p.path)
    else addPiece(joined, p, io)
  }
  for (let round = 0; round < 50; round++) {
    absorbLive(logPath, joined, stem, io)
    const named = giveName(joined, logPath, io)
    if (named !== null) return named
  }
  throw new Error('the game kept recreating the log; try again in a quiet moment')
}
