// The `skills` module across an archived log and the live one (src/shared/logArchive/mergeSkills.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { mergeSkills } from '../src/shared/logArchive/mergeSkills'
import { CAPTURED_MODULES } from '../src/shared/logArchive/modules'
import type { SkillRow, SkillsSnap } from '../src/shared/skills'

const ARCHIVED: SkillsSnap = {
  rows: [
    { skill: 'Fishing', value: 120, lastTs: 100, sessionUps: 3, sessionFirstTs: 50 },
    { skill: 'Baking', value: 40, lastTs: 90, sessionUps: 2, sessionFirstTs: 80 }
  ]
}

const LIVE: SkillsSnap = {
  rows: [
    { skill: 'Fishing', value: 127, lastTs: 900, sessionUps: 1, sessionFirstTs: 900, firstValue: 127, firstTs: 900 }
  ]
}

/** The live log's Fishing row when its first line, at 900, restated the archive's 120. */
const reopened = (over: Partial<SkillRow>): SkillRow | undefined => {
  const row: SkillRow = { skill: 'Fishing', value: 120, lastTs: 900, sessionUps: 0, firstValue: 120, firstTs: 900 }
  return mergeSkills(ARCHIVED, { rows: [{ ...row, ...over }] })?.rows[0]
}

test('a skill both logs raised takes the newer row whole', () => {
  const merged = mergeSkills(ARCHIVED, LIVE)
  assert.deepEqual(merged?.rows[0], LIVE.rows[0])
})

test('a skill only the older log raised keeps its level, with no session', () => {
  const merged = mergeSkills(ARCHIVED, LIVE)
  assert.deepEqual(merged?.rows.slice(1), [{ skill: 'Baking', value: 40, lastTs: 90, sessionUps: 0 }])
})

test('a level that dropped in the newer log is the level shown', () => {
  const newer: SkillsSnap = { rows: [{ skill: 'Baking', value: 12, lastTs: 500, sessionUps: 0 }] }
  assert.equal(mergeSkills(ARCHIVED, newer)?.rows[0].value, 12)
})

test('a first line that repeats the archived level is not a raise', () => {
  const row = reopened({ sessionUps: 1, sessionFirstTs: 900 })
  assert.deepEqual(row, { skill: 'Fishing', value: 120, lastTs: 100, sessionUps: 0, firstValue: 120, firstTs: 900 })
})

test('raises after a repeated first line are counted without it', () => {
  const row = reopened({ value: 122, lastTs: 1_500, sessionUps: 3, sessionFirstTs: 900 })
  assert.deepEqual(
    [row?.value, row?.lastTs, row?.sessionUps, row?.sessionFirstTs],
    [122, 1_500, 2, 900]
  )
})

test('a session that began after the repeated first line keeps its count', () => {
  const later = reopened({ value: 121, lastTs: 5_000, sessionUps: 1, sessionFirstTs: 5_000 })
  assert.deepEqual([later?.lastTs, later?.sessionUps, later?.sessionFirstTs], [5_000, 1, 5_000])
  // The repeat alone, its session over: the last raise is still the archive's.
  assert.deepEqual([reopened({})?.lastTs, reopened({})?.sessionUps], [100, 0])
})

test('a first line at another level than the archived one is a raise', () => {
  const row = reopened({ value: 121, firstValue: 121, sessionUps: 1, sessionFirstTs: 900 })
  assert.deepEqual([row?.lastTs, row?.sessionUps, row?.sessionFirstTs], [900, 1, 900])
})

test('another shape is not merged', () => {
  assert.equal(mergeSkills(ARCHIVED, { levels: [] }), null)
  assert.equal(mergeSkills({ rows: [{ value: 1 }] }, LIVE), null)
  assert.equal(mergeSkills(null, LIVE), null)
  assert.equal(mergeSkills([], LIVE), null)
})

test('the module is captured and joined across archives', () => {
  assert.ok(hasMergeRule('skills'))
  assert.ok(CAPTURED_MODULES.includes('skills'))
  const merged = mergeModule('skills', [ARCHIVED], LIVE)
  assert.equal(merged.used, 1)
  assert.deepEqual((merged.state as SkillsSnap).rows.map((r) => r.skill), ['Fishing', 'Baking'])
})

test('with no skill raised in the live log, the archived levels still show, sessions over', () => {
  const merged = mergeModule('skills', [ARCHIVED], { rows: [] })
  assert.equal(merged.used, 1)
  assert.deepEqual((merged.state as SkillsSnap).rows, [
    { skill: 'Fishing', value: 120, lastTs: 100, sessionUps: 0 },
    { skill: 'Baking', value: 40, lastTs: 90, sessionUps: 0 }
  ])
})
