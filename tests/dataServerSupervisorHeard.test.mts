// PROOF OF LIFE (fork, 2026-11-20): a failed probe does not end an engine the app just heard.
//
// The watchdog's probe opens a NEW connection every time. Measured on a starved engine
// (plans/2026-11-19-reading-log-robustness.md, "Measured"): that probe took 4.8 to 4.9 s against
// the 5.0 s limit while the app's own connection was answered in milliseconds, and the engine was
// ended four times in ten minutes, each time throwing away a read in progress. The rule pinned
// here: a verdict built only from reasons a serving engine can produce is set aside when the
// app's own connection heard the engine inside ENGINE_HEARD_FRESH_MS, with evidence newer than
// the last one used, for a launch that has answered once; once the log is live, at most
// ENGINE_FORGIVE_MAX_LIVE times in a row.
//
// A suite of its own: dataServerSupervisorHealth.test.mts is at the file-length ceiling.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENGINE_FORGIVE_MAX_LIVE,
  ENGINE_HEALTH_INTERVAL_MS,
  ENGINE_HEARD_FRESH_MS,
  ENGINE_RESUME_GRACE_MS
} from '../src/main/dataServer/engineProtocol'
import { harness, launched, settle, type Harness } from './dataServerSupervisorHarness.mts'

interface Proof {
  heard: number | null
  live: boolean
}

function withProof(live: boolean, opts: Parameters<typeof harness>[0] = {}): { h: Harness; proof: Proof } {
  const proof: Proof = { heard: null, live }
  const h = harness({ ...opts, proof: { heardAt: () => proof.heard, live: () => proof.live } })
  return { h, proof }
}

/** One watchdog beat with the engine last heard `agoMs` before the probe fails. */
async function beatHeard(h: Harness, proof: Proof, agoMs: number): Promise<void> {
  proof.heard = h.clock.now() + ENGINE_HEALTH_INTERVAL_MS - agoMs
  h.clock.advance(ENGINE_HEALTH_INTERVAL_MS)
  await settle()
}

test('an engine heard 5 s ago is not ended by two failed probes, and the next probe is scheduled', async () => {
  const { h, proof } = withProof(false)
  await launched(h)
  h.setBehaviour('closed')
  await beatHeard(h, proof, 5_000)
  assert.equal(h.reports.length, 0, 'no verdict')
  assert.equal(h.supervisor.state, 'ready')
  assert.equal(h.children.length, 1, 'nothing was respawned')
  assert.equal(h.connects.length, 3, 'the launch probe, the strike and the confirmation were all asked')
  assert.ok(h.logs.some((l) => l.includes('heard the engine')), 'and the dev log says why it stands')
  // The ordinary cadence goes on: one interval later it asks again, and an answer is an answer.
  h.setBehaviour('ok')
  h.clock.advance(ENGINE_HEALTH_INTERVAL_MS)
  await settle()
  assert.equal(h.connects.length, 4)
  assert.equal(h.reports.length, 0)
})

test('an engine last heard 40 s ago is ended as before', async () => {
  const { h, proof } = withProof(false)
  await launched(h)
  h.setBehaviour('closed')
  await beatHeard(h, proof, 40_000)
  assert.equal(h.reports.length, 1)
  assert.equal(h.reports[0].name, 'EngineUnhealthy')
  assert.deepEqual(h.reports[0].healthReasons, ['closed', 'closed'])
})

test('heard exactly at the limit still counts; one millisecond past it does not', async () => {
  const at = withProof(false)
  await launched(at.h)
  at.h.setBehaviour('closed')
  await beatHeard(at.h, at.proof, ENGINE_HEARD_FRESH_MS)
  assert.equal(at.h.reports.length, 0)

  const past = withProof(false)
  await launched(past.h)
  past.h.setBehaviour('closed')
  await beatHeard(past.h, past.proof, ENGINE_HEARD_FRESH_MS + 1)
  assert.equal(past.h.reports.length, 1)
})

test('an engine never heard on the app’s own connection is ended as before', async () => {
  const { h } = withProof(false)
  await launched(h)
  h.setBehaviour('closed')
  h.clock.advance(ENGINE_HEALTH_INTERVAL_MS)
  await settle()
  assert.equal(h.reports.length, 1)
})

test('the same evidence is not accepted twice', async () => {
  const { h, proof } = withProof(false)
  await launched(h)
  h.setBehaviour('closed')
  await beatHeard(h, proof, 5_000)
  assert.equal(h.reports.length, 0, 'forgiven once')
  // The machine sleeps and wakes: the next ask comes after the short resume grace, so the stamp
  // is still inside the 20 s. It was already used, and nothing newer has arrived.
  h.suspend()
  h.resume()
  h.clock.advance(ENGINE_RESUME_GRACE_MS)
  await settle()
  assert.equal(h.reports.length, 1, 'the second verdict stands')
})

for (const [behaviour, reason] of [
  ['mismatch', 'protocolMismatch'],
  ['deny', 'refused']
] as const) {
  test(`a \`${behaviour}\` answer is never forgiven, however recently the engine was heard`, async () => {
    const { h, proof } = withProof(false)
    await launched(h)
    h.setBehaviour(behaviour)
    await beatHeard(h, proof, 1_000)
    assert.equal(h.reports.length, 1)
    assert.deepEqual(h.reports[0].healthReasons, [reason])
  })
}

test('a launch that never answered once is never forgiven', async () => {
  const { h, proof } = withProof(false, { behaviour: 'closed' })
  proof.heard = h.clock.now()
  h.supervisor.start()
  h.children[0].announce()
  await settle()
  assert.equal(h.reports.length, 1, 'a start that proved nothing is not kept on proof of life')
  assert.deepEqual(h.reports[0].healthReasons, ['closed', 'closed'])
})

test('while the log is still being read there is no cap: every beat with fresh evidence is forgiven', async () => {
  const { h, proof } = withProof(false)
  await launched(h)
  h.setBehaviour('closed')
  for (let i = 0; i < ENGINE_FORGIVE_MAX_LIVE * 3; i += 1) await beatHeard(h, proof, 1_000)
  assert.equal(h.reports.length, 0)
  assert.equal(h.children.length, 1)
})

test('once the log is live, the beat after the cap ends the launch', async () => {
  const { h, proof } = withProof(true)
  await launched(h)
  h.setBehaviour('closed')
  for (let i = 0; i < ENGINE_FORGIVE_MAX_LIVE; i += 1) await beatHeard(h, proof, 1_000)
  assert.equal(h.reports.length, 0, 'the cap itself is forgiven')
  await beatHeard(h, proof, 1_000)
  assert.equal(h.reports.length, 1, 'and the next one is not')
})

test('an answered probe starts the count again', async () => {
  const { h, proof } = withProof(true)
  await launched(h)
  h.setBehaviour('closed')
  for (let i = 0; i < ENGINE_FORGIVE_MAX_LIVE; i += 1) await beatHeard(h, proof, 1_000)
  h.setBehaviour('ok')
  await beatHeard(h, proof, 1_000)
  h.setBehaviour('closed')
  for (let i = 0; i < ENGINE_FORGIVE_MAX_LIVE; i += 1) await beatHeard(h, proof, 1_000)
  assert.equal(h.reports.length, 0)
})

test('without the proof-of-life inputs the watchdog is the two-strike rule alone', async () => {
  const h = harness()
  await launched(h)
  h.setBehaviour('closed')
  h.clock.advance(ENGINE_HEALTH_INTERVAL_MS)
  await settle()
  assert.equal(h.reports.length, 1)
})
