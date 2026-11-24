// planner/itemSupply.ts — how fast copies of an item come in, as item experience a week of play.
//
// The void mote ranking's scarcity half (owner, 2026-11-19; plans/2026-11-19-void-mote-ranking.md).
// Every stated road to a copy is priced the same way and the roads ADD, so one number answers the
// owner's six factors: kills a week (respawn, spawn share, lockout or raid runs) x the chance a kill
// drops it x what a copy is worth (+4 from a drop, +0 from a quest) / how hard the mob is.
//
// AN ESTIMATE, AND IT SAYS SO: the catalog states no drop rates, so the chance is the mob's loot
// list against the gear a kill of its class drops (measured on the owner's logs, MEASURED.md).
// What a page does not state is assumed at a named default and listed in `assumed`.
//
// PURE, relative value imports (the shared/planner house rule).

import { sourceItemKey, type ItemSource } from '../itemSources'
import type { RaidTarget } from '../types'
import { statedLevel } from './zoneLevels'

// ---- the raid roster ----------------------------------------------------------------------------

/** The raid roster as two lookups: the targets' names, and the zones the roster files whole. */
export interface RaidFacts {
  mobs: ReadonlySet<string>
  zones: ReadonlySet<string>
}

/** A mob name with case, a leading article and a page's trailing `(God)` folded (the roster's `match` names carry none). */
export function mobKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/^(?:an?|the) /, '')
}

/** A zone name down to its place: the roster's `Plane of Sky <dash> Island 1` and a page's `The Plane of Sky` are one zone. */
export function zoneKey(zone: string): string {
  return (zone.split(/\s+[—-]\s+/)[0] ?? '').trim().toLowerCase().replace(/^the /, '')
}

/**
 * The roster's lookups. A zone is a raid zone only when the roster names a CATEGORY after it (the
 * planes): an open-world dragon's lair is an ordinary dungeon with one raid target in it.
 */
export function raidFactsOf(targets: readonly Pick<RaidTarget, 'name' | 'category' | 'match' | 'zone'>[]): RaidFacts {
  const mobs = new Set<string>()
  const zones = new Set<string>()
  for (const target of targets) {
    for (const name of [target.name, ...target.match]) mobs.add(mobKey(name))
    if (target.zone !== undefined && zoneKey(target.zone) === zoneKey(target.category)) zones.add(zoneKey(target.zone))
  }
  return { mobs, zones }
}

// ---- the numbers --------------------------------------------------------------------------------

/**
 * Every constant of the estimate, in one table (the plan doc gives each one's measurement).
 * Changing a number here changes the ranking; nothing else holds a copy.
 */
