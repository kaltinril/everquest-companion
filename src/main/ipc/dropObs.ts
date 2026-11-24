// ipc/dropObs.ts — the drop-database card's channels (docs/community/requirements/drop-db-submit.md).
//
// Thin: every decision is in main/dropObs/service.ts. Arguments come from a renderer, so they are
// checked here before anything runs. Registering also starts the background drain, which sends
// nothing while the player's switch is off.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { dropObsStatus, forgetDropObsAccount, saveDropObsAccount, setDropObsEnabled, startDropObsDrain, testDropObs } from '../dropObs/service'

export function registerDropObsIpc(): void {
  ipcMain.handle(IPC.dropObsStatus, () => dropObsStatus())
  ipcMain.handle(IPC.dropObsSaveAccount, (_e, username: unknown, password: unknown) =>
    saveDropObsAccount(typeof username === 'string' ? username.slice(0, 300) : '', typeof password === 'string' ? password.slice(0, 300) : '')
  )
  ipcMain.handle(IPC.dropObsSetEnabled, (_e, enabled: unknown) => setDropObsEnabled(enabled === true))
  ipcMain.handle(IPC.dropObsTest, () => testDropObs())
  ipcMain.handle(IPC.dropObsForget, () => forgetDropObsAccount())
  startDropObsDrain()
}
