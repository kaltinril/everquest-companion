// respawnAlertTick: the 1 s clock main sends the respawn alert's watcher (fork #7). The switch is
// called on every save of the setting, so a second "on" (the seconds field edited while the box
// is ticked) must leave the one clock running: a switch that stopped it would silence the alert
// with the box still ticked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRespawnAlertTick } from '../src/main/respawnAlertTickCore.ts'

interface Fake {
  sync: (on: boolean) => void
  started: { fn: () => void; ms: number; handle: number }[]
  cleared: number[]
  sent: number[]
  clock: { now: number }
}

function fake(): Fake {
  const started: Fake['started'] = []
  const cleared: number[] = []
  const sent: number[] = []
  const clock = { now: 1_700_000_000_000 }
  const sync = makeRespawnAlertTick<number>({
    every: (fn, ms) => {
      const handle = started.length + 1
      started.push({ fn, ms, handle })
      return handle
    },
    clear: (handle) => cleared.push(handle),
    send: (nowMs) => sent.push(nowMs),
    now: () => clock.now
  })
  return { sync, started, cleared, sent, clock }
}

test('on starts one clock at 1 s; a second on leaves it running', () => {
  const f = fake()
  f.sync(true)
  f.sync(true)
  f.sync(true)
  assert.equal(f.started.length, 1)
  assert.equal(f.started[0].ms, 1000)
  assert.deepEqual(f.cleared, [])
})

test('each tick sends the time it was sent at, in milliseconds', () => {
  const f = fake()
  f.sync(true)
  assert.deepEqual(f.sent, [], 'nothing before the first tick')
  f.started[0].fn()
  f.clock.now += 1000
  f.started[0].fn()
  assert.deepEqual(f.sent, [1_700_000_000_000, 1_700_000_001_000])
})

test('off stops the clock that was started; a second off does nothing', () => {
  const f = fake()
  f.sync(true)
  f.sync(false)
  assert.deepEqual(f.cleared, [f.started[0].handle])
  f.sync(false)
  assert.equal(f.cleared.length, 1)
  assert.equal(f.started.length, 1)
})

test('off with nothing running starts and stops nothing', () => {
  const f = fake()
  f.sync(false)
  assert.equal(f.started.length, 0)
  assert.deepEqual(f.cleared, [])
})

test('on after off starts a new clock, and off then stops that one', () => {
  const f = fake()
  f.sync(true)
  f.sync(false)
  f.sync(true)
  assert.equal(f.started.length, 2)
  f.sync(false)
  assert.deepEqual(f.cleared, [f.started[0].handle, f.started[1].handle])
})
