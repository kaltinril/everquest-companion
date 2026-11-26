// cursorCrosshair.ts — the cursor overlay's CROSSHAIR as numbers (owner, 2026-11-26: "a cross hair
// like thing, 1 vertical line across the entire screen at the mouse posiiton, and 1 horizontal at
// the mouse position (they can control line color and weight)").
//
// Two prebuilt divs in cursor.html, one a full-height column, one a full-width row. A pointer move
// changes ONLY their transforms: translateX on the column, translateY on the row, whole px, each
// line centred on the pointer across its weight. The overlay window is sized to the EverQuest
// window, so "the entire screen" is the game window (the whole screen in fullscreen).
//
// THE LINES FOLLOW THE RAW POINTER, NOT THE SHAPE'S X/Y OFFSET: a crosshair that misses the hot
// spot would aim the player at the wrong pixel. On a PARKED point (pointer off the game) both
// lines go off screen, as the shape does.
//
// No DOM, no React: plain numbers and strings, so the node tests hold it and the Preferences sample
// draws through the same seams as the overlay window.

import {
  DEFAULT_CROSSHAIR_WEIGHT_PX,
  MAX_CROSSHAIR_WEIGHT_PX,
  MIN_CROSSHAIR_WEIGHT_PX,
  normalizeRingColor,
  ringStrokeColor
} from './presencePrefs'
import type { CursorPoint, CursorRingPrefs } from './presencePrefs'

/** Where a line goes while the pointer is off the game. -9999 is the shape's park too. */
export const CROSSHAIR_OFF_SCREEN_PX = -9999

/** The crosshair the overlay draws, read from a config that may predate it. */
export interface Crosshair {
  on: boolean
  weightPx: number
  /** `ringStrokeColor()` of the chosen hue: an rgba() built from numbers, never stored text. */
  color: string
}

/** A point the overlay must not draw at. Main only sends a point inside the window (both
 *  coordinates >= 0) or the PARKED point (-9999, -9999), so any negative coordinate is a park. */
export function isParkedPoint(p: CursorPoint): boolean {
  return p.x < 0 || p.y < 0
}

/** A weight in [1, 8] whole px, or the default when the value is not a number (an older main). */
export function crosshairWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CROSSHAIR_WEIGHT_PX
  return Math.min(MAX_CROSSHAIR_WEIGHT_PX, Math.max(MIN_CROSSHAIR_WEIGHT_PX, Math.round(value)))
}

/** The crosshair carried by the prefs. A config without the fields (an older main, a test harness)
 *  draws no crosshair: only a literal `true` turns it on. */
export function crosshairOf(
  prefs: Partial<Pick<CursorRingPrefs, 'crosshairEnabled' | 'crosshairColorHex' | 'crosshairWeightPx'>>
): Crosshair {
  return {
    on: prefs.crosshairEnabled === true,
    weightPx: crosshairWeight(prefs.crosshairWeightPx),
    color: ringStrokeColor(normalizeRingColor(prefs.crosshairColorHex))
  }
}

/** The near edge of a line of `weightPx` centred on `at`, whole px. */
function lineEdge(at: number, weightPx: number): number {
  return Math.round(at - weightPx / 2)
}

/**
 * The two lines' transforms for one pointer sample. THE HOT PATH: two subtractions, two roundings,
 * two strings. A parked point sends both lines off screen.
 */
export function crosshairTransforms(
  p: CursorPoint,
  weightPx: number
): { vertical: string; horizontal: string } {
  const parked = isParkedPoint(p)
  const x = parked ? CROSSHAIR_OFF_SCREEN_PX : lineEdge(p.x, weightPx)
  const y = parked ? CROSSHAIR_OFF_SCREEN_PX : lineEdge(p.y, weightPx)
  return { vertical: `translate3d(${x}px, 0, 0)`, horizontal: `translate3d(0, ${y}px, 0)` }
}

/** The lines' style, set once per config, never on a move. Strings both a DOM `style` and a React
 *  `style` take. */
export function crosshairLineStyles(c: Crosshair): {
  vertical: { width: string; backgroundColor: string }
  horizontal: { height: string; backgroundColor: string }
} {
  return {
    vertical: { width: `${c.weightPx}px`, backgroundColor: c.color },
    horizontal: { height: `${c.weightPx}px`, backgroundColor: c.color }
  }
}

/** Where a line of `weightPx` through `at` starts, for a drawing that places it with left/top
 *  (the Preferences sample). The same rounding as the transform. */
export function crosshairLineOffset(at: number, weightPx: number): number {
  return lineEdge(at, weightPx)
}
