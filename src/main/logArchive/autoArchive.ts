// main/logArchive/autoArchive.ts — WITH THE SWITCH ON, THE LOG IS KEPT SMALL WITHOUT THE PLAYER.
//
// Owner, 2026-10-06: once Summarize and archive log is on, the player should never have to come
// back to the card. So the switch is the consent, and this archives the log whenever it passes
// AUTO_ARCHIVE_BYTES. It does the same thing the card's button does (`rotateNow`), so every
// preflight rule still holds: it waits while the engine is still reading the log, and it archives
// at most once per app run.
//
// The check is a stat of the live log; the folder is read only once the log is over the limit.

import { statSync } from 'node:fs'
import { logInfo } from '../errorLog'
import { getActiveCharacter } from '../session'
import { logArchiveOn } from '../storeLogArchive'
import type { LogArchiveReply } from '../../shared/logArchive/panel'
import { AUTO_ARCHIVE_BYTES } from '../../shared/logArchive/preflight'
import { rotateNow } from './actions'

const CHECK_EVERY_MS = 5 * 60_000

let running = false

function liveBytes(): number {
  const c = getActiveCharacter()
  if (c === null) return 0
  try {
    return statSync(c.logPath).size
  } catch {
    return 0
  }
}

/** Archive now if the switch is on and the log is over the limit; null when there was nothing to do. */
export async function autoArchiveCheck(): Promise<LogArchiveReply | null> {
  if (running || !logArchiveOn() || liveBytes() < AUTO_ARCHIVE_BYTES) return null
  running = true
  try {
    const r = await rotateNow()
    logInfo(`[everquest-companion] log archive (automatic): ${r.message}`)
    return r
  } finally {
    running = false
  }
}

/** Called once at launch, after the session has started tailing. */
export function startAutoArchive(): void {
  setInterval(() => void autoArchiveCheck(), CHECK_EVERY_MS).unref()
}
