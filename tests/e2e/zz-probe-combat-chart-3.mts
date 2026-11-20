// zz-probe-combat-chart-3.mts: WINDOW SIZE x TEXT SIZE. The Combat header's two rows, the DPS
// card and the Overview glance card at the default window, the app's minimum (900x600) and 125%.
// usage: node --import tsx tests/e2e/zz-probe-combat-chart-3.mts <fixture> [layout] [live]
//   live = a scripted open fight (you + a bound pet) fed every 2 s, started 130 s in the past, so
//          the header shows the in-combat dot and the chart scrolls ("last 2:00").
// Throwaway, never committed.
import type { Page } from 'playwright-core'
import { settle, sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, type FixtureLog } from './logFixture.mjs'
import {
  answerNotice,
  bound,
  calibrateMouse,
  hoverPlot,
  openCombat,
  pointerAway,
  rafFires,
  readChart,
  readDash,
  readHeader,
  requireBuilt,
  resizeTo,
  save,
  say,
  setLayoutKey,
  setScale,
  shimRaf
} from './zz-probe-combat-chart-0.mjs'

const FIXTURE = process.argv[2] ?? 'e2e-combat.log'
const LAYOUT = (process.argv[3] ?? 'nested') as 'nested' | 'separate' | 'grouped'
const LIVE = process.argv[4] === 'live'
const TAG = `${FIXTURE.replace(/\.log$/, '')}-${LAYOUT}${LIVE ? '-live' : ''}`
const OVERVIEW = '[data-testid="overview-dps-curve"]'

const STATES = [
  { name: '1280x860@100', w: 1280, h: 860, z: 1 },
  { name: '900x600@100', w: 900, h: 600, z: 1 },
  { name: '900x860@125', w: 900, h: 860, z: 1.25 },
  { name: '900x600@125', w: 900, h: 600, z: 1.25 },
  { name: '1280x860@125', w: 1280, h: 860, z: 1.25 }
]

interface Rect { x: number; y: number; w: number; h: number; right: number; bottom: number }
interface Btn { text: string; rect: Rect; cut: { sw: number; cw: number; sh: number; ch: number }; hit: string; disabled: boolean; selected: boolean; clip: string[] }
interface Header { present: boolean; rect: Rect; cut: { sw: number; cw: number; sh: number; ch: number }; lensRect: Rect; lensCut: { sw: number; cw: number }; lensWrap: string; lensKids: { tag: string; tid: string | null; text: string; rect: Rect }[]; parts: Record<string, { text: string; rect: Rect; cut: { sw: number; cw: number }; hit: string; clip: string[] }>; buttons: Btn[]; overlaps: string[]; viewport: { w: number; h: number }; dpr: number; text: string }

function headerBrief(h: Header): Record<string, unknown> {
  if (!h.present) return { present: false }
  const rows = [...new Set(h.buttons.map((b) => Math.round(b.rect.y + b.rect.h / 2)))].sort((a, b) => a - b)
  const bad = h.buttons.filter((b) => b.rect.right > h.rect.right + 0.5 || b.rect.x < h.rect.x - 0.5 || b.rect.right > h.viewport.w + 0.5 || b.cut.sw > b.cut.cw + 1 || (b.hit !== 'hit' && !b.disabled) || b.clip.length > 0)
  const partsBad = Object.entries(h.parts).filter(([, p]) => p.rect.right > h.rect.right + 0.5 || p.rect.right > h.viewport.w + 0.5 || p.cut.sw > p.cut.cw + 1 || p.clip.length > 0).map(([k, p]) => ({ k, text: p.text, rect: p.rect, cut: p.cut, clip: p.clip }))
  return {
    viewport: h.viewport, dpr: h.dpr,
    header: `${String(h.rect.x)}..${String(h.rect.right)} x ${String(h.rect.y)}..${String(h.rect.bottom)} (h ${String(h.rect.h)}) sw${String(h.cut.sw)}/cw${String(h.cut.cw)}`,
    lens: `${String(h.lensRect.x)}..${String(h.lensRect.right)} h ${String(h.lensRect.h)} wrap=${h.lensWrap} sw${String(h.lensCut.sw)}/cw${String(h.lensCut.cw)}`,
    buttonRowsY: rows,
    buttons: h.buttons.map((b) => `${b.text || '?'}[${String(Math.round(b.rect.x))}..${String(Math.round(b.rect.right))}@${String(Math.round(b.rect.y))}${b.selected ? ' sel' : ''}${b.disabled ? ' dis' : ''}${b.hit === 'hit' ? '' : ` ${b.hit}`}]`).join(' '),
    parts: Object.fromEntries(Object.entries(h.parts).map(([k, p]) => [k, `"${p.text}" ${String(Math.round(p.rect.x))}..${String(Math.round(p.rect.right))}@${String(Math.round(p.rect.y))}-${String(Math.round(p.rect.bottom))} sw${String(p.cut.sw)}/cw${String(p.cut.cw)} ${p.hit}`])),
    overlaps: h.overlaps,
    BAD_buttons: bad.map((b) => ({ text: b.text, rect: b.rect, cut: b.cut, hit: b.hit, clip: b.clip })),
    BAD_parts: partsBad
  }
}

