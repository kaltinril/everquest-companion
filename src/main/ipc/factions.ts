// IPC: the Factions tab's log-evidence door.
//
// One handler: fold the log's faction receipts SINCE THE DUMP (main/factionsEvidence.ts). The
// boundary is main's own answer — the active character's `factionsSource.loadedAt` — so the
// renderer never names a path or an instant; no dump or no log answers null, which the tab
// renders as the dump alone (or the never-run card).

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { FactionEvidenceReport } from '../../shared/factionLog'
import { readFactionEvidence } from '../factionsEvidence'
import { activeCharId, getActiveCharacter } from '../session'
import { getProgress } from '../store'

/** The recent window the renderer may ask for, in minutes: a day at most, 30 when unreadable. */
function recentMinutes(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.min(raw, 24 * 60) : 30
}

export function registerFactionsIpc(): void {
  ipcMain.handle(IPC.factionsEvidence, async (_e, minutes: unknown): Promise<FactionEvidenceReport | null> => {
    const character = getActiveCharacter()
    if (character === null) return null
    const source = getProgress(activeCharId()).factionsSource
    if (source === undefined) return null
    const sinceMs = Date.parse(source.loadedAt)
    if (!Number.isFinite(sinceMs)) return null
    return readFactionEvidence(character.logPath, sinceMs, Date.now() - recentMinutes(minutes) * 60_000)
  })
}
