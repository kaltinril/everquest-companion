// planner/tierChips.ts — THE BEST IN SLOT BOARD'S VOCABULARY: the tiers, what a tier weighs, the stat
// chips, and a board as a short line of text (plans/2026-11-24-bis-sheet.md, "Version 2 design").
//
// The asks this file answers, word for word: *"assigning each stat a tier using a drag-and-drop S, A,
// B, C, D, F system"*; *"1h melee weapon ratio, 2h melee weapon ratio, and ranged weapon ratio should
// all be considered different stats"* (Malkil, 2026-11-24); the owner's *"cross a stat off"* (the
// `Off` lane) and, after Malkil's first try, *"if ranger is in the classes, and they specifically put
// Dex at s tier that's the most important period"* (the step: each lane weighs `step` times the next).
//
// VERSION 2 CHIPS: INT, WIS and STA are not chips. They are the mana and the HP they give (owner:
// INT and WIS *"Jaut provide mana pool"*), folded into MANA and HP by the game's formulas
// (`tierWeights.ts`). The five classic resists are one chip, their average, unless the board is SPLIT.
//
// PURE, no imports (the shared/planner house rule), so the node test runner loads it.

/** Six lanes from the reference image, plus `Off`: the lane for a stat that no longer counts. */
export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F' | 'Off'

export const TIERS: readonly Tier[] = ['S', 'A', 'B', 'C', 'D', 'F', 'Off']

/** The lanes a stat can be RANKED in; `Off` is not one of them, it is the absence of a rank. */
export const RANKED_TIERS: readonly Exclude<Tier, 'Off'>[] = ['S', 'A', 'B', 'C', 'D', 'F']

/** How many times a lane outweighs the next: 2, 4 (the default), or 25 ("S always wins"). */
export type TierStep = 2 | 4 | 25

export const TIER_STEPS: readonly TierStep[] = [2, 4, 25]

export const DEFAULT_STEP: TierStep = 4

/** One typical piece of a stat in this lane is worth `step ^ (3 - lane)` points: C = 1, S = step^3. */
export function tierWeight(tier: Tier, step: TierStep): number {
  if (tier === 'Off') return 0
  return step ** (3 - RANKED_TIERS.indexOf(tier))
}

export type RatioChip = 'RATIO_1H' | 'RATIO_2H' | 'RATIO_RANGED'
export type SplitResistChip = 'SV_FIRE' | 'SV_COLD' | 'SV_MAGIC' | 'SV_DISEASE' | 'SV_POISON'

/** One draggable stat. HP, MANA and RESISTS are derived (`tierWeights.deriveChips`); the rest are stated. */
export type TierChip =
  | 'AC'
  | 'HP'
  | 'AGI'
  | 'RESISTS'
  | 'SV_VOID'
  | 'STR'
  | 'DEX'
  | 'ATTACK'
  | 'HASTE'
  | 'DMG_BONUS'
  | 'BACKSTAB'
  | RatioChip
  | 'MANA'
  | 'MANA_REGEN'
  | 'HP_REGEN'
  | 'END'
  | 'END_REGEN'
  | 'CHA'
  | SplitResistChip

export type ChipGroup = 'defense' | 'resists' | 'offense' | 'weapons' | 'pools'

export interface ChipInfo {
  chip: TierChip
  label: string
  group: ChipGroup
}

/**
 * THE CHIPS, IN A FIXED ORDER THAT IS ALSO THE TEXT FORMAT'S (`boardToText`). A new chip is
 * APPENDED, never inserted: a board somebody pasted into Discord last month must still read.
 */
export const TIER_CHIPS: readonly ChipInfo[] = [
  { chip: 'AC', label: 'AC', group: 'defense' },
  { chip: 'HP', label: 'HP (with STA)', group: 'defense' },
  { chip: 'AGI', label: 'AGI', group: 'defense' },
  { chip: 'RESISTS', label: 'Resists', group: 'resists' },
  { chip: 'SV_VOID', label: 'SV Void', group: 'resists' },
  { chip: 'STR', label: 'STR (melee)', group: 'offense' },
  { chip: 'DEX', label: 'DEX', group: 'offense' },
  { chip: 'ATTACK', label: 'Attack', group: 'offense' },
  { chip: 'HASTE', label: 'Haste', group: 'offense' },
  { chip: 'DMG_BONUS', label: 'DMG bonus', group: 'offense' },
  { chip: 'BACKSTAB', label: 'Backstab', group: 'offense' },
  { chip: 'RATIO_1H', label: '1H ratio', group: 'weapons' },
  { chip: 'RATIO_2H', label: '2H ratio', group: 'weapons' },
  { chip: 'RATIO_RANGED', label: 'Ranged ratio', group: 'weapons' },
  { chip: 'MANA', label: 'Mana (with INT/WIS)', group: 'pools' },
  { chip: 'MANA_REGEN', label: 'Mana regen', group: 'pools' },
  { chip: 'HP_REGEN', label: 'HP regen', group: 'pools' },
  { chip: 'END', label: 'Endurance', group: 'pools' },
  { chip: 'END_REGEN', label: 'End regen', group: 'pools' },
  { chip: 'CHA', label: 'CHA', group: 'offense' },
  { chip: 'SV_FIRE', label: 'SV Fire', group: 'resists' },
  { chip: 'SV_COLD', label: 'SV Cold', group: 'resists' },
  { chip: 'SV_MAGIC', label: 'SV Magic', group: 'resists' },
  { chip: 'SV_DISEASE', label: 'SV Disease', group: 'resists' },
  { chip: 'SV_POISON', label: 'SV Poison', group: 'resists' }
]

