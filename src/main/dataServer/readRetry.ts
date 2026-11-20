// readRetry.ts - WHEN THE APP READS THE LOG AGAIN BY ITSELF, and when it stops (fork #9, phase R4).
//
// Until this phase nothing retried a read by itself: a log that was locked for one second at
// launch cost the whole session. Three cases now do, and each has a cap, because a re-attach
// re-reads the whole log:
//
//   * THE FILE CAME BACK. The read ended while main could not open the log (missing, or held by
//     another program) and main can open it now: at most `FILE_BACK_CAP` times per log per engine
//     launch.
//   * ONE PLAIN RETRY. The read ended and main can open the log: once, `ENDED_RETRY_MS` later. A
//     read that ends twice is not tried a third time.
//   * AFTER LIVE. The engine stopped reading a log it had caught up on: once, and not again while
//     an earlier such end lies inside `AFTER_LIVE_WINDOW_MS`. That re-read IS the plain retry: if
//     it ends before it goes live, the log is not read a third time.
//
// GOING LIVE CLEARS THE FIRST TWO COUNTS AND NEVER THE THIRD. A reader that dies on a line the
// game writes after live goes live again on every re-read; if going live reset its window, it
// would be re-read for ever.
//
// PURE: no clock, no timer, no file. `main/logReadRecovery.ts` binds it.

import type { LogReadProbe } from '../../shared/logReadReport'

/** The most re-attaches because the file became openable again, per log per engine launch. */
export const FILE_BACK_CAP = 5
/** How long after a read ended, with the file openable, the one retry is sent. */
export const ENDED_RETRY_MS = 2_000
/** How often main looks at a file it could not open. */
export const FILE_WATCH_MS = 5_000
/** One automatic re-read after live, and no second while an earlier end lies inside this. */
export const AFTER_LIVE_WINDOW_MS = 30 * 60_000

/** Main's own look at the log (`main/logProbe.ts`), as the policy sees it. */
export type ProbeSeen = 'missing' | 'unreadable' | 'pending' | 'clean'

/** `pending` when nothing has answered yet, or an open is out and the kept answer is old. */
export function probeSeen(probe: LogReadProbe | null): ProbeSeen {
  if (probe?.pendingMs !== null) return 'pending'
  return probe.problem ?? 'clean'
}

/**
 * `probeSeen` for a read that ended at `endedAt`. An answer main took before the end is `pending`:
 * the file may have been locked or removed since, and that is what ended the read.
 */
export function probeSeenSince(probe: LogReadProbe | null, answeredAt: number | null, endedAt: number): ProbeSeen {
  if (answeredAt === null || answeredAt < endedAt) return 'pending'
  return probeSeen(probe)
}

/** What has been tried for one log. */
export interface RetryCounts {
  /** Plain retries of a read that ended with the file openable. */
  readonly autoTries: number
  /** Re-attaches because the file became openable again. */
  readonly fileBackTries: number
  /** How many times the read has ended since it last went live, the end after live included. */
  readonly ends: number
  /** When the engine stopped reading after live. Nothing clears these but time and a person. */
  readonly afterLiveEnds: readonly number[]
}

export const NO_RETRIES: RetryCounts = { autoTries: 0, fileBackTries: 0, ends: 0, afterLiveEnds: [] }

/** The read went live, or a new engine was launched: the after-live window is kept. */
export function wentLive(counts: RetryCounts): RetryCounts {
  return { ...NO_RETRIES, afterLiveEnds: counts.afterLiveEnds }
}

/** A retry of a read that ended was sent. The re-read after live is one: it meets the same line. */
export function plainRetrySent(counts: RetryCounts): RetryCounts {
  return { ...counts, autoTries: counts.autoTries + 1 }
}

/** A person pressed Try again: a changed fact, so every count starts over. */
export function manualTry(): RetryCounts {
  return NO_RETRIES
}

export type AfterEnded =
  | { readonly do: 'watchFile' }
  | { readonly do: 'retryIn'; readonly ms: number }
  | { readonly do: 'stop' }

/**
 * The read ended before it went live. What now?
 *
 * A look that has not answered is waited for (`watchFile`): the answer decides. A file main
 * cannot open is watched only while a file-back re-attach is still allowed, so the screen never
 * promises a retry that will not come.
 */
export function afterEnded(s: Pick<RetryCounts, 'autoTries' | 'fileBackTries'> & { readonly probe: ProbeSeen }): AfterEnded {
  if (s.probe === 'pending') return { do: 'watchFile' }
  if (s.probe !== 'clean') return s.fileBackTries < FILE_BACK_CAP ? { do: 'watchFile' } : { do: 'stop' }
  return s.autoTries === 0 ? { do: 'retryIn', ms: ENDED_RETRY_MS } : { do: 'stop' }
}

/** Main's look at a watched file answered `now` after `was`. Only problem to clean re-attaches. */
export function onProbeChange(was: ProbeSeen, now: ProbeSeen, fileBackTries: number): 'reattach' | 'stop' | 'wait' {
  const hadProblem = was === 'missing' || was === 'unreadable'
  if (!hadProblem || now !== 'clean') return 'wait'
  return fileBackTries < FILE_BACK_CAP ? 'reattach' : 'stop'
}

/** The after-live ends that still count at `now`. */
export function recentAfterLiveEnds(endsAt: readonly number[], now: number): number[] {
  return endsAt.filter((at) => now - at < AFTER_LIVE_WINDOW_MS)
}

/** The engine stopped reading after live, at `now`; `endsAt` are the EARLIER such ends. */
export function afterLiveEnded(endsAt: readonly number[], now: number): 'reattach' | 'stop' {
  return recentAfterLiveEnds(endsAt, now).length === 0 ? 'reattach' : 'stop'
}

/** The Last error row once nothing more is tried: `stopped twice; not trying again by itself`. */
export function stoppedLine(ends: number): string {
  const times = ends <= 2 ? 'twice' : `${String(ends)} times`
  return `stopped ${times}; not trying again by itself`
}

export const STOPPED_AFTER_LIVE_LINE = 'stopped twice after going live; not trying again by itself'
