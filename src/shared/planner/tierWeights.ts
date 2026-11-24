// planner/tierWeights.ts — WHAT AN ITEM IS WORTH ON THE PLAYER'S OWN TIER BOARD
// (plans/2026-11-24-bis-sheet.md "Tiers to numbers" and "The default tier list is our formula").
//
// THE ARITHMETIC IN ONE LINE: score = sum over the item's stats of the lane's weight x the stated
// value / the stat's UNIT. The unit is the median value items state for that stat, measured from the
// rows handed in, never typed in: it is what lets "S" mean the same for STR (a typical piece is 5)
// as for HP (25) or haste (36%). Without it a tier would be a per-POINT weight, and 40 flat HP
// would outbid every attribute in the same lane — the chunk problem the role model fought for a
// month (BRANCH_NOTES.md, Gear, "Chunk-stat law").
//
// THE DEFAULT BOARD IS THE ROLE MODEL, READ PER TYPICAL ITEM (owner, 2026-11-24: *"the default teir
// list will be what our formula shows"*). A stat's importance = its `roleWeights` coefficient x its
// unit; the class gate sends a dead stat to Off; the rest are bucketed into lanes with the geometric
// mean of the live importances landing on C. It is an approximation and says so: lanes round the
// weights, and the calibration test measures by how much (tests/tierCalibration.test.mts).
//
// WHAT STAYS A RULE AND NOT A WEIGHT: a weapon ratio counts only where the weapon swings (the hands
// for 1H and 2H, RANGE for a bow), never in either ANY cell whatever its lane (Malkil, 2026-11-24:
// *"weapon ratios should never be considered for either of the two ANY slots"*); a 1H ratio counts
// in SECONDARY only for a class that dual wields; haste is credited only while none is worn
// (`hasteCredit`, the 2026-09-10 ruling). The class gate does NOT score: it only picks the default
// lane, and a player who drags INT to S on a warrior gets what they asked for.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import type { GearStats } from './gear'
import { gearEffectiveRatio, gearRatio } from './gearScale'
import {
  focusWeightsOf,
  gearHandedness,
  hasteCredit,
  isRangedWeapon,
  statLiveForClasses,
  type GearRole,
  type RoleWeights
} from './roleWeights'
import {
  ALL_RESIST_KEYS,
  CHIP_KEYS,
  RANKED_TIERS,
  TIER_WEIGHT,
  isRatioChip,
  isResistChip,
  type RatioChip,
  type Tier,
  type TierBoard,
  type TierChip
} from './tierChips'
import { equipSlotOf, type PlanSlotId } from './types'

/** What a score reads off an item: its vector and, for the three ratio chips, its weapon skill. */
export interface TierItem {
  stats: GearStats
  skill?: string
}

/** The measured scale every score and every default board reads. */
export interface TierScale {
  /** one typical piece of each chip, measured (`measureTierScale`) */
  units: Readonly<Record<TierChip, number>>
  /** ratio points one point of DMG_BONUS buys through the role model's fold, at the median weapon */
  bonusRatioPerPoint: number
}

export type WeaponKind = '1h' | '2h' | 'ranged'

const RATIO_CHIP_OF: Readonly<Record<WeaponKind, RatioChip>> = {
  '1h': 'RATIO_1H',
  '2h': 'RATIO_2H',
  ranged: 'RATIO_RANGED'
}

/** A bow or thrown weapon first (its skill is no hand), then the hand by the folded skill. */
export function weaponKindOf(skill: string | undefined): WeaponKind | null {
  if (isRangedWeapon(skill)) return 'ranged'
  return gearHandedness(skill)
}

/**
 * A chip's stated value on an item, or `undefined` when the item states none (law 1: absent is not
 * zero). A ratio chip reads the weapon's plain ratio only when the weapon is of that chip's kind; a
 * resist chip adds the item's all-resist saves to its own line.
 */
export function chipValue(chip: TierChip, item: TierItem): number | undefined {
  if (isRatioChip(chip)) {
    const kind = weaponKindOf(item.skill)
    return kind !== null && RATIO_CHIP_OF[kind] === chip ? gearRatio(item.stats) : undefined
  }
  if (!isResistChip(chip)) return item.stats[chip]
  let total: number | undefined = item.stats[chip]
  for (const key of ALL_RESIST_KEYS) {
    const v = item.stats[key]
    if (v !== undefined) total = (total ?? 0) + v
  }
  return total
}

