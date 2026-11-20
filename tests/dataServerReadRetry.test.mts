// WHEN THE APP READS THE LOG AGAIN BY ITSELF (fork #9, phase R4): `src/main/dataServer/readRetry.ts`.
//
// A re-attach re-reads the whole log, so every automatic one has a cap, and each cap is driven
// past here. The policy is pure: the clock is a number the test hands in.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AFTER_LIVE_WINDOW_MS,
  ENDED_RETRY_MS,
  FILE_BACK_CAP,
  NO_RETRIES,
  STOPPED_AFTER_LIVE_LINE,
  afterEnded,
  afterLiveEnded,
  manualTry,
  onProbeChange,
  probeSeen,
  recentAfterLiveEnds,
  stoppedLine,
  wentLive,
  type ProbeSeen,
  type RetryCounts
} from '../src/main/dataServer/readRetry'

const MIN = 60_000

// ---- 1. a read that ended before it went live ----------------------------------------------------

test('A FILE MAIN CANNOT OPEN IS WATCHED: missing, unreadable, and a look that has not answered', () => {
  for (const probe of ['missing', 'unreadable', 'pending'] as const) {
    assert.deepEqual(afterEnded({ probe, autoTries: 0, fileBackTries: 0 }), { do: 'watchFile' }, probe)
    // The plain retry having been used says nothing about a file that is not there.
    assert.deepEqual(afterEnded({ probe, autoTries: 1, fileBackTries: 0 }), { do: 'watchFile' }, probe)
  }
})

test('A READ THAT ENDED WITH THE FILE OPENABLE IS TRIED ONCE MORE, 2 s later, and never a third time', () => {
  assert.deepEqual(afterEnded({ probe: 'clean', autoTries: 0, fileBackTries: 0 }), { do: 'retryIn', ms: ENDED_RETRY_MS })
  assert.equal(ENDED_RETRY_MS, 2_000)
  assert.deepEqual(afterEnded({ probe: 'clean', autoTries: 1, fileBackTries: 0 }), { do: 'stop' })
  // Driven past the cap: no count above one ever buys another retry.
  for (let tries = 1; tries < 50; tries += 1) {
    assert.deepEqual(afterEnded({ probe: 'clean', autoTries: tries, fileBackTries: 0 }), { do: 'stop' })
  }
})

test('ONCE THE FILE-BACK CAP IS USED UP a file that cannot be opened is not watched any more', () => {
  // Watching it would put "the app will try by itself" on screen for a retry that is not coming.
  for (const probe of ['missing', 'unreadable'] as const) {
    assert.deepEqual(afterEnded({ probe, autoTries: 0, fileBackTries: FILE_BACK_CAP - 1 }), { do: 'watchFile' })
    assert.deepEqual(afterEnded({ probe, autoTries: 0, fileBackTries: FILE_BACK_CAP }), { do: 'stop' })
  }
  // A look still out is waited for whatever the counts: its answer is what decides.
  assert.deepEqual(afterEnded({ probe: 'pending', autoTries: 1, fileBackTries: FILE_BACK_CAP }), { do: 'watchFile' })
})

// ---- 2. the watched file answers -----------------------------------------------------------------

test('ONLY A PROBLEM THAT BECAME CLEAN RE-ATTACHES', () => {
  const all: ProbeSeen[] = ['missing', 'unreadable', 'pending', 'clean']
  for (const was of all) {
    for (const now of all) {
      const back = (was === 'missing' || was === 'unreadable') && now === 'clean'
      assert.equal(onProbeChange(was, now, 0), back ? 'reattach' : 'wait', `${was} to ${now}`)
    }
  }
})

test('THE FILE COMING BACK RE-ATTACHES AT MOST 5 TIMES per log per engine launch', () => {
  assert.equal(FILE_BACK_CAP, 5)
  let counts: RetryCounts = NO_RETRIES
  let sent = 0
  // A file that flaps for ever: the lock comes and goes twenty times.
  for (let flap = 0; flap < 20; flap += 1) {
    if (onProbeChange('unreadable', 'clean', counts.fileBackTries) !== 'reattach') continue
    sent += 1
    counts = { ...counts, fileBackTries: counts.fileBackTries + 1 }
  }
  assert.equal(sent, 5)
  assert.equal(onProbeChange('missing', 'clean', FILE_BACK_CAP), 'stop')
})

// ---- 3. what going live clears, and what it must not ---------------------------------------------

