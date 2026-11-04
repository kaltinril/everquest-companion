// RespawnOverlay (JOS-194) — the respawn clocks, floating over the game.
//
// This window is the whole point of the ticket in practice. A respawn timer you have to alt-tab to
// read is a timer you do not read; the corroborating report (01KZQ4X16MPDKQ2CF4SY35P5ED) is from
// somebody who left a tool that put named-mob clocks on screen and missed them. So the Timers tab
// is where you SET this up and this window is where you USE it.
//
// IT DERIVES NOTHING AND FOLDS NOTHING. Every row is the `respawn` module's own, composed by the
// same pure helpers the tab reads (`orderRespawnRows`, `respawnReading`, `respawnSourceLabel`) —
// a second opinion about which mob is due soonest, one process away from the first, is exactly the
// drift the shared/ split exists to prevent.
//
// IT SHOWS THE ZONE YOU ARE IN, AND NOTHING ELSE (owner ruling after the first hands-on round,
// 2026-08-10). The fold keeps every zone it has walked through, and this window used to draw all of
// them — so a Befallen camp put four Guk clocks over the game, none of which anybody could act on.
// A clock in another zone is not hidden data — it is still in the fold and still on the tab's
// all-zones view — it is just not something this window can help with, and that includes one that
// has come DUE (see `respawnInZone`'s header).
//
// …AND SINCE 2026-11-03 "THE ZONE" IS EVERY PLACE OF IT (owner, from a night of Lake Nerius: "I
// want to be able to jump from instance to instance as soon as the mob is up in that instance that
// I'm tracking. Tracking is at the MOB level. Timers for when it respawns is shown per
// level/instance/raid"). A pickzone tier (`Lake Nerius 3 (Fused)`) and a private instance keep
// their own clocks in the fold, and this window draws one entry per TRACKED MOB with its clock in
// every place of the zone where it was killed within twice its respawn — so you know which
// instance to go to without going there. Two layouts, chosen from this window's own footer while
// it is unlocked (owner: a glyph here, not a Preferences trip; "screen real estate is expensive"):
// ROWS (respawnOverlayRows.tsx), the clock where you stand big and the other places small under
// it, with a ⇅ that lets the soonest place lead instead; and GRID (respawnOverlayGrid.tsx), mobs
// down and places across. Either folds the other places away. All of that is
// `shared/respawnTiers.ts`; this file only draws it. A tracked mob is never reported as "no clocks
// running": with nothing killed here the empty state says what is tracked and where the clocks are.
//
// IT TICKS ITSELF, at 1 Hz, because a countdown is the one thing in this app that must keep moving
// while the log is silent — and a row carries its own `baseTs`, so ticking costs no IPC at all.
// (The XP window's clock is 30 s for the opposite reason: nothing in it is a countdown.)
//
// AND IT IS WHERE THE ROUND-3 RULING HAS TO LAND (owner, 2026-08-10). The defect was reported from
// live play: the mob was hitting him and the row over the game still read "due 4m ago". So a row
// the log has NAMED since its clock started reads UP here, in its own colour, sorted to the top —
// and the affordance that re-bases the clock onto that sighting lives here too, in INTERACTIVE
// mode, because a locked window is click-through by law and has no clicks to give. Confirming from
// the Timers tab is the same call on the same module (`confirmRespawnSighting`); this window simply
// spares you the alt-tab in the one moment the feature is for.
//
// AND ROUND 4 LANDS HERE FOR THE SAME REASON (owner, 2026-08-10). Unwatching used to mean finding
// the name in the watch list at the bottom of the Timers tab — i.e. alt-tabbing out of the game to
// get rid of a row that is wrong about the mob in front of you, which on EQ's duplicated names is
// the common case. So a row here carries its own Unwatch, in INTERACTIVE mode only, beside the
// confirm affordance and under the same law: a locked window is click-through and has no clicks to
// give. It stops that NAME everywhere, including zones this window does not show — which the
// button's title used to say, until the owner deleted every Unwatch tooltip in the round-7 addendum
// on the grounds that the control speaks for itself. The behaviour is unchanged and argued in
// shared/respawn.ts; nothing on screen recites it.
//
// AND ROUND 6'S HOVER CARD IS GONE AGAIN (owner, 2026-08-10, round 7 — and the reversal is the
// interesting part). Round 6 put the mob's drop card on these rows as well as on the tab's; the
// owner used it and ruled it out HERE only: it "takes the overlay over too completely". The
// arithmetic is plain once you have seen it — this window is about 300px wide and its rows are 30px
// tall, and the card is 300px wide and can run several times a row's height, so pointing anywhere
// replaces the countdown you opened the window for with a drop table. The card is not worse than it
// was; it is bigger than its host. So it is IN-APP ONLY.
//
// …AND JOS-358 FINISHED THE JOB: the plain `title` round 5 left on the row is gone too. The owner
// ruled from hands-on testing that these windows keep tooltips ONLY in the title bar, and a row
// hover was also leaving popups stranded over the game when the cursor flicked out. So a row states
// its clock, its colour and its bar, and nothing else; `respawnProvenance` is unchanged and is what
// the Timers tab's own card leads with (features/timers, lib/hoverCards.tsx). The header count's
// hover — `RESPAWN_LEGEND_TITLE`, the claims this window makes — is in the TITLE BAR and stays.
//
// (Nothing about round 6's REFACTOR is undone: the card still lives in `lib/hoverCards.tsx`, where
// the event overlay's `/con` rows and the Timers tab both draw it. One of its two new callers went
// away, not the move.)
//
// AND ROUND 8 PUTS ROWS HERE THAT NO CLOCK IS RUNNING FOR (owner, 2026-08-11). A watched mob always
// has a row now — the fold no longer retires one whose estimate elapsed half an hour ago — so this
// window can hold a clock that ran out overnight beside one with four minutes left. Over the game
// that ordering is the whole product, so the two are told apart without reading: the long-gone row
// is GREY, says "due long ago" (or "awaiting next death") instead of a number that grows forever,
// draws no bar, and `orderRespawnRows` sinks it under every live clock. It keeps its Unwatch,
// because it is still a mob you asked for.
//
// AND ROUND 9 PUTS A STATE HERE AND NONE OF ITS CONTROLS (owner, 2026-08-11). A row whose duration
// the player set themselves is OVERRIDDEN, and over the game that is worth knowing at a glance — so
// the rung line goes violet, a colour this window uses for nothing else, off the same
// `respawnOverridden` the tab paints in gold. What does NOT come here is the editing: the edit icon
// and its modal are tab-only, for exactly the reason round 7 removed the hover card from this window
// (a 300px window cannot host a 300px surface) and because a locked window is click-through and has
// no clicks to give. Its rung line also stopped spelling the duration inline and reads
// `respawnDurationText`, so the `<=` that says "upper bound" cannot go missing on one surface.
//
// MUI-FREE, plain divs and inline styles, like every file in this bundle.

