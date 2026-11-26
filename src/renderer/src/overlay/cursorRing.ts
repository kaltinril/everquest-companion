// cursorRing.ts — the entire renderer half of the cursor overlay (the cursor ring, renamed on screen
// 2026-11-26; the file, its IPC and its store key keep the old name).
//
// It lives in `src/renderer/src/overlay/` beside the meters but shares NOTHING with them: no
// React, no MUI, no theme, no shared component. The meters are a UI; this is one <div> that
// moves. Pulling in a framework to move a div would add a reconciler to the hottest path in the
// app for no expressible benefit — so this file is plain DOM. The one thing it shares is the pure
// arithmetic (`shared/cursorRingShape.ts`, `shared/cursorCrosshair.ts`), which the Preferences
// sample reads too.
//
// ============================ THE PERFORMANCE CONTRACT ============================
// The owner's requirement was "it can't feel like it's lagging". Three rules make that true,
// and every one of them is visible in the ~15 lines of real code below:
//
//   1. THE REAL CURSOR IS NEVER TOUCHED. Windows draws the system pointer; this window is
//      click-through and `cursor: none`. Only the halo follows, so even if a frame is dropped
//      the pointer the user is aiming with is exactly where it always was. There is no path by
//      which this feature can make the mouse itself feel heavy.
//   2. NEWEST POINT WINS; STALE POINTS ARE DROPPED, NEVER QUEUED. Main streams samples at
//      ~8 ms — faster than any display refreshes. We keep ONE variable and paint it on the next
//      animation frame. A backlog is therefore impossible by construction: if ten samples land
//      between two frames, nine are overwritten and cost a single assignment each. Queueing
//      them would be exactly the "feels laggy" failure — a ring replaying where the mouse USED
//      to be.
//   3. COMPOSITOR-ONLY PAINTING. The ring element (and its inner mark, a child that rides along)
//      is created once, sized once (and again only when the user changes a setting, the SHAPE
//      included), and thereafter only the ring's `transform` changes. That is a GPU layer
//      translation: no canvas, no repaint, no layout, no style recalc that touches anything
//      else. The diamond's 45-degree turn is part of the same transform string, so it costs
//      nothing more. There is no timer in this file at all — no rAF is scheduled while the
//      mouse is still, because main sends nothing while the point is unchanged.
//   4. THE CROSSHAIR IS TWO MORE PREBUILT ELEMENTS, SAME RULES (2026-11-26). Two divs in
//      cursor.html, hidden unless the player turns the crosshair on, styled (weight, colour) once
//      per config. On a move only their `transform` changes, translateX on the column, translateY
//      on the row, in the SAME frame as the ring. Off, the paint skips them on one boolean. With
//      the shape switched off, the paint skips the ring the same way.

import { ringStrokeColor } from '@shared/presencePrefs'
import type { CursorPoint, CursorRingPrefs } from '@shared/presencePrefs'
import {
  innerMarkStyle,
  ringBoxStyle,
  ringGeometry,
  ringOffset,
  ringTransform,
  shapeShown
} from '@shared/cursorRingShape'
import type { RingGeometry, RingOffset } from '@shared/cursorRingShape'
import { crosshairLineStyles, crosshairOf, crosshairTransforms } from '@shared/cursorCrosshair'

/** The bridge `preload/cursor.ts` installs. Narrow on purpose — this window can receive its
 *  config and a stream of points, and can do nothing else. */
declare global {
  interface Window {
    eqCursor?: {
      getConfig: () => Promise<CursorRingPrefs>
      onConfig: (cb: (c: CursorRingPrefs) => void) => () => void
      onPoint: (cb: (p: CursorPoint) => void) => () => void
    }
  }
}

/** An element cursor.html always carries; fail loudly rather than silently tracking nothing. */
function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`cursorRing: #${id} missing from cursor.html`)
  return el
}

const ring = mustGet('ring')
const inner = mustGet('ring-inner')
const crossV = mustGet('cross-v')
const crossH = mustGet('cross-h')

