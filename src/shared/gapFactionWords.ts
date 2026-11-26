// shared/gapFactionWords.ts — a faction row's words: what the mob page says of the faction and what
// the log says. Out of gaps.ts, which sits at the factoring ceiling (eslint max-lines); it re-exports them.

import type { GapRow } from './gaps'
import { decodeFactionAmount } from './mobFactionAmounts'

/** What a page's faction statement says, in words: `(-10) to (-30) (unconfirmed)`, `a lowering of no stated amount`. */
export function pageSaysText(said: string): string {
  const h = decodeFactionAmount(said)
  const guess = h.unconfirmed === true ? ' (unconfirmed)' : ''
  if (h.min === undefined || h.max === undefined) return `${h.side === 'lowers' ? 'a lowering' : 'a raise'} of no stated amount${guess}`
  // The wiki writes the smaller hit first: `(-10) to (-30)`, `(10) to (30)`.
  const [a, b] = Math.abs(h.min) <= Math.abs(h.max) ? [h.min, h.max] : [h.max, h.min]
  return (h.min === h.max ? `(${String(h.min)})` : `(${String(a)}) to (${String(b)})`) + guess
}

/** What the log says of a faction row: its amount, or the side a capped line showed. */
export function logSaysText(row: Pick<GapRow, 'adjust' | 'raised'>): string {
  if (row.adjust !== undefined) return `(${String(row.adjust)})`
  return row.raised === true ? 'a raise (at max standing, no amount)' : 'a lowering (at min standing, no amount)'
}
