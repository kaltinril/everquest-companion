// respawnOverlayTone.ts — the Respawn overlay's colours, one place for its three files: the
// accent (a clock running), due, seen (UP), stale, overridden, and the blue that marks the place
// you stand in across this zone's others (owner, 2026-11-03).

import type { RespawnReading } from '@shared/respawn'

export const ACCENT = '#e8b45f'
export const ACCENT_BG = 'rgba(232,180,95,0.2)'
export const DUE = '#7fd18b'
export const SEEN = '#ff6b8a'
export const STALE = 'rgba(255,255,255,0.38)'
export const OVERRIDDEN = '#c3aef5'
export const HERE = '#8ec5ff'
export const DIM = 'rgba(255,255,255,0.55)'

/** The colour a clock reads in: UP, stale, due, or running. */
export function toneOf(r: RespawnReading): string {
  return r.seen ? SEEN : r.stale ? STALE : r.due ? DUE : ACCENT
}
