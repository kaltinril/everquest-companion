// gear/voidMotePrefs.ts — what the Void motes tab remembers, and the words it uses.
//
// PURE AND NODE-TESTED (the `gearPrefs.ts` precedent): relative value imports, no React. Stored
// by `useVoidMotePrefs` (useGearPrefs.ts), validated on every read.

import type { ClassAbbr } from '../../../../shared/classCombo'
import type { GearStatKey } from '../../../../shared/planner/gear'
import type { PlannerInventoryHost } from '../../../../shared/planner/inventorySlots'
import type { ItemSupply, SupplyGap, SupplyKind } from '../../../../shared/planner/itemSupply'
import type { GearRole } from '../../../../shared/planner/roleWeights'
import {
  MOTE_ORDERS,
  MOTE_RULES,
  MOTE_TARGET_STATS,
  planByItem,
  type MoteAdvice,
  type MoteOrder,
  type MotePlanStep,
  type MoteTarget
} from '../../../../shared/planner/voidMotes'
import { classDisplayName } from '../../../../shared/spellLevels'
import { ROLE_LABEL } from '../plan/planBlurb'
import { PLAN_ROLES } from './areaMemory'
import { columnLabel, statText } from './gearColumns'
import { hostText } from './gearCompare'

export interface VoidMotePrefs {
  /** what a gain is measured in: a focus, or one stat */
  target: MoteTarget
  order: MoteOrder
  /**
   * how many void motes the player has to spend now, 0 to 3 (owner, 2026-11-23): the week's plan
   * spends exactly that many. Remembered on this machine, like the other two, not per character:
   * the tab's choices are one `localStorage` key (`useVoidMotePrefs`).
   */
  onHand: number
}

/** The picker's choices: none up to the most the game lets you hold. */
export const MOTES_ON_HAND: readonly number[] = Array.from({ length: MOTE_RULES.perWeek + 1 }, (_, i) => i)

/** The Gear tab's own BEST column is the balanced focus, so it leads; a full week's motes by default. */
export const DEFAULT_MOTE_PREFS: VoidMotePrefs = { target: 'balanced', order: 'recommended', onHand: MOTE_RULES.perWeek }

/** The picker's two groups, in the order it draws them. */
export const MOTE_TARGET_ROLES: readonly GearRole[] = PLAN_ROLES
export const MOTE_TARGETS: readonly MoteTarget[] = [...PLAN_ROLES, ...MOTE_TARGET_STATS]

/**
 * A stored choice; each field falls back alone, so one bad value does not reset the rest. A value
 * from the days the list was a panel on the Gear tab carries `open` too: it is ignored.
 */
export function sanitizeMotePrefs(raw: unknown): VoidMotePrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_MOTE_PREFS
  const o = raw as Record<string, unknown>
  return {
    target: MOTE_TARGETS.find((t) => t === o.target) ?? DEFAULT_MOTE_PREFS.target,
    order: MOTE_ORDERS.find((v) => v === o.order) ?? DEFAULT_MOTE_PREFS.order,
    onHand: MOTES_ON_HAND.find((n) => n === o.onHand) ?? DEFAULT_MOTE_PREFS.onHand
  }
}

export const MOTE_ORDER_LABEL: Record<MoteOrder, string> = {
  recommended: 'Recommended',
  gain: 'Biggest gain',
  effort: 'Most hours saved'
}

/** One clause each (the tooltip diet): what the order ranks by. */
export const MOTE_ORDER_HINT: Record<MoteOrder, string> = {
  recommended: 'Gain times the hours of play the mote saves',
  gain: 'The largest gain for your target, whatever the tier costs',
  effort: 'The tier that would take longest to earn, first'
}

const isRole = (target: MoteTarget): target is GearRole => (PLAN_ROLES as readonly string[]).includes(target)

/** `Tank`, `AC`, `SV FIRE` — a focus by the Plan tab's name, a stat by the table's column name. */
export function moteTargetLabel(target: MoteTarget): string {
  return isRole(target) ? ROLE_LABEL[target] : columnLabel(target)
}

/** The gain cell: a focus score to one decimal, a stat in its own points; blank when nothing is gained. */
export function moteGainText(advice: Pick<MoteAdvice, 'gain'>, target: MoteTarget): string {
  if (advice.gain <= 0) return ''
  return `+${isRole(target) ? advice.gain.toFixed(1) : statText(advice.gain, target)}`
}

