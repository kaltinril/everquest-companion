// The level bar's cap note gives way when the log's Crafting Mastery rank leaves room (owner,
// 2026-11-20: "I think there are AA's that pertain to crafting, we should somehow show stuff
// related to that"). The wiki: past 200 in one tradeskill the others cap at 200 until Crafting
// Mastery; each rank lets one more standard tradeskill go from 200 to 300.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { levelBar, liftedNote } from '../src/shared/tradeskillLevelBar'
import { craftingMasteryRank } from '../src/shared/tradeskillAa'
import type { SkillRow } from '../src/shared/skills'

function row(skill: string, value: number): SkillRow {
  return { skill, value, lastTs: 1, sessionUps: 0, firstValue: value, firstTs: 1 } as SkillRow
}

const ONE_PAST = [row('Jewelry Making', 205), row('Baking', 5), row('Brewing', 8)]
const TWO_PAST = [row('Jewelry Making', 205), row('Tailoring', 230), row('Baking', 5)]

test('with no Crafting Mastery in the log, a tradeskill under 200 beside one past it is capped', () => {
  const bar = levelBar(ONE_PAST, 'Baking')
  assert.equal(bar.cappedBy, 'Jewelcrafting')
  assert.equal(bar.liftedBy, null)
  assert.notEqual(bar.capTick, null)
})

test('one rank leaves room for one more past 200: the cap note and the tick give way', () => {
  const bar = levelBar(ONE_PAST, 'Baking', 1)
  assert.equal(bar.cappedBy, null)
  assert.equal(bar.capTick, null)
  assert.equal(bar.liftedBy, 1)
  assert.equal(liftedNote(1), 'can pass 200: Crafting Mastery rank 1 in your log')
})

test('a rank already used by a second tradeskill past 200 leaves no room', () => {
  // Two others are past 200: the first needed no rank, the second took rank 1.
  const used = levelBar(TWO_PAST, 'Baking', 1)
  assert.equal(used.cappedBy, 'Jewelcrafting')
  assert.equal(used.liftedBy, null)
  assert.equal(levelBar(TWO_PAST, 'Baking', 2).liftedBy, 2)
})

test('the rule is not drawn where it does not apply, whatever the rank', () => {
  assert.equal(levelBar(ONE_PAST, 'Jewelcrafting', 6).liftedBy, null, 'the one past 200 is not capped')
  assert.equal(levelBar(ONE_PAST, 'Tailoring', 6).liftedBy, null, 'a level the log never showed')
  assert.equal(levelBar([row('Baking', 5)], 'Baking', 6).liftedBy, null, 'nothing is past 200')
})

test('the rank is the highest the purchase lines name, and 0 when the log shows none', () => {
  assert.equal(craftingMasteryRank(null), 0)
  assert.equal(craftingMasteryRank([]), 0)
})
