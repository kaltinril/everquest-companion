import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { DropObsReply, DropObsStatus } from '../shared/dropObs'

/** Send loot to the wiki's drop database (requirements/drop-db-submit.md). Off until the player turns it on. */
export const dropObsBridge = {
  dropObsStatus: (): Promise<DropObsStatus> => ipcRenderer.invoke(IPC.dropObsStatus),
  /** An empty password keeps the saved one. */
  dropObsSaveAccount: (username: string, password: string): Promise<DropObsReply> =>
    ipcRenderer.invoke(IPC.dropObsSaveAccount, username, password),
  /** Only the player flips this, from the card. */
  setDropObsEnabled: (enabled: boolean): Promise<DropObsReply> => ipcRenderer.invoke(IPC.dropObsSetEnabled, enabled),
  dropObsTest: (): Promise<DropObsReply> => ipcRenderer.invoke(IPC.dropObsTest)
}