/**
 * The Gain header's hover. A focus is scored for the gear area's class pick, which this tab does
 * not show, so the hover names it; one stat's own points do not depend on a class.
 */
export function moteGainHint(target: MoteTarget, classes: readonly ClassAbbr[]): string {
  const base = 'What the next tier adds for your target'
  if (!isRole(target)) return base
  return `${base}, scored for ${classes.length === 0 ? 'every class' : classes.map(classDisplayName).join(', ')}`
}

/** `AC 66→70 · STR 28→30`: every stat the next tier moves; `-` where the worn tier states none. */
export function moteChangesText(advice: Pick<MoteAdvice, 'changes'>): string {
  const one = (key: GearStatKey, from: number | undefined, to: number): string =>
    `${columnLabel(key)} ${from === undefined ? '-' : statText(from, key)}→${statText(to, key)}`
  return advice.changes.map((c) => one(c.key, c.from, c.to)).join(' · ')
}

/** `190 h`, `5.1 h`: the hours of play the mote saves. */
export function moteHoursText(advice: Pick<MoteAdvice, 'hours'>): string {
  return `${advice.hours >= 20 ? Math.round(advice.hours).toLocaleString('en-US') : String(advice.hours)} h`
}

/**
 * The hours cell's hover: what the tier costs, and which road would mostly pay for it. In item
 * experience, the unit the source hover uses: a dropped +4 copy is worth 16, so 128 is not 128 copies.
 */
export function moteHoursTitle(advice: Pick<MoteAdvice, 'copies' | 'road'>): string {
  const road = advice.road === 'copies' ? 'mostly by farming copies' : 'mostly by motes and fragments'
  return `Without a mote: ${advice.copies.toLocaleString('en-US')} item experience, ${road}`
}

export const SUPPLY_LABEL: Record<SupplyKind, string> = {
  raid: 'Raid boss',
  raidZone: 'Raid zone',
  camp: 'Camp',
  quest: 'Quest',
  crafted: 'Crafted',
  unknown: 'Not listed'
}

/** `1 in 8`: a chance as a player says it. */
function oneIn(chance: number): string {
  return chance >= 0.95 ? 'every kill' : `1 in ${String(Math.max(2, Math.round(1 / chance)))}`
}

/** `9.5 min`, `2 h`: a stated respawn. */
function respawnText(seconds: number): string {
  return seconds >= 3600 ? `${String(Math.round(seconds / 360) / 10)} h` : `${String(Math.round(seconds / 6) / 10)} min`
}

/** The source cell: where copies come from and the one fact that prices them. */
export function moteSourceText(supply: ItemSupply | undefined): string {
  if (supply === undefined) return SUPPLY_LABEL.unknown
  const label = SUPPLY_LABEL[supply.kind]
  if (supply.kind === 'quest' || supply.kind === 'crafted') return `${label}: copies come at +0`
  if (supply.kind === 'raid') return `${label}: weekly kill${supply.chance === undefined ? '' : `, ${oneIn(supply.chance)}`}`
  if (supply.chance === undefined) return label
  const hard = (supply.hard ?? []).some((h) => h === 'level' || h === 'mechanics') ? ', hard fight' : ''
  return `${label}: ${oneIn(supply.chance)}${supply.respawn === undefined ? '' : `, ${respawnText(supply.respawn)} respawn`}${hard}`
}

const GAP_TEXT: Record<SupplyGap, string> = {
  respawn: 'respawn',
  loot: 'loot list',
  spawn: 'spawn points',
  source: 'source'
}

/** The source cell's hover: who, how much a week, and what the estimate had to assume. */
export function moteSourceTitle(supply: ItemSupply | undefined): string {
  if (supply?.perWeek === undefined) return 'No page lists where it comes from, so only motes and fragments are counted'
  const from = supply.from === undefined ? '' : `${supply.from}: `
  const roads = supply.roads > 1 ? ` over ${String(supply.roads)} sources` : ''
  const assumed = supply.assumed === undefined ? '' : `; ${supply.assumed.map((g) => GAP_TEXT[g]).join(', ')} assumed`
  return `${from}about ${String(supply.perWeek)} experience a week${roads}${assumed}`
}