/** The chosen shape as a box (size, stroke, corners, turn, inner mark). Recomputed only when a
 *  setting changes, so the hot path is two subtractions and a string. Until the config arrives
 *  it is the default circle, the same box cursor.html's static rule draws. */
let geometry: RingGeometry = ringGeometry({ sizePx: 0, thicknessPx: 1 })
/** The player's X/Y offset from the pointer; set with the geometry, read on every paint. */
let offset: RingOffset = { x: 0, y: 0 }
/** Draw the shape at all (`showShape`; a config without it draws the shape, as it always did). */
let shapeOn = true
/** The crosshair's switch and weight; read on every paint, set with the config. */
let crossOn = false
let crossWeight = 1

/** Show or hide the crosshair and style its two lines. Once per config, never on a move. */
function applyCrosshair(cfg: CursorRingPrefs): void {
  const c = crosshairOf(cfg)
  crossOn = c.on
  crossWeight = c.weightPx
  const display = c.on ? 'block' : 'none'
  crossV.style.display = display
  crossH.style.display = display
  if (!c.on) return
  const styles = crosshairLineStyles(c)
  Object.assign(crossV.style, styles.vertical)
  Object.assign(crossH.style, styles.horizontal)
}

function applyConfig(cfg: CursorRingPrefs): void {
  geometry = ringGeometry(cfg)
  offset = ringOffset(cfg)
  shapeOn = shapeShown(cfg)
  ring.style.display = shapeOn ? 'block' : 'none'
  applyCrosshair(cfg)
  // The colour is a STYLE assignment, so only a `#rrggbb` may reach it — `ringStrokeColor` takes
  // the value through the same normalizer main stored it through, and answers with an rgba()
  // built from three numbers. Nothing a store file could carry becomes a CSS declaration here.
  const stroke = ringStrokeColor(cfg.colorHex)
  Object.assign(ring.style, ringBoxStyle(geometry, stroke))
  // The inner mark (centre dot, the target's inner ring) is a child of the ring, so the ring's
  // transform carries it: it is styled here, once, and never touched on a move.
  if (geometry.inner) {
    Object.assign(inner.style, innerMarkStyle(geometry.inner, stroke))
    inner.style.display = 'block'
  } else {
    inner.style.display = 'none'
  }
  // Re-centre on the last known point. Without this a size change while the mouse is STILL
  // would leave the ring off-centre by the radius delta until the pointer next moved — and a
  // Preferences slider is exactly the moment the pointer is somewhere else entirely.
  schedulePaint()
}

// ---- the hot path ----
//
// `latest` is the only mutable state. `queued` is a plain boolean rather than a rAF handle
// because we never cancel a frame — we simply refuse to schedule a second one.
let latest: CursorPoint | null = null
let queued = false

function paint(): void {
  queued = false
  if (!latest) return
  // Translate only (plus the diamond's fixed turn). Rounding to whole pixels keeps the ring off
  // half-pixel boundaries, where the compositor would resample the border and make a crisp 4px
  // stroke look soft. For the circle this is the very string the ring has always been given.
  if (shapeOn) ring.style.transform = ringTransform(geometry, latest, offset)
  // The crosshair follows the RAW point, not the shape's offset; a park sends it off screen.
  if (crossOn) {
    const t = crosshairTransforms(latest, crossWeight)
    crossV.style.transform = t.vertical
    crossH.style.transform = t.horizontal
  }
}

/** Ask for at most ONE frame. Calling this ten times between two frames costs nine boolean
 *  reads — that is the whole anti-backlog mechanism. */
function schedulePaint(): void {
  if (queued) return
  queued = true
  requestAnimationFrame(paint)
}

function onPoint(p: CursorPoint): void {
  latest = p
  schedulePaint()
}

const bridge = window.eqCursor
if (bridge) {
  void bridge.getConfig().then(applyConfig)
  bridge.onConfig(applyConfig)
  bridge.onPoint(onPoint)
}
