// IPC: the Achievements tab's one door (UNRELEASED, like the tab it feeds).
//
// `ipc/outputs.ts`'s terms: no path argument and no character argument, because which file is
// read is main's answer through the outputs registry. No dump answers null, which the tab draws
// as its never-run state. Nothing is cached; the file is one the player rewrites on purpose.
// Registration is gated on the review-gate door (src/main/unreleased.ts): a packaged build has
// no tab to ask from, so it gets no handler to answer.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AchievementBook } from '../../shared/outputs/achievementBook'
import { loadAchievementBook } from '../outputs/achievementBook'
import { getActiveCharacter } from '../session'
import { UNRELEASED } from '../unreleased'

export function registerAchievementsIpc(): void {
  if (!UNRELEASED) return
  ipcMain.handle(IPC.achievementsBook, (): AchievementBook | null => {
    const character = getActiveCharacter()
    return loadAchievementBook(character?.name, character?.server)
  })
}
