// cursorRingShape.ts — the cursor ring's SHAPES as numbers (owner, 2026-11-26: "the cursor thing
// is very plain. Can we have more shape options?").
//
// One pure function turns the prefs into a box: its width and height, its stroke, its corner
// radius, a rotation, and an optional inner mark (the centre dot, the target's inner ring). Two
// drawings read it, the ring window (renderer/src/overlay/cursorRing.ts) and the live sample in
// Preferences, so the sample shows exactly what the game gets, the same rule `ringStrokeColor`
// keeps for the colour.
//
// THE SIZE SLIDER MEANS THE SAME FOOTPRINT FOR EVERY SHAPE: nothing is drawn wider or taller than
// `sizePx`. The oval is as wide and 60% as tall; the diamond is a square of side size/sqrt(2)
// turned 45 degrees, so its corners touch the same box the circle fills.
//
// THE CIRCLE IS THE OLD RING, NUMBER FOR NUMBER: the same box, the same stroke, the same transform
// string. `tests/cursorRingShape.test.mts` pins that, so an upgrade moves nobody's ring.
//
// THE PICTURE (`'image'`, 2026-11-26) is a box like the square with no stroke at all: the overlay
// draws the player's PNG in it (object-fit contain), so it fills the same footprint. `'image'` with
// no valid picture draws the circle, exactly as an unknown shape does.
//
// No DOM, no React: plain numbers and strings, so the node tests can hold every shape.

import { normalizeRingShape } from './presencePrefs'
import { normalizePictureDataUrl } from './cursorPicture'
import type { CursorPoint, CursorRingPrefs } from './presencePrefs'

/** The oval's height as a share of its width. Fixed: one more slider would buy little. */
export const OVAL_HEIGHT_RATIO = 0.6
/** The rounded square's corner radius as a share of its side. */
export const ROUNDED_CORNER_RATIO = 0.22
/** The target's inner ring, as a share of the outer diameter. */
export const TARGET_INNER_RATIO = 0.5
/** The centre dot's diameter, as a share of the ring's, never under MIN_DOT_PX. */
export const DOT_RATIO = 0.18
export const MIN_DOT_PX = 4
/** Clear space kept between the outer stroke and an inner mark, each side, in px. */
const INNER_GAP_PX = 2

/** The inner mark of the `dot` and `target` shapes: a filled dot, or a smaller ring. */
export interface RingInnerMark {
  /** Diameter, CSS px. */
  sizePx: number
  /** Its top-left inside the ring's padding box, CSS px, the same on both axes (it is centred,
   *  and its size is chosen with the parity that keeps that offset a whole pixel). */
  offsetPx: number
  /** Stroke of an inner ring; 0 for a filled dot. */
  strokePx: number
  filled: boolean
}

/** Everything a drawing needs to paint one shape. */
export interface RingGeometry {
  widthPx: number
  heightPx: number
  /** The stroke actually drawn: the chosen thickness, capped at half the shorter side, so a thick
   *  stroke on the short oval stays an outline. The stored thickness is never changed. 0 for a
   *  picture, which has no outline. */
  strokePx: number
  /** A CSS border-radius: '50%' for round shapes, px for the rounded square, '0' for sharp. */
  borderRadius: string
  /** 0, or 45 for the diamond. Applied after the translate, so it turns about the box's centre. */
  rotateDeg: number
  inner: RingInnerMark | null
}

interface Box {
  w: number
  h: number
  radius: string
  rotate: number
}

function boxOf(shape: CursorRingPrefs['shape'], size: number): Box {
  switch (shape) {
    case 'oval':
      return { w: size, h: Math.max(2, Math.round(size * OVAL_HEIGHT_RATIO)), radius: '50%', rotate: 0 }
    case 'square':
      return { w: size, h: size, radius: '0', rotate: 0 }
    case 'rounded':
      return { w: size, h: size, radius: `${Math.round(size * ROUNDED_CORNER_RATIO)}px`, rotate: 0 }
    case 'diamond': {
      const side = Math.round(size / Math.SQRT2)
      return { w: side, h: side, radius: '0', rotate: 45 }
    }
    default:
      // circle, dot and target are all the original round box.
      return { w: size, h: size, radius: '50%', rotate: 0 }
  }
}

/** The largest size <= `want` (and >= 2) that sits centred on a whole pixel inside `room`, or
 *  null when nothing that small fits. */
function centredSize(want: number, room: number): number | null {
  let d = Math.min(want, room - 2 * INNER_GAP_PX)
  if ((room - d) % 2 !== 0) d -= 1
  return d >= 2 ? d : null
}

