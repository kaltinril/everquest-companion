// planner/tierWeights.ts — WHAT AN ITEM IS WORTH ON THE PLAYER'S OWN TIER BOARD
// (plans/2026-11-24-bis-sheet.md, "Version 2 design"; the game facts and their sources are in
// agent/MEASURED.md, "BiS sheet research").
//
// THE ARITHMETIC IN ONE LINE: score = sum over the item's stats of the lane's weight x the value /
// the stat's UNIT. The unit is what a good endgame item carries of that stat, measured from the rows
// handed in, never typed in: it is what lets "S" mean the same for DEX (a typical piece is 6) as for
// HP (40) or haste (36%).
//
// NOTHING HERE COMES FROM THE OLD BEST FORMULA (owner, 2026-11-24: *"I didn't tell you to assign
// values to stats baesd on my old formula"*). What the game says instead:
//   * INT and WIS are MANA and nothing else for damage (owner: they *"Jaut provide mana pool"*): a
//     point is `0.1875 x level` mana (the stat between 100 and 200), for each picked class that casts
//     from that stat. A warrior's INT is worth nothing.
//   * STA is HP: `level x F / 3000` a point, F the best HP factor among the picked classes.
//   * The five classic resists count as their AVERAGE, so a five-resist helm is not five stats.
//     Malkil's first try (a Wizard cap's two resists outvoting a ranger's DEX helm) is why.
//
// WHAT STAYS A RULE AND NOT A WEIGHT: a weapon ratio counts only where the weapon swings (the hands
// for 1H and 2H, RANGE for a bow), never in either ANY cell (Malkil, 2026-11-24); a 1H ratio counts in
// SECONDARY only for a class that dual wields; worn haste does not stack (`hasteCredit` for one item,
// the sheet's once-per-loadout rule for many).
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import type { GearRow, GearStats } from './gear'
import { gearRatio } from './gearScale'
import { gearHandedness, hasteCredit, isRangedWeapon } from './roleWeights'
import {
  CHIP_KEYS,
  SPLIT_RESISTS,
  activeChips,
  isRatioChip,
  tierWeight,
  type RatioChip,
  type TierChip,
  type TierSetup
} from './tierChips'
import { equipSlotOf, type PlanSlotId } from './types'

/** What a score reads off an item. `GearRow` is one. */
export type TierItem = Pick<GearRow, 'stats'> & Partial<Pick<GearRow, 'skill' | 'dropLevels' | 'eraTag' | 'slots'>>

export type ChipValues = Partial<Record<TierChip, number>>

// ---- the game's conversions ----------------------------------------------------------------------

/** HP per level factor at 60 (TAKP client_mods.cpp; the Legends wiki's Game Mechanics page agrees). */
export const HP_FACTOR: Readonly<Record<ClassAbbr, number>> = {
  WAR: 300, PAL: 260, SHD: 260, BER: 260, RNG: 200, MNK: 180, BRD: 180, ROG: 180, BST: 180,
  CLR: 150, DRU: 150, SHM: 150, NEC: 120, WIZ: 120, MAG: 120, ENC: 120
}

/** The attribute a class draws its mana from; the four pure melee draw none. */
export const MANA_STAT: Readonly<Partial<Record<ClassAbbr, 'INT' | 'WIS'>>> = {
  CLR: 'WIS', DRU: 'WIS', SHM: 'WIS', PAL: 'WIS', RNG: 'WIS', BST: 'WIS',
  NEC: 'INT', WIZ: 'INT', MAG: 'INT', ENC: 'INT', SHD: 'INT', BRD: 'INT'
}

export interface Conversions {
  hpPerSta: number
  manaPerWis: number
  manaPerInt: number
}

/** No class picked is UNKNOWN (law 1): a middling HP factor and both mana stats. */
export function conversionsFor(classes: readonly ClassAbbr[], level: number): Conversions {
  const factor = classes.length === 0 ? 200 : Math.max(...classes.map((c) => HP_FACTOR[c]))
  const stats = new Set(classes.length === 0 ? ['INT', 'WIS'] : classes.map((c) => MANA_STAT[c]))
  const perPoint = 0.1875 * level
  return {
    hpPerSta: (level * factor) / 3000,
    manaPerWis: stats.has('WIS') ? perPoint : 0,
    manaPerInt: stats.has('INT') ? perPoint : 0
  }
}

// ---- an item's chip values -----------------------------------------------------------------------

export type WeaponKind = '1h' | '2h' | 'ranged'

const RATIO_CHIP_OF: Readonly<Record<WeaponKind, RatioChip>> = { '1h': 'RATIO_1H', '2h': 'RATIO_2H', ranged: 'RATIO_RANGED' }

/** A bow or thrown weapon first (its skill is no hand), then the hand by the folded skill. */
export function weaponKindOf(skill: string | undefined): WeaponKind | null {
  if (isRangedWeapon(skill)) return 'ranged'
  return gearHandedness(skill)
}

