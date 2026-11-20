// Every firing of an alert is its own banner line, even when two land in one millisecond.
//
// The banner queue refreshes a line whose id repeats (cardQueue.ts). Two respawn clocks due on
// one tick fire the same alert twice in one synchronous loop, so an id built from the alert and
// the clock alone made the second mob replace the first on screen while both were spoken.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAlertBannerIds, validateAlertBannerPayload, type AlertBannerPayload } from '../src/shared/alertBanner'
import { cardReduce, type CardState } from '../src/renderer/src/overlay/cardQueue'

type Lines = CardState<AlertBannerPayload>[]

const show = (lines: Lines, payload: AlertBannerPayload): Lines =>
  cardReduce(lines, { type: 'show', payload, holdMs: 4000, cap: 5 })

test('two firings of one alert in the same millisecond are two lines', () => {
  const bannerId = makeAlertBannerIds()
  const ts = 1_700_000_000_000
  const line = (text: string): AlertBannerPayload => ({ id: bannerId('respawn-soon', ts), alertId: 'respawn-soon', ts, text })
  const lines = [line('a rat in 10s'), line('a bat in 10s')].reduce(show, [])
  assert.deepEqual(
    lines.map((l) => l.payload.text),
    ['a rat in 10s', 'a bat in 10s']
  )
})

test('the hazard is the queue: a repeated id replaces the line on screen', () => {
  const ts = 1_700_000_000_000
  const same = (text: string): AlertBannerPayload => ({ id: `respawn-soon:${String(ts)}`, alertId: 'respawn-soon', ts, text })
  const lines = [same('a rat in 10s'), same('a bat in 10s')].reduce(show, [])
  assert.deepEqual(
    lines.map((l) => l.payload.text),
    ['a bat in 10s']
  )
})

test('the id survives the validator main re-runs on the payload', () => {
  const bannerId = makeAlertBannerIds()
  const alertId = '3f2b1c9e-8a47-4d55-9b1e-0c6f7a2d4e10'
  const ids = [1, 2].map(() => bannerId(alertId, 1_700_000_000_000))
  const kept = ids.map((id) => validateAlertBannerPayload({ id, alertId, ts: 1_700_000_000_000, text: 'x' })?.id)
  assert.deepEqual(kept, ids)
  assert.notEqual(kept[0], kept[1])
})
