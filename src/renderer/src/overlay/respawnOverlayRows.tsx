// respawnOverlayRows.tsx — the Respawn overlay's ROWS layout: a row per tracked mob, the clock
// where you stand big (bar, UP line, rung, buttons: the row this window has drawn since JOS-194),
// and under it this zone's other places (open tiers, your private instance) as one small line
// each, soonest up first (owner, 2026-11-03, layout B). The ⇅ sort makes it layout D: the soonest
// place leads instead, tagged, and where you stand drops into the list. A row's other places fold
// away behind a chevron, and all of them behind the footer's fold glyph; a locked window draws the
// same rows with nothing to click (owner: "let them LOCK it").
//
// The rows are `respawnRowPlan`'s; nothing here decides which clock leads. MUI-free, like every
// file in this bundle.

import type { JSX } from 'react'
import {
  RESPAWN_CONFIRM_TITLE,
  RESPAWN_UNWATCH_LABEL,
  respawnBasisLabel,
  respawnClockLabel,
  respawnDurationText,
  respawnOverridden,
  respawnReading,
  respawnSeenLabel,
  respawnSourceLabel,
  type RespawnRow
} from '@shared/respawn'
import type { RespawnOverlaySort } from '@shared/respawnOverlayConfig'
import { respawnRowPlan, type RespawnHereState, type RespawnTierEntry, type RespawnTierGroup } from '@shared/respawnTiers'
import { fmtDuration } from '../features/buffs/format'
import { DIM, DUE, HERE, OVERRIDDEN, SEEN, STALE, toneOf } from './respawnOverlayTone'

const SMALL_BUTTON: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 9,
  lineHeight: 1.4,
  padding: '0 4px',
  background: 'transparent',
  borderRadius: 3,
  cursor: 'pointer'
}

function SeenLine({
  row,
  nowMs,
  interactive,
  onConfirm
}: {
  row: RespawnRow
  nowMs: number
  interactive: boolean
  onConfirm: (rowId: string) => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
      <span data-testid="respawn-overlay-seen" style={{ fontSize: 9, color: SEEN, flexGrow: 1, minWidth: 0 }}>
        {respawnSeenLabel(row, nowMs, fmtDuration)}
      </span>
      {interactive && (
        <button
          type="button"
          data-testid="respawn-overlay-confirm"
          aria-label={RESPAWN_CONFIRM_TITLE}
          onClick={() => {
            onConfirm(row.id)
          }}
          style={{ ...SMALL_BUTTON, color: SEEN, border: `1px solid ${SEEN}66` }}
        >
          start clock here
        </button>
      )}
    </div>
  )
}

export function UnwatchButton({ display, mobKey, onUnwatch }: { display: string; mobKey: string; onUnwatch: (key: string) => void }): JSX.Element {
  return (
    <button
      type="button"
      data-testid="respawn-overlay-unwatch"
      aria-label={`${RESPAWN_UNWATCH_LABEL} ${display}`}
      onClick={() => {
        onUnwatch(mobKey)
      }}
      style={{ ...SMALL_BUTTON, color: DIM, border: '1px solid rgba(255,255,255,0.18)' }}
    >
      {RESPAWN_UNWATCH_LABEL.toLowerCase()}
    </button>
  )
}

