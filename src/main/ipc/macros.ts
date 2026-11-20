// IPC: the Macros tab (fork #11). Two things, kept apart:
//
//   * THE LIBRARY is the app's own file, `<userData>/macros.json`: loaded whole, saved whole, the
//     durable temp+rename write the app's other small files use. A file that will not read as a
//     library is moved aside (`macros.corrupt.json`), never saved over.
//   * THE GAME'S CHARACTER FILES are READ ONLY. This module lists the game folder and reads
//     `<Character>_<server>_LO<n>.ini`; it has no call that writes, renames or deletes there
//     (the owner's standing ruling of 2026-10-13 allows reading the game's ini, nothing more).
//
// The parsing and every rule about the document live in src/shared/macros/.

import { app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, readdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IPC } from '../../shared/ipc'
import { readLibrary } from '../../shared/macros/document'
import { emptyLibrary } from '../../shared/macros/library'
import { parseSocials, pickCharacterFiles } from '../../shared/macros/socials'
import type { CharacterFile, CharacterFileMacros, GameMacroFiles, MacroLibrary } from '../../shared/macros/types'
import { logWarn } from '../errorLog'
import { resolveActiveCharacter } from '../log/config'
import { writeFileDurableAsync } from '../telemetry/durableWrite'
import { quarantineSlots, salvageJsonObject } from '../tornJson'

const FILE = 'macros.json'

function libraryPath(): string {
  return join(app.getPath('userData'), FILE)
}

const isLibraryDoc = (v: unknown): v is MacroLibrary => readLibrary(v) !== null

/** Set when a file that is not a library could not be moved aside: nothing is saved over it. */
let saveBlocked = false
let loaded = false

/** Move a file that will not read aside, keeping it. True when it is out of the way. */
async function keepAside(path: string): Promise<boolean> {
  const slots = quarantineSlots(path)
  const to = slots.find((p) => !existsSync(p)) ?? slots[slots.length - 1]
  try {
    await rename(path, to)
    logWarn(`[macros] ${FILE} did not read as a macro library; kept as ${to}`)
    return true
  } catch (err) {
    logWarn(`[macros] ${FILE} did not read as a macro library and could not be moved aside`, err)
    return false
  }
}

/** The library on disk. A file that is not one is kept aside and reads as an empty library. */
async function readLibraryFile(): Promise<MacroLibrary> {
  const path = libraryPath()
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    // Missing or unreadable: an empty library.
    loaded = true
    return emptyLibrary()
  }
  loaded = true
  if (raw.trim() === '') return emptyLibrary()
  // A torn write's whole document is still taken (tornJson.ts); the file itself is kept aside.
  const salvaged = salvageJsonObject(raw, isLibraryDoc)
  if (salvaged?.residue !== 0) saveBlocked = !(await keepAside(path))
  return salvaged === undefined ? emptyLibrary() : (readLibrary(salvaged.value) ?? emptyLibrary())
}

async function writeLibrary(library: MacroLibrary): Promise<boolean> {
  // A save before any load still looks at the file first, so a damaged one is kept aside.
  if (!loaded) await readLibraryFile()
  if (saveBlocked) return false
  try {
    await writeFileDurableAsync(app.getPath('userData'), libraryPath(), JSON.stringify(library))
    return true
  } catch (err) {
    logWarn(`[macros] ${FILE} write failed`, err)
    return false
  }
}

/** Loads and saves run one after another: they share one file and one scratch file. */
let queue: Promise<unknown> = Promise.resolve()

function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => undefined)
  return next
}

function saveLibrary(value: unknown): Promise<boolean> {
  const library = readLibrary(value)
  if (library === null) return Promise.resolve(false)
  return serial(() => writeLibrary(library))
}

/** One character file's macros, or null when it could not be read (locked, gone since the listing). */
async function readCharacterFile(folder: string, file: CharacterFile): Promise<CharacterFileMacros | null> {
  const path = join(folder, file.file)
  try {
    const [text, info] = await Promise.all([readFile(path, 'latin1'), stat(path)])
    return { ...file, macros: parseSocials(text), mtimeMs: info.mtimeMs }
  } catch {
    return null
  }
}

/** Every character file in the game folder, read fresh. Never throws. */
async function gameFiles(): Promise<GameMacroFiles> {
  const character = resolveActiveCharacter()
  if (character === null) return { gameFolder: null, files: [], reason: 'no-log' }
  // The logs folder sits in the game folder, beside the character files (gameMapWatch.ts).
  const folder = dirname(dirname(character.logPath))
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return { gameFolder: null, files: [], reason: 'unreadable' }
  }
  const read = await Promise.all(pickCharacterFiles(names).map((f) => readCharacterFile(folder, f)))
  const files: CharacterFileMacros[] = []
  for (const f of read) {
    if (f !== null) files.push(f)
  }
  return { gameFolder: folder, files }
}

export function registerMacrosIpc(): void {
  ipcMain.handle(IPC.macrosLoad, (): Promise<MacroLibrary> => serial(readLibraryFile))
  ipcMain.handle(IPC.macrosSave, (_e, library: unknown): Promise<boolean> => saveLibrary(library))
  ipcMain.handle(IPC.macrosGameFiles, (): Promise<GameMacroFiles> => gameFiles())
}
