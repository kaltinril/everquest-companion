// logReadReport.ts - what the "Reading log..." panels say when the wait runs long (fork #9).
//
// Main gathers `LogReadFacts` (main/logReadReport.ts), `composeLogReadReport` turns them into the
// one object that crosses IPC, and `logReadLines` turns that into the rows the box draws. Pure: no
// clock, no DOM. The full log path and the home directory stop here; only the base name goes on.

import { humanBytes, humanDuration } from './engineLaunch'

/** Where on the log-loading path an error was recorded. */
export type LogReadStep = 'connect' | 'attach' | 'health' | 'fold'

/** What the app is waiting on, most specific cause first (see `composeLogReadReport`). */
export type LogReadWait =
  | 'noCharacter'
  | 'engineMissing'
  | 'engineFailing'
  | 'engineStarting'
  | 'notConnected'
  | 'attachRefused'
  | 'logMissing'
  | 'logUnreadable'
  | 'readerStopped'
  | 'stalled'
  | 'notAnswering'
  | 'reading'
  | 'ok'

/** A wait this long shows the box even when nothing has failed. */
export const LOG_READ_SLOW_MS = 15_000
/** A read whose offset has not grown for this long is called stalled. */
export const LOG_READ_STALL_MS = 60_000

export interface LogReadError {
  readonly step: LogReadStep
  readonly detail: string
  readonly at: number
  /** The engine's last stderr lines at the moment the error was recorded. */
  readonly said: readonly string[]
}

/** Main's connection to the engine, as the keeper that reopens it sees it (main/dataServer/linkKeeper.ts). */
export interface LogReadLink {
  /** Retries made in a row; 0 on the first connect of a launch and after a connection held. */
  readonly tries: number
  /** The most retries in a row before it gives up. */
  readonly of: number
  /** When the next retry is due, or null when none is waiting. */
  readonly nextAt: number | null
  /** No more retries will be made until a person asks. */
  readonly gaveUp: boolean
  /** Why the last connect failed or the last connection was lost. */
  readonly lastReason: string | null
  readonly everConnected: boolean
}

/** Everything main knows about the read. Every unknown is null, never 0. */
export interface LogReadFacts {
  readonly now: number
  readonly appVersion: string
  readonly logPath: string | null
  readonly home: string
  /** The supervisor's status word (`ready`, `starting`, `backoff`, `absent`, ...). */
  readonly supervisor: string | null
  readonly fault: { readonly kind: string; readonly attempts: number; readonly detail: string | null } | null
  /** The client's connection state, or null when there is no client. */
  readonly connection: string | null
  /** `ok`, or the read path's reason for not serving. */
  readonly readiness: string
  readonly health: { readonly status: string; readonly at: number } | null
  readonly fold: {
    readonly offset: number
    readonly logSize: number
    readonly events: number
    readonly pct: number
  } | null
  /** The log's size as the engine last stated it, when no fold measurement is held. */
  readonly logSize: number | null
  /** When the read's offset last grew. */
  readonly movedAt: number | null
  readonly waitingSince: number | null
  readonly error: LogReadError | null
  /** Main's own look at the file, taken only on the failure path. */
  readonly probe: { readonly bytes: number | null; readonly problem: 'missing' | 'unreadable' | null } | null
  readonly lastCombatRead: { readonly unserved: string | null; readonly at: number } | null
}

/** What crosses IPC. No full path, no home directory. */
export interface LogReadReport {
  readonly wait: LogReadWait
  /** Draw the box now, without waiting out `LOG_READ_SLOW_MS`. */
  readonly show: boolean
  readonly appVersion: string
  /** The log's base name. */
  readonly logFile: string | null
  readonly logBytes: number | null
  readonly offset: number | null
  readonly pct: number | null
  readonly events: number | null
  /** `running, connected, reading` */
  readonly engine: string
  readonly lastError: string | null
  readonly engineSaid: readonly string[]
  readonly waitedMs: number | null
}

