// logProbe.ts - main's own look at the log file, one open at a time (fork #9).
//
// The engine owns log-file facts. This is a diagnostic for when its read has ended, is slow to
// begin or has stopped moving: can this process open the file, and how big is it?
//
// ONE OPEN IN FLIGHT PER PATH, TWO IN ALL. An open of a file on a drive that has stopped answering
// does not fail, it hangs, and every hung open holds one of libuv's four pool threads. The report
// used to open the file on every ask, so a dead share took all four within seconds and then every
// asynchronous file call in main waited behind them. Now a look that finds an open already out
// starts nothing, and how long that open has been out is itself the answer ("the drive is not
// answering").
//
// A LEAF: the open and the clock are handed in, so `tests/logProbe.test.mts` drives an open that
// never settles.

import {
  LOG_READ_HUNG_MS,
  LOG_READ_STALL_MS,
  type LogReadFacts,
  type LogReadProbe
} from '../shared/logReadReport'

/** A settled answer is kept this long before a look opens the file again. */
export const PROBE_KEEP_MS = 5_000
/** The most opens out at once, over every path: half of libuv's pool. */
export const PROBE_MAX_FLIGHTS = 2

export interface LogProbeDeps {
  /** Open `path` for reading and resolve with its size in bytes; reject with the OS error. */
  readonly open: (path: string) => Promise<number>
  readonly now: () => number
}

export interface LogProbe {
  /** Start an open, unless one is out for this path or its last answer is still fresh. */
  look(path: string): void
  /** What is known about `path` right now, or null when nothing was ever asked. Never waits. */
  last(path: string): LogReadProbe | null
  /** Is an open out for `path`? */
  pending(path: string): boolean
  /** Called after each open settles. One listener. */
  onSettled(cb: (() => void) | null): void
}

type Answer = Pick<LogReadProbe, 'bytes' | 'problem'>

interface Entry {
  answer: Answer | null
  answeredAt: number
  /** When the open that is out was started, or null when none is. */
  flightSince: number | null
}

/** What an open that failed says about the file: gone, or there and not readable by this process. */
export function probeProblem(err: unknown): 'missing' | 'unreadable' {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
  return code === 'ENOENT' ? 'missing' : 'unreadable'
}

/**
 * Is the read in a state where main's own look at the file would say something? Only on the
 * failure path: the read ended, the engine has been opening the log for 15 s, or the read has not
 * moved for a minute. A healthy read never has the file opened by this process.
 */
export function worthALook(notes: Pick<LogReadFacts, 'error' | 'health' | 'movedAt'>, now: number): boolean {
  const health = notes.health
  if (notes.error?.step === 'fold' || health?.status === 'idle') return true
  if (health === null) return false
  if (health.status === 'starting' || health.status === 'attaching') return now - health.since >= LOG_READ_HUNG_MS
  return health.status === 'folding' && notes.movedAt !== null && now - notes.movedAt >= LOG_READ_STALL_MS
}

export function createLogProbe(deps: LogProbeDeps): LogProbe {
  const entries = new Map<string, Entry>()
  let flights = 0
  let settled: (() => void) | null = null

  const settle = (entry: Entry, answer: Answer): void => {
    entry.answer = answer
    entry.answeredAt = deps.now()
    entry.flightSince = null
    flights -= 1
    settled?.()
  }

  const start = (path: string, entry: Entry): void => {
    entry.flightSince = deps.now()
    flights += 1
    let flight: Promise<number>
    try {
      flight = deps.open(path)
    } catch (err) {
      flight = Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
    flight.then(
      (bytes) => {
        settle(entry, { bytes, problem: null })
      },
      (err: unknown) => {
        settle(entry, { bytes: null, problem: probeProblem(err) })
      }
    )
  }

  return {
    look(path): void {
      let entry = entries.get(path)
      if (entry === undefined) {
        entry = { answer: null, answeredAt: 0, flightSince: null }
        entries.set(path, entry)
      }
      if (entry.flightSince !== null) return
      if (entry.answer !== null && deps.now() - entry.answeredAt < PROBE_KEEP_MS) return
      // Other paths' opens are hanging: one more would only take another pool thread.
      if (flights >= PROBE_MAX_FLIGHTS) return
      start(path, entry)
    },
    last(path): LogReadProbe | null {
      const entry = entries.get(path)
      if (entry === undefined || (entry.answer === null && entry.flightSince === null)) return null
      const pendingMs = entry.flightSince === null ? null : Math.max(0, deps.now() - entry.flightSince)
      return { bytes: entry.answer?.bytes ?? null, problem: entry.answer?.problem ?? null, pendingMs }
    },
    pending: (path) => (entries.get(path)?.flightSince ?? null) !== null,
    onSettled(cb): void {
      settled = cb
    }
  }
}
