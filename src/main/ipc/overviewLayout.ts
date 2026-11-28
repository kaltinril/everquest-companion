// IPC: which Overview cards are shown, and in what order (shared/overviewLayout.ts).
//
// One layout per install, in the settings store, so it is the same for every character and the
// same in a dev and a built app (localStorage is keyed by page origin and is not). Read and
// written through ONE normalizer, here at the handler, because the renderer supplies the value.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { normalizeOverviewLayout, type OverviewLayout } from '../../shared/overviewLayout'
import { settingsStore } from '../store'

export function getOverviewLayout(): OverviewLayout {
  return normalizeOverviewLayout(settingsStore.get('overviewLayout'))
}

/** Store a layout; returns what was stored, so the caller renders the answer, not its request. */
export function setOverviewLayout(value: unknown): OverviewLayout {
  const next = normalizeOverviewLayout(value)
  settingsStore.set('overviewLayout', next)
  return next
}

export function registerOverviewLayoutIpc(): void {
  ipcMain.handle(IPC.overviewLayoutGet, () => getOverviewLayout())
  ipcMain.handle(IPC.overviewLayoutSet, (_e, value: unknown) => setOverviewLayout(value))
}
