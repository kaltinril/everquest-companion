// zz-probe-combat-chart-0.mts: THROWAWAY helpers for the Combat DPS chart probes. Never committed.
import type { ElectronApplication, Page } from 'playwright-core'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINE_BIN, MAIN_ENTRY, countOf, settle, settleGone, sleep } from './appHarness.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/combat-chart'

export function save(name: string, value: unknown): void {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name), typeof value === 'string' ? value : JSON.stringify(value, null, 1), 'utf8')
}

export function say(label: string, value: unknown): void {
  console.log(`\n## ${label}\n${typeof value === 'string' ? value : JSON.stringify(value)}`)
}

/** The build is used as it stands: this never builds, it only refuses to run with none. */
export function requireBuilt(): void {
  if (!existsSync(MAIN_ENTRY)) throw new Error(`no app build at ${MAIN_ENTRY}`)
  if (!existsSync(ENGINE_BIN)) throw new Error(`no engine at ${ENGINE_BIN}`)
  console.log(`build: app ${new Date(statSync(MAIN_ENTRY).mtimeMs).toISOString()} engine ${new Date(statSync(ENGINE_BIN).mtimeMs).toISOString()}`)
}

/** A timer that closes the app whatever the probe is doing. */
export function bound(close: () => Promise<void>, ms: number): () => void {
  const t = setTimeout(() => {
    console.log(`\n!! probe exceeded ${String(ms)} ms: closing the app`)
    void close().finally(() => process.exit(3))
  }, ms)
  return () => clearTimeout(t)
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 15_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<{ w: number; h: number }> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setMinimumSize(360, 360)
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  await sleep(1500)
  return page.evaluate('({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight })') as Promise<{ w: number; h: number }>
}

export async function windowBounds(app: ElectronApplication, page: Page): Promise<{ width: number; height: number; min: number[] }> {
  const win = await app.browserWindow(page)
  return win.evaluate((w) => ({ ...w.getBounds(), min: w.getMinimumSize() }))
}

export async function setScale(page: Page, scale: number): Promise<number> {
  await page.evaluate(`window.eq.setUiScale(${String(scale)})`)
  await sleep(1500)
  return page.evaluate('window.devicePixelRatio') as Promise<number>
}

export async function openCombat(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-combat"]', { timeout: 60_000 })
  await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="combat-header"]', { timeout: 30_000 })
}

/** rAF never fires in the hidden window and the chart hover is rAF-coalesced: stand a timer in. */
export async function shimRaf(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    if (window.__rafShim) return;
    window.__rafShim = true;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = (h) => clearTimeout(h);
  })()`)
}

/** Does a real animation frame arrive within `ms`? */
export function rafFires(page: Page, ms: number): Promise<boolean> {
  return page.evaluate(`new Promise((res) => { const raf = window.__rafShim ? null : requestAnimationFrame(() => res(true)); setTimeout(() => res(false), ${String(ms)}); })`) as Promise<boolean>
}

/** Pointer scale: page.mouse coordinates per CSS px (1 unless the zoom moves it). */
let K = 1
export async function calibrateMouse(page: Page): Promise<number> {
  await page.evaluate(`(() => { window.__pm = null; window.addEventListener('pointermove', (e) => { window.__pm = { x: e.clientX, y: e.clientY }; }, true); })()`)
  K = 1
  await page.mouse.move(180, 180)
  await page.mouse.move(200, 200)
  await sleep(200)
  const got = (await page.evaluate('window.__pm')) as { x: number; y: number } | null
  if (got && got.x > 0) K = 200 / got.x
  return K
}
async function mv(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x * K, y * K)
}

const LIB = `
  const f = (n) => Math.round(n * 10) / 10;
  const rc = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: f(r.left), y: f(r.top), w: f(r.width), h: f(r.height), right: f(r.right), bottom: f(r.bottom) }; };
  const textRect = (el) => { if (!el || !el.firstChild) return null; const g = document.createRange(); g.selectNodeContents(el); const r = g.getBoundingClientRect(); return { x: f(r.left), y: f(r.top), w: f(r.width), h: f(r.height), right: f(r.right), bottom: f(r.bottom) }; };
  const hit = (el) => { if (!el) return 'absent'; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return 'collapsed'; const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre off viewport'; const top = document.elementFromPoint(cx, cy); if (!top) return 'nothing'; if (el === top || el.contains(top)) return 'hit'; if (top.contains(el)) return 'hit-ancestor ' + top.tagName; return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 60) + '#' + (top.getAttribute('data-testid') || ''); };
  const cut = (el) => el ? { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight } : null;
  const txt = (el) => el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  const inter = (a, b) => a && b && a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
  const clipBy = (el) => { const out = []; if (!el) return out; const r = el.getBoundingClientRect(); for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue; const pr = p.getBoundingClientRect(); if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) out.push((p.getAttribute('data-testid') || p.tagName) + ' ' + JSON.stringify({ x: f(pr.left), y: f(pr.top), right: f(pr.right), bottom: f(pr.bottom), ox: s.overflowX, oy: s.overflowY })); } return out; };
