// logReadState.ts - what main remembers about the log read, for the on-screen report (fork #9).
//
// Every failure on the log-loading path used to be a console line only. The files that see one
// note it here, and `main/logReadReport.ts` reads it back when the status is composed. Every note
// ends by calling the one listener (`onLogReadChange`), which is how the status is pushed on a
// change instead of polled. A leaf like engineLaunchState.ts: module-level state, no Electron
// import, so a test can drive it.

import {
  COMBAT_READ_FRESH_MS,
  type LogReadCombatRead,
  type LogReadError,
  type LogReadFacts,
  type LogReadReplySize,
  type LogReadStep
} from '../../shared/logReadReport'
import { NOTHING_RECOGNISED_BYTES } from '../../shared/logReadNotes'

const SAID_KEPT = 8
const SAID_WITH_ERROR = 4
/** How many meter questions are remembered: the Combat tab, Overview and the meter overlays. */
const COMBAT_KEYS_KEPT = 8

/** The slice of `LogReadFacts` this file owns. */
export type LogReadNotes = Pick<
  LogReadFacts,
  | 'health'
  | 'lastOffset'
  | 'movedAt'
  | 'waitingSince'
  | 'error'
  | 'combatReads'
  | 'tooLarge'
  | 'large'
  | 'tooLargeModules'
  | 'nothingRecognised'
>

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
/** The newest outcome of each meter question, newest first. */
let combatReads: LogReadCombatRead[] = []
let tooLarge: LogReadReplySize | null = null
let large: LogReadReplySize | null = null
let tooLargeModules: string[] = []
let nothingRecognised: number | null = null
let changed: (() => void) | null = null
/** When this app's own connection last heard anything from the engine. Null: not in this launch. */
let heardAt: number | null = null

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

/** What is known about one read of the log (reply sizes, what it recognised) is not known of the
 *  next: that one asks again (replySizes.ts). */
function forgetReadNotes(): void {
  tooLarge = null
  large = null
  tooLargeModules = []
  nothingRecognised = null
}

/** A wait that is still running is not restarted: only a new log or a read that landed starts one. */
function startWait(at: number, newLog: boolean): void {
  if (newLog || landed || waitingSince === null) waitingSince = at
  landed = false
}

/** A new engine launch: nothing recorded about the last one holds. Every error is cleared, so no
 *  standing error needs the old launch's lines and the ring starts empty. */
export function noteLogReadConnection(at: number): void {
  heardAt = null
  error = null
  said = []
  health = null
  lastOffset = null
  movedAt = null
  combatReads = []
  forgetReadNotes()
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
  // The meter's reads were of the world this turn replaces.
  combatReads = []
  forgetReadNotes()
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
  heardAt = at
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
      combatReads = []
    }
  }
  changed?.()
}

/** One finished read as the read path reports it (readShim.ts `ObservedRead`): `unserved` is the
 *  fallback phrase and `why` its reason word, both absent when it was served; `code` is the
 *  engine error's code when it refused with one. */
export interface CombatReadSeen {
  readonly key: string
  readonly unserved?: string
  readonly why?: string
  readonly code?: string
}

/**
 * One finished combat read, kept as the newest outcome of ITS question (`key`). A question nobody
 * has asked for `COMBAT_READ_FRESH_MS` is dropped, and the newest `COMBAT_KEYS_KEPT` are kept.
 */
export function noteCombatRead(read: CombatReadSeen, at: number): void {
  const unserved = read.unserved ?? null
  const fresh = combatReads.filter((kept) => at - kept.at <= COMBAT_READ_FRESH_MS)
  // A run of unserved reads of one question is timed from its first.
  const before = fresh.find((kept) => kept.key === read.key)
  const since = unserved === null ? null : (before?.since ?? at)
  const next = { key: read.key, unserved, why: read.why ?? null, code: read.code ?? null, at, since }
  combatReads = [next, ...fresh.filter((kept) => kept.key !== read.key)].slice(0, COMBAT_KEYS_KEPT)
  changed?.()
}

/**
 * One engine reply that was large (fork #9). The newest that could NOT be shown is kept as
 * `tooLarge` (`limit` is the one it was over); the newest that was shown is kept as `large`.
 */
export function noteReplySize(reply: Omit<LogReadReplySize, 'at'>, at: number): void {
  if (reply.limit === null) large = { ...reply, at }
  else tooLarge = { ...reply, at }
  // Every module that could not be shown, not only the newest: each one's tab says so.
  const unshown = reply.limit === null ? null : reply.module
  if (unshown !== null && !tooLargeModules.includes(unshown)) tooLargeModules = [...tooLargeModules, unshown]
  changed?.()
}

/**
 * The read went live (the go-live edge): what the engine said it had made of the log. More than
 * `NOTHING_RECOGNISED_BYTES` read with no event at all is a log the engine could not read as an
 * EverQuest log (another encoding, another program's file). Unknown is not zero: nothing is noted.
 */
export function noteLogReadLanded(events: number | undefined, offset: number | undefined): void {
  const none = events === 0 && offset !== undefined && offset > NOTHING_RECOGNISED_BYTES
  nothingRecognised = none ? offset : null
  changed?.()
}

/**
 * PROOF OF LIFE for the supervisor's watchdog (`supervisorHealth.ts`): a frame or an answer arrived
 * on the app's own connection. No `changed` call: nothing a window draws depends on it, and it is
 * stamped on every progress frame.
 */
export function noteEngineHeard(at: number): void {
  heardAt = at
}

export function engineHeardAt(): number | null {
  return heardAt
}

/** The engine's last health answer on the app's own connection said it had caught up. */
export function engineSaidLive(): boolean {
  return health?.status === 'live'
}

export function logReadFacts(): LogReadNotes {
  // A read that ended: the engine's reason travels on stderr, another pipe, and can arrive after
  // the idle answer that recorded the error. So its lines are read now, not then.
  const shown = error?.step === 'fold' ? { ...error, said: said.slice(-SAID_WITH_ERROR) } : error
  const sizes = { tooLarge, large, tooLargeModules, nothingRecognised }
  return { health, lastOffset, movedAt, waitingSince, error: shown, combatReads, ...sizes }
}
