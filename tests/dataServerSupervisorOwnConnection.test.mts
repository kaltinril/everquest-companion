// THE SECOND OPINION (fork, 2026-11-22, a report from the owner's own install): before the watchdog
// ends a launch for transient reasons with no fresh evidence, it asks once on the app's own open
// connection. A quiet player sends no frames, so on a busy PC four working engines were ended with
// `connect, connect` although nothing was wrong with them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENGINE_FORGIVE_MAX_LIVE,
  ENGINE_HEALTH_INTERVAL_MS,
  ENGINE_HEALTH_TIMEOUT_MS,
  ENGINE_RESUME_GRACE_MS
} from '../src/main/dataServer/engineProtocol'
import { harness, launched, settle, type Harness } from './dataServerSupervisorHarness.mts'

/** The app's own connection, answered by hand. */
function ownConnection() {
  const asks: { token: string; answer: () => void; lose: () => void }[] = []
  const ask = (token: string): Promise<unknown> =>
    new Promise<void>((resolve, reject) => {
      asks.push({ token, answer: resolve, lose: () => reject(new Error('the connection closed')) })
    })
  return { asks, ask }
}

/** One beat whose probe and confirmation both fail, leaving the second opinion waiting. */
async function failedBeat(h: Harness): Promise<void> {
  h.clock.advance(ENGINE_HEALTH_INTERVAL_MS)
  await settle()
}

async function quietLaunch(live = true) {
  const own = ownConnection()
  const h = harness({
    proof: { heardAt: () => null, live: () => live },
    ownConnection: own.ask
  })
  await launched(h)
  h.setBehaviour('closed')
  return { h, own }
}

test('the own connection answering keeps the launch, and the next probe is scheduled', async () => {
  const { h, own } = await quietLaunch()
  await failedBeat(h)
  assert.equal(own.asks.length, 1, 'asked once')
  assert.equal(own.asks[0].token, h.tokens[0], 'about this launch')
  assert.equal(h.reports.length, 0, 'no verdict while it waits')
  own.asks[0].answer()
  await settle()
  assert.equal(h.reports.length, 0)
  assert.equal(h.supervisor.state, 'ready')
  assert.equal(h.children.length, 1, 'nothing was respawned')
  assert.ok(h.logs.some((l) => l.includes("answered on the app's own connection")))
  const before = h.connects.length
  h.setBehaviour('ok')
  h.clock.advance(ENGINE_HEALTH_INTERVAL_MS)
  await settle()
  assert.equal(h.connects.length, before + 1, 'the ordinary cadence goes on')
})

test('a real wedge: the own connection stays silent and the launch ends at the bounded wait', async () => {
  const { h, own } = await quietLaunch()
  await failedBeat(h)
  h.clock.advance(ENGINE_HEALTH_TIMEOUT_MS - 1)
  await settle()
  assert.equal(h.reports.length, 0, 'not before the limit')
  h.clock.advance(1)
  await settle()
  assert.equal(own.asks.length, 1)
  assert.equal(h.reports.length, 1)
  assert.equal(h.reports[0].name, 'EngineUnhealthy')
  assert.deepEqual(h.reports[0].healthReasons, ['closed', 'closed'], 'the verdict it would have had')
})

test('an answer already delivered when the wait expires still counts', async () => {
  const { h, own } = await quietLaunch()
  await failedBeat(h)
  // The timer fires and, in the same turn, the answer lands: the stall case.
  h.clock.advance(ENGINE_HEALTH_TIMEOUT_MS)
  own.asks[0].answer()
  await settle()
  assert.equal(h.reports.length, 0)
  assert.equal(h.supervisor.state, 'ready')
})

test('the own connection closing ends the launch at once', async () => {
  const { h, own } = await quietLaunch()
  await failedBeat(h)
  own.asks[0].lose()
  await settle()
  assert.equal(h.reports.length, 1)
})

test('an ask that throws is no answer', async () => {
  const h = harness({
    proof: { heardAt: () => null, live: () => true },
    ownConnection: () => {
      throw new Error('no connection')
    }
  })
  await launched(h)
  h.setBehaviour('closed')
  await failedBeat(h)
  assert.equal(h.reports.length, 1)
})

