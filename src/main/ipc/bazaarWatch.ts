// ipc/bazaarWatch.ts — the Bazaar watchlist's two channels (shared/bazaarWatch.ts).

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { getBazaarWatch, setBazaarWatch } from '../storeBazaarWatch'

export function registerBazaarWatchIpc(): void {
  ipcMain.handle(IPC.bazaarWatchGet, () => getBazaarWatch())
  ipcMain.handle(IPC.bazaarWatchSet, (_e, value: unknown) => setBazaarWatch(value))
}
