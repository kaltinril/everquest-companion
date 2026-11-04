// shared/respawnOverlayConfig.ts — the Respawn overlay's own knobs, riding `overlays.respawn`
// (OverlayConfig.respawn) the way the con card's and the toast's ride theirs: how the clocks are
// laid out and sorted, and whether the other places' clocks are folded away. Set from the overlay's
// own footer while it is unlocked (owner, 2026-11-03: a glyph in the overlay, not a Preferences
// trip; "screen real estate is expensive"), remembered like its position. Type-only imports, so
// shared/types.ts can name the type without a cycle.

import type { OverlayConfig, OverlayKind } from './types'

/** `rows`: a row per mob, the clock where you stand big, the other places under it. `grid`: mobs down, places across. */
export type RespawnOverlayLayout = 'rows' | 'grid'

/** `here`: the clock where you stand leads each row. `soon`: whichever place comes up next leads (layout D). */
export type RespawnOverlaySort = 'here' | 'soon'

export interface RespawnOverlayConfig {
  layout: RespawnOverlayLayout
  sort: RespawnOverlaySort
  /** The other places' clocks folded away (a grid's other columns, a row's other lines). */
  collapsed: boolean
}

export const DEFAULT_RESPAWN_OVERLAY_CONFIG: RespawnOverlayConfig = { layout: 'rows', sort: 'here', collapsed: false }

/** A stored blob, read back as a config: an unknown or missing field takes the default. */
export function normalizeRespawnOverlayConfig(raw: unknown): RespawnOverlayConfig {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    layout: o.layout === 'grid' ? 'grid' : 'rows',
    sort: o.sort === 'soon' ? 'soon' : 'here',
    collapsed: o.collapsed === true
  }
}

/** The store's reader and writer: the respawn kind carries the blob, normalized; no other kind grows one. */
export function applyRespawnOverlayKnobs(kind: OverlayKind, cfg: OverlayConfig): void {
  if (kind === 'respawn') cfg.respawn = normalizeRespawnOverlayConfig(cfg.respawn)
  else delete cfg.respawn
}
