// spells/spellbookFormat.ts — THE WORDS AND THE UNITS, once.
//
// Three surfaces in this area draw the same figures (the Spellbook's table, the spell page's ladder,
// and the Upgrades tab's what-if), and a number formatted three ways is three chances to disagree
// about whether 2.16 seconds prints as `2.16s` or `2.2s`. So the formatting lives here and nothing
// below it is allowed an opinion.
//
// IT IS A RE-EXPORT SEAM AS MUCH AS A FORMATTER. `romanRank` and `SPELL_MAX_RANK` are the shared
// modules' own; naming them here means a component imports ONE module for everything it needs to
// draw a tier, rather than three - which is what stopped the toolbar reaching past `shared/spellbook`
// into `shared/spellLines` for a numeral.
//
// NO EM DASHES anywhere below (AGENTS.md, UI conventions): every string here is user-facing copy.

import { romanRank } from '@shared/spellLines'
import { SPELL_MAX_RANK } from '@shared/spellScale'
import { spellStatText, type SpellStatGrant } from '@shared/spellStats'
import type { SpellbookRow } from '@shared/spellbook'

export { romanRank, SPELL_MAX_RANK }

/** The placeholder for a figure the source states nothing for. Never a zero (law 1). */
export const UNSTATED = '-'

/**
 * Seconds, at the precision the game's own spell window uses: two decimals with trailing zeros
 * trimmed, so 3 prints `3s` and 2.16 prints `2.16s`.
 */
export function seconds(v: number | undefined): string {
  if (v === undefined) return UNSTATED
  return `${String(Number(v.toFixed(2)))}s`
}

/** A whole number, or the placeholder. */
export function whole(v: number | undefined): string {
  return v === undefined ? UNSTATED : String(Math.round(v))
}

/**
 * Ticks as a duration a player reads: `30s`, `2 min`, `2h 24m`.
 *
 * A tick is six seconds, which is the unit the game keeps a duration in and therefore the unit
 * `spellTierLadder` works in - this is the only place it becomes minutes.
 */
export function ticksText(ticks: number | undefined): string {
  if (ticks === undefined || ticks <= 0) return UNSTATED
  const secs = ticks * 6
  if (secs < 60) return `${String(secs)}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) {
    const rem = secs % 60
    return rem === 0 ? `${String(mins)} min` : `${String(mins)} min ${String(rem)}s`
  }
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rem)}m`
}

/**
 * The grants, as one line: `STR +25, AC +14, Haste +47%`.
 *
 * CAPPED, and the cap is a display decision rather than a truncation of the data: a form spell can
 * state five grants and a table cell cannot hold them. The row's own hover and its spell page both
 * show the full list, so nothing is lost - and the count says how much was left off rather than
 * trailing an ellipsis that states nothing.
 */
export function grantsText(grants: readonly SpellStatGrant[], max = 3): string {
  if (grants.length === 0) return UNSTATED
  const shown = grants.slice(0, max).map(spellStatText).join(', ')
  const rest = grants.length - max
  return rest > 0 ? `${shown} +${String(rest)} more` : shown
}

/**
 * The headline figure for a row: its damage, or its healing, or nothing.
 *
 * ONE COLUMN FOR TWO QUANTITIES, because a spell is essentially never both and two columns would be
 * two thirds empty on every screen. The row states which it is, so the cell can be read.
 */
export function headlineFigure(row: SpellbookRow): { label: string; value: string } {
  if (row.damage !== undefined) return { label: 'damage', value: whole(row.damage) }
  if (row.heal !== undefined) return { label: 'healing', value: whole(row.heal) }
  return { label: '', value: UNSTATED }
}

/**
 * The classes and levels, as a table cell: `CLR 20 / DRU 24`.
 *
 * Main sorted them by level then class (`parseSpellClassLevels`) and this preserves that order - a
 * cell that re-sorted would put a different class first from the one the spell page names first.
 */
export function classesText(at: SpellbookRow['at'], max = 3): string {
  if (at.length === 0) return UNSTATED
  const shown = at.slice(0, max).map((p) => `${p.cls} ${String(p.level)}`).join(' / ')
  const rest = at.length - max
  return rest > 0 ? `${shown} +${String(rest)}` : shown
}