/** The sentence beside "Waiting on". */
export const LOG_READ_WORDS: Readonly<Record<LogReadWait, string>> = {
  noCharacter: 'No character log is selected.',
  engineMissing: 'The data engine program is missing.',
  engineFailing: 'The data engine keeps failing to start.',
  engineStarting: 'Starting the data engine.',
  notConnected: 'The app cannot connect to its data engine.',
  attachRefused: 'The data engine refused the log file.',
  logMissing: 'The log file is missing.',
  logUnreadable: 'Windows will not let the app read the log file.',
  readerStopped: 'The data engine stopped before the end of your log.',
  stalled: 'The data engine has stopped making progress.',
  notAnswering: 'The data engine is not answering.',
  reading: 'Still reading your log.',
  ok: 'The data engine is answering; this panel has no reply yet.'
}

/** The waits that show the box at the first check: something has failed, not merely run long. */
const SHOW_AT_ONCE: ReadonlySet<LogReadWait> = new Set<LogReadWait>([
  'engineMissing',
  'engineFailing',
  'attachRefused',
  'logMissing',
  'logUnreadable',
  'readerStopped',
  'stalled'
])

const SUPERVISOR_WORDS = new Map<string, string>([
  ['ready', 'running'],
  ['starting', 'starting'],
  ['backoff', 'restarting'],
  ['absent', 'missing'],
  ['stopped', 'stopped'],
  ['stopping', 'stopping']
])

const CONNECTION_WORDS = new Map<string, string>([
  ['ready', 'connected'],
  ['connecting', 'connecting'],
  ['closed', 'connection closed'],
  ['failed', 'connection failed']
])

const HEALTH_WORDS = new Map<string, string>([
  ['starting', 'opening the log'],
  ['attaching', 'opening the log'],
  ['folding', 'reading'],
  ['live', 'caught up'],
  ['idle', 'not reading']
])

const STEP_WORDS: Readonly<Record<LogReadStep, string>> = {
  connect: 'connect',
  attach: 'open log',
  health: 'status check',
  fold: 'read'
}

// ── scrubbing ──────────────────────────────────────────────────────────────────────────────────

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** `path` as a pattern that matches either slash spelling, in any letter case. */
function pathPattern(path: string): RegExp {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]+/)
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]]/g, '\\$&'))
  return new RegExp(escaped.join('[\\\\/]+'), 'gi')
}

/**
 * Text from outside (an error, an engine stderr line) with the player's paths taken out: the log
 * path becomes its base name, the home directory and any other user folder become `~`.
 */
