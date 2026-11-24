// ipc/dropObs.ts — the drop-database card's channels (docs/community/requirements/drop-db-submit.md).
//
// Thin: every decision is in main/dropObs/service.ts. Arguments come from a renderer, so they are
// checked here before anything runs. Registering also starts the background drain, which sends
// nothing while the player's switch is off.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { DROP_OBS_MODES, type DropObsMode } from '../../shared/dropObs'
import { dropObsStatus, forgetDropObsAccount, saveDropObsAccount, sendDropObsNow, setDropObsMode, startDropObsDrain, testDropObs } from '../dropObs/service'

export function registerDropObsIpc(): void {
  ipcMain.handle(IPC.dropObsStatus, () => dropObsStatus())
  ipcMain.handle(IPC.dropObsSaveAccount, (_e, username: unknown, password: unknown) =>
    saveDropObsAccount(typeof username === 'string' ? username.slice(0, 300) : '', typeof password === 'string' ? password.slice(0, 300) : '')
  )
  // Anything but a known mode is Off: a garbled argument never starts sending.
  ipcMain.handle(IPC.dropObsSetMode, (_e, mode: unknown) => setDropObsMode(DROP_OBS_MODES.includes(mode as DropObsMode) ? (mode as DropObsMode) : 'off'))
  ipcMain.handle(IPC.dropObsSendNow, () => sendDropObsNow())
  ipcMain.handle(IPC.dropObsTest, () => testDropObs())
  ipcMain.handle(IPC.dropObsForget, () => forgetDropObsAccount())
  startDropObsDrain()
}