test('GOING LIVE CLEARS autoTries AND fileBackTries, and nothing of the after-live window', () => {
  const used: RetryCounts = { autoTries: 1, fileBackTries: 4, ends: 6, afterLiveEnds: [1_000, 2_000] }
  assert.deepEqual(wentLive(used), { autoTries: 0, fileBackTries: 0, ends: 0, afterLiveEnds: [1_000, 2_000] })
  // After live the plain retry and the file watch are whole again.
  assert.deepEqual(afterEnded({ ...wentLive(used), probe: 'clean' }), { do: 'retryIn', ms: ENDED_RETRY_MS })
  assert.deepEqual(afterEnded({ ...wentLive(used), probe: 'missing' }), { do: 'watchFile' })
})

/** One end after live at `now`: the verdict, and the counts with that end recorded. */
function endAfterLive(counts: RetryCounts, now: number): { verdict: 'reattach' | 'stop'; counts: RetryCounts } {
  const verdict = afterLiveEnded(counts.afterLiveEnds, now)
  return { verdict, counts: { ...counts, afterLiveEnds: [...recentAfterLiveEnds(counts.afterLiveEnds, now), now] } }
}

test('LIVE, ENDED, RE-READ, LIVE, ENDED INSIDE 30 MINUTES: the second end is not re-read. Going live cannot reset it', () => {
  const t0 = 1_800_000_000_000
  let counts = wentLive(NO_RETRIES)
  const first = endAfterLive(counts, t0)
  assert.equal(first.verdict, 'reattach')
  // The re-read lands: live again.
  counts = wentLive(first.counts)
  const second = endAfterLive(counts, t0 + 10 * MIN)
  assert.equal(second.verdict, 'stop', 'a reader that dies after every go-live would be re-read for ever')
  // Driven past the cap: every further end inside the window stops too, however often it went live.
  counts = second.counts
  for (let i = 1; i <= 20; i += 1) {
    counts = wentLive(counts)
    const next = endAfterLive(counts, t0 + 10 * MIN + i * MIN)
    assert.equal(next.verdict, 'stop', `end ${String(i + 2)}`)
    counts = next.counts
  }
})

test('the same two ends 31 minutes apart are both re-read', () => {
  const t0 = 1_800_000_000_000
  const first = endAfterLive(wentLive(NO_RETRIES), t0)
  assert.equal(first.verdict, 'reattach')
  const second = endAfterLive(wentLive(first.counts), t0 + 31 * MIN)
  assert.equal(second.verdict, 'reattach')
  assert.deepEqual(second.counts.afterLiveEnds, [t0 + 31 * MIN], 'an end outside the window is forgotten')
  assert.equal(AFTER_LIVE_WINDOW_MS, 30 * MIN)
  // The edge: exactly 30 minutes is outside.
  assert.equal(afterLiveEnded([t0], t0 + AFTER_LIVE_WINDOW_MS), 'reattach')
  assert.equal(afterLiveEnded([t0], t0 + AFTER_LIVE_WINDOW_MS - 1), 'stop')
})

test('A MANUAL TRY CLEARS THE WINDOW, and every other count', () => {
  const t0 = 1_800_000_000_000
  const first = endAfterLive(wentLive(NO_RETRIES), t0)
  assert.equal(endAfterLive(wentLive(first.counts), t0 + MIN).verdict, 'stop')
  const fresh = manualTry()
  assert.deepEqual(fresh, NO_RETRIES)
  assert.equal(endAfterLive(fresh, t0 + 2 * MIN).verdict, 'reattach')
})

// ---- 4. the look, as the policy sees it ----------------------------------------------------------

test('a look that never answered, or whose open is out, is `pending`; otherwise its problem or clean', () => {
  assert.equal(probeSeen(null), 'pending')
  assert.equal(probeSeen({ bytes: null, problem: 'missing', pendingMs: 0 }), 'pending', 'the kept answer is old')
  assert.equal(probeSeen({ bytes: null, problem: 'missing', pendingMs: null }), 'missing')
  assert.equal(probeSeen({ bytes: null, problem: 'unreadable', pendingMs: null }), 'unreadable')
  assert.equal(probeSeen({ bytes: 4_096, problem: null, pendingMs: null }), 'clean')
})

// ---- 5. what is recorded once nothing more is tried ----------------------------------------------

test('THE STOPPED LINES are the sentences the Last error row prints, with no long dash', () => {
  assert.equal(stoppedLine(2), 'stopped twice; not trying again by itself')
  // Never fewer than twice, and the true count when it is more.
  assert.equal(stoppedLine(1), 'stopped twice; not trying again by itself')
  assert.equal(stoppedLine(6), 'stopped 6 times; not trying again by itself')
  assert.equal(STOPPED_AFTER_LIVE_LINE, 'stopped twice after going live; not trying again by itself')
  const longDash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
  for (const line of [stoppedLine(2), stoppedLine(6), STOPPED_AFTER_LIVE_LINE]) {
    assert.doesNotMatch(line, longDash)
  }
})