function innerOf(shape: CursorRingPrefs['shape'], size: number, stroke: number): RingInnerMark | null {
  const room = size - 2 * stroke
  if (shape === 'dot') {
    const d = centredSize(Math.max(MIN_DOT_PX, Math.round(size * DOT_RATIO)), room)
    return d === null ? null : { sizePx: d, offsetPx: (room - d) / 2, strokePx: 0, filled: true }
  }
  if (shape === 'target') {
    const d = centredSize(Math.round(size * TARGET_INNER_RATIO), room)
    if (d === null) return null
    // At most a quarter of its own diameter, so the inner ring keeps a hole.
    const innerStroke = Math.max(1, Math.min(stroke, Math.floor(d / 4)))
    return { sizePx: d, offsetPx: (room - d) / 2, strokePx: innerStroke, filled: false }
  }
  return null
}

/** What a drawing needs to know about the shape: the prefs it reads, all optional past size and
 *  thickness, because an older main or a test harness may send a config without them. */
type ShapeInput = Pick<CursorRingPrefs, 'sizePx' | 'thicknessPx'> & {
  shape?: unknown
  imageDataUrl?: unknown
}

/** The picture to draw, or null: only when the shape is `'image'` AND the stored picture passes
 *  the validator. Both the overlay window and the Preferences sample read this, never the field. */
export function ringPicture(prefs: { shape?: unknown; imageDataUrl?: unknown }): string | null {
  if (normalizeRingShape(prefs.shape) !== 'image') return null
  const url = normalizePictureDataUrl(prefs.imageDataUrl)
  return url === '' ? null : url
}

/**
 * The box for the chosen shape. Takes the shape as `unknown`-safe: the ring window may be handed
 * a config without one (an older main, a test harness), and that draws the circle. So does
 * `'image'` without a picture.
 */
export function ringGeometry(prefs: ShapeInput): RingGeometry {
  const size = prefs.sizePx
  if (ringPicture(prefs) !== null) {
    return { widthPx: size, heightPx: size, strokePx: 0, borderRadius: '0', rotateDeg: 0, inner: null }
  }
  const named = normalizeRingShape(prefs.shape)
  const shape = named === 'image' ? 'circle' : named
  const box = boxOf(shape, size)
  const strokePx = Math.max(1, Math.min(prefs.thicknessPx, Math.floor(Math.min(box.w, box.h) / 2)))
  return {
    widthPx: box.w,
    heightPx: box.h,
    strokePx,
    borderRadius: box.radius,
    rotateDeg: box.rotate,
    inner: innerOf(shape, size, strokePx)
  }
}

/** The player's X/Y offset of the shape from the pointer, CSS px. */
export interface RingOffset {
  x: number
  y: number
}

const NO_OFFSET: RingOffset = { x: 0, y: 0 }

/** Is the shape drawn at all (`showShape`, 2026-11-26)? A config without the field (an older
 *  main) draws it, as every ring before the switch existed was drawn. */
export function shapeShown(prefs: { showShape?: unknown }): boolean {
  return prefs.showShape !== false
}

/** The offset carried by the prefs; a config without one (an older main) is centred. */
export function ringOffset(prefs: { offsetXPx?: unknown; offsetYPx?: unknown }): RingOffset {
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0)
  return { x: n(prefs.offsetXPx), y: n(prefs.offsetYPx) }
}

/**
 * The ring's transform for one pointer sample: centre the box on the point plus the player's
 * offset, whole pixels, then turn it. THE HOT PATH: a few additions, two roundings, one string.
 * At offset 0/0, for every shape but the diamond it is exactly the string the ring always used.
 */
export function ringTransform(g: RingGeometry, p: CursorPoint, offset: RingOffset = NO_OFFSET): string {
  const x = Math.round(p.x + offset.x - g.widthPx / 2)
  const y = Math.round(p.y + offset.y - g.heightPx / 2)
  const t = `translate3d(${x}px, ${y}px, 0)`
  return g.rotateDeg === 0 ? t : `${t} rotate(${g.rotateDeg}deg)`
}

/** The outer box's style, as strings both a DOM `style` and a React `style` take. `strokeColor`
 *  is `ringStrokeColor()`'s answer, so only an rgba() built from numbers reaches it. */
export function ringBoxStyle(
  g: RingGeometry,
  strokeColor: string
): { width: string; height: string; borderWidth: string; borderRadius: string; borderColor: string } {
  return {
    width: `${g.widthPx}px`,
    height: `${g.heightPx}px`,
    borderWidth: `${g.strokePx}px`,
    borderRadius: g.borderRadius,
    borderColor: strokeColor
  }
}

/** The inner mark's style (same rules as `ringBoxStyle`): a filled dot paints its background, an
 *  inner ring its border. */
export function innerMarkStyle(
  m: RingInnerMark,
  strokeColor: string
): {
  width: string
  height: string
  left: string
  top: string
  borderWidth: string
  borderColor: string
  backgroundColor: string
} {
  return {
    width: `${m.sizePx}px`,
    height: `${m.sizePx}px`,
    left: `${m.offsetPx}px`,
    top: `${m.offsetPx}px`,
    borderWidth: `${m.strokePx}px`,
    borderColor: strokeColor,
    backgroundColor: m.filled ? strokeColor : 'transparent'
  }
}
