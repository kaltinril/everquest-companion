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
// if hard link fails, can we fall back to copy?"). Nothing is ever written onto the log's name by an
// operation that could replace a file there: the game may have made the log a moment before.
//   1. a hard link: one step, and it fails (EEXIST) rather than replace a log the game has made;
//   2. on a drive without hard links (FAT32, exFAT; EPERM, ENOTSUP, EXDEV and the like), a copy
//      created exclusively at the log's name (COPYFILE_EXCL), which fails with EEXIST in the same
//      way. A rename would be cheaper but replaces what is at the name, so it is never used there.
//      A copy that stops part-way may leave a half copy under the log's name; it is moved aside at
//      once (and by the next try, if the app died), and dropped when it holds nothing but the start
//      of the joined file. Lines the game wrote onto a half copy are kept with it, never dropped.
//
// The caller removes the joined file once its own bookkeeping says the log holds it.

import { appendFileSync, closeSync, constants, copyFileSync, existsSync, linkSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statfsSync, statSync, truncateSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { readLogPrefix } from './logPrefix'

export const PART = '.part'

/** Test seams: the steps the disk can refuse. */
export interface RestoreIo {
  append?: (path: string, bytes: Buffer) => void
  link?: (from: string, to: string) => void
  copy?: (from: string, to: string, mode: number) => void
  /** Free bytes on the log's drive, for the copy. */
  freeBytes?: (dir: string) => number | null
}

/** How the joined file got the log's name. */
export type Named = 'link' | 'copy'

/** A stretch of the live log set aside as `<stem>.<at>.part`. `at` is NaN for a name without it
 *  (an older version's `<id>.part`). */
export interface Piece {
  path: string
  at: number
}

/** The pieces named after `stem` (a path without the `.<at>.part`): `<stem>.<digits>.part`, and an
 *  older version's `<stem>.part`. Nothing else, so the recovery's `<id>.moving.<at>.part` is not a
 *  piece of `<id>`'s Put back. */
export function piecesOf(stem: string): Piece[] {
  const dir = dirname(stem)
  const name = basename(stem)
  if (!existsSync(dir)) return []
  const mine = readdirSync(dir).filter((f) => f === `${name}${PART}` || (f.startsWith(`${name}.`) && f.endsWith(PART) && /^\d+$/.test(f.slice(name.length + 1, -PART.length))))
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

type StatBig = (path: string) => { dev: bigint; ino: bigint } | undefined

const statBig: StatBig = (path) => statSync(path, { bigint: true, throwIfNoEntry: false })

/**
 * Two names of one file (a hard link). Some volumes (network shares, some FUSE and ReFS ones)
 * report a file id of 0 for every file, so two different files would look the same: a zero id is
 * never trusted, and the answer is then no. Callers that must know fall back to the bytes.
 */
export function sameFile(a: string, b: string, stat: StatBig = statBig): boolean {
  const fileOf = (path: string): string | null => {
    const s = stat(path)
    return s === undefined || s.ino === 0n || s.dev === 0n ? null : `${s.dev}:${s.ino}`
  }
  const x = fileOf(a)
  return x !== null && x === fileOf(b)
}

/**
 * The log already holds the whole joined file: a try died after the name was given and before the
 * joined file was removed. A link shows as one file; a copy, or a link on a volume without file
 * ids, shows as a log that begins with every byte of the joined file (the game may have added
 * lines since).
 */
export async function alreadyJoined(joined: string, logPath: string): Promise<boolean> {
  if (sameFile(joined, logPath)) return true
  const j = statSync(joined, { throwIfNoEntry: false })
  const l = statSync(logPath, { throwIfNoEntry: false })
  if (j === undefined || l === undefined || j.size === 0 || l.size < j.size) return false
  const [a, b] = await Promise.all([readLogPrefix(joined, j.size), readLogPrefix(logPath, j.size)])
  return a.sha256 === b.sha256
}

/** `small` holds nothing but the first bytes of `big`. Read in chunks; no whole-file buffer. */
function isPrefixOf(small: string, big: string): boolean {
  const n = statSync(small).size
  if (n > statSync(big).size) return false
  const fa = openSync(small, 'r')
  const fb = openSync(big, 'r')
  try {
    const a = Buffer.alloc(1 << 20)
    const b = Buffer.alloc(1 << 20)
    for (let pos = 0; pos < n; pos += a.length) {
      const len = Math.min(a.length, n - pos)
      if (readSync(fa, a, 0, len, pos) !== len || readSync(fb, b, 0, len, pos) !== len) return false
      if (!a.subarray(0, len).equals(b.subarray(0, len))) return false
    }
    return true
  } finally {
    closeSync(fa)
    closeSync(fb)
  }
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

/**
 * Move the live log aside and add its bytes to the end of `joined`. Nothing when there is none.
 * A live log that holds nothing but the start of `joined` is a half copy a stopped try left under
 * the log's name (or an empty log): it is dropped, since `joined` holds all of it.
 */
function absorbLive(logPath: string, joined: string, stem: string, io: RestoreIo): void {
  if (!existsSync(logPath)) return
  const at = statSync(joined).size
  const piece: Piece = { path: `${stem}.${at}${PART}`, at }
  // A rename replaces what is at the new name, and a piece there would be the only copy of its lines.
  if (existsSync(piece.path)) throw new Error(`an earlier try left ${piece.path}`)
  renameSync(logPath, piece.path)
  if (isPrefixOf(piece.path, joined)) {
    rmSync(piece.path)
    return
  }
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

/** Copy `joined` to the log's name, created exclusively; false when the game took the name first. */
function copyIfFree(joined: string, logPath: string, stem: string, io: RestoreIo): boolean {
  const size = statSync(joined).size
  const free = (io.freeBytes ?? freeOn)(dirname(logPath))
  if (free !== null && free < size) throw new Error('there is not enough free space beside the log to copy it into place')
  try {
    ;(io.copy ?? copyFileSync)(joined, logPath, constants.COPYFILE_EXCL)
    if (statSync(logPath).size < size) throw new Error('the copy of the log came out short')
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    // A half copy may be under the log's name: move it aside now, before the game writes onto it.
    try {
      absorbLive(logPath, joined, stem, io)
    } catch {
      // Left for the next try, which moves it aside the same way.
    }
    throw err
  }
}

/** Give `joined` the log's name; null when the game took the name first. */
function giveName(joined: string, logPath: string, stem: string, io: RestoreIo): Named | null {
  try {
    return linkIfFree(joined, logPath, io.link) ? 'link' : null
  } catch {
    // No hard links here: a copy.
  }
  return copyIfFree(joined, logPath, stem, io) ? 'copy' : null
}

/** Add what is waiting, then the live log, and give the result the live name. `joined` is left for
 *  the caller to remove. */
export function joinAndName(logPath: string, joined: string, stem: string, io: RestoreIo): Named {
  for (const p of piecesOf(stem)) {
    // A piece that is the live log's second name (the undo's link held, its delete did not) is in the log.
    if (sameFile(p.path, logPath)) rmSync(p.path)
    else addPiece(joined, p, io)
  }
  for (let round = 0; round < 50; round++) {
    absorbLive(logPath, joined, stem, io)
    const named = giveName(joined, logPath, stem, io)
    if (named !== null) return named
  }
  throw new Error('the game kept recreating the log; try again in a quiet moment')
}
