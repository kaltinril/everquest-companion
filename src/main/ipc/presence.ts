// IPC: the two presence-driven settings — the CURSOR RING and OVERLAY AUTO-HIDE.
//
// Four channels, all of them Preferences talking to the store, plus the effects refresh that
// makes a write take effect NOW rather than on the next launch: flipping the ring on must
// produce a ring, and switching auto-hide off must give the overlays back immediately.
//
// VALIDATED AT THE HANDLER, never trusted because today's only caller is the app's own UI
// (the `sounds:getData` / `combo:setCorrection` rule). Both setters take a PARTIAL patch and
// run it through `shared/presencePrefs.ts` — the same normalizer the store reader and the 4→5
// migration use — so a renderer, a hand-edited file and a share import cannot end up with
// three different ideas of what a valid ring is. The reply is what was ACTUALLY stored, so a
// slider that asks for a 900px ring visibly lands on the 200px cap instead of drifting.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { refreshPresenceEffects } from '../presenceEffects'
import { getCursorRing, getOverlayAutoHide, setCursorRing, setOverlayAutoHide } from '../store'
import { sendToMain } from '../windows'
import { type CursorRingPrefs, type OverlayAutoHidePrefs, flipCursorOverlay } from '../../shared/presencePrefs'

/** A patch is a plain object or it is nothing — anything else merges as "no fields given".
 *  The FIELD types are not checked here on purpose: the normalizer downstream takes `unknown`
 *  per field and is the one place that decides what each one may be. */
function patchOf<T>(value: unknown): Partial<T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value
}

/** Store a cursor-ring patch and make it take effect now: the ring window, the cursor poll and the
 *  presence watcher start or stop with `enabled`. The Preferences switch and the hotkey both land here. */
function applyCursorRing(patch: Partial<CursorRingPrefs>): CursorRingPrefs {
  const next = setCursorRing(patch)
  refreshPresenceEffects()
  return next
}

/**
 * The "Cursor overlay on/off" hotkey (owner, 2026-11-27; main/hotkeys.ts): flip the master switch,
 * exactly as the Preferences switch does, then tell the main window so the switch there follows.
 * Only this path pushes: the card already renders its own write's reply. Returns the new state.
 */
export function toggleCursorOverlay(): boolean {
  const next = flipCursorOverlay(getCursorRing, applyCursorRing)
  sendToMain(IPC.onCursorRingChanged, next)
  return next.enabled
}

export function registerPresenceIpc(): void {
  ipcMain.handle(IPC.cursorRingGet, () => getCursorRing())
  ipcMain.handle(IPC.cursorRingSet, (_e, patch: unknown) => applyCursorRing(patchOf<CursorRingPrefs>(patch)))

  ipcMain.handle(IPC.overlayAutoHideGet, () => getOverlayAutoHide())
  ipcMain.handle(IPC.overlayAutoHideSet, (_e, patch: unknown) => {
    const next = setOverlayAutoHide(patchOf<OverlayAutoHidePrefs>(patch))
    refreshPresenceEffects()
    return next
  })
}
