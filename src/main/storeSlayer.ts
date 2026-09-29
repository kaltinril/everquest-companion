// storeSlayer.ts — the achievements dump's Slayer counters, written to the store.
//
// A file of its own for the reason storeAchievements.ts gives (store.ts sits at the line
// ceiling), and a WRITE of its own rather than a fourth argument to `setAchievements` so the
// class-unlock write keeps its signature. Both writes come from one read of one file
// (session.ts `loadAchievementsNow`), so `achievementsSource` describes this key too.
//
// ADDITIVE and OPTIONAL, the `exaltPlans` precedent: no schema bump and no migration, every
// reader defaults on a missing key.

import type { SlayerRecord } from '../shared/outputs/slayer'
import type { ProgressState } from '../shared/types'
import { getProgress, setProgress } from './store'

/** Record what the achievements dump says is left of the Slayer achievements. */
export function setSlayer(charId: string, slayer: SlayerRecord): ProgressState {
  return setProgress(charId, { ...getProgress(charId), slayer })
}
