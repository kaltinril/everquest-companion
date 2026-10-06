// shared/logArchive/preflight.ts — MAY THE LOG BE ARCHIVED NOW? (step 3.1)
//
// One pure answer with every reason it is no, in the player's words. No game check: the client
// opens the log by name for each line, so the game may keep running (ruling 0.5).

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
  /** Another log-archive action is running. */
  busy: boolean
}

export function rotateBlockers(p: PreflightInput): string[] {
  const out: string[] = []
  if (!p.on) out.push('Summarize and archive log is off.')
  if (!p.hasLog) out.push('No character log is attached.')
  if (p.hasLog && !p.engineLive) out.push('The app is still reading your log. Try again when it has caught up.')
  if (!p.sameDrive) out.push('The archive folder is on a different drive from your log, so the log cannot be moved in one step.')
  if (p.freeBytes !== null && p.freeBytes < p.logBytes) out.push('There is not enough free space for the archive.')
  if (p.interrupted) out.push('An earlier archive was interrupted. Restart the app to finish it first.')
  if (p.busy) out.push('Another log archive action is running.')
  return out
}

/** The drive or root a Windows or POSIX path is on, for the same-drive check. */
export function driveOf(path: string): string {
  const m = /^([a-zA-Z]:)[\\/]/.exec(path)
  if (m) return m[1].toUpperCase()
  const unc = /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.exec(path)
  return unc ? unc[0].toLowerCase() : '/'
}
