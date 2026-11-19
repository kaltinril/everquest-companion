// planner/voidMotes.ts — where a void mote (Void-Touched Potential) is best spent on worn gear.
//
// The game's rule (wiki Mote Guide; Patch Notes 07-28): one lifts an item a full tier whatever
// progress it has banked, and at most three are earned a week, from raids. Without one, tier T+1
// costs 2^T base copies of the item (`expToNextTier`), so a mote is worth most where the next tier
// is dearest: a high tier, on an item whose copies are hard to come by.
//
// HEURISTIC, and the three numbers that make it one are named constants below. What it ranks is
// stated per row (gain, copies skipped, source), so a player can overrule it by eye.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import { EXALTATION_SLOT_TYPES, ITEM_MAX_TIER, expToNextTier } from '../itemStats'
import { upgradeStateForTier } from '../itemUpgrade'
import type { RaidTarget } from '../types'
import { GEAR_STAT_KEYS, isGearStatKey, type GearRow, type GearStatKey, type GearStats } from './gear'
import { scaleGearStats } from './gearScale'
import type { PlannerInventoryHost } from './inventorySlots'
import { roleValuer, type GearRole } from './roleWeights'
import { equipSlotOf, type EquipSlot, type PlanSlotId } from './types'
import { statedLevel } from './zoneLevels'

/** How many the game hands out a week (and lets you hold): the size of the pick list. */
export const VOID_MOTES_PER_WEEK = 3

// ---- where copies come from ---------------------------------------------------------------------

/** How a second copy of an item is come by, easiest road first when a page states several. */
export type MoteSource = 'raid' | 'quest' | 'high' | 'crafted' | 'farm' | 'unknown'

/** A drop counts as high level when its easiest camp states at least this (the cap is 50). */
export const MOTE_HIGH_LEVEL = 45

/**
 * How much dearer one copy is by source, in DOUBLINGS (a tier is one doubling of copies, so the two
 * add). The order is the owner's: raid over quests and high-level camps, those over farmable drops.
 * `unknown` claims nothing: a page that states no source is not evidence the item is hard to get.
 */
export const MOTE_SOURCE_STEPS: Readonly<Record<MoteSource, number>> = {
  raid: 3,
  quest: 2,
  high: 2,
  crafted: 1,
  farm: 0,
  unknown: 0
}

export const MOTE_SOURCE_LABEL: Readonly<Record<MoteSource, string>> = {
  raid: 'Raid',
  quest: 'Quest',
  high: 'High level',
  crafted: 'Crafted',
  farm: 'Farmable',
  unknown: 'Not listed'
}

/** The raid roster as two lookups: the targets' names, and the zones the roster files whole. */
export interface RaidFacts {
  mobs: ReadonlySet<string>
  zones: ReadonlySet<string>
}

/** A mob name with case and a leading article folded (the roster's `match` names carry none). */
function mobKey(name: string): string {
  return name.trim().toLowerCase().replace(/^(?:an?|the) /, '')
}

/** A zone name down to its place: the roster's `Plane of Sky <dash> Island 1` and a page's `The Plane of Sky` are one zone. */
function zoneKey(zone: string): string {
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

export interface MoteSourceInfo {
  source: MoteSource
  /** the camp the verdict rests on, as the page names it (with its stated level), when there is one */
  from?: string
}

type Sourced = Pick<GearRow, 'dropMobs' | 'dropLevels' | 'dropZones' | 'quest' | 'playerCrafted'>

/** The easiest non-raid camp a row names: the lowest stated level, and an unstated level is lowest. */
function easiestCamp(row: Sourced, raid: RaidFacts): { mob: string; level: number | null; text: string } | null {
  let best: { mob: string; level: number | null; text: string } | null = null
  const mobs = row.dropMobs ?? []
  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i] ?? ''
    if (raid.mobs.has(mobKey(mob))) continue
    const text = row.dropLevels?.[i] ?? ''
    const level = statedLevel(text)
    if (best === null || (level ?? -1) < (best.level ?? -1)) best = { mob, level, text }
  }
  return best
}