`

/** The DPS card found by its title text within `root` ('' = the whole document). */
function chartExpr(cardSel: string): string {
  return `(() => {
    ${LIB}
    let card = null;
    const sel = ${JSON.stringify(cardSel)};
    if (sel) card = document.querySelector(sel);
    else card = [...document.querySelectorAll('[data-testid="dash-panel"]')].find((p) => /DPS over time/i.test(p.innerText || '')) || null;
    if (!card) return { present: false };
    const legend = [...card.querySelectorAll('[data-testid^="chart-legend-"]')].map((b) => {
      const label = b.querySelector('.MuiTypography-root');
      return { id: b.getAttribute('data-testid').replace('chart-legend-', ''), text: txt(b), hidden: b.getAttribute('data-hidden'), pressed: b.getAttribute('aria-pressed'), rect: rc(b), cut: cut(label), hit: hit(b), clip: clipBy(b), deco: label ? getComputedStyle(label).textDecorationLine : null };
    });
    const overlaps = [];
    for (let i = 0; i < legend.length; i++) for (let j = i + 1; j < legend.length; j++) if (inter(legend[i].rect, legend[j].rect)) overlaps.push(legend[i].id + ' x ' + legend[j].id);
    const lines = [...card.querySelectorAll('[data-testid^="dps-line-"]')].map((l) => l.getAttribute('data-testid').replace('dps-line-', ''));
    const plot = card.querySelector('[data-testid="dps-plot"]');
    const captions = [...card.querySelectorAll('.MuiTypography-caption')].map((c) => ({ text: txt(c), rect: rc(c), cut: cut(c), ws: getComputedStyle(c).whiteSpace, to: getComputedStyle(c).textOverflow, clip: clipBy(c) }));
    const peakEl = [...card.querySelectorAll('.MuiTypography-caption')].find((c) => / peak$/.test(txt(c) || ''));
    const rolling = [...card.querySelectorAll('.MuiTypography-caption')].find((c) => /rolling/.test(txt(c) || ''));
    const body = card.lastElementChild;
    const head = card.firstElementChild;
    const ymax = plot && plot.parentElement ? plot.parentElement.querySelector('.MuiTypography-caption') : null;
    return {
      present: true,
      cardRect: rc(card),
      cardCut: cut(card),
      headText: txt(head), headRect: rc(head), headCut: cut(head),
      bodyCut: cut(body), bodyOverflowY: body ? getComputedStyle(body).overflowY : null,
      text: txt(card),
      legend, overlaps, lines,
      area: card.querySelectorAll('[data-testid="dps-area"]').length,
      ticks: [...card.querySelectorAll('[data-testid="dps-tick"]')].map((t) => t.getAttribute('data-kind')),
      plotRect: rc(plot), plotHit: hit(plot),
      peak: peakEl ? { text: txt(peakEl), rect: rc(peakEl), cut: cut(peakEl), hit: hit(peakEl), clip: clipBy(peakEl) } : null,
      rolling: rolling ? { text: txt(rolling), rect: rc(rolling), cut: cut(rolling), clip: clipBy(rolling), to: getComputedStyle(rolling).textOverflow } : null,
      ymax: ymax ? { text: txt(ymax), rect: rc(ymax) } : null,
      captions,
      viewport: { w: innerWidth, h: innerHeight }
    };
  })()`
}

export function readChart(page: Page, cardSel = ''): Promise<Record<string, unknown>> {
  return page.evaluate(chartExpr(cardSel)) as Promise<Record<string, unknown>>
}

export function readHeader(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    ${LIB}
    const el = document.querySelector('[data-testid="combat-header"]');
    if (!el) return { present: false };
    const ids = ['scope-toggle', 'segment-select', 'headline-stat', 'view-toggle', 'direction-toggle', 'meter-scope', 'meter-scope-note', 'roster-open', 'stance-slot-1', 'stance-slot-2', 'stance-slot-3'];
    const parts = {};
    for (const id of ids) { const n = document.querySelector('[data-testid="' + id + '"]'); if (n) parts[id] = { text: txt(n), rect: rc(n), cut: cut(n), hit: hit(n), clip: clipBy(n) }; }
    const buttons = [...el.querySelectorAll('button')].map((b) => ({ text: txt(b) || b.getAttribute('aria-label') || '', rect: rc(b), cut: cut(b), hit: hit(b), disabled: b.disabled || b.classList.contains('Mui-disabled'), pressed: b.getAttribute('aria-pressed'), selected: b.classList.contains('Mui-selected'), clip: clipBy(b), ws: getComputedStyle(b).whiteSpace }));
    const overlaps = [];
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) { const a = buttons[i], b = buttons[j]; const ae = el.querySelectorAll('button')[i], be = el.querySelectorAll('button')[j]; if (ae.contains(be) || be.contains(ae)) continue; if (inter(a.rect, b.rect)) overlaps.push(a.text + ' x ' + b.text); }
    const lens = el.children[1];
    const lensKids = lens ? [...lens.children].map((c) => ({ tag: c.tagName, tid: c.getAttribute('data-testid'), text: (txt(c) || '').slice(0, 40), rect: rc(c) })) : [];
    return { present: true, rect: rc(el), cut: cut(el), lensRect: rc(lens), lensCut: cut(lens), lensWrap: lens ? getComputedStyle(lens).flexWrap : null, lensKids, parts, buttons, overlaps, viewport: { w: innerWidth, h: innerHeight }, dpr: devicePixelRatio, text: txt(el) };
  })()`) as Promise<Record<string, unknown>>
}

