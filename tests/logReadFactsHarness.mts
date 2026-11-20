// A literal `LogReadFacts` for the log-read status tests (fork #9): a healthy read two seconds in,
// with whatever a case changes laid over it.

import type { LogReadFacts, LogReadReport } from '../src/shared/logReadReport'
import { composeLogReadReport } from '../src/shared/logReadReport'

export const NOW = 1_800_000_000_000
export const LOG = 'C:\\Users\\Jeremy\\EverQuest\\Logs\\eqlog_Primitive_freeport.txt'
export const HOME = 'C:\\Users\\Jeremy'
export const KB = 1024
export const MB = 1024 * 1024

/** Engine up, connected, folding, offset moving. */
export function facts(over: Partial<LogReadFacts> = {}): LogReadFacts {
  return {
    now: NOW,
    appVersion: '1.0.0-test.52',
    logPath: LOG,
    home: HOME,
    supervisor: 'ready',
    fault: null,
    connection: 'ready',
    readiness: 'notLive',
    health: { status: 'folding', at: NOW - 400, since: NOW - 2_000 },
    fold: { offset: 148.8 * MB, logSize: 412.3 * MB, events: 1_571_003, pct: 36.09 },
    logSize: null,
    lastOffset: 148.8 * MB,
    movedAt: NOW - 400,
    waitingSince: NOW - 2_000,
    error: null,
    probe: null,
    combatReads: [],
    link: null,
    tooLarge: null,
    large: null,
    tooLargeModules: [],
    nothingRecognised: null,
    archiveOn: false,
    ...over
  }
}

export function report(over: Partial<LogReadFacts> = {}): LogReadReport {
  return composeLogReadReport(facts(over))
}

/** A health answer whose status has been heard for `forMs`. */
export function health(status: string, forMs = 0): NonNullable<LogReadFacts['health']> {
  return { status, at: NOW, since: NOW - forMs }
}

export function error(
  step: NonNullable<LogReadFacts['error']>['step'],
  code: string | null = null
): NonNullable<LogReadFacts['error']> {
  return { step, code, detail: code === null ? 'refused' : `${code}: refused`, at: NOW, said: [] }
}