interface Leg { id: string; text: string; hidden: string; rect: Rect; cut: { sw: number; cw: number }; hit: string; clip: string[] }
interface Chart { present: boolean; legend?: Leg[]; lines?: string[]; overlaps?: string[]; peak?: { text: string; rect: Rect; cut: { sw: number; cw: number }; hit: string; clip: string[] } | null; ymax?: { text: string; rect: Rect } | null; rolling?: { text: string; rect: Rect; cut: { sw: number; cw: number }; clip: string[] } | null; bodyCut?: { sw: number; cw: number; sh: number; ch: number }; headText?: string; headCut?: unknown; cardRect?: Rect; plotRect?: Rect; plotHit?: string; viewport?: { w: number; h: number }; captions?: { text: string; rect: Rect; cut: { sw: number; cw: number }; clip: string[] }[] }

function chartBrief(c: Chart): Record<string, unknown> {
  if (!c.present) return { present: false }
  return {
    card: c.cardRect, head: c.headText, headCut: c.headCut, bodyCut: c.bodyCut, plot: c.plotRect, plotHit: c.plotHit,
    legend: (c.legend ?? []).map((l) => `${l.id}="${l.text}" ${String(Math.round(l.rect.x))}..${String(Math.round(l.rect.right))}@${String(Math.round(l.rect.y))}-${String(Math.round(l.rect.bottom))} sw${String(l.cut?.sw)}/cw${String(l.cut?.cw)} ${l.hit}${l.clip.length ? ` CLIP ${l.clip.join(';')}` : ''}`),
    lines: c.lines, overlaps: c.overlaps,
    peak: c.peak ? `"${c.peak.text}" ${String(c.peak.rect.x)}..${String(c.peak.rect.right)} sw${String(c.peak.cut.sw)}/cw${String(c.peak.cut.cw)} ${c.peak.hit}${c.peak.clip.length ? ` CLIP ${c.peak.clip.join(';')}` : ''}` : null,
    ymax: c.ymax, rolling: c.rolling ? `"${c.rolling.text}" ${String(c.rolling.rect.x)}..${String(c.rolling.rect.right)}@${String(c.rolling.rect.y)} sw${String(c.rolling.cut.sw)}/cw${String(c.rolling.cut.cw)}${c.rolling.clip.length ? ` CLIP ${c.rolling.clip.join(';')}` : ''}` : null,
    cutCaptions: (c.captions ?? []).filter((k) => k.cut.sw > k.cw + 1 || k.clip.length > 0).map((k) => ({ text: k.text, rect: k.rect, cut: k.cut, clip: k.clip }))
  }
}

