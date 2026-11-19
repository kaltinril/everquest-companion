// shared/logArchive/mergeSkills.ts — the `skills` module across an archive and the live log.
//
// A skill's level is the newest one stated, so a skill both sides raised takes the newer row
// whole. A skill only the older side raised keeps its level and last raise, with its session
// columns emptied: an older log's session is over.

import type { SkillRow, SkillsSnap } from '../skills'

function isRow(x: unknown): x is SkillRow {
  return x !== null && typeof x === 'object' && typeof (x as { skill?: unknown }).skill === 'string'
}

function isSkillsSnap(x: unknown): x is SkillsSnap {
  if (x === null || typeof x !== 'object') return false
  const rows = (x as { rows?: unknown }).rows
  return Array.isArray(rows) && rows.every(isRow)
}

/** `older` then `newer`, or null when either is not a skills snapshot. */
export function mergeSkills(older: unknown, newer: unknown): SkillsSnap | null {
  if (!isSkillsSnap(older) || !isSkillsSnap(newer)) return null
  const have = new Set(newer.rows.map((r) => r.skill))
  const carried = older.rows
    .filter((r) => !have.has(r.skill))
    .map((r): SkillRow => ({ skill: r.skill, value: r.value, lastTs: r.lastTs, sessionUps: 0 }))
  return { ...newer, rows: [...newer.rows, ...carried] }
}