/** The name, an optional place tag (layout D, a clock from another place leading), and the big clock. */
function ClockLine({
  display,
  tag,
  label,
  tone,
  button
}: {
  display: string
  tag?: string | undefined
  label: string
  tone: string
  button: JSX.Element | null
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 11.5, flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {display}
      </span>
      {tag !== undefined && (
        <span data-testid="respawn-overlay-lead-place" style={{ fontSize: 9.5, color: DIM, flexShrink: 0 }}>
          {tag}
        </span>
      )}
      <span
        data-testid="respawn-overlay-clock"
        style={{ fontSize: 13, fontWeight: 700, color: tone, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
      >
        {label}
      </span>
      {/* After the number, so the countdown keeps its place on every row. */}
      {button}
    </div>
  )
}

function RungLine({ row }: { row: RespawnRow }): JSX.Element {
  const basis = respawnBasisLabel(row)
  const over = respawnOverridden(row)
  return (
    <div data-testid="respawn-overlay-rung" style={{ fontSize: 9, color: over ? OVERRIDDEN : 'rgba(255,255,255,0.42)', marginTop: 1 }}>
      {respawnDurationText(row, fmtDuration)} · {respawnSourceLabel(row)}
      {basis.length > 0 ? ` · ${basis}` : ''}
    </div>
  )
}

/** One small line for another place: its tag, its clock. */
function PlaceLine({ entry, nowMs }: { entry: RespawnTierEntry; nowMs: number }): JSX.Element {
  const r = respawnReading(entry.row, nowMs)
  return (
    <div data-testid="respawn-overlay-place" data-respawn-place={entry.place.tag} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 10 }}>
      <span style={{ color: entry.here ? HERE : DIM, fontVariantNumeric: 'tabular-nums', minWidth: 50 }}>{entry.place.tag}</span>
      <span style={{ color: toneOf(r), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {respawnClockLabel(entry.row, nowMs, fmtDuration)}
      </span>
    </div>
  )
}

/** The other places under a row: the lines, or, folded, one line with the soonest of them. */
function PlacesBlock({
  entries,
  folded,
  onFold,
  nowMs
}: {
  entries: readonly RespawnTierEntry[]
  folded: boolean
  /** Absent while the window is locked: nothing to click. */
  onFold: (() => void) | undefined
  nowMs: number
}): JSX.Element | null {
  const first = entries[0]
  if (first === undefined) return null
  const n = entries.length
  const toggleStyle: React.CSSProperties = {
    display: 'inline-flex',
    gap: 4,
    alignItems: 'baseline',
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    background: 'none',
    border: 0,
    padding: 0,
    cursor: onFold === undefined ? 'default' : 'pointer',
    fontFamily: 'inherit'
  }
  const text = folded ? `▸ ${String(n)} more · soonest: ${first.place.tag} ${respawnClockLabel(first.row, nowMs, fmtDuration)}` : `▾ ${String(n)} more`
  const toggle =
    onFold === undefined ? (
      folded ? <span style={toggleStyle}>{text}</span> : null
    ) : (
      <button type="button" data-testid="respawn-overlay-fold" aria-label={folded ? 'Show the other places' : 'Hide the other places'} onClick={onFold} style={toggleStyle}>
        {text}
      </button>
    )
  return (
    <div style={{ marginTop: 2, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {toggle}
      {!folded && entries.map((e) => <PlaceLine key={e.row.id} entry={e} nowMs={nowMs} />)}
    </div>
  )
}

/** A clock row: the one this window has always drawn, now with the other places under it. */
function ClockRow({
  entry,
  nowMs,
  interactive,
  onConfirm,
  onUnwatch,
  places
}: {
  entry: RespawnTierEntry
  nowMs: number
  interactive: boolean
  onConfirm: (rowId: string) => void
  onUnwatch: (key: string) => void
  places: JSX.Element | null
}): JSX.Element {
  const { row } = entry
  const r = respawnReading(row, nowMs)
  const hasEstimate = row.estimateMs !== undefined
  const tone = toneOf(r)
  return (
    <div
      data-testid="respawn-overlay-row"
      data-respawn-mob={row.key}
      data-respawn-source={row.source}
      data-respawn-due={r.due ? 'true' : 'false'}
      data-respawn-seen={r.seen ? 'true' : 'false'}
      data-respawn-stale={r.stale ? 'true' : 'false'}
      data-respawn-overridden={respawnOverridden(row) ? 'true' : 'false'}
      data-respawn-basis={row.basis}
      data-respawn-place={entry.place.tag}
      style={{ padding: '2px 2px 3px', borderLeft: `2px solid ${tone}66`, paddingLeft: 5 }}
    >
      <ClockLine
        display={row.display}
        tag={entry.here ? undefined : entry.place.tag}
        label={respawnClockLabel(row, nowMs, fmtDuration)}
        tone={tone}
        button={interactive ? <UnwatchButton display={row.display} mobKey={row.key} onUnwatch={onUnwatch} /> : null}
      />
      {/* The bar is the estimate running down: absent with no estimate and absent on a stale row,
          because an empty bar reads as "nearly up", which would be a lie. */}
      {hasEstimate && !r.stale && (
        <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 2 }}>
          <div style={{ height: '100%', width: `${String(Math.round((1 - r.fraction) * 100))}%`, background: tone, borderRadius: 2 }} />
        </div>
      )}
      {/* NOTHING RE-BASES ITSELF: the affordance below is the only path to `basis: 'sighting'`. */}
      {r.seen && <SeenLine row={row} nowMs={nowMs} interactive={interactive} onConfirm={onConfirm} />}
      <RungLine row={row} />
      {places}
    </div>
  )
}

const STATE_LABEL: Readonly<Record<Exclude<RespawnHereState, 'clock'>, string>> = {
  up: 'up',
  none: 'no kill here yet',
  noRespawn: 'no respawn here'
}

/** A row with no clock where you stand: UP in a fresh private instance, or nothing killed here yet. */
function StateRow({
  group,
  state,
  interactive,
  onUnwatch,
  places
}: {
  group: RespawnTierGroup
  state: Exclude<RespawnHereState, 'clock'>
  interactive: boolean
  onUnwatch: (key: string) => void
  places: JSX.Element | null
}): JSX.Element {
  const tone = state === 'up' ? DUE : STALE
  return (
    <div
      data-testid="respawn-overlay-row"
      data-respawn-mob={group.key}
      data-respawn-state={state}
      style={{ padding: '2px 2px 3px', borderLeft: `2px solid ${tone}66`, paddingLeft: 5 }}
    >
      <ClockLine
        display={group.display}
        label={STATE_LABEL[state]}
        tone={tone}
        button={interactive ? <UnwatchButton display={group.display} mobKey={group.key} onUnwatch={onUnwatch} /> : null}
      />
      {places}
    </div>
  )
}

export function RowsLayout({
  groups,
  sort,
  foldedOf,
  onFold,
  nowMs,
  interactive,
  onConfirm,
  onUnwatch
}: {
  groups: readonly RespawnTierGroup[]
  sort: RespawnOverlaySort
  foldedOf: (key: string) => boolean
  onFold: (key: string) => void
  nowMs: number
  interactive: boolean
  onConfirm: (rowId: string) => void
  onUnwatch: (key: string) => void
}): JSX.Element {
  return (
    <>
      {groups.map((g) => {
        const plan = respawnRowPlan(g, sort)
        const places = (
          <PlacesBlock
            entries={plan.rest}
            folded={foldedOf(g.key)}
            onFold={
              interactive
                ? () => {
                    onFold(g.key)
                  }
                : undefined
            }
            nowMs={nowMs}
          />
        )
        return plan.head !== null && plan.state === 'clock' ? (
          <ClockRow key={g.key} entry={plan.head} nowMs={nowMs} interactive={interactive} onConfirm={onConfirm} onUnwatch={onUnwatch} places={places} />
        ) : (
          <StateRow key={g.key} group={g} state={plan.state === 'clock' ? 'none' : plan.state} interactive={interactive} onUnwatch={onUnwatch} places={places} />
        )
      })}
    </>
  )
}
