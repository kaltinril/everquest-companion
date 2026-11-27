// THE WATCHDOG'S SECOND OPINION GETS ITS WHOLE WAIT (2026-11-27 audit, logread-1).
//
// When a health probe fails, the watchdog asks `session.health` on the app's own connection and waits
// ENGINE_OWN_CONNECTION_TIMEOUT_MS (20 s) for it: that connection serves one request at a time, so the
// ask can sit behind snapshot reads that each take up to 5 s. The client used to give every request
// the same 15 s deadline, so the ask was rejected at 15 s and a busy engine was ended before the 20 s
// it was promised. The ask now runs under its own, longer deadline, and the watch's timer is the
// only bound on it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EngineError } from '../src/shared/dataServer/client'
import { REQUEST_DEADLINE_MS } from '../src/shared/dataServer/deadline'
import * as protocol from '../src/main/dataServer/engineProtocol'
import { rig, shakeHands } from './dataServerRig.mjs'

const OWN = protocol.ENGINE_OWN_CONNECTION_TIMEOUT_MS
const ownDeadline = (protocol as { OWN_CONNECTION_HEALTH_DEADLINE_MS?: number }).OWN_CONNECTION_HEALTH_DEADLINE_MS

test('the own-connection ask runs under a deadline longer than the watch waits for it', () => {
  assert.equal(typeof ownDeadline, 'number')
  assert.ok((ownDeadline as number) > OWN, 'the client must not give up on the ask before the watch does')
  assert.ok(OWN > REQUEST_DEADLINE_MS, 'the case this pins: the watch waits longer than an ordinary request')
})

test('ownConnectionHealth sends session.health with that deadline', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/main/dataServer/engineClientHost.ts'), 'utf8')
  assert.ok(
    src.includes("request('session.health', {}, OWN_CONNECTION_HEALTH_DEADLINE_MS)"),
    'ownConnectionHealth must pass OWN_CONNECTION_HEALTH_DEADLINE_MS to its session.health request'
  )
})

test('a request given its own deadline is still waited for past the ordinary one, then given up on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const r = rig()
  shakeHands(r)
  const deadline = ownDeadline ?? OWN + 1
  let settled = false
  const health = r.client.request('session.health', {}, deadline)
  health.then(
    () => (settled = true),
    () => (settled = true)
  )

  // Past the ordinary 15 s, and up to the 20 s the watch waits: still pending.
  t.mock.timers.tick(OWN - 1)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(settled, false, 'the ask was given up on before the watch stopped waiting')

  t.mock.timers.tick(deadline - (OWN - 1))
  await assert.rejects(health, (error: unknown) => error instanceof EngineError && error.code === 'timeout')
  assert.equal(r.client.state, 'ready')
})

test('a request with no deadline of its own still gives up at the ordinary one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const r = rig()
  shakeHands(r)
  const silent = r.client.request('session.health', {})
  t.mock.timers.tick(REQUEST_DEADLINE_MS + 1)
  await assert.rejects(silent, (error: unknown) => error instanceof EngineError && error.code === 'timeout')
})
