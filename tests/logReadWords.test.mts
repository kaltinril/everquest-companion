// The words of the log-read status (fork #9, phase R2): every wait has a sentence, a Try line or
// a stated absence of one, and a decision about its Try again button. No state ships without
// words, and the too-large state has no retry.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOG_READ_ACTION, LOG_READ_TRY, LOG_READ_WORDS } from '../src/shared/logReadWords'
import type { LogReadWait } from '../src/shared/logReadReport'
import { error, health, report, NOW } from './logReadFactsHarness.mts'

/** Every wait, spelled here so a member added to the type without a row fails to compile. */
const WAITS: Record<LogReadWait, true> = {
  noCharacter: true,
  engineMissing: true,
  engineFailing: true,
  engineStarting: true,
  connecting: true,
  notConnected: true,
  attachRefused: true,
  logMissing: true,
  logUnreadable: true,
  logHung: true,
  readerStopped: true,
  stalled: true,
  finishing: true,
  opening: true,
  mismatch: true,
  notAnswering: true,
  reading: true,
  replyTooLarge: true,
  ok: true
}
const ALL = Object.keys(WAITS) as LogReadWait[]

test('the three tables cover every wait and nothing else', () => {
  for (const table of [LOG_READ_WORDS, LOG_READ_TRY, LOG_READ_ACTION]) {
    assert.deepEqual(Object.keys(table).sort(), [...ALL].sort())
  }
})

test('EVERY SENTENCE AND TRY LINE IS SHORT, SAYS SOMETHING AND CARRIES NO LONG DASH', () => {
  for (const wait of ALL) {
    const lines = [LOG_READ_WORDS[wait], LOG_READ_TRY[wait]].filter((line) => line !== null)
    for (const line of lines) {
      assert.ok(line.trim().length > 0, `${wait} has an empty line`)
      assert.ok(line.length < 90, `${wait} is ${String(line.length)} characters: ${line}`)
      assert.doesNotMatch(line, /[–—]/, `${wait} carries an em or en dash`)
      assert.match(line, /\.$/, `${wait} does not end as a sentence: ${line}`)
    }
  }
})

test('only a wait with nothing to do about it has no Try line', () => {
  for (const wait of ALL) {
    if (wait === 'ok') assert.equal(LOG_READ_TRY[wait], null)
    else assert.equal(typeof LOG_READ_TRY[wait], 'string', `${wait} tells the player nothing to try`)
  }
})

test('WHAT TRY AGAIN DOES, per wait', () => {
  const relaunch: LogReadWait[] = ['engineMissing', 'engineFailing']
  const reconnect: LogReadWait[] = ['notConnected', 'notAnswering']
  const reattach: LogReadWait[] = [
    'attachRefused',
    'logMissing',
    'logUnreadable',
    'logHung',
    'readerStopped',
    'stalled',
    'opening',
    'mismatch'
  ]
  for (const wait of ALL) {
    let want: string | null = null
    if (relaunch.includes(wait)) want = 'relaunch'
    if (reconnect.includes(wait)) want = 'reconnect'
    if (reattach.includes(wait)) want = 'reattach'
    assert.equal(LOG_READ_ACTION[wait], want, wait)
  }
})

test('A REPLY TOO LARGE HAS NO TRY AGAIN: no button can make it smaller', () => {
  assert.equal(LOG_READ_ACTION.replyTooLarge, null)
  assert.doesNotMatch(LOG_READ_TRY.replyTooLarge ?? '', /Try again/)
})

test('a Try line names the button only when the wait has one, and never promises one it lacks', () => {
  for (const wait of ALL) {
    const names = /Try again/i.test(LOG_READ_TRY[wait] ?? '')
    if (names) assert.notEqual(LOG_READ_ACTION[wait], null, `${wait} says to press a button that is not there`)
  }
})

test('the report carries the Try line and the action of its wait', () => {
  const stopped = report({ health: health('idle'), error: error('fold') })
  assert.equal(stopped.wait, 'readerStopped')
  assert.equal(stopped.tryLine, LOG_READ_TRY.readerStopped)
  assert.equal(stopped.action, 'reattach')
  assert.deepEqual(stopped.notes, [])

  const live = report({ readiness: 'ok', health: health('live'), waitingSince: NOW })
  assert.equal(live.wait, 'ok')
  assert.equal(live.tryLine, null)
  assert.equal(live.action, null)

  // An attach nobody answered: the sentence changed from "refused the log file".
  const silent = report({ health: null, error: error('attach', 'timeout') })
  assert.equal(LOG_READ_WORDS[silent.wait], 'The data engine is not answering.')
  assert.equal(silent.action, 'reconnect')
})
