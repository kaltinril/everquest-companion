// shared/logArchive/mergeRules.ts — WHICH MODULES HAVE HISTORY, and the fold that applies it.
//
// One line per module with a merge rule. A module without a line shows the live log only, as it
// always has; a segment still stores its snapshot, so the day its line lands it applies to logs
// archived earlier too (phase 4).

import { mergeConsider } from './mergeConsider'
import { mergeItemTiers } from './mergeItemTiers'
import { mergeKills } from './mergeKills'
import { mergeLeveling } from './mergeLeveling'
import { mergeLoot } from './mergeLoot'
import { mergeRespawn } from './mergeRespawn'
import { mergeClassUnlocks, mergeTurnIns } from './mergeUnlocksTurnIns'

/** Older then newer, or null when the two cannot be merged (that segment is left out). */
export type MergeRule = (older: unknown, newer: unknown) => unknown

export const MERGE_RULES: Readonly<Record<string, MergeRule>> = {
  kills: mergeKills,
  loot: mergeLoot,
  leveling: mergeLeveling,
  consider: mergeConsider,
  itemTiers: mergeItemTiers,
  classUnlocks: mergeClassUnlocks,
  turnins: mergeTurnIns,
  respawn: mergeRespawn
}

export function hasMergeRule(moduleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(MERGE_RULES, moduleId)
}

export interface MergedModule {
  state: unknown
  /** How many of the offered archived states went into `state`. */
  used: number
}

/**
 * `archived` (oldest first) folded together, then the live state on top. An archived state the
 * rule cannot join to the live state's shape is skipped, so an old-format archive never blocks the
 * archives after it. With no rule, or nothing usable, the live state comes back untouched, the
 * same object.
 */
export function mergeModule(moduleId: string, archived: readonly unknown[], live: unknown): MergedModule {
  const rule = hasMergeRule(moduleId) ? MERGE_RULES[moduleId] : undefined
  if (rule === undefined || archived.length === 0) return { state: live, used: 0 }
  const template = emptyLike(live)
  let acc: unknown = undefined
  let used = 0
  for (const state of archived) {
    const alone = rule(state, template)
    if (alone === null) continue
    const next = acc === undefined ? alone : rule(acc, state)
    if (next === null) continue
    acc = next
    used++
  }
  if (acc === undefined) return { state: live, used: 0 }
  const merged = rule(acc, live)
  return merged === null ? { state: live, used: 0 } : { state: merged, used }
}

/**
 * An empty value of the live state's shape (same version stamps, empty lists and maps). Joining an
 * archived state to it is how each one is checked against the live shape before it is used.
 *
 * A state that is itself a map of rows (`itemTiers`: every value a record) empties to `{}`, not to
 * a map of empty records that no rule would accept as rows. Added with step 4.2.
 */
function emptyLike(state: unknown): unknown {
  if (Array.isArray(state)) return []
  if (state === null || typeof state !== 'object') return state
  if (Object.values(state).every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(state)) {
    out[k] = Array.isArray(v) ? [] : v !== null && typeof v === 'object' ? {} : v
  }
  return out
}
