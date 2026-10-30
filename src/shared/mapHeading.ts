// mapHeading.ts — which way you were going, from the last two positions the map holds (owner,
// 2026-10-29, the competitor scan's heading arrow). Pure.
//
// Points are in map-file units (mapGeometry.ts `mapFromLoc`): x grows to the right of the drawn
// map and y grows downward, the screen's own axes, so a bearing here is a bearing on screen at any
// zoom (the projection is one scale and a shift, no rotation).

export interface MapXY {
  x: number
  y: number
}

/** Moves shorter than this (map units) are standing still: /loc prints two decimals. */
const STILL = 0.01

/**
 * Degrees clockwise from the top of the map, [0, 360), for travel from `from` to `to`; null when
 * there is no earlier position or the two are the same spot (no arrow, the plain marker).
 */
export function headingDeg(from: MapXY | null, to: MapXY | null): number | null {
  if (from == null || to == null) return null
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.hypot(dx, dy) < STILL) return null
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (deg + 360) % 360
}
