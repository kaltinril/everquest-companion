// shared/logArchive/mergeSkills.ts — the `skills` module across an archive and the live log.
//
// A skill's level is the newest one stated, so a skill both sides raised takes the newer row
// whole. A skill only the older side raised keeps its level and last raise, with its session
// columns emptied: an older log's session is over.
//
// The engine counts a log's first line for a skill as a raise, having nothing to compare it with.
// When that line states the level the older log ended on, it was a repeat and is taken back out.

import type { SkillRow, SkillsSnap } from '../skills'

function isRow(x: unknown): x is SkillRow {
  return x !== null && typeof x === 'object' && typeof (x as { skill?: unknown }).skill === 'string'
}

function isSkillsSnap(x: unknown): x is SkillsSnap {
  if (x === null || typeof x !== 'object') return false
  const rows = (x as { rows?: unknown }).rows
  return Array.isArray(rows) && rows.every(isRow)
}

/** The newer row, less its log's first line when that line repeated the older log's level. */
function joined(older: SkillRow | undefined, newer: SkillRow): SkillRow {
  if (older === undefined || newer.firstTs === undefined || newer.firstValue !== older.value) return newer
  const row: SkillRow = { ...newer }
  // The session counted that line only while no offline gap has followed it.
  if (row.sessionFirstTs === newer.firstTs) {
    row.sessionUps = Math.max(0, row.sessionUps - 1)
    if (row.sessionUps === 0) delete row.sessionFirstTs
  }
  // Nothing after it changed the level: the last raise is still the older log's.
  if (newer.lastTs === newer.firstTs && newer.value === newer.firstValue) row.lastTs = older.lastTs
  return row
}

/** `older` then `newer`, or null when either is not a skills snapshot. */
export function mergeSkills(older: unknown, newer: unknown): SkillsSnap | null {
  if (!isSkillsSnap(older) || !isSkillsSnap(newer)) return null
  const held = new Map(older.rows.map((r) => [r.skill, r]))
  const have = new Set(newer.rows.map((r) => r.skill))
  const carried = older.rows
    .filter((r) => !have.has(r.skill))
    .map((r): SkillRow => ({ skill: r.skill, value: r.value, lastTs: r.lastTs, sessionUps: 0 }))
  return { ...newer, rows: [...newer.rows.map((r) => joined(held.get(r.skill), r)), ...carried] }
}
