// dropObsView — the words the "Send my loot to the wiki" card shows, from the status main sends
// (shared/dropObs.ts). Pure, so tests/dropObsView.test.mts pins them; DropObsSetting.tsx draws them.
//
// The card is read by a player, not a developer: no wiki error codes on their own, a count of what
// is left and roughly how long it takes, and a plain reason when something stops.

import type { DropObsStatus } from '@shared/dropObs'
import { formatAge } from '../../lib/formatDate'

/** The wiki takes at most 100 reports a batch and the app sends one batch every 30 s (main/dropObs/drain.ts). */
const PER_BATCH = 100
const BATCH_SECONDS = 30

export const fmtCount = (n: number): string => n.toLocaleString('en-US')

const plural = (n: number, one: string, many: string): string => `${fmtCount(n)} ${n === 1 ? one : many}`

/** Where the player is in setting it up: no sign-in saved, saved but not yet working, or ready. */
export type SetupStage = 'no-sign-in' | 'not-signed-in' | 'signed-in'

export function setupStage(st: DropObsStatus): SetupStage {
  if (!st.hasPassword || st.username === '') return 'no-sign-in'
  return st.signedInAs === '' ? 'not-signed-in' : 'signed-in'
}

/** A failure the drain will retry by itself, in words. */
export function errorWords(code: string): string {
  if (code === 'eoz-rate-limit' || code === 'eqc-http-429') return 'The wiki asked the app to slow down'
  if (code === 'eoz-capacity' || code === 'eoz-schema-unavailable' || /^eqc-http-5\d\d$/.test(code)) return 'The wiki is busy'
  if (code === 'eqc-network') return 'Could not reach the wiki'
  return `The wiki did not answer clearly (${code})`
}

/** Why the wiki did not take one report. */
export function keptReason(code: string): string {
  if (code === 'conflict') return 'already reported with different details'
  if (code === 'eoz-invalid-batch' || code === 'eoz-batch-conflict') return `refused with its batch (${code})`
  return `refused (${code})`
}

/** `about 3 minutes` for what is left to send. */
export function timeLeft(left: number): string {
  const minutes = Math.ceil(Math.ceil(left / PER_BATCH) * BATCH_SECONDS / 60)
  return minutes <= 1 ? 'about a minute' : `about ${String(minutes)} minutes`
}

/** `just now`, `5 minutes ago`, `3 hours ago`, `2 days ago`. */
export function ago(at: number, now: number): string {
  return formatAge(at, now, 'long')
}

export type ProgressTone = 'info' | 'busy' | 'done' | 'warn'

export interface ProgressView {
  tone: ProgressTone
  /** The one line that says where things stand. */
  headline: string
  /** A second, quieter line; null when there is nothing to add. */
  detail: string | null
}

const joined = (parts: (string | null)[]): string | null => parts.filter((p): p is string => p !== null).join(' · ') || null

const readyLine = (left: number): string => `${plural(left, 'loot report', 'loot reports')} from your log ${left === 1 ? 'is' : 'are'} ready to send.`

/** Off: what choosing a way to send would send. */
function offView(left: number, sent: string | null): ProgressView {
  if (left === 0) return { tone: 'info', headline: 'No loot reports waiting.', detail: sent }
  return { tone: 'info', headline: readyLine(left), detail: sent ?? 'Choose how to send them above.' }
}

/** Manual, between runs: what Send now would send. */
function waitingView(left: number, sent: string | null, last: string | null): ProgressView {
  if (left === 0) return { tone: 'done', headline: 'All sent. New loot waits here until you press Send now.', detail: joined([sent, last]) }
  return { tone: 'info', headline: readyLine(left), detail: joined([sent, last]) ?? 'Press Send now to send them, newest first.' }
}

/** Sending (in the background, or a Send run): a retry waiting, sending, or caught up. */
function onView(st: DropObsStatus, left: number, sent: string | null, last: string | null): ProgressView {
  if (st.nextAttemptAt > 0 && st.lastError !== null) {
    const at = new Date(st.nextAttemptAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return { tone: 'warn', headline: `${errorWords(st.lastError)}. Trying again at ${at}.`, detail: joined([`${fmtCount(left)} left`, sent]) }
  }
  if (left > 0) return { tone: 'busy', headline: `Sending… ${fmtCount(left)} left, ${timeLeft(left)} to go.`, detail: joined([sent, last]) }
  const headline = st.mode === 'manual' ? 'All sent. New loot waits here until you press Send now.' : 'All caught up. New loot is sent within a minute or so.'
  return { tone: 'done', headline, detail: joined([sent, last]) }
}

/** What the status box says. `now` is passed in so the tests can pin it. */
export function progressView(st: DropObsStatus, now: number): ProgressView {
  const left = st.ready === null ? null : st.ready + st.inFlight
  const sent = st.delivered > 0 ? `${plural(st.delivered, 'report', 'reports')} sent so far` : null
  const last = st.lastSuccessAt > 0 ? `last sent ${ago(st.lastSuccessAt, now)}` : null
  if (st.stopped !== null) return { tone: 'warn', headline: `Sending stopped. ${st.stopped}`, detail: sent }
  if (left === null) return { tone: 'info', headline: 'Waiting for your log to load.', detail: sent }
  if (st.mode === 'off') return offView(left, sent)
  if (st.mode === 'manual' && !st.sendingNow) return waitingView(left, sent, last)
  return onView(st, left, sent, last)
}
