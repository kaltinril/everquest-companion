// ipc/bazaarWatch.ts — the Bazaar's channels: the watchlist (shared/bazaarWatch.ts), and saving
// its offers as a CSV (shared/bazaarCsv.ts builds the text; this only asks where and writes it).

import { app, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { IPC } from '../../shared/ipc'
import { logError } from '../errorLog'
import { getBazaarWatch, setBazaarWatch } from '../storeBazaarWatch'
import { getMainWindow } from '../windows'

async function saveCsv(text: unknown, name: unknown): Promise<string | null> {
  if (typeof text !== 'string') return null
  const base = typeof name === 'string' && /^[\w .-]{1,80}\.csv$/.test(name) ? name : 'bazaar-offers.csv'
  const opts = {
    title: 'Export Bazaar offers',
    defaultPath: join(app.getPath('documents'), base),
    filters: [{ name: 'CSV (opens in Excel)', extensions: ['csv'] }]
  }
  const win = getMainWindow()
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  try {
    writeFileSync(res.filePath, text, 'utf8')
    return res.filePath
  } catch (err) {
    logError('main:bazaarSaveCsv', err)
    return null
  }
}

export function registerBazaarWatchIpc(): void {
  ipcMain.handle(IPC.bazaarWatchGet, () => getBazaarWatch())
  ipcMain.handle(IPC.bazaarWatchSet, (_e, value: unknown) => setBazaarWatch(value))
  ipcMain.handle(IPC.bazaarSaveCsv, (_e, text: unknown, name: unknown) => saveCsv(text, name))
}
