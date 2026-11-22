// shared/logArchive/tooLarge.ts - A LOG THE ARCHIVE HAS ALREADY REFUSED AS TOO LARGE.
//
// A capture reads every module whole. When one reply is over what main may read, the archive
// refuses after up to a minute of work, and a log that only grows gets the same answer from the
// same version. So the refusal is remembered per character and that minute is not spent again.
// It stops holding for another log (a different head), a shorter file, or another app version.
//
// Nothing here touches the log: the caller reads it, and only ever reads it.

import type { LogReadReplySize } from '../logReadReport'
import { CAPTURED_MODULES } from './modules'
import type { ArchiveRefusal, LogArchivePrefs } from './prefs'

/** What identifies a log on disk. */
export interface LogIdentity {
  headSha256: string
  bytes: number
}

/** The archive card's blocker. */
export const TOO_LARGE_TO_ARCHIVE = 'This log is too large to archive, so it stays as it is.'

/** The refusal on record for a character, if any. */
export function refusalFor(prefs: LogArchivePrefs, character: string): ArchiveRefusal | undefined {
  const all = prefs.refusedTooLarge
  return all !== undefined && Object.prototype.hasOwnProperty.call(all, character) ? all[character] : undefined
}

/** Does the refusal still speak for this log, under this version? An unread log: no. */
export function refusalHolds(refusal: ArchiveRefusal | undefined, log: LogIdentity | null, appVersion: string): boolean {
  if (refusal === undefined || log === null) return false
  return refusal.appVersion === appVersion && refusal.headSha256 === log.headSha256 && log.bytes >= refusal.bytes
}

/** A reply main refused to read, of something a capture has to read: the archive cannot work. */
export function replyStopsCapture(reply: Pick<LogReadReplySize, 'op' | 'module' | 'refused'>): boolean {
  if (!reply.refused) return false
  return reply.op === 'combat.snapshot' || (reply.module !== null && CAPTURED_MODULES.includes(reply.module))
}
