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
/** The bar's redraw rate while a swing is coming: smooth enough to read, cheap to paint. */
const TICK_MS = 50

/** The wall clock, ticking only while there is a swing to time. */
function useTicker(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [running])
  return now
}

function caption(r: SwingReading): string {
  if (r.idle) return 'Idle'
  return r.progress >= 1 ? 'Swing due' : `Next in ${(r.nextInMs / 1000).toFixed(1)}s`
}

function SwingBar({ r }: { r: SwingReading }): JSX.Element {
  const fill = r.idle ? 0 : r.progress
  return (
    <div data-testid="swing-overlay-bar" style={{ padding: '6px 2px' }}>
      <div style={{ height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${String(fill * 100)}%`, background: fill >= 1 ? DUE : ACCENT }} />
      </div>
      <div style={{ fontSize: 11, color: r.idle ? DIM : '#f2f2f2', marginTop: 4 }}>{caption(r)}</div>
    </div>
  )
}

export default function SwingOverlay(): JSX.Element {
  const snap = useOverlayCombat(undefined)
  const { locked, bgAlpha, textScale, hovering, patch, toggleLock, capture, dragRegion, noDrag } = useOverlayChrome()
  const rounds = snap?.swingRounds
  const [running, setRunning] = useState(false)
  const now = useTicker(running)
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
          <SwingBar r={r} />
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
