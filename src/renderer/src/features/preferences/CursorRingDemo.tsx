// CursorRingDemo — the live sample on Preferences → Cursor ring: a drawn mouse arrow with the
// chosen shape around it, at the chosen X/Y offset (owner, 2026-11-26: "can we also control the
// offset, X/Y, with a demo showing the icon and mouse").
//
// The arrow's TIP is the pointer's hot spot, the point main samples and the ring window centres
// on, so the gap between the tip and the shape's centre is exactly the offset the game gets.
//
// The shape is drawn through the SAME seams as the ring window (`ringGeometry`, `ringBoxStyle`,
// `innerMarkStyle`, `ringStrokeColor`), so the sample shows what the game draws, not a second
// opinion. IT IS A SAMPLE, NOT A RULER (JOS-154): this card carries the app's text size and the
// ring window is pinned at zoom 1, so at 125% everything here is 25% larger than in the game; the
// numbers on the sliders are the real ones.
//
// The crosshair (2026-11-26) is drawn here too, through the same seams (`crosshairOf`,
// `crosshairLineStyles`): two lines through the arrow's tip, clipped to the box the way the game
// window clips them. They ignore the offset, as in the game.

import type { JSX } from 'react'
import type { CursorRingPrefs } from '@shared/presencePrefs'
import { ringStrokeColor } from '@shared/presencePrefs'
import { innerMarkStyle, ringBoxStyle, ringGeometry, ringOffset, shapeShown } from '@shared/cursorRingShape'
import { crosshairLineOffset, crosshairLineStyles, crosshairOf } from '@shared/cursorCrosshair'

/** cursor.html's three readability shadows, and the inner mark's two contours. */
const RING_SHADOW =
  '0 0 0 1px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.6), 0 0 14px 4px rgba(0,0,0,0.28)'
const INNER_SHADOW = '0 0 0 1px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.6)'
/** cursor.html's crosshair contour. */
const CROSS_SHADOW = '0 0 0 1px rgba(0,0,0,0.6)'

/** Clear space around the shape inside the demo box, px. */
const DEMO_PAD_PX = 16
/** The demo box never shrinks below this, so the arrow always has room. */
const DEMO_MIN_PX = 120

/** A plain arrow pointer, tip at (0, 0): white with a dark outline, like the system cursor. */
function PointerArrow(): JSX.Element {
  return (
    <svg
      width="14"
      height="21"
      viewBox="-1 -1 14 21"
      style={{ position: 'absolute', left: -1, top: -1, overflow: 'visible' }}
      aria-hidden="true"
    >
      <path
        d="M0 0 L0 16 L4 12.5 L6.8 18.6 L9 17.6 L6.3 11.6 L11.5 11.6 Z"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The two crosshair lines through the pointer at (`at`, `at`), or nothing when it is off. */
function DemoCrosshair({ prefs, at }: { prefs: CursorRingPrefs; at: number }): JSX.Element | null {
  const c = crosshairOf(prefs)
  if (!c.on) return null
  const styles = crosshairLineStyles(c)
  const edge = crosshairLineOffset(at, c.weightPx)
  const line = { position: 'absolute', boxShadow: CROSS_SHADOW } as const
  return (
    <>
      <div
        data-testid="pref-cursor-crosshair-preview"
        style={{ ...line, ...styles.vertical, left: edge, top: 0, height: '100%' }}
      />
      <div style={{ ...line, ...styles.horizontal, top: edge, left: 0, width: '100%' }} />
    </>
  )
}

export function CursorRingDemo({ prefs }: { prefs: CursorRingPrefs }): JSX.Element {
  const stroke = ringStrokeColor(prefs.colorHex)
  const g = ringGeometry(prefs)
  const off = ringOffset(prefs)
  // Big enough to hold the footprint at its offset on every side, so the box is centred on the
  // pointer and the shape never clips.
  const reach = Math.max(Math.abs(off.x), Math.abs(off.y)) + prefs.sizePx / 2 + DEMO_PAD_PX
  const box = Math.max(DEMO_MIN_PX, Math.ceil(reach * 2))
  const centre = box / 2
  return (
    <div
      data-testid="pref-cursor-ring-demo"
      style={{
        position: 'relative',
        width: box,
        height: box,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 8,
        background: 'rgba(128,128,128,0.18)'
      }}
    >
      <DemoCrosshair prefs={prefs} at={Math.round(centre)} />
      <div
        data-testid="pref-cursor-ring-preview"
        data-shape={prefs.shape}
        style={{
          display: shapeShown(prefs) ? undefined : 'none',
          ...ringBoxStyle(g, stroke),
          position: 'absolute',
          left: Math.round(centre + off.x - g.widthPx / 2),
          top: Math.round(centre + off.y - g.heightPx / 2),
          boxSizing: 'border-box',
          borderStyle: 'solid',
          boxShadow: RING_SHADOW,
          transform: g.rotateDeg === 0 ? undefined : `rotate(${g.rotateDeg}deg)`
        }}
      >
        {g.inner && (
          <div
            style={{
              ...innerMarkStyle(g.inner, stroke),
              position: 'absolute',
              boxSizing: 'border-box',
              borderRadius: '50%',
              borderStyle: 'solid',
              boxShadow: INNER_SHADOW
            }}
          />
        )}
      </div>
      {/* The pointer on top, as in the game: the system cursor is drawn over the ring window. */}
      <div style={{ position: 'absolute', left: Math.round(centre), top: Math.round(centre) }}>
        <PointerArrow />
      </div>
    </div>
  )
}
