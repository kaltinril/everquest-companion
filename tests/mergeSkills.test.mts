// The `skills` module across an archived log and the live one (src/shared/logArchive/mergeSkills.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { mergeSkills } from '../src/shared/logArchive/mergeSkills'
import { CAPTURED_MODULES } from '../src/shared/logArchive/modules'
import type { SkillsSnap } from '../src/shared/skills'

const ARCHIVED: SkillsSnap = {
  rows: [
    { skill: 'Fishing', value: 120, lastTs: 100, sessionUps: 3, sessionFirstTs: 50 },
    { skill: 'Baking', value: 40, lastTs: 90, sessionUps: 2, sessionFirstTs: 80 }
  ]
}

const LIVE: SkillsSnap = {
  rows: [{ skill: 'Fishing', value: 127, lastTs: 900, sessionUps: 1, sessionFirstTs: 900 }]
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
