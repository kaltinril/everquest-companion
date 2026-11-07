// SwingOverlay — the swing timer (owner, 2026-10-29): your weapon swing cadence as the log shows
// it, and a bar that fills from your last swing to the next one.
//
// It reads `swingRounds` off the combat snapshot the meters already poll (four reads a second in a
// fight) and derives nothing itself: shared/swingTimer.ts is the cadence. The log stamps whole
// seconds, so the bar is good to about half a second; the header's figure is a measured average,
// never a weapon-delay formula.
//
// MUI-FREE, plain divs and inline styles, like every file in this bundle.

import { type JSX, useEffect, useState } from 'react'
import { swingReading, type SwingReading } from '@shared/swingTimer'
import { OVERLAY_FONT } from '../../../shared/overlayFont'
import { BgFooter } from './BgFooter'
import { OverlayHeader } from './OverlayHeader'
import { OverlayContent } from './overlayScale'
import { useOverlayChrome } from './useOverlayChrome'
import { useOverlayCombat } from './useOverlayCombat'

/** A coral, none of the other windows' accents (gold, green, red, blue, amber, teal, violet). */
const ACCENT = '#f08a5d'
const ACCENT_BG = 'rgba(240,138,93,0.2)'
const DUE = '#7fd18b'
const DIM = 'rgba(255,255,255,0.5)'
/**
 * THE BAR MOVES BY CSS, THE CAPTION BY A SLOW CLOCK (the 2026-11-06 renderer pass). The window used
 * to re-render whole at 50 ms for the bar's width; the fill is linear in time, which is exactly
 * what a `width` transition draws for free, so the bar is set once per swing (keyed on the last
 * swing's instant) and told how long it has. The caption prints tenths and ticks at 100 ms in its
 * own leaf; the window above it re-reads the cadence at 500 ms, enough to notice a pause.
 */
const CAPTION_TICK_MS = 100
const WINDOW_TICK_MS = 500

/** The wall clock, ticking only while there is a swing to time. */
function useTicker(running: boolean, everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [running, everyMs])
  return now
}

function caption(r: SwingReading): string {
  if (r.idle) return 'Idle'
  return r.progress >= 1 ? 'Swing due' : `Next in ${(r.nextInMs / 1000).toFixed(1)}s`
}

/** The caption's own clock: it is the one thing on the window that reads tenths of a second. */
function SwingCaption({ rounds, idle }: { rounds: readonly number[] | undefined; idle: boolean }): JSX.Element {
  const now = useTicker(!idle, CAPTION_TICK_MS)
  const r = swingReading(rounds, now)
  return <div style={{ fontSize: 11, color: r === null || r.idle ? DIM : '#f2f2f2', marginTop: 4 }}>{r === null ? 'Idle' : caption(r)}</div>
}

/** The fill: mounted at the swing's current progress, then told to reach the end on its own. The
 *  colour flips to DUE through the same transition, delayed by the time left. */
function SwingFill({ start, leftMs }: { start: number; leftMs: number }): JSX.Element {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const full = armed || start >= 1
  const ms = Math.max(0, leftMs)
  return (
    <div
      data-testid="swing-overlay-fill"
      style={{
        height: '100%',
        width: `${String((full ? 1 : start) * 100)}%`,
        background: full ? DUE : ACCENT,
        transition: armed ? `width ${String(ms)}ms linear, background ${String(0)}ms linear ${String(ms)}ms` : 'none'
      }}
    />
  )
}

function SwingBar({ r, rounds }: { r: SwingReading; rounds: readonly number[] | undefined }): JSX.Element {
  const last = rounds === undefined || rounds.length === 0 ? 0 : rounds[rounds.length - 1]
  return (
    <div data-testid="swing-overlay-bar" style={{ padding: '6px 2px' }}>
      <div style={{ height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        {r.idle ? <div style={{ height: '100%', width: '0%' }} /> : <SwingFill key={last} start={r.progress} leftMs={r.nextInMs} />}
      </div>
      <SwingCaption rounds={rounds} idle={r.idle} />
    </div>
  )
}

export default function SwingOverlay(): JSX.Element {
  const snap = useOverlayCombat(undefined)
  const { locked, bgAlpha, textScale, hovering, patch, toggleLock, capture, dragRegion, noDrag } = useOverlayChrome()
  const rounds = snap?.swingRounds
  const [running, setRunning] = useState(false)
  const now = useTicker(running, WINDOW_TICK_MS)
  const r = swingReading(rounds, now)
  const live = r !== null && !r.idle
  useEffect(() => setRunning(live), [live])

  return (
    <div
      data-testid="swing-overlay"
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
        tag="SWG"
        title="Swing"
        titleColor={ACCENT}
        tail={r ? `${(r.intervalMs / 1000).toFixed(1)}s` : undefined}
        tailTitle="Your average time between weapon swings, measured from the log."
        iconAccentBg={ACCENT_BG}
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
      />
      <OverlayContent textScale={textScale} testId="swing-overlay-body" locked={locked} capture={capture}>
        {r ? (
          <SwingBar r={r} rounds={rounds} />
        ) : (
          <div data-testid="swing-overlay-empty" style={{ fontSize: 10.5, color: DIM, padding: '8px 2px' }}>
            Swing a weapon to start.
          </div>
        )}
      </OverlayContent>
      {!locked && <BgFooter accent={ACCENT} bgAlpha={bgAlpha} textScale={textScale} patch={patch} noDrag={noDrag} />}
    </div>
  )
}