import { type JSX, useState } from 'react'
import { EMPTY_RESPAWN_SNAP, type RespawnSnap } from '@shared/respawn'
import { normalizeRespawnOverlayConfig, type RespawnOverlayConfig } from '@shared/respawnOverlayConfig'
import { respawnTierEmptyText, respawnTierView, respawnVisiblePlaces, respawnZoneTitle } from '@shared/respawnTiers'
import { OverlayHeader } from './OverlayHeader'
import { FOOTER_ROW, OverlayContent } from './overlayScale'
import { TextScaleStepper } from './TextScaleStepper'
import { useOverlayModule } from './useOverlayModule'
import { useSecondsClock } from '../lib/useSecondsClock'
import { type OverlayChrome, useOverlayChrome } from './useOverlayChrome'
import { OVERLAY_FONT } from '../../../shared/overlayFont'
import { ACCENT, ACCENT_BG } from './respawnOverlayTone'
import { RowsLayout } from './respawnOverlayRows'
import { GridLayout } from './respawnOverlayGrid'

const RESPAWN_LEGEND_TITLE =
  'One entry per tracked mob, a clock per place of this zone (open tiers, your private instance), blue where you stand. Zero = our estimate elapsed, not a sighting. UP = the log named the mob. Another place shows while its kill is within twice the respawn.'

