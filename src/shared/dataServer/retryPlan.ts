// retryPlan.ts - when a window tries its own connection to the engine again (fork #9, phase R3).
//
// `renderer/src/lib/engineProvider.tsx` used to ask again every 4 s for ever: the one retry on the
// log-loading path that main's link keeper (`main/dataServer/linkKeeper.ts`) did not cap. The rule
// the rest of the path keeps: a retry has a cap, or needs a changed fact. Here the cap is five
// tries in a row, and the changed fact is the engine words of the status main pushes
// (`LogReadReport.engine`: `starting`, `running, connected, reading`, ...).
//
// Pure: the provider holds the count and the timer.

/** How long to wait after each failed try before the next one. */
export const RETRY_DELAYS_MS: readonly number[] = [4_000, 8_000, 16_000, 30_000]

/** The most tries in a row. After the last one fails no timer is set. */
export const RETRY_MAX_TRIES = RETRY_DELAYS_MS.length + 1

export interface RetryStep {
  /** Failed tries in a row, to carry into the next call. */
  readonly tries: number
  /** How long until the next try; null for no timer: the next try waits for the status to change. */
  readonly delayMs: number | null
}

/**
 * What to do after `tries` failed tries in a row. `statusChanged`: the engine words of the pushed
 * status moved, which is a new fact: try now, and count from nothing.
 */
export function retryPlan(tries: number, statusChanged: boolean): RetryStep {
  if (statusChanged) return { tries: 0, delayMs: 0 }
  return { tries, delayMs: RETRY_DELAYS_MS[tries - 1] ?? null }
}

/** What the window is doing about its connection. */
export type RetryPhase =
  /** A try is out. */
  | 'trying'
  /** A timer is running down to the next try. */
  | 'waiting'
  /** Out of tries: nothing is scheduled. */
  | 'stopped'
  | 'connected'

/** The count and the phase the provider keeps between tries. */
export interface RetryCount {
  readonly tries: number
  readonly phase: RetryPhase
}

/** What happened to a try: its connection was handed over, the engine accepted its hello, it failed. */
export type RetryEvent = 'taken' | 'ready' | 'failed'

/**
 * The count after `event`. A connection that was only TAKEN has proven nothing, so its count
 * stands: clearing it there made every failure at hello (a mismatched engine, a refused token, a
 * socket that closes at once) the first of a new run, and the window asked every 4 s for ever.
 * Only `ready` starts the count again.
 */
export function retryAfter(held: RetryCount, event: RetryEvent): RetryCount {
  if (event === 'taken') return { tries: held.tries, phase: 'connected' }
  if (event === 'ready') return { tries: 0, phase: 'connected' }
  const tries = held.tries + 1
  return { tries, phase: retryPlan(tries, false).delayMs === null ? 'stopped' : 'waiting' }
}

/**
 * What a change of the status's engine words does. A try that is already out is left to finish
 * (`recount`: only its count starts again); a connected window ignores the words, which change
 * all through an ordinary read of the log.
 */
export function onStatusWords(phase: RetryPhase): 'tryNow' | 'recount' | 'nothing' {
  if (phase === 'connected') return 'nothing'
  return phase === 'trying' ? 'recount' : 'tryNow'
}
