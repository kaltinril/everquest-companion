// preload/overviewLayout.ts — the Overview's card layout on the app bridge. Its own module,
// spread into `api` in index.ts, for the same file-size reason as ./uiScale.ts.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { OverviewLayout } from '../shared/overviewLayout'

export const overviewLayoutBridge = {
  /** The stored layout, normalized; the default page on an install that never customized it. */
  getOverviewLayout: (): Promise<OverviewLayout> => ipcRenderer.invoke(IPC.overviewLayoutGet),
  /** Store a layout; resolves to what was actually stored. */
  setOverviewLayout: (layout: OverviewLayout): Promise<OverviewLayout> =>
    ipcRenderer.invoke(IPC.overviewLayoutSet, layout)
}
