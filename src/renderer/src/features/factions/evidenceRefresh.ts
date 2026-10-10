// factions/evidenceRefresh.ts — when the open tab re-asks main for the log's faction evidence.
//
// Each ask reads up to a 32 MB log tail (main/factionsEvidence.ts), so the live signals the tab
// listens to (the engine's activity ping, the window regaining focus) are coalesced here: a burst
// of them becomes ONE trailing ask once the log has been quiet for `quietMs`. A log that never goes
// quiet (a long fight, a busy channel) still gets an ask every `maxWaitMs`, so a quest hand-in in
// the middle of it shows up without a tab revisit. PURE of React and IPC, node-testable.

/** Quiet time before the trailing ask: long enough to swallow a burst of activity pings. */
export const EVIDENCE_QUIET_MS = 3000
/** The longest a pending ask waits while the activity never stops. */
export const EVIDENCE_MAX_WAIT_MS = 15000

export interface TrailingRefresh {
  /** Something may have changed: (re)arm the trailing ask. */
  nudge: () => void
  /** Drop any pending ask (unmount). */
  cancel: () => void
}

export function trailingRefresh(
  run: () => void,
  quietMs = EVIDENCE_QUIET_MS,
  maxWaitMs = EVIDENCE_MAX_WAIT_MS,
  now: () => number = Date.now
): TrailingRefresh {
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstAt = 0
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const nudge = (): void => {
    if (timer === null) firstAt = now()
    cancel()
    // Never push the ask past firstAt + maxWaitMs, however many nudges keep arriving.
    const wait = Math.max(0, Math.min(quietMs, firstAt + maxWaitMs - now()))
    timer = setTimeout(() => {
      timer = null
      run()
    }, wait)
  }
  return { nudge, cancel }
}
