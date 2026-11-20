// What a tab draws where its empty text goes (fork #9, phase R3). A tab said "nothing yet, go
// play" while the log had not been read, or its reply had not been served: only a SERVED snapshot
// that is empty may say that. `emptyOrWaiting` is the one place that decides.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOG_READ_INLINE_AFTER_MS,
  LOG_READ_NOTE,
  LOG_READ_TRY,
  LOG_READ_WORDS,
  emptyOrWaiting,
  inlineDue,
  tabLineText
} from '../src/shared/logReadWords'
import type { LogReadFacts } from '../src/shared/logReadReport'
import { error, health, report, NOW } from './logReadFactsHarness.mts'

const LIVE: Partial<LogReadFacts> = { readiness: 'ok', health: health('live') }

test('A SERVED SNAPSHOT IS THE TAB-S OWN: empty means empty, whatever the status says', () => {
  assert.deepEqual(emptyOrWaiting(false, report(LIVE), 'loot'), { kind: 'empty' })
  // The engine went away after this tab was served: the band says so, the tab keeps its own words.
  assert.deepEqual(emptyOrWaiting(false, report({ supervisor: 'absent' }), 'loot'), { kind: 'empty' })
})

test('NO SNAPSHOT WHILE THE LOG IS READ gives the status sentence and its Try line', () => {
  assert.deepEqual(emptyOrWaiting(true, report(), 'loot'), {
    kind: 'waiting',
    text: 'Still reading your log.',
    tryLine: 'Nothing to do. Large logs take a while.'
  })
  const stopped = emptyOrWaiting(true, report({ health: health('idle'), error: error('fold') }), 'loot')
  assert.deepEqual(stopped, { kind: 'waiting', text: LOG_READ_WORDS.readerStopped, tryLine: LOG_READ_TRY.readerStopped })
  // No module named: the same line.
  assert.deepEqual(emptyOrWaiting(true, report()), emptyOrWaiting(true, report(), 'loot'))
})

test('no snapshot with the log read says the panel has no reply yet, never "nothing yet"', () => {
  assert.deepEqual(emptyOrWaiting(true, report(LIVE), 'loot'), {
    kind: 'waiting',
    text: 'The data engine is answering; this panel has no reply yet.',
    tryLine: null
  })
})

test('A MODULE WHOSE REPLY WAS TOO LARGE says so on its own tab, and only on its own', () => {
  const refused = report({ ...LIVE, tooLargeModules: ['loot', 'gaps'] })
  assert.deepEqual(emptyOrWaiting(true, refused, 'loot'), {
    kind: 'waiting',
    text: "This tab's history is too large for the app to show.",
    tryLine: LOG_READ_NOTE.tooLargeTry
  })
  assert.equal(emptyOrWaiting(true, refused, 'gaps').kind, 'waiting')
  assert.deepEqual(emptyOrWaiting(true, refused, 'respawn'), { kind: 'waiting', text: LOG_READ_WORDS.ok, tryLine: null })
  // With the archive already on, the tab does not say to turn it on.
  const on = report({ ...LIVE, tooLargeModules: ['loot'], archiveOn: true })
  assert.deepEqual(emptyOrWaiting(true, on, 'loot'), { kind: 'waiting', text: LOG_READ_NOTE.tabTooLarge, tryLine: null })
})

test('the tab prints the sentence and what to try as one line, and no dangling space without a Try', () => {
  const reading = emptyOrWaiting(true, report(), 'loot')
  const unanswered = emptyOrWaiting(true, report(LIVE), 'loot')
  assert.ok(reading.kind === 'waiting' && unanswered.kind === 'waiting')
  assert.equal(tabLineText(reading), 'Still reading your log. Nothing to do. Large logs take a while.')
  assert.equal(tabLineText(unanswered), 'The data engine is answering; this panel has no reply yet.')
})

test('a wait outranks the note: a read that is not live is the reason the tab is empty', () => {
  const reading = report({ tooLargeModules: ['loot'] })
  assert.equal(reading.wait, 'reading')
  const line = emptyOrWaiting(true, reading, 'loot')
  assert.equal(line.kind === 'waiting' ? line.text : null, LOG_READ_WORDS.reading)
})

test('THE LINE IS HELD FOR A MOMENT unless main says to show the status: a rebuild must not flash it', () => {
  // A rebuild of the same log: the read is "not live" for a few milliseconds and nothing is shown.
  const rebuild = report({ waitingSince: NOW })
  assert.equal(rebuild.show, false)
  assert.equal(inlineDue(rebuild, 0), false)
  assert.equal(inlineDue(rebuild, LOG_READ_INLINE_AFTER_MS - 1), false)
  assert.equal(inlineDue(rebuild, LOG_READ_INLINE_AFTER_MS), true)
  // The status is on screen already (the band): the tab says the same at once.
  const stopped = report({ health: health('idle'), error: error('fold') })
  assert.equal(stopped.show, true)
  assert.equal(inlineDue(stopped, 0), true)
  // Well under the 15 s the band waits: a tab with nothing else to draw says so sooner.
  assert.ok(LOG_READ_INLINE_AFTER_MS >= 1_000 && LOG_READ_INLINE_AFTER_MS <= 3_000)
})
