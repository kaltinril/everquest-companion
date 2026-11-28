// useOverviewGrid — the Overview grid's two pieces of screen state: how many columns the page has
// room for, and the card being dragged in Edit layout. The maths (columns for a width, which slot
// a pointer is over, the reorder) is pure, in shared/overviewLayout.ts; this file only measures.
//
// THE DRAG IS POINTER EVENTS, not HTML5 drag and drop: the handle takes pointer capture on press,
// so every move and the release come back to it wherever the pointer goes, and nothing on a card
// can be dragged at all outside Edit layout (the handle is not drawn then).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import {
  overviewColumnsFor,
  overviewDropChanges,
  overviewDropSlot,
  isOverviewWidgetId,
  type OverviewCardRect,
  type OverviewDropSlot,
  type OverviewLayout,
  type OverviewWidgetId
} from '@shared/overviewLayout'

/**
 * The columns the page has room for, from the measured width of `ref`. Read synchronously in a
 * layout effect as well as observed: a hidden window can be slow to deliver ResizeObserver
 * callbacks (useMapViewport.ts), and the window's own resize event covers the rest.
 */
export function useOverviewColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(4)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      setColumns(overviewColumnsFor(el.getBoundingClientRect().width))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return columns
}

export interface OverviewDragState {
  id: OverviewWidgetId
  x: number
  y: number
  /** Where a release would put it; null over its own place or anywhere that changes nothing. */
  slot: OverviewDropSlot | null
}

export interface OverviewDrag {
  drag: OverviewDragState | null
  /** The four pointer handlers a card's drag handle wears. */
  handleProps: (id: OverviewWidgetId) => {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onPointerMove: (e: PointerEvent<HTMLElement>) => void
    onPointerUp: (e: PointerEvent<HTMLElement>) => void
    onPointerCancel: () => void
  }
  cancel: () => void
}

/** Near the grid's top or bottom edge a drag scrolls it, so a card can travel past the fold. */
const EDGE_PX = 40
const EDGE_STEP_PX = 16

function cardRects(grid: HTMLElement): OverviewCardRect[] {
  const out: OverviewCardRect[] = []
  for (const el of grid.querySelectorAll<HTMLElement>(':scope > [data-overview-widget]')) {
    const id = el.dataset.overviewWidget
    if (!isOverviewWidgetId(id)) continue
    const r = el.getBoundingClientRect()
    out.push({ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom })
  }
  return out
}

function edgeScroll(grid: HTMLElement, y: number): void {
  const r = grid.getBoundingClientRect()
  if (y < r.top + EDGE_PX) grid.scrollTop -= EDGE_STEP_PX
  else if (y > r.bottom - EDGE_PX) grid.scrollTop += EDGE_STEP_PX
}

export function useOverviewDrag(
  gridRef: RefObject<HTMLElement | null>,
  layout: OverviewLayout | null,
  onDrop: (id: OverviewWidgetId, slot: OverviewDropSlot) => void
): OverviewDrag {
  const [drag, setDrag] = useState<OverviewDragState | null>(null)
  // The live value for the handlers, so a release reads the slot the last move computed.
  const live = useRef<OverviewDragState | null>(null)
  const put = useCallback((next: OverviewDragState | null) => {
    live.current = next
    setDrag(next)
  }, [])
  const cancel = useCallback(() => {
    put(null)
  }, [put])

  // A pointer held still near the grid's top or bottom keeps scrolling it.
  const active = drag !== null
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      const grid = gridRef.current
      if (grid && live.current) edgeScroll(grid, live.current.y)
    }, 50)
    return () => {
      window.clearInterval(timer)
    }
  }, [active, gridRef])

  const handleProps = useCallback(
    (id: OverviewWidgetId) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        put({ id, x: e.clientX, y: e.clientY, slot: null })
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const grid = gridRef.current
        if (live.current?.id !== id || !grid || !layout) return
        const point = { x: e.clientX, y: e.clientY }
        const slot = overviewDropSlot(cardRects(grid), point, id)
        put({ id, ...point, slot: slot && overviewDropChanges(layout, id, slot) ? slot : null })
      },
      onPointerUp: () => {
        const was = live.current
        put(null)
        if (was?.id === id && was.slot) onDrop(id, was.slot)
      },
      onPointerCancel: cancel
    }),
    [gridRef, layout, onDrop, put, cancel]
  )

  return { drag, handleProps, cancel }
}
