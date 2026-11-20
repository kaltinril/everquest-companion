// "DPS at that point" — sampled from the chart's OWN rolling series, never computed a second
// way. `buildDpsSeries` already defines the app's damage rate over time (trailing rolling mean,
// the reading a live meter gives), so the timeline's hover number and the DPS curve's line can
// never disagree. The same law that made CAT_COLOR one map.
//
// Pure: type-only imports plus the pure formatRate, so the node suite can import it (see
// timelineHitTest.ts's header).

import { formatRate } from '../../lib/formatRate'
import type { ChartLineKey, DpsLineKey } from './combatPrefs'
import type { DpsSeries } from './dashboardData'

/** The rates a hover readout prints. `out` is the outgoing total (`outRate`) — the value the
 *  curve's gold line draws. */
export interface DpsPoint {
  you: number
  pet: number
  /** your group's contribution (docs/plans/group-model.md); 0 in a solo fight. */
  group: number
  inc: number
  out: number
}

/** The gold line's rate at bucket `i`: you + pet + group, or without the pet when it is drawn apart. */
export function outRate(series: DpsSeries, i: number): number {
  return series.you[i] + (series.petApart ? 0 : series.pet[i]) + series.group[i]
}

/** The gold line's name: exactly what `outRate` sums, for the legend and the hover alike. */
export function outLabel(series: DpsSeries): string {
  return `you${series.petApart ? '' : ' + pet'}${series.hasGroup ? ' + group' : ''}`
}

/** The series the card draws under a pet layout. Not apart hands back the SAME object, so the
 *  memo chain behind it never re-derives; apart is a shallow copy sharing the typed arrays. */
export function withPetApart(series: DpsSeries, apart: boolean): DpsSeries {
  return apart ? { ...series, petApart: true } : series
}

/**
 * Sample the rolling series at `tMs`, clamped to the series. NO interpolation between buckets:
 * the series is bucketed at >=1s and the readout says so ("Ns rolling"), so smoothing the steps
 * away would invent a rate the log cannot support.
 */
export function dpsAt(series: DpsSeries, tMs: number): DpsPoint {
  const i = Math.min(series.n - 1, Math.max(0, Math.floor(tMs / series.bucketMs)))
  const you = series.you[i]
  const pet = series.pet[i]
  const group = series.group[i]
  return { you, pet, group, inc: series.inc[i], out: outRate(series, i) }
}

/** One rate row of the curve's hover readout, keyed by the line it reads. */
export interface CurveRow {
  key: DpsLineKey
  label: string
  value: string
}

/**
 * The hover readout's rate rows, in legend order: sampled from the chart's own series (`dpsAt`),
 * `~`-prefixed when that series is inexact, and with no row for a line that is hidden or that the
 * fight never had. Rates go through formatRate: '12.4k dps', no '/s'.
 */
export function curveRows(series: DpsSeries, t: number, hidden: readonly ChartLineKey[]): CurveRow[] {
  const p = dpsAt(series, t)
  const a = series.estimated ? '~' : ''
  const rows: CurveRow[] = []
  const add = (key: DpsLineKey, has: boolean, label: string, rate: number): void => {
    if (has && !hidden.includes(key)) rows.push({ key, label, value: `${a}${formatRate(rate)}` })
  }
  add('out', true, outLabel(series), p.out)
  add('pet', series.hasPet, 'pet', p.pet)
  add('group', series.hasGroup, 'group', p.group)
  add('inc', series.hasInc, 'incoming', p.inc)
  return rows
}

/**
 * The honesty footer both charts print: the series' own smoothing window, plus the `~` marker
 * when the ring behind it was downsampled and/or truncated (every rate is then a scaled
 * estimate or a lower bound). Established vocabulary — the card legend already reads
 * "5s rolling" and the panel chip already reads "~".
 */
export function rollingNote(series: DpsSeries): string {
  return `${Math.round(series.smoothMs / 1000)}s rolling${series.estimated ? ' · ~ estimated' : ''}`
}

/** The header peak's tooltip: what the gold peak number measures, pet or no pet. */
export function peakTitle(series: DpsSeries): string {
  const secs = Math.round(series.smoothMs / 1000)
  return series.petApart
    ? `Peak ${secs}s rolling rate without your pet, in the visible window.`
    : `Peak ${secs}s rolling outgoing rate in the visible window.`
}