export const SUPPLY = {
  /** hours of farming a week a lockout is weighed against; the ranking is insensitive from 5 to 35 */
  hoursPerWeek: 20,
  /** what one copy adds: a drop is farmed at +4 (16), a quest reward or a crafted item is +0 (1) */
  dropCopyExp: 16,
  madeCopyExp: 1,
  /** gear a kill drops, by the mob's class (owner's logs at +4: 1.83, 0.99, 0.39) */
  dropsPerKill: { raid: 2, named: 1, common: 0.4 },
  /** a loot list's size when the page states none (the measured medians) */
  lootDefault: { raid: 14, named: 2, common: 7 },
  /** seconds, when no respawn is stated (the owner's dungeon camps run 530 to 570 s) */
  respawnDefault: 600,
  /** standing spawns of a common mob whose page lists no spawn points */
  commonPoints: 4,
  /** no camp yields more kills an hour of one name than this */
  killsPerHourCap: 30,
  /** a personal instance has every spawn up, one new instance an hour (2 charges, 1 an hour) */
  instancesPerHour: 1,
  /** a raid target's full loot is once a week per difficulty; the +4 copy is the Refined kill */
  raidKillsPerWeek: 1,
  /**
   * Kills a week AFTER the week's first, of a `RERUN_BOSSES` boss or for a `RERUN_FAVOURS` item:
   * up to once a day, so six (tester Malkil, 2026-11-23: "raids can be run once a day"). The
   * CEILING, as `raidRunsPerWeek` is: the owner killed Innoruuk and Cazic-Thule a second time at D4
   * the next day in 3 of 11 weeks, never a third (owner's logs to 2026-11-23).
   */
  lockoutRerunsPerWeek: 6,
  /**
   * Items such a later kill gives from its own table (wiki: "inside the lockout a kill still gives
   * one drop"; Malkil: "only a single item on subsequent runs"). The owner's later D4 kills of
   * Cazic-Thule gave 1, 2 and 0 of its table's items; Innoruuk's gave one beside the Eye of
   * Innoruuk and the Shattered Emerald that every kill gives.
   */
  lockoutRerunDrops: 1,
  /** a stated respawn this long (seconds) is a raid-style target: weekly, like the roster's */
  raidRespawn: 86_400,
  /**
   * Runs a week a raid zone's other mobs CAN be killed in (owner's factor 3: how often it can be
   * started), the ceiling a camp's kills are counted at too: the week's 20 hours over a 75 minute
   * clear. A plane's instance is re-made about hourly (a second Refined Hate 67 to 92 minutes after
   * the first, four days); the owner's habit was 2 runs a week. A raid target stays at its lockout.
   */
  raidRunsPerWeek: 16,
  /** spawn points of a raid zone's mob whose page lists none */
  raidZonePoints: 6,
  /** a quest part or a quest with no listed source: how many an hour is assumed */
  partsPerHour: 2,
  craftedPerHour: 4,
  /** the player level cap: a mob above it is harder by `levelStep` a level */
  levelCap: 50,
  /** how much slower a hard mob is farmed: divisors on its road */
  hard: { raid: 2, group: 1.5, levelStep: 0.2, mechanics: 2 }
} as const

/** Mobs whose fight has a mechanic that slows farming, hand-kept (owner, 2026-11-19: "Lord Rick"). */
export const MECHANIC_MOBS: ReadonlySet<string> = new Set(['lord rikantus everling'])

/**
 * The raid bosses whose later kills in a lockout week still drop one item from their table, up to
 * daily (`SUPPLY.lockoutRerunsPerWeek`): the five the tester named (Malkil, 2026-11-23), by
 * `mobKey`. Every other raid target keeps its one weekly kill.
 */
export const RERUN_BOSSES: ReadonlySet<string> = new Set(['lord nagafen', 'lady vox', 'cazic thule', 'innoruuk', 'master yael'])

/** An item a raid mob's later kills in the week give at a rate of their own, not 1 in the table. */
export interface RerunFavour {
  /** the item, by `sourceItemKey` */
  item: string
  /** the mobs, by `mobKey` */
  mobs: readonly string[]
  /** the chance a later kill gives it */
  chance: number
}

/**
 * Slime Blood from the Plane of Fear's minibosses after the week's first run (Malkil, 2026-11-23:
 * "an increased chance to drop from minibosses in Fear on subsequent runs"). MEASURED, not only his
 * word: the owner's D4 later-week kills of Dread, Fright and Terror (Oct 15, 21 and 29) gave it 8
 * times in 9; their week-first D4 kills gave it once in 15 (the owner's own loot lines; the
 * group's other loot is not in the log). Nine kills is a small count.
 */
export const RERUN_FAVOURS: readonly RerunFavour[] = [{ item: 'slime blood of cazic-thule', mobs: ['dread', 'fright', 'terror'], chance: 8 / 9 }]

// ---- the shapes ---------------------------------------------------------------------------------

/** How copies are come by: the road that yields the most. */
export type SupplyKind = 'raid' | 'raidZone' | 'camp' | 'quest' | 'crafted' | 'unknown'

/** A fact the data did not state, taken at its `SUPPLY` default. */
export type SupplyGap = 'respawn' | 'loot' | 'spawn' | 'source'

/** Why a road is slower than its kill count says. */
export type SupplyHard = 'raid' | 'group' | 'level' | 'mechanics'

