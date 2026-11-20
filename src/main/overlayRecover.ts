// overlayRecover.ts — the hotkey that brings lost overlays back (overlay polish; owner, 2026-10-29).
// One press re-fits every open overlay to the screens that exist (the monitor-change pass,
// windows.ts reconcileOverlayDisplays) and then raises them all ("Bring overlays to front",
// overlayReset.ts raiseOverlays). Nothing is reset or written down: an overlay already on screen
// stays where it is. The key is off until the player sets one (shared/overlayHotkey.ts).

import { app, globalShortcut, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { makeRecoverHotkey } from '../shared/overlayHotkey'
import { logInfo } from './errorLog'
import { raiseOverlays } from './overlayReset'
import { settingsStore } from './store'
import { reconcileOverlayDisplays } from './windows'

/** Every open overlay back on a screen that exists, then above other windows. */
export function recoverOverlays(): void {
  reconcileOverlayDisplays()
  raiseOverlays()
}

/** The key's state and its answers (shared/overlayHotkey.ts), over the real system and store. */
const hotkey = makeRecoverHotkey({
  register: (accel) => globalShortcut.register(accel, recoverOverlays),
  unregister: (accel) => globalShortcut.unregister(accel),
  load: () => settingsStore.get('overlayRecoverHotkey'),
  save: (accel) => {
    settingsStore.set('overlayRecoverHotkey', accel)
    logInfo('[everquest-companion]', `overlay recover hotkey: ${accel}`)
  },
  clear: () => settingsStore.delete('overlayRecoverHotkey')
})

export function registerOverlayRecoverIpc(): void {
  // The key the player set last time, taken again at start. A key now held elsewhere stays off and
  // stays saved; Preferences is told why on its next ask.
  hotkey.start()
  const off = hotkey.get().message
  if (off !== undefined) logInfo('[everquest-companion]', `overlay recover hotkey off at start: ${off}`)
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
  ipcMain.handle(IPC.overlayRecoverHotkey, (_e, action: unknown, accel: unknown) => {
    if (action === 'set' && (typeof accel === 'string' || accel === null)) return hotkey.set(accel)
    return hotkey.get()
  })
  ipcMain.handle(IPC.overlayRecover, () => {
    recoverOverlays()
  })
}
