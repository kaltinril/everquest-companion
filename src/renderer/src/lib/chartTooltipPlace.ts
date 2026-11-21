// Where the shared chart tooltip goes on one axis. Pure, so it is unit-tested without a DOM
// (`tests/chartTooltipPlace.test.mts`).
//
// The card sits `off` px after the cursor. When that would run past `limit` (the window's
// width or height) it flips to the other side of the cursor. A card too big for either side is
// held at 0, so its start is always on screen.

export function place(cursor: number, size: number, off: number, limit: number): number {
  const after = cursor + off
  const pos = size > 0 && after + size > limit ? cursor - off - size : after
  return Math.max(0, pos)
}
