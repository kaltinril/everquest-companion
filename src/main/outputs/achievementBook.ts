// outputs/achievementBook.ts — the achievements dump, read whole for the Achievements tab.
//
// READ ON DEMAND AND NEVER STORED. `loadAchievements` drops the parsed rows and says why (a
// persisted shape is a debt forever), and that holds here: the tab asks when it is opened and
// again when the dump is re-read, and the tree lives as long as the tab does.

import { achievementBook, type AchievementBook } from '../../shared/outputs/achievementBook'
import { loadOutput } from './index'

/** The character's achievements dump as the tree the game draws. Null when there is no dump. */
export function loadAchievementBook(characterName?: string, server?: string): AchievementBook | null {
  const loaded = loadOutput('achievements', characterName, server)
  if (!loaded) return null
  const { result } = loaded
  if (!result.ok || result.data.kind !== 'achievements') return null
  return achievementBook(result.data.dump)
}
