// The swing timer's cadence (shared/swingTimer.ts) over a real fight: `fixtures/swing-rounds.json`
// is what the engine serves for `fixtures/swing-timer.log` (pinned by the Rust test
// `fold/tests/swing_rounds.rs`), an SK's two-hander whose stamped gaps run 2, 3 and 4 seconds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SWING_PAUSE_MS, swingCadence, swingReading } from '../src/shared/swingTimer'

const rounds = JSON.parse(readFileSync(new URL('./fixtures/swing-rounds.json', import.meta.url), 'utf8')) as number[]
const last = rounds[rounds.length - 1]

test('the cadence is the mean of the recent gaps, not any one whole-second gap', () => {
  const c = swingCadence(rounds)
  // The last 16 gaps span 46 s: 2,875 ms a swing. No single stamped gap says that.
  assert.deepEqual(c, { intervalMs: 2875, samples: 16 })
})

test('the bar runs from the middle of the last swing second to the next swing', () => {
  const half = swingReading(rounds, last + 500 + 2875 / 2)
  assert.equal(half?.progress, 0.5)
  assert.equal(half?.nextInMs, 2875 / 2)
  assert.equal(half?.idle, false)
  const due = swingReading(rounds, last + 500 + 4000)
  assert.equal(due?.progress, 1)
  assert.equal(due?.nextInMs, 0)
  assert.equal(swingReading(rounds, last + SWING_PAUSE_MS + 1000)?.idle, true)
})

test('a pause is not a swing gap, and too few swings is no cadence', () => {
  const twoFights = [...rounds.slice(0, 4), ...rounds.slice(0, 4).map((t) => t + 60_000)]
  // Six 3-second gaps across the two fights; the 51-second pause between them is left out.
  assert.deepEqual(swingCadence(twoFights), { intervalMs: 3000, samples: 6 })
  assert.equal(swingCadence(rounds.slice(0, 3)), null)
  assert.equal(swingReading(undefined, last), null)
})

test('a stray gap far off the median does not drag the cadence', () => {
  const t0 = 1_000_000
  const steady = [0, 3000, 6000, 9000, 10000, 13000, 16000].map((d) => t0 + d)
  // The 1-second gap (an off-hand or a stray line) is two seconds off the 3-second median.
  assert.deepEqual(swingCadence(steady), { intervalMs: 3000, samples: 5 })
})