/** The four dashboard panels, the meter panel's header line and rows. */
export function readDash(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    ${LIB}
    const panels = [...document.querySelectorAll('[data-testid="dash-panel"]')].map((p) => ({ rect: rc(p), head: (txt(p.firstElementChild) || '').slice(0, 140), cut: cut(p) }));
    const meter = document.querySelectorAll('[data-testid="dash-panel"]')[0];
    const rows = [...document.querySelectorAll('[data-testid="meter-row"]')].map((r) => ({ text: txt(r), rect: rc(r) }));
    const grows = [...document.querySelectorAll('[data-testid="meter-group-row"]')].map((r) => ({ text: txt(r), rect: rc(r) }));
    const total = document.querySelector('[data-testid="meter-total"]');
    const content = document.querySelector('[data-testid="app-content"]');
    return { panels, meterHead: meter ? txt(meter.firstElementChild) : null, meterHeadCut: meter ? cut(meter.firstElementChild) : null, rows, grows, total: txt(total), headline: txt(document.querySelector('[data-testid="headline-stat"]')), selector: txt(document.querySelector('[data-testid="segment-select"]')), contentOverflow: content ? { sw: content.scrollWidth, cw: content.clientWidth, sh: content.scrollHeight, ch: content.clientHeight } : null, docOverflow: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight } };
  })()`) as Promise<Record<string, unknown>>
}

/** Move the real pointer over the DPS plot at a fraction of its box and read the chart tooltip. */
export async function hoverPlot(page: Page, cardSel: string, fx: number, fy = 0.5): Promise<Record<string, unknown>> {
  const pt = (await page.evaluate(`(() => {
    const sel = ${JSON.stringify(cardSel)};
    const card = sel ? document.querySelector(sel) : [...document.querySelectorAll('[data-testid="dash-panel"]')].find((p) => /DPS over time/i.test(p.innerText || ''));
    const plot = card ? card.querySelector('[data-testid="dps-plot"]') : null;
    if (!plot) return null;
    plot.scrollIntoView({ block: 'nearest' });
    const r = plot.getBoundingClientRect();
    const x = Math.round(r.left + r.width * ${String(fx)}), y = Math.round(r.top + r.height * ${String(fy)});
    const top = document.elementFromPoint(x, y);
    return { x, y, on: top ? (top.getAttribute('data-testid') || top.tagName) : 'nothing', inside: !!top && (plot.contains(top) || plot.parentElement.contains(top)) };
  })()`)) as { x: number; y: number; on: string; inside: boolean } | null
  if (!pt) return { plot: false }
  await mv(page, pt.x - 3, pt.y - 3)
  await mv(page, pt.x, pt.y)
  await sleep(350)
  const tip = await page.evaluate(`(() => {
    ${LIB}
    const t = document.querySelector('[data-testid="chart-tooltip"]');
    if (!t) return null;
    const rows = [...t.children].map((c) => txt(c));
    const kids = [...t.children].map((c) => ({ text: txt(c), rect: rc(c), cut: cut(c), parts: [...c.children].map((s) => txt(s)) }));
    return { text: txt(t), rows, kids, rect: rc(t), cut: cut(t), clip: clipBy(t), viewport: { w: innerWidth, h: innerHeight } };
  })()`)
  return { at: pt, tip }
}

export async function pointerAway(page: Page): Promise<void> {
  await page.mouse.move(2, 2)
  await sleep(250)
}

/** Hover an element (MUI tooltip anchor) and read the role=tooltip popper text. */
export async function muiTip(page: Page, expr: string): Promise<{ text: string | null; rect: unknown }> {
  const pt = (await page.evaluate(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`)) as { x: number; y: number } | null
  if (!pt) return { text: null, rect: 'anchor absent' }
  await mv(page, pt.x - 2, pt.y - 2)
  await mv(page, pt.x, pt.y)
  const got = await settle(
    () => page.evaluate(`(() => { ${LIB} const t = document.querySelector('[role="tooltip"]'); return t ? { text: txt(t), rect: rc(t) } : null; })()`) as Promise<{ text: string; rect: unknown } | null>,
    (v) => v !== null && (v.text ?? '') !== '',
    { timeoutMs: 4000 }
  )
  await page.mouse.move(2, 2)
  await settleGone(page, '[role="tooltip"]', { timeoutMs: 4000 })
  return got ?? { text: null, rect: null }
}

