// The Buffs tab's small formatters (features/buffs/format.ts): what a running card says once its
// buff has outlived the estimate, and how the Durations table prints a short duration. The engine's
// own fixture is three clean casts of 50 s, 52 s and 100 s, so "From my log" estimates the median,
// 52 s, while p75 over every sample is 76 s.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ActiveBuff } from '../src/shared/buffTypes'
import { estimateState, estimateText, fmtElapsed, fmtPrecise, leftCaption, statCells } from '../src/renderer/src/features/buffs/format'

function buff(over: Partial<ActiveBuff>): ActiveBuff {
  return { spell: 'Swift Like the Wind', cls: 'buff', self: true, startedTs: 0, estimatedMs: null, p25: null, p75: null, n: 0, ...over }
}

test('a "From my log" buff past its median reads past estimate, not a blank time', () => {
  const median = buff({ estimatedMs: 52_000, durationSource: 'logMedian', p25: 51_000, p75: 76_000, n: 3 })
  assert.equal(estimateState(median, 40_000).overdue, false)
  // Between the median and p75: the old rule waited for p75 and the caption read "~- left".
  assert.equal(estimateState(median, 60_000).overdue, true)
  assert.equal(estimateState(median, 80_000).overdue, true)
})

test('one logged cast is enough to be past it', () => {
  // n = 1 never satisfied the p75 rule, so the card sat on a blank time until the buff faded.
  const once = buff({ estimatedMs: 52_000, durationSource: 'logMedian', p25: 52_000, p75: 52_000, n: 1 })
  assert.equal(estimateState(once, 40_000).overdue, false)
  assert.equal(estimateState(once, 60_000).overdue, true)
  const observed = buff({ estimatedMs: 52_000, durationSource: 'observed', p25: 52_000, p75: 52_000, n: 1 })
  assert.equal(estimateState(observed, 40_000).overdue, false)
  assert.equal(estimateState(observed, 60_000).overdue, true)
})

test('the stated sources keep their rule: past the number is past the estimate', () => {
  for (const durationSource of ['db', 'deathBound', 'manual'] as const) {
    const stated = buff({ estimatedMs: 30_000, durationSource })
    assert.equal(estimateState(stated, 30_000).overdue, false, durationSource)
    assert.equal(estimateState(stated, 31_000).overdue, true, durationSource)
  }
})

test('a buff with no estimate has no bar and is never overdue', () => {
  assert.deepEqual(estimateState(buff({}), 999_000), { est: null, spread: null, overdue: false })
  assert.equal(estimateState(buff({ estimatedMs: 0 }), 999_000).est, null)
})

test('the spread is half the gap between p25 and p75', () => {
  assert.equal(estimateState(buff({ estimatedMs: 52_000, p25: 51_000, p75: 76_000, n: 3 }), 0).spread, 12_500)
})

test('the time-left caption never prints a dash where a time belongs', () => {
  assert.equal(leftCaption('db', 12_000), '~12s left')
  assert.equal(leftCaption('deathBound', 12_000), '≥ 12s left')
  // The exact second the estimate runs out: the overlay prints 0s there, and so does the card.
  assert.equal(leftCaption('logMedian', 0), '~0s left')
  assert.equal(leftCaption(undefined, 0), '~0s left')
  for (const ms of [0, 1, 499, 500, 59_999, 60_000]) {
    assert.ok(!leftCaption('observed', ms).includes('- left'), String(ms))
  }
})

test('a short duration keeps its tenths: 7.5 is not 8', () => {
  assert.equal(fmtPrecise(7500), '7.5s')
  assert.equal(fmtPrecise(7400), '7.4s')
  assert.equal(fmtPrecise(8000), '8s')
  // A minute and over reads as every other duration in the app does.
  assert.equal(fmtPrecise(90_000), '1m 30s')
  assert.equal(fmtPrecise(null), '-')
  assert.equal(fmtPrecise(undefined), '-')
  assert.equal(fmtPrecise(0), '-')
})

test('the Durations table states the number the player typed', () => {
  // Fork issue #4's own spell: Whirl Till You Hurl set to 7.5 s read "8s" beside the "set" chip.
  assert.equal(estimateText(7500, 'manual'), '7.5s')
  assert.equal(estimateText(7400, 'manual'), '7.4s')
  assert.equal(estimateText(52_500, 'logMedian'), '52.5s')
  assert.equal(estimateText(24_000, 'db'), '24s')
  assert.equal(estimateText(2_160_000, 'db'), '36m 00s')
  // A bound still wears its sign.
  assert.equal(estimateText(34_000, 'deathBound'), '≥ 34s')
})

test('the Durations row prints its median the way it prints its estimate', () => {
  // Two casts of 4 s and 5 s: the estimate read "4.5s" and the median beside it read "5s".
  const two = statCells({ medianMs: 4500, p25: 4250, p75: 4750, minMs: 4000, maxMs: 5000 })
  assert.equal(two.median, fmtPrecise(4500))
  assert.equal(two.median, '4.5s')
  assert.equal(two.middle, '4.3s - 4.8s')
  // Min and max come from whole-second stamps, so they read as they did.
  assert.equal(two.range, '4s - 5s')
  // A minute and over keeps the long form, and a missing number is a dash.
  assert.deepEqual(statCells({ medianMs: 90_000, p25: 60_000, p75: 120_000, minMs: 30_000, maxMs: 150_000 }), { median: '1m 30s', middle: '1m 00s - 2m 00s', range: '30s - 2m 30s' })
  assert.deepEqual(statCells({ medianMs: null }), { median: fmtPrecise(null), middle: '-', range: '-' })
})

test('a card`s elapsed caption is one line that a long spell name cannot squeeze', () => {
  // Layout, so the proof is the rule in the source: "8s elapsed" broke in two beside a two-line name.
  const src = readFileSync(new URL('../src/renderer/src/features/buffs/ActiveBuffRow.tsx', import.meta.url), 'utf8')
  const at = src.indexOf('data-testid="buff-elapsed"')
  assert.ok(at > 0, 'the elapsed caption lost its handle')
  const tag = src.slice(src.lastIndexOf('<Typography', at), src.indexOf('>', at))
  assert.ok(tag.includes("whiteSpace: 'nowrap'") && tag.includes('flexShrink: 0'), tag)
})

test('a card that has just landed reads 0s elapsed, never a dash', () => {
  assert.equal(fmtElapsed(0), '0s')
  assert.equal(fmtElapsed(400), '0s')
  assert.equal(fmtElapsed(8_000), '8s')
})