/** Why a row is not a pick yet, or `''` when it may be one. */
export function moteGateText(advice: Pick<MoteAdvice, 'gate' | 'gain'>): string {
  if (advice.gain <= 0) return 'No gain for your target'
  if (advice.gate === 'early') return `Below +${String(MOTE_RULES.minTier)}: ordinary motes get it there`
  return advice.gate === 'rare' ? `Below +${String(MOTE_RULES.minTier)}, but copies barely exist` : ''
}

/** What the tab knows when it has no row to draw. */
export interface MoteEmptyState {
  /** the item data's first read has settled */
  indexReady: boolean
  /** the item data states a version this build does not know */
  indexRefused: boolean
  /** the item data holds any item at all */
  hasRows: boolean
  inventoryReady: boolean
  hasDump: boolean
  /** worn items below +10 the item data does not know (`moteUnranked`) */
  unranked: number
  /** the in-game command that writes the dump */
  command: string
}

/**
 * Why there is no list: no dump is the command, never "you wear nothing" (the hover card's rule).
 * The item data comes first: without it no worn item finds its row, and that is not "all +10".
 */
export function moteEmptyText(s: MoteEmptyState): string {
  if (s.indexRefused) return 'This build cannot read the gear index it was served - it states a newer version.'
  if (!s.indexReady) return 'Reading the item database…'
  if (!s.hasRows) return 'The item data could not be read, so nothing can be ranked.'
  if (!s.inventoryReady) return 'Reading your inventory…'
  if (!s.hasDump) return `No inventory dump for this character yet. Type ${s.command} in game.`
  // An empty list with a dump proves only this much: nothing it could rank is below +10. It may be
  // that everything is +10, or that nothing is worn at all, so neither is claimed.
  if (s.unranked > 0) return 'Nothing to rank: every worn piece below +10 is missing from the item data.'
  return 'Nothing to rank: no worn piece is below +10.'
}

/** `Not ranked: Bracer of Hate +8 (not in the item data)`: the worn items the list leaves out; `''` for none. */
export function moteUnrankedText(hosts: readonly PlannerInventoryHost[]): string {
  if (hosts.length === 0) return ''
  return `Not ranked: ${hosts.map(hostText).join(', ')} (not in the item data)`
}

/** `2 motes`, `1 mote`. */
const motesText = (n: number): string => `${String(n)} ${n === 1 ? 'mote' : 'motes'}`

/**
 * `Indicolite Breastplate +9→+10 (1 mote) · Earring of Bashing +8→+10 (2 motes)`: the week's motes,
 * one item each, with the count said in words (Malkil, 2026-11-23, read the table's bare number as
 * the count; the line says it so nobody has to guess).
 */
export function motePlanText(plan: readonly MotePlanStep[]): string {
  return planByItem(plan)
    .map((p) => `${p.name} +${String(p.from)}→+${String(p.from + p.motes)} (${motesText(p.motes)})`)
    .join(' · ')
}

const ORDER_WORDS: Record<MoteOrder, string> = { recommended: 'recommended', gain: 'biggest gain', effort: 'most hours saved' }

/**
 * The line above the table: what a highlighted row and its number mean. The plan is the Recommended
 * one under every sort (owner's default, 2026-11-23), so under another sort the line says so: the
 * tester read "Biggest gain" keeping the highlights as a bug. `''` when nothing is highlighted.
 */
export function moteLegendText(order: MoteOrder, plan: readonly MotePlanStep[]): string {
  if (plan.length === 0) return ''
  const count = 'the number is how many motes that item gets'
  if (order === 'recommended') return `Highlighted rows are where this week's motes go; ${count}. Sorting changes only the order.`
  return `Sorted by ${ORDER_WORDS[order]}. The highlighted rows are still the Recommended plan for this week's motes; ${count}.`
}

/**
 * The line above the list: where the week's motes go, and how many are left to hold. `motes` is
 * how many the player has on hand; with none there is nothing to plan, which is not "not ready".
 */
export function motePlanLine(plan: readonly MotePlanStep[], motes: number = MOTE_RULES.perWeek): string {
  if (motes <= 0) return 'No void motes to spend this week'
  if (plan.length === 0) return `Nothing you wear is ready for a mote yet: hold them`
  const held = motes - plan.length
  return `This week: ${motePlanText(plan)}${held > 0 ? ` · hold ${String(held)}` : ''}`
}
