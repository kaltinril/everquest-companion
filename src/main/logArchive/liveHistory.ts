// main/logArchive/liveHistory.ts — the production instance of history.ts, wired to the real
// switch, the app's data folder (ruling 0.2) and the attached character.
//
// Kept apart from history.ts so that file stays free of Electron and node-tested end to end.

import { app } from 'electron'
import { join } from 'node:path'
import { logInfo } from '../errorLog'
import { characterId } from '../log/config'
import { getActiveCharacter } from '../session'
import { logArchiveOn } from '../storeLogArchive'
import { createHistoryMerge, readHeadBytes } from './history'

/** Where segments and archives live: the app's own data folder, never the game's. */
export function logArchiveDir(): string {
  return join(app.getPath('userData'), 'log-archive')
}

export const liveHistory = createHistoryMerge({
  // Arrows, not bare references: this module sits on the read path's import graph, and a cycle
  // must find no binding read at evaluation time.
  on: () => logArchiveOn(),
  dir: () => logArchiveDir(),
  attached: () => {
    const c = getActiveCharacter()
    return c === null ? null : { character: characterId(c), logPath: c.logPath }
  },
  readHead: (path, n) => readHeadBytes(path, n),
  note: (line) => {
    logInfo(`[everquest-companion] ${line}`)
  }
})