export const CHIP_KEYS: readonly TierChip[] = TIER_CHIPS.map((c) => c.chip)

export const RATIO_CHIPS: readonly RatioChip[] = ['RATIO_1H', 'RATIO_2H', 'RATIO_RANGED']

export const SPLIT_RESISTS: readonly SplitResistChip[] = ['SV_FIRE', 'SV_COLD', 'SV_MAGIC', 'SV_DISEASE', 'SV_POISON']

const RATIO_SET: ReadonlySet<string> = new Set<string>(RATIO_CHIPS)
const SPLIT_SET: ReadonlySet<string> = new Set<string>(SPLIT_RESISTS)

export function isRatioChip(chip: TierChip): chip is RatioChip {
  return RATIO_SET.has(chip)
}

export function isSplitResist(chip: TierChip): chip is SplitResistChip {
  return SPLIT_SET.has(chip)
}

/** The chips a board shows and scores: RESISTS, or the five in its place when split. */
export function activeChips(split: boolean): TierChip[] {
  const out: TierChip[] = []
  for (const chip of CHIP_KEYS) {
    if (chip === 'RESISTS') {
      if (split) out.push(...SPLIT_RESISTS)
      else out.push(chip)
    } else if (!isSplitResist(chip)) out.push(chip)
  }
  return out
}

/** A whole board: every chip in exactly one lane (inactive chips keep a lane too, for un-splitting). */
export type TierBoard = Readonly<Record<TierChip, Tier>>

export type TierCaps = Readonly<Partial<Record<TierChip, number>>>

/** Everything the player sets on the board. */
export interface TierSetup {
  board: TierBoard
  step: TierStep
  split: boolean
  /** loadout caps: above the cap, more of the stat is worth nothing (never on a ratio chip) */
  caps: TierCaps
}

export function chipLabel(chip: TierChip): string {
  return TIER_CHIPS.find((c) => c.chip === chip)?.label ?? chip
}

export function chipGroup(chip: TierChip): ChipGroup {
  return TIER_CHIPS.find((c) => c.chip === chip)?.group ?? 'offense'
}

/** A board with every chip in one lane: the base a partial board is laid over. */
export function uniformBoard(tier: Tier): Record<TierChip, Tier> {
  return Object.fromEntries(CHIP_KEYS.map((c) => [c, tier])) as Record<TierChip, Tier>
}

// ---- a board as text -----------------------------------------------------------------------------
//
// `bis2:<step>[s]:<one character per chip in CHIP_KEYS order>[;CHIP=cap,...]`. Step 25 is written
// `z`; `x` is Off; `s` after the step means split resists. Short enough for a Discord message.

const PREFIX = 'bis2:'
const STEP_CODE: Readonly<Record<TierStep, string>> = { 2: '2', 4: '4', 25: 'z' }
const TIER_CODE: Readonly<Record<Tier, string>> = { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', F: 'F', Off: 'x' }
const CODE_TIER: ReadonlyMap<string, Tier> = new Map(TIERS.map((t) => [TIER_CODE[t].toLowerCase(), t]))
const CHIP_SET: ReadonlySet<string> = new Set<string>(CHIP_KEYS)

export function boardToText(setup: TierSetup): string {
  const lanes = CHIP_KEYS.map((chip) => TIER_CODE[setup.board[chip]]).join('')
  const caps = CHIP_KEYS.filter((c) => setup.caps[c] !== undefined).map((c) => `${c}=${String(setup.caps[c])}`)
  return `${PREFIX}${STEP_CODE[setup.step]}${setup.split ? 's' : ''}:${lanes}${caps.length > 0 ? `;${caps.join(',')}` : ''}`
}

/** What a pasted line states, or `undefined` when it is not a board. Lanes may be partial (older line). */
export interface ParsedBoard {
  lanes: Partial<Record<TierChip, Tier>>
  step: TierStep
  split: boolean
  caps: Partial<Record<TierChip, number>>
}

function parseCaps(text: string | undefined): Partial<Record<TierChip, number>> | undefined {
  const caps: Partial<Record<TierChip, number>> = {}
  if (text === undefined || text === '') return caps
  for (const pair of text.split(',')) {
    const [chip, value] = pair.split('=')
    const n = Number(value)
    if (!CHIP_SET.has(chip) || value === undefined || value === '' || !Number.isFinite(n)) return undefined
    caps[chip as TierChip] = n
  }
  return caps
}

export function boardFromText(text: string): ParsedBoard | undefined {
  const line = text.trim()
  if (line.slice(0, PREFIX.length).toLowerCase() !== PREFIX) return undefined
  const [head, capText] = line.slice(PREFIX.length).split(';')
  const m = /^([24z])(s?):([A-Za-z]+)$/.exec(head)
  if (m === null) return undefined
  const step = TIER_STEPS.find((s) => STEP_CODE[s] === m[1]) ?? DEFAULT_STEP
  const lanes: Partial<Record<TierChip, Tier>> = {}
  const body = m[3]
  for (let i = 0; i < Math.min(body.length, CHIP_KEYS.length); i++) {
    const tier = CODE_TIER.get(body[i].toLowerCase())
    if (tier === undefined) return undefined
    lanes[CHIP_KEYS[i]] = tier
  }
  const caps = parseCaps(capText)
  if (caps === undefined) return undefined
  return { lanes, step, split: m[2] === 's', caps }
}
