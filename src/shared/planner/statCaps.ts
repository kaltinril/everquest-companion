// planner/statCaps.ts — THE GAME'S CAPS THE BEST IN SLOT SHEET READS: the level cap by date and the
// haste cap by level. Sources: agent/MEASURED.md and eqlwiki's Statistics page.
//
// PURE, no imports (the shared/planner house rule).

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
