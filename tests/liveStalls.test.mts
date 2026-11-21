/**
 * liveStalls.test.mts — the LIVE session's own numbers (JOS-367), end to end.
 *
 * WHAT THE FEATURE CLAIMS, because every assertion below is a term of it: field reports describe
 * ~1 s EverQuest freezes while this app runs, and we cannot see the game's frame time. So the app
 * runs the SAME lateness probe on two threads — main, and a worker that does nothing else — and
 * counts the windows in which BOTH went late. That count is the difference between "the machine
 * stalled" and "we stalled", and it is the one number a single-threaded instrument cannot produce.
 * Beside it ride what our own tail reads cost and what was switched on at the time.
 *
 * (This file also covered the usage-analytics session riders that carried these numbers: their
 * buckets, wire shape and validators. That service was removed on 2026-11-20 and those tests went
 * with it. What is left is the probe's own arithmetic, in `shared/perfLive.ts` and
 * `main/livePerfProbe.ts`.)
 *
 * Pure: no Electron, no worker thread, no clock, so it never skips. The probe's TIMERS are the one
 * thing not asserted here — a timer that fires is the e2e's job (tests/e2e/perf.e2e.mts); what is
 * asserted here is every decision made about the samples once they exist.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coincidentWindows,
  foldLiveLateness,
  LIVE_COINCIDENCE_MS,
  LIVE_PROBE_INTERVAL_MS,
  LIVE_STALL_LATE_MS,
  LIVE_TIMELINE_MS,
  type LiveLateSample
} from '../src/shared/perfLive'
import {
  noteLiveProbeSamples,
  peekLiveTimeline,
  resetLiveProbe,
  takeLiveProbeReading
} from '../src/main/livePerfProbe'

// ---- the probe's arithmetic ----------------------------------------------------------------

/** `n` samples of `lateMs`, one probe interval apart, starting at `at`. */
function ticks(at: number, lateMs: number, n: number): LiveLateSample[] {
  return Array.from({ length: n }, (_, i) => ({ at: at + i * LIVE_PROBE_INTERVAL_MS, lateMs }))
}

test('the fold is a DISTRIBUTION plus the two counts a person can feel', () => {
  const fold = foldLiveLateness([2, 3, 1, 4, 2, 120, 3, 2, 900, 1])
  assert.equal(fold.samples, 10)
  assert.equal(fold.maxMs, 900)
  assert.equal(fold.over100, 2)
  assert.equal(fold.over500, 1)
  // A window that held no ticks folds to zeros beside `samples: 0` — it has not observed a smooth
  // session, it has observed nothing, and the seam that reports it refuses to send that.
  assert.deepEqual(foldLiveLateness([]), {
    samples: 0,
    p95Ms: 0,
    maxMs: 0,
    over100: 0,
    over500: 0
  })
})

test('THE COINCIDENCE MATCHER counts stalls the two threads AGREE on, and nothing else', () => {
  const base = 1_000_000
  // A machine stall: both threads late, a quarter second apart — one event, counted once.
  assert.equal(
    coincidentWindows([{ at: base, lateMs: 800 }], [{ at: base + 250, lateMs: 700 }]),
    1
  )
  // Our own stall: main late, the worker kept perfect time. THE READING THAT BLAMES US.
  assert.equal(coincidentWindows([{ at: base, lateMs: 800 }], []), 0)
  assert.equal(coincidentWindows([{ at: base, lateMs: 800 }], [{ at: base, lateMs: 4 }]), 0)
  // Too far apart to be the same event, by one millisecond past the window.
  assert.equal(
    coincidentWindows(
      [{ at: base, lateMs: 800 }],
      [{ at: base + LIVE_COINCIDENCE_MS + 1, lateMs: 800 }]
    ),
    0
  )
  // Under the late threshold on either side is not a stall at all.
  assert.equal(
    coincidentWindows(
      [{ at: base, lateMs: LIVE_STALL_LATE_MS - 1 }],
      [{ at: base, lateMs: 900 }]
    ),
    0
  )
})

