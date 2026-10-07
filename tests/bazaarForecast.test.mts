// The Bazaar's average and predicted price now (src/shared/bazaarForecast.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { averageNow, predictNow, type ForecastDay } from '../src/shared/bazaarForecast'

const day = (d: string, median: number | null, n = 1, mean = median): ForecastDay => ({ day: d, median, mean, n })

test('the average is every kept price of the last seven days, weighted by how many there were', () => {
  const days = [day('2026-09-20', 100), day('2026-09-28', 200, 1), day('2026-09-30', 300, 3)]
  assert.equal(averageNow(days, '2026-09-30'), (200 + 300 * 3) / 4, 'the 20th is more than a week old')
  assert.equal(averageNow([day('2026-09-01', 100)], '2026-09-30'), null)
})

test('a steady rise is predicted to keep rising to the newest day', () => {
  const days = [day('2026-09-24', 100), day('2026-09-26', 120), day('2026-09-28', 140)]
  const p = predictNow(days, '2026-09-30', 120)
  assert.ok(p !== null && Math.abs(p - 160) < 1e-9, String(p))
})

test('with fewer than three priced days it is their weighted average, newer days weighing more', () => {
  const p = predictNow([day('2026-09-16', 100), day('2026-09-30', 200)], '2026-09-30', null)
  assert.ok(p !== null && p > 150 && p < 200, String(p))
  assert.equal(predictNow([day('2026-09-30', null)], '2026-09-30', null), null)
})

test('a line through a spike is held within half to double the recent median', () => {
  const days = [day('2026-09-28', 100), day('2026-09-29', 100), day('2026-09-30', 1000)]
  assert.equal(predictNow(days, '2026-10-05', 100), 200)
})
