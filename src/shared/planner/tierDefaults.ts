// planner/tierDefaults.ts — THE BOARD A PLAYER STARTS FROM (plans/2026-11-24-bis-sheet.md, "Version 2
// design", "Defaults").
//
// FROM CLASS GUIDES, NOT FROM THE OLD BEST FORMULA (owner, 2026-11-24: *"this is a experiment to find
// the best in slot without my old calculations"*, *"use any online guides to help hone the
// calculations"*). Each class's row is Almar's classic class guide (almarsguides.com, classic-PoR)
// read into lanes, corrected by the Legends rules the guides predate: a bow's damage is DEX, and STR
// does nothing for it (the Legends wiki's Archery test), so the ranger's ranged stats are DEX and the
// ranged ratio. A row names only the stats the guide ranks; everything else lands in F.
//
// SEVERAL CLASSES (a Legends character carries up to three) take the BEST lane any of them gives a
// stat. A stat no picked class can use is Off: mana with no caster, backstab without a rogue, CHA
// without an enchanter or bard, endurance with no melee or hybrid. The player may move any of them:
// the default is where they start, not a rule.
//
// PURE, relative value imports (the shared/planner house rule) so the node test runner loads it.

import type { ClassAbbr } from '../classCombo'
import { CHIP_KEYS, RANKED_TIERS, isSplitResist, type Tier, type TierBoard, type TierChip } from './tierChips'
import { MANA_STAT } from './tierWeights'

type Row = Partial<Record<TierChip, Exclude<Tier, 'Off'>>>

const MELEE_GUARD: Row = { AC: 'S', HP: 'S', HASTE: 'A', RATIO_1H: 'A', RATIO_2H: 'A', AGI: 'B', STR: 'B', ATTACK: 'B', DEX: 'C', RESISTS: 'C', SV_VOID: 'C', HP_REGEN: 'C' }
const PRIEST: Row = { MANA: 'S', HP: 'A', MANA_REGEN: 'A', AC: 'B', AGI: 'C', RESISTS: 'C', SV_VOID: 'C' }
const NUKER: Row = { MANA: 'S', HP: 'A', MANA_REGEN: 'A', AC: 'C', RESISTS: 'C', SV_VOID: 'C' }

/** One row per class: the stats its guide ranks, in lanes. */
export const CLASS_TIERS: Readonly<Record<ClassAbbr, Row>> = {
  WAR: { ...MELEE_GUARD, END: 'D', END_REGEN: 'D', DMG_BONUS: 'D' },
  PAL: { ...MELEE_GUARD, MANA: 'C', MANA_REGEN: 'D', END_REGEN: 'D' },
  SHD: { ...MELEE_GUARD, MANA: 'B', MANA_REGEN: 'D', END_REGEN: 'D' },
  MNK: { HASTE: 'S', STR: 'S', RATIO_1H: 'S', RATIO_2H: 'A', DEX: 'A', ATTACK: 'A', AGI: 'B', HP: 'B', AC: 'C', END_REGEN: 'C', END: 'D', RESISTS: 'D', SV_VOID: 'D' },
  ROG: { HASTE: 'S', DEX: 'S', RATIO_1H: 'S', STR: 'A', ATTACK: 'A', BACKSTAB: 'A', AGI: 'B', HP: 'B', AC: 'C', END_REGEN: 'C', RESISTS: 'D', SV_VOID: 'D' },
  RNG: { HASTE: 'S', DEX: 'S', RATIO_RANGED: 'S', STR: 'A', ATTACK: 'A', RATIO_1H: 'A', RATIO_2H: 'B', MANA: 'B', HP: 'B', AGI: 'C', AC: 'C', MANA_REGEN: 'C', RESISTS: 'D', SV_VOID: 'D' },
  BRD: { HASTE: 'S', STR: 'A', DEX: 'A', ATTACK: 'A', RATIO_1H: 'A', AC: 'B', HP: 'B', AGI: 'B', CHA: 'B', MANA: 'C', RESISTS: 'D', SV_VOID: 'D' },
  BST: { HASTE: 'S', STR: 'S', DEX: 'A', ATTACK: 'A', RATIO_1H: 'A', RATIO_2H: 'B', HP: 'B', AGI: 'B', AC: 'C', MANA: 'C', RESISTS: 'D', SV_VOID: 'D' },
  BER: { HASTE: 'S', STR: 'S', RATIO_2H: 'S', DEX: 'A', ATTACK: 'A', RATIO_1H: 'A', DMG_BONUS: 'B', HP: 'B', AGI: 'B', AC: 'C', END: 'C', END_REGEN: 'C', RESISTS: 'D', SV_VOID: 'D' },
  CLR: { ...PRIEST, STR: 'D' },
  DRU: PRIEST,
  SHM: { ...PRIEST, AGI: 'B', DEX: 'D' },
  NEC: NUKER,
  WIZ: NUKER,
  MAG: NUKER,
  ENC: { ...NUKER, CHA: 'A', AGI: 'B' }
}

