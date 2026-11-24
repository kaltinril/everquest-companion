// spellTableReport.ts — the slice of the main app's bridge that says where the client's spell table
// stands, for the Spells tab's notice (shared/spellTableNotice.ts; owner, 2026-11-23).
//
// A separate file for FILE MASS, not for scope: the achievements.ts / planner.ts pattern. This
// object is spread into the bridge, so the method is an ordinary member of the one `window.eq`
// surface. IT TAKES NO ARGUMENT: which folder and which file are main's answer, never a path the
// renderer supplies.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { SpellTableReport } from '../shared/spellTableNotice'

export const spellTableReportApi = {
  /** The spell table's state, the folder looked in and the file read (or `spells_us.txt` when none
   *  was found). Settled: main waits for the table's load before it answers. */
  spellTableReport: (): Promise<SpellTableReport> => ipcRenderer.invoke(IPC.spellsTableReport)
}
