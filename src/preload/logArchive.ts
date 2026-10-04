import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { LogArchiveReply, LogArchiveStatus } from '../shared/logArchive/panel'

/** Keep log history (docs/plans/log-archive). Every action refuses while the switch is off. */
export const logArchiveBridge = {
  logArchiveStatus: (): Promise<LogArchiveStatus> => ipcRenderer.invoke(IPC.logArchiveStatus),
  /** Only the player flips this, from the card. */
  setLogArchiveEnabled: (enabled: boolean): Promise<LogArchiveReply> =>
    ipcRenderer.invoke(IPC.logArchiveSetEnabled, enabled),
  logArchiveBackup: (): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveBackup),
  logArchiveKeep: (id: string): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveKeep, id),
  logArchiveRotate: (): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveRotate),
  logArchiveRestore: (id: string): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveRestore, id)
}