export type TierPreset = 'classes' | 'tank' | 'melee' | 'ranged' | 'caster' | 'healer'

export const TIER_PRESETS: readonly TierPreset[] = ['classes', 'tank', 'melee', 'ranged', 'caster', 'healer']

export const PRESET_LABEL: Readonly<Record<TierPreset, string>> = {
  classes: 'My classes (class guides)',
  tank: 'Tank',
  melee: 'Melee damage',
  ranged: 'Ranged damage',
  caster: 'Caster',
  healer: 'Healer'
}

const ROLE_TIERS: Readonly<Record<Exclude<TierPreset, 'classes'>, Row>> = {
  tank: CLASS_TIERS.WAR,
  melee: { HASTE: 'S', STR: 'S', RATIO_1H: 'S', RATIO_2H: 'S', DEX: 'A', ATTACK: 'A', AGI: 'B', HP: 'B', AC: 'C', END_REGEN: 'C', RESISTS: 'D', SV_VOID: 'D' },
  ranged: { HASTE: 'S', DEX: 'S', RATIO_RANGED: 'S', ATTACK: 'A', MANA: 'B', HP: 'B', AGI: 'C', AC: 'C', STR: 'C', RESISTS: 'D', SV_VOID: 'D' },
  caster: CLASS_TIERS.WIZ,
  healer: CLASS_TIERS.CLR
}

const ENDURANCE: ReadonlySet<ClassAbbr> = new Set<ClassAbbr>(['WAR', 'MNK', 'ROG', 'BER', 'PAL', 'SHD', 'RNG', 'BRD', 'BST'])

/** The better of two lanes. */
function better(a: Exclude<Tier, 'Off'> | undefined, b: Exclude<Tier, 'Off'> | undefined): Exclude<Tier, 'Off'> | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return RANKED_TIERS.indexOf(a) <= RANKED_TIERS.indexOf(b) ? a : b
}

/** Stats no picked class can use. No class picked gates nothing (law 1). */
function deadStats(classes: readonly ClassAbbr[]): TierChip[] {
  if (classes.length === 0) return []
  const dead: TierChip[] = []
  if (!classes.some((c) => MANA_STAT[c] !== undefined)) dead.push('MANA', 'MANA_REGEN')
  if (!classes.includes('ROG')) dead.push('BACKSTAB')
  if (!classes.some((c) => c === 'ENC' || c === 'BRD')) dead.push('CHA')
  if (!classes.some((c) => ENDURANCE.has(c))) dead.push('END', 'END_REGEN')
  return dead
}

/** The rows a preset reads; `classes` with no class picked reads a flat row (AC and HP above the rest). */
function rowsFor(preset: TierPreset, classes: readonly ClassAbbr[]): Row[] {
  if (preset !== 'classes') return [ROLE_TIERS[preset]]
  if (classes.length === 0) return [Object.fromEntries(CHIP_KEYS.map((c) => [c, c === 'AC' || c === 'HP' ? 'B' : 'C']))]
  return classes.map((c) => CLASS_TIERS[c])
}

/** The starting board: the best lane any row gives each stat, F when none ranks it, Off when dead. */
export function defaultBoard(preset: TierPreset, classes: readonly ClassAbbr[]): TierBoard {
  const rows = rowsFor(preset, classes)
  const board = {} as Record<TierChip, Tier>
  for (const chip of CHIP_KEYS) {
    const key: TierChip = isSplitResist(chip) ? 'RESISTS' : chip
    let lane: Exclude<Tier, 'Off'> | undefined
    for (const row of rows) lane = better(lane, row[key])
    board[chip] = lane ?? 'F'
  }
  for (const chip of deadStats(classes)) board[chip] = 'Off'
  return board
}
