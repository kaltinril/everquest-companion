import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { LootFrame, LootMark } from '../shared/lootFrame'

/** The loot ledger as what this window lacks (shared/lootFrame.ts). Both windows that read it. */
export const lootFrameBridge = {
  getLootFrame: (known: LootMark | null): Promise<LootFrame | null> => ipcRenderer.invoke(IPC.getLootFrame, known)
}