const STATED: readonly (TierChip & keyof GearStats)[] = [
  'AC', 'AGI', 'STR', 'DEX', 'ATTACK', 'HASTE', 'DMG_BONUS', 'BACKSTAB', 'MANA_REGEN', 'HP_REGEN', 'END', 'END_REGEN', 'CHA', 'SV_VOID'
]
const ALL_RESIST_KEYS: readonly (keyof GearStats)[] = ['SV_ALL', 'SV_CHROMATIC', 'SV_PRISMATIC']

function resistOf(stats: GearStats, key: keyof GearStats): number | undefined {
  let total = stats[key]
  for (const all of ALL_RESIST_KEYS) {
    const v = stats[all]
    if (v !== undefined) total = (total ?? 0) + v
  }
  return total
}

/** HP with STA, MANA with INT/WIS: present when the item states any part (law 1: absent is not zero). */
function pools(stats: GearStats, conv: Conversions, out: ChipValues): void {
  if (stats.HP !== undefined || stats.STA !== undefined) out.HP = (stats.HP ?? 0) + (stats.STA ?? 0) * conv.hpPerSta
  const fromStats = (stats.WIS ?? 0) * conv.manaPerWis + (stats.INT ?? 0) * conv.manaPerInt
  if (stats.MP !== undefined || fromStats !== 0) out.MANA = (stats.MP ?? 0) + fromStats
}

/** Every chip's value on an item, both RESISTS and the five split chips. */
export function deriveChips(item: TierItem, conv: Conversions): ChipValues {
  const { stats } = item
  const out: ChipValues = {}
  for (const chip of STATED) if (stats[chip] !== undefined) out[chip] = stats[chip]
  pools(stats, conv, out)
  let any = false
  let sum = 0
  for (const chip of SPLIT_RESISTS) {
    const v = resistOf(stats, chip)
    if (v === undefined) continue
    out[chip] = v
    sum += v
    any = true
  }
  if (any) out.RESISTS = sum / SPLIT_RESISTS.length
  const kind = weaponKindOf(item.skill)
  const ratio = kind === null ? undefined : gearRatio(stats)
  if (kind !== null && ratio !== undefined) out[RATIO_CHIP_OF[kind]] = ratio
  return out
}

// ---- the model: units and budgets, measured ------------------------------------------------------

/** The Legends-only revamped gear's era tags (items.json `eraTag`, 2026-11-24 census). */
export const REVAMP_ERA_TAGS: ReadonlySet<string> = new Set(['Chardok Revamp', 'FearHateRevamp', 'Temple', 'Paineel', 'Sky', 'Epics', 'EpicQuests'])

export type LevelBand = 'lvl 1-20' | 'lvl 21-35' | 'lvl 36-50' | 'lvl 51+' | 'Legends revamp'

/** The lowest level a mob that drops it is stated at, or undefined. */
export function dropLevelOf(item: TierItem): number | undefined {
  const levels = (item.dropLevels ?? []).map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0)
  return levels.length === 0 ? undefined : Math.min(...levels)
}

export function levelBand(item: TierItem): LevelBand | undefined {
  if (item.eraTag !== undefined && REVAMP_ERA_TAGS.has(item.eraTag)) return 'Legends revamp'
  const level = dropLevelOf(item)
  if (level === undefined) return undefined
  if (level <= 20) return 'lvl 1-20'
  if (level <= 35) return 'lvl 21-35'
  return level <= 50 ? 'lvl 36-50' : 'lvl 51+'
}

export interface TierModel {
  conv: Conversions
  /** one good endgame piece of each chip */
  units: Readonly<Record<TierChip, number>>
  /** the median stat budget per `slot|band` */
  typicalBudget: ReadonlyMap<string, number>
  /** chip values per item, derived once */
  valuesOf: (item: TierItem) => ChipValues
}

/** Fewer endgame samples than this and the unit falls back to every row's median. */
export const MIN_ENDGAME_SAMPLES = 15

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Append to a keyed list, creating it on first use. */
function pushTo<K>(map: Map<K, number[]>, key: K, v: number): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [v])
  else list.push(v)
}

function isEndgame(item: TierItem): boolean {
  const band = levelBand(item)
  return band === 'lvl 51+' || band === 'Legends revamp'
}

function measureUnits(rows: readonly TierItem[], valuesOf: TierModel['valuesOf']): Record<TierChip, number> {
  const all = new Map<TierChip, number[]>()
  const end = new Map<TierChip, number[]>()
  for (const row of rows) {
    const top = isEndgame(row)
    for (const [chip, v] of Object.entries(valuesOf(row)) as [TierChip, number][]) {
      if (!(v > 0)) continue
      pushTo(all, chip, v)
      if (top) pushTo(end, chip, v)
    }
  }
  const units = {} as Record<TierChip, number>
  for (const chip of CHIP_KEYS) {
    const e = end.get(chip) ?? []
    units[chip] = (e.length >= MIN_ENDGAME_SAMPLES ? median(e) : median(all.get(chip) ?? [])) ?? 1
  }
  return units
}

/** An item's stat budget: its positive values in units, over the board's chips (RESISTS, not the five). */
export function budgetPoints(values: ChipValues, units: Readonly<Record<TierChip, number>>): number {
  let total = 0
  for (const chip of activeChips(false)) {
    const v = values[chip]
    if (v !== undefined && v > 0) total += v / units[chip]
  }
  return total
}

