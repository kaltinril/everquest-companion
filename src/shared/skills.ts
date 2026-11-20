// The engine's `skills` module state (fork #6): one row per skill the log has seen go up, at the
// newest level it stated, with this session's raises. A session is since the newest offline gap.
//
// A skill that never went up in the log has no row: the log states a level only on a raise.

import { RATE_MIN_MS, rateMeasurable } from './rateBasis'
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
  /** Its log's first line for the skill, level and time; a row carried from an older log has none. */
  firstValue?: number
  firstTs?: number
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

const RATE_MIN_MINUTES = String(RATE_MIN_MS / 60_000)

/** The Per hour heading's tooltip: what the number is and when it is shown. */
export const SKILL_RATE_TIP =
  "Raises per hour between this session's first and latest raise of the skill. " +
  `Shown once two raises are at least ${RATE_MIN_MINUTES} minutes apart.`

/** Why a row with one raise this session has no pace. */
export const SKILL_RATE_NEEDS_SECOND = 'Needs a second raise this session. The first raise starts the clock.'

/** Why a row with several raises this session has no pace yet. */
export const SKILL_RATE_TOO_SHORT =
  `This session's raises of this skill are under ${RATE_MIN_MINUTES} minutes apart, ` +
  'too little to state as a rate per hour.'

/**
 * The Per hour cell: the pace, or `why` it is withheld. Both null when the skill has not gone up
 * this session: the cell stays empty, like This session.
 */
export function skillRateCell(row: SkillRow): { rate: number | null; why: string | null } {
  if (row.sessionUps <= 0) return { rate: null, why: null }
  const rate = skillRatePerHour(row)
  if (rate !== null) return { rate, why: null }
  const one = row.sessionUps < 2 || row.sessionFirstTs === undefined
  return { rate: null, why: one ? SKILL_RATE_NEEDS_SECOND : SKILL_RATE_TOO_SHORT }
}

/** The table's rows: newest raise first, ties by name. */
export function skillRows(rows: readonly SkillRow[], tradeskillsOnly: boolean): SkillRow[] {
  const kept = tradeskillsOnly ? rows.filter(isTradeskillRow) : [...rows]
  return kept.sort((a, b) => b.lastTs - a.lastTs || a.skill.localeCompare(b.skill))
}
