// planner/statCaps.ts — THE GAME'S CAPS THE BEST IN SLOT SHEET READS: the level cap by date (and the
// caps added below it). Sources: agent/MEASURED.md and eqlwiki's Statistics page.
//
// PURE, no imports (the shared/planner house rule).

/** Rulers of Kunark opens on this LOCAL date (month is 0-based): the level cap goes from 50 to 55. */
export const KUNARK_LAUNCH = new Date(2026, 11, 8)

/** The highest level a character can be on `now` (owner, 2026-11-25: *"Characters should be level 50 at most"*). */
export function maxCharacterLevel(now: Date = new Date()): number {
  return now.getTime() >= KUNARK_LAUNCH.getTime() ? 55 : 50
}
