// IPC: the Achievements tab's one door.
//
// `ipc/outputs.ts`'s terms: no path argument and no character argument, because which file is
// read is main's answer through the outputs registry. No dump answers null, which the tab draws
// as its never-run state. Nothing is cached; the file is one the player rewrites on purpose.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AchievementBook } from '../../shared/outputs/achievementBook'
import { loadAchievementBook } from '../outputs/achievementBook'
import { getActiveCharacter } from '../session'

export function registerAchievementsIpc(): void {
  ipcMain.handle(IPC.achievementsBook, (): AchievementBook | null => {
    const character = getActiveCharacter()
    return loadAchievementBook(character?.name, character?.server)
  })
}
