// overlayRecover.ts — the hotkey that brings lost overlays back (overlay polish; owner, 2026-10-29).
// One press re-fits every open overlay to the screens that exist (the monitor-change pass,
// windows.ts reconcileOverlayDisplays) and then raises them all ("Bring overlays to front",
// overlayReset.ts raiseOverlays). Nothing is reset or written down: an overlay already on screen
// stays where it is. The key is off until the player sets one (shared/overlayHotkey.ts).

import { app, globalShortcut, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { hotkeyProblem, type HotkeyAnswer } from '../shared/overlayHotkey'
import { logInfo } from './errorLog'
import { raiseOverlays } from './overlayReset'
import { settingsStore } from './store'
import { reconcileOverlayDisplays } from './windows'

let current: string | null = null

/** Every open overlay back on a screen that exists, then above other windows. */
export function recoverOverlays(): void {
  reconcileOverlayDisplays()
  raiseOverlays()
}

/** Set (or turn off, null) the key. A new key is taken before the old one is let go, so a refused
 *  key leaves the old one working; the answer says what is in force and why a key was refused. */
function setRecoverHotkey(accel: string | null): HotkeyAnswer {
  if (accel === null) {
    if (current !== null) globalShortcut.unregister(current)
    current = null
    settingsStore.delete('overlayRecoverHotkey')
    return { hotkey: null }
  }
  const problem = hotkeyProblem(accel)
  if (problem !== undefined) return { hotkey: current, message: problem }
  if (accel === current) return { hotkey: current }
  let ok = false
  try {
    ok = globalShortcut.register(accel, recoverOverlays)
  } catch {
    ok = false
  }
  if (!ok) return { hotkey: current, message: `${accel} is taken by Windows or another program.` }
  if (current !== null) globalShortcut.unregister(current)
  current = accel
  settingsStore.set('overlayRecoverHotkey', accel)
  logInfo('[everquest-companion]', `overlay recover hotkey: ${accel}`)
  return { hotkey: current }
}

export function registerOverlayRecoverIpc(): void {
  // The key the player set last time, taken again at start; a key now held elsewhere stays off.
  const saved = settingsStore.get('overlayRecoverHotkey')
  if (typeof saved === 'string') setRecoverHotkey(saved)
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
  ipcMain.handle(IPC.overlayRecoverHotkey, (_e, action: unknown, accel: unknown) => {
    if (action === 'set' && (typeof accel === 'string' || accel === null)) return setRecoverHotkey(accel)
    return { hotkey: current }
  })
  ipcMain.handle(IPC.overlayRecover, () => {
    recoverOverlays()
  })
}
