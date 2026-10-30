// whoWatch.ts — the `/who` listings the player types, read live for friends online (competitor
// quick wins; owner, 2026-10-29; shared/whoFriends.ts). An app-owned raw alert asks the engine for
// every listing line (dataServer/ownFires.ts: never listed, never sounded, live lines only); the
// rows fold into one listing here, and the main window hears the latest once a burst has settled.

import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { AlertDef } from '../shared/types'
import type { FireMessage } from '../shared/dataServer/protocol.generated'
import { EMPTY_WHO_FOLD, foldWho, WHO_LINE_REGEX, type WhoFold } from '../shared/whoFriends'
import { DEFAULT_ALERT_PACK_ID, DEFAULT_ALERT_SOUNDS } from './data/defaultPacks'
import { setOwnFires } from './dataServer/ownFires'
import { getMainWindow } from './windows'

const WHO_DEF: AlertDef = {
  id: 'eqc-who-rows',
  name: 'EQ Companion /who rows (friends online)',
  enabled: true,
  trigger: { type: 'raw', regex: WHO_LINE_REGEX },
  // Required by the def's shape; a taken fire plays nothing.
  sound: { packId: DEFAULT_ALERT_PACK_ID, soundId: DEFAULT_ALERT_SOUNDS.buffWearsOff },
  cooldownMs: 0
}

/** A `/who all` prints hundreds of rows in one second: the main window hears once they stop. */
const SETTLE_MS = 300

let fold: WhoFold = EMPTY_WHO_FOLD
let pending: NodeJS.Timeout | null = null

function tellMain(): void {
  pending = null
  const w = getMainWindow()
  if (w && !w.isDestroyed()) w.webContents.send(IPC.onWhoResult, fold.current)
}

function takeWhoFire(fire: FireMessage): boolean {
  if (fire.rule !== WHO_DEF.name) return false
  const next = foldWho(fold, fire.message, fire.at)
  fold = next.fold
  if (next.changed && pending === null) {
    pending = setTimeout(tellMain, SETTLE_MS)
    pending.unref()
  }
  return true
}

export function registerWhoWatchIpc(): void {
  setOwnFires('who', [WHO_DEF], takeWhoFire)
  ipcMain.handle(IPC.whoLast, () => fold.current)
}
