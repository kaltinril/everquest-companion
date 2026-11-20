import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { GameMacroFiles, MacroLibrary } from '../shared/macros/types'

/** The Macros tab (fork #11; main/ipc/macros.ts). The game's files are read, never written. */
export const macrosBridge = {
  /** The app's own macro library; an empty one when none is saved yet. */
  macrosLoad: (): Promise<MacroLibrary> => ipcRenderer.invoke(IPC.macrosLoad),
  /** Save the whole library; resolves to whether it was written. */
  macrosSave: (library: MacroLibrary): Promise<boolean> => ipcRenderer.invoke(IPC.macrosSave, library),
  /** Every character file in the game folder with its macros, read fresh. */
  macrosGameFiles: (): Promise<GameMacroFiles> => ipcRenderer.invoke(IPC.macrosGameFiles)
}
