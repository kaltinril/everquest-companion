// IPC: the Macros tab (fork #11). Two things, kept apart:
//
//   * THE LIBRARY is the app's own file, `<userData>/macros.json`: loaded whole, saved whole, the
//     durable temp+rename write the app's other small files use. A file that will not read as a
//     library is moved aside (`macros.corrupt.json`), never saved over.
//   * THE GAME'S CHARACTER FILES, `<Character>_<server>_LO<n>.ini`, are listed and read here.
//     The one write into the game folder (a set sent into `[Socials]`, a kept copy put back;
//     owner, 2026-11-20) is main/macros/gameFileSend.ts: this module resolves the folder itself,
//     passes on a file NAME, runs the writes one at a time and logs each.
//
// The parsing and every rule about the document live in src/shared/macros/.

import { app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, readdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IPC } from '../../shared/ipc'
import { type FileBackups, listedBackups } from '../../shared/macros/backups'
import { readLibrary } from '../../shared/macros/document'
import { parseHotbarSlots } from '../../shared/macros/hotbars'
import { emptyLibrary } from '../../shared/macros/library'
import { parseSocials, pickCharacterFiles } from '../../shared/macros/socials'
import type { CharacterFile, CharacterFileMacros, GameMacroFiles, GameWriteResult, MacroLibrary } from '../../shared/macros/types'
import { readGameMacros } from '../../shared/macros/unsavable'
import { logInfo, logWarn } from '../errorLog'
import { resolveActiveCharacter } from '../log/config'
import { type GameFileDeps, listBackups, restoreBackup, sendSet, stampOf } from '../macros/gameFileSend'
import { isGameRunningNow } from '../macros/gameRunning'
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

/** A queue that runs its jobs one after another. */
function serialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve()
  return (job) => {
    const next = queue.then(job, job)
    queue = next.catch(() => undefined)
    return next
  }
}

/** Loads and saves run one after another: they share one file and one scratch file. */
const serial = serialQueue()
/** Sends and restores into the game folder, one at a time. */
const gameSerial = serialQueue()

function saveLibrary(value: unknown): Promise<boolean> {
  const library = readLibrary(value)
  if (library === null) return Promise.resolve(false)
  return serial(() => writeLibrary(library))
}

/** One character file's macros, or null when it could not be read (locked, gone since the listing). */
async function readCharacterFile(folder: string, file: CharacterFile, names: readonly string[]): Promise<CharacterFileMacros | null> {
  const path = join(folder, file.file)
  try {
    const [bytes, info] = await Promise.all([readFile(path), stat(path)])
    const text = bytes.toString('latin1')
    const macros = parseSocials(text)
    return { ...file, macros, hotbars: parseHotbarSlots(text), mtimeMs: info.mtimeMs, stamp: stampOf(bytes), backups: listedBackups(file.file, names) }
  } catch {
    return null
  }
}

/** The game folder, or null with no character log to find it by. Main alone resolves it. */
function gameFolder(): string | null {
  const character = resolveActiveCharacter()
  // The logs folder sits in the game folder, beside the character files (gameMapWatch.ts).
  return character === null ? null : dirname(dirname(character.logPath))
}

/** Every character file in the game folder, read fresh. Never throws. */
async function gameFiles(): Promise<GameMacroFiles> {
  const folder = gameFolder()
  if (folder === null) return { gameFolder: null, files: [], reason: 'no-log' }
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return { gameFolder: null, files: [], reason: 'unreadable' }
  }
  const read = await Promise.all(pickCharacterFiles(names).map((f) => readCharacterFile(folder, f, names)))
  const files: CharacterFileMacros[] = []
  for (const f of read) {
    if (f !== null) files.push(f)
  }
  return { gameFolder: folder, files }
}

/** The clock and the "is the game running" scan for one game folder. Why it could not tell is logged. */
function gameFileDeps(folder: string): GameFileDeps {
  const isGameRunning = (): Promise<boolean> =>
    isGameRunningNow(folder).catch((err: unknown) => {
      logWarn('[macros] could not tell whether the game is running', err)
      throw err
    })
  return { isGameRunning, now: () => new Date() }
}

/** A file name as the log shows it: it came from the renderer, so it is cut short and quoted. */
function shown(file: unknown): string {
  return typeof file === 'string' ? JSON.stringify(file.slice(0, 80)) : '(not a file name)'
}

/** Every send and restore is logged, done or refused: the file and the copy made, never macro text. */
function logGameWrite(what: string, file: unknown, result: GameWriteResult): void {
  if (!result.ok) {
    const copy = result.backup === undefined ? '' : `; copy ${result.backup}`
    logWarn(`[macros] ${what} ${shown(file)} refused: ${result.reason}${copy}`)
    return
  }
  const removed = result.removed.length === 0 ? '' : `; removed ${result.removed.join(', ')}`
  const note = result.note === undefined ? '' : `; ${result.note}`
  logInfo(`[macros] ${what} ${shown(file)} done; copy ${result.backup}${removed}${note}`)
}

/** One write into the game folder: queued behind the others, and logged. `job` gives null for a bad request. */
async function gameWrite(what: string, file: unknown, job: (folder: string) => Promise<GameWriteResult> | null): Promise<GameWriteResult> {
  const result = await gameSerial(async (): Promise<GameWriteResult> => {
    const folder = gameFolder()
    if (folder === null) return { ok: false, reason: 'no-folder' }
    return (await job(folder)) ?? { ok: false, reason: 'bad-request' }
  })
  logGameWrite(what, file, result)
  return result
}

function sendToGame(file: unknown, macros: unknown, expect: unknown): Promise<GameWriteResult> {
  return gameWrite('send to', file, (folder) => {
    const read = readGameMacros(macros)
    if (typeof file !== 'string' || typeof expect !== 'string' || read === null) return null
    return sendSet({ folder, file, macros: read, expect }, gameFileDeps(folder))
  })
}

function restoreInGame(file: unknown, which: unknown): Promise<GameWriteResult> {
  return gameWrite(which === 'original' ? 'restore the original of' : 'restore the last copy of', file, (folder) => {
    if (typeof file !== 'string' || (which !== 'original' && which !== 'last')) return null
    return restoreBackup({ folder, file, which }, gameFileDeps(folder))
  })
}

async function backupsFor(file: unknown): Promise<FileBackups> {
  const folder = gameFolder()
  if (folder === null || typeof file !== 'string') return { original: null, last: null }
  return listBackups({ folder, file })
}

export function registerMacrosIpc(): void {
  ipcMain.handle(IPC.macrosLoad, (): Promise<MacroLibrary> => serial(readLibraryFile))
  ipcMain.handle(IPC.macrosSave, (_e, library: unknown): Promise<boolean> => saveLibrary(library))
  ipcMain.handle(IPC.macrosGameFiles, (): Promise<GameMacroFiles> => gameFiles())
  ipcMain.handle(IPC.macrosSend, (_e, file: unknown, macros: unknown, expect: unknown): Promise<GameWriteResult> => sendToGame(file, macros, expect))
  ipcMain.handle(IPC.macrosBackups, (_e, file: unknown): Promise<FileBackups> => backupsFor(file))
  ipcMain.handle(IPC.macrosRestore, (_e, file: unknown, which: unknown): Promise<GameWriteResult> => restoreInGame(file, which))
}
