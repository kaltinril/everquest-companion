import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { FileBackups } from '../shared/macros/backups'
import type { GameMacro, GameMacroFiles, GameWriteResult, MacroLibrary } from '../shared/macros/types'

/** The Macros tab (fork #11; main/ipc/macros.ts). */
export const macrosBridge = {
  /** The app's own macro library; an empty one when none is saved yet. */
  macrosLoad: (): Promise<MacroLibrary> => ipcRenderer.invoke(IPC.macrosLoad),
  /** Save the whole library; resolves to whether it was written. */
  macrosSave: (library: MacroLibrary): Promise<boolean> => ipcRenderer.invoke(IPC.macrosSave, library),
  /** Every character file in the game folder with its macros, read fresh. */
  macrosGameFiles: (): Promise<GameMacroFiles> => ipcRenderer.invoke(IPC.macrosGameFiles),
  /** Write a set into a character file's [Socials] section. `expect` is the file's stamp as read. */
  macrosSend: (file: string, macros: GameMacro[], expect: string): Promise<GameWriteResult> =>
    ipcRenderer.invoke(IPC.macrosSend, file, macros, expect),
  /** The copies kept beside a character file. */
  macrosBackups: (file: string): Promise<FileBackups> => ipcRenderer.invoke(IPC.macrosBackups, file),
  /** Put a kept copy back, whole; the file as it is now is kept as the last copy. */
  macrosRestore: (file: string, which: 'original' | 'last'): Promise<GameWriteResult> => ipcRenderer.invoke(IPC.macrosRestore, file, which)
}
