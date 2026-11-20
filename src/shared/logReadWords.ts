// logReadWords.ts - the words for each thing the app can be waiting on (fork #9).
//
// Three tables keyed by `LogReadWait`, each exhaustive by its type, so a new wait cannot ship
// without a sentence, a Try line and a decision about its button. The decision that picks the wait
// is `logReadReport.ts`; `tests/logReadWords.test.mts` reads every row.

import type { LogReadWait } from './logReadReport'

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
  ok: 'The data engine is answering; this panel has no reply yet.'
}

/** What the player can try, or null when there is nothing to say. */
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
  readerStopped: 'Press Try again. If it stops at the same place, send a screenshot of this box.',
  stalled: 'Wait a minute. If Read so far does not move, press Try again.',
  finishing: 'Nothing to do. This can take a minute on a large log.',
  opening: 'Wait a minute. If it stays, press Try again.',
  mismatch: 'Press Try again.',
  notAnswering: 'Press Try again.',
  reading: 'Nothing to do. Large logs take a while.',
  replyTooLarge: 'Turn on Summarize and archive log in Preferences, then restart the app.',
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
  ok: null
}
