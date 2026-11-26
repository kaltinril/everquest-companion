// CursorDrawingGrid — the drawing grid of Preferences → Cursor overlay (owner, 2026-11-26: "a simple
// quick NxN grid they can draw on like paint").
//
// An N x N grid (8, 12, 16, 24 or 32 cells a side) on one <canvas>: click or drag to paint in the
// brush colour, right-click (or the eraser) to clear a cell. Save renders the grid ONE PIXEL PER
// CELL to a PNG data URL and hands it back with the grid, so the card stores both: the PNG is the
// picture the overlay draws (crisp, `image-rendering: pixelated`, cursorPicture.ts), the grid is
// what Edit reopens. The same `imageDataUrl` an upload fills, so the overlay never knows which.
//
// One canvas, not N*N elements: a 32-grid drag would otherwise re-render a thousand cells per move.

import { type JSX, type PointerEvent, useEffect, useRef, useState } from 'react'
import { Button, MenuItem, Select, Stack, ToggleButton, Typography } from '@mui/material'
import { type CursorDrawing, DRAWING_SIZES, normalizeRingColor } from '@shared/presencePrefs'
import { drawingIsBlank, gridCellAt, resizeDrawing } from '@shared/cursorPicture'

/** The editor's width on screen, px; each cell gets a whole number of them. */
const GRID_PX = 256
/** The empty-cell checkerboard, so a transparent cell reads as "nothing here". */
const CHECK_A = '#3a3a3a'
const CHECK_B = '#2a2a2a'
const GRID_LINE = 'rgba(255,255,255,0.08)'

/** The drawing as a PNG data URL, one pixel per cell, transparent where empty. '' when blank. */
export function drawingToPng(d: CursorDrawing): string {
  if (drawingIsBlank(d)) return ''
  const canvas = document.createElement('canvas')
  canvas.width = d.n
  canvas.height = d.n
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  d.cells.forEach((c, i) => {
    if (c === '') return
    ctx.fillStyle = c
    ctx.fillRect(i % d.n, Math.floor(i / d.n), 1, 1)
  })
  return canvas.toDataURL('image/png')
}

/** Paint the editor canvas: checkerboard, cells, faint grid lines. */
function paintGrid(canvas: HTMLCanvasElement, d: CursorDrawing, cellPx: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  d.cells.forEach((c, i) => {
    const x = i % d.n
    const y = Math.floor(i / d.n)
    ctx.fillStyle = c !== '' ? c : (x + y) % 2 === 0 ? CHECK_A : CHECK_B
    ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx)
  })
  ctx.fillStyle = GRID_LINE
  for (let k = 1; k < d.n; k++) {
    ctx.fillRect(k * cellPx, 0, 1, d.n * cellPx)
    ctx.fillRect(0, k * cellPx, d.n * cellPx, 1)
  }
}

/** The grid size picker and the brush: colour, eraser, Clear. */
function GridTools({
  n,
  brush,
  eraser,
  onSize,
  onBrush,
  onEraser,
  onClear
}: {
  n: number
  brush: string
  eraser: boolean
  onSize: (n: number) => void
  onBrush: (c: string) => void
  onEraser: (on: boolean) => void
  onClear: () => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <Select
        size="small"
        data-testid="pref-cursor-draw-size"
        value={n}
        onChange={(e) => onSize(e.target.value)}
        sx={{ width: 110 }}
      >
        {DRAWING_SIZES.map((s) => (
          <MenuItem key={s} value={s}>
            {s} x {s}
          </MenuItem>
        ))}
      </Select>
      <input
        type="color"
        aria-label="Brush color"
        data-testid="pref-cursor-draw-color"
        value={brush}
        onChange={(e) => onBrush(normalizeRingColor(e.target.value))}
        style={{ width: 40, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
      />
      <ToggleButton
        size="small"
        value="eraser"
        selected={eraser}
        data-testid="pref-cursor-draw-eraser"
        onChange={() => onEraser(!eraser)}
      >
        Eraser
      </ToggleButton>
      <Button size="small" onClick={onClear}>
        Clear
      </Button>
    </Stack>
  )
}

export function CursorDrawingGrid({
  initial,
  onSave,
  onClose
}: {
  initial: CursorDrawing
  onSave: (drawing: CursorDrawing, png: string) => void
  onClose: () => void
}): JSX.Element {
  const [drawing, setDrawing] = useState<CursorDrawing>(initial)
  const [brush, setBrush] = useState('#ffffff')
  const [eraser, setEraser] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** While a button is held: the colour that drag lays down ('' erases), else null. */
  const stroke = useRef<string | null>(null)
  const cellPx = Math.floor(GRID_PX / drawing.n)

  useEffect(() => {
    if (canvasRef.current) paintGrid(canvasRef.current, drawing, cellPx)
  }, [drawing, cellPx])

  const paintAt = (e: PointerEvent<HTMLCanvasElement>): void => {
    const colour = stroke.current
    if (colour === null) return
    const r = e.currentTarget.getBoundingClientRect()
    const i = gridCellAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, drawing.n)
    if (i === null) return
    setDrawing((d) => {
      if (d.cells[i] === colour) return d
      const cells = d.cells.slice()
      cells[i] = colour
      return { n: d.n, cells }
    })
  }

  return (
    <Stack spacing={1} data-testid="pref-cursor-draw">
      <GridTools
        n={drawing.n}
        brush={brush}
        eraser={eraser}
        onSize={(n) => setDrawing((d) => resizeDrawing(d, n))}
        onBrush={setBrush}
        onEraser={setEraser}
        onClear={() => setDrawing((d) => resizeDrawing({ n: d.n, cells: [] }, d.n))}
      />
      <canvas
        ref={canvasRef}
        data-testid="pref-cursor-draw-canvas"
        width={drawing.n * cellPx}
        height={drawing.n * cellPx}
        style={{ width: drawing.n * cellPx, height: drawing.n * cellPx, cursor: 'crosshair', touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          stroke.current = eraser || e.button === 2 ? '' : brush
          paintAt(e)
        }}
        onPointerMove={paintAt}
        onPointerUp={() => {
          stroke.current = null
        }}
        onPointerCancel={() => {
          stroke.current = null
        }}
      />
      <Typography variant="caption" color="text.secondary">
        Click or drag to paint; right-click or the eraser clears a cell. Empty cells are see-through.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          data-testid="pref-cursor-draw-save"
          onClick={() => onSave(drawing, drawingToPng(drawing))}
        >
          Save
        </Button>
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}
