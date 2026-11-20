// zz-probe-combat-chart-4.mts: THREE SIDE CHECKS on the group fixture (you + pet + a group mate).
//  A. The Timeline view's hover row "you + pet": what number does it hold when the group mate is hitting?
//  B. "Its own bar": does the hover dot ride the gold line, and does gold + pet equal the nested gold?
//  C. Copy in the Incoming direction against the screen.
// Throwaway, never committed.
import type { Page } from 'playwright-core'
import { settle, sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, captureClipboard, copied, hoverPlot, openCombat, pointerAway, rafFires, readDash, requireBuilt, say, setLayoutKey, shimRaf } from './zz-probe-combat-chart-0.mjs'

const FIXTURE = process.argv[2] ?? 'g1-group-lifecycle.log'

async function timelineScan(page: Page): Promise<unknown[]> {
  const out: unknown[] = []
  for (const fx of [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.96]) {
    const pt = (await page.evaluate(`(() => { const p = document.querySelector('svg:has(#tl-plot-clip)'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${String(fx)}), y: Math.round(r.top + r.height * 0.5) }; })()`)) as { x: number; y: number } | null
    if (!pt) { out.push({ fx, plot: false }); continue }
    await page.mouse.move(pt.x - 3, pt.y)
    await page.mouse.move(pt.x, pt.y)
    await sleep(400)
    out.push({ fx, rows: await page.evaluate(`(() => { const t = document.querySelector('[data-testid="chart-tooltip"]'); return t ? [...t.children].map((c) => c.innerText.replace(/[ \\n\\t]+/g, ' ').trim()) : null; })()`) })
  }
  await pointerAway(page)
  return out
}

async function cardScan(page: Page): Promise<unknown[]> {
  const out: unknown[] = []
  for (const fx of [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.96]) {
    const h = (await hoverPlot(page, '', fx)) as { tip?: { rows: string[] } | null }
    // The hover dot against the gold polyline at the same x.
    const dot = await page.evaluate(`(() => {
      const card = [...document.querySelectorAll('[data-testid="dash-panel"]')].find((p) => /DPS over time/i.test(p.innerText || ''));
      const plot = card.querySelector('[data-testid="dps-plot"]');
      const layer = plot.parentElement.querySelector('div svg circle');
      const line = card.querySelector('[data-testid="dps-line-out"]');
      if (!layer || !line) return null;
      const w = plot.getBoundingClientRect().width;
      const cx = Number(layer.getAttribute('cx')), cy = Number(layer.getAttribute('cy'));
      const ux = cx / w * 720;
      const pts = line.getAttribute('points').trim().split(' ').map((p) => p.split(',').map(Number));
      let best = pts[0];
      for (const p of pts) if (Math.abs(p[0] - ux) < Math.abs(best[0] - ux)) best = p;
      return { dotY: Math.round(cy * 10) / 10, nearestVertexY: best[1], dx: Math.round(Math.abs(best[0] - ux) * 10) / 10 };
    })()`)
    out.push({ fx, rows: h.tip?.rows ?? null, dot })
  }
  await pointerAway(page)
  return out
}

async function main(): Promise<void> {
  requireBuilt()
  const { app, close } = await launchOnFixture(FIXTURE)
  const stop = bound(close, 300_000)
  try {
    const page = await mainWindow(app)
    await answerNotice(page)
    await captureClipboard(app)
    await openCombat(page)
    await waitHydrated(page)
    if (!(await rafFires(page, 2000))) await shimRaf(page)

    for (const layout of ['nested', 'separate'] as const) {
      await setLayoutKey(page, layout)
      await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 30_000 })
      await sleep(700)
      say(`[${layout}] DPS CARD hover scan (rows, and the dot against the gold line)`, await cardScan(page))
      await page.click('[data-testid="view-toggle"] button:nth-child(2)')
      await page.waitForSelector('svg:has(#tl-plot-clip)', { timeout: 15_000 })
      await sleep(700)
      say(`[${layout}] TIMELINE hover scan`, await timelineScan(page))
      await page.click('[data-testid="view-toggle"] button:nth-child(1)')
      await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 15_000 })
    }

    // C. Incoming direction: screen against the paste.
    await page.click('[data-testid="direction-toggle"] button:nth-child(2)')
    await sleep(600)
    const dash = await readDash(page)
    say('INCOMING meter head', dash.meterHead)
    say('INCOMING rows', (dash.rows as { text: string }[]).map((r) => r.text))
    say('INCOMING panel text', await page.evaluate(`document.querySelectorAll('[data-testid="dash-panel"]')[0].innerText.replace(/[ \\n\\t]+/g, ' ').trim().slice(0, 700)`))
    const before = (await copied(app)).length
    await page.locator('[data-testid="dash-panel"] [data-testid="copy-view"]').first().click({ timeout: 10_000 })
    const list = await settle(() => copied(app), (l) => l.length > before, { timeoutMs: 6000 })
    say('INCOMING COPIED', list[list.length - 1] ?? '(nothing)')
    await page.click('[data-testid="direction-toggle"] button:nth-child(3)')
    await sleep(500)
    say('HEALING: copy buttons in the meter panel', await page.evaluate(`document.querySelectorAll('[data-testid="dash-panel"]')[0].querySelectorAll('[data-testid="copy-view"]').length`))
    await page.click('[data-testid="direction-toggle"] button:nth-child(1)')
    await setLayoutKey(page, 'nested')
  } finally {
    stop()
    await close()
  }
  console.log('\nprobe 4 done')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
