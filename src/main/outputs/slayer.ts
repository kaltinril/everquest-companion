// outputs/slayer.ts — the achievements dump, read for its Slayer counters.
//
// A SECOND READ OF THE SAME FILE, and deliberately: `loadAchievements` returns the class-unlock
// projection and drops the rows (its header argues why), so the Slayer projection has nothing to
// take from it. Reading the file again costs a 40 to 65 KB parse inside the seam that already
// times the first one, and keeps that function's return shape as it is.

import { isOwnAchievementsDump } from '../../shared/outputs/achievementBook'
import { showsOpenRows, slayerRecord, type SlayerRecord } from '../../shared/outputs/slayer'
import { loadOutput } from './index'

/** What the character's achievements dump says is left of Slayer. Null when there is no dump,
 *  when the only dump is another character's (`isOwnAchievementsDump`), and when the dump printed
 *  no open row (`showsOpenRows`); the stored record stands in each case. */
export function loadSlayer(characterName?: string, server?: string): SlayerRecord | null {
  const loaded = loadOutput('achievements', characterName, server)
  if (!loaded) return null
  if (!isOwnAchievementsDump(loaded.path, characterName, server)) return null
  const { result } = loaded
  if (!result.ok || result.data.kind !== 'achievements') return null
  if (!showsOpenRows(result.data.dump)) return null
  return slayerRecord(result.data.dump)
}
