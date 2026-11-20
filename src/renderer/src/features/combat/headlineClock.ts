// THE TIME BESIDE A DAMAGE HEADLINE, and the Overview card's line that prints it.
//
// A damage headline is not always over the fight's length: under the You scope it is over your own
// clock, and over a drill it is the row's own rate (BRANCH_NOTES, "Damage meters: whose scope").
// So the time printed beside it is read back off the two figures it sits with, and rate x time is
// always the total shown. The Combat tab's header and the Overview card both read it here, so the
// two surfaces cannot print different clocks for one fight.
//
// MUI-FREE AND JSX-FREE so the node tests can load it (tests/headlineClock.test.mts).

import { fmtDur } from './copyTable'
import { formatNum, formatRate } from '../../lib/formatRate'

/** The seconds a headline rate was taken over: total / rate, or the fight's length when there is
 *  no rate to read it from. */
export function headlineClockSec(total: number, dps: number, durationSec: number): number {
  return dps > 0 ? total / dps : durationSec
}

/**
 * The Overview card's line under its headline: total · time · active-time rate.
 *
 * The active rate is the fight's, scaled to the rows shown. A headline over a row's own clock can
 * already beat it, and an "active" figure below the headline would say nothing true, so it is
 * left off then (the Combat tab's `ActiveDpsNote` makes the same call).
 */
export function supportLine(v: { total: number; dps: number; activeDps: number }, durationSec: number): string {
  const parts = [`${formatNum(v.total)} total`, fmtDur(headlineClockSec(v.total, v.dps, durationSec))]
  if (v.activeDps >= v.dps) parts.push(`${formatRate(v.activeDps)} active`)
  return parts.join(' · ')
}
