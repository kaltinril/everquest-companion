// respawnOverlayGrid.tsx — the Respawn overlay's GRID layout: tracked mobs down, this zone's places
// across (the open tiers, your private instance), one short clock per cell, so the column with the
// most green is where to go (owner, 2026-11-03, layout A). The column you stand in is blue and
// always drawn; any other column folds away to NOTHING (owner: "0 width") on a click of its
// header, and all of them behind the footer's fold glyph. A locked window draws the same grid with
// nothing to click. The columns are `respawnVisiblePlaces`', the cells `respawnCellOf`'s.

import type { JSX } from 'react'
import { respawnReading } from '@shared/respawn'
import { respawnCellLabel, respawnCellOf, type RespawnPlace, type RespawnTierGroup } from '@shared/respawnTiers'
import { DIM, DUE, HERE, STALE, toneOf } from './respawnOverlayTone'
import { UnwatchButton } from './respawnOverlayRows'

const CELL: React.CSSProperties = { padding: '2px 5px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, fontWeight: 700 }
const HERE_BG = 'rgba(142,197,255,0.07)'

function PlaceHeader({ place, here, onHide }: { place: RespawnPlace; here: boolean; onHide: (() => void) | undefined }): JSX.Element {
  const style: React.CSSProperties = {
    fontWeight: 500,
    color: here ? HERE : DIM,
    fontSize: 10,
    textAlign: 'right',
    padding: '0 5px 3px',
    whiteSpace: 'nowrap',
    background: here ? HERE_BG : undefined
  }
  if (onHide === undefined) {
    return (
      <th scope="col" data-testid="respawn-overlay-column" data-respawn-place={place.tag} style={style}>
        {place.tag}
      </th>
    )
  }
  return (
    <th scope="col" data-testid="respawn-overlay-column" data-respawn-place={place.tag} style={{ ...style, padding: 0 }}>
      <button
        type="button"
        aria-label={`Hide the ${place.tag} column`}
        onClick={onHide}
        style={{ ...style, background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
      >
        {place.tag}
      </button>
    </th>
  )
}

function Cell({ group, place, here, nowMs }: { group: RespawnTierGroup; place: RespawnPlace; here: boolean; nowMs: number }): JSX.Element {
  const entry = respawnCellOf(group, place)
  const bg = here ? HERE_BG : undefined
  if (entry === undefined) {
    const up = here && group.hereState === 'up'
    return (
      <td data-testid="respawn-overlay-cell" data-respawn-place={place.tag} data-respawn-state={up ? 'up' : 'none'} style={{ ...CELL, color: up ? DUE : STALE, fontWeight: up ? 700 : 500, background: bg }}>
        {up ? 'up' : group.hereState === 'noRespawn' && here ? 'no respawn' : '-'}
      </td>
    )
  }
  const r = respawnReading(entry.row, nowMs)
  return (
    <td data-testid="respawn-overlay-cell" data-respawn-place={place.tag} data-respawn-due={r.due ? 'true' : 'false'} data-respawn-seen={r.seen ? 'true' : 'false'} style={{ ...CELL, color: toneOf(r), background: bg }}>
      {respawnCellLabel(entry.row, nowMs)}
    </td>
  )
}

export function GridLayout({
  groups,
  places,
  hereTag,
  nowMs,
  interactive,
  onHidePlace,
  onUnwatch
}: {
  groups: readonly RespawnTierGroup[]
  /** The columns, folding already applied (`respawnVisiblePlaces`). */
  places: readonly RespawnPlace[]
  hereTag: string | undefined
  nowMs: number
  interactive: boolean
  onHidePlace: (tag: string) => void
  onUnwatch: (key: string) => void
}): JSX.Element {
  return (
    <table data-testid="respawn-overlay-grid" style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th scope="col" style={{ fontWeight: 500, color: DIM, fontSize: 10, textAlign: 'left', padding: '0 5px 3px' }}>
            mob
          </th>
          {places.map((p) => (
            <PlaceHeader
              key={p.tag}
              place={p}
              here={p.tag === hereTag}
              onHide={
                interactive && p.tag !== hereTag
                  ? () => {
                      onHidePlace(p.tag)
                    }
                  : undefined
              }
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.key} data-testid="respawn-overlay-grid-row" data-respawn-mob={g.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '2px 5px', fontSize: 11.5, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.display}</span>
                {interactive && <UnwatchButton display={g.display} mobKey={g.key} onUnwatch={onUnwatch} />}
              </span>
            </td>
            {places.map((p) => (
              <Cell key={p.tag} group={g} place={p} here={p.tag === hereTag} nowMs={nowMs} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