/** A footer glyph, in the text stepper's own dress so the row reads as one control strip. */
function GlyphButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: 'inherit',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4,
        padding: '1px 5px',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        fontSize: 10,
        lineHeight: 1.4
      }}
    >
      {children}
    </button>
  )
}

/** The layout knobs: rows or grid, which clock leads a row, and folding the other places away. */
function LayoutControls({
  cfg,
  anyFolded,
  onLayout,
  onSort,
  onFoldAll,
  noDrag
}: {
  cfg: RespawnOverlayConfig
  anyFolded: boolean
  onLayout: () => void
  onSort: () => void
  onFoldAll: () => void
  noDrag: React.CSSProperties
}): JSX.Element {
  const rows = cfg.layout === 'rows'
  return (
    <span data-testid="respawn-overlay-layout" style={{ ...noDrag, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <GlyphButton label={rows ? 'Layout: rows (switch to grid)' : 'Layout: grid (switch to rows)'} onClick={onLayout}>
        {rows ? '☰' : '⊞'}
      </GlyphButton>
      {rows && (
        <GlyphButton label={cfg.sort === 'here' ? 'Leading clock: where I am (switch to soonest up)' : 'Leading clock: soonest up (switch to where I am)'} onClick={onSort}>
          {cfg.sort === 'here' ? '⇅ here' : '⇅ soon'}
        </GlyphButton>
      )}
      <GlyphButton label={anyFolded ? 'Show the other places' : 'Hide the other places'} onClick={onFoldAll}>
        {anyFolded ? '▸' : '▾'}
      </GlyphButton>
    </span>
  )
}

function RespawnFooter({
  bgAlpha,
  textScale,
  patch,
  noDrag,
  layout
}: {
  bgAlpha: number
  textScale: number
  patch: OverlayChrome['patch']
  noDrag: React.CSSProperties
  layout: JSX.Element
}): JSX.Element {
  return (
    <div style={{ ...FOOTER_ROW, ...noDrag, gap: 6 }}>
      {/* No hover on the slider (JOS-358): it looks like what it is. */}
      <input
        type="range"
        aria-label="Background opacity"
        min={0.1}
        max={1}
        step={0.02}
        value={bgAlpha}
        onChange={(e) => {
          patch({ bgAlpha: Number(e.target.value) })
        }}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 20, accentColor: ACCENT, height: 4 }}
      />
      {layout}
      <TextScaleStepper textScale={textScale} patch={patch} noDrag={noDrag} />
    </div>
  )
}

/** Per-row and per-column folds this window keeps for itself; the all-at-once fold is in the config. */
function useFolds(cfg: RespawnOverlayConfig, write: (p: Partial<RespawnOverlayConfig>) => void): {
  foldedOf: (key: string) => boolean
  onFold: (key: string) => void
  hidden: ReadonlySet<string>
  onHidePlace: (tag: string) => void
  anyFolded: boolean
  onFoldAll: () => void
} {
  const [foldedRows, setFoldedRows] = useState<Readonly<Record<string, boolean>>>({})
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set<string>())
  const foldedOf = (key: string): boolean => foldedRows[key] ?? cfg.collapsed
  const anyFolded = cfg.collapsed || hidden.size > 0 || Object.values(foldedRows).some((f) => f)
  return {
    foldedOf,
    onFold: (key) => {
      setFoldedRows((prev) => ({ ...prev, [key]: !(prev[key] ?? cfg.collapsed) }))
    },
    hidden,
    onHidePlace: (tag) => {
      setHidden((prev) => new Set([...prev, tag]))
    },
    anyFolded,
    onFoldAll: () => {
      if (anyFolded) {
        setFoldedRows({})
        setHidden(new Set<string>())
        write({ collapsed: false })
      } else {
        write({ collapsed: true })
      }
    }
  }
}

