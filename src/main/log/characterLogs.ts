// characterLogs.ts - which entries of a Logs folder are character logs, and which is the newest
// (fork #9, phase R3). Store-free and Electron-free: `config.ts` hands it the folder, so
// `tests/logConfig.test.mts` runs it over a temp one.
//
// FILES ONLY. The listing used to keep every NAME that matched `eqlog_*.txt`, so a folder with
// such a name was listed as a character and, as the newest entry, picked at launch: the engine
// could not open it and the read ended at once. The engine's own lister (engined `logs.rs`) skips
// an entry whose metadata says it is not a file, and keeps one it cannot stat; this is the same rule.
//
// A SYMBOLIC LINK IS NOT A FILE TO `Dirent.isFile()`. A player whose log is a link must not lose
// it, so a link is followed (`statSync`): kept unless it plainly leads to something that is not a
// file, and kept when it cannot be followed at all.

import { readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import type { CharacterRef } from '../../shared/types'

const EQLOG_RE = /^eqlog_.+\.txt$/i

/** What a directory listing says about one entry (`fs.Dirent`). */
interface ListedEntry {
  isFile(): boolean
  isDirectory(): boolean
}

/**
 * Is this entry a file? A plain file and a plain folder are answered by the listing alone.
 * Anything else (a link, a type the listing could not tell) is answered by `followsToFile`: does
 * it lead to a file, or null when that cannot be found out, which keeps it.
 */
export function isLogFileEntry(entry: ListedEntry, followsToFile: () => boolean | null): boolean {
  if (entry.isFile()) return true
  if (entry.isDirectory()) return false
  return followsToFile() ?? true
}

/** Does `path` lead to a file? Null when it cannot be followed (a dangling link, no permission). */
function leadsToFile(path: string): boolean | null {
  try {
    return statSync(path).isFile()
  } catch {
    return null
  }
}

/** The `eqlog_*.txt` FILES in a Logs folder, by name. Throws what `readdirSync` throws. */
export function characterLogNames(logsDir: string): string[] {
  return readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => EQLOG_RE.test(entry.name))
    .filter((entry) => isLogFileEntry(entry, () => leadsToFile(join(logsDir, entry.name))))
    .map((entry) => entry.name)
}

/** A file's mtime, or undefined when it is gone (or cannot be stat'd) by the time we look. */
function mtimeOf(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

/** Parse "eqlog_<Character>_<server>.txt" into a CharacterRef. */
export function parseLogName(logPath: string): CharacterRef | null {
  const m = /^eqlog_(.+?)_(.+?)\.txt$/i.exec(basename(logPath))
  if (!m) return null
  return { name: m[1], server: m[2], logPath, lastPlayed: mtimeOf(logPath) }
}

/**
 * The character-log paths in a Logs folder. A folder that cannot be read (a file where the folder
 * should be, no permission) has none, which is how `readLogsDir` already reads it; throwing here
 * instead rejected every caller, the idle rescan and the quiet-switch poll among them.
 */
function characterLogPaths(logsDir: string): string[] {
  try {
    return characterLogNames(logsDir).map((name) => join(logsDir, name))
  } catch {
    return []
  }
}

/** Every character log in a Logs folder, most recently played first. */
export function charactersIn(logsDir: string): CharacterRef[] {
  return characterLogPaths(logsDir)
    .map((path) => parseLogName(path))
    .filter((c): c is CharacterRef => c !== null)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
}

/** The most recently written character log in a Logs folder, or null when there is none. */
export function newestCharacterIn(logsDir: string): CharacterRef | null {
  const candidates = characterLogPaths(logsDir)
    .map((p) => ({ p, mtime: mtimeOf(p) }))
    // A log deleted between the listing and the stat is not a candidate.
    .filter((c): c is { p: string; mtime: number } => c.mtime !== undefined)
    .sort((a, b) => b.mtime - a.mtime)
  return candidates.length === 0 ? null : parseLogName(candidates[0].p)
}
