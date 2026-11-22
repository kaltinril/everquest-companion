// logReadNotes.ts - what else the status tells the player about this read of the log (fork #9,
// phase R3). A note is not a wait: the band draws the notes only while the wait is `ok`, and a tab
// whose own module a note names says so in its own line (`logReadWords.ts emptyOrWaiting`).
//
// Each note is a fact of ONE read of the log (`main/dataServer/logReadState.ts` clears them on a
// new turn), and its text never moves while that read stands: a note that changed with a number
// would be pushed to every window each time the number did.

import { humanBytes } from './engineLaunch'
import type { LogReadFacts, LogReadNote } from './logReadReport'
import { LOG_READ_NOTE, nothingRecognisedText } from './logReadWords'

/** The engine going live having read more than this with no line recognised is worth a note. */
export const NOTHING_RECOGNISED_BYTES = 64 * 1024

/** Replies that could not be shown; else, with the archive off, one that is getting there. */
function sizeNote(f: LogReadFacts): LogReadNote | null {
  if (f.tooLargeModules.length > 0) {
    const note = { id: 'tooLarge', text: LOG_READ_NOTE.tooLarge, modules: f.tooLargeModules }
    if (f.archiveWontHelp === true) return { ...note, tryLine: LOG_READ_NOTE.tooLargeNoArchive }
    // With the archive on there is nothing to turn on, and the app archives by itself.
    return f.archiveOn ? note : { ...note, tryLine: LOG_READ_NOTE.tooLargeTry }
  }
  return f.large !== null && !f.archiveOn && f.archiveWontHelp !== true ? { id: 'large', text: LOG_READ_NOTE.large } : null
}

/** The notes of this read, in the order the band draws them. `logFile` is the log's base name. */
export function logReadNotes(f: LogReadFacts, logFile: string | null): LogReadNote[] {
  const notes: LogReadNote[] = []
  if (f.nothingRecognised !== null) {
    const text = nothingRecognisedText(humanBytes(f.nothingRecognised), logFile)
    notes.push({ id: 'nothingRecognised', text })
  }
  const size = sizeNote(f)
  if (size !== null) notes.push(size)
  return notes
}
