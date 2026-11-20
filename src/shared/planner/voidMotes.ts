// planner/voidMotes.ts — where a void mote (Void-Touched Potential) is best spent on worn gear.
//
// The game's rule (wiki Mote Guide; Patch Notes 07-28): one lifts an item a full tier whatever
// progress it has banked, at most three are earned a week, and only three can be held. Without one,
// tier T+1 costs 2^T item experience, by copies of the item or by ordinary motes.
//
// WHAT IS RANKED (owner, 2026-11-19; plans/2026-11-19-void-mote-ranking.md): the stat gain times the
// HOURS OF PLAY the mote saves. The hours are the tier's experience over what two roads bring in
// together: copies (`itemSupply.ts`: respawn, spawn share, lockout, drop chance, +4 or +0 copies,
// how hard the mob is) and a share of the ordinary motes (measured on the owner's logs,
// `MOTE_RULES.moteExpPerHour`). Below +7 ordinary motes are quick, so a row there is "not yet"
// unless copies barely exist.
//
// AN ESTIMATE: every number that makes it one is in `MOTE_RULES` and `itemSupply.SUPPLY`, and each
// row states its hours, its road and its source, so a player can overrule it by eye.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import { EXALTATION_SLOT_TYPES, ITEM_MAX_TIER, expToNextTier } from '../itemStats'
import { upgradeStateForTier } from '../itemUpgrade'
import { GEAR_STAT_KEYS, isGearStatKey, type GearRow, type GearStatKey, type GearStats } from './gear'
import { scaleGearStats } from './gearScale'
import type { PlannerInventoryHost } from './inventorySlots'
import { SUPPLY, type ItemSupply } from './itemSupply'
import { roleValuer, type GearRole } from './roleWeights'
import { procSeatSwings } from './rules'
import { equipSlotOf, type EquipSlot, type PlanSlotId } from './types'

/** The rules of the ranking, in one table (the plan doc gives each one's reason). */
export const MOTE_RULES = {
  /** how many the game hands out a week, and lets you hold */
  perWeek: 3,
  /** below this tier a mote is not recommended (owner: "almost never below +7") */
  minTier: 7,
  /** the exception's floor: +5 or +6 when copies barely exist (the Plane of Sky test rewards) */
  rareMinTier: 5,
  /** "barely exist": copies bring at most this much item experience a week of play */
  rarePerWeek: 0.5,
  /**
   * Item experience an hour of level-50 Refined play earns in ordinary motes usable at each tier
   * (index = the tier worn), lower grades condensed two to one (owner's logs: 70.8 h, 5,093 kills).
   * Below +4 was not measured and takes +4's figure; nothing below +5 is ever recommended.
   */
  moteExpPerHour: [18.6, 18.6, 18.6, 18.6, 18.6, 12.5, 7.8, 4.55, 2.6, 1.45],
  /**
   * The share of those motes counted toward ONE item: a character wears about twenty pieces and has
   * spells to raise, and every one draws on the same motes. A judgment. At 0.5 the motes swamp the
   * copies and the tier alone orders every scarce item, whatever it drops from (the first cut:
   * Hate's trash armour at +9 led every raid boss's drop, where the owner spent none on it).
   */
  moteShare: 0.05
} as const

/** How many the game hands out a week (and lets you hold): the size of the week's plan. */
export const VOID_MOTES_PER_WEEK = MOTE_RULES.perWeek

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

/** The road that would otherwise bring in most of the next tier. */
export type MoteRoad = 'copies' | 'motes'

/**
 * Whether a mote belongs on the row yet: `pick` at +7 or higher, `rare` at +5 or +6 when copies
 * barely exist, `early` otherwise (ordinary motes are the cheaper road there).
 */
export type MoteGate = 'pick' | 'rare' | 'early'

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
  /** how copies are come by; absent when no page states a road */
  supply?: ItemSupply
  /** hours of play the next tier costs without the mote, by copies and ordinary motes together */
  hours: number
  road: MoteRoad
  gate: MoteGate
  /**
   * the exaltation socket the next tier opens (`Worn`), when it opens one. A Proc socket is named
   * only on a weapon-hand cell (`procSeatSwings`): the Exaltations tab offers no proc elsewhere
   */
  opens?: string
  /** `gain x hours`; 0 when the target gains nothing */
  score: number
}

