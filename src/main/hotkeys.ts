// hotkeys.ts — the app's system-wide keys, one owner per action (shared/overlayHotkey.ts): "Bring
// overlays back" (owner, 2026-10-29) and "Cursor overlay on/off" (owner, 2026-11-27). Each key is
// off until the player sets one in Preferences > Hotkeys and is saved under its own store key. This
// is the only file that touches globalShortcut (tests/overlayHotkey.test.mts).

import { app, globalShortcut, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { type HotkeyAction, type HotkeyPorts, isHotkeyAction, makeHotkeyBoard } from '../shared/overlayHotkey'
import { logInfo } from './errorLog'
import { toggleCursorOverlay } from './ipc/presence'
import { recoverOverlays } from './overlayRecover'
import { settingsStore } from './store'

/** Where each action's key is saved, and what a press does. */
const ACTIONS: Record<HotkeyAction, { storeKey: 'overlayRecoverHotkey' | 'cursorToggleHotkey'; run: () => void }> = {
  recover: { storeKey: 'overlayRecoverHotkey', run: recoverOverlays },
  cursorToggle: {
    storeKey: 'cursorToggleHotkey',
    run: () => {
      const on = toggleCursorOverlay()
      logInfo('[everquest-companion]', `cursor overlay hotkey: turned ${on ? 'on' : 'off'}`)
    }
  }
}

/** One action's ports over the real system and store. */
function portsFor(action: HotkeyAction): HotkeyPorts {
  const { storeKey, run } = ACTIONS[action]
  return {
    register: (accel) => globalShortcut.register(accel, run),
    unregister: (accel) => globalShortcut.unregister(accel),
    load: () => settingsStore.get(storeKey),
    save: (accel) => {
      settingsStore.set(storeKey, accel)
      logInfo('[everquest-companion]', `${action} hotkey: ${accel}`)
    },
    clear: () => settingsStore.delete(storeKey)
  }
}

const board = makeHotkeyBoard({ recover: portsFor('recover'), cursorToggle: portsFor('cursorToggle') })

export function registerHotkeysIpc(): void {
  // The keys the player set last time, taken again at start. A key now held elsewhere stays off and
  // stays saved; Preferences is told why on its next ask.
  board.start()
  for (const [action, answer] of Object.entries(board.get())) {
    if (answer.message !== undefined) logInfo('[everquest-companion]', `${action} hotkey off at start: ${answer.message}`)
  }
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
  ipcMain.handle(IPC.hotkeysGet, () => board.get())
  ipcMain.handle(IPC.hotkeySet, (_e, action: unknown, accel: unknown) => {
    if (isHotkeyAction(action) && (typeof accel === 'string' || accel === null)) return board.set(action, accel)
    return { answer: { hotkey: null, message: 'That hotkey could not be set.' }, hotkeys: board.get() }
  })
}
