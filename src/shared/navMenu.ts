// shared/navMenu.ts - the left menu's own text size and row height (fork #10). Zero-import, like
// shared/uiScale.ts. Both values are ladders in CSS px, kept in renderer localStorage.

/** Text size stops, ascending. 16 is the size the menu drew at before it had a setting. */
export const NAV_TEXT_STEPS: readonly number[] = [12, 13, 14, 15, 16]
export const NAV_TEXT_DEFAULT = 14
/** Row height stops, ascending. 48 is the old row. The shortest must hold the largest text. */
export const NAV_ROW_STEPS: readonly number[] = [24, 28, 32, 36, 40, 48]
/** The tallest stop at which the open menu fits the default window: measured, not computed (32px
 *  rows ran 21px over once the Skills row joined). text-size.e2e holds the fit. */
export const NAV_ROW_DEFAULT = 28

export const NAV_TEXT_KEY = 'eq.nav.textPx'
export const NAV_ROW_KEY = 'eq.nav.rowPx'

/** The stop nearest `value`; a tie goes to the smaller stop. */
function nearestStep(steps: readonly number[], value: number, dflt: number): number {
  let best = dflt
  let bestGap = Infinity
  for (const step of steps) {
    const gap = Math.abs(step - value)
    if (gap < bestGap) {
      best = step
      bestGap = gap
    }
  }
  return best
}

/** A stored value as a stop on its ladder. Absent, blank or not a finite number is the default. */
export function readNavStep(raw: string | null, steps: readonly number[], dflt: number): number {
  if (raw === null || raw.trim() === '') return dflt
  const value = Number(raw)
  return Number.isFinite(value) ? nearestStep(steps, value, dflt) : dflt
}

/** One stop up or down. The ends are fixed points; an off-ladder value is snapped first. */
export function stepNavStep(steps: readonly number[], cur: number, dir: 1 | -1): number {
  const at = steps.indexOf(nearestStep(steps, cur, cur))
  const want = Math.min(steps.length - 1, Math.max(0, at + dir))
  return steps[want] ?? cur
}

/** Whether `value` sits at either end of its ladder, where that way's press changes nothing. */
export function navStepEnds(steps: readonly number[], value: number): { atMin: boolean; atMax: boolean } {
  return { atMin: value <= Math.min(...steps), atMax: value >= Math.max(...steps) }
}

/** How a stop is said: "14px". */
export function navPx(n: number): string {
  return `${String(n)}px`
}

export interface NavMenuMetrics {
  textPx: number
  rowPx: number
  /** The icon follows the text, at the 24:16 ratio the menu has always drawn. */
  iconPx: number
  /** The icon's column: the icon and the 16px gap before the label. */
  iconCol: number
}

export function navMenuMetrics(textPx: number, rowPx: number): NavMenuMetrics {
  const iconPx = Math.round(textPx * 1.5)
  return { textPx, rowPx, iconPx, iconCol: iconPx + 16 }
}
