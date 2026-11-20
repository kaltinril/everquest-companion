// What the status says once the read can recover by itself (fork #9, phase R4):
// `src/shared/logReadReport.ts` and the two Try lines in `src/shared/logReadWords.ts`.
//
// THE RULE: a Try line may say the app will try by itself only in a state where it still will.
// Main watches a file it could not open (`main/logReadRecovery.ts`) until a cap is used up; after
// that the same wait is shown with a line that promises nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOG_READ_ACTION, LOG_READ_TRY, LOG_READ_WORDS } from '../src/shared/logReadWords'
import { logReadLines, type LogReadFacts } from '../src/shared/logReadReport'
import { ELSEWHERE_CODE, ELSEWHERE_DETAIL } from '../src/main/dataServer/attachTurn'
import { STOPPED_AFTER_LIVE_LINE, stoppedLine } from '../src/main/dataServer/readRetry'
import { NOW, error, health, report } from './logReadFactsHarness.mts'

const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

function probe(problem: 'missing' | 'unreadable'): LogReadFacts['probe'] {
  return { bytes: null, problem, pendingMs: null }
}

function row(over: Partial<LogReadFacts>, label: string): string | undefined {
  return logReadLines(report(over), NOW).find((line) => line.label === label)?.value
}

const ENDED = { health: health('idle'), error: error('fold') }

// ---- 1. the two Try lines ------------------------------------------------------------------------

test('THE TWO FILE WAITS SAY THE APP WILL TRY BY ITSELF, in the phase-s own words', () => {
  assert.equal(LOG_READ_TRY.logMissing, 'In game, type /log on. The app will pick the file up by itself.')
  assert.equal(LOG_READ_TRY.logUnreadable, 'Close any program that has the log open. The app will try again by itself.')
})

test('WHILE MAIN IS WATCHING THE FILE the report carries the promise', () => {
  const missing = report({ ...ENDED, probe: probe('missing'), watchingFile: true })
  assert.equal(missing.wait, 'logMissing')
  assert.equal(missing.tryLine, LOG_READ_TRY.logMissing)
  const locked = report({ ...ENDED, probe: probe('unreadable'), watchingFile: true })
  assert.equal(locked.wait, 'logUnreadable')
  assert.equal(locked.tryLine, LOG_READ_TRY.logUnreadable)
})

test('ONCE THE CAP IS USED UP THE SAME WAIT PROMISES NOTHING, and points at the button it has', () => {
  const missing = report({ ...ENDED, probe: probe('missing'), watchingFile: false })
  assert.equal(missing.wait, 'logMissing')
  assert.equal(missing.tryLine, 'In game, type /log on. Then press Try again.')
  const locked = report({ ...ENDED, probe: probe('unreadable'), watchingFile: false })
  assert.equal(locked.wait, 'logUnreadable')
  assert.equal(locked.tryLine, 'Close any program that has the log open. Then press Try again.')
  for (const r of [missing, locked]) {
    const line = r.tryLine ?? ''
    assert.doesNotMatch(line, /by itself/, 'a retry that is not coming is still promised')
    assert.equal(r.action, 'reattach', 'the line names a button the wait does not have')
    assert.ok(line.length < 90, line)
    assert.doesNotMatch(line, LONG_DASH)
    assert.doesNotMatch(line, /\bbox\b/i, 'the band prints this on every tab, where there is no box')
    assert.match(line, /\.$/)
  }
  assert.equal(LOG_READ_ACTION.logMissing, 'reattach')
  assert.equal(LOG_READ_ACTION.logUnreadable, 'reattach')
})

test('no other wait is told the app will try by itself, watching or not', () => {
  for (const [wait, line] of Object.entries(LOG_READ_TRY)) {
    if (wait === 'logMissing' || wait === 'logUnreadable') continue
    assert.doesNotMatch(line ?? '', /by itself/, wait)
  }
  // A read that stopped with the file openable is not a file wait: its line never changes.
  for (const watchingFile of [true, false]) {
    const stopped = report({ ...ENDED, watchingFile })
    assert.equal(stopped.wait, 'readerStopped')
    assert.equal(stopped.tryLine, LOG_READ_TRY.readerStopped)
  }
})

test('the Try row of the box is the same line the band prints', () => {
  const over = { ...ENDED, probe: probe('missing'), watchingFile: false }
  assert.equal(row(over, 'Try'), report(over).tryLine)
})

// ---- 2. the new Last error rows ------------------------------------------------------------------

test('THE LAST ERROR ROWS OF THE PHASE, word for word', () => {
  const said = (detail: string): string | undefined =>
    row({ health: null, error: { step: 'fold', code: null, detail, at: NOW, said: [] } }, 'Last error')
  assert.equal(said('the engine stopped reading after it was live'), 'read: the engine stopped reading after it was live')
  assert.equal(said(stoppedLine(2)), 'read: stopped twice; not trying again by itself')
  assert.equal(said(STOPPED_AFTER_LIVE_LINE), 'read: stopped twice after going live; not trying again by itself')
  const elsewhere = { step: 'attach', code: ELSEWHERE_CODE, detail: ELSEWHERE_DETAIL, at: NOW, said: [] } as const
  assert.equal(row({ health: null, error: elsewhere }, 'Last error'), 'open log: the engine is reading another log')
})

test('a read that stopped for good is still the stopped wait, shown at once, with its button', () => {
  for (const detail of [stoppedLine(2), STOPPED_AFTER_LIVE_LINE, 'the engine stopped reading after it was live']) {
    const r = report({ health: null, error: { step: 'fold', code: null, detail, at: NOW, said: [] }, waitingSince: NOW })
    assert.equal(r.wait, 'readerStopped', detail)
    assert.equal(r.show, true, detail)
    assert.equal(r.action, 'reattach', detail)
  }
})

// ---- 3. the engine stayed on another log ---------------------------------------------------------

test('AN ENGINE THAT STAYED ON ANOTHER LOG IS `mismatch`, not a refusal, shown at once', () => {
  const r = report({
    health: null,
    readiness: 'notAttached',
    error: { step: 'attach', code: ELSEWHERE_CODE, detail: ELSEWHERE_DETAIL, at: NOW, said: [] },
    waitingSince: NOW
  })
  assert.equal(r.wait, 'mismatch')
  assert.equal(LOG_READ_WORDS[r.wait], 'The app and its data engine disagree about which log is open.')
  assert.equal(r.show, true)
  assert.equal(r.action, 'reattach')
  assert.equal(r.lastError, 'open log: the engine is reading another log')
  // A refusal and a silence keep their own waits.
  assert.equal(report({ health: null, error: error('attach', 'badParams') }).wait, 'attachRefused')
  assert.equal(report({ health: null, error: error('attach', 'timeout') }).wait, 'notAnswering')
})
