// The words of the log-read status (fork #9, phase R2): every wait has a sentence, a Try line or
// a stated absence of one, and a decision about its Try again button. No state ships without
// words, and the too-large state has no retry.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOG_READ_ACTION, LOG_READ_TRY, LOG_READ_WORDS } from '../src/shared/logReadWords'
import { bandPosition, boxShows, logReadLines, LOG_READ_STALL_MS } from '../src/shared/logReadReport'
import type { LogReadReport, LogReadWait } from '../src/shared/logReadReport'
import { error, health, report, MB, NOW } from './logReadFactsHarness.mts'

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
      assert.doesNotMatch(line, /[\u2013\u2014]/, `${wait} carries an em or en dash`)
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

// ---- the band prints the Try line on every tab, with no box around it ----------------------------

/** A report of `wait` with a measured position, whatever the facts that would lead to it. */
function shownAs(wait: LogReadWait): LogReadReport {
  return { ...report(), wait, tryLine: LOG_READ_TRY[wait], action: LOG_READ_ACTION[wait], show: true }
}

/** Does this Try line send the player to look at where the read is? */
const SPEAKS_OF_POSITION = /Read so far|Stopped at|the same place/

test('NO TRY LINE POINTS AT SOMETHING THE BAND DOES NOT DRAW: the band is on every tab, the box is not', () => {
  // The rows only the box has. `Try` is left out: it is the label of the line itself.
  const boxOnly = logReadLines(shownAs('reading'), NOW)
    .map((line) => line.label)
    .filter((label) => label !== 'Try' && !SPEAKS_OF_POSITION.test(label))
  assert.ok(boxOnly.includes('Last error') && boxOnly.includes('Version'), 'the box lost the rows this test reads')
  for (const wait of ALL) {
    const line = LOG_READ_TRY[wait] ?? ''
    assert.doesNotMatch(line, /\bbox\b/i, `${wait} points at a box the band does not have: ${line}`)
    for (const label of [...boxOnly, 'Engine said']) {
      assert.ok(!new RegExp(`\\b${label}\\b`).test(line), `${wait} names the box's ${label} row: ${line}`)
    }
  }
})

test('A TRY LINE THAT SPEAKS OF WHERE THE READ IS HAS THAT ROW IN THE BAND, under the name it uses', () => {
  const speaking = ALL.filter((wait) => SPEAKS_OF_POSITION.test(LOG_READ_TRY[wait] ?? ''))
  assert.deepEqual(speaking, ['readerStopped', 'stalled'])
  for (const wait of speaking) {
    const shown = shownAs(wait)
    const row = bandPosition(shown)
    assert.ok(row !== null, `${wait} tells the player to watch a row the band does not draw`)
    // The band's row is the box's own row, word for word.
    assert.deepEqual(logReadLines(shown, NOW).find((line) => line.label === row.label), row)
    const named = /Read so far|Stopped at/.exec(LOG_READ_TRY[wait] ?? '')?.[0]
    if (named !== undefined) assert.equal(row.label, named, wait)
  }
})

test('the band draws where the read is only for a read that stands still, and never an unknown', () => {
  const stopped = report({ health: health('idle'), error: error('fold'), fold: null, lastOffset: 100 * MB, logSize: 400 * MB })
  assert.equal(stopped.wait, 'readerStopped')
  assert.deepEqual(bandPosition(stopped), { label: 'Stopped at', value: '100.0 MB (25%)' })

  const stalled = report({ movedAt: NOW - LOG_READ_STALL_MS })
  assert.equal(stalled.wait, 'stalled')
  assert.deepEqual(bandPosition(stalled), { label: 'Read so far', value: '148.8 MB (36%), 1,571,003 events' })

  // Nothing measured it: no row, never a 0.
  const unknown = report({ health: health('idle'), error: error('fold'), fold: null, lastOffset: null })
  assert.equal(unknown.wait, 'readerStopped')
  assert.equal(bandPosition(unknown), null)

  // A number that moves would make a screen reader say the whole band again at every push.
  for (const wait of ALL) {
    if (wait !== 'readerStopped' && wait !== 'stalled') assert.equal(bandPosition(shownAs(wait)), null, wait)
  }
})

test('WITH NO ENGINE PROGRAM AND A CHARACTER PICKED, the box is up at the first check with its Try row and a button', () => {
  // What the no-engine-binary e2e run (tests/e2e/engine-absent.e2e.mts) would read off the screen.
  const missing = report({
    supervisor: 'absent',
    fault: { kind: 'no-binary', attempts: 0, detail: null },
    connection: null,
    health: null,
    fold: null,
    lastOffset: null,
    movedAt: null
  })
  assert.equal(missing.wait, 'engineMissing')
  assert.equal(boxShows(missing, 0), true)
  const lines = logReadLines(missing, NOW)
  assert.equal(lines.find((line) => line.label === 'Try')?.value, LOG_READ_TRY.engineMissing)
  assert.equal(missing.action, 'relaunch', 'the box draws its Try again button from the action')
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