/** Replace main's clipboard writer with a capture, so the owner's real clipboard is never touched. */
export async function captureClipboard(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { __copied?: string[] }
    g.__copied = []
    ipcMain.removeHandler('clipboard:write')
    ipcMain.handle('clipboard:write', (_e, text: unknown) => {
      g.__copied?.push(String(text))
      return typeof text === 'string' && text.length > 0
    })
  })
}

export function copied(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __copied?: string[] }).__copied ?? [])
}

export async function setLayoutKey(page: Page, layout: 'nested' | 'separate' | 'grouped'): Promise<boolean> {
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="prefs-rail-combat"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-combat"]')
  const button = `[data-testid="pref-pet-layout-${layout}"]`
  await page.waitForSelector(button, { timeout: 20_000 })
  if ((await page.$$(`${button}.Mui-selected`)).length === 0) await page.click(button, { timeout: 15_000 })
  const n = await settle(async () => (await page.$$(`${button}.Mui-selected`)).length, (v) => v === 1, { timeoutMs: 8_000 })
  return n === 1
}

export function prefsPetText(page: Page): Promise<unknown> {
  return page.evaluate(`(() => { const g = document.querySelector('[data-testid="pref-pet-layout"]'); const box = g ? g.parentElement : null; return box ? { buttons: [...g.querySelectorAll('button')].map((b) => ({ t: b.innerText.trim(), sel: b.classList.contains('Mui-selected') })), hint: [...box.querySelectorAll('.MuiTypography-caption')].map((c) => c.innerText.trim()).slice(0, 2) } : null; })()`)
}