/** One item's supply, as a gear row carries it. */
export interface ItemSupply {
  kind: SupplyKind
  /** the leading road's mob or quest */
  from?: string
  /** item experience a week of play earns over every stated road; absent when no road is stated */
  perWeek?: number
  /** how many roads were counted */
  roads: number
  /** the leading road's chance a kill drops it, and its kills a week */
  chance?: number
  kills?: number
  /** the leading road's chance a LATER kill in a raid's lockout week drops it, when such kills count */
  rerun?: number
  /** the leading road's stated respawn, seconds */
  respawn?: number
  assumed?: SupplyGap[]
  hard?: SupplyHard[]
}

/** What the catalog states about one camp; each absent field is assumed, never invented as stated. */
export interface CampFacts {
  /** seconds */
  respawn?: number
  /** items on its loot list, its drop groups counted */
  loot?: number
  /** how many stand at once: its spawn points' shares summed (five points at 16% are 0.8) */
  up?: number
}

/** One thing a quest asks for. `boss` marks a part only a raid target drops (the Plane of Sky tests). */
export interface RewardPart {
  name: string
  count: number
  sources: readonly ItemSource[]
  boss?: boolean
}

/** A quest that hands the item out. */
export interface RewardRoad {
  quest: string
  parts: readonly RewardPart[]
}

export interface SupplyContext {
  camp: (source: ItemSource) => CampFacts
  raid: RaidFacts
  rewards: (itemKey: string) => readonly RewardRoad[]
}

// ---- one road -----------------------------------------------------------------------------------

interface Road {
  kind: SupplyKind
  from: string
  /** copies (or parts) a week */
  perWeek: number
  chance?: number
  kills?: number
  rerun?: number
  respawn?: number
  assumed: SupplyGap[]
  hard: SupplyHard[]
}

/** The chance one later kill in the lockout week gives this item: favoured, one of the five's, or none. */
function rerunChance(itemKey: string, mob: string, loot: number): number {
  const key = mobKey(mob)
  const favoured = RERUN_FAVOURS.find((f) => f.item === itemKey && f.mobs.includes(key))
  if (favoured !== undefined) return favoured.chance
  return RERUN_BOSSES.has(key) ? Math.min(1, SUPPLY.lockoutRerunDrops / Math.max(1, loot)) : 0
}

/**
 * Each mob once. The catalog and an item page can name one mob two ways (`Cazic Thule` and
 * `Cazic Thule (God)`: Shield of Rainbow Hues was counted twice), and the first, the catalog's, is kept.
 */
