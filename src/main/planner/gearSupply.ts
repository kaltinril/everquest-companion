// planner/gearSupply.ts — the committed catalogs behind a gear row's `supply` (void mote ranking).
//
// Only the file reads live here; the folding is `shared/planner/supplyContext.ts` and the estimate
// `shared/planner/itemSupply.ts`. Built on the first gear index build and kept for the process.

import bossesJson from '../../renderer/src/data/eqlegends/bosses.json'
import dropGroupsJson from '../../renderer/src/data/eqlegends/dropGroups.json'
import mobsJson from '../../renderer/src/data/eqlegends/mobs.json'
import poskyJson from '../../renderer/src/data/eqlegends/posky.json'
import questsJson from '../../renderer/src/data/eqlegends/quests.json'
import respawnsJson from '../data/respawns.json'
import type { SourceIndex } from '../../shared/itemSources'
import type { SupplyContext } from '../../shared/planner/itemSupply'
import { supplyContextOf, type SupplyData } from '../../shared/planner/supplyContext'

let COMMITTED: { sources: SourceIndex; ctx: SupplyContext } | null = null

/** The committed files' lookups, for the source index the build is using. */
export function committedSupplyContext(sources: SourceIndex): SupplyContext {
  if (COMMITTED?.sources === sources) return COMMITTED.ctx
  // Read through `unknown`: each JSON's inferred type changes with the data.
  const data: SupplyData = {
    mobs: (mobsJson as unknown as { mobs: SupplyData['mobs'] }).mobs,
    respawns: (respawnsJson as unknown as { rows: SupplyData['respawns'] }).rows,
    targets: (bossesJson as unknown as { targets: SupplyData['targets'] }).targets,
    quests: (questsJson as unknown as { quests: SupplyData['quests'] }).quests,
    sky: (poskyJson as unknown as { quests: SupplyData['sky'] }).quests,
    groups: (dropGroupsJson as unknown as { groups: SupplyData['groups'] }).groups
  }
  COMMITTED = { sources, ctx: supplyContextOf(data, sources) }
  return COMMITTED.ctx
}
