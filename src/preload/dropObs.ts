import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { DropObsMode, DropObsReply, DropObsStatus } from '../shared/dropObs'

/** Send loot to the wiki's drop database (requirements/drop-db-submit.md). Off until the player turns it on. */
export const dropObsBridge = {
  dropObsStatus: (): Promise<DropObsStatus> => ipcRenderer.invoke(IPC.dropObsStatus),
  /** An empty password keeps the saved one. */
  dropObsSaveAccount: (username: string, password: string): Promise<DropObsReply> =>
    ipcRenderer.invoke(IPC.dropObsSaveAccount, username, password),
  /** Only the player chooses this, from the card. */
  setDropObsMode: (mode: DropObsMode): Promise<DropObsReply> => ipcRenderer.invoke(IPC.dropObsSetMode, mode),
  /** Manual mode: send everything waiting, then stop. */
  dropObsSendNow: (): Promise<DropObsReply> => ipcRenderer.invoke(IPC.dropObsSendNow),
  dropObsTest: (): Promise<DropObsReply> => ipcRenderer.invoke(IPC.dropObsTest),
  /** Remove the saved sign-in and turn sending off. */
  dropObsForget: (): Promise<DropObsReply> => ipcRenderer.invoke(IPC.dropObsForget)
}
