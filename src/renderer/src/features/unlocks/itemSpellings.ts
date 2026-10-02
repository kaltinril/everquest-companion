// unlocks/itemSpellings.ts — how the achievements file words an ITEM PAGE, through the Sky
// inference's alias table. Split out of unlockJoins.ts so a test can reach it: this file imports
// nothing through `@shared`, which the test runner does not resolve.

import { ACHIEVEMENT_REWARD_ALIASES } from '../posky/achievementInference'

/** Case and runs of space folded, as unlockGraph.ts `nameKey` folds. */
const fold = (raw: string): string => raw.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The `Obtain` subjects that name this item page under another spelling. The Beastlord row names
 * a weapon pair in one line (`Windhowl and Spirit Render`), so either half's page finds it, the
 * way the mob path finds it through `achievementItemsFor`.
 */
export function achievementSpellings(name: string): string[] {
  const key = fold(name)
  return ACHIEVEMENT_REWARD_ALIASES.filter(
    (a) => fold(a.reward) === key || a.achievementItem.split(' and ').some((half) => fold(half) === key)
  ).map((a) => a.achievementItem)
}
