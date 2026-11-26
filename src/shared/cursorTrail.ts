// cursorTrail.ts — the cursor overlay's TRAIL / PARTICLES as numbers (owner, 2026-11-26:
// "trail/particle affects").
//
// The overlay window draws them on one <canvas> (renderer/src/overlay/cursorTrailCanvas.ts); this
// module holds every rule that decides WHAT is drawn, with no DOM, so the node tests hold it:
//
//   * A pointer sample SPAWNS: one point for the trail, one to three specks for sparkles.
//   * A PARKED point (the pointer left the game) spawns nothing and CLEARS everything: a trail
//     must not draw a line from where the pointer left to where it comes back.
//   * THE LIVE COUNT IS CAPPED (`maxLive`): past it the OLDEST go first, so a fast mouse cannot
//     build a backlog, whatever rate the samples arrive at.
//   * EVERYTHING EXPIRES: each particle lives `life` ms from its birth, and its position is a
//     closed form of its age (no per-frame integration), so a frame that comes late, or a window
//     that was hidden for a minute, simply finds everything expired.
//   * `stepTrail` REPORTS IDLE when nothing is left, and the canvas stops its animation loop on
//     that answer. A still mouse sends no samples, so it costs nothing once the tail has faded.
//
// Time is whatever clock the caller passes (the overlay uses the animation-frame clock, which is
// `performance.now()`'s), in ms.

import { isParkedPoint } from './cursorCrosshair'
import { DEFAULT_TRAIL_LENGTH, MAX_TRAIL_LENGTH, MIN_TRAIL_LENGTH, normalizeTrailMode } from './presencePrefs'
import type { CursorPoint, CursorTrailMode } from './presencePrefs'

/** The trail line's width at birth, CSS px; it narrows as the point fades. */
export const TRAIL_WIDTH_PX = 4
/** The dark contour drawn around every mark, CSS px each side, so a white trail reads on snow. */
export const TRAIL_CONTOUR_PX = 1
/** The cap on live points (trail) and live specks (sparkles). */
export const TRAIL_MAX_LIVE = 96
export const SPARKLE_MAX_LIVE = 160
/** Sparkle physics: launch speed range (px/s), an upward kick (px/s) and gravity (px/s^2). */
const SPARK_MIN_SPEED = 20
const SPARK_MAX_SPEED = 90
const SPARK_LIFT = 30
export const SPARK_GRAVITY = 160
/** Sparkle size range, CSS px. */
const SPARK_MIN_SIZE = 2
const SPARK_MAX_SIZE = 4

/** One point of the trail or one speck. Immutable once spawned: its position is a function of age. */
export interface TrailParticle {
  x0: number
  y0: number
  /** Velocity, px/s (0 for a trail point). */
  vx: number
  vy: number
  /** Downward acceleration, px/s^2 (0 for a trail point). */
  g: number
  /** Birth time and lifetime, ms. */
  born: number
  life: number
  /** Width (trail) or side (speck), CSS px. */
  size: number
}

/** What a mode and length turn into. */
export interface TrailParams {
  lifeMs: number
  maxLive: number
  perSample: number
}

/** The live trail: the mode it was built for and its particles, oldest first. */
export interface TrailState {
  mode: CursorTrailMode
  length: number
  /** Null when the mode is `off`: nothing spawns and nothing is drawn. */
  params: TrailParams | null
  parts: TrailParticle[]
}

/** A length in [1, 10], whole, or the default for anything that is not a number. */
function lengthOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TRAIL_LENGTH
  return Math.min(MAX_TRAIL_LENGTH, Math.max(MIN_TRAIL_LENGTH, Math.round(value)))
}

/**
 * The lifetime, cap and spawn count for a mode at a length. Trail: each point lives 60 ms per
 * step of length (60 to 600 ms). Sparkles: 300 ms plus 50 per step, and one more speck per sample
 * at lengths 4 and 8.
 */
export function trailParams(mode: CursorTrailMode, length: number): TrailParams | null {
  if (mode === 'trail') return { lifeMs: 60 * length, maxLive: TRAIL_MAX_LIVE, perSample: 1 }
  if (mode === 'sparkles') {
    return { lifeMs: 300 + 50 * length, maxLive: SPARKLE_MAX_LIVE, perSample: 1 + Math.floor(length / 4) }
  }
  return null
}

/** A fresh, empty trail for the prefs. Takes `unknown`-safe fields: a config from an older main has
 *  neither, and that is `off`. */
