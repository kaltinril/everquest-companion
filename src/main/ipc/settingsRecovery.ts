// IPC: the notice for a settings file that was damaged at launch (shared/settingsRecovery.ts).
//
// The outcome exists only on the launch that did the recovery (the next launch finds a healthy
// file), and that launch may never open the main window, so the words wait in the settings store
// until the player closes the card. An added optional key: an older build ignores it.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { holdRecoveryNotice, settingsRecoveryNotice } from '../../shared/settingsRecovery'
import { schemaMigration, settingsStore } from '../store'

export function registerSettingsRecoveryIpc(): void {
  const notice = holdRecoveryNotice(settingsRecoveryNotice(schemaMigration), {
    load: () => settingsStore.get('pendingSettingsNotice'),
    save: (held) => settingsStore.set('pendingSettingsNotice', held),
    clear: () => settingsStore.delete('pendingSettingsNotice')
  })
  ipcMain.handle(IPC.settingsRecoveryGet, () => notice.get())
  ipcMain.on(IPC.settingsRecoverySeen, () => notice.seen())
}
