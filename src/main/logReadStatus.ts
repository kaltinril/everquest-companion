// logReadStatus.ts - THE PUBLISHER: the log-read status, pushed to every window when it changes
// (fork #9).
//
// The report used to be polled: a "Reading log..." panel asked every 3 s, and only two panels
// asked at all. Now whatever moves a fact pokes this file, it composes the report again, and it
// sends the report when WHAT IS SAID changed.
//
// A PUSH MUST NEVER STORM, so there are two kinds of change:
//
//   * WHAT IS SAID (`statusChanged`: the wait, whether it shows, the Try line, the button, the
//     notes, the engine words, the last error, the log's name) is sent at once.
//   * NUMBERS ALONE (the offset, the percentage, the event count, the engine's quoted lines) are
//     sent at most every 2 s, and only while the status is on screen. A fold reports progress four
//     times a second; none of that is news to a window that is not drawing it.
//
// SOME VERDICTS MOVE WITH THE CLOCK AND NOTHING POKES FOR A CLOCK: "reading" becomes "stalled"
// after a minute with no growth, a wait shows after 15 s. So while `shouldTick` says the verdict
// can change by itself, the report is composed again every second. A slow second timer composes it
// every 10 s whatever the state: the net under a poke somebody forgot to send.
//
// A LEAF: the build, the send, the timer and the clock are handed in (`main/logReadReport.ts`
// binds them), so `tests/logReadStatus.test.mts` drives every case with a counter for a clock.

import type { LogReadNote, LogReadReport, LogReadWait } from '../shared/logReadReport'

/** Numbers alone reach a window at most this often. */
export const STATUS_NUMBERS_EVERY_MS = 2_000
/** How often the report is composed again while its verdict can move with the clock. */
export const STATUS_TICK_MS = 1_000
/** How often it is composed again whatever the state. */
export const STATUS_NET_MS = 10_000

function sameNotes(a: readonly LogReadNote[], b: readonly LogReadNote[]): boolean {
  if (a.length !== b.length) return false
  return a.every((note, i) => {
    const other = b[i]
    const same = note.id === other.id && note.text === other.text
    return same && note.tryLine === other.tryLine && note.button === other.button
  })
}

/** Did what the player is TOLD change? Numbers alone never answer yes. */
export function statusChanged(prev: LogReadReport | null, next: LogReadReport): boolean {
  if (prev === null) return true
  const said =
    prev.wait === next.wait &&
    prev.show === next.show &&
    prev.tryLine === next.tryLine &&
    prev.action === next.action &&
    prev.engine === next.engine &&
    prev.lastError === next.lastError &&
    prev.logFile === next.logFile
  return !said || !sameNotes(prev.notes, next.notes)
}

/** The rest of the report: what `statusChanged` leaves out. */
function sameNumbers(prev: LogReadReport, next: LogReadReport): boolean {
  const measured =
    prev.logBytes === next.logBytes &&
    prev.offset === next.offset &&
    prev.pct === next.pct &&
    prev.events === next.events &&
    prev.waitingSince === next.waitingSince
  const lines = next.engineSaid
  return measured && prev.engineSaid.length === lines.length && prev.engineSaid.every((line, i) => line === lines[i])
}

/** The waits whose verdict can change with nothing happening but time passing. */
const CLOCKED: ReadonlySet<LogReadWait> = new Set<LogReadWait>([
  'engineStarting',
  'connecting',
  'reading',
  'opening',
  'finishing',
  'stalled',
  'logHung',
  // The meter's last read stops speaking after `COMBAT_READ_FRESH_MS`.
  'notAnswering'
])

/** Can this report's verdict change by the clock alone? Then it is composed again every second. */
export function shouldTick(report: LogReadReport): boolean {
  // Neither ever shows by waiting, and only an event changes either.
  if (report.wait === 'ok' || report.wait === 'noCharacter') return false
  // Any other wait that is not shown yet will be, once it has run long.
  return !report.show || CLOCKED.has(report.wait)
}

export interface LogReadStatusDeps {
  /** Compose the report from what main knows now. */
  readonly build: () => LogReadReport
  /** Send one report to every window. */
  readonly send: (report: LogReadReport) => void
  /** Call `run` after `ms`; the returned function cancels it. Never keeps the process alive. */
  readonly timer: (run: () => void, ms: number) => () => void
  readonly now: () => number
  /** Run `run` once the code that is running now has finished (`queueMicrotask`). */
  readonly defer: (run: () => void) => void
  /** Is something out whose answer will change the status (main's open of the log)? */
  readonly pending?: () => boolean
}

export interface LogReadStatus {
  /** A fact moved. Any number of pokes before the report is next composed are one. */
  poke(): void
  /** The report every window was last sent, or null before the first. */
  last(): LogReadReport | null
  start(): void
  stop(): void
}

export function createLogReadStatus(deps: LogReadStatusDeps): LogReadStatus {
  let sent: LogReadReport | null = null
  let sentAt = 0
  let running = false
  let queued = false
  let cancelTick: (() => void) | null = null
  let cancelNet: (() => void) | null = null

  const publish = (report: LogReadReport): void => {
    sent = report
    sentAt = deps.now()
    deps.send(report)
  }

  /** Send `next` if it is due. Answers how long until held-back numbers are, or null. */
  const sendIfDue = (next: LogReadReport): number | null => {
    if (sent === null || statusChanged(sent, next)) {
      publish(next)
      return null
    }
    if (!next.show || sameNumbers(sent, next)) return null
    const wait = STATUS_NUMBERS_EVERY_MS - (deps.now() - sentAt)
    if (wait > 0) return wait
    publish(next)
    return null
  }

  const flush = (): void => {
    queued = false
    if (!running) return
    cancelTick?.()
    cancelTick = null
    const next = deps.build()
    const held = sendIfDue(next)
    const ticking = shouldTick(next) || deps.pending?.() === true
    if (held === null && !ticking) return
    // The sooner of the two: numbers that were held back, and the clock's next look.
    let ms = STATUS_TICK_MS
    if (held !== null) ms = ticking ? Math.min(held, STATUS_TICK_MS) : held
    cancelTick = deps.timer(() => {
      cancelTick = null
      flush()
    }, ms)
  }

  const net = (): void => {
    cancelNet = deps.timer(() => {
      // Armed again first: a compose that throws must not be the end of the net.
      net()
      flush()
    }, STATUS_NET_MS)
  }

  return {
    poke(): void {
      if (!running || queued) return
      queued = true
      deps.defer(flush)
    },
    last: () => sent,
    start(): void {
      if (running) return
      running = true
      net()
      flush()
    },
    stop(): void {
      running = false
      queued = false
      cancelTick?.()
      cancelNet?.()
      cancelTick = null
      cancelNet = null
    }
  }
}
