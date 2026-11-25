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
  uniformBoard,
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
  /** the saved tier list in force (its name), or null for a preset; both are picked in the one Start from menu */
  list: string | null
  /** the totals table's Target column is open (off by default; owner: *"default off and if they click a button they can assign targets"*) */
  targets: boolean
  /** the attribute cap the "attributes at cap" fill uses: 510 published, raised by reincarnation AAs (no published numbers) */
  statCap: number
}

/** Legends' published attribute cap (agent/MEASURED.md, "BiS sheet research"). */
export const LEGENDS_STAT_CAP = 510

export const DEFAULT_LEVEL = 60

export const DEFAULT_BIS_PREFS: BisPrefs = { preset: 'classes', board: null, step: DEFAULT_STEP, split: false, caps: {}, level: DEFAULT_LEVEL, era: true, owned: false, list: null, targets: false, statCap: LEGENDS_STAT_CAP }

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
    owned: raw.owned === true,
    list: typeof raw.list === 'string' && raw.list.trim() !== '' ? raw.list : null,
    targets: raw.targets === true,
    statCap: typeof raw.statCap === 'number' && Number.isFinite(raw.statCap) && raw.statCap > 0 ? Math.round(raw.statCap) : LEGENDS_STAT_CAP
  }
}

/**
 * Several targets at once (a target IS the board's cap: the stat counts only up to it across the
 * loadout). `undefined` clears one. The board becomes the player's own, as a single cap does.
 */
export function withCaps(prefs: BisPrefs, setup: TierSetup, change: Partial<Record<TierChip, number | undefined>>): BisPrefs {
  const touched = new Set(Object.keys(change))
  const caps: Partial<Record<TierChip, number>> = Object.fromEntries(Object.entries(prefs.caps).filter(([k]) => !touched.has(k)))
  for (const [chip, v] of Object.entries(change) as [TierChip, number | undefined][]) {
    if (v !== undefined && Number.isFinite(v) && !isRatioChip(chip)) caps[chip] = v
  }
  return { ...prefs, caps, board: { ...setup.board } }
}

/** The tanking resist target (owner, 2026-11-24: *"resist gear should have a target of about 200 if you're going to be tanking"*). */
export const TANK_RESIST_TARGET = 200

/** Resists to the tanking target: the joined average, or each of the five when split. */
export function tankResistTargets(split: boolean): Partial<Record<TierChip, number>> {
  return split ? Object.fromEntries(SPLIT_RESISTS.map((c) => [c, TANK_RESIST_TARGET])) : { RESISTS: TANK_RESIST_TARGET }
}

/** The attributes the board shows as their own stats; STA lives inside HP and INT/WIS inside Mana, so they cannot take one. */
export const CAPPED_ATTRIBUTES: readonly TierChip[] = ['STR', 'DEX', 'AGI', 'CHA']

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

/** Every stat in the Unassigned lane, caps cleared (owner, 2026-11-24: *"a clear tier button so all stats drop to the "unassigned" section"*). */
export function withCleared(prefs: BisPrefs): BisPrefs {
  return { ...prefs, board: uniformBoard('Off'), caps: {} }
}

// ---- saved tier lists (owner, 2026-11-24: *"should be able to save the users Teir list settings, let them NAME them too"*) ----

export const SAVED_KEY = 'eq.gear.tierLists'

/** A named board: what the board text carries (lanes, step, split, caps), resolved, never "follow the default". */
export interface SavedBoard {
  name: string
  board: TierBoard
  step: TierStep
  split: boolean
  caps: Partial<Record<TierChip, number>>
}

export const SAVED_NAME_MAX = 40

export function sanitizeSaved(raw: unknown): SavedBoard[] {
  if (!Array.isArray(raw)) return []
  const out: SavedBoard[] = []
  for (const r of raw) {
    if (!isRecord(r) || typeof r.name !== 'string' || r.name.trim() === '') continue
    const board = sanitizeBoard(r.board)
    if (board === null) continue
    out.push({ name: r.name.trim().slice(0, SAVED_NAME_MAX), board, step: TIER_STEPS.find((s) => s === r.step) ?? DEFAULT_STEP, split: r.split === true, caps: sanitizeCaps(r.caps) })
  }
  return out
}

/** Save the board in force under a name: same name (any case) is replaced, the list kept in name order. */
export function withSavedBoard(list: readonly SavedBoard[], name: string, setup: TierSetup): SavedBoard[] {
  const clean = name.trim().slice(0, SAVED_NAME_MAX)
  if (clean === '') return [...list]
  const entry: SavedBoard = { name: clean, board: { ...setup.board }, step: setup.step, split: setup.split, caps: { ...setup.caps } }
  return [...list.filter((s) => s.name.toLowerCase() !== clean.toLowerCase()), entry].sort((a, b) => a.name.localeCompare(b.name))
}

/** A saved board put in force. */
export function withLoadedBoard(prefs: BisPrefs, saved: SavedBoard): BisPrefs {
  return { ...prefs, board: { ...saved.board }, step: saved.step, split: saved.split, caps: { ...saved.caps }, list: saved.name }
}

/** Is the board in force still the saved one, lane for lane, with its step, split and caps? */
export function matchesSaved(saved: SavedBoard, setup: TierSetup): boolean {
  return saved.step === setup.step && saved.split === setup.split && CHIP_KEYS.every((c) => saved.board[c] === setup.board[c] && saved.caps[c] === setup.caps[c])
}

export function readSavedBoards(): SavedBoard[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    return sanitizeSaved(raw === null || raw === '' ? null : JSON.parse(raw))
  } catch {
    return []
  }
}

export function writeSavedBoards(list: readonly SavedBoard[]): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  } catch {
    // Kept for this session only.
  }
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
