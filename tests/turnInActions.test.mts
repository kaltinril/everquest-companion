// THE TURN-IN STATEMENTS BEFORE AND AFTER THE LOG HAS LOADED (src/renderer/src/features/posky/turnInActions.ts).
//
// Right after launch the store already holds the persisted detections and the turn-ins module has
// not answered, so `detected` is empty. An undo then could not tell a detection from a
// hand-recorded instant: it dropped the instant WITHOUT rejecting it, and the module's first
// snapshot wrote the trade straight back. The hook now takes `detected: null` for "not loaded" and
// says nothing until it has; the Sky tab disables both controls on the same flag.
//
// Run for real through `hookHost.mts` (no jsdom here); `window.eq` is a recording stub.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountHook } from './hookHost.mjs'
import { useTurnInActions } from '../src/renderer/src/features/posky/turnInActions'
import type { QuestTurnIns, TurnInInstants } from '../src/shared/questTurnIns'
import type { ProgressState } from '../src/shared/types'

const KEY = 'Cleric::Test of Faith'
const DETECTED_AT = 1_700_000_000_000
const TURN_INS: QuestTurnIns = { instants: { [KEY]: [DETECTED_AT] }, all: { [KEY]: 1 } }

interface Call {
  key: string
  instants: number[]
  rejected?: number[]
}

function stubBridge(): Call[] {
  const calls: Call[] = []
  const setQuestTurnIns = (key: string, instants: number[], rejected?: number[]): Promise<ProgressState> => {
    calls.push(rejected === undefined ? { key, instants } : { key, instants, rejected })
    return Promise.resolve({} as ProgressState)
  }
  ;(globalThis as { window?: unknown }).window = { eq: { setQuestTurnIns } }
  return calls
}

function actions(detected: TurnInInstants | null): ReturnType<typeof useTurnInActions> {
  return mountHook(() => useTurnInActions(TURN_INS, detected, {}, () => undefined)).value
}

test('before the log has loaded, undo and reset state nothing', async () => {
  const calls = stubBridge()
  const a = actions(null)
  await a.undoTurnIn(KEY)
  await a.resetTurnIns()
  assert.deepEqual(calls, [])
})

test('once it has, taking back a detection rejects it so the next snapshot cannot restore it', async () => {
  const calls = stubBridge()
  await actions({ [KEY]: [DETECTED_AT] }).undoTurnIn(KEY)
  assert.deepEqual(calls, [{ key: KEY, instants: [], rejected: [DETECTED_AT] }])
})

test('once it has, the reset rejects every detection it takes back', async () => {
  const calls = stubBridge()
  await actions({ [KEY]: [DETECTED_AT] }).resetTurnIns()
  assert.deepEqual(calls, [{ key: KEY, instants: [], rejected: [DETECTED_AT] }])
})

test('a second record before the re-render keeps the first one', async () => {
  const calls = stubBridge()
  const a = actions({ [KEY]: [DETECTED_AT] })
  await a.recordTurnIn(KEY)
  await a.recordTurnIn(KEY)
  const [first, second] = calls.map((c) => c.instants)
  assert.equal(first.length, 2)
  assert.deepEqual(second.slice(0, 2), first)
  assert.equal(second.length, 3)
})

// TWO CLICKS BEFORE THE FIRST REPLY. The hook value is never re-rendered here, so both calls read
// the list captured at render, as two quick clicks do while main is still writing the store. Main
// REPLACES a quest's list, so the second statement has to build on the first.

const T1 = DETECTED_AT
const T2 = DETECTED_AT + 60_000

function actionsOver(instants: number[], detected: number[]): ReturnType<typeof useTurnInActions> {
  const turnIns: QuestTurnIns = { instants: { [KEY]: instants }, all: { [KEY]: instants.length } }
  return mountHook(() => useTurnInActions(turnIns, { [KEY]: detected }, {}, () => undefined)).value
}

test('a second undo before the first reply takes back a second turn-in', async () => {
  const calls = stubBridge()
  const a = actionsOver([T1, T2], [T1, T2])
  await Promise.all([a.undoTurnIn(KEY), a.undoTurnIn(KEY)])
  assert.deepEqual(calls, [
    { key: KEY, instants: [T1], rejected: [T2] },
    // The first take-back is restated: this list replaces the stored one.
    { key: KEY, instants: [], rejected: [T2, T1] }
  ])
})

test('an undo right after a record takes back only that record', async () => {
  const calls = stubBridge()
  const a = actionsOver([T1], [T1])
  await Promise.all([a.recordTurnIn(KEY), a.undoTurnIn(KEY)])
  assert.equal(calls[0].instants.length, 2)
  assert.deepEqual(calls[1], { key: KEY, instants: [T1] }, 'the log turn-in stands and is not rejected')
})

test('a record right after an undo does not restate the turn-in just taken back', async () => {
  const calls = stubBridge()
  const a = actionsOver([T1], [])
  await Promise.all([a.undoTurnIn(KEY), a.recordTurnIn(KEY)])
  assert.deepEqual(calls[0], { key: KEY, instants: [] })
  assert.equal(calls[1].instants.length, 1)
  assert.ok(!calls[1].instants.includes(T1))
})

test('a take-back is remembered only until its reply: a turn-in that comes back can be taken back again', async () => {
  const calls = stubBridge()
  const a = actionsOver([T1], [T1])
  await a.undoTurnIn(KEY)
  // Same list again after the reply (an archive shown later can restate a trade): it is cut again.
  await a.undoTurnIn(KEY)
  assert.deepEqual(calls[1], { key: KEY, instants: [], rejected: [T1] })
})
