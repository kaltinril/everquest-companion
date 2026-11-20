// zz-probe-combat-chart-2.mts: THE PET LAYOUT x SCOPE MATRIX at the default window.
// usage: node --import tsx tests/e2e/zz-probe-combat-chart-2.mts <fixture> [fightId]
// For each of the three pet layouts (set through Preferences > Combat): the DPS card's legend,
// lines, peak, hover readout and tooltips on the Combat tab; the meter rows, header total and the
// copied text under each scope; the Overview glance card; the Timeline view's hover.
// Throwaway, never committed.
import type { Page } from 'playwright-core'
import { settle, settleGone, sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import {
  answerNotice,
  bound,
  captureClipboard,
  copied,
  hoverPlot,
  muiTip,
  openCombat,
  pointerAway,
  prefsPetText,
  rafFires,
  readChart,
  readDash,
  requireBuilt,
  save,
  say,
  setLayoutKey,
  shimRaf
} from './zz-probe-combat-chart-0.mjs'

const FIXTURE = process.argv[2] ?? 'g1-group-lifecycle.log'
const FIGHT = process.argv[3] ?? ''
const TAG = `${FIXTURE.replace(/\.log$/, '')}${FIGHT ? `-${FIGHT}` : ''}`
const LAYOUTS = ['nested', 'separate', 'grouped'] as const
const SCOPES = ['everyone', 'group', 'you'] as const
const OVERVIEW = '[data-testid="overview-dps-curve"]'

interface Leg { id: string; text: string; hidden: string; pressed: string; rect: { x: number; y: number; w: number; h: number }; cut: { sw: number; cw: number }; hit: string; clip: string[] }
interface Chart { present: boolean; text?: string; legend?: Leg[]; lines?: string[]; overlaps?: string[]; peak?: { text: string; cut: unknown; hit: string; clip: string[] } | null; ymax?: { text: string } | null; rolling?: { text: string; cut: unknown; clip: string[] } | null; bodyCut?: unknown; headText?: string; headCut?: unknown; cardRect?: unknown; captions?: { text: string; cut: { sw: number; cw: number }; clip: string[] }[] }

function brief(c: Chart): Record<string, unknown> {
  if (!c.present) return { present: false }
  return {
    head: c.headText,
    legend: (c.legend ?? []).map((l) => `${l.id}="${l.text}"${l.hidden === '1' ? '(hidden)' : ''} ${String(Math.round(l.rect.x))}..${String(Math.round(l.rect.x + l.rect.w))}@${String(Math.round(l.rect.y))} sw${String(l.cut?.sw)}/cw${String(l.cut?.cw)} ${l.hit}${l.clip.length ? ` CLIP ${l.clip.join(';')}` : ''}`),
    lines: c.lines,
    overlaps: c.overlaps,
    peak: c.peak,
    ymax: c.ymax?.text,
    rolling: c.rolling,
    bodyCut: c.bodyCut,
    headCut: c.headCut,
    cutCaptions: (c.captions ?? []).filter((k) => k.cut.sw > k.cw + 1 || k.clip.length > 0)
  }
}

async function pickFight(page: Page, id: string): Promise<void> {
  await page.click('[data-testid="segment-select"]')
  await page.waitForSelector('[data-testid="fight-picker"]', { timeout: 15_000 })
  await page.waitForSelector(`li[data-value="${id}"]`, { timeout: 15_000 })
  await page.click(`li[data-value="${id}"]`)
  await settleGone(page, '[data-testid="fight-picker"]', { timeoutMs: 8_000 })
  await sleep(800)
}

async function hoverSet(page: Page, sel: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (const fx of [0.2, 0.5, 0.8]) {
    const h = (await hoverPlot(page, sel, fx)) as { at?: unknown; tip?: { text: string; rows: string[]; rect: unknown; clip: string[] } | null; plot?: boolean }
    out.push({ fx, at: h.at, text: h.tip?.text ?? null, rows: h.tip?.rows ?? null, rect: h.tip?.rect ?? null, clip: h.tip?.clip ?? null })
  }
  await pointerAway(page)
  return out
}

async function main(): Promise<void> {
  requireBuilt()
  console.log(`fixture ${FIXTURE} fight ${FIGHT || '(default)'}`)
  const { app, close } = await launchOnFixture(FIXTURE)
  const stop = bound(close, 420_000)
  const all: Record<string, unknown> = {}
  try {
    const page = await mainWindow(app)
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await answerNotice(page)
    await captureClipboard(app)
    await openCombat(page)
    await waitHydrated(page)
    const raf = await rafFires(page, 2000)
    say('raf fires within 2s (before any shim)', raf)
    if (!raf) await shimRaf(page)
    if (FIGHT) await pickFight(page, FIGHT)

    for (const layout of LAYOUTS) {
      console.log(`\n==================== layout ${layout}`)
      const ok = await setLayoutKey(page, layout)
      say(`[${layout}] Preferences control agreed`, ok)
      say(`[${layout}] Preferences text`, await prefsPetText(page))
      await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 30_000 })
      await sleep(700)
      if (FIGHT) say(`[${layout}] selector after return`, ((await readDash(page)).selector))

      const chart = (await readChart(page)) as Chart
      say(`[${layout}] COMBAT chart`, brief(chart))
      const hov = await hoverSet(page, '')
      say(`[${layout}] COMBAT hover`, hov)
      const peakTip = await muiTip(page, `[...[...document.querySelectorAll('[data-testid="dash-panel"]')].find((p) => /DPS over time/i.test(p.innerText || '')).querySelectorAll('.MuiTypography-caption')].find((c) => / peak$/.test((c.innerText || '').trim()))`)
      say(`[${layout}] COMBAT peak tooltip`, peakTip)
      const legTip = await muiTip(page, `document.querySelector('[data-testid="chart-legend-out"]')`)
      say(`[${layout}] COMBAT legend(out) tooltip`, legTip)
      all[`${layout}.combat`] = { chart, hov, peakTip, legTip }

      const perScope: Record<string, unknown> = {}
      for (const scope of SCOPES) {
        const btn = `[data-testid="meter-scope-${scope}"]`
        if ((await page.$$(btn)).length === 0) { say(`[${layout}/${scope}] scope button`, 'ABSENT'); continue }
        await page.click(btn, { timeout: 10_000 })
        await settle(async () => (await page.$$(`${btn}.Mui-selected`)).length, (n) => n === 1, { timeoutMs: 6000 })
        await sleep(500)
        const dash = await readDash(page)
        const c2 = (await readChart(page)) as Chart
        const before = (await copied(app)).length
        const copyBtn = '[data-testid="dash-panel"] [data-testid="copy-view"]'
        let text = '(no copy button)'
        if ((await page.$$(copyBtn)).length > 0) {
          await page.locator(copyBtn).first().click({ timeout: 10_000 })
          const list = await settle(() => copied(app), (l) => l.length > before, { timeoutMs: 6000 })
          text = list.length > before ? list[list.length - 1] : '(nothing reached main)'
        }
        const h1 = (await hoverPlot(page, '', 0.5)) as { tip?: { rows: string[] } | null }
        await pointerAway(page)
        perScope[scope] = { dash, legend: (c2.legend ?? []).map((l) => l.text), peak: c2.peak?.text, copy: text, hover: h1.tip?.rows ?? null }
        say(`[${layout}/${scope}] meter head`, dash.meterHead)
        say(`[${layout}/${scope}] headline (top bar)`, dash.headline)
        say(`[${layout}/${scope}] rows`, [...(dash.rows as { text: string }[]), ...(dash.grows as { text: string }[])].map((r) => r.text))
        say(`[${layout}/${scope}] chart legend / peak / hover@0.5`, { legend: (c2.legend ?? []).map((l) => l.text), peak: c2.peak?.text, hover: h1.tip?.rows ?? null })
        say(`[${layout}/${scope}] COPIED`, text)
      }
      all[`${layout}.scopes`] = perScope
      // leave the tab on Everyone
      await page.click('[data-testid="meter-scope-everyone"]', { timeout: 10_000 }).catch(() => undefined)

      // The Timeline view's hover (its own "you + pet" row).
      const tlBtn = '[data-testid="view-toggle"] button:nth-child(2)'
      const tlDisabled = await page.evaluate(`(() => { const b = document.querySelector('${tlBtn}'); return !b || b.disabled || b.classList.contains('Mui-disabled'); })()`)
      if (!tlDisabled && layout !== 'grouped') {
        await page.click(tlBtn)
        await page.waitForSelector('svg:has(#tl-plot-clip)', { timeout: 15_000 }).catch(() => undefined)
        await sleep(600)
        const pt = (await page.evaluate(`(() => { const p = document.querySelector('svg:has(#tl-plot-clip)'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height * 0.5) }; })()`)) as { x: number; y: number } | null
        if (pt) {
          await page.mouse.move(pt.x - 3, pt.y)
          await page.mouse.move(pt.x, pt.y)
          await sleep(400)
          say(`[${layout}] TIMELINE hover`, await page.evaluate(`(() => { const t = document.querySelector('[data-testid="chart-tooltip"]'); return t ? [...t.children].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()) : null; })()`))
          await pointerAway(page)
        }
        await page.click('[data-testid="view-toggle"] button:nth-child(1)')
        await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 15_000 })
      } else if (tlDisabled) say(`[${layout}] TIMELINE`, 'button disabled for this selection')

      // The Overview glance card.
      await page.click('[data-testid="nav-overview"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="overview-grid"]', { timeout: 30_000 })
      await sleep(900)
      const ov = (await readChart(page, OVERVIEW)) as Chart
      say(`[${layout}] OVERVIEW curve card`, brief(ov))
      const ovHov = await hoverSet(page, OVERVIEW)
      say(`[${layout}] OVERVIEW hover`, ovHov)
      const ovPeak = await muiTip(page, `[...document.querySelector('${OVERVIEW}').querySelectorAll('.MuiTypography-caption')].find((c) => / peak$/.test((c.innerText || '').trim()))`)
      say(`[${layout}] OVERVIEW peak tooltip`, ovPeak)
      const ovDps = await page.evaluate(`(() => { const c = document.querySelector('[data-testid="overview-dps"]'); return c ? { label: c.querySelector('[data-testid="overview-dps-label"]')?.innerText, value: c.querySelector('[data-testid="overview-dps-value"]')?.innerText, support: c.querySelector('[data-testid="overview-dps-support"]')?.innerText, rows: [...c.querySelectorAll('[data-testid="meter-row"],[data-testid="meter-group-row"]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()), text: c.innerText.replace(/\\s+/g, ' ').trim().slice(0, 400) } : null; })()`)
      say(`[${layout}] OVERVIEW damage card`, ovDps)
      all[`${layout}.overview`] = { ov, ovHov, ovPeak, ovDps }
      await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="combat-header"]', { timeout: 30_000 })
    }

    // Its own bar + the pet line hidden in the legend: what is left to say where the pet went?
    console.log('\n==================== separate + legend toggles')
    await setLayoutKey(page, 'separate')
    await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
    await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 30_000 })
    await sleep(600)
    for (const k of ['pet', 'out']) {
      const sel = `[data-testid="chart-legend-${k}"]`
      if ((await page.$$(sel)).length === 0) { say(`legend ${k}`, 'no such entry in this fight'); continue }
      await page.click(sel)
      await sleep(400)
      const c = (await readChart(page)) as Chart
      say(`[separate] after hiding ${k}: chart`, brief(c))
      say(`[separate] after hiding ${k}: hover`, await hoverSet(page, ''))
      say(`[separate] after hiding ${k}: legend tooltip`, await muiTip(page, `document.querySelector('${sel}')`))
    }
    for (const k of ['out', 'pet']) {
      const sel = `[data-testid="chart-legend-${k}"]`
      if ((await page.$$(sel)).length > 0) await page.click(sel)
    }
    await sleep(300)
    say('legend restored', ((await readChart(page)) as Chart).legend?.map((l) => `${l.id}:${l.hidden}`))
    await setLayoutKey(page, 'nested')
    say('renderer console errors', errors.slice(0, 8))
    save(`matrix-${TAG}.json`, all)
  } finally {
    stop()
    await close()
  }
  console.log('\nprobe 2 done')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