function budgetKey(item: TierItem): string | undefined {
  const band = levelBand(item)
  const slot = item.slots?.[0]
  return band === undefined || slot === undefined ? undefined : `${slot}|${band}`
}

/**
 * The model for the picked classes and level, over the rows `admit` lets in (the caller's era
 * verdict). Units and budgets depend on the classes because HP and MANA do.
 */
export function buildTierModel(all: readonly TierItem[], classes: readonly ClassAbbr[], level: number, admit?: (row: TierItem) => boolean): TierModel {
  const rows = admit === undefined ? all : all.filter(admit)
  const conv = conversionsFor(classes, level)
  const cache = new WeakMap<TierItem, ChipValues>()
  const valuesOf = (item: TierItem): ChipValues => {
    let v = cache.get(item)
    if (v === undefined) {
      v = deriveChips(item, conv)
      cache.set(item, v)
    }
    return v
  }
  const units = measureUnits(rows, valuesOf)
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const key = budgetKey(row)
    if (key !== undefined) pushTo(groups, key, budgetPoints(valuesOf(row), units))
  }
  const typicalBudget = new Map<string, number>()
  for (const [key, list] of groups) if (list.length >= 5) typicalBudget.set(key, median(list) ?? 0)
  return { conv, units, typicalBudget, valuesOf }
}

export interface ItemBudget {
  /** the item's budget over the typical one of its slot and band; 1 = typical */
  ratio: number
  band: LevelBand
  slot: string
}

export function itemBudget(item: TierItem, model: TierModel): ItemBudget | undefined {
  const key = budgetKey(item)
  const typical = key === undefined ? undefined : model.typicalBudget.get(key)
  if (key === undefined || typical === undefined || typical <= 0) return undefined
  const [slot, band] = key.split('|') as [string, LevelBand]
  return { ratio: budgetPoints(model.valuesOf(item), model.units) / typical, band, slot }
}

// ---- the score -----------------------------------------------------------------------------------

/** The classes that swing a second one-hander (plan question 4, the classic list, Berserker included). */
export const DUAL_WIELD_CLASSES: ReadonlySet<ClassAbbr> = new Set<ClassAbbr>(['WAR', 'MNK', 'ROG', 'RNG', 'BRD', 'BST', 'BER'])

/** No class picked is UNKNOWN, never "nobody" (law 1): it dual wields. */
export function dualWields(classes: readonly ClassAbbr[] | undefined): boolean {
  return classes === undefined || classes.length === 0 || classes.some((c) => DUAL_WIELD_CLASSES.has(c))
}

export interface TierContext {
  model: TierModel
  setup: TierSetup
  /** the cell the item would be worn in; absent = slot-free (the Gear table), ratios count wherever stated */
  slot?: PlanSlotId
  classes?: readonly ClassAbbr[]
  /** haste already worn; any of it zeroes a positive haste credit (`hasteCredit`) */
  ownedHaste?: number
  /** leave HASTE out entirely: the sheet prices haste once per loadout */
  skipHaste?: boolean
}

/** Does a ratio chip count in the context's cell? See the file header. */
export function ratioCounts(chip: RatioChip, slot: PlanSlotId | undefined, classes: readonly ClassAbbr[] | undefined): boolean {
  if (slot === undefined) return true
  const equip = equipSlotOf(slot)
  if (chip === 'RATIO_RANGED') return equip === 'RANGE'
  if (equip === 'PRIMARY') return true
  return equip === 'SECONDARY' && chip === 'RATIO_1H' && dualWields(classes)
}

/** One chip's share of a score — what the sheet's "why" line reads. */
export interface TierTerm {
  chip: TierChip
  value: number
  points: number
}

function countedValue(chip: TierChip, value: number, ctx: TierContext): number | undefined {
  if (isRatioChip(chip)) return ratioCounts(chip, ctx.slot, ctx.classes) ? value : undefined
  if (chip !== 'HASTE') return value
  return ctx.skipHaste === true ? undefined : hasteCredit(value, ctx.ownedHaste ?? 0)
}

/** Every chip the item earns points on, in chip order. Off chips and zero values are left out. */
export function tierTerms(item: TierItem, ctx: TierContext): TierTerm[] {
  const values = ctx.model.valuesOf(item)
  const terms: TierTerm[] = []
  for (const chip of activeChips(ctx.setup.split)) {
    const weight = tierWeight(ctx.setup.board[chip], ctx.setup.step)
    const stated = values[chip]
    if (weight === 0 || stated === undefined) continue
    const value = countedValue(chip, stated, ctx)
    if (value === undefined || value === 0) continue
    terms.push({ chip, value, points: (weight * value) / ctx.model.units[chip] })
  }
  return terms
}

/** Rounded to three decimals: a stable sort key, not float dust. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function tierScore(item: TierItem, ctx: TierContext): number {
  return round3(tierTerms(item, ctx).reduce((sum, t) => sum + t.points, 0))
}
