// The log-read decision, phase R2 (fork #9): the causes added to `composeLogReadReport` and the
// order they win in. The cases that were there before are in tests/logReadReport.test.mts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMBAT_READ_FRESH_MS,
  LOG_READ_FINISH_MS,
  LOG_READ_HUNG_MS,
  LOG_READ_OPENING_MS,
  LOG_READ_SLOW_MS,
  LOG_READ_STALL_MS,
  logReadLines,
  type LogReadFacts
} from '../src/shared/logReadReport'
import { KB, MB, NOW, error, facts, health, report } from './logReadFactsHarness.mts'
import { composeLogReadReport } from '../src/shared/logReadReport'

function waitOf(over: Partial<LogReadFacts>): string {
  return report(over).wait
}

function row(over: Partial<LogReadFacts>, label: string): string | undefined {
  return logReadLines(report(over), NOW).find((line) => line.label === label)?.value
}

const NO_BINARY = { kind: 'no-binary', attempts: 0, detail: null }
const LIVE = { readiness: 'ok', health: health('live') }

// ---- 1. the engine before the character --------------------------------------------------------

test('A MISSING ENGINE IS NAMED EVEN WITH NO CHARACTER PICKED', () => {
  // A fresh install whose antivirus took the engine: it used to say only "No character log is
  // selected", and picking one changes nothing.
  assert.equal(waitOf({ logPath: null, fault: NO_BINARY, supervisor: 'absent', connection: null }), 'engineMissing')
  assert.equal(waitOf({ logPath: null, supervisor: 'absent' }), 'engineMissing')
  const failing = { kind: 'exited', attempts: 4, detail: null }
  assert.equal(waitOf({ logPath: null, fault: failing, supervisor: 'backoff' }), 'engineFailing')
})

test('no character with the engine merely starting, or up, is `noCharacter`', () => {
  assert.equal(waitOf({ logPath: null, supervisor: 'starting', connection: null }), 'noCharacter')
  assert.equal(waitOf({ logPath: null, supervisor: 'backoff', connection: null }), 'noCharacter')
  assert.equal(waitOf({ logPath: null }), 'noCharacter')
})

// ---- 2. an attach nobody answered --------------------------------------------------------------

test('AN ATTACH THAT TIMED OUT IS `notAnswering`; one the engine refused stays `attachRefused`', () => {
  assert.equal(waitOf({ health: null, error: error('attach', 'timeout') }), 'notAnswering')
  assert.equal(waitOf({ health: null, error: error('attach', 'badParams') }), 'attachRefused')
  assert.equal(waitOf({ health: null, error: error('attach', 'internal') }), 'attachRefused')
  assert.equal(waitOf({ health: null, error: error('attach') }), 'attachRefused', 'no code is a refusal')
  // The refusal shows at once; the silence waits out the slow clock like any unanswered ask.
  assert.equal(report({ health: null, error: error('attach', 'badParams'), waitingSince: NOW }).show, true)
  assert.equal(report({ health: null, error: error('attach', 'timeout'), waitingSince: NOW }).show, false)
})

// ---- 3. slow to open, and still at the end -----------------------------------------------------

test('THE ENGINE OPENING THE LOG FOR A MINUTE IS `opening`, and is not shown at once', () => {
  for (const status of ['starting', 'attaching']) {
    const slow = { fold: null, movedAt: null, lastOffset: null, health: health(status, LOG_READ_OPENING_MS) }
    assert.equal(waitOf(slow), 'opening', status)
    assert.equal(report({ ...slow, waitingSince: NOW }).show, false, 'a slow open is not a failure')
    assert.equal(report({ ...slow, waitingSince: NOW - LOG_READ_SLOW_MS }).show, true)
    assert.equal(waitOf({ ...slow, health: health(status, LOG_READ_OPENING_MS - 1) }), 'reading')
  }
  // A folding engine is past the open, however long it has been folding.
  assert.equal(waitOf({ health: health('folding', LOG_READ_OPENING_MS * 3) }), 'reading')
})

/** Folding, with `left` bytes to go and no growth for `stillMs`. */
function still(left: number, stillMs: number): Partial<LogReadFacts> {
  const logSize = 400 * MB
  const offset = logSize - left
  return {
    fold: { offset, logSize, events: 9, pct: (offset / logSize) * 100 },
    lastOffset: offset,
    movedAt: NOW - stillMs,
    health: health('folding', stillMs + 5_000)
  }
}

