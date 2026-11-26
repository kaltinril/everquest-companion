// cursorTrailCanvas.ts — draws the cursor overlay's trail / sparkles on the one <canvas> in
// cursor.html (owner, 2026-11-26: "trail/particle affects"). Plain DOM, like cursorRing.ts, which
// owns it; every rule about what is drawn lives in `shared/cursorTrail.ts`.
//
// THE CONTRACT (cursorRing.ts's PERFORMANCE CONTRACT, rule 5, says it in one place):
//   * OFF IS NOTHING. The canvas is hidden, no 2D context is even asked for until the trail is
//     first turned on, and `point()` returns on its first line.
//   * ON, A SAMPLE SPAWNS AND ASKS FOR FRAMES; THE LOOP STOPS ITSELF. One requestAnimationFrame
//     loop runs while anything is live and ends on the frame `stepTrail` reports idle, so a still
//     mouse costs nothing once the tail has faded. The live count is capped in the shared module.
//   * EACH FRAME CLEARS ONLY WHAT THE LAST ONE DREW (`trailBounds`), never the whole window.
//   * The canvas backing store is the window's CSS size times devicePixelRatio, re-fitted on a
//     resize and checked again each time the loop starts (a move to a monitor with another scale).

import type { CursorPoint, CursorRingPrefs } from '@shared/presencePrefs'
import { ringStrokeColor } from '@shared/presencePrefs'
import {
  TRAIL_CONTOUR_PX,
  createTrail,
  spawnTrail,
  stepTrail,
  trailBounds,
  trailChanged,
  viewOf
} from '@shared/cursorTrail'
import type { ParticleView, TrailRect, TrailState } from '@shared/cursorTrail'

/** The contour's strength against the mark's own alpha (cursor.html's rgba(0,0,0,0.6)). */
const CONTOUR_ALPHA = 0.6

export interface TrailPainter {
  /** Take a new config: mode, length, colour. Cheap when nothing about the trail changed. */
  configure: (cfg: CursorRingPrefs) => void
  /** One pointer sample. Does nothing while the trail is off. */
  point: (p: CursorPoint) => void
}

export function createTrailPainter(canvas: HTMLCanvasElement): TrailPainter {
  let ctx: CanvasRenderingContext2D | null = null
  let state: TrailState = createTrail({})
  let color = ringStrokeColor('')
  let running = false
  let dirty: TrailRect | null = null
  let fitted = { w: 0, h: 0, dpr: 0 }
  const a: ParticleView = { x: 0, y: 0, alpha: 0, size: 0 }
  const b: ParticleView = { x: 0, y: 0, alpha: 0, size: 0 }

  /** Size the backing store to the window, if it is not already. Resizing clears the bitmap. */
  function fit(): void {
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    if (!ctx || (w === fitted.w && h === fitted.h && dpr === fitted.dpr)) return
    fitted = { w, h, dpr }
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    dirty = null
  }

  function clearDirty(): void {
    if (ctx && dirty) ctx.clearRect(dirty.x, dirty.y, dirty.w, dirty.h)
    dirty = null
  }

  /** The trail: a line through the points, oldest first, fading and narrowing with age. Two
   *  passes, the dark contour under the colour. */
  function drawLine(c: CanvasRenderingContext2D, now: number): void {
    const parts = state.parts
    c.lineCap = 'round'
    for (const contour of [true, false]) {
      c.strokeStyle = contour ? '#000000' : color
      for (let i = 1; i < parts.length; i++) {
        viewOf(parts[i - 1], now, a)
        viewOf(parts[i], now, b)
        const width = Math.max(1, b.size * b.alpha)
        c.globalAlpha = contour ? b.alpha * CONTOUR_ALPHA : b.alpha
        c.lineWidth = contour ? width + 2 * TRAIL_CONTOUR_PX : width
        c.beginPath()
        c.moveTo(a.x, a.y)
        c.lineTo(b.x, b.y)
        c.stroke()
      }
    }
  }

  /** Sparkles: little squares, each over a dark square one contour wider. */
  function drawSpecks(c: CanvasRenderingContext2D, now: number): void {
    for (const part of state.parts) {
      viewOf(part, now, a)
      const half = a.size / 2
      c.globalAlpha = a.alpha * CONTOUR_ALPHA
      c.fillStyle = '#000000'
      c.fillRect(a.x - half - TRAIL_CONTOUR_PX, a.y - half - TRAIL_CONTOUR_PX, a.size + 2, a.size + 2)
      c.globalAlpha = a.alpha
      c.fillStyle = color
      c.fillRect(a.x - half, a.y - half, a.size, a.size)
    }
  }

  function frame(now: number): void {
    clearDirty()
    if (!ctx || !state.params || !stepTrail(state, now)) {
      running = false
      return
    }
    if (state.mode === 'sparkles') drawSpecks(ctx, now)
    else drawLine(ctx, now)
    ctx.globalAlpha = 1
    dirty = trailBounds(state, now)
    requestAnimationFrame(frame)
  }

  function start(): void {
    if (running) return
    running = true
    fit()
    requestAnimationFrame(frame)
  }

  window.addEventListener('resize', () => {
    if (state.params) fit()
  })

  return {
    configure(cfg) {
      color = ringStrokeColor(cfg.colorHex)
      if (!trailChanged(state, cfg)) return
      clearDirty()
      state = createTrail(cfg)
      canvas.style.display = state.params ? 'block' : 'none'
      if (state.params && !ctx) ctx = canvas.getContext('2d')
      if (state.params) fit()
    },
    point(p) {
      if (!state.params) return
      spawnTrail(state, p, performance.now())
      if (state.parts.length > 0) start()
    }
  }
}
