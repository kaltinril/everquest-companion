// The ONE cursor-following tooltip every chart hover layer renders (combat timeline, DPS
// curve, leveling charts). Promoted from the timeline's private `HoverCard`.
//
// Plain <div> + inline styles rather than MUI Box/Typography, deliberately: this renders on a
// pointermove path and emotion serializes its styles on every render, an MUI Tooltip is
// anchor-bound (it would mount a Popper + portal per mark rather than follow the cursor), and
// a MUI-free primitive stays usable from the overlay bundle, which may not import MUI.
//
// Positioning is a MEASURED flip, not a guess: the card is offset from the cursor and flips to
// the other side when it would leave the window. The card it replaced clamped X against a
// hardcoded 170px width estimate, so a wide row ran off the right edge.
//
// The card is drawn in a portal on <body>, fixed to the window (2026-11-20). Drawn inside the
// chart it was cut off by any scrolling ancestor: at 125% text the dashboard's DPS card shows
// 86 px of a 118 px plot, and the readout below the fold could not be read. A zero-size anchor
// stays in the hover layer, so the caller's x/y keep their meaning (px from the layer's
// positioned ancestor); the anchor's place in the window is read after each render.

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { place } from './chartTooltipPlace'

export interface TooltipRow {
  /** dim, left. Absent ⇒ `value` is the whole line. */
  label?: string
  /** bright, right (or the whole line when label is absent). */
  value: string
  /** value tint (category color, RESIST_COLOR, marker color). */
  color?: string
}

export interface ChartTooltipModel {
  /** cursor position in CSS px, relative to the tooltip's positioned ancestor. */
  x: number
  y: number
  title: string
  /** optional dim second-rank line under the title (e.g. "You · 1:04"). */
  subtitle?: string
  rows: TooltipRow[]
  /** honesty footer, rendered dim + italic ("5s rolling · ~ estimated"). */
  note?: string
}

/** Cursor offset on each axis. */
const OFF_X = 10
const OFF_Y = 12

const ANCHOR: CSSProperties = { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none' }

const CARD: CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  // Over the app's dialogs and menus (MUI's tooltip layer is 1500), since a chart can sit in one.
  zIndex: 1500,
  maxWidth: 280,
  boxSizing: 'border-box',
  padding: '3px 6px',
  borderRadius: 3,
  background: 'rgba(20,20,24,0.96)',
  border: '1px solid rgba(255,255,255,0.15)',
  fontFamily: 'inherit',
  fontSize: 12,
  lineHeight: 1.5
}
const TITLE: CSSProperties = { color: '#f0f0f0', fontWeight: 600, whiteSpace: 'nowrap' }
const SUBTITLE: CSSProperties = { color: '#9aa0aa', whiteSpace: 'nowrap' }
const ROW: CSSProperties = { display: 'flex', gap: 10, justifyContent: 'space-between', whiteSpace: 'nowrap' }
const ROW_LABEL: CSSProperties = { color: '#9aa0aa' }
const ROW_VALUE: CSSProperties = { color: '#dcdcdc' }
const NOTE: CSSProperties = { color: '#7c828c', fontStyle: 'italic', whiteSpace: 'nowrap', marginTop: 2 }

/** Everything that changes the card's SIZE — measuring on this instead of on every move keeps
 *  the layout read off the pointer path. */
function contentKey(m: ChartTooltipModel): string {
  const rows = m.rows.map((r) => `${r.label ?? ''}${r.value}`).join('')
  return `${m.title}${m.subtitle ?? ''}${rows}${m.note ?? ''}`
}

export function ChartTooltip(m: ChartTooltipModel): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // The hover layer's origin in the window. Null until the first read: the card is hidden for
  // that one render, which never reaches the screen (a layout effect runs before paint).
  const [origin, setOrigin] = useState<{ left: number; top: number } | null>(null)
  const key = contentKey(m)

  // Read on every pointer move and content change, because the chart can have scrolled or moved
  // since the last one. One rect read, and state changes only when the origin really moved.
  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setOrigin((o) => (o !== null && Math.abs(o.left - r.left) < 0.5 && Math.abs(o.top - r.top) < 0.5 ? o : { left: r.left, top: r.top }))
  }, [m.x, m.y, key])

  // Measure once per content change (a move never re-measures). Layout effect so the first
  // paint after a content change is already placed — a measure in useEffect would show one
  // frame of the un-flipped position.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }))
  }, [key])

  const style: CSSProperties =
    origin === null
      ? { ...CARD, left: 0, top: 0, visibility: 'hidden' }
      : {
          ...CARD,
          left: place(origin.left + m.x, size.w, OFF_X, window.innerWidth),
          top: place(origin.top + m.y, size.h, OFF_Y, window.innerHeight)
        }
  const card = (
    <div ref={ref} style={style} data-testid="chart-tooltip">
      <div style={TITLE}>{m.title}</div>
      {m.subtitle != null && <div style={SUBTITLE}>{m.subtitle}</div>}
      {m.rows.map((r, i) => (
        <div key={i} style={ROW}>
          {r.label != null && <span style={ROW_LABEL}>{r.label}</span>}
          <span style={r.color != null ? { ...ROW_VALUE, color: r.color } : ROW_VALUE}>{r.value}</span>
        </div>
      ))}
      {m.note != null && <div style={NOTE}>{m.note}</div>}
    </div>
  )
  return (
    <>
      <span ref={anchorRef} style={ANCHOR} />
      {createPortal(card, document.body)}
    </>
  )
}
