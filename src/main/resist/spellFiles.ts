// spellFiles.ts — WHICH SPELL FILES TO READ, given the EverQuest folder. Every reader asks here.
//
// The app ships no spell file of its own (owner, 2026-11-23: "ok then yeah dont' shipt spells_us").
// It reads the client's: the spell table, its message strings and the string table beside it. A
// US client names them `spells_us.txt`, `spells_us_str.txt` and `dbstr_us.txt`; a client in
// another language may name them differently, and nobody here knows the exact names, so this
// matches the PATTERN rather than a list (owner, same day: "show notice and look for alternative").
//
//   1. `spells_us.txt` when it is there - the file every reader was written against.
//   2. Otherwise the first other `spells_<suffix>.txt`, in a fixed order (lower-cased name, then the
//      name as written), never a `spells_<suffix>_str.txt`, which is the message file.
//   3. The message and string files with the SAME suffix when they are there, else the `_us` ones.
//
// Nothing found answers the `spells_us.txt` path with `found: false`, so a notice can still name
// the folder it looked in. Electron-free, so a node test can drive it over a temp folder. The
// `spells_us.txt` case costs one existence check; only a folder without it is listed.

import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { SpellTableReport } from '../../shared/spellTableNotice'

/** The table every reader was written against. */
export const US_SPELL_TABLE = 'spells_us.txt'

const TABLE_NAME = /^spells_(.+)\.txt$/i

/** The spell files one EverQuest folder answers with. Every path is absolute. */
export interface SpellFiles {
  /** The folder looked in. */
  folder: string
  /** The spell table: the one found, or `<folder>/spells_us.txt` when none was. */
  table: string
  /** False when the folder holds no spell table at all. */
  found: boolean
  /** True when the table found is not `spells_us.txt`. */
  fallback: boolean
  /** The spell message file (`spells_<suffix>_str.txt`, else `spells_us_str.txt`); may not exist. */
  str: string
  /** The string table (`dbstr_<suffix>.txt`, else `dbstr_us.txt`); may not exist. */
  dbstr: string
}

/** The suffix of a spell table's file name (`spells_de.txt` -> `de`), or null for anything else. */
export function spellTableSuffix(name: string): string | null {
  const m = TABLE_NAME.exec(name)
  if (m === null || /_str$/i.test(m[1])) return null
  return m[1]
}

/** The table to read out of a folder's file names: `spells_us.txt` first, then a fixed order. */
export function pickSpellTable(names: readonly string[]): string | null {
  const tables = names.filter((n) => spellTableSuffix(n) !== null)
  const us = tables.find((n) => n.toLowerCase() === US_SPELL_TABLE)
  if (us !== undefined) return us
  const order = (a: string, b: string): number => {
    const la = a.toLowerCase()
    const lb = b.toLowerCase()
    if (la !== lb) return la < lb ? -1 : 1
    return a < b ? -1 : a > b ? 1 : 0
  }
  return [...tables].sort(order)[0] ?? null
}

function listFolder(folder: string): string[] {
  try {
    return readdirSync(folder)
  } catch {
    return []
  }
}

/** The file with this table's suffix when it is there, else the US one. */
function companion(folder: string, suffix: string, name: (s: string) => string): string {
  const own = join(folder, name(suffix))
  return suffix.toLowerCase() !== 'us' && existsSync(own) ? own : join(folder, name('us'))
}

/** The spell files to read out of one EverQuest folder. Never throws. */
export function resolveSpellFiles(folder: string): SpellFiles {
  const us = join(folder, US_SPELL_TABLE)
  const name = existsSync(us) ? US_SPELL_TABLE : pickSpellTable(listFolder(folder))
  const suffix = name === null ? 'us' : (spellTableSuffix(name) ?? 'us')
  return {
    folder,
    table: name === null ? us : join(folder, name),
    found: name !== null,
    fallback: name !== null && suffix.toLowerCase() !== 'us',
    str: companion(folder, suffix, (s) => `spells_${s}_str.txt`),
    dbstr: companion(folder, suffix, (s) => `dbstr_${s}.txt`)
  }
}

/**
 * Where the spell table stands, for the Spells tab's notice (`shared/spellTableNotice.ts`): the
 * table memo's state and the path it looked at, split into the folder and the file's name.
 */
export function spellTableReport(state: SpellTableReport['state'], path: string): SpellTableReport {
  const file = basename(path)
  return { state, folder: dirname(path), file, fallback: file.toLowerCase() !== US_SPELL_TABLE }
}