// ---- the scale -----------------------------------------------------------------------------------

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** The positive values each chip takes over the rows. */
function chipSamples(rows: readonly TierItem[]): Map<TierChip, number[]> {
  const samples = new Map<TierChip, number[]>(CHIP_KEYS.map((c) => [c, []]))
  for (const row of rows) {
    for (const chip of CHIP_KEYS) {
      const v = chipValue(chip, row)
      if (v !== undefined && v > 0) samples.get(chip)?.push(v)
    }
  }
  return samples
}

/**
 * Units from the rows, and the DMG_BONUS exchange rate. A chip no row states (SV CORRUPTION today)
 * takes the median of the other resist units if it is a resist, else 1: its unit never matters to
 * a ranking because nothing states it, and a finite number keeps every score finite.
 */
export function measureTierScale(rows: readonly TierItem[]): TierScale {
  const samples = chipSamples(rows)
  const measured = new Map<TierChip, number>()
  for (const [chip, values] of samples) {
    const m = median(values)
    if (m !== undefined) measured.set(chip, m)
  }
  const resistFallback = median(CHIP_KEYS.filter(isResistChip).flatMap((c) => measured.get(c) ?? [])) ?? 1
  const units = Object.fromEntries(
    CHIP_KEYS.map((c) => [c, measured.get(c) ?? (isResistChip(c) ? resistFallback : 1)])
  ) as Record<TierChip, number>
  const perPoint: number[] = []
  for (const row of rows) {
    const bonus = row.stats.DMG_BONUS
    const plain = gearRatio(row.stats)
    const effective = gearEffectiveRatio(row.stats)
    if (bonus === undefined || bonus <= 0 || plain === undefined || effective === undefined) continue
    perPoint.push((effective - plain) / bonus)
  }
  return { units, bonusRatioPerPoint: median(perPoint) ?? 0 }
}

// ---- the score -----------------------------------------------------------------------------------

/**
 * The classes that swing a second one-hander (plan question 4, default taken: the classic list,
 * Berserker included). A 1H ratio in SECONDARY counts only when a picked class is one of them.
 */
export const DUAL_WIELD_CLASSES: ReadonlySet<ClassAbbr> = new Set<ClassAbbr>(['WAR', 'MNK', 'ROG', 'RNG', 'BRD', 'BST', 'BER'])

/** No class picked is UNKNOWN, never "nobody" (law 1): it dual wields. */
export function dualWields(classes: readonly ClassAbbr[] | undefined): boolean {
  return classes === undefined || classes.length === 0 || classes.some((c) => DUAL_WIELD_CLASSES.has(c))
}

export interface TierContext {
  scale: TierScale
  /** the cell the item would be worn in; absent = slot-free (the Gear table), ratios count wherever stated */
  slot?: PlanSlotId
  /** the picked classes, for the dual-wield rule */
  classes?: readonly ClassAbbr[]
  /** haste already worn; any of it zeroes a positive haste credit (`hasteCredit`) */
  ownedHaste?: number
  /** leave HASTE out entirely: the sheet prices haste once per loadout, not per item */
  skipHaste?: boolean
}

/** Does a ratio chip count in the context's cell? See the file header. */
function ratioCounts(chip: RatioChip, ctx: TierContext): boolean {
  if (ctx.slot === undefined) return true
  const slot = equipSlotOf(ctx.slot)
  if (chip === 'RATIO_RANGED') return slot === 'RANGE'
  if (slot === 'PRIMARY') return true
  return slot === 'SECONDARY' && chip === 'RATIO_1H' && dualWields(ctx.classes)
}

/** One chip's share of a score — what the sheet's "why" line reads. */
export interface TierTerm {
  chip: TierChip
  value: number
  points: number
}

/** The value a chip contributes in this context, after the ratio and haste rules; undefined = none. */
function countedValue(chip: TierChip, item: TierItem, ctx: TierContext): number | undefined {
  const value = chipValue(chip, item)
  if (value === undefined) return undefined
  if (isRatioChip(chip)) return ratioCounts(chip, ctx) ? value : undefined
  if (chip !== 'HASTE') return value
  return ctx.skipHaste === true ? undefined : hasteCredit(value, ctx.ownedHaste ?? 0)
}

