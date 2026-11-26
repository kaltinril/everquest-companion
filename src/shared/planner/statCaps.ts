// planner/statCaps.ts — THE GAME'S CAPS THE BEST IN SLOT SHEET READS: the attribute caps, the level cap
// by date and the haste cap by level. Sources: agent/MEASURED.md and eqlwiki's Statistics page.
//
// A CAP IS A VALUE AND A RATE: up to `value` a point counts in full, above it each point counts `over`.
// A hard cap is `over: 0` (owner, 2026-11-25: *"Use hard caps for stats from
// https://eqlwiki.com/Statistics by default"*). The seam for soft caps: a caller that knows the
// character's reincarnations and AA ranks passes its own `StatCaps` (510 plus the bonuses, `over` 0.2).
//
// PURE, no imports (the shared/planner house rule).

/** Up to `value` a point counts in full; above it each point counts `over` (0 = a hard cap). */
export interface StatCap {
  value: number
  over: number
}

/** eqlwiki's Statistics page: the seven attributes hard-cap at 510; AC, HP, mana and resists state no cap. */
export const ATTRIBUTE_HARD_CAP = 510

export type Attribute = 'STR' | 'STA' | 'AGI' | 'DEX' | 'WIS' | 'INT' | 'CHA'

export const ATTRIBUTES: readonly Attribute[] = ['STR', 'STA', 'AGI', 'DEX', 'WIS', 'INT', 'CHA']

export type StatCaps = Readonly<Partial<Record<Attribute, StatCap>>>

/** The default: every attribute hard-capped at 510. */
export const HARD_STAT_CAPS: StatCaps = Object.fromEntries(ATTRIBUTES.map((a) => [a, { value: ATTRIBUTE_HARD_CAP, over: 0 }]))

export function isAttribute(key: string): key is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(key)
}

/** How much of `total` counts under the cap: all of it up to `value`, then `over` per point above. */
export function countedAmount(total: number, cap: StatCap | undefined): number {
  if (cap === undefined || total <= cap.value) return total
  return cap.value + (total - cap.value) * cap.over
}

/** Rulers of Kunark opens on this LOCAL date (month is 0-based): the level cap goes from 50 to 55. */
export const KUNARK_LAUNCH = new Date(2026, 11, 8)

/** The highest level a character can be on `now` (owner, 2026-11-25: *"Characters should be level 50 at most"*). */
export function maxCharacterLevel(now: Date = new Date()): number {
  return now.getTime() >= KUNARK_LAUNCH.getTime() ? 55 : 50
}

/** The total haste cap at a level: level + 25 up to 50, 85 at 51-59, 100 from 60 (agent/MEASURED.md). */
export function hasteCapAt(level: number): number {
  if (level >= 60) return 100
  return level > 50 ? 85 : level + 25
}

/** The item haste that can still count: the level's cap less the spell haste the character reliably has, never below 0. */
export function itemHasteRoom(level: number, spellHaste: number): number {
  return Math.max(0, hasteCapAt(level) - Math.max(0, spellHaste))
}

/** Every attribute at one cap: the reincarnation soft cap (shared/reincarnationCap.ts), or the hard default. */
export function attributeCaps(cap: StatCap): StatCaps {
  return Object.fromEntries(ATTRIBUTES.map((a) => [a, { value: cap.value, over: cap.over }]))
}