function distinctMobs(sources: readonly ItemSource[]): ItemSource[] {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const key = mobKey(s.mob)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A proper name with no article: the catalog writes a named mob that way (`Cauldronbubble`). */
function isNamed(mob: string): boolean {
  return /^[A-Z]/.test(mob.trim()) && !/^(?:An?|The) /.test(mob.trim())
}

/** Kills an hour at an ordinary camp: its standing spawns over its respawn, or a fresh instance. */
function campKillsPerHour(respawn: number, up: number): number {
  const cycle = (up * 3600) / respawn
  const instance = respawn > 3600 ? Math.min(1, up) * SUPPLY.instancesPerHour : 0
  return Math.min(SUPPLY.killsPerHourCap, Math.max(cycle, instance))
}

/** How much slower this mob is farmed than its kill count says, and why. */
function hardness(source: ItemSource, cls: MobClass, inRaidZone: boolean): { by: number; why: SupplyHard[] } {
  const why: SupplyHard[] = []
  let by = 1
  if (cls === 'raid') {
    by *= SUPPLY.hard.raid
    why.push('raid')
  } else if (inRaidZone) {
    by *= SUPPLY.hard.group
    why.push('group')
  }
  // A raid target's level, or a raid zone's, is part of being one: it is not counted twice.
  const level = why.length > 0 ? null : statedLevel(source.levelText)
  if (level !== null && level > SUPPLY.levelCap) {
    by *= 1 + (level - SUPPLY.levelCap) * SUPPLY.hard.levelStep
    why.push('level')
  }
  if (MECHANIC_MOBS.has(mobKey(source.mob))) {
    by *= SUPPLY.hard.mechanics
    why.push('mechanics')
  }
  return { by, why }
}

type MobClass = 'raid' | 'named' | 'common'

/** Kills a week of a mob that is no raid target, and what had to be assumed to count them. */
function killsPerWeek(facts: CampFacts, cls: MobClass, inRaidZone: boolean): { kills: number; assumed: SupplyGap[] } {
  const assumed: SupplyGap[] = []
  if (facts.up === undefined && cls === 'common') assumed.push('spawn')
  // A raid zone's mobs die once a run; a camp's die as often as they come back.
  if (inRaidZone) return { kills: SUPPLY.raidRunsPerWeek * (facts.up ?? (cls === 'common' ? SUPPLY.raidZonePoints : 1)), assumed }
  if (facts.respawn === undefined) assumed.unshift('respawn')
  const up = facts.up ?? (cls === 'common' ? SUPPLY.commonPoints : 1)
  return { kills: SUPPLY.hoursPerWeek * campKillsPerHour(facts.respawn ?? SUPPLY.respawnDefault, up), assumed }
}

/** A mob's week: its kills, the copies they drop, what had to be assumed, and a later kill's chance. */
interface Week {
  kills: number
  copies: number
  assumed: SupplyGap[]
  rerun?: number
}

/**
 * A raid target's week: the full-loot first kill, plus, for one of the five bosses or a favoured
 * item, the later kills up to daily (`rerunChance`); the copies are the sum of both.
 */
function raidWeek(itemKey: string, mob: string, loot: number, chance: number): Week {
  const rerun = rerunChance(itemKey, mob, loot)
  const reruns = rerun > 0 ? SUPPLY.lockoutRerunsPerWeek : 0
  const week: Week = { kills: SUPPLY.raidKillsPerWeek + reruns, copies: chance * SUPPLY.raidKillsPerWeek + rerun * reruns, assumed: [] }
  if (reruns > 0) week.rerun = rerun
  return week
}

/** What kind of mob this is: a raid target (by the roster or a day-long respawn), named or common, and whether it stands in a raid zone. */
function mobClassOf(source: ItemSource, facts: CampFacts, ctx: SupplyContext): { raid: boolean; inRaidZone: boolean; cls: MobClass } {
  const raid = ctx.raid.mobs.has(mobKey(source.mob)) || (facts.respawn ?? 0) >= SUPPLY.raidRespawn
  const inRaidZone = source.zones.length > 0 && source.zones.every((z) => ctx.raid.zones.has(zoneKey(z)))
  return { raid, inRaidZone, cls: raid ? 'raid' : isNamed(source.mob) ? 'named' : 'common' }
}

/** One mob that drops the thing (`itemKey`): how many it yields a week of play. */
function dropRoad(source: ItemSource, ctx: SupplyContext, itemKey: string): Road {
  const facts = ctx.camp(source)
  const { raid, inRaidZone, cls } = mobClassOf(source, facts, ctx)
  const loot = facts.loot ?? SUPPLY.lootDefault[cls]
  const chance = Math.min(1, SUPPLY.dropsPerKill[cls] / Math.max(1, loot))
  const camp = (): Week => {
    const counted = killsPerWeek(facts, cls, inRaidZone)
    return { ...counted, copies: chance * counted.kills }
  }
  const week = raid ? raidWeek(itemKey, source.mob, loot, chance) : camp()
  const assumed: SupplyGap[] = facts.loot === undefined ? ['loot', ...week.assumed] : week.assumed
  const { by, why } = hardness(source, cls, inRaidZone)
  const kind: SupplyKind = raid ? 'raid' : inRaidZone ? 'raidZone' : 'camp'
  const road: Road = { kind, from: source.mob, perWeek: week.copies / by, chance, kills: week.kills, assumed, hard: why }
  if (week.rerun !== undefined) road.rerun = week.rerun
  if (facts.respawn !== undefined && kind === 'camp') road.respawn = facts.respawn
  return road
}

/** One part of a quest: every mob that drops it, added; a raid target's part is its weekly kill. */
function partPerWeek(part: RewardPart, ctx: SupplyContext): { perWeek: number; assumed: SupplyGap[]; hard: SupplyHard[] } {
  if (part.boss === true) {
    const chance = SUPPLY.dropsPerKill.raid / SUPPLY.lootDefault.raid
    return { perWeek: (chance * SUPPLY.raidKillsPerWeek) / SUPPLY.hard.raid / part.count, assumed: ['loot'], hard: ['raid'] }
  }
  if (part.sources.length === 0) return { perWeek: (SUPPLY.partsPerHour * SUPPLY.hoursPerWeek) / part.count, assumed: ['source'], hard: [] }
  const roads = distinctMobs(part.sources).map((s) => dropRoad(s, ctx, sourceItemKey(part.name)))
  const lead = roads.reduce((a, b) => (b.perWeek > a.perWeek ? b : a))
  return { perWeek: roads.reduce((sum, r) => sum + r.perWeek, 0) / part.count, assumed: lead.assumed, hard: lead.hard }
}

/** A quest that rewards the item: as fast as its slowest part, and each copy arrives at +0. */
function rewardRoad(reward: RewardRoad, ctx: SupplyContext): Road {
  if (reward.parts.length === 0) {
    return { kind: 'quest', from: reward.quest, perWeek: SUPPLY.partsPerHour * SUPPLY.hoursPerWeek, assumed: ['source'], hard: [] }
  }
  const parts = reward.parts.map((p) => partPerWeek(p, ctx))
  const slowest = parts.reduce((a, b) => (b.perWeek < a.perWeek ? b : a))
  return { kind: 'quest', from: reward.quest, perWeek: slowest.perWeek, assumed: slowest.assumed, hard: slowest.hard }
}

// ---- the item -----------------------------------------------------------------------------------

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** What a road's copies are worth: a drop is farmed at +4, a quest reward or a combine is +0. */
function copyExp(kind: SupplyKind): number {
  return kind === 'quest' || kind === 'crafted' ? SUPPLY.madeCopyExp : SUPPLY.dropCopyExp
}

export interface SupplyItem {
  key: string
  playerCrafted: boolean
}

/**
 * An item's supply: every mob that drops it and every quest that rewards it, added as experience a
 * week. No stated road at all leaves `perWeek` absent: the data says nothing, so nothing is claimed.
 */
export function itemSupply(item: SupplyItem, sources: readonly ItemSource[], ctx: SupplyContext): ItemSupply {
  const roads = [...distinctMobs(sources).map((s) => dropRoad(s, ctx, item.key)), ...ctx.rewards(item.key).map((r) => rewardRoad(r, ctx))]
  if (roads.length === 0 && item.playerCrafted) {
    roads.push({ kind: 'crafted', from: '', perWeek: SUPPLY.craftedPerHour * SUPPLY.hoursPerWeek, assumed: ['source'], hard: [] })
  }
  if (roads.length === 0) return { kind: 'unknown', roads: 0, assumed: ['source'] }
  const exp = (r: Road): number => r.perWeek * copyExp(r.kind)
  const lead = roads.reduce((a, b) => (exp(b) > exp(a) ? b : a))
  const out: ItemSupply = { kind: lead.kind, perWeek: round3(roads.reduce((sum, r) => sum + exp(r), 0)), roads: roads.length }
  if (lead.from !== '') out.from = lead.from
  if (lead.chance !== undefined) out.chance = round3(lead.chance)
  if (lead.kills !== undefined) out.kills = round3(lead.kills)
  if (lead.rerun !== undefined) out.rerun = round3(lead.rerun)
  if (lead.respawn !== undefined) out.respawn = lead.respawn
  if (lead.assumed.length > 0) out.assumed = lead.assumed
  if (lead.hard.length > 0) out.hard = lead.hard
  return out
}