/** Every chip the item earns points on, in chip order. Off chips and zero values are left out. */
export function tierTerms(item: TierItem, board: TierBoard, ctx: TierContext): TierTerm[] {
  const terms: TierTerm[] = []
  for (const chip of CHIP_KEYS) {
    const weight = TIER_WEIGHT[board[chip]]
    if (weight === 0) continue
    const value = countedValue(chip, item, ctx)
    if (value === undefined || value === 0) continue
    terms.push({ chip, value, points: (weight * value) / ctx.scale.units[chip] })
  }
  return terms
}

/** Rounded to three decimals, as `roleValue` is: a stable sort key, not float dust. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function tierScore(item: TierItem, board: TierBoard, ctx: TierContext): number {
  return round3(tierTerms(item, board, ctx).reduce((sum, t) => sum + t.points, 0))
}

// ---- the default board, and the presets ----------------------------------------------------------

/** The focus coefficient behind one chip, through the class gate. */
function chipCoefficient(chip: TierChip, w: Readonly<RoleWeights>, classes: readonly ClassAbbr[], scale: TierScale): number {
  if (isRatioChip(chip)) return w.ratio
  if (isResistChip(chip)) return w.saves
  if (chip === 'DMG_BONUS') return w.ratio * scale.bonusRatioPerPoint
  if (!statLiveForClasses(chip, classes)) return 0
  if (chip === 'INT' || chip === 'WIS') return w.manaStat
  if (chip === 'HP') return w.ehp
  if (chip === 'STA') return w.ehp + (w.stats.STA ?? 0)
  return w.stats[chip] ?? 0
}

/** How much a focus pays for one typical piece of a chip: coefficient x unit. */
export function chipImportance(chip: TierChip, role: GearRole, classes: readonly ClassAbbr[], scale: TierScale): number {
  return chipCoefficient(chip, focusWeightsOf(role), classes, scale) * scale.units[chip]
}

/** The ranked lane whose weight is nearest on a log scale. */
function nearestTier(weight: number): Tier {
  let best: Tier = 'S'
  let bestGap = Number.POSITIVE_INFINITY
  for (const tier of RANKED_TIERS) {
    const gap = Math.abs(Math.log(weight / TIER_WEIGHT[tier]))
    if (gap < bestGap) {
      best = tier
      bestGap = gap
    }
  }
  return best
}

/**
 * A focus as a board. Zero importance (a dead stat, or one the focus does not read) is Off; the rest
 * are scaled so their geometric mean is C's weight, then each takes its nearest lane.
 */
export function presetBoard(role: GearRole, classes: readonly ClassAbbr[], scale: TierScale): TierBoard {
  const importance = CHIP_KEYS.map((chip) => [chip, chipImportance(chip, role, classes, scale)] as const)
  const live = importance.filter(([, v]) => v > 0)
  const meanLog = live.reduce((sum, [, v]) => sum + Math.log(v), 0) / Math.max(1, live.length)
  const centre = Math.exp(meanLog)
  const board = {} as Record<TierChip, Tier>
  for (const [chip, v] of importance) board[chip] = v > 0 ? nearestTier((v / centre) * TIER_WEIGHT.C) : 'Off'
  return board
}

/** The board BEST would be: the balanced focus, for the classes picked. */
export function defaultBoard(classes: readonly ClassAbbr[], scale: TierScale): TierBoard {
  return presetBoard('balanced', classes, scale)
}

/**
 * The presets the board offers (plan suggestion 1): the Recommended tab's focuses. `dps` is left
 * out because it is `dps1h`'s weights under its older name (roleWeights.ts `GearRole`).
 */
export const PRESET_ROLES: readonly GearRole[] = ['balanced', 'tank', 'healer', 'dps1h', 'dps2h', 'dualwield', 'range', 'dd', 'dot']

/** A pasted or stored partial board laid over a full one: what the line did not state keeps its lane. */
export function withLanes(base: TierBoard, lanes: Partial<Record<TierChip, Tier>>): TierBoard {
  return { ...base, ...lanes }
}
