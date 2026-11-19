// planner/supplyContext.ts — the committed catalogs, folded into the lookups `itemSupply` reads.
//
// Each lookup says only what a page states (absent stays absent; `itemSupply` names what it then
// assumes): a camp's respawn, loot list and spawn shares, the raid roster, and the quests that hand
// an item out with what each asks for. PURE: the caller passes the parsed files.

import { sourceItemKey, type ItemSource, type SourceIndex } from '../itemSources'
import type { MobEntry } from '../mobTypes'
import type { WikiRespawn } from '../respawnWiki'
import type { PoskyQuest, QuestEntry, RaidTarget } from '../types'
import { mobKey, raidFactsOf, type CampFacts, type RewardPart, type RewardRoad, type SupplyContext } from './itemSupply'

export interface SupplyData {
  mobs: readonly MobEntry[]
  respawns: readonly WikiRespawn[]
  targets: readonly Pick<RaidTarget, 'name' | 'category' | 'match' | 'zone'>[]
  quests: readonly Pick<QuestEntry, 'name' | 'rewards' | 'requiredItems'>[]
  sky: readonly Pick<PoskyQuest, 'name' | 'reward' | 'items'>[]
  /** drop-list pages that are not items: group name to its items */
  groups: Readonly<Record<string, readonly string[]>>
}

/** What one catalog page states about its camp. */
function campFacts(mob: MobEntry, respawn: number | undefined, groups: SupplyData['groups']): CampFacts {
  const facts: CampFacts = {}
  if (respawn !== undefined) facts.respawn = respawn
  const grouped = (mob.commonDrops ?? []).reduce((n, g) => n + (groups[g]?.length ?? 0), 0)
  if ((mob.drops?.length ?? 0) + grouped > 0) facts.loot = (mob.drops?.length ?? 0) + grouped
  // A point with no stated share is a spawn point all the same: it counts whole.
  if (mob.loc !== undefined && mob.loc.length > 0) facts.up = mob.loc.reduce((n, l) => n + (l.pct ?? 100) / 100, 0)
  return facts
}

/** A Plane of Sky test's part: a named dropper is an island's raid target, and the page abbreviates it. */
function skyPart(item: PoskyQuest['items'][number], sources: SourceIndex): RewardPart {
  const listed = sources.get(sourceItemKey(item.name)) ?? []
  const boss = listed.length === 0 && item.who.length > 0 && !/random drop/i.test(item.who[0] ?? '')
  return { name: item.name, count: Math.max(1, item.count), sources: listed, ...(boss ? { boss: true } : {}) }
}

function rewardIndex(data: SupplyData, sources: SourceIndex): Map<string, RewardRoad[]> {
  const out = new Map<string, RewardRoad[]>()
  const add = (reward: string, road: RewardRoad): void => {
    const key = sourceItemKey(reward)
    if (key === '') return
    const list = out.get(key) ?? []
    if (!list.some((r) => r.quest === road.quest)) out.set(key, [...list, road])
  }
  for (const q of data.quests) {
    if (q.rewards === undefined || q.rewards.length === 0) continue
    const parts = (q.requiredItems ?? []).map((name) => ({ name, count: 1, sources: sources.get(sourceItemKey(name)) ?? [] }))
    for (const r of q.rewards) add(r.name, { quest: q.name, parts })
  }
  for (const q of data.sky) {
    if (q.reward !== undefined) add(q.reward, { quest: q.name, parts: q.items.map((i) => skyPart(i, sources)) })
  }
  return out
}

/** The lookups over one set of files. A camp is found by its page, then by its name. */
export function supplyContextOf(data: SupplyData, sources: SourceIndex): SupplyContext {
  const respawnByPage = new Map<string, number>()
  const respawnByName = new Map<string, number>()
  for (const r of data.respawns) {
    if (r.seconds === undefined) continue
    respawnByPage.set(r.page, r.seconds)
    respawnByName.set(mobKey(r.key), r.seconds)
  }
  const byPage = new Map<string, CampFacts>()
  const byName = new Map<string, CampFacts>()
  for (const mob of data.mobs) {
    const facts = campFacts(mob, respawnByPage.get(mob.page) ?? respawnByName.get(mobKey(mob.name)), data.groups)
    byPage.set(mob.page, facts)
    if (!byName.has(mobKey(mob.name))) byName.set(mobKey(mob.name), facts)
  }
  const rewards = rewardIndex(data, sources)
  const none: readonly RewardRoad[] = []
  return {
    camp: (source: ItemSource) => (source.mobPage === undefined ? undefined : byPage.get(source.mobPage)) ?? byName.get(mobKey(source.mob)) ?? {},
    raid: raidFactsOf(data.targets),
    rewards: (itemKey) => rewards.get(itemKey) ?? none
  }
}
