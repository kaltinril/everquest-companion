// respawnAlertTick.ts - the 1 s clock the respawn pre-alert's watcher counts on (fork #7).
// Main-side because a minimized main window may slow its own timers; off while the setting is off.

import { IPC } from '../shared/ipc'
import { sendToMain } from './windows'

let timer: ReturnType<typeof setInterval> | null = null

export function syncRespawnAlertTick(on: boolean): void {
  if (on === (timer !== null)) return
  if (timer !== null) {
    clearInterval(timer)
    timer = null
    return
  }
  timer = setInterval(() => sendToMain(IPC.respawnAlertTick, Date.now()), 1000)
  timer.unref()
}
