/**
 * THE CHART READOUT IS NEVER CUT OFF (screen pass 2026-11-19, fixed 2026-11-20).
 *
 * At 125% text in the default window the dashboard's DPS card shows 86 px of a 118 px plot and
 * scrolls. The shared readout (`lib/ChartTooltip.tsx`) was drawn inside the chart, so the card's
 * scrolling body cut it off. It is now drawn on <body>, fixed to the window. This step sets the
 * text size through the app's own bridge, hovers the curve, and asks the page what cuts the
 * readout: the window's edge, or any ancestor that clips. Identities only, no numbers of today.
 */

import type { Page } from 'playwright-core'
import { check, note } from './appHarness.mjs'
import { countIn, hoverAt, settle, settleGone } from './settle.mjs'

const TOOLTIP = '[data-testid="chart-tooltip"]'
/** The DPS-over-time curve: the one STRETCHED (`preserveAspectRatio="none"`) svg in a panel. */
const DPS_CURVE = '[data-testid="dash-panel"] svg[preserveAspectRatio="none"]'
const LARGE = 1.25

interface Bridge {
  eq: { getUiScale: () => Promise<number>; setUiScale: (s: number) => Promise<number> }
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}
interface Seen {
  card: Box
  window: Box
  /** Every ancestor of the card that clips its content, innermost first. */
  clips: (Box & { tag: string })[]
}

/** The card's box, the window's, and every clipping ancestor's. The page does no judging: a named
 *  helper inside `evaluate` does not survive the test loader (it wraps it in `__name`). */
function tooltipSeen(page: Page): Promise<Seen | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const clips: { left: number; top: number; right: number; bottom: number; tag: string }[] = []
    for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const c = p.getBoundingClientRect()
      clips.push({ left: c.left, top: c.top, right: c.right, bottom: c.bottom, tag: p.tagName.toLowerCase() })
    }
    return {
      card: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      window: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
      clips
    }
  }, TOOLTIP)
}

const SLACK = 0.5
function outside(card: Box, box: Box): boolean {
  return card.left < box.left - SLACK || card.top < box.top - SLACK || card.right > box.right + SLACK || card.bottom > box.bottom + SLACK
}
const size = (b: Box): string => `${String(Math.round(b.right - b.left))}x${String(Math.round(b.bottom - b.top))}`

/** What cuts the readout: '' when all of it is drawn, null when there is no readout. */
async function tooltipCut(page: Page): Promise<string | null> {
  const seen = await tooltipSeen(page)
  if (seen === null) return null
  const { card } = seen
  if (card.right - card.left < 1 || card.bottom - card.top < 1) return 'it has no size'
  if (outside(card, seen.window)) {
    return `the window (${String(Math.round(card.left))},${String(Math.round(card.top))} to ${String(Math.round(card.right))},${String(Math.round(card.bottom))} in ${size(seen.window)})`
  }
  const clip = seen.clips.find((c) => outside(card, c))
  return clip === undefined ? '' : `a clipping ancestor (${clip.tag}, ${size(clip)})`
}

async function setScale(page: Page, scale: number): Promise<void> {
  const before = await page.evaluate(() => window.innerWidth)
  const was = await page.evaluate(() => (window as unknown as Bridge).eq.getUiScale())
  await page.evaluate((s) => (window as unknown as Bridge).eq.setUiScale(s), scale)
  if (Math.abs(was - scale) < 0.001) return
  // The zoom lands when the page's own width in CSS px has changed.
  await settle(
    () => page.evaluate(() => window.innerWidth),
    (w) => Math.abs(w - before) > 20,
    { timeoutMs: 15_000 }
  )
}

/** Hover the DPS curve at one height and say what cuts the readout. */
async function hoverAndRead(page: Page, fy: number, label: string): Promise<void> {
  if (!(await hoverAt(page, DPS_CURVE, 0.5, fy))) {
    note(`${label}: the DPS-over-time curve is not drawn for this selection, so its readout is not checked`)
    return
  }
  const shown = await countIn(page, TOOLTIP)
  if (shown === 0) {
    note(`${label}: no readout appeared at this point of the curve`)
    return
  }
  const cut = await tooltipCut(page)
  check(`${label}: the whole readout is drawn, cut off by nothing`, cut === '', cut === '' ? 'all of it on screen' : `cut by ${String(cut)}`)
  check(
    `${label}: the readout is drawn on the page body, outside the chart's own scrolling box`,
    await page.evaluate((sel) => document.querySelector(sel)?.parentElement === document.body, TOOLTIP)
  )
}

export async function checkReadoutNotCut(page: Page): Promise<void> {
  const was = await page.evaluate(() => (window as unknown as Bridge).eq.getUiScale())
  await hoverAndRead(page, 0.5, 'default text size')
  await setScale(page, LARGE)
  try {
    // Near the top and near the bottom of what the card shows of its plot: the readout goes
    // below the cursor, which is where the card's short body used to cut it.
    await hoverAndRead(page, 0.2, '125% text, top of the plot')
    await hoverAndRead(page, 0.6, '125% text, lower in the plot')
  } finally {
    await page.mouse.move(2, 2)
    await settleGone(page, TOOLTIP, { timeoutMs: 5_000 })
    await setScale(page, was)
  }
}
