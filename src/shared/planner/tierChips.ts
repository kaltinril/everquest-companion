// planner/tierChips.ts — THE BEST IN SLOT BOARD'S VOCABULARY: the tiers, the stat chips, and a board
// as a short line of text (plans/2026-11-24-bis-sheet.md, requirements/bis-sheet.md).
//
// The asks this file answers, word for word: *"assigning each stat a tier using a drag-and-drop S, A,
// B, C, D, F system"*; *"almost any stats available on an item except for: Race, Class, Size, Weight,
// Skill, Lore Equipped, No Trade, Placeable, and Exaltations"*; *"1h melee weapon ratio, 2h melee
// weapon ratio, and ranged weapon ratio should all be considered different stats"* (Malkil,
// 2026-11-24); and the owner's *"cross a stat off"* the same day, which is the `Off` tier.
//
// PURE, no imports beyond types (the shared/planner house rule), so the node test runner loads it.

import type { GearStatKey } from './gear'

/** Six lanes from the reference image, plus `Off`: the lane for a stat that no longer counts. */
export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F' | 'Off'

export const TIERS: readonly Tier[] = ['S', 'A', 'B', 'C', 'D', 'F', 'Off']

/** The lanes a stat can be RANKED in; `Off` is not one of them, it is the absence of a rank. */
export const RANKED_TIERS: readonly Exclude<Tier, 'Off'>[] = ['S', 'A', 'B', 'C', 'D', 'F']

/**
 * What one TYPICAL piece of a stat is worth in each lane (a typical piece = the stat's unit, see
 * `tierWeights.ts`). Roughly geometric, so S is sixteen times F. INVENTED, like the role model's
 * table, and tuned with the owner (plan question 2); this is the one place to change them.
 */
export const TIER_WEIGHT: Readonly<Record<Tier, number>> = { S: 8, A: 5, B: 3, C: 2, D: 1, F: 0.5, Off: 0 }

export type RatioChip = 'RATIO_1H' | 'RATIO_2H' | 'RATIO_RANGED'
export type ResistChip = 'SV_FIRE' | 'SV_COLD' | 'SV_MAGIC' | 'SV_DISEASE' | 'SV_POISON' | 'SV_VOID' | 'SV_CORRUPTION'
type PlainChip = Extract<
  GearStatKey,
  | 'AC'
  | 'HP'
  | 'STA'
  | 'AGI'
  | 'STR'
  | 'DEX'
  | 'WIS'
  | 'INT'
  | 'CHA'
  | 'MP'
  | 'END'
  | 'HP_REGEN'
  | 'MANA_REGEN'
  | 'END_REGEN'
  | 'ATTACK'
  | 'HASTE'
  | 'DMG_BONUS'
  | 'BACKSTAB'
>
/** One draggable stat. Every member but the three ratios is a key of the gear vector itself. */
export type TierChip = PlainChip | ResistChip | RatioChip

export type ChipGroup = 'defense' | 'attributes' | 'pools' | 'offense' | 'weapons' | 'resists'

export interface ChipInfo {
  chip: TierChip
  /** the app's own spelling, as the Gear table's headers write it */
  label: string
  group: ChipGroup
}

/**
 * THE CHIPS, IN A FIXED ORDER THAT IS ALSO THE TEXT FORMAT'S (`boardToText`). A new chip is
 * APPENDED, never inserted: a board somebody pasted into Discord last month must still read.
 *
 * Left out, and why: WEIGHT, Race, Class, Size, Skill, Lore, No Trade, Placeable and Exaltations by
 * Malkil's list; DMG and DELAY because the three ratios carry them; SV_ALL, SV_CHROMATIC and
 * SV_PRISMATIC because they count toward EVERY resist chip (`ALL_RESIST_KEYS`) rather than being
 * a resist of their own; RANGE, the elemental damages, skill mods and effects wait for phase 5.
 */