export default function RespawnOverlay(): JSX.Element {
  const snap = useOverlayModule<RespawnSnap>('respawn', EMPTY_RESPAWN_SNAP)
  const chrome = useOverlayChrome()
  const { locked, bgAlpha, textScale, hovering, patch, toggleLock, capture, dragRegion, noDrag } = chrome
  const cfg = normalizeRespawnOverlayConfig(chrome.config?.respawn)
  const write = (p: Partial<RespawnOverlayConfig>): void => {
    patch({ respawn: { ...cfg, ...p } })
  }
  const folds = useFolds(cfg, write)
  // The clock runs only while a row is there to count down; the view is re-read against THIS
  // renderer's clock every second, because "soonest" moves whether or not the log does.
  const nowMs = useSecondsClock(snap.rows.length > 0)
  const view = respawnTierView(snap, nowMs, cfg.sort)
  const places = respawnVisiblePlaces(view, cfg.collapsed, folds.hidden)
  const confirmSighting = (rowId: string): void => {
    void window.eqOverlay.confirmRespawnSighting(rowId)
  }
  const unwatch = (key: string): void => {
    void window.eqOverlay.unwatchRespawn(key)
  }
  const interactive = !locked

  return (
    <div
      data-testid="respawn-overlay"
      data-respawn-layout={cfg.layout}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: OVERLAY_FONT,
        color: '#f2f2f2',
        background: `rgba(14,17,21,${bgAlpha})`,
        border: locked ? '1px solid rgba(255,255,255,0.04)' : `1px solid ${ACCENT}66`,
        borderRadius: 8,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <OverlayHeader
        tag="RESP"
        title={respawnZoneTitle(snap.zone)}
        titleColor={ACCENT}
        tail={view.groups.length > 0 ? String(view.groups.length) : undefined}
        tailTitle={RESPAWN_LEGEND_TITLE}
        iconAccentBg={ACCENT_BG}
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
      />

      <OverlayContent textScale={textScale} testId="respawn-overlay-rows" locked={locked} capture={capture}>
        {view.groups.length === 0 ? (
          <div data-testid="respawn-overlay-empty" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', padding: '8px 2px' }}>
            {respawnTierEmptyText(view, snap.zone)}
          </div>
        ) : cfg.layout === 'grid' ? (
          <GridLayout
            groups={view.groups}
            places={places}
            hereTag={view.here?.tag}
            nowMs={nowMs}
            interactive={interactive}
            onHidePlace={folds.onHidePlace}
            onUnwatch={unwatch}
          />
        ) : (
          <RowsLayout
            groups={view.groups}
            sort={cfg.sort}
            foldedOf={folds.foldedOf}
            onFold={folds.onFold}
            nowMs={nowMs}
            interactive={interactive}
            onConfirm={confirmSighting}
            onUnwatch={unwatch}
          />
        )}
      </OverlayContent>

      {!locked && (
        <RespawnFooter
          bgAlpha={bgAlpha}
          textScale={textScale}
          patch={patch}
          noDrag={noDrag}
          layout={
            <LayoutControls
              cfg={cfg}
              anyFolded={folds.anyFolded}
              onLayout={() => {
                write({ layout: cfg.layout === 'rows' ? 'grid' : 'rows' })
              }}
              onSort={() => {
                write({ sort: cfg.sort === 'here' ? 'soon' : 'here' })
              }}
              onFoldAll={folds.onFoldAll}
              noDrag={noDrag}
            />
          }
        />
      )}
    </div>
  )
}
