// IPC: the notice for a settings file that was damaged at launch (shared/settingsRecovery.ts).
//
// The outcome exists only on the launch that did the recovery (the next launch finds a healthy
// file), so it is held in memory: the main window reads it when it mounts, and it is dropped when
// the player closes the notice so a reloaded window does not show it twice.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { settingsRecoveryNotice } from '../../shared/settingsRecovery'
import { schemaMigration } from '../store'

export function registerSettingsRecoveryIpc(): void {
  let notice = settingsRecoveryNotice(schemaMigration)
  ipcMain.handle(IPC.settingsRecoveryGet, () => notice)
  ipcMain.on(IPC.settingsRecoverySeen, () => {
    notice = null
  })
}