/**
 * Where copies of this item come from. THE EASIEST STATED ROAD WINS: an item a raid target and a
 * dungeon mob both drop is as farmable as the dungeon mob. A camp that states no level is never
 * called high level (absent is not a value).
 */
export function moteSource(row: Sourced, raid: RaidFacts): MoteSourceInfo {
  const mobs = row.dropMobs ?? []
  if (mobs.length === 0) {
    if (row.playerCrafted) return { source: 'crafted' }
    return { source: row.quest ? 'quest' : 'unknown' }
  }
  const zones = row.dropZones ?? []
  const camp = easiestCamp(row, raid)
  if (camp === null || (zones.length > 0 && zones.every((z) => raid.zones.has(zoneKey(z))))) {
    return { source: 'raid', from: mobs[0] }
  }
  const from = camp.text === '' ? camp.mob : `${camp.mob} (${camp.text})`
  return { source: camp.level !== null && camp.level >= MOTE_HIGH_LEVEL ? 'high' : 'farm', from }
}

// ---- the advice ---------------------------------------------------------------------------------

/** What a gain is measured in: one of the role model's focuses, or one stat's own points. */
export type MoteTarget = GearRole | GearStatKey

/** The single stats the picker offers: the ones an upgrade moves and a player gears for by name. */
export const MOTE_TARGET_STATS: readonly GearStatKey[] = [
  'AC',
  'HP',
  'MP',
  'END',
  'STR',
  'STA',
  'AGI',
  'DEX',
  'WIS',
  'INT',
  'CHA',
  'DMG',
  'SV_FIRE',
  'SV_COLD',
  'SV_MAGIC',
  'SV_DISEASE',
  'SV_POISON'
]

/** One stat the next tier moves. `from` is absent when the worn tier states none (the synthetic SV VOID). */
export interface MoteChange {
  key: GearStatKey
  from?: number
  to: number
}

/** One worn item, and what one mote spent on it buys. */
export interface MoteAdvice {
  cell: PlanSlotId
  key: string
  name: string
  /** the tier worn now; a name with no ` +N` is tier 0 */
  tier: number
  /** the target's gain at the next tier: focus points, or the one stat's own points */
  gain: number
  /** every stat the next tier moves, table order */
  changes: MoteChange[]
  /** base copies the next tier costs without the mote (2^tier), at no banked progress */
  copies: number
  source: MoteSource
  from?: string
  /** the exaltation socket the next tier opens (`Proc`), when it opens one */
  opens?: string
  /** `gain x (1 + tier + source steps)`; 0 when the target gains nothing */
  score: number
}

export interface MoteOptions {
  target: MoteTarget
  /** the class picks, for the role model's class gate; empty gates nothing */
  classes: readonly ClassAbbr[]
  raid: RaidFacts
}

interface Worn {
  host: PlannerInventoryHost
  row: GearRow
  tier: number
  now: GearStats
}

/** The worn items the corpus knows and a mote can still lift, each at the tier its name states. */
function wornRows(hosts: readonly PlannerInventoryHost[], byKey: ReadonlyMap<string, GearRow>): Worn[] {
  const out: Worn[] = []
  for (const host of hosts) {
    const row = byKey.get(host.key)
    const tier = host.tier ?? 0
    if (row === undefined || tier >= ITEM_MAX_TIER) continue
    out.push({ host, row, tier, now: scaleGearStats(row.stats, upgradeStateForTier(tier), row.voidSynth === true) })
  }
  return out
}

/** The best haste worn OUTSIDE each item (worn haste does not stack: `roleValue`'s credit rule). */
function hasteOutside(worn: readonly Worn[]): number[] {
  let top = 0
  let second = 0
  for (const w of worn) {
    const haste = w.now.HASTE ?? 0
    if (haste > top) [top, second] = [haste, top]
    else if (haste > second) second = haste
  }
  return worn.map((w) => ((w.now.HASTE ?? 0) === top ? second : top))
}

