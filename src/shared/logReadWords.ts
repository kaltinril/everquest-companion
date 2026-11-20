// logReadWords.ts - the words for each thing the app can be waiting on (fork #9).
//
// Three tables keyed by `LogReadWait`, each exhaustive by its type, so a new wait cannot ship
// without a sentence, a Try line and a decision about its button. The decision that picks the wait
// is `logReadReport.ts`; `tests/logReadWords.test.mts` reads every row. Below them: the short
// labels an overlay prints, the notes' sentences, and the line a tab draws for a missing snapshot.

import type { LogReadReport, LogReadWait } from './logReadReport'

/** What "Try again" does (`main/logReadActions.ts`). */
export type LogReadAction =
  /** Start the engine again. */
  | 'relaunch'
  /** Open main's connection to the engine again. */
  | 'reconnect'
  /** Point the engine at the log again; it reads the log from the start. */
  | 'reattach'

/** The sentence beside "Waiting on". */
export const LOG_READ_WORDS: Readonly<Record<LogReadWait, string>> = {
  noCharacter: 'No character log is selected.',
  engineMissing: 'The data engine program is missing.',
  engineFailing: 'The data engine keeps failing to start.',
  engineStarting: 'Starting the data engine.',
  connecting: 'Connecting to the data engine.',
  notConnected: 'The app cannot connect to its data engine.',
  attachRefused: 'The data engine refused the log file.',
  logMissing: 'The log file is missing.',
  logUnreadable: 'Windows will not let the app read the log file.',
  logHung: 'The drive holding your log is not answering.',
  readerStopped: 'The data engine stopped before the end of your log.',
  stalled: 'The data engine has stopped making progress.',
  finishing: 'Finishing the read.',
  opening: 'The data engine is taking a long time to open your log.',
  mismatch: 'The app and its data engine disagree about which log is open.',
  notAnswering: 'The data engine is not answering.',
  reading: 'Still reading your log.',
  replyTooLarge: 'The fight list is too large for the app to show.',
  panelSlow: 'Your log is read. This panel is taking too long to build.',
  ok: 'The data engine is answering; this panel has no reply yet.'
}

/**
 * What the player can try, or null when there is nothing to say. The band prints these on every
 * tab, where there is no box: a line points only at the band's own rows (`bandPosition`).
 */
export const LOG_READ_TRY: Readonly<Record<LogReadWait, string | null>> = {
  noCharacter: 'Pick your character in the title bar.',
  engineMissing: 'Check your antivirus quarantine, then reinstall.',
  engineFailing: 'Press Try again. If it keeps failing, reinstall.',
  engineStarting: 'Nothing to do. This takes a few seconds.',
  connecting: 'Nothing to do. The app keeps trying.',
  notConnected: 'Press Try again. A security program may be blocking local connections.',
  attachRefused: 'Press Try again.',
  logMissing: 'In game, type /log on.',
  logUnreadable: 'Close any program that has the log open.',
  logHung: 'Check that the drive or folder holding the log can be reached.',
  readerStopped: 'Press Try again. If it stops at the same place, send a screenshot of this window.',
  stalled: 'Wait a minute. If Read so far does not move, press Try again.',
  finishing: 'Nothing to do. This can take a minute on a large log.',
  opening: 'Wait a minute. If it stays, press Try again.',
  mismatch: 'Press Try again.',
  notAnswering: 'Press Try again.',
  reading: 'Nothing to do. Large logs take a while.',
  replyTooLarge: 'Turn on Summarize and archive log in Preferences, then restart the app.',
  panelSlow: 'Wait a moment. If it stays, turn on Summarize and archive log in Preferences.',
  ok: null
}

/** What the Try again button does for each wait, or null when the app has no button to offer. */
export const LOG_READ_ACTION: Readonly<Record<LogReadWait, LogReadAction | null>> = {
  noCharacter: null,
  engineMissing: 'relaunch',
  engineFailing: 'relaunch',
  engineStarting: null,
  connecting: null,
  notConnected: 'reconnect',
  attachRefused: 'reattach',
  logMissing: 'reattach',
  logUnreadable: 'reattach',
  logHung: 'reattach',
  readerStopped: 'reattach',
  stalled: 'reattach',
  finishing: null,
  opening: 'reattach',
  mismatch: 'reattach',
  notAnswering: 'reconnect',
  reading: null,
  // On purpose: no button can make the reply smaller.
  replyTooLarge: null,
  // The engine is answering; a new connection would only make the panel start over.
  panelSlow: null,
  ok: null
}

// ── the short labels, for an overlay's title bar (phase R3) ─────────────────────────────────────

