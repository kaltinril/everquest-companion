// respawnAlertTick.ts - the 1 s clock the respawn pre-alert's watcher counts on (fork #7).
// Main-side because a minimized main window may slow its own timers; off while the setting is off.
// The switch itself is respawnAlertTickCore.ts; this file hands it the real timer and window.

import { IPC } from '../shared/ipc'
import { makeRespawnAlertTick } from './respawnAlertTickCore'
import { sendToMain } from './windows'

export const syncRespawnAlertTick: (on: boolean) => void = makeRespawnAlertTick({
  every: (fn, ms) => {
    const timer = setInterval(fn, ms)
    timer.unref()
    return timer
  },
  clear: (timer) => clearInterval(timer),
  send: (nowMs) => sendToMain(IPC.respawnAlertTick, nowMs),
  now: () => Date.now()
})