export interface MoteOptions {
  target: MoteTarget
  /** the class picks, for the role model's class gate; empty gates nothing */
  classes: readonly ClassAbbr[]
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

/**
 * The worn items below +10 that `wornRows` leaves out because the item data has no row for them:
 * the tab names them, so a skipped piece is not read as one a mote is wasted on. Item data with
 * nothing in it is unread, not a verdict on every item, and lists none.
 */
export function moteUnranked(hosts: readonly PlannerInventoryHost[], byKey: ReadonlyMap<string, GearRow>): PlannerInventoryHost[] {
  if (byKey.size === 0) return []
  return hosts.filter((host) => !byKey.has(host.key) && (host.tier ?? 0) < ITEM_MAX_TIER)
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

/**
 * The hours of play a tier costs without a void mote, and the road they are spent on. Copies count
 * only when a page states a road (`perWeek` present): no stated road is not evidence of an easy one.
 */
export function moteHours(tier: number, supply: ItemSupply | undefined): { hours: number; road: MoteRoad } {
  const exp = expToNextTier(tier) ?? 0
  const byMotes = (MOTE_RULES.moteExpPerHour[tier] ?? 0) * MOTE_RULES.moteShare
  const byCopies = (supply?.perWeek ?? 0) / SUPPLY.hoursPerWeek
  const rate = byCopies + byMotes
  return { hours: rate > 0 ? Math.round((exp / rate) * 10) / 10 : 0, road: byCopies > byMotes ? 'copies' : 'motes' }
}

/** Does a mote belong on an item at this tier yet? (`MoteGate`.) */
export function moteGate(tier: number, supply: ItemSupply | undefined): MoteGate {
  if (tier >= MOTE_RULES.minTier) return 'pick'
  const rare = supply?.perWeek !== undefined && supply.perWeek <= MOTE_RULES.rarePerWeek
  return tier >= MOTE_RULES.rareMinTier && rare ? 'rare' : 'early'
}

/**
 * One row per worn item below +10: what the next tier gains the target, the hours of play it would
 * otherwise cost, and whether a mote belongs there yet. Unsorted (`sortMoteAdvice`).
 *
 * Every tier is read at NO banked progress, because the dump states `+N` and stops: `hours` is the
 * most a mote can save, never a promise.
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
    const { hours, road } = moteHours(w.tier, w.row.supply)
    const advice: MoteAdvice = {
      cell: w.host.slot,
      key: w.row.key,
      name: w.row.name,
      tier: w.tier,
      gain: round3(gain),
      changes: changesOf(w.now, next),
      copies: expToNextTier(w.tier) ?? 0,
      hours,
      road,
      gate: moteGate(w.tier, w.row.supply),
      score: gain > 0 ? round3(gain * hours) : 0
    }
    if (w.row.supply !== undefined) advice.supply = w.row.supply
    const opens = EXALTATION_SLOT_TYPES.find((s) => s.unlocksAt === w.tier + 1)
    // The CELL decides, not `wornSlot`: an off-hand item in an any-cell is in no hand.
    const live = opens !== undefined && (opens.type !== 'Proc' || procSeatSwings(equipSlotOf(w.host.slot)))
    if (live) advice.opens = opens.type
    return advice
  })
}

// ---- the order ----------------------------------------------------------------------------------

/** What the list is ranked by: gain times hours, the gain alone, or the hours alone. */
export type MoteOrder = 'recommended' | 'gain' | 'effort'

export const MOTE_ORDERS: readonly MoteOrder[] = ['recommended', 'gain', 'effort']

const ORDER_KEY: Record<MoteOrder, (a: MoteAdvice) => number> = {
  recommended: (a) => a.score,
  gain: (a) => a.gain,
  effort: (a) => a.hours
}

/** A row a mote may go on now: it gains the target something and its tier is not too early. */
export function isMoteReady(a: Pick<MoteAdvice, 'gain' | 'gate'>): boolean {
  return a.gain > 0 && a.gate !== 'early'
}

/**
 * Best first. A row whose target gains nothing sinks in EVERY order, and in the recommended order
 * a "not yet" row sits below every row a mote may go on. Ties fall to the blend, then the gain,
 * then the name, so the order is total.
 */
export function sortMoteAdvice(list: readonly MoteAdvice[], order: MoteOrder): MoteAdvice[] {
  const key = ORDER_KEY[order]
  const ready = (a: MoteAdvice): number => (order === 'recommended' ? Number(isMoteReady(a)) : 0)
  return [...list].sort(
    (a, b) =>
      Number(b.gain > 0) - Number(a.gain > 0) ||
      ready(b) - ready(a) ||
      key(b) - key(a) ||
      b.score - a.score ||
      b.gain - a.gain ||
      a.name.localeCompare(b.name)
  )
}

// ---- the week's plan ----------------------------------------------------------------------------

/** One of the week's motes: the item it goes on and the tier it lifts it from. */
export interface MotePlanStep {
  cell: PlanSlotId
  key: string
  name: string
  tier: number
}

/**
 * Where the week's motes go, one at a time: the best row a mote may go on, then the list again
 * with that item one tier higher. So two or three can land on one item (the last tiers cost the
 * most), which is how the owner has spent them. A "not yet" row never takes one: when the ready
 * rows run out the plan is short, and the rest are held (owner: almost never below +7).
 */
export function motePlan(
  hosts: readonly PlannerInventoryHost[],
  byKey: ReadonlyMap<string, GearRow>,
  opts: MoteOptions,
  motes: number = MOTE_RULES.perWeek
): MotePlanStep[] {
  const steps: MotePlanStep[] = []
  let worn = [...hosts]
  for (let n = 0; n < motes; n++) {
    const list = sortMoteAdvice(moteAdvice(worn, byKey, opts), 'recommended')
    const best = list[0]
    if (best === undefined || !isMoteReady(best)) break
    steps.push({ cell: best.cell, key: best.key, name: best.name, tier: best.tier })
    worn = worn.map((h) => (h.slot === best.cell ? { ...h, tier: best.tier + 1 } : h))
  }
  return steps
}

/** The plan as one line per item: the tier it starts at and how many motes it takes. */
export function planByItem(plan: readonly MotePlanStep[]): { name: string; from: number; motes: number }[] {
  const out = new Map<PlanSlotId, { name: string; from: number; motes: number }>()
  for (const s of plan) {
    const at = out.get(s.cell)
    if (at === undefined) out.set(s.cell, { name: s.name, from: s.tier, motes: 1 })
    else at.motes++
  }
  return [...out.values()]
}

/** How many of the plan's motes land on this cell. */
export function planMotesOn(plan: readonly MotePlanStep[], cell: PlanSlotId): number {
  return plan.filter((s) => s.cell === cell).length
}
