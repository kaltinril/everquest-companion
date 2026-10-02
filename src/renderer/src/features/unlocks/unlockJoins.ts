// unlocks/unlockJoins.ts — what an ITEM or a MOB is on the way to, from the graph plus the two
// renderer corpora the graph itself does not read. Pure: no React.
//
//   - an item: the Sky reward whose `Obtain` line names it (the graph, by the dump's spelling and
//     the Sky inference's alias for the Beastlord pair), and the quests it is used in when one of
//     those is an unlock's task or a part of one;
//   - a mob: the quests that name it, on the same terms, and the Sky quests it GIVES, whose reward
//     is a class unlock's line (posky.json; all sixteen givers are in the mob catalog).

import type { UnlockPath } from '@shared/unlocks/unlockGraph'
import {
  distinctPaths,
  nameKey,
  unlocksNeedingItem,
  unlocksNeedingQuest
} from '@shared/unlocks/unlockGraph'
import { getPoskyData } from '../../data'
import { achievementItemsFor } from '../posky/achievementInference'
import { achievementSpellings } from './itemSpellings'

/** The unlocks an item is on the way to. */
export function itemUnlockPaths(
  name: string,
  questUses: readonly { quest: string }[]
): UnlockPath[] {
  return distinctPaths([
    ...[name, ...achievementSpellings(name)].flatMap((n) => unlocksNeedingItem(n)),
    ...questUses.flatMap((u) => unlocksNeedingQuest(u.quest))
  ])
}

let GIVER_PATHS: Map<string, UnlockPath[]> | null = null

/** By the giver's name: the class-unlock lines the Sky quests they give lead to. */
function skyGiverPaths(): Map<string, UnlockPath[]> {
  if (GIVER_PATHS !== null) return GIVER_PATHS
  GIVER_PATHS = new Map()
  for (const q of getPoskyData().quests) {
    if (q.giver === undefined || q.reward === undefined) continue
    const key = nameKey(q.giver)
    const paths = GIVER_PATHS.get(key) ?? []
    for (const item of achievementItemsFor(q.className, q.reward)) {
      paths.push(...unlocksNeedingItem(item))
    }
    GIVER_PATHS.set(key, paths)
  }
  return GIVER_PATHS
}

/** The unlocks a mob is on the way to. */
export function mobUnlockPaths(name: string, quests: readonly { quest: string }[]): UnlockPath[] {
  return distinctPaths([
    ...(skyGiverPaths().get(nameKey(name)) ?? []),
    ...quests.flatMap((q) => unlocksNeedingQuest(q.quest))
  ])
}
