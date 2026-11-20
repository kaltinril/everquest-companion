// main/gapsCharacterSave.ts — ONE SAVE ATTEMPT of the attached character's Gaps inputs
// (gapsCharacters.ts has what is saved and why it is rare). Apart from that file so the attempt
// runs without electron: what it reads and writes is handed in (tests/gapsCharacterSave.test.mts).

import type { CharacterRef } from '../shared/types'
import { GAP_SOURCE_MODULES, SAVED_GAPS_VERSION, SAVED_ROWS, type GapSourceModule, type SavedGaps, type SavedLog } from '../shared/gapsAllCharacters'
import { restoreMoved, takeMoved } from './gapSourceMoves'

const SAFE_ID = /^[a-z0-9_.-]+$/
const SKIPPED = '[everquest-companion] gaps characters: save skipped, to be tried again'

/** What an attempt reads and writes. */
export interface SaveDeps {
  /** Whether the engine is live on the attached character's log. */
  ready: () => boolean
  active: () => CharacterRef | null
  idOf: (c: CharacterRef) => string
  /** One module's raw live state, or null when the engine cannot serve it now. */
  readModule: (module: GapSourceModule) => Promise<{ seq: number; state: unknown } | null>
  /** The log's identity as the archive's eligibility rule reads it; null when its head cannot be read. */
  logIdentity: (path: string) => SavedLog | null
  write: (saved: SavedGaps) => Promise<void>
  log: (message: string) => void
}

/** The save, holding what it last wrote: call it on each tick. */
export function gapsSaver(deps: SaveDeps): () => Promise<void> {
  /** The seqs last written per character, so an unmoved snapshot is not written again. */
  const lastSeqs = new Map<string, string>()
  let saving = false

  /** The character a save is owed for now, or null: none attached, engine not live, or nothing moved. */
  function owedSave(): { c: CharacterRef; id: string } | null {
    if (saving || !deps.ready()) return null
    const c = deps.active()
    if (c === null) return null
    const id = deps.idOf(c)
    if (!SAFE_ID.test(id)) return null
    // Nothing moved since the last look and this character is already saved: no engine read at all.
    if (!takeMoved(GAP_SOURCE_MODULES) && lastSeqs.has(id)) return null
    return { c, id }
  }

  /** Save the attached character's Gaps inputs when the engine is live on its log and something moved. */
  return async function saveAttachedGaps(): Promise<void> {
    const owed = owedSave()
    if (owed === null) return
    const { c, id } = owed
    saving = true
    // `owedSave` took the moved flags before anything was read. An attempt that neither wrote nor
    // found the file current puts them back: without that a failed save was never tried again until
    // a cursor moved, and a player who then went quiet or quit left the file behind until that
    // character was attached again.
    let settled = false
    try {
      const got = await Promise.all(GAP_SOURCE_MODULES.map(deps.readModule))
      if (deps.active()?.logPath !== c.logPath) return
      if (got.some((m) => m === null)) {
        deps.log(`${SKIPPED}: the engine did not answer`)
        return
      }
      const seqs = got.map((m) => m?.seq).join(',')
      settled = lastSeqs.get(id) === seqs
      if (settled) return
      const log = deps.logIdentity(c.logPath)
      if (log === null) {
        deps.log(`${SKIPPED}: the log's first lines could not be read`)
        return
      }
      const modules = Object.fromEntries(GAP_SOURCE_MODULES.map((m, i) => [m, got[i]])) as SavedGaps['modules']
      const saved: SavedGaps = { v: SAVED_GAPS_VERSION, character: id, name: c.name, server: c.server, savedAt: new Date().toISOString(), log, modules, rows: SAVED_ROWS }
      await deps.write(saved)
      lastSeqs.set(id, seqs)
      settled = true
    } catch (err) {
      deps.log(`[everquest-companion] gaps characters: save failed: ${(err as Error).message}`)
    } finally {
      saving = false
      if (!settled) restoreMoved(GAP_SOURCE_MODULES)
    }
  }
}
