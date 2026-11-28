// overlayRecover.ts — bringing lost overlays back (overlay polish; owner, 2026-10-29).
// One press re-fits every open overlay to the screens that exist (the monitor-change pass,
// windows.ts reconcileOverlayDisplays) and then raises them all ("Bring overlays to front",
// overlayReset.ts raiseOverlays). Nothing is reset or written down: an overlay already on screen
// stays where it is. Its hotkey is one of the app's keys (main/hotkeys.ts); the Recover now button
// in Preferences comes here directly.

import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { raiseOverlays } from './overlayReset'
import { reconcileOverlayDisplays } from './windows'

/** Every open overlay back on a screen that exists, then above other windows. */
export function recoverOverlays(): void {
  reconcileOverlayDisplays()
  raiseOverlays()
}

export function registerOverlayRecoverIpc(): void {
  ipcMain.handle(IPC.overlayRecover, () => {
    recoverOverlays()
  })
}
