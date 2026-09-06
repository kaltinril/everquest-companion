// factions/factionTiers.ts — standing number → /con rung. PURE (no React, no IPC), node-testable.
//
// THE DUMP SAYS A NUMBER AND THE GAME SPEAKS IN RUNGS. `/outputfile faction` states an absolute
// standing in [-2000, 2000] (shared/outputs/factions.ts, measured); what a player actually meets
// in the world is the /con ladder — "kindly considers you", "scowls at you, ready to attack" —
// and the Factions tab draws both, the number for precision and the rung for meaning. The rungs,
// their labels and their palette are the app's ONE ladder (shared/considerFaction.ts), so a chip
// here and a chip on the con card cannot drift apart.
//
// THE FLOORS ARE ASSUMED, NOT MEASURED, and this header is where that assumption lives (the
// CLASS_UNLOCK_TOKEN_ROW discipline): they are the classic-EQ community/emulator thresholds,
// which no Legends dump can confirm or deny by itself — the file states numbers, never rungs.
// What WOULD settle them is a `/con` beside a fresh dump: the con line names the rung and the
// dump names the number, and a pair that disagrees with this table names the exact floor that is
// wrong. Until someone collects those pairs, a chip drawn from this table is the community's
// claim about the game, presented as the rung the number most plausibly means.
//
//   ally          1100 … 2000
//   warmly         750 … 1099
//   kindly         500 …  749
//   amiably        100 …  499
//   indifferent      0 …   99
//   apprehensive  -100 …   -1
//   dubious       -500 … -101
//   threatening   -750 … -501
//   scowls       -2000 … -751

import type { ConsiderFaction } from '@shared/considerFaction'

/** Rung floors, friendliest first: a standing belongs to the first rung whose floor it reaches. */
export const FACTION_TIER_FLOORS: readonly { faction: ConsiderFaction; floor: number }[] = [
  { faction: 'ally', floor: 1100 },
  { faction: 'warmly', floor: 750 },
  { faction: 'kindly', floor: 500 },
  { faction: 'amiably', floor: 100 },
  { faction: 'indifferent', floor: 0 },
  { faction: 'apprehensive', floor: -100 },
  { faction: 'dubious', floor: -500 },
  { faction: 'threatening', floor: -750 },
  // The last floor is the scale's own bottom, so the walk below cannot fall off the table: every
  // in-range standing reaches SOME floor, and an out-of-range one (a format change) still lands
  // on an honest extreme rather than throwing in a render.
  { faction: 'scowls', floor: -2000 }
]

/** The rung a standing most plausibly means — see the header for exactly what is assumed. */
export function factionTier(standing: number): ConsiderFaction {
  for (const { faction, floor } of FACTION_TIER_FLOORS) {
    if (standing >= floor) return faction
  }
  return 'scowls'
}
