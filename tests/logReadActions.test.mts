// What the status's Try again button does (fork #9, phase R2): `src/main/logReadActions.ts`.
// The three verbs are counters here; what each really does is tested where it lives
// (tests/dataServerEngineLink.test.mts for the new connection).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRY_AGAIN_QUIET_MS, createTryAgain } from '../src/main/logReadActions'
import { LOG_READ_ACTION } from '../src/shared/logReadWords'
import type { LogReadWait } from '../src/shared/logReadReport'

interface Rig {
  press: () => string | null
  ran: string[]
  state: { wait: LogReadWait; now: number }
}

function rig(wait: LogReadWait): Rig {
  const ran: string[] = []
  const state = { wait, now: 1_000_000 }
  const press = createTryAgain({
    wait: () => state.wait,
    relaunch: () => ran.push('relaunch'),
    reconnect: () => ran.push('reconnect'),
    reattach: () => ran.push('reattach'),
    now: () => state.now
  })
  return { press, ran, state }
}

const ALL = Object.keys(LOG_READ_ACTION) as LogReadWait[]

test('EACH WAIT RUNS ITS OWN VERB, once, and nothing else', () => {
  for (const wait of ALL) {
    const r = rig(wait)
    const action = LOG_READ_ACTION[wait]
    assert.equal(r.press(), action, wait)
    assert.deepEqual(r.ran, action === null ? [] : [action], wait)
  }
})

test('the three verbs are each reached by the waits the table gives them', () => {
  assert.deepEqual(rig('engineMissing').press(), 'relaunch')
  assert.deepEqual(rig('engineFailing').press(), 'relaunch')
  assert.deepEqual(rig('notConnected').press(), 'reconnect')
  assert.deepEqual(rig('notAnswering').press(), 'reconnect')
  for (const wait of ['attachRefused', 'logMissing', 'logUnreadable', 'logHung', 'readerStopped', 'stalled', 'opening', 'mismatch'] as const) {
    assert.deepEqual(rig(wait).press(), 'reattach', wait)
  }
})

test('A WAIT WITH NO ACTION RUNS NOTHING: a press that arrives late is not a re-read', () => {
  // The button was drawn for a read that stopped; by the time the press lands the status says
  // something else. Nothing is done about a state the player was not looking at.
  for (const wait of ['ok', 'reading', 'finishing', 'connecting', 'engineStarting', 'noCharacter', 'replyTooLarge'] as const) {
    const r = rig(wait)
    assert.equal(r.press(), null, wait)
    assert.deepEqual(r.ran, [], wait)
  }
})

test('A SECOND PRESS INSIDE 2 s IS IGNORED, and one after it runs', () => {
  const r = rig('readerStopped')
  assert.equal(r.press(), 'reattach')
  r.state.now += 300
  assert.equal(r.press(), null, 'a double-click re-read the log twice')
  r.state.now += TRY_AGAIN_QUIET_MS - 301
  assert.equal(r.press(), null)
  r.state.now += 1
  assert.equal(r.press(), 'reattach')
  assert.deepEqual(r.ran, ['reattach', 'reattach'])
})

test('the wait is read at each press, and a press that did nothing starts no quiet time', () => {
  const r = rig('reading')
  assert.equal(r.press(), null)
  // The read stops a moment later and the button appears: this press must not be swallowed.
  r.state.wait = 'readerStopped'
  r.state.now += 100
  assert.equal(r.press(), 'reattach')
  // The status moved on to another failure inside the quiet time: still one action per 2 s.
  r.state.wait = 'notConnected'
  r.state.now += 500
  assert.equal(r.press(), null)
  r.state.now += TRY_AGAIN_QUIET_MS
  assert.equal(r.press(), 'reconnect')
  assert.deepEqual(r.ran, ['reattach', 'reconnect'])
})
