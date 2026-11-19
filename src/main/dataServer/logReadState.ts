// logReadState.ts - what main remembers about the log read, for the on-screen report (fork #9).
//
// Every failure on the log-loading path used to be a console line only. The files that see one
// note it here, and `main/logReadReport.ts` reads it back when a "Reading log..." panel asks.
// A leaf like engineLaunchState.ts: module-level state, no Electron import, so a test can drive it.

import type { LogReadError, LogReadFacts, LogReadStep } from '../../shared/logReadReport'

const SAID_KEPT = 8
const SAID_WITH_ERROR = 4

/** The slice of `LogReadFacts` this file owns. */
export type LogReadNotes = Pick<
  LogReadFacts,
  'health' | 'movedAt' | 'waitingSince' | 'error' | 'lastCombatRead'
>

/** The engine's newest stderr lines, already token-redacted and bounded by the supervisor. */
let said: string[] = []
let error: LogReadError | null = null
let health: LogReadFacts['health'] = null
let lastOffset: number | null = null
let movedAt: number | null = null
let waitingSince: number | null = null
let lastCombatRead: LogReadFacts['lastCombatRead'] = null

/** One engine stderr line. */
export function noteEngineSaid(line: string): void {
  said = [...said, line].slice(-SAID_KEPT)
}

/** A new engine launch: nothing recorded about the last one holds, except what it said. */
export function noteLogReadConnection(at: number): void {
  error = null
  health = null
  lastOffset = null
  movedAt = null
  lastCombatRead = null
  waitingSince = at
}

/** A new turn (launch, character switch, world rebuild). A connect error outlives it: the
 *  connection is per launch, not per turn. */
export function noteLogReadTurn(at: number): void {
  waitingSince = at
  health = null
  lastOffset = null
  movedAt = null
  if (error !== null && error.step !== 'connect') error = null
}

export function noteLogReadError(step: LogReadStep, detail: string, at: number): void {
  error = { step, detail, at, said: said.slice(-SAID_WITH_ERROR) }
}

/** One `session.health` answer. `live` clears the error: the read it was about has landed. */
export function noteLogReadHealth(status: string, offset: number | undefined, at: number): void {
  health = { status, at }
  if (offset !== undefined && (lastOffset === null || offset > lastOffset)) {
    lastOffset = offset
    movedAt = at
  }
  if (status === 'live') error = null
}

/** One finished combat read: `unserved` is the fallback phrase, or null when it was served. */
export function noteCombatRead(unserved: string | null, at: number): void {
  lastCombatRead = { unserved, at }
}

export function logReadFacts(): LogReadNotes {
  return { health, movedAt, waitingSince, error, lastCombatRead }
}
