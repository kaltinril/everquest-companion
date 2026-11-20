// A window's copy of the log-read status (fork #9, phase R2): the store in
// `src/renderer/src/lib/logReadReportHud.ts`. One subscription and one read per window, however
// many components read it, and a read that lands late never overwrites a push.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLogReadStore, type LogReadBridge } from '../src/renderer/src/lib/logReadReportHud'
import { boxShows, LOG_READ_SLOW_MS, type LogReadReport } from '../src/shared/logReadReport'
import { NOW, error, health, report } from './logReadFactsHarness.mts'

interface Rig {
  bridge: LogReadBridge
  /** What happened on the bridge, in order. */
  calls: string[]
  push(report: LogReadReport): void
  /** Settle the oldest read still out. */
  answer(report: LogReadReport): Promise<void>
  fail(): Promise<void>
}

function rig(): Rig {
  const calls: string[] = []
  let listener: ((report: LogReadReport) => void) | null = null
  const reads: { resolve: (r: LogReadReport) => void; reject: (e: Error) => void }[] = []
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
  return {
    calls,
    bridge: {
      onLogReadReport: (cb) => {
        calls.push('subscribe')
        listener = cb
        return () => {
          listener = null
        }
      },
      logReadReport: () => {
        calls.push('read')
        return new Promise<LogReadReport>((resolve, reject) => {
          reads.push({ resolve, reject })
        })
      }
    },
    push: (next) => {
      listener?.(next)
    },
    answer: async (next) => {
      reads.shift()?.resolve(next)
      await settle()
    },
    fail: async () => {
      reads.shift()?.reject(new Error('no handler registered'))
      await settle()
    }
  }
}

const READING = report()
const STOPPED = report({ health: health('idle'), error: error('fold') })

test('NOTHING IS ASKED UNTIL SOMETHING READS THE STORE; then it subscribes first and reads once', async () => {
  const r = rig()
  const store = createLogReadStore(() => r.bridge)
  assert.deepEqual(r.calls, [])
  assert.equal(store.get(), null)
  let told = 0
  store.subscribe(() => {
    told += 1
  })
  assert.deepEqual(r.calls, ['subscribe', 'read'], 'a push between the read and the subscription would be lost')
  await r.answer(READING)
  assert.equal(store.get(), READING)
  assert.equal(told, 1)
})

test('ANY NUMBER OF READERS SHARE ONE SUBSCRIPTION AND ONE READ', async () => {
  const r = rig()
  const store = createLogReadStore(() => r.bridge)
  const told = [0, 0, 0]
  const offs = told.map((_, i) =>
    store.subscribe(() => {
      told[i] += 1
    })
  )
  assert.deepEqual(r.calls, ['subscribe', 'read'])
  r.push(STOPPED)
  assert.deepEqual(told, [1, 1, 1])
  // One reader leaves (a tab unmounts): the others still hear, and nothing is asked again.
  offs[1]()
  r.push(READING)
  assert.deepEqual(told, [2, 1, 2])
  // The last readers leave and a new one mounts: the store kept its copy and its subscription.
  offs[0]()
  offs[2]()
  r.push(STOPPED)
  store.subscribe(() => undefined)
  assert.equal(store.get(), STOPPED, 'a status pushed while no tab was drawing it was dropped')
  assert.deepEqual(r.calls, ['subscribe', 'read'])
})

test('A READ THAT LANDS AFTER A PUSH IS DROPPED: a stale answer never overwrites a fresh one', async () => {
  const r = rig()
  const store = createLogReadStore(() => r.bridge)
  store.subscribe(() => undefined)
  r.push(STOPPED)
  await r.answer(READING)
  assert.equal(store.get(), STOPPED)
})

test('a read that is refused keeps what the store has', async () => {
  const r = rig()
  const store = createLogReadStore(() => r.bridge)
  store.subscribe(() => undefined)
  await r.fail()
  assert.equal(store.get(), null)
  r.push(READING)
  store.refresh()
  await r.fail()
  assert.equal(store.get(), READING)
})

test('refresh asks once more, and is nothing before the store has started', async () => {
  const r = rig()
  const store = createLogReadStore(() => r.bridge)
  store.refresh()
  assert.deepEqual(r.calls, [])
  store.subscribe(() => undefined)
  await r.answer(READING)
  store.refresh()
  assert.deepEqual(r.calls, ['subscribe', 'read', 'read'])
  await r.answer(STOPPED)
  assert.equal(store.get(), STOPPED)
})

test('a window with no bridge yet draws nothing and tries again at the next reader', async () => {
  const r = rig()
  let ready = false
  const store = createLogReadStore(() => (ready ? r.bridge : null))
  store.subscribe(() => undefined)
  assert.deepEqual(r.calls, [])
  assert.equal(store.get(), null)
  ready = true
  store.subscribe(() => undefined)
  assert.deepEqual(r.calls, ['subscribe', 'read'])
})

test('a listener that unsubscribes while being told does not skip the next one', () => {
  const r = rig()
  const store = createLogReadStore(() => r.bridge)
  let second = 0
  const off = store.subscribe(() => {
    off()
  })
  store.subscribe(() => {
    second += 1
  })
  r.push(READING)
  assert.equal(second, 1)
})

// ---- when a panel draws the box ------------------------------------------------------------------

test('THE BOX IS DRAWN WHEN MAIN SAYS SO, AND IN ANY CASE ONCE THE PANEL HAS WAITED 15 s', () => {
  assert.equal(boxShows(STOPPED, 0), true, 'a failure is drawn at once')
  const quiet = report({ waitingSince: NOW })
  assert.equal(quiet.show, false)
  assert.equal(boxShows(quiet, LOG_READ_SLOW_MS - 1), false, 'a healthy read draws nothing')
  assert.equal(boxShows(quiet, LOG_READ_SLOW_MS), true)
  // Also for the two waits main never asks to show: a panel with no reply still owes its rows.
  const ok = report({ readiness: 'ok', health: health('live') })
  const noCharacter = report({ logPath: null })
  for (const r of [ok, noCharacter]) {
    assert.equal(r.show, false, r.wait)
    assert.equal(boxShows(r, LOG_READ_SLOW_MS - 1), false, r.wait)
    assert.equal(boxShows(r, LOG_READ_SLOW_MS), true, r.wait)
  }
})
