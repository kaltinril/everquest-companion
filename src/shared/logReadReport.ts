// logReadReport.ts - the one status of the log read: what the app is waiting on (fork #9).
//
// Main gathers `LogReadFacts` (main/logReadReport.ts), `composeLogReadReport` turns them into the
// one object that is pushed to every window, and `logReadLines` turns that into the rows the box
// draws. The words are `logReadWords.ts`. Pure: no clock, no DOM. The full log path and the home
// directory stop here; only the base name goes on.

import { humanBytes, humanDuration } from './engineLaunch'
import { LOG_READ_ACTION, LOG_READ_TRY, LOG_READ_WORDS, type LogReadAction } from './logReadWords'

/** Where on the log-loading path an error was recorded. */
export type LogReadStep = 'connect' | 'attach' | 'health' | 'fold'

/** What the app is waiting on, most specific cause first (see `composeLogReadReport`). */
export type LogReadWait =
  | 'noCharacter'
  | 'engineMissing'
  | 'engineFailing'
  | 'engineStarting'
  | 'connecting'
  | 'notConnected'
  | 'attachRefused'
  | 'logMissing'
  | 'logUnreadable'
  | 'logHung'
  | 'readerStopped'
  | 'stalled'
  | 'finishing'
  | 'opening'
  | 'mismatch'
  | 'notAnswering'
  | 'reading'
  | 'replyTooLarge'
  | 'ok'

/** A wait this long shows the status even when nothing has failed. */
export const LOG_READ_SLOW_MS = 15_000
/** A read whose offset has not grown for this long is called stalled, or finishing. */
export const LOG_READ_STALL_MS = 60_000
/** A still read this close to the end of the log is finishing, not stalled... */
export const LOG_READ_NEAR_END_BYTES = 64 * 1024
/** ...for this long. After that it is stalled like any other. */
export const LOG_READ_FINISH_MS = 5 * 60_000
/** The engine saying it is opening the log for this long is named. */
export const LOG_READ_OPENING_MS = 60_000
/** Main's own open of the log out for this long means the drive is not answering. */
export const LOG_READ_HUNG_MS = 15_000
/**
 * The meter's last read speaks for this long. After that nobody is asking. Three of an idle
 * meter's polls (renderer combatPoll.ts IDLE_POLL_MS, 10 s): at one poll's length the verdict
 * would lapse between two reads and the band would blink.
 */
export const COMBAT_READ_FRESH_MS = 30_000