test('a stop during the ask reports nothing, whatever arrives afterwards', async () => {
  const { h, own } = await quietLaunch()
  await failedBeat(h)
  h.supervisor.stop()
  own.asks[0].answer()
  await settle()
  h.clock.advance(ENGINE_HEALTH_TIMEOUT_MS)
  await settle()
  assert.equal(h.reports.filter((r) => r.name === 'EngineUnhealthy').length, 0)
  assert.ok(!h.logs.some((l) => l.includes('not ended')), 'and it forgave nothing')
})

test('a suspend during the ask drops the answer, and the resume asks fresh', async () => {
  const { h, own } = await quietLaunch()
  await failedBeat(h)
  h.suspend()
  own.asks[0].lose()
  await settle()
  assert.equal(h.reports.length, 0, 'a loss after the suspend is not a verdict')
  const before = h.connects.length
  h.setBehaviour('ok')
  h.resume()
  h.clock.advance(ENGINE_RESUME_GRACE_MS)
  await settle()
  assert.equal(h.connects.length, before + 1)
  assert.equal(h.reports.length, 0)
})

test('the cap still ends a live launch, and the capped beat does not ask', async () => {
  const { h, own } = await quietLaunch(true)
  for (let i = 0; i < ENGINE_FORGIVE_MAX_LIVE; i += 1) {
    await failedBeat(h)
    own.asks[i].answer()
    await settle()
  }
  assert.equal(h.reports.length, 0, 'the cap itself is forgiven')
  await failedBeat(h)
  assert.equal(own.asks.length, ENGINE_FORGIVE_MAX_LIVE, 'no ask past the cap')
  assert.equal(h.reports.length, 1)
})

test('a probe that answers starts the count again', async () => {
  const { h, own } = await quietLaunch(true)
  for (let i = 0; i < ENGINE_FORGIVE_MAX_LIVE; i += 1) {
    await failedBeat(h)
    own.asks[i].answer()
    await settle()
  }
  h.setBehaviour('ok')
  await failedBeat(h)
  h.setBehaviour('closed')
  await failedBeat(h)
  assert.equal(own.asks.length, ENGINE_FORGIVE_MAX_LIVE + 1, 'the run was reset, so it asks again')
  assert.equal(h.reports.length, 0)
})

for (const [behaviour, reason] of [
  ['mismatch', 'protocolMismatch'],
  ['deny', 'refused']
] as const) {
  test(`a \`${behaviour}\` answer is never taken to the second opinion`, async () => {
    const { h, own } = await quietLaunch()
    h.setBehaviour(behaviour)
    await failedBeat(h)
    assert.equal(own.asks.length, 0)
    assert.equal(h.reports.length, 1)
    assert.deepEqual(h.reports[0].healthReasons, [reason])
  })
}

test('a launch that never answered once is never asked about', async () => {
  const own = ownConnection()
  const h = harness({
    behaviour: 'closed',
    proof: { heardAt: () => null, live: () => true },
    ownConnection: own.ask
  })
  h.supervisor.start()
  h.children[0].announce()
  await settle()
  assert.equal(own.asks.length, 0)
  assert.equal(h.reports.length, 1)
})

test('fresh evidence is used first: the connection is not asked when it was just heard', async () => {
  const own = ownConnection()
  let heard: number | null = null
  const h = harness({ proof: { heardAt: () => heard, live: () => true }, ownConnection: own.ask })
  await launched(h)
  h.setBehaviour('closed')
  heard = h.clock.now() + ENGINE_HEALTH_INTERVAL_MS - 1_000
  await failedBeat(h)
  assert.equal(own.asks.length, 0)
  assert.equal(h.reports.length, 0)
})

test('without the dep a verdict with no evidence stands at once, as it always did', async () => {
  const h = harness({ proof: { heardAt: () => null, live: () => true } })
  await launched(h)
  h.setBehaviour('closed')
  await failedBeat(h)
  assert.equal(h.reports.length, 1)
  assert.deepEqual(h.reports[0].healthReasons, ['closed', 'closed'])
})