export function scrubPaths(text: string, logPath: string | null, home: string): string {
  let out = text
  if (logPath !== null && logPath.length > 3) out = out.replace(pathPattern(logPath), baseName(logPath))
  if (home.length > 3) out = out.replace(pathPattern(home), '~')
  out = out.replace(/(?:[A-Za-z]:)?[\\/]+Users[\\/]+[^\\/\s"']+/gi, '~')
  // The copy rule (no em or en dash on screen) holds for quoted text too.
  return out.replace(/\s*[\u2013\u2014]\s*/g, ' - ')
}

// ── the decision ───────────────────────────────────────────────────────────────────────────────

/** The waits that are about the engine process and its connection, or null when both are up. */
function engineWait(f: LogReadFacts): LogReadWait | null {
  if (f.logPath === null) return 'noCharacter'
  if (f.supervisor === 'absent' || f.fault?.kind === 'no-binary') return 'engineMissing'
  if (f.fault !== null) return 'engineFailing'
  if (f.supervisor !== 'ready') return 'engineStarting'
  if (f.connection !== 'ready') return 'notConnected'
  return null
}

function endedWait(f: LogReadFacts): LogReadWait {
  if (f.probe?.problem === 'missing') return 'logMissing'
  if (f.probe?.problem === 'unreadable') return 'logUnreadable'
  return 'readerStopped'
}

function stalled(f: LogReadFacts): boolean {
  if (f.health?.status !== 'folding' || f.movedAt === null) return false
  return f.now - f.movedAt >= LOG_READ_STALL_MS
}

/** The waits that are about the read itself, with the engine up and connected. */
function readWait(f: LogReadFacts): LogReadWait {
  const step = f.error?.step
  if (step === 'attach') return 'attachRefused'
  if (step === 'fold' || f.health?.status === 'idle') return endedWait(f)
  if (step === 'health') return 'notAnswering'
  if (stalled(f)) return 'stalled'
  if (f.readiness !== 'ok') return 'reading'
  return typeof f.lastCombatRead?.unserved === 'string' ? 'notAnswering' : 'ok'
}

function engineWords(f: LogReadFacts): string {
  const parts = [SUPERVISOR_WORDS.get(f.supervisor ?? '')]
  if (f.supervisor === 'ready') parts.push(CONNECTION_WORDS.get(f.connection ?? '') ?? 'not connected')
  parts.push(HEALTH_WORDS.get(f.health?.status ?? ''))
  return parts.filter((word) => word !== undefined).join(', ')
}

function lastErrorText(f: LogReadFacts, wait: LogReadWait): string | null {
  if (f.error !== null) return `${STEP_WORDS[f.error.step]}: ${scrubPaths(f.error.detail, f.logPath, f.home)}`
  if (typeof f.fault?.detail === 'string') return scrubPaths(f.fault.detail, f.logPath, f.home)
  if (wait === 'notAnswering') return f.lastCombatRead?.unserved ?? null
  return null
}

function shows(wait: LogReadWait, waitedMs: number | null): boolean {
  if (SHOW_AT_ONCE.has(wait)) return true
  if (wait === 'ok' || wait === 'noCharacter' || waitedMs === null) return false
  return waitedMs >= LOG_READ_SLOW_MS
}

/** How big the log is and how far the read got, as far as anything has measured. */
function measured(f: LogReadFacts): Pick<LogReadReport, 'logBytes' | 'offset' | 'pct' | 'events'> {
  if (f.fold === null) {
    return { logBytes: f.logSize ?? f.probe?.bytes ?? null, offset: null, pct: null, events: null }
  }
  return { logBytes: f.fold.logSize, offset: f.fold.offset, pct: f.fold.pct, events: f.fold.events }
}

/** The facts, decided and scrubbed: the one object the renderer is handed. */
export function composeLogReadReport(f: LogReadFacts): LogReadReport {
  const wait = engineWait(f) ?? readWait(f)
  const waitedMs = f.waitingSince === null ? null : Math.max(0, f.now - f.waitingSince)
  return {
    wait,
    show: shows(wait, waitedMs),
    appVersion: f.appVersion,
    logFile: f.logPath === null ? null : baseName(f.logPath),
    ...measured(f),
    engine: engineWords(f),
    lastError: lastErrorText(f, wait),
    engineSaid: (f.error?.said ?? []).map((line) => scrubPaths(line, f.logPath, f.home)),
    waitedMs
  }
}

// ── the rows ───────────────────────────────────────────────────────────────────────────────────

export interface LogReadLine {
  readonly label: string
  readonly value: string
}

function logLine(r: LogReadReport): string | null {
  if (r.logFile === null) return null
  return r.logBytes === null ? r.logFile : `${r.logFile}, ${humanBytes(r.logBytes)}`
}

function readSoFar(r: LogReadReport): string | null {
  if (r.offset === null) return null
  const pct = r.pct === null ? '' : ` (${String(Math.floor(r.pct))}%)`
  const events = r.events === null ? '' : `, ${r.events.toLocaleString('en-US')} events`
  return `${humanBytes(r.offset)}${pct}${events}`
}

/** The box's rows, in order. A row whose value is unknown is left out, never printed as 0. */
export function logReadLines(r: LogReadReport): LogReadLine[] {
  const rows: [string, string | null][] = [
    ['Waiting on', LOG_READ_WORDS[r.wait]],
    ['Log', logLine(r)],
    ['Read so far', readSoFar(r)],
    ['Engine', r.engine === '' ? null : r.engine],
    ['Last error', r.lastError ?? 'none'],
    ['Waiting', r.waitedMs === null ? null : humanDuration(r.waitedMs)],
    ['Version', r.appVersion]
  ]
  const lines: LogReadLine[] = []
  for (const [label, value] of rows) {
    if (value !== null) lines.push({ label, value })
  }
  return lines
}