test('A STILL READ WITHIN 64 KiB OF THE END IS `finishing`, for five minutes', () => {
  const twoMinutes = report(still(10 * KB, 120_000))
  assert.equal(twoMinutes.wait, 'finishing')
  assert.equal(twoMinutes.action, null, 'there is nothing to press while it finishes')
  assert.equal(waitOf(still(64 * KB, LOG_READ_STALL_MS)), 'finishing', 'the edge of the window counts')
  assert.equal(waitOf(still(0, LOG_READ_FINISH_MS - 1)), 'finishing')
  // Held for five minutes it is stalled like any other read that stopped moving.
  assert.equal(waitOf(still(10 * KB, LOG_READ_FINISH_MS)), 'stalled')
  // Under a minute of stillness it is simply reading.
  assert.equal(waitOf(still(10 * KB, LOG_READ_STALL_MS - 1)), 'reading')
})

test('A STILL READ FAR FROM THE END IS `stalled` AT ONE MINUTE', () => {
  assert.equal(waitOf(still(200 * MB, LOG_READ_STALL_MS)), 'stalled')
  assert.equal(waitOf(still(64 * KB + 1, LOG_READ_STALL_MS)), 'stalled', 'one byte outside the window')
  assert.equal(report({ ...still(200 * MB, LOG_READ_STALL_MS), waitingSince: NOW }).show, true)
  // `finishing` is not a failure: it waits out the slow clock.
  assert.equal(report({ ...still(10 * KB, 120_000), waitingSince: NOW }).show, false)
})

test('with no size stated nothing can be called near the end', () => {
  const unsized = { ...still(10 * KB, 120_000), fold: null, logSize: null }
  assert.equal(waitOf(unsized), 'stalled')
  // The engine's last stated size and the health mark are enough without a progress frame.
  assert.equal(waitOf({ ...unsized, logSize: 400 * MB }), 'finishing')
})

// ---- 4. the two logs disagree ------------------------------------------------------------------

test('THE ENGINE CAUGHT UP ON A LOG THE APP IS NOT SERVING FROM IS `mismatch`, shown at once', () => {
  const r = report({ readiness: 'notAttached', health: health('live'), waitingSince: NOW })
  assert.equal(r.wait, 'mismatch')
  assert.equal(r.show, true)
  assert.equal(r.action, 'reattach')
  // Not attached and not live yet is the ordinary read.
  assert.equal(waitOf({ readiness: 'notAttached', health: health('folding') }), 'reading')
  assert.equal(waitOf({ readiness: 'notAttached', health: null, fold: null, movedAt: null }), 'reading')
  // Live and not yet recorded as live is one poll's worth of `reading`, never a mismatch.
  assert.equal(waitOf({ readiness: 'notLive', health: health('live') }), 'reading')
})

// ---- 5. the drive that does not answer ---------------------------------------------------------

function probe(pendingMs: number | null, problem: 'missing' | 'unreadable' | null = null): LogReadFacts['probe'] {
  return { bytes: null, problem, pendingMs }
}

test('AN OPEN THAT HAS BEEN OUT 15 s IS `logHung`; one out 3 s is not', () => {
  const opening = { fold: null, movedAt: null, lastOffset: null, health: health('attaching', 30_000) }
  const hung = report({ ...opening, probe: probe(LOG_READ_HUNG_MS), waitingSince: NOW })
  assert.equal(hung.wait, 'logHung')
  assert.equal(hung.show, true, 'a drive that does not answer is a failure, not a long wait')
  assert.equal(hung.action, 'reattach')
  assert.equal(waitOf({ ...opening, probe: probe(3_000) }), 'reading')
  assert.equal(waitOf({ ...opening, probe: probe(LOG_READ_HUNG_MS - 1) }), 'reading')
  assert.equal(waitOf({ ...opening, probe: probe(null) }), 'reading')
})

test('a hung drive is the reason given for a read that ended, and for one that stopped moving', () => {
  const ended = { health: health('idle'), error: error('fold') }
  assert.equal(waitOf({ ...ended, probe: probe(LOG_READ_HUNG_MS) }), 'logHung')
  // An older answer that the file was missing does not outvote an open that is hanging now.
  assert.equal(waitOf({ ...ended, probe: probe(LOG_READ_HUNG_MS, 'missing') }), 'logHung')
  assert.equal(waitOf({ ...ended, probe: probe(2_000, 'missing') }), 'logMissing')
  assert.equal(waitOf({ ...ended, probe: probe(2_000) }), 'readerStopped')
  assert.equal(waitOf({ ...still(200 * MB, LOG_READ_STALL_MS), probe: probe(LOG_READ_HUNG_MS) }), 'logHung')
})

test('an engine or an attach that failed outright is still named before the drive', () => {
  const hung = probe(LOG_READ_HUNG_MS)
  assert.equal(waitOf({ supervisor: 'absent', probe: hung }), 'engineMissing')
  assert.equal(waitOf({ health: null, error: error('attach', 'badParams'), probe: hung }), 'attachRefused')
  assert.equal(waitOf({ error: error('health', 'timeout'), probe: hung }), 'notAnswering')
})

// ---- 6. where a read that ended stopped --------------------------------------------------------

