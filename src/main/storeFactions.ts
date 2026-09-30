// storeFactions.ts — the `/outputfile faction` dump's store accessor (the third graduated kind).
//
// `storeAchievements.ts`'s arrangement, verbatim, and for its reasons: SPLIT OUT OF store.ts FOR
// FILE MASS, NOT FOR SCOPE (store.ts sits at the measured 400-code-line ceiling and the answer to
// that is a split); `setProgress` is still the one write path into `byCharacter`; and the
// standings being written were already taken at the one place the file becomes the model
// (`outputs/index.ts loadFactions`), so this file decides nothing about what a factions dump
// means.
//
// THE ARTIFACT AND ITS SOURCE ARE WRITTEN TOGETHER, the `setInventory`/`setAchievements` symmetry
// exactly, so neither half can end up describing the other's dump.
//
// NO SCHEMA BUMP AND NO MIGRATION, the `exaltPlans` precedent: `factionStandings` and
// `factionsSource` are ADDITIVE optional keys, every reader defaults on a missing one, and
// electron-store rewrites the whole parsed object so both survive a round trip through an older
// build.

import type { FactionStanding, FactionsSource } from '../shared/outputs/factions'
import type { ProgressState } from '../shared/types'
import { getProgress, setProgress } from './store'

/** Record the factions dump's standings and where they came from. */
export function setFactions(
  charId: string,
  standings: FactionStanding[],
  source: FactionsSource
): ProgressState {
  const p = getProgress(charId)
  return setProgress(charId, { ...p, factionStandings: standings, factionsSource: source })
}
