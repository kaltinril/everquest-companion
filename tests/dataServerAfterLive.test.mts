// NOTICING THAT THE ENGINE STOPPED READING AFTER IT WAS LIVE (fork #9, phase R4):
// `src/main/dataServer/afterLive.ts`.
//
// Nothing looked at the engine's status once the read was live, so a reader that died later left
// stale numbers on every tab and refused reads with no reason. The supervisor's 30 s probe now
// hands its status on; a not-live answer there is confirmed once on main's own connection before
// the read is called over, because the probe is another connection and can be a beat old.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afterLiveVerdict, createAfterLiveWatch } from '../src/main/dataServer/afterLive'

const LOG = 'C:\\EverQuest\\Logs\\eqlog_Alpha_test.txt'

// ---- 1. the verdict ------------------------------------------------------------------------------

test('`confirm` ONLY WHEN A LIVE LOG IS HELD AND THE PROBE SAYS idle, attaching, folding or starting', () => {
  for (const probeStatus of ['idle', 'attaching', 'folding', 'starting']) {
    assert.equal(afterLiveVerdict({ liveOn: LOG, probeStatus }), 'confirm', probeStatus)
  }
})

test('`fine` when nothing is live, whatever the probe says, and when the probe says live', () => {
  for (const probeStatus of ['idle', 'attaching', 'folding', 'starting', 'live']) {
    assert.equal(afterLiveVerdict({ liveOn: null, probeStatus }), 'fine', probeStatus)
  }
  assert.equal(afterLiveVerdict({ liveOn: LOG, probeStatus: 'live' }), 'fine')
})

// ---- 2. the confirm ------------------------------------------------------------------------------

interface Rig {
  liveOn: string | null
  turn: number
  asks: number
  ended: number
  /** Settle the ask that is out. */
  answer(status: string): Promise<void>
  refuse(): Promise<void>
  probed(status: string): void
}

function rig(): Rig {
  let settle: { resolve: (v: { status: string }) => void; reject: (e: unknown) => void } | null = null
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
  const r: Rig = {
    liveOn: LOG,
    turn: 1,
    asks: 0,
    ended: 0,
    async answer(status) {
      settle?.resolve({ status })
      await flush()
    },
    async refuse() {
      settle?.reject(new Error('nobody answered'))
      await flush()
    },
    probed: (status) => {
      watch.probed(status)
    }
  }
  const watch = createAfterLiveWatch({
    liveOn: () => r.liveOn,
    turn: () => r.turn,
    ask: () => {
      r.asks += 1
      return new Promise((resolve, reject) => {
        settle = { resolve, reject }
      })
    },
    ended: () => {
      r.ended += 1
    },
    note: () => undefined
  })
  return r
}

test('A NOT-LIVE PROBE IS CONFIRMED ONCE ON MAIN-S OWN CONNECTION; a second not-live answer is the end', async () => {
  const r = rig()
  r.probed('idle')
  assert.equal(r.asks, 1)
  assert.equal(r.ended, 0, 'one answer from another connection ends nothing')
  await r.answer('idle')
  assert.equal(r.ended, 1)
})

test('THE PROBE WAS A BEAT OLD: main-s own connection says live, and nothing ends', async () => {
  const r = rig()
  r.probed('folding')
  await r.answer('live')
  assert.equal(r.ended, 0)
  // The next probe starts over.
  r.probed('idle')
  assert.equal(r.asks, 2)
})

test('a healthy probe, and a probe with nothing held as live, ask nothing', () => {
  const r = rig()
  r.probed('live')
  r.liveOn = null
  for (const status of ['idle', 'starting', 'attaching', 'folding']) r.probed(status)
  assert.equal(r.asks, 0, 'no ask is made on main-s connection without a doubt')
})

test('ONE CONFIRM AT A TIME: probes that land while it is out ask nothing more', async () => {
  const r = rig()
  for (let i = 0; i < 10; i += 1) r.probed('idle')
  assert.equal(r.asks, 1)
  await r.answer('idle')
  assert.equal(r.ended, 1, 'and the end is said once')
})

test('AN ANSWER THAT LANDS IN ANOTHER TURN ENDS NOTHING: the world it was about was replaced', async () => {
  const r = rig()
  r.probed('idle')
  // A character switch while the confirm was out: the new turn is not live yet, by design.
  r.turn = 2
  r.liveOn = null
  await r.answer('folding')
  assert.equal(r.ended, 0)
  // Even if the new turn has gone live meanwhile, that answer was not asked about it.
  const again = rig()
  again.probed('idle')
  again.turn = 2
  await again.answer('idle')
  assert.equal(again.ended, 0)
})

test('a confirm nobody answered is not a verdict, and the next probe asks again', async () => {
  const r = rig()
  r.probed('idle')
  await r.refuse()
  assert.equal(r.ended, 0)
  r.probed('idle')
  assert.equal(r.asks, 2)
  await r.answer('idle')
  assert.equal(r.ended, 1)
})

test('the read stopped being held as live while the confirm was out: nothing ends', async () => {
  const r = rig()
  r.probed('idle')
  r.liveOn = null
  await r.answer('idle')
  assert.equal(r.ended, 0)
})
