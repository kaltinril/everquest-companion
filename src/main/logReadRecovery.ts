// logReadRecovery.ts - THE READ RECOVERS BY ITSELF WHEN A FACT CHANGES (fork #9, phase R4).
//
// `dataServer/readRetry.ts` is the policy: when a retry is allowed, and each cap. This file binds
// it to the three things it needs: main's look at the log file (`logProbe.ts`), a timer, and the
// re-attach (`engineClientHost.ts reattachEngineLog`). It hears the read's edges
// (`dataServer/readEdges.ts`) and does one of three things when a read ends:
//
//   * WATCH THE FILE. Main cannot open the log (or has not answered yet): look every
//     `FILE_WATCH_MS`, and when a file that could not be opened can be, re-attach.
//   * RETRY ONCE. Main can open the log: re-attach `ENDED_RETRY_MS` later, one time.
//   * STOP, and record why on the status's Last error row.
//
// A RE-ATTACH RE-READS THE WHOLE LOG, SO NOTHING HERE FIRES INTO A READ THAT IS RUNNING. Every
// read starts with a new turn, and a new turn drops whatever was armed. The counts are kept: per
// log, cleared by going live and by a new engine launch (the after-live window by neither).
//
// A LEAF: every dependency is handed in (`main/logReadReport.ts` binds them), so
// `tests/logReadRecovery.test.mts` drives each path with a hand-turned timer.

import type { LogReadProbe } from '../shared/logReadReport'
import type { ReadEdge } from './dataServer/readEdges'
import {
  ENDED_RETRY_MS,
  FILE_BACK_CAP,
  FILE_WATCH_MS,
  NO_RETRIES,
  STOPPED_AFTER_LIVE_LINE,
  afterEnded,
  afterLiveEnded,
  manualTry,
  onProbeChange,
  plainRetrySent,
  probeSeen,
  recentAfterLiveEnds,
  stoppedLine,
  wentLive,
  type ProbeSeen,
  type RetryCounts
} from './dataServer/readRetry'

export interface LogReadRecoveryDeps {
  /** Start an open of the log (`logProbe.ts look`: one in flight per path, answer kept 5 s). */
  readonly look: (path: string) => void
  /** What main last learned about the log, without waiting. */
  readonly last: (path: string) => LogReadProbe | null
  /** Point the engine at the log again; it reads the log from the start. */
  readonly reattach: () => void
  /** Nothing more is tried: the line for the status's Last error row. */
  readonly stopped: (line: string) => void
  /** Call `run` after `ms`; the returned function cancels it. Never keeps the process alive. */
  readonly timer: (run: () => void, ms: number) => () => void
  readonly now: () => number
  /** The dev log. */
  readonly note: (line: string) => void
  /** `watching()` changed: the status's Try line depends on it. */
  readonly changed: () => void
}

export interface LogReadRecovery {
  /** One edge of the read. */
  edge(edge: ReadEdge, logPath: string | null): void
  /** Main's open of a log settled (`logProbe.ts onSettled`). */
  probed(): void
  /** Is a log main could not open being watched, to be read again once it can be opened? */
  watching(): boolean
}

/** What is armed for the read that ended: the file watch, or the one timed re-attach. */
type Job =
  | { readonly log: string; readonly kind: 'watch'; was: ProbeSeen }
  | { readonly log: string; readonly kind: 'retry' }