async function hoverSet(page: Page, sel: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (const fx of [0.08, 0.5, 0.95]) {
    const h = (await hoverPlot(page, sel, fx)) as { at?: unknown; tip?: { rows: string[]; rect: Rect; clip: string[]; viewport: { w: number; h: number }; kids: { text: string; cut: { sw: number; cw: number } }[] } | null }
    const t = h.tip
    out.push({ fx, at: h.at, rows: t?.rows ?? null, rect: t?.rect ?? null, clip: t?.clip ?? null, offViewport: t ? t.rect.right > t.viewport.w + 0.5 || t.rect.bottom > t.viewport.h + 0.5 || t.rect.x < -0.5 || t.rect.y < -0.5 : null, cutRows: t ? t.kids.filter((k) => k.cut.sw > k.cw + 1).map((k) => k.text) : null })
  }
  await pointerAway(page)
  return out
}

/** A scripted OPEN fight: you and a bound pet on one mob, a swing every 2 s from 130 s ago. */
function startLive(log: FixtureLog): () => void {
  const mob = 'a fire giant warrior'
  const t0 = Date.now() - 130_000
  log.appendAt(new Date(t0), `Vebarn told you, 'Attacking ${mob} Master.'`)
  for (let s = 1; s <= 64; s++) {
    const at = new Date(t0 + s * 2000)
    log.appendAt(at, `You crush ${mob} for ${String(30 + (s % 7) * 9)} points of damage.`, `Vebarn slashes ${mob} for ${String(20 + (s % 5) * 6)} points of damage.`)
    if (s % 4 === 0) log.appendAt(at, `${mob[0].toUpperCase()}${mob.slice(1)} hits YOU for ${String(40 + (s % 3) * 11)} points of damage.`)
  }
  let n = 0
  const timer = setInterval(() => {
    n += 1
    log.append(`You crush ${mob} for ${String(30 + (n % 7) * 9)} points of damage.`, `Vebarn slashes ${mob} for ${String(20 + (n % 5) * 6)} points of damage.`)
  }, 2000)
  return () => clearInterval(timer)
}

