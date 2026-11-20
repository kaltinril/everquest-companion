// logReadState.ts - what main remembers about the log read, for the on-screen report (fork #9).
//
// Every failure on the log-loading path used to be a console line only. The files that see one
// note it here, and `main/logReadReport.ts` reads it back when the status is composed. Every note
// ends by calling the one listener (`onLogReadChange`), which is how the status is pushed on a
// change instead of polled. A leaf like engineLaunchState.ts: module-level state, no Electron
// import, so a test can drive it.

import type {
  LogReadError,
  LogReadFacts,
  LogReadReplySize,
  LogReadStep
} from '../../shared/logReadReport'

const SAID_KEPT = 8
const SAID_WITH_ERROR = 4

/** The slice of `LogReadFacts` this file owns, plus the newest large reply that WAS shown. */
export type LogReadNotes = Pick<
  LogReadFacts,
  'health' | 'lastOffset' | 'movedAt' | 'waitingSince' | 'error' | 'lastCombatRead' | 'tooLarge'
> & { readonly large: LogReadReplySize | null }

/** This launch's newest engine stderr lines, already token-redacted and bounded by the supervisor. */
let said: string[] = []
let error: LogReadError | null = null
let health: LogReadFacts['health'] = null
let lastOffset: number | null = null
let movedAt: number | null = null
let waitingSince: number | null = null
/** The log the wait is about. */
let waitingOn: string | null = null
/** The read of that log went live: the next turn or launch starts a new wait. */
let landed = false
let lastCombatRead: LogReadFacts['lastCombatRead'] = null
let tooLarge: LogReadReplySize | null = null
let large: LogReadReplySize | null = null
let changed: (() => void) | null = null

/** The one listener for "something the status is composed from moved" (main/logReadStatus.ts). */
export function onLogReadChange(cb: (() => void) | null): void {
  changed = cb
}

/** A fact the status reads that this file does not hold has moved (the launch state, the link). */
export function noteLogReadTouched(): void {
  changed?.()
}

/** One engine stderr line. */
export function noteEngineSaid(line: string): void {
  said = [...said, line].slice(-SAID_KEPT)
  changed?.()
}

/** A wait that is still running is not restarted: only a new log or a read that landed starts one. */
function startWait(at: number, newLog: boolean): void {
  if (newLog || landed || waitingSince === null) waitingSince = at
  landed = false
}

/** A new engine launch: nothing recorded about the last one holds. Every error is cleared, so no
 *  standing error needs the old launch's lines and the ring starts empty. */
export function noteLogReadConnection(at: number): void {
  error = null
  said = []
  health = null
  lastOffset = null
  movedAt = null
  lastCombatRead = null
  tooLarge = null
  large = null
  startWait(at, false)
  changed?.()
}

/** A new turn (launch, character switch, world rebuild) for `logPath`. A connect error outlives
 *  it: the connection is per launch, not per turn. */
export function noteLogReadTurn(at: number, logPath: string | null): void {
  startWait(at, logPath !== waitingOn)
  waitingOn = logPath
  health = null
  lastOffset = null
  movedAt = null
  // The meter's last read was of the world this turn replaces.
  lastCombatRead = null
  // A reply's size is a fact about one read of the log; the next one asks again (replySizes.ts).
  tooLarge = null
  large = null
  if (error !== null && error.step !== 'connect') error = null
  changed?.()
}

/** `code` is the engine error's code when there was one (`timeout`, `badParams`, ...). */
export function noteLogReadError(step: LogReadStep, detail: string, at: number, code: string | null = null): void {
  error = { step, code, detail, at, said: said.slice(-SAID_WITH_ERROR) }
  changed?.()
}

function opening(status: string): boolean {
  return status === 'starting' || status === 'attaching'
}

/** The engine answered: "not answering" was about the polls before this one (foldWait.ts asks on). */
function clearUnanswered(): void {
  if (error?.step === 'health') error = null
}

/** One `session.health` answer. `live` clears the error: the read it was about has landed. */
export function noteLogReadHealth(status: string, offset: number | undefined, at: number): void {
  const was = health
  const same = was !== null && (was.status === status || (opening(was.status) && opening(status)))
  health = { status, at, since: same ? was.since : at }
  clearUnanswered()
  if (offset !== undefined && (lastOffset === null || offset > lastOffset)) {
    lastOffset = offset
    movedAt = at
  }
  if (status === 'live') {
    error = null
    if (was?.status !== 'live') {
      // The wait for the log is over; what the meter was told while it ran is no longer true.
      waitingSince = at
      landed = true
      lastCombatRead = null
    }
  }
  changed?.()
}

/** One finished combat read: `unserved` is the fallback phrase and `why` its reason word
 *  (readShim.ts `FallbackReason`), both null when it was served. */
export function noteCombatRead(unserved: string | null, why: string | null, at: number): void {
  const since = unserved === null ? null : (lastCombatRead?.since ?? at)
  lastCombatRead = { unserved, why, at, since }
  changed?.()
}

/**
 * One engine reply that was large (fork #9). The newest that could NOT be shown is kept as
 * `tooLarge` (`limit` is the one it was over); the newest that was shown is kept as `large`.
 */
export function noteReplySize(reply: Omit<LogReadReplySize, 'at'>, at: number): void {
  if (reply.limit === null) large = { ...reply, at }
  else tooLarge = { ...reply, at }
  changed?.()
}

export function logReadFacts(): LogReadNotes {
  // A read that ended: the engine's reason travels on stderr, another pipe, and can arrive after
  // the idle answer that recorded the error. So its lines are read now, not then.
  const shown = error?.step === 'fold' ? { ...error, said: said.slice(-SAID_WITH_ERROR) } : error
  return { health, lastOffset, movedAt, waitingSince, error: shown, lastCombatRead, tooLarge, large }
}