export const TIER_CHIPS: readonly ChipInfo[] = [
  { chip: 'AC', label: 'AC', group: 'defense' },
  { chip: 'HP', label: 'HP', group: 'defense' },
  { chip: 'STA', label: 'STA', group: 'defense' },
  { chip: 'AGI', label: 'AGI', group: 'defense' },
  { chip: 'STR', label: 'STR', group: 'attributes' },
  { chip: 'DEX', label: 'DEX', group: 'attributes' },
  { chip: 'WIS', label: 'WIS', group: 'attributes' },
  { chip: 'INT', label: 'INT', group: 'attributes' },
  { chip: 'CHA', label: 'CHA', group: 'attributes' },
  { chip: 'MP', label: 'MANA', group: 'pools' },
  { chip: 'END', label: 'END', group: 'pools' },
  { chip: 'HP_REGEN', label: 'HP REGEN', group: 'pools' },
  { chip: 'MANA_REGEN', label: 'MANA REGEN', group: 'pools' },
  { chip: 'END_REGEN', label: 'END REGEN', group: 'pools' },
  { chip: 'ATTACK', label: 'ATTACK', group: 'offense' },
  { chip: 'HASTE', label: 'HASTE', group: 'offense' },
  { chip: 'DMG_BONUS', label: 'DMG BONUS', group: 'offense' },
  { chip: 'BACKSTAB', label: 'BACKSTAB', group: 'offense' },
  { chip: 'RATIO_1H', label: '1H RATIO', group: 'weapons' },
  { chip: 'RATIO_2H', label: '2H RATIO', group: 'weapons' },
  { chip: 'RATIO_RANGED', label: 'RANGED RATIO', group: 'weapons' },
  { chip: 'SV_FIRE', label: 'SV FIRE', group: 'resists' },
  { chip: 'SV_COLD', label: 'SV COLD', group: 'resists' },
  { chip: 'SV_MAGIC', label: 'SV MAGIC', group: 'resists' },
  { chip: 'SV_DISEASE', label: 'SV DISEASE', group: 'resists' },
  { chip: 'SV_POISON', label: 'SV POISON', group: 'resists' },
  { chip: 'SV_VOID', label: 'SV VOID', group: 'resists' },
  { chip: 'SV_CORRUPTION', label: 'SV CORRUPTION', group: 'resists' }
]

export const CHIP_KEYS: readonly TierChip[] = TIER_CHIPS.map((c) => c.chip)

export const RATIO_CHIPS: readonly RatioChip[] = ['RATIO_1H', 'RATIO_2H', 'RATIO_RANGED']

export const RESIST_CHIPS: readonly ResistChip[] = [
  'SV_FIRE',
  'SV_COLD',
  'SV_MAGIC',
  'SV_DISEASE',
  'SV_POISON',
  'SV_VOID',
  'SV_CORRUPTION'
]

/** The saves an item states for ALL resists at once; each one counts toward every resist chip. */
export const ALL_RESIST_KEYS: readonly GearStatKey[] = ['SV_ALL', 'SV_CHROMATIC', 'SV_PRISMATIC']

const RATIO_SET: ReadonlySet<string> = new Set<string>(RATIO_CHIPS)
const RESIST_SET: ReadonlySet<string> = new Set<string>(RESIST_CHIPS)

export function isRatioChip(chip: TierChip): chip is RatioChip {
  return RATIO_SET.has(chip)
}

export function isResistChip(chip: TierChip): chip is ResistChip {
  return RESIST_SET.has(chip)
}

/** A whole board: every chip in exactly one lane. */
export type TierBoard = Readonly<Record<TierChip, Tier>>

/** The board's label for a chip — the one lookup the UI and the "why" lines share. */
export function chipLabel(chip: TierChip): string {
  return TIER_CHIPS.find((c) => c.chip === chip)?.label ?? chip
}

// ---- a board as text -----------------------------------------------------------------------------
//
// One character per chip in `CHIP_KEYS` order, behind a version prefix: `bis1:SCCD...`. Short
// enough for a Discord message or a video description (plan suggestion 7). `x` is Off.

const BOARD_PREFIX = 'bis1:'
const TIER_CODE: Readonly<Record<Tier, string>> = { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', F: 'F', Off: 'x' }
const CODE_TIER: ReadonlyMap<string, Tier> = new Map(TIERS.map((t) => [TIER_CODE[t].toLowerCase(), t]))

export function boardToText(board: TierBoard): string {
  return BOARD_PREFIX + CHIP_KEYS.map((chip) => TIER_CODE[board[chip]]).join('')
}

/**
 * The lanes a pasted line states, or `undefined` when it is not a board at all. PARTIAL on purpose:
 * a line written before a chip was appended states fewer chips, and the caller lays it over its
 * own default rather than inventing a lane for what the line never said (law 1). Characters past
 * the chips this build knows are a newer build's chips and are ignored.
 */
export function boardFromText(text: string): Partial<Record<TierChip, Tier>> | undefined {
  const line = text.trim()
  if (line.slice(0, BOARD_PREFIX.length).toLowerCase() !== BOARD_PREFIX) return undefined
  const body = line.slice(BOARD_PREFIX.length)
  if (body.length === 0) return undefined
  const out: Partial<Record<TierChip, Tier>> = {}
  for (let i = 0; i < Math.min(body.length, CHIP_KEYS.length); i++) {
    const tier = CODE_TIER.get(body[i].toLowerCase())
    if (tier === undefined) return undefined
    out[CHIP_KEYS[i]] = tier
  }
  return out
}