function changesOf(now: GearStats, next: GearStats): MoteChange[] {
  const out: MoteChange[] = []
  for (const key of GEAR_STAT_KEYS) {
    const to = next[key]
    if (to === undefined || to === now[key]) continue
    out.push(now[key] === undefined ? { key, to } : { key, from: now[key], to })
  }
  return out
}

/** The slot a worn item's weapon block is read in: its cell's, or its own first for an any-cell. */
function wornSlot(w: Worn): EquipSlot | undefined {
  return equipSlotOf(w.host.slot) ?? w.row.slots[0]
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** How dear the next tier is, in doublings: the tier itself plus the source's steps. */
export function moteEffort(a: Pick<MoteAdvice, 'tier' | 'source'>): number {
  return a.tier + MOTE_SOURCE_STEPS[a.source]
}

/**
 * One row per worn item below +10: what the next tier gains the target, what it would cost in
 * copies, and where those copies come from. Unsorted (`sortMoteAdvice`).
 *
 * Every tier is read at NO banked progress, because the dump states `+N` and stops: `copies` is
 * the most a mote can skip, never a promise.
 */
export function moteAdvice(
  hosts: readonly PlannerInventoryHost[],
  byKey: ReadonlyMap<string, GearRow>,
  opts: MoteOptions
): MoteAdvice[] {
  const worn = wornRows(hosts, byKey)
  const outside = hasteOutside(worn)
  const { target } = opts
  const value = isGearStatKey(target) ? null : roleValuer(target, { classes: opts.classes })
  return worn.map((w, i) => {
    const next = scaleGearStats(w.row.stats, upgradeStateForTier(w.tier + 1), w.row.voidSynth === true)
    const at = { slot: wornSlot(w), ownedHaste: outside[i] }
    const gain = value === null ? (next[target as GearStatKey] ?? 0) - (w.now[target as GearStatKey] ?? 0) : value(next, at) - value(w.now, at)
    const { source, from } = moteSource(w.row, opts.raid)
    const advice: MoteAdvice = {
      cell: w.host.slot,
      key: w.row.key,
      name: w.row.name,
      tier: w.tier,
      gain: round3(gain),
      changes: changesOf(w.now, next),
      copies: expToNextTier(w.tier) ?? 0,
      source,
      score: gain > 0 ? round3(gain * (1 + moteEffort({ tier: w.tier, source }))) : 0
    }
    if (from !== undefined) advice.from = from
    const opens = EXALTATION_SLOT_TYPES.find((s) => s.unlocksAt === w.tier + 1)
    if (opens !== undefined) advice.opens = opens.type
    return advice
  })
}

// ---- the order ----------------------------------------------------------------------------------

/** What the list is ranked by: the blend, the gain alone, or how dear the tier is alone. */
export type MoteOrder = 'recommended' | 'gain' | 'effort'

export const MOTE_ORDERS: readonly MoteOrder[] = ['recommended', 'gain', 'effort']

const ORDER_KEY: Record<MoteOrder, (a: MoteAdvice) => number> = {
  recommended: (a) => a.score,
  gain: (a) => a.gain,
  effort: moteEffort
}

/**
 * Best first. A row whose target gains nothing sinks in EVERY order: a mote that buys nothing you
 * asked for is not a pick, however dear its tier. Ties fall to the blend, then the gain, then the
 * name, so the order is total.
 */
export function sortMoteAdvice(list: readonly MoteAdvice[], order: MoteOrder): MoteAdvice[] {
  const key = ORDER_KEY[order]
  return [...list].sort(
    (a, b) =>
      Number(b.gain > 0) - Number(a.gain > 0) ||
      key(b) - key(a) ||
      b.score - a.score ||
      b.gain - a.gain ||
      a.name.localeCompare(b.name)
  )
}

/** Is the row at `index` of a sorted list one of the week's picks? */
export function isMotePick(list: readonly MoteAdvice[], index: number): boolean {
  return index < VOID_MOTES_PER_WEEK && (list[index]?.gain ?? 0) > 0
}
