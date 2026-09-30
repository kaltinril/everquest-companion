// achievements.ts — the slice of the main app's bridge that reads the `/outputfile achievements`
// dump: the Achievements tab's tree, and the feedback attachment's preview (JOS-441).
//
// A separate file for FILE MASS, not for scope: the planner.ts/roster.ts/windows.ts pattern, and
// the rule those files state. `src/preload/index.ts` sits at the measured 400-code-line ceiling,
// the tab needed one method more than it had room for, and the preview moved here with it so
// that file is no longer than it was. This object is spread into the bridge, so both methods are
// ordinary members of the one `window.eq` surface and no renderer call site changes.
//
// NEITHER TAKES AN ARGUMENT, on purpose: which file is read is main's answer through the outputs
// registry, never a path the renderer supplies.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { FeedbackAchievementsPreview } from '../shared/feedback'
import type { AchievementBook } from '../shared/outputs/achievementBook'

export const achievementsApi = {
  /** The active character's dump as the tree the game draws, or `null` when there is no dump.
   *  Read on demand; the tab asks again when main re-reads the file. */
  achievementsBook: (): Promise<AchievementBook | null> => ipcRenderer.invoke(IPC.achievementsBook),
  /** Package the CURRENT dump and return its counts + a capped preview, or the named reason
   *  there is none: `buildFeedbackInventory`'s twin for the second attachment. */
  buildFeedbackAchievements: (): Promise<FeedbackAchievementsPreview> =>
    ipcRenderer.invoke(IPC.feedbackBuildAchievements)
}
