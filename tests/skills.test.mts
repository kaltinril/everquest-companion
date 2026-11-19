// The Skills tab's rows, from the engine's `skills` state (src/shared/skills.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RATE_MIN_MS } from '../src/shared/rateBasis'
import { isTradeskillRow, skillRatePerHour, skillRows, type SkillRow } from '../src/shared/skills'

const HOUR = 3_600_000

const row = (skill: string, over: Partial<SkillRow> = {}): SkillRow => ({
  skill,
  value: 100,
  lastTs: 1_000,
  sessionUps: 0,
  ...over
})

test('the newest raise is first, and a tie is broken by name', () => {
  const rows = [row('Taunt', { lastTs: 5 }), row('Kick', { lastTs: 9 }), row('Bash', { lastTs: 5 })]
  assert.deepEqual(skillRows(rows, false).map((r) => r.skill), ['Kick', 'Bash', 'Taunt'])
  // The engine's rows are left in their own order.
  assert.deepEqual(rows.map((r) => r.skill), ['Taunt', 'Kick', 'Bash'])
})

test('the tradeskill filter knows the client spellings', () => {
  for (const skill of ['Jewelry Making', 'Make Poison', 'Research', 'Fishing']) {
    assert.ok(isTradeskillRow(row(skill)), skill)
  }
  for (const skill of ['Kick', 'Specialize Evocation']) assert.ok(!isTradeskillRow(row(skill)), skill)
  const rows = [row('Kick', { lastTs: 9 }), row('Fishing', { lastTs: 5 }), row('Research', { lastTs: 7 })]
  assert.deepEqual(skillRows(rows, true).map((r) => r.skill), ['Research', 'Fishing'])
})

test('one raise is no rate: the first raise only opens the clock', () => {
  assert.equal(skillRatePerHour(row('Fishing', { sessionUps: 1, sessionFirstTs: 1_000 })), null)
  assert.equal(skillRatePerHour(row('Fishing')), null)
})

test('a span under the rate floor is no rate', () => {
  const short = row('Fishing', { sessionUps: 4, sessionFirstTs: 0, lastTs: RATE_MIN_MS - 1 })
  assert.equal(skillRatePerHour(short), null)
  const enough = row('Fishing', { sessionUps: 2, sessionFirstTs: 0, lastTs: RATE_MIN_MS })
  assert.equal(skillRatePerHour(enough), HOUR / RATE_MIN_MS)
})

test('the rate is the raises after the first, per hour between the first and the latest', () => {
  const worked = row('Fishing', { sessionUps: 7, sessionFirstTs: 10_000, lastTs: 10_000 + 2 * HOUR })
  assert.equal(skillRatePerHour(worked), 3)
})