export interface LogReadError {
  readonly step: LogReadStep
  /** The engine error's code (`timeout`, `badParams`, ...), or null when there was none. */
  readonly code: string | null
  readonly detail: string
  readonly at: number
  /** The engine's newest stderr lines: as of now for a `fold` error, as recorded for the others. */
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

/** One engine reply that was large (main/dataServer/replySizes.ts states the two limits). */
export interface LogReadReplySize {
  readonly op: string
  /** The module asked for, when the op is `module.snapshot`. */
  readonly module: string | null
  /** How long the reply was, in characters. */
  readonly chars: number
  /** Over what main itself may read, so it was dropped. */
  readonly refused: boolean
  /** The limit it was over, in characters; null when it was under both and was shown. */
  readonly limit: number | null
  readonly at: number
}

/** Main's own look at the log file (main/logProbe.ts). */
export interface LogReadProbe {
  readonly bytes: number | null
  readonly problem: 'missing' | 'unreadable' | null
  /** How long the one open in flight has been out, or null when none is. */
  readonly pendingMs: number | null
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
  /** The last `session.health` answer of this turn. `since` is when its status was first heard in
   *  a row (`starting` and `attaching` count as one). */
  readonly health: { readonly status: string; readonly at: number; readonly since: number } | null
  readonly fold: {
    readonly offset: number
    readonly logSize: number
    readonly events: number
    readonly pct: number
  } | null
  /** The log's size as the engine last stated it, when no fold measurement is held. */
  readonly logSize: number | null
  /** How far the engine last said the read had got in this turn. It outlives a read that ended. */
  readonly lastOffset: number | null
  /** When the read's offset last grew. */
  readonly movedAt: number | null
  /** When the wait for this log began. A new launch or a rebuild of the same log does not restart
   *  it; another log, or the read going live, does. */
  readonly waitingSince: number | null
  readonly error: LogReadError | null
  /** Main's own look at the file, or null when it has not looked. */
  readonly probe: LogReadProbe | null
  /** The meter's last read since the log went live: `unserved` is the phrase and `why` the read
   *  path's reason word (main/dataServer/readShim.ts `FallbackReason`), both null when it was
   *  served. `since` is when its reads began going unserved in a row, null when it was served. */
  readonly lastCombatRead: {
    readonly unserved: string | null
    readonly why: string | null
    readonly at: number
    readonly since: number | null
  } | null
  /** The keeper of main's connection, or null when there is no client. */
  readonly link: LogReadLink | null
  /** The newest reply of this read that could not be shown, or null. */
  readonly tooLarge: LogReadReplySize | null
}

/** One more thing to tell the player while the read itself is fine. Nothing composes one yet. */
export interface LogReadNote {
  readonly id: string
  readonly text: string
  readonly tryLine?: string
  /** A button's label, when the note has one. */
  readonly button?: string
}

/** What crosses IPC. No full path, no home directory. */
export interface LogReadReport {
  readonly wait: LogReadWait
  /** Draw the status now, without waiting out `LOG_READ_SLOW_MS`. */
  readonly show: boolean
  /** What the player can try (`LOG_READ_TRY`), or null. */
  readonly tryLine: string | null
  /** What the Try again button does, or null when there is no button for this wait. */
  readonly action: LogReadAction | null
  readonly notes: readonly LogReadNote[]
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
  /** When this wait began (epoch ms), or null when nothing says. The window counts from it with
   *  its own clock, so the number moves without a push. */
  readonly waitingSince: number | null
}

/** The waits that show at the first check: something has failed, not merely run long. */
const SHOW_AT_ONCE: ReadonlySet<LogReadWait> = new Set<LogReadWait>([
  'engineMissing',
  'engineFailing',
  'notConnected',
  'replyTooLarge',
  'attachRefused',
  'logMissing',
  'logUnreadable',
  'logHung',
  'readerStopped',
  'stalled',
  'mismatch'
])

/** The waits of a read that ended: their row says where it stopped. */
const ENDED: ReadonlySet<LogReadWait> = new Set<LogReadWait>(['logMissing', 'logUnreadable', 'readerStopped'])

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
  // Not the machine's shared folders: `~\Daybreak Game Company` would read as the player's home.
  out = out.replace(
    /(?:[A-Za-z]:)?[\\/]+Users[\\/]+(?!(?:Public|Default|All Users)(?:[\\/\s"']|$))[^\\/\s"']+/gi,
    '~'
  )
  // The copy rule (no em or en dash on screen) holds for quoted text too.
  return out.replace(/\s*[\u2013\u2014]\s*/g, ' - ')
}

/** A launch fault with its detail scrubbed: a spawn failure's detail starts with the program path. */
export function scrubFault<T extends { readonly detail: string | null }>(
  fault: T | null,
  logPath: string | null,
  home: string
): T | null {
  const detail = fault?.detail ?? null
  if (fault === null || detail === null) return fault
  return { ...fault, detail: scrubPaths(detail, logPath, home) }
}

/** How much of one engine stderr line the box prints. */
const SAID_SHOWN_CHARS = 200

/** One engine stderr line for the screen: scrubbed FIRST, because a path cut short no longer matches. */
function saidLine(line: string, f: LogReadFacts): string {
  const safe = scrubPaths(line, f.logPath, f.home)
  return safe.length <= SAID_SHOWN_CHARS ? safe : `${safe.slice(0, SAID_SHOWN_CHARS)}…`
}

// ── the decision ───────────────────────────────────────────────────────────────────────────────

/** A wait, and the instant it is timed from (the slow clock, and the Waiting row). */
interface Verdict {
  readonly wait: LogReadWait
  readonly since: number | null
}

/**
 * The waits that are about the engine process and its connection, or null when both are up.
 * A missing or failing engine comes before "no character": with no engine, picking a character
 * changes nothing, and the box used to say only that none was picked.
 */
function engineWait(f: LogReadFacts): LogReadWait | null {
  if (f.supervisor === 'absent' || f.fault?.kind === 'no-binary') return 'engineMissing'
  if (f.fault !== null) return 'engineFailing'
  if (f.logPath === null) return 'noCharacter'
  if (f.supervisor !== 'ready') return 'engineStarting'
  // The connection is reopened by itself (linkKeeper.ts) until its keeper gives up.
  if (f.connection !== 'ready') return f.link?.gaveUp === true ? 'notConnected' : 'connecting'
  return null
}

/**
 * Main's own open of the log has been out long enough to say the drive is not answering. Not
 * while the engine is plainly getting bytes off it, or has finished: an open that never comes back
 * must not outvote a read that is working.
 */
function hung(f: LogReadFacts): boolean {
  if ((f.probe?.pendingMs ?? 0) < LOG_READ_HUNG_MS) return false
  const status = f.health?.status
  const moving = status === 'folding' && f.movedAt !== null && f.now - f.movedAt < LOG_READ_STALL_MS
  return !moving && status !== 'live'
}

function endedWait(f: LogReadFacts): LogReadWait {
  // The likeliest reason the read ended, and the more useful thing to say.
  if (hung(f)) return 'logHung'
  if (f.probe?.problem === 'missing') return 'logMissing'
  if (f.probe?.problem === 'unreadable') return 'logUnreadable'
  return 'readerStopped'
}

/** The wait of a read that failed outright, or null when nothing has. */
function failedWait(f: LogReadFacts): LogReadWait | null {
  const error = f.error
  // An attach nobody answered was not refused: the engine said nothing at all.
  if (error?.step === 'attach') return error.code === 'timeout' ? 'notAnswering' : 'attachRefused'
  if (error?.step === 'fold' || f.health?.status === 'idle') return endedWait(f)
  if (error?.step === 'health') return 'notAnswering'
  return hung(f) ? 'logHung' : null
}

/** Is the read within a few lines of the end of the log, as far as anything has stated? */
function nearEnd(f: LogReadFacts): boolean {
  const size = f.fold?.logSize ?? f.logSize
  if (size === null) return false
  const offset = Math.max(f.fold?.offset ?? 0, f.lastOffset ?? 0)
  return size - offset <= LOG_READ_NEAR_END_BYTES
}

/** A read that is running and has stopped moving, or is slow to begin; null when it is neither. */
function slowWait(f: LogReadFacts): LogReadWait | null {
  const health = f.health
  if (health === null) return null
  if (health.status === 'folding' && f.movedAt !== null) {
    const still = f.now - f.movedAt
    if (still < LOG_READ_STALL_MS) return null
    // The engine builds its last panels after the last byte; that is not a stall for a while.
    return still < LOG_READ_FINISH_MS && nearEnd(f) ? 'finishing' : 'stalled'
  }
  const opening = health.status === 'starting' || health.status === 'attaching'
  return opening && f.now - health.since >= LOG_READ_OPENING_MS ? 'opening' : null
}

/** The waits that are about the read itself, or null once the log is read and being served. */
function logWait(f: LogReadFacts): LogReadWait | null {
  const named = failedWait(f) ?? slowWait(f)
  if (named !== null) return named
  // The engine says it is caught up on a log the app is not reading its answers for.
  if (f.readiness === 'notAttached' && f.health?.status === 'live') return 'mismatch'
  return f.readiness === 'ok' ? null : 'reading'
}

/**
 * The log is read; what is left is the meter's own read. Timed from when its reads began going
 * unserved, not from the log's wait: one slow read hours after going live is not a long wait.
 */
function combatVerdict(f: LogReadFacts): Verdict {
  const read = f.lastCombatRead
  const served = typeof read?.unserved !== 'string'
  if (read === null || served || f.now - read.at > COMBAT_READ_FRESH_MS) {
    return { wait: 'ok', since: f.waitingSince }
  }
  // The meter's OWN read went unserved because its reply was too large, in this read of the log:
  // that is the cause to name. Never decided from `tooLarge.op`: the archive asks combat.snapshot
  // for every fight, and that reply being too large to show says nothing about the meter's.
  const tooLarge = read.why === 'tooLarge' && f.tooLarge !== null
  return { wait: tooLarge ? 'replyTooLarge' : 'notAnswering', since: read.since }
}

function decide(f: LogReadFacts): Verdict {
  const wait = engineWait(f) ?? logWait(f)
  if (wait === null) return combatVerdict(f)
  // An engine the app itself stopped is the app closing: not a wait to put on a closing window.
  const closing = f.supervisor === 'stopping' || f.supervisor === 'stopped'
  return { wait, since: closing && wait === 'engineStarting' ? null : f.waitingSince }
}

/** `connected`, or how the reconnect is going: `connecting (try 2 of 5)`. */
function connectionWords(f: LogReadFacts): string {
  const link = f.link
  if (f.connection === 'ready' || link === null || link.gaveUp) {
    return CONNECTION_WORDS.get(f.connection ?? '') ?? 'not connected'
  }
  return link.tries > 0 ? `connecting (try ${String(link.tries)} of ${String(link.of)})` : 'connecting'
}

function engineWords(f: LogReadFacts): string {
  const parts = [SUPERVISOR_WORDS.get(f.supervisor ?? '')]
  if (f.supervisor === 'ready') parts.push(connectionWords(f))
  parts.push(HEALTH_WORDS.get(f.health?.status ?? ''))
  return parts.filter((word) => word !== undefined).join(', ')
}

/** Why the connection is not up, with how the retries stand: `connect: <reason> (try 2 of 5)`. */
function linkErrorText(f: LogReadFacts): string | null {
  const link = f.link
  const reason = link?.lastReason ?? null
  if (link === null || reason === null) return null
  let count = link.tries > 0 ? ` (try ${String(link.tries)} of ${String(link.of)})` : ''
  if (link.gaveUp) count = link.tries >= link.of ? ` (gave up after ${String(link.tries)} tries)` : ' (gave up)'
  return `${STEP_WORDS.connect}: ${scrubPaths(reason, f.logPath, f.home)}${count}`
}

/** `read: the reply was 71.2 MB, over the 64.0 MB limit` */
function tooLargeText(reply: LogReadReplySize): string {
  const size = `${STEP_WORDS.fold}: the reply was ${humanBytes(reply.chars)}`
  if (reply.limit === null) return size
  const limit = humanBytes(reply.limit)
  return reply.refused ? `${size}, over the ${limit} limit` : `${size}, over the ${limit} the app can show`
}

function lastErrorText(f: LogReadFacts, wait: LogReadWait): string | null {
  const text = wait === 'connecting' || wait === 'notConnected' ? linkErrorText(f) : null
  if (text !== null) return text
  // With the connection up, a connect error is about one that has since been made.
  if (f.error !== null && !(f.connection === 'ready' && f.error.step === 'connect')) {
    return `${STEP_WORDS[f.error.step]}: ${scrubPaths(f.error.detail, f.logPath, f.home)}`
  }
  if (typeof f.fault?.detail === 'string') return scrubPaths(f.fault.detail, f.logPath, f.home)
  if (f.tooLarge !== null) return tooLargeText(f.tooLarge)
  if (wait === 'notAnswering') return f.lastCombatRead?.unserved ?? null
  return null
}

function shows(verdict: Verdict, now: number): boolean {
  const { wait, since } = verdict
  if (SHOW_AT_ONCE.has(wait)) return true
  if (wait === 'ok' || wait === 'noCharacter' || since === null) return false
  return now - since >= LOG_READ_SLOW_MS
}

/** How big the log is and how far the read got, as far as anything has measured. */
function measured(f: LogReadFacts): Pick<LogReadReport, 'logBytes' | 'offset' | 'pct' | 'events'> {
  if (f.fold !== null) {
    return { logBytes: f.fold.logSize, offset: f.fold.offset, pct: f.fold.pct, events: f.fold.events }
  }
  const logBytes = f.logSize ?? f.probe?.bytes ?? null
  // A read that has landed has nothing left to report: the log grows on, the mark is not asked again.
  const offset = f.health?.status === 'live' ? null : f.lastOffset
  const known = offset !== null && logBytes !== null && logBytes > 0
  return { logBytes, offset, pct: known ? Math.min(100, (offset / logBytes) * 100) : null, events: null }
}

/** The facts, decided and scrubbed: the one object every window is handed. */
export function composeLogReadReport(f: LogReadFacts): LogReadReport {
  const verdict = decide(f)
  const { wait } = verdict
  return {
    wait,
    show: shows(verdict, f.now),
    tryLine: LOG_READ_TRY[wait],
    action: LOG_READ_ACTION[wait],
    notes: [],
    appVersion: f.appVersion,
    logFile: f.logPath === null ? null : baseName(f.logPath),
    ...measured(f),
    engine: engineWords(f),
    lastError: lastErrorText(f, wait),
    engineSaid: (f.error?.said ?? []).map((line) => saidLine(line, f)),
    waitingSince: verdict.since
  }
}

/**
 * Does a "Reading log..." panel that has itself been up for `mountedMs` draw the box? When main
 * says to show the status, and in any case once the panel has waited out the slow clock: a panel
 * with no reply while main says `ok` or `noCharacter` still owes the player the rows.
 */
export function boxShows(report: LogReadReport, mountedMs: number): boolean {
  return report.show || mountedMs >= LOG_READ_SLOW_MS
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

function positionLabel(r: LogReadReport): string {
  return ENDED.has(r.wait) ? 'Stopped at' : 'Read so far'
}

/** The waits whose Try line speaks of where the read is. Both stand still: `role="status"` reads
 *  the whole band out again whenever a word in it changes. */
const POSITION_IN_BAND: ReadonlySet<LogReadWait> = new Set<LogReadWait>(['readerStopped', 'stalled'])

/**
 * The one row of the box that the band draws too, or null. The band is on every tab and the box
 * is not, so a Try line may point at nothing but this (tests/logReadWords.test.mts).
 */
export function bandPosition(r: LogReadReport): LogReadLine | null {
  const value = POSITION_IN_BAND.has(r.wait) ? readSoFar(r) : null
  return value === null ? null : { label: positionLabel(r), value }
}

/**
 * The box's rows, in order, at `now` (the window's own clock, for the Waiting row). A row whose
 * value is unknown is left out, never printed as 0.
 */
export function logReadLines(r: LogReadReport, now: number): LogReadLine[] {
  const waited = r.waitingSince === null ? null : humanDuration(Math.max(0, now - r.waitingSince))
  const rows: [string, string | null][] = [
    ['Waiting on', LOG_READ_WORDS[r.wait]],
    ['Try', r.tryLine],
    ['Log', logLine(r)],
    [positionLabel(r), readSoFar(r)],
    ['Engine', r.engine === '' ? null : r.engine],
    ['Last error', r.lastError ?? 'none'],
    ['Waiting', waited],
    ['Version', r.appVersion]
  ]
  const lines: LogReadLine[] = []
  for (const [label, value] of rows) {
    if (value !== null) lines.push({ label, value })
  }
  return lines
}
