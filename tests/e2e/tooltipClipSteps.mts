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

/** What cuts the readout: '' when all of it is drawn, null when there is no readout. */
function tooltipCut(page: Page): Promise<string | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return 'it has no size'
    const slack = 0.5
    /** True when `r` reaches outside the box. */
    const outside = (left: number, top: number, right: number, bottom: number): boolean =>
      r.left < left - slack || r.top < top - slack || r.right > right + slack || r.bottom > bottom + slack
    if (outside(0, 0, window.innerWidth, window.innerHeight)) {
      return `the window (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${window.innerWidth}x${window.innerHeight})`
    }
    for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      const c = p.getBoundingClientRect()
      const clips = s.overflowX !== 'visible' || s.overflowY !== 'visible'
      if (clips && outside(c.left, c.top, c.right, c.bottom)) {
        return `a clipping ancestor (${p.tagName.toLowerCase()}, ${Math.round(c.width)}x${Math.round(c.height)})`
      }
    }
    return ''
  }, TOOLTIP)
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
