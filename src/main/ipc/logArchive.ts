// ipc/logArchive.ts — the Log archive card's channels (docs/plans/log-archive).
//
// Thin: every decision is in main/logArchive/actions.ts, which checks the switch on every action.
// Arguments come from a renderer, so they are checked here before anything runs.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { backupNow, keepHistory, logArchiveStatus, refreshHistory, restoreNow, rotateNow, setLogArchiveEnabled } from '../logArchive/actions'
import { refoldTrial } from '../logArchive/refoldActions'

export function registerLogArchiveIpc(): void {
  ipcMain.handle(IPC.logArchiveStatus, () => logArchiveStatus())
  ipcMain.handle(IPC.logArchiveSetEnabled, (_e, enabled: unknown) => setLogArchiveEnabled(enabled === true))
  ipcMain.handle(IPC.logArchiveBackup, () => backupNow())
  ipcMain.handle(IPC.logArchiveKeep, (_e, id: unknown) => keepHistory(typeof id === 'string' ? id : ''))
  ipcMain.handle(IPC.logArchiveRotate, () => rotateNow())
  ipcMain.handle(IPC.logArchiveRestore, (_e, id: unknown) => restoreNow(typeof id === 'string' ? id : ''))
  ipcMain.handle(IPC.logArchiveRefresh, (_e, id: unknown) => refreshHistory(typeof id === 'string' ? id : ''))
  ipcMain.handle(IPC.logArchiveRefoldTrial, (_e, id: unknown, withTables: unknown) =>
    refoldTrial(typeof id === 'string' ? id : '', withTables === true)
  )
}
