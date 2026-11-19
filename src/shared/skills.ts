// The engine's `skills` module state (fork #6): one row per skill the log has seen go up, at the
// newest level it stated, with this session's raises. A session is since the newest offline gap.
//
// A skill that never went up in the log has no row: the log states a level only on a raise.

import { rateMeasurable } from './rateBasis'
import { tradeskillOf } from './tradeskills'

export const SKILLS_MODULE = 'skills'

export interface SkillRow {
  /** As the client spells it. */
  skill: string
  /** The newest level the log stated. It can be lower than an earlier one. */
  value: number
  lastTs: number
  /** Raises this session; 0 when the skill has not gone up in it. */
  sessionUps: number
  /** This session's first raise; absent when it has none. */
  sessionFirstTs?: number
}

export interface SkillsSnap {
  rows: SkillRow[]
}

export function isTradeskillRow(row: SkillRow): boolean {
  return tradeskillOf(row.skill) !== undefined
}

/**
 * Raises per hour between this session's first and latest raise of the skill, or null when there
 * is no measurable span: the first raise opens the clock, so two are needed.
 */
export function skillRatePerHour(row: SkillRow): number | null {
  if (row.sessionUps < 2 || row.sessionFirstTs === undefined) return null
  const span = row.lastTs - row.sessionFirstTs
  if (!rateMeasurable(span)) return null
  return ((row.sessionUps - 1) * 3_600_000) / span
}

/** The table's rows: newest raise first, ties by name. */
export function skillRows(rows: readonly SkillRow[], tradeskillsOnly: boolean): SkillRow[] {
  const kept = tradeskillsOnly ? rows.filter(isTradeskillRow) : [...rows]
  return kept.sort((a, b) => b.lastTs - a.lastTs || a.skill.localeCompare(b.skill))
}
