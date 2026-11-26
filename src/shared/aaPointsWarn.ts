// aaPointsWarn.ts — unspent AA points near the cap (owner, 2026-11-25): the Alt. Adv. nav row's
// "!" from 45, and the 'aaPointsUnspent' alert a player turns on for their own N.
//
// The game at the cap (owner's log, 2026-11-20): "You have gained an ability point!  You now have
// 50 ability points.", then "You must spend some of your ability points. You will no longer gain
// ability points." and "You have reached the AA point cap, and cannot gain any further experience
// until some of your stored AA point pool is used."

import { unspentAaPoints, type AAGainLike, type AASpendLike } from './aa'

export const AA_POINT_CAP = 50
export const AA_POINTS_WARN_AT = 45

/** localStorage key of the player's N for the alert (a whole number, 1 to the cap). */
export const AA_POINTS_ALERT_AT_KEY = 'eq.aa.unspentAlertAt'

/** The seeded alert's banner and speech; the tokens are APP_SIGNAL_CAPTURES.aaPointsUnspent. */
export const AA_POINTS_ALERT_BANNER = '{points} unspent AA points: spend some before {cap}'
export const AA_POINTS_ALERT_SPEECH = '{points} unspent AA points'

/** The leveling snapshot's unspent pool, or null when none is served or no gain line was seen. */
export function aaUnspentOf(gains: readonly AAGainLike[] | undefined, spends: readonly AASpendLike[] | undefined): number | null {
  return gains === undefined ? null : unspentAaPoints(gains, spends ?? [])
}

export interface AaPointsWarn {
  cap: boolean
  tip: string
}

/** The nav row's warning: none below 45, a nudge from 45, the cap at 50. */
export function aaPointsWarnOf(unspent: number | null): AaPointsWarn | null {
  if (unspent === null || unspent < AA_POINTS_WARN_AT) return null
  if (unspent >= AA_POINT_CAP) return { cap: true, tip: 'AA cap reached: spend points, you earn no experience until you do.' }
  return { cap: false, tip: `${String(unspent)} unspent AA points: spend some before ${String(AA_POINT_CAP)} stops your experience.` }
}

/** The stored N, held to 1..cap; the default is 45. */
export function aaAlertAtOf(raw: string | null): number {
  const n = raw === null || raw.trim() === '' ? Number.NaN : Math.round(Number(raw))
  return Number.isFinite(n) ? Math.min(AA_POINT_CAP, Math.max(1, n)) : AA_POINTS_WARN_AT
}

/** True when the pool rose to or past N from below it: once per upward crossing, never on the baseline. */
export function aaAlertCrossed(before: number | null, after: number | null, at: number): boolean {
  return before !== null && after !== null && before < at && after >= at
}

/** The 'aaPointsUnspent' tokens. */
export function aaPointsCaptures(points: number): Record<string, string> {
  return { points: String(points), cap: String(AA_POINT_CAP) }
}