/** The most characters a short label may have: it shares a 380 px title bar with a mob's name. */
export const LOG_READ_SHORT_MAX = 22

/** The wait in a few words. Empty for `ok`: there is nothing to say. */
export const LOG_READ_SHORT: Readonly<Record<LogReadWait, string>> = {
  noCharacter: 'No character',
  engineMissing: 'Engine missing',
  engineFailing: 'Engine not starting',
  engineStarting: 'Starting engine',
  connecting: 'Connecting',
  notConnected: 'Not connected',
  attachRefused: 'Log refused',
  logMissing: 'Log file missing',
  // Not "locked": the app knows only that Windows would not open it.
  logUnreadable: 'Log file unreadable',
  logHung: 'Drive not answering',
  readerStopped: 'Log read stopped',
  stalled: 'Log read stalled',
  finishing: 'Finishing read',
  opening: 'Opening log',
  mismatch: 'Wrong log open',
  notAnswering: 'Engine not answering',
  reading: 'Reading log',
  replyTooLarge: 'Log too large',
  panelSlow: 'Slow to load',
  ok: ''
}

/** What a meter with no reply says when no wait explains it: the status is unknown, or is `ok`. */
export const OVERLAY_LOADING = 'Loading…'

/** The short label for the status, `Reading log 43%` while the log is read; empty for none. */
export function overlayLabel(report: LogReadReport | null): string {
  if (report === null) return ''
  const label = LOG_READ_SHORT[report.wait]
  if (report.wait !== 'reading' || report.pct === null) return label
  return `${label} ${String(Math.floor(report.pct))}%`
}

/**
 * A meter overlay's title and the word beside it. With no reply to draw (`hydrating`) the title IS
 * the reason; over numbers that are held, the reason goes beside the segment's own name.
 */
export function overlayTitle(
  report: LogReadReport | null,
  hydrating: boolean,
  name: string
): { readonly title: string; readonly tail: string | undefined } {
  const label = overlayLabel(report)
  if (hydrating) return { title: label === '' ? OVERLAY_LOADING : label, tail: undefined }
  return { title: name, tail: label === '' ? undefined : label }
}

// ── the notes, and the one line a tab draws where its own empty text would go (phase R3) ────────

/** The sentences of the notes (`logReadNotes.ts` decides which are told). */
export const LOG_READ_NOTE = {
  tooLarge: "Part of your log's history is too large for the app to show.",
  tooLargeTry: 'Turn on Summarize and archive log in Preferences, then restart the app.',
  large: 'Your log is getting large. Turn on Summarize and archive log in Preferences.',
  /** A tab whose own reply was the one too large. */
  tabTooLarge: "This tab's history is too large for the app to show."
} as const

/** `The app read 238.4 MB of eqlog_Name_server.txt and recognised no lines.` */
export function nothingRecognisedText(size: string, logFile: string | null): string {
  return `The app read ${size} of ${logFile ?? 'your log'} and recognised no lines.`
}

/** What a tab draws where its empty text goes. */
export type TabLine =
  /** Its module is served and holds nothing: the tab's own words. */
  | { readonly kind: 'empty' }
  /** Its module has no snapshot: why, and what to try. */
  | { readonly kind: 'waiting'; readonly text: string; readonly tryLine: string | null }

/**
 * A tab with nothing to list says "nothing yet" only when its module was SERVED and is empty.
 * With no snapshot it says what the app is waiting on; when the status is `ok` and this module's
 * own reply was too large, it says that.
 */
export function emptyOrWaiting(snapshotIsNull: boolean, report: LogReadReport, module?: string): TabLine {
  if (!snapshotIsNull) return { kind: 'empty' }
  if (report.wait !== 'ok') return { kind: 'waiting', text: LOG_READ_WORDS[report.wait], tryLine: report.tryLine }
  const note = module === undefined ? undefined : report.notes.find((n) => n.modules?.includes(module) === true)
  if (note !== undefined) return { kind: 'waiting', text: LOG_READ_NOTE.tabTooLarge, tryLine: note.tryLine ?? null }
  return { kind: 'waiting', text: LOG_READ_WORDS.ok, tryLine: null }
}

/**
 * A tab's status line is held back this long unless main says to show the status: a rebuild of
 * the same log empties a tab for a moment, and that moment must not flash a sentence.
 */
export const LOG_READ_INLINE_AFTER_MS = 1_500

/** Is the line drawn yet, for a tab whose module has had no snapshot for `nullForMs`? */
export function inlineDue(report: LogReadReport, nullForMs: number): boolean {
  return report.show || nullForMs >= LOG_READ_INLINE_AFTER_MS
}