async function main(): Promise<void> {
  requireBuilt()
  console.log(`fixture ${FIXTURE} layout ${LAYOUT} live ${String(LIVE)}`)
  const { app, close, log } = await launchOnFixture(FIXTURE)
  const stop = bound(close, 480_000)
  let stopLive: (() => void) | null = null
  const all: Record<string, unknown> = {}
  try {
    const page = await mainWindow(app)
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await answerNotice(page)
    await openCombat(page)
    await waitHydrated(page)
    if (!(await rafFires(page, 2000))) { say('raf', 'never fired: a timer stands in'); await shimRaf(page) }
    await setLayoutKey(page, LAYOUT)
    await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
    await page.waitForSelector('[data-testid="combat-header"]', { timeout: 30_000 })
    if (LIVE) {
      stopLive = startLive(log)
      const live = await settle(() => page.evaluate(`window.eq.getCombatSnapshot({}).then((s) => ({ inCombat: s.inCombat, name: s.selected ? s.selected.name : null, active: s.selected ? s.selected.active : null, dur: s.selected ? s.selected.durationSec : null, ents: s.selected ? s.selected.entities.map((e) => e.kind + ':' + e.name + ':' + e.total) : [] }))`) as Promise<{ inCombat: boolean; active: boolean | null }>, (v) => v.inCombat && v.active === true, { timeoutMs: 20_000 })
      say('live fight', live)
    }
    // Group scope on the tab: with no roster the "(no roster yet)" note joins the lens row.
    await page.click('[data-testid="meter-scope-group"]', { timeout: 10_000 }).catch(() => undefined)
    await sleep(400)

    for (const st of STATES) {
      console.log(`\n==================== ${st.name}`)
      const dpr = await setScale(page, st.z)
      const got = await resizeTo(app, page, st.w, st.h)
      const k = await calibrateMouse(page)
      say(`[${st.name}] css viewport / dpr / mouse factor`, { got, dpr, k })
      if ((await page.$$('[data-testid="combat-header"]')).length === 0) await openCombat(page)
      await sleep(500)

      const rec: Record<string, unknown> = {}
      for (const mode of ['out', 'in', 'heal'] as const) {
        const idx = mode === 'out' ? 1 : mode === 'in' ? 2 : 3
        await page.click(`[data-testid="direction-toggle"] button:nth-child(${String(idx)})`, { timeout: 10_000 })
        await sleep(450)
        const h = (await readHeader(page)) as unknown as Header
        rec[`header.${mode}`] = h
        say(`[${st.name}] HEADER dash/${mode}`, headerBrief(h))
      }
      await page.click('[data-testid="direction-toggle"] button:nth-child(1)', { timeout: 10_000 })
      await sleep(400)
      const tlBtn = '[data-testid="view-toggle"] button:nth-child(2)'
      const tlDisabled = await page.evaluate(`(() => { const b = document.querySelector('${tlBtn}'); return !b || b.disabled || b.classList.contains('Mui-disabled'); })()`)
      if (!tlDisabled) {
        await page.click(tlBtn)
        await sleep(600)
        const h = (await readHeader(page)) as unknown as Header
        say(`[${st.name}] HEADER timeline`, headerBrief(h))
        await page.click('[data-testid="view-toggle"] button:nth-child(1)')
        await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 15_000 })
        await sleep(400)
      }

      // Every element of the header whose own text is ellipsized, and where the dashboard region sits.
      say(`[${st.name}] HEADER ellipsized text`, await page.evaluate(`(() => { const h = document.querySelector('[data-testid="combat-header"]'); const out = []; for (const el of h.querySelectorAll('*')) { const cs = getComputedStyle(el); if (cs.overflowX === 'visible') continue; if (el.scrollWidth > el.clientWidth + 1 && (el.innerText || '').trim()) out.push({ text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 80), shown: el.clientWidth, needs: el.scrollWidth, to: cs.textOverflow, title: el.getAttribute('title') || (el.closest('[title]') ? el.closest('[title]').getAttribute('title') : null) }); } return out; })()`))
      say(`[${st.name}] REGIONS`, await page.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { y: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY }; }; return { header: r('[data-testid="combat-header"]'), dashboard: r('[data-testid="combat-dashboard"]'), log: r('[data-testid="combat-log"]'), content: r('[data-testid="app-content"]'), viewport: innerHeight }; })()`))
      const dash = await readDash(page)
      say(`[${st.name}] DASH panels / overflow`, { panels: (dash.panels as { rect: Rect; head: string }[]).map((p) => `${String(p.rect.x)},${String(p.rect.y)} ${String(p.rect.w)}x${String(p.rect.h)} "${p.head.slice(0, 50)}"`), meterHead: dash.meterHead, meterHeadCut: dash.meterHeadCut, content: dash.contentOverflow, doc: dash.docOverflow })
      const chart = (await readChart(page)) as Chart
      rec.chart = chart
      say(`[${st.name}] COMBAT chart`, chartBrief(chart))
      const hov = await hoverSet(page, '')
      rec.hover = hov
      say(`[${st.name}] COMBAT hover`, hov)

      await page.click('[data-testid="nav-overview"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="overview-grid"]', { timeout: 30_000 })
      await sleep(900)
      const ov = (await readChart(page, OVERVIEW)) as Chart
      rec.overview = ov
      say(`[${st.name}] OVERVIEW curve card`, chartBrief(ov))
      const ovHov = await hoverSet(page, OVERVIEW)
      say(`[${st.name}] OVERVIEW hover`, ovHov)
      await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="combat-header"]', { timeout: 30_000 })
      all[st.name] = rec
    }

    await setScale(page, 1)
    await resizeTo(app, page, 1280, 860)
    const win = await app.browserWindow(page)
    await win.evaluate((w) => w.setMinimumSize(900, 600))
    say('renderer console errors', errors.slice(0, 8))
    save(`sizes-${TAG}.json`, all)
  } finally {
    stopLive?.()
    stop()
    await close()
  }
  console.log('\nprobe 3 done')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