test('A READ THAT ENDED STILL SAYS WHERE IT STOPPED, with no fold measurement held', () => {
  // The launch state dropped its fold when the read ended; the last health mark is what is left.
  const ended = {
    health: health('idle'),
    error: error('fold'),
    fold: null,
    logSize: 400 * MB,
    lastOffset: 100 * MB
  }
  const r = report(ended)
  assert.equal(r.wait, 'readerStopped')
  assert.equal(r.offset, 100 * MB)
  assert.equal(r.pct, 25)
  assert.equal(r.events, null, 'nobody counted events, so none are claimed')
  assert.equal(row(ended, 'Stopped at'), '100.0 MB (25%)')
  assert.equal(row(ended, 'Read so far'), undefined)
  // Every ended wait uses the label; main's own measurement is the size of last resort.
  const sized = { ...ended, logSize: null }
  assert.equal(row({ ...sized, probe: { bytes: 200 * MB, problem: 'unreadable', pendingMs: null } }, 'Stopped at'), '100.0 MB (50%)')
  assert.equal(row({ ...sized, probe: probe(null, 'missing') }, 'Stopped at'), '100.0 MB')
})

test('a read that has not ended keeps the label `Read so far`', () => {
  assert.equal(row({}, 'Read so far'), '148.8 MB (36%), 1,571,003 events')
  assert.equal(row({}, 'Stopped at'), undefined)
  assert.equal(row(still(200 * MB, LOG_READ_STALL_MS), 'Stopped at'), undefined)
  // With no progress frame yet, the health mark alone is the offset.
  assert.equal(row({ fold: null, lastOffset: 4 * MB }, 'Read so far'), '4.0 MB')
  // A log that grew past the last mark never prints more than 100%.
  assert.equal(report({ fold: null, lastOffset: 9 * MB, logSize: 8 * MB }).pct, 100)
})

test('a read that has landed prints no offset: the log grows on and nobody asks for the mark again', () => {
  const r = report({ ...LIVE, fold: null, lastOffset: 300 * MB, logSize: 412.3 * MB })
  assert.equal(r.offset, null)
  assert.equal(r.pct, null)
  assert.equal(r.logBytes, 412.3 * MB)
})

// ---- 7. the meter's own read, after the log is read --------------------------------------------

function unserved(sinceMs: number, atMs = 0): LogReadFacts['lastCombatRead'] {
  return { unserved: 'the engine did not answer in time', why: 'timedOut', at: NOW - atMs, since: NOW - sinceMs }
}

test('ONE SLOW METER READ HOURS AFTER GOING LIVE IS NOT SHOWN: its wait is timed from itself', () => {
  // The log went live two hours ago; the meter's read has just timed out once.
  const once = report({ ...LIVE, waitingSince: NOW - 7_200_000, lastCombatRead: unserved(0) })
  assert.equal(once.wait, 'notAnswering')
  assert.equal(once.show, false, 'every tab was told the engine is not answering over one slow read')
  assert.equal(once.waitingSince, NOW, 'the Waiting row counts from the first unserved read')
  // Unserved in a row for 15 s it is shown.
  const held = report({ ...LIVE, waitingSince: NOW - 7_200_000, lastCombatRead: unserved(LOG_READ_SLOW_MS) })
  assert.equal(held.show, true)
  assert.equal(held.action, 'reconnect')
})

test('a meter read nobody has repeated for 10 s says nothing any more', () => {
  const live = { ...LIVE, waitingSince: NOW - 7_200_000 }
  assert.equal(waitOf({ ...live, lastCombatRead: unserved(60_000, COMBAT_READ_FRESH_MS) }), 'notAnswering')
  // The Combat tab was left: the verdict of a read nobody is asking is not put on every tab.
  const stale = report({ ...live, lastCombatRead: unserved(60_000, COMBAT_READ_FRESH_MS + 1) })
  assert.equal(stale.wait, 'ok')
  assert.equal(stale.show, false)
  assert.equal(stale.waitingSince, NOW - 7_200_000)
  // The same for a reply that was too large.
  const large = { op: 'combat.snapshot', module: null, chars: 71 * MB, refused: true, limit: 64 * MB, at: NOW }
  const tooLarge = { unserved: 'the reply was too large to show', why: 'tooLarge', at: NOW, since: NOW }
  assert.equal(waitOf({ ...live, tooLarge: large, lastCombatRead: tooLarge }), 'replyTooLarge')
  const left = { ...tooLarge, at: NOW - COMBAT_READ_FRESH_MS - 1 }
  assert.equal(waitOf({ ...live, tooLarge: large, lastCombatRead: left }), 'ok')
})

test('the facts object is not changed by composing a report from it', () => {
  const f = Object.freeze(facts({ health: Object.freeze(health('idle')), error: Object.freeze(error('fold')) }))
  assert.doesNotThrow(() => composeLogReadReport(f))
})
