// THE TIME BESIDE A DAMAGE HEADLINE (features/combat/headlineClock.ts).
//
// The headline rate is over the fight's length at level 1, and over a shorter clock under the You
// scope or a drill (requirements/meter-dps-clock.md). The Combat tab's header already printed the
// time as total / rate. The Overview card did not: it printed the fight's length and the fight's
// active rate under a headline taken over a shorter clock, so its own three figures did not agree.
//
// The numbers are the owner's measured fight: 7,247 damage, a 17 s fight, his own clock 14 s.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { headlineClockSec, supportLine } from '../src/renderer/src/features/combat/headlineClock'
import { fmtDur } from '../src/renderer/src/features/combat/copyTable'

const TOTAL = 7247
const FIGHT_SEC = 17
const OWN_SEC = 14

test('the clock is read back off the total and the rate printed beside it', () => {
  assert.equal(fmtDur(headlineClockSec(TOTAL, TOTAL / OWN_SEC, FIGHT_SEC)), '0:14')
  // Level 1: the rate is over the fight, so the clock is the fight's length, as before.
  assert.equal(fmtDur(headlineClockSec(TOTAL, TOTAL / FIGHT_SEC, FIGHT_SEC)), '0:17')
})

test('with no rate to read it from, the clock is the fight’s length', () => {
  assert.equal(headlineClockSec(0, 0, FIGHT_SEC), FIGHT_SEC)
  assert.equal(headlineClockSec(TOTAL, 0, FIGHT_SEC), FIGHT_SEC)
})

test('the card’s line prints the headline’s own clock, not the fight’s length', () => {
  // Scope You: 518 dps over 14 s. The fight's active rate (16 s of it) is 453, below the headline.
  const line = supportLine({ total: TOTAL, dps: TOTAL / OWN_SEC, activeDps: TOTAL / 16 }, FIGHT_SEC)
  assert.equal(line, '7.2k total · 0:14')
})

test('an active rate above the headline is still printed', () => {
  const line = supportLine({ total: TOTAL, dps: TOTAL / FIGHT_SEC, activeDps: TOTAL / 15 }, FIGHT_SEC)
  assert.equal(line, '7.2k total · 0:17 · 483 dps active')
})

test('a fight with no idle gaps keeps its line as it was', () => {
  const dps = TOTAL / FIGHT_SEC
  assert.equal(supportLine({ total: TOTAL, dps, activeDps: dps }, FIGHT_SEC), '7.2k total · 0:17 · 426 dps active')
  assert.equal(supportLine({ total: 0, dps: 0, activeDps: 0 }, 0), '0 total · 0:00 · 0 dps active')
})

test('the Overview card and the Combat tab header both read the clock here', () => {
  const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const card = read('../src/renderer/src/features/overview/DpsCard.tsx')
  assert.match(card, /\bsupportLine\s*\(/, 'the card builds its own supporting line again')
  assert.doesNotMatch(card, /fmtDur\(seg\.durationSec\)/, 'the card prints the fight length under any headline')
  const header = read('../src/renderer/src/features/combat/SegmentHeader.tsx')
  assert.match(header, /\bheadlineClockSec\s*\(/, 'the header works its clock out apart from the card')
})
