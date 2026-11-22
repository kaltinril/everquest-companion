// shared/logArchive/preflight.ts — MAY THE LOG BE ARCHIVED NOW? (step 3.1)
//
// One pure answer with every reason it is no, in the player's words. No game check: the client
// opens the log by name for each line, so the game may keep running (ruling 0.5).

import { TOO_LARGE_TO_ARCHIVE } from './tooLarge'

/** With the switch on, a log this size is archived automatically (autoArchive.ts). It folds in
 *  about 20 s at launch (measured ~5.4 MB/s). */
export const AUTO_ARCHIVE_BYTES = 100 * 1024 ** 2

/**
 * Does the automatic check archive now? Never a log the player put back (eligible.ts
 * `putBackInLive`): it is over the limit by construction, and the put back restarts the app, so
 * the launch check would undo it within a minute. It waits for Archive now.
 */
export function autoArchiveDue(p: { on: boolean; liveBytes: number; putBack: boolean; tooLarge?: boolean }): boolean {
  return p.on && p.liveBytes >= AUTO_ARCHIVE_BYTES && !p.putBack && p.tooLarge !== true
}

/**
 * What the card says about an automatic archive that stopped, or null. A reason the card's
 * "not available" line already states stays there, so nothing is said twice.
 */
export function autoArchiveFailure(r: {
  ok: boolean
  message: string
  status: { enabled: boolean; rotateBlockers: string[] }
}): string | null {
  if (r.ok || !r.status.enabled || r.status.rotateBlockers.length > 0) return null
  return `The automatic archive stopped: ${r.message.replace(/^Not archived: /, '')}`
}

export interface PreflightInput {
  /** Summarize and archive log is on. */
  on: boolean
  /** A character is attached and its log exists. */
  hasLog: boolean
  /** The engine has finished reading the log and is following it live. */
  engineLive: boolean
  /** The archive folder is on the same drive as the log, so the move is a rename. */
  sameDrive: boolean
  /** Free bytes on the archive folder's drive, or null when unknown. */
  freeBytes: number | null
  logBytes: number
  /** An earlier archive was interrupted and is not yet finished. */
  interrupted: boolean
  /** Why this run could not finish it (the launch recovery's answer, or the archive's own), with
   *  where the old log is kept. Absent when the run that started it died: the next start has not
   *  tried yet. Kept in memory, never in the journal: every start tries again and says again. */
  interruptedReason?: string | null
  /** Another log-archive action is running. */
  busy: boolean
  /** This character's log was already archived since the app started. The engine still holds the
   *  archived lines until the next launch, so a second capture would count them twice. */
  archivedThisRun?: boolean
  /** A put back of the newest archive stopped part-way. Its scratch files hold the lines since,
   *  and only that archive's Put back joins them (rotate.ts restoreLog), so it must stay newest. */
  putBackUnfinished?: boolean
  /** The archive already refused this log as too large (tooLarge.ts). */
  tooLarge?: boolean
}

/** A restart finishes an archive the last run died in. One this run already failed to finish
 *  gets its reason instead: a restart may meet the same fault. */
function interruptedText(reason: string | null): string {
  if (reason === null) return 'An earlier archive was interrupted. Restart the app to finish it first.'
  return `An earlier archive could not be finished: ${reason}. The app tries again each time it starts.`
}

/** What this run or this log holds back, once the archive itself could go ahead. */
function runBlockers(p: PreflightInput): string[] {
  const out: string[] = []
  if (p.busy) out.push('Another log archive action is running.')
  if (p.archivedThisRun === true) out.push('Your log was already archived since the app started. It can be archived again after a restart.')
  if (p.putBackUnfinished === true) out.push('A put back did not finish. Press Put back on the newest archive to finish it first.')
  if (p.tooLarge === true) out.push(TOO_LARGE_TO_ARCHIVE)
  return out
}

export function rotateBlockers(p: PreflightInput): string[] {
  const out: string[] = []
  if (!p.on) out.push('Summarize and archive log is off.')
  if (!p.hasLog) out.push('No character log is attached.')
  if (p.hasLog && !p.engineLive) out.push('The app is still reading your log. Try again when it has caught up.')
  if (!p.sameDrive) out.push('The archive folder is on a different drive from your log, so the log cannot be moved in one step.')
  if (p.freeBytes !== null && p.freeBytes < p.logBytes) out.push('There is not enough free space for the archive.')
  if (p.interrupted) out.push(interruptedText(p.interruptedReason ?? null))
  return [...out, ...runBlockers(p)]
}

/** The drive or root a Windows or POSIX path is on, for the same-drive check. */
export function driveOf(path: string): string {
  const m = /^([a-zA-Z]:)[\\/]/.exec(path)
  if (m) return m[1].toUpperCase()
  const unc = /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.exec(path)
  return unc ? unc[0].toLowerCase() : '/'
}