test('EACH SAMPLE IS SPENT ONCE — one long freeze is one verdict, not one per tick', () => {
  // A two-second machine pause makes both threads late on several consecutive ticks. Pairing
  // every main sample against every worker sample in range would report that as nine, which is a
  // number about the probe's cadence rather than about what happened.
  const base = 2_000_000
  const main = ticks(base, 900, 8)
  const worker = ticks(base + 60, 900, 8)
  const hits = coincidentWindows(main, worker)
  assert.equal(hits, 8, 'a matching, one worker sample per main sample')
  // …and it can never exceed the late ticks on the thinner side, which is what makes it
  // comparable between installs that sampled different numbers of times.
  assert.equal(coincidentWindows(main, ticks(base + 60, 900, 2)), 2)
  // Order is not trusted: a fold assembled from two threads' messages has no ordering guarantee,
  // and a matcher fed unsorted input silently under-counts.
  assert.equal(coincidentWindows([...main].reverse(), [...worker].reverse()), 8)
})

test('the reading DRAINS, and `coincident` is absent unless a second clock really ran', () => {
  resetLiveProbe()
  const base = 3_000_000
  noteLiveProbeSamples([...ticks(base, 3, 4), { at: base + 1_000, lateMs: 700 }], null)
  const alone = takeLiveProbeReading()
  assert.equal(alone?.samples, 5)
  assert.equal(alone?.over500, 1)
  // No worker ever spoke ⇒ there was no second clock ⇒ NO VERDICT. Absent, never zero.
  assert.equal(alone?.coincident, undefined)
  assert.equal(alone !== null && 'coincident' in alone, false)
  // Drained: the next report over an interval with no ticks has nothing to say at all, which is
  // what stops one window being counted twice.
  assert.equal(takeLiveProbeReading(), null)

  noteLiveProbeSamples([{ at: base, lateMs: 800 }], [{ at: base + 100, lateMs: 800 }])
  const paired = takeLiveProbeReading()
  assert.equal(paired?.coincident, 1)
  resetLiveProbe()
})

test('the timeline is a bounded ~10-minute ring of PLAIN DATA, and a report does not consume it', () => {
  resetLiveProbe()
  const now = 4_000_000
  // One sample older than the ring's span, one inside it.
  noteLiveProbeSamples(
    [
      { at: now - LIVE_TIMELINE_MS - 1_000, lateMs: 300 },
      { at: now - 1_000, lateMs: 300 }
    ],
    [{ at: now - 900, lateMs: 300 }]
  )
  const timeline = peekLiveTimeline(now)
  assert.equal(timeline.main.length, 1)
  assert.equal(timeline.main[0]?.lateMs, 300)
  assert.equal(timeline.worker.length, 1)
  assert.deepEqual(timeline.tail, [])
  // Draining the FOLD leaves the SHAPE alone: two different questions, and a reader of one must
  // not silently consume the other (`peekTailIoTimeline`'s rule, one file over).
  takeLiveProbeReading()
  assert.equal(peekLiveTimeline(now).main.length, 1)
  resetLiveProbe()
  assert.equal(peekLiveTimeline(now).main.length, 0)
})

test('NOBODY DRAINS ON A TIMER ANY MORE, so an undrained probe is capped at one window of ticks', () => {
  // The ten-minute session report that used to empty these lists is removed. With the HUD open
  // the probe ticks four times a second for as long as the app runs, so the lists hold the newest
  // window and no more.
  resetLiveProbe()
  const window = LIVE_TIMELINE_MS / LIVE_PROBE_INTERVAL_MS
  const base = 5_000_000
  const late = Array.from({ length: window + 600 }, (_, i) => ({
    at: base + i * LIVE_PROBE_INTERVAL_MS,
    lateMs: LIVE_STALL_LATE_MS + i
  }))
  noteLiveProbeSamples(late, late)
  const reading = takeLiveProbeReading()
  assert.equal(reading?.samples, window, 'the fold covers one window, not the whole session')
  // …and it kept the NEWEST: the largest lateness in the run is still in the fold.
  assert.equal(reading?.maxMs, LIVE_STALL_LATE_MS + window + 599)
  assert.ok((reading?.coincident ?? 0) <= window, 'the two late lists were capped the same way')
  resetLiveProbe()
})