export function createTrail(prefs: { trail?: unknown; trailLength?: unknown }): TrailState {
  const mode = normalizeTrailMode(prefs.trail)
  const length = lengthOf(prefs.trailLength)
  return { mode, length, params: trailParams(mode, length), parts: [] }
}

/** Does this config ask for a different trail than `s` is? (A size or colour change keeps the
 *  trail that is already fading.) */
export function trailChanged(s: TrailState, prefs: { trail?: unknown; trailLength?: unknown }): boolean {
  return s.mode !== normalizeTrailMode(prefs.trail) || s.length !== lengthOf(prefs.trailLength)
}

function speck(p: CursorPoint, now: number, lifeMs: number, rand: () => number): TrailParticle {
  const angle = rand() * 2 * Math.PI
  const speed = SPARK_MIN_SPEED + rand() * (SPARK_MAX_SPEED - SPARK_MIN_SPEED)
  return {
    x0: p.x,
    y0: p.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - SPARK_LIFT,
    g: SPARK_GRAVITY,
    born: now,
    life: Math.round(lifeMs * (0.7 + 0.3 * rand())),
    size: Math.round(SPARK_MIN_SIZE + rand() * (SPARK_MAX_SIZE - SPARK_MIN_SIZE))
  }
}

/**
 * Spawn for one pointer sample. A parked point clears the trail and spawns nothing; `off` does
 * nothing at all. Past the cap the oldest particles are dropped. Mutates `s` (the overlay keeps
 * one state and spawns at up to 125 Hz; a copy per sample would be garbage for nothing).
 */
export function spawnTrail(s: TrailState, p: CursorPoint, now: number, rand: () => number = Math.random): void {
  const params = s.params
  if (!params) return
  if (isParkedPoint(p)) {
    s.parts.length = 0
    return
  }
  for (let i = 0; i < params.perSample; i++) {
    s.parts.push(
      s.mode === 'sparkles'
        ? speck(p, now, params.lifeMs, rand)
        : { x0: p.x, y0: p.y, vx: 0, vy: 0, g: 0, born: now, life: params.lifeMs, size: TRAIL_WIDTH_PX }
    )
  }
  const excess = s.parts.length - params.maxLive
  if (excess > 0) s.parts.splice(0, excess)
}

/** Drop every particle that has lived its life by `now`. Returns whether anything is left: false
 *  is IDLE, and the canvas stops its loop on it. Keeps the survivors in birth order. */
export function stepTrail(s: TrailState, now: number): boolean {
  const parts = s.parts
  let keep = 0
  for (const part of parts) {
    if (now - part.born < part.life) parts[keep++] = part
  }
  parts.length = keep
  return keep > 0
}

/** Where a particle is and how strongly it shows at `now`. */
export interface ParticleView {
  x: number
  y: number
  /** 1 at birth, falling to 0 at the end of its life. */
  alpha: number
  size: number
}

/** A particle at `now`, written into `out` (the draw loop reuses one, so a frame allocates
 *  nothing). A particle born after `now` (spawned after the frame began) is drawn at birth. */
export function viewOf(part: TrailParticle, now: number, out: ParticleView): ParticleView {
  const age = Math.max(0, now - part.born)
  const t = age / 1000
  out.x = part.x0 + part.vx * t
  out.y = part.y0 + part.vy * t + 0.5 * part.g * t * t
  out.alpha = Math.max(0, 1 - age / part.life)
  out.size = part.size
  return out
}

/** A box in CSS px. */
export interface TrailRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The box that holds everything drawn at `now`, padded for the widest mark, its contour and the
 * antialiasing, in whole px; null when nothing is live. The canvas clears only this box on the next
 * frame, so a short trail on a 4K window does not wipe four million pixels sixty times a second.
 */
export function trailBounds(s: TrailState, now: number): TrailRect | null {
  if (s.parts.length === 0) return null
  const v: ParticleView = { x: 0, y: 0, alpha: 0, size: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let widest = 0
  for (const part of s.parts) {
    viewOf(part, now, v)
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
    widest = Math.max(widest, v.size)
  }
  const pad = widest / 2 + TRAIL_CONTOUR_PX + 2
  const x = Math.floor(minX - pad)
  const y = Math.floor(minY - pad)
  return { x, y, w: Math.ceil(maxX + pad) - x, h: Math.ceil(maxY + pad) - y }
}
