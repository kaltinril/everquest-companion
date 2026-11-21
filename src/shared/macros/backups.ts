// macros/backups.ts — the names of the two copies kept beside a character file (owner, 2026-11-20:
// "Original copy and last version. Dated or something yeah in folder."). Pure: names and a folder
// listing in, names out. Neither copy ends in `.ini`, so the game never reads one.
//
//   <file>.companion-original-<YYYY-MM-DD>.bak          the file before the app first wrote it
//   <file>.companion-last-<YYYY-MM-DD_HHMMSS>.bak       the file just before the latest write

export type BackupKind = 'original' | 'last'

export interface BackupName {
  /** The character file the copy is of. */
  file: string
  kind: BackupKind
  /** `YYYY-MM-DD`, local time. */
  date: string
  /** `HH:MM:SS` for a last copy, null for the original. */
  time: string | null
}

/** A copy as the screen lists it. */
export interface BackupCopy extends BackupName {
  name: string
}

/** The copies a character file has: its original, and its newest last copy. */
export interface FileBackups {
  original: BackupCopy | null
  last: BackupCopy | null
}

const ORIGINAL = /^(.+)\.companion-original-(\d{4}-\d{2}-\d{2})\.bak$/i
const LAST = /^(.+)\.companion-last-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})\.bak$/i

/** What a name says when it is one of the app's copies, else null. */
export function parseBackupName(name: string): BackupName | null {
  const original = ORIGINAL.exec(name)
  if (original) return { file: original[1], kind: 'original', date: original[2], time: null }
  const last = LAST.exec(name)
  if (last) return { file: last[1], kind: 'last', date: last[2], time: `${last[3]}:${last[4]}:${last[5]}` }
  return null
}

function two(n: number): string {
  return String(n).padStart(2, '0')
}

function localDate(now: Date): string {
  return `${String(now.getFullYear())}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

export function originalCopyName(file: string, now: Date): string {
  return `${file}.companion-original-${localDate(now)}.bak`
}

export function lastCopyName(file: string, now: Date): string {
  return `${file}.companion-last-${localDate(now)}_${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}.bak`
}

/** The app's copies of one character file among a folder's names, each kind oldest first. */
export function backupsOf(file: string, names: readonly string[]): { originals: string[]; lasts: string[] } {
  const mine = (kind: BackupKind): string[] => {
    const found = names.filter((name) => {
      const parsed = parseBackupName(name)
      // Windows file names are not case sensitive.
      return parsed !== null && parsed.kind === kind && parsed.file.toLowerCase() === file.toLowerCase()
    })
    return found.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }
  return { originals: mine('original'), lasts: mine('last') }
}

function asCopy(name: string | undefined): BackupCopy | null {
  const parsed = name === undefined ? null : parseBackupName(name)
  return parsed === null || name === undefined ? null : { ...parsed, name }
}

/** What the screen shows for a file: the first original and the newest last copy. */
export function listedBackups(file: string, names: readonly string[]): FileBackups {
  const { originals, lasts } = backupsOf(file, names)
  return { original: asCopy(originals.at(0)), last: asCopy(lasts.at(-1)) }
}

export interface BackupPlan {
  /** The original already in the folder, or null before the app's first write. */
  original: string | null
  /** The last copies already in the folder, oldest first. */
  lasts: string[]
  /** The copy to make now, before the write. */
  create: string
  kind: BackupKind
  /** The older last copies to remove once the new file is safely written. */
  removeAfter: string[]
}

/**
 * The copy a send makes. No original yet: the original (it is the previous version too, so no
 * last copy is made and none is removed). Otherwise a new last copy; the older ones go after a
 * good write. Names that are not this file's copies are never in the plan.
 */
export function planBackup(file: string, names: readonly string[], now: Date): BackupPlan {
  const { originals, lasts } = backupsOf(file, names)
  if (originals.length === 0) {
    return { original: null, lasts, create: originalCopyName(file, now), kind: 'original', removeAfter: [] }
  }
  return planLastCopy(file, names, now)
}

/** The copy a restore makes: always a last copy of the file as it is now. */
export function planLastCopy(file: string, names: readonly string[], now: Date): BackupPlan {
  const { originals, lasts } = backupsOf(file, names)
  const create = lastCopyName(file, now)
  const removeAfter = lasts.filter((name) => name.toLowerCase() !== create.toLowerCase())
  return { original: originals.at(0) ?? null, lasts, create, kind: 'last', removeAfter }
}
