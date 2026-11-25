// gear/bisPrefs.ts — THE BEST IN SLOT BOARD AS STORED: one `localStorage` key, `eq.gear.tiers`, validated
// on every read (plans/2026-11-24-bis-sheet.md, "Where it lives and how it looks").
//
// `board: null` means "follow the default": the board the preset gives the classes picked right now,
// so picking another class re-deals it until the player drags a chip (then the board is theirs and
// is stored). The Gear tab's BEST column reads the same answer (`activeSetup`), so the column and the
// tab can never rank one item two ways.

import type { ClassAbbr } from '../../../../shared/classCombo'
import {
  CHIP_KEYS,
  DEFAULT_STEP,
  SPLIT_RESISTS,
  TIERS,
  TIER_STEPS,
  boardFromText,
  isRatioChip,
  type Tier,
  type TierBoard,
  type TierChip,
  type TierSetup,
  type TierStep
} from '../../../../shared/planner/tierChips'
import { TIER_PRESETS, defaultBoard, type TierPreset } from '../../../../shared/planner/tierDefaults'

export const BIS_KEY = 'eq.gear.tiers'

export interface BisPrefs {
  preset: TierPreset
  /** the player's own board, or null while it follows the preset's default */
  board: TierBoard | null
  step: TierStep
  split: boolean
  caps: Partial<Record<TierChip, number>>
  /** the level the HP and mana conversions read */
  level: number
  /** hide out-of-era items (the Gear tab's own "Current era" verdict) */
  era: boolean
  /** best from what this character owns, not best overall */
  owned: boolean
}

export const DEFAULT_LEVEL = 60

export const DEFAULT_BIS_PREFS: BisPrefs = { preset: 'classes', board: null, step: DEFAULT_STEP, split: false, caps: {}, level: DEFAULT_LEVEL, era: true, owned: false }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function sanitizeBoard(raw: unknown): TierBoard | null {
  if (!isRecord(raw)) return null
  const board = {} as Record<TierChip, Tier>
  for (const chip of CHIP_KEYS) {
    const t = raw[chip]
    if (typeof t !== 'string' || !(TIERS as readonly string[]).includes(t)) return null
    board[chip] = t as Tier
  }
  return board
}

function sanitizeCaps(raw: unknown): Partial<Record<TierChip, number>> {
  const caps: Partial<Record<TierChip, number>> = {}
  if (!isRecord(raw)) return caps
  for (const chip of CHIP_KEYS) {
    const v = raw[chip]
    if (typeof v === 'number' && Number.isFinite(v) && !isRatioChip(chip)) caps[chip] = v
  }
  return caps
}

export function clampLevel(n: number): number {
  return Number.isFinite(n) ? Math.min(70, Math.max(1, Math.round(n))) : DEFAULT_LEVEL
}

/** Whatever the store held, as a usable choice: every field checked, anything odd its default. */
export function sanitizeBisPrefs(raw: unknown): BisPrefs {
  if (!isRecord(raw)) return DEFAULT_BIS_PREFS
  const preset = TIER_PRESETS.find((p) => p === raw.preset) ?? DEFAULT_BIS_PREFS.preset
  const step = TIER_STEPS.find((s) => s === raw.step) ?? DEFAULT_STEP
  return {
    preset,
    board: sanitizeBoard(raw.board),
    step,
    split: raw.split === true,
    caps: sanitizeCaps(raw.caps),
    level: typeof raw.level === 'number' ? clampLevel(raw.level) : DEFAULT_LEVEL,
    era: raw.era !== false,
    owned: raw.owned === true
  }
}

/** The board in force: the player's own, or the preset's default for the classes picked. */
export function activeSetup(prefs: BisPrefs, classes: readonly ClassAbbr[]): TierSetup {
  return { board: prefs.board ?? defaultBoard(prefs.preset, classes), step: prefs.step, split: prefs.split, caps: prefs.caps }
}

/**
 * Split or join the resists on the board in force. Split: the five take the RESISTS lane. Joined:
 * RESISTS takes the best lane any of the five held. A board that follows the default stays null.
 */
export function withSplit(prefs: BisPrefs): BisPrefs {
  const split = !prefs.split
  if (prefs.board === null) return { ...prefs, split }
  const board = { ...prefs.board }
  if (split) for (const c of SPLIT_RESISTS) board[c] = board.RESISTS
  else board.RESISTS = SPLIT_RESISTS.map((c) => board[c]).sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0]
  return { ...prefs, split, board }
}

/** A pasted board laid over the board in force; undefined when the text is not a board. */
export function withPasted(prefs: BisPrefs, classes: readonly ClassAbbr[], text: string): BisPrefs | undefined {
  const parsed = boardFromText(text)
  if (parsed === undefined) return undefined
  const board = { ...activeSetup(prefs, classes).board, ...parsed.lanes }
  return { ...prefs, board, step: parsed.step, split: parsed.split, caps: parsed.caps }
}

export function readBisPrefs(): BisPrefs {
  try {
    const raw = localStorage.getItem(BIS_KEY)
    return sanitizeBisPrefs(raw === null || raw === '' ? null : JSON.parse(raw))
  } catch {
    return DEFAULT_BIS_PREFS
  }
}

export function writeBisPrefs(prefs: BisPrefs): void {
  try {
    localStorage.setItem(BIS_KEY, JSON.stringify(prefs))
  } catch {
    // A choice that cannot be persisted still applies to this session.
  }
}
