// preload/alertFires.ts - the recent fires of app-signal alerts (shared/alertAppFires.ts), which
// main holds because the engine has no command to take one. Its own slice, spread into `api` in
// index.ts, because that file is past the size where a new bridge method goes inline.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { FireHistory } from '../shared/alertAppFires'

export const alertFiresBridge = {
  /** Every app-signal fire held for this launch, by alert id. */
  getAppFires: (): Promise<FireHistory> => ipcRenderer.invoke(IPC.getAppFires),
  /** The same, each time one is recorded. Returns the unsubscribe. */
  onAppFires: (cb: (history: FireHistory) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, history: FireHistory): void => cb(history)
    ipcRenderer.on(IPC.onAppFires, listener)
    return () => ipcRenderer.removeListener(IPC.onAppFires, listener)
  }
}
