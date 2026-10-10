// The Factions tab's evidence re-ask schedule (renderer/src/features/factions/evidenceRefresh.ts):
// a burst of activity pings is one trailing ask after the quiet time, endless activity still asks
// by the max wait, and cancel (unmount) drops a pending ask.

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { trailingRefresh } from '../src/renderer/src/features/factions/evidenceRefresh'

function harness(): { runs: () => number; r: ReturnType<typeof trailingRefresh> } {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  let n = 0
  const r = trailingRefresh(() => n++, 3000, 15000, () => Date.now())
  return { runs: () => n, r }
}

test('a burst of nudges is one trailing ask after the quiet time', () => {
  const { runs, r } = harness()
  try {
    for (let i = 0; i < 10; i++) {
      r.nudge()
      mock.timers.tick(250)
    }
    assert.equal(runs(), 0)
    mock.timers.tick(3000)
    assert.equal(runs(), 1)
    mock.timers.tick(60000)
    assert.equal(runs(), 1)
  } finally {
    mock.timers.reset()
  }
})

test('activity that never goes quiet still asks by the max wait', () => {
  const { runs, r } = harness()
  try {
    for (let t = 0; t < 15000; t += 500) {
      r.nudge()
      mock.timers.tick(500)
    }
    assert.equal(runs(), 1)
  } finally {
    mock.timers.reset()
  }
})

test('cancel drops a pending ask', () => {
  const { runs, r } = harness()
  try {
    r.nudge()
    r.cancel()
    mock.timers.tick(60000)
    assert.equal(runs(), 0)
  } finally {
    mock.timers.reset()
  }
})