export function createLogReadRecovery(deps: LogReadRecoveryDeps): LogReadRecovery {
  const counts = new Map<string, RetryCounts>()
  let job: Job | null = null
  let cancel: (() => void) | null = null

  const of = (log: string): RetryCounts => counts.get(log) ?? NO_RETRIES

  // A watch that could not end in a re-attach is not one the screen may promise.
  const watching = (): boolean => job?.kind === 'watch' && of(job.log).fileBackTries < FILE_BACK_CAP

  /** Drop what is armed. The counts are kept. */
  const disarm = (): void => {
    const was = watching()
    cancel?.()
    cancel = null
    job = null
    if (was) deps.changed()
  }

  const reattach = (log: string, counted: RetryCounts, why: string): void => {
    counts.set(log, counted)
    disarm()
    deps.note(`data-server client: reading the log again by itself (${why})`)
    deps.reattach()
  }

  const stop = (line: string): void => {
    disarm()
    deps.note(`data-server client: the read ${line}`)
    deps.stopped(line)
  }

  /** Re-attach once, `ms` from now, unless a new turn comes first. */
  const retryIn = (log: string, ms: number, counted: (c: RetryCounts) => RetryCounts): void => {
    job = { log, kind: 'retry' }
    cancel = deps.timer(() => {
      cancel = null
      reattach(log, counted(of(log)), 'the read ended')
    }, ms)
  }

  const lookLater = (log: string): void => {
    cancel = deps.timer(() => {
      cancel = null
      if (job?.kind !== 'watch' || job.log !== log) return
      deps.look(log)
      lookLater(log)
    }, FILE_WATCH_MS)
  }

  const watch = (log: string, was: ProbeSeen): void => {
    const before = watching()
    if (job?.kind !== 'watch' || job.log !== log || cancel === null) {
      cancel?.()
      lookLater(log)
    }
    job = { log, kind: 'watch', was }
    if (watching() !== before) deps.changed()
  }

  /** The read of `log` ended; main's look at the file has answered, or is still out. */
  const decide = (log: string): void => {
    const c = of(log)
    const probe = probeSeen(deps.last(log))
    const next = afterEnded({ probe, autoTries: c.autoTries, fileBackTries: c.fileBackTries })
    if (next.do === 'watchFile') {
      watch(log, probe)
      return
    }
    disarm()
    if (next.do === 'stop') stop(stoppedLine(c.ends))
    else retryIn(log, next.ms, plainRetrySent)
  }

  const ended = (log: string): void => {
    disarm()
    const c = of(log)
    counts.set(log, { ...c, ends: c.ends + 1 })
    deps.look(log)
    decide(log)
  }

  const endedAfterLive = (log: string): void => {
    disarm()
    const c = of(log)
    const now = deps.now()
    const verdict = afterLiveEnded(c.afterLiveEnds, now)
    counts.set(log, { ...c, ends: c.ends + 1, afterLiveEnds: [...recentAfterLiveEnds(c.afterLiveEnds, now), now] })
    if (verdict === 'stop') stop(STOPPED_AFTER_LIVE_LINE)
    // A beat later, so the status has said the read stopped before it says it is reading again.
    // It uses up the plain retry: a re-read that ends before live must not be read a third time.
    else retryIn(log, ENDED_RETRY_MS, plainRetrySent)
  }

  const probed = (): void => {
    if (job?.kind !== 'watch') return
    const { log, was } = job
    const now = probeSeen(deps.last(log))
    // Another open is out, or nothing moved: the last answer stands.
    if (now === was || now === 'pending') return
    if (was === 'pending') {
      // The first answer since the read ended decides as the end itself would have.
      decide(log)
      return
    }
    const next = onProbeChange(was, now, of(log).fileBackTries)
    if (next === 'wait') job.was = now
    else if (next === 'stop') stop(stoppedLine(of(log).ends))
    else reattach(log, { ...of(log), fileBackTries: of(log).fileBackTries + 1 }, 'the file can be opened again')
  }

  return {
    edge(edge, logPath): void {
      if (edge === 'manual' || edge === 'launch') {
        // A person asking is a changed fact: every count starts over. A new engine has tried
        // nothing yet either, but the after-live window is kept across a launch.
        for (const [log, c] of [...counts]) counts.set(log, edge === 'manual' ? manualTry() : wentLive(c))
        return
      }
      // Every other edge is a read beginning, landing or ending: what was armed is about the last one.
      disarm()
      if (logPath === null) return
      if (edge === 'live') counts.set(logPath, wentLive(of(logPath)))
      else if (edge === 'ended') ended(logPath)
      else if (edge === 'endedAfterLive') endedAfterLive(logPath)
    },
    probed,
    watching
  }
}
