/**
 * useDonors — a donor read that FAILED is asked again by the next mount.
 *
 * `useDonors` shares one fetch per window (CACHE + INFLIGHT, plannerData.ts). A rejected IPC read
 * used to stay in flight for good, so every later mount awaited the same rejection and the planner
 * stayed empty for the rest of the session. The real hook runs through `tests/hookHost.mjs`
 * against a stubbed `window.eq` whose first read fails and whose second succeeds.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useDonors } from '../src/renderer/src/features/planner/plannerData'
import type { PlannerDonor } from '../src/shared/planner/types'

const DONOR = { key: 'item_1', name: 'Rusty Sword', effect: 'Burst of Flame' } as PlannerDonor

/** Let the stubbed IPC promise and the hook's `.then` both run. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

test('a donor read that failed is asked again by the next mount', async () => {
  let calls = 0
  const plannerDonors = (): Promise<PlannerDonor[]> => {
    calls += 1
    return calls === 1 ? Promise.reject(new Error('ipc failed')) : Promise.resolve([DONOR])
  }
  ;(globalThis as { window?: unknown }).window = { eq: { plannerDonors } }

  const first = mountHook(useDonors)
  await settle()
  first.render()
  assert.equal(first.value.ready, true, 'a failed read still settles, onto the empty state')
  assert.equal(first.value.donors.length, 0)
  first.unmount()

  const second = mountHook(useDonors)
  await settle()
  second.render()
  assert.equal(calls, 2, 'the next mount asked again')
  assert.deepEqual(
    second.value.donors.map((d) => d.name),
    ['Rusty Sword']
  )
  second.unmount()
})
