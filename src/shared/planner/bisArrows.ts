// planner/bisArrows.ts — BOWS AND ARROWS ON THE BEST IN SLOT SHEET (owner, 2026-11-25: *"If a bow is
// equipped in the ranged slot an arrow should be equipped in the ammo slot. Arrows should be
// prioritized by highest damage. Elemental damage should also be taken into consideration, but at a
// lesser amount than regular damage."*). The search's rule is in `bisSearch.ts`; this file says what a
// bow and an arrow are and how arrows rank.
//
// MEASURED 2026-11-25 over items.json: 121 RANGE items state `Skill: Archery`; of the AMMO arrows, 11
// state Archery and 46 state no skill at all (`Shardwing Arrow`, DMG 12, the best of them), so an
// AMMO item with no skill and "arrow" in its name is an arrow too. Elemental damage is on four arrows
// (`Fire DMG: 4` and the like, `GearRow.elementalDmg`).
//
// PURE, relative type imports only (the shared/planner house rule).

import type { GearRow } from './gear'

/** One point of elemental damage on an arrow counts half a point of DMG. */
export const ARROW_ELEMENTAL_WEIGHT = 0.5

const ARCHERY = /archery/i
const ARROW_NAME = /\barrows?\b/i

/** A weapon fired with the Archery skill. */
export function isBow(row: Pick<GearRow, 'skill'>): boolean {
  return row.skill !== undefined && ARCHERY.test(row.skill)
}

/** An AMMO item a bow fires: Archery stated, or no skill stated and "arrow" in the name. */
export function isArrow(row: Pick<GearRow, 'slots' | 'skill' | 'name'>): boolean {
  if (!row.slots.includes('AMMO')) return false
  return row.skill === undefined ? ARROW_NAME.test(row.name) : ARCHERY.test(row.skill)
}

/** What an arrow is ranked by first: DMG, plus elemental damage at `ARROW_ELEMENTAL_WEIGHT`. */
export function arrowRank(row: Pick<GearRow, 'stats' | 'elementalDmg'>): number {
  return (row.stats.DMG ?? 0) + ARROW_ELEMENTAL_WEIGHT * (row.elementalDmg ?? 0)
}
