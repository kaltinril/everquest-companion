import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { UpdateStatus } from '../shared/types'

// Auto-update (Task #27; reworked in Task #55) and the "Update automatically" switch. Moved out
// of preload/index.ts unchanged, to keep that file under its 400-line ceiling.
export const updatesBridge = {
  /** Subscribe to update lifecycle pushes (checking/available/downloading/ready/error). */
  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
    const listener = (_e: unknown, s: UpdateStatus): void => cb(s)
    ipcRenderer.on(IPC.onUpdateStatus, listener)
    return () => ipcRenderer.removeListener(IPC.onUpdateStatus, listener)
  },
  /** Pull the last update status (pushes only reach renderers mounted at the time). */
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.getUpdateStatus),
  /** Run an update check now; resolves to the resulting status (idle no-op in dev). */
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.checkForUpdates),
  /** Apply the downloaded update now (quit + install + relaunch). */
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.installUpdate),
  /** Background checks, downloads and apply-on-quit on or off; resolves to the new status. */
  setAutoUpdate: (enabled: boolean): Promise<UpdateStatus> =>
    ipcRenderer.invoke(IPC.setAutoUpdate, enabled)
}
