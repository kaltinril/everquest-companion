// The short labels an overlay's title bar prints (fork #9, phase R3). A meter said a bare
// "Reading log..." whatever the app was waiting on, and went on showing numbers that had stopped
// updating with nothing saying so.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOG_READ_SHORT,
  LOG_READ_SHORT_MAX,
  LOG_READ_WORDS,
  OVERLAY_LOADING,
  overlayLabel,
  overlayTitle
} from '../src/shared/logReadWords'
import { LOG_READ_SLOW_MS, type LogReadFacts, type LogReadWait } from '../src/shared/logReadReport'
import { error, health, report, MB, NOW } from './logReadFactsHarness.mts'

const ALL = Object.keys(LOG_READ_WORDS) as LogReadWait[]
const LIVE: Partial<LogReadFacts> = { readiness: 'ok', health: health('live') }
/** A read that has run long enough to be on screen: main is sending its numbers. */
const SHOWN: Partial<LogReadFacts> = { waitingSince: NOW - LOG_READ_SLOW_MS }

test('LOG_READ_SHORT COVERS EVERY WAIT, each at most 22 characters, with no dash', () => {
  assert.equal(LOG_READ_SHORT_MAX, 22)
  assert.deepEqual(Object.keys(LOG_READ_SHORT).sort(), [...ALL].sort())
  for (const wait of ALL) {
    const label = LOG_READ_SHORT[wait]
    assert.ok(label.length <= LOG_READ_SHORT_MAX, `${wait} is ${String(label.length)} characters: ${label}`)
    assert.doesNotMatch(label, /[-–—]/, `${wait} carries a dash`)
    assert.equal(label, label.trim())
  }
})

test('only `ok` has nothing to say, and no two waits share a label', () => {
  for (const wait of ALL) {
    assert.equal(LOG_READ_SHORT[wait] === '', wait === 'ok', wait)
  }
  const said = ALL.map((wait) => LOG_READ_SHORT[wait])
  assert.equal(new Set(said).size, said.length)
})

test('THE LABEL CARRIES THE PERCENTAGE WHILE THE LOG IS READ, and stays inside the 22 characters', () => {
  assert.equal(overlayLabel(report(SHOWN)), 'Reading log 36%')
  // 99.9% is not 100%: the read is not over.
  const nearly = report({ ...SHOWN, fold: { offset: 999, logSize: 1_000, events: 1, pct: 99.9 } })
  assert.equal(overlayLabel(nearly), 'Reading log 99%')
  assert.ok('Reading log 100%'.length <= LOG_READ_SHORT_MAX)
  // Nothing measured: no number is invented.
  assert.equal(overlayLabel(report({ ...SHOWN, fold: null, lastOffset: null })), 'Reading log')
  // Only the wait `reading` counts up: a stopped read's position is not a progress.
  const stopped = report({ health: health('idle'), error: error('fold'), fold: null, lastOffset: 148 * MB, logSize: 412 * MB })
  assert.equal(overlayLabel(stopped), 'Log read stopped')
  assert.equal(overlayLabel(report(LIVE)), '')
  assert.equal(overlayLabel(null), '')
})

test('NO PERCENTAGE BEFORE THE STATUS IS SHOWN: main sends no numbers until then, so it would stand still', () => {
  // Two seconds into a read: this report reaches a window once, and its 36% is never replaced
  // until the words change or the status shows (main/logReadStatus.ts sends numbers only then).
  const early = report()
  assert.equal(early.wait, 'reading')
  assert.equal(early.show, false)
  assert.equal(early.pct === null, false)
  assert.equal(overlayLabel(early), 'Reading log', 'a number nobody keeps current was printed')
  assert.deepEqual(overlayTitle(early, true, 'No fight'), { title: 'Reading log', tail: undefined })
  // The same held beside a fight's name during a rebuild of the same log.
  assert.deepEqual(overlayTitle(early, false, 'a gnoll'), { title: 'a gnoll', tail: 'Reading log' })
  // Shown: main sends the numbers every 2 s, and the label counts.
  assert.equal(report(SHOWN).show, true)
  assert.equal(overlayLabel(report(SHOWN)), 'Reading log 36%')
})

test('A METER WITH NO REPLY SAYS WHY IN ITS TITLE, never a bare "Reading log"', () => {
  assert.deepEqual(overlayTitle(report({ supervisor: 'starting' }), true, 'No fight'), { title: 'Starting engine', tail: undefined })
  assert.deepEqual(overlayTitle(report({ supervisor: 'absent' }), true, 'No fight'), { title: 'Engine missing', tail: undefined })
  assert.deepEqual(overlayTitle(report(SHOWN), true, 'No fight'), { title: 'Reading log 36%', tail: undefined })
  // The log is read, or the status has not arrived: "Reading log" would not be true.
  assert.equal(OVERLAY_LOADING, 'Loading…')
  assert.deepEqual(overlayTitle(report(LIVE), true, 'No fight'), { title: OVERLAY_LOADING, tail: undefined })
  assert.deepEqual(overlayTitle(null, true, 'No fight'), { title: OVERLAY_LOADING, tail: undefined })
})

test('OVER NUMBERS THAT ARE HELD THE REASON GOES BESIDE THE NAME, and a healthy meter gains nothing', () => {
  assert.deepEqual(overlayTitle(report(LIVE), false, 'a gnoll'), { title: 'a gnoll', tail: undefined })
  assert.deepEqual(overlayTitle(null, false, 'a gnoll'), { title: 'a gnoll', tail: undefined })
  const stopped = report({ health: health('idle'), error: error('fold') })
  assert.deepEqual(overlayTitle(stopped, false, 'a gnoll'), { title: 'a gnoll', tail: 'Log read stopped' })
  assert.deepEqual(overlayTitle(report({ connection: 'failed' }), false, 'a gnoll'), { title: 'a gnoll', tail: 'Connecting' })
})
