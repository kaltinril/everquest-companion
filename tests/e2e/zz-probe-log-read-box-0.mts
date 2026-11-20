/**
 * THROWAWAY PROBE HELPERS (never committed): the box under "Reading log..." (LogReadReport.tsx).
 * Shared by zz-probe-log-read-box-<n>.mts. Nothing here launches the app by itself.
 */
import { mkdirSync } from 'node:fs'
import type { ElectronApplication, Page } from 'playwright-core'
import { countOf, settle, settleGone, sleep } from './appHarness.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/log-read-box'
mkdirSync(OUT, { recursive: true })

export const BOX = '[data-testid="log-read-report"]'

/* The page-side reading, as a STRING so tsx/esbuild never rewrites it. `PANEL` is replaced. */
const MEASURE = String.raw`(() => {
  const R = (r) => ({ x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) });
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth, docSH: document.documentElement.scrollHeight, docCH: document.documentElement.clientHeight };
  const panel = document.querySelector('PANEL');
  out.panelPresent = !!panel;
  const boxes = document.querySelectorAll('[data-testid="log-read-report"]');
  out.boxCount = boxes.length;
  const box = panel ? panel.querySelector('[data-testid="log-read-report"]') : null;
  out.boxPresent = !!box;
  const content = document.querySelector('[data-testid="app-content"]');
  out.content = content ? { rect: R(content.getBoundingClientRect()), sw: content.scrollWidth, cw: content.clientWidth, sh: content.scrollHeight, ch: content.clientHeight, st: content.scrollTop } : null;
  if (panel) {
    out.panel = R(panel.getBoundingClientRect()); out.panelSW = panel.scrollWidth; out.panelCW = panel.clientWidth; out.panelSH = panel.scrollHeight; out.panelCH = panel.clientHeight;
    out.panelOverflow = getComputedStyle(panel).overflow;
    out.panelText = panel.innerText;
    out.spinner = panel.querySelectorAll('.MuiCircularProgress-root').length;
    out.skeletons = panel.querySelectorAll('.MuiSkeleton-root').length;
  }
  if (!box) return out;
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 'collapsed';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre outside the viewport (' + cx.toFixed(0) + ',' + cy.toFixed(0) + ')';
    const top = document.elementFromPoint(cx, cy);
    if (!top) return 'nothing';
    if (el.contains(top) || top.contains(el)) return 'self';
    const near = top.closest('[data-testid]');
    return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 60) + ' [' + (near ? near.getAttribute('data-testid') : '') + ']';
  };
  const br = box.getBoundingClientRect();
  const pr = panel.getBoundingClientRect();
  out.box = R(br); out.boxSW = box.scrollWidth; out.boxCW = box.clientWidth; out.boxSH = box.scrollHeight; out.boxCH = box.clientHeight;
  out.boxText = box.innerText;
  out.boxOutPanel = br.left < pr.left - 0.5 || br.right > pr.right + 0.5 || br.top < pr.top - 0.5 || br.bottom > pr.bottom + 0.5;
  out.boxOutView = br.left < -0.5 || br.right > innerWidth + 0.5 || br.top < -0.5 || br.bottom > innerHeight + 0.5;
  if (content) { const c = content.getBoundingClientRect(); out.boxOutContent = br.left < c.left - 0.5 || br.right > c.right + 0.5 || br.top < c.top - 0.5 || br.bottom > c.bottom + 0.5; }
  out.boxHit = hit(box);
  const els = Array.from(box.querySelectorAll('.MuiTypography-root'));
  out.items = els.map((el, i) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const rg = document.createRange(); rg.selectNodeContents(el);
    const rects = Array.from(rg.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
    const tops = []; let inkL = 1e9, inkR = -1e9, inkB = -1e9;
    for (const q of rects) { if (!tops.some((t) => Math.abs(t - q.top) < 2)) tops.push(q.top); inkL = Math.min(inkL, q.left); inkR = Math.max(inkR, q.right); inkB = Math.max(inkB, q.bottom); }
    return { i, text: (el.innerText || el.textContent || '').trim(), rect: R(r), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, lines: tops.length, inkL: +inkL.toFixed(1), inkR: +inkR.toFixed(1), ws: cs.whiteSpace, to: cs.textOverflow, ov: cs.overflow, wb: cs.wordBreak, font: cs.fontSize, family: cs.fontFamily.slice(0, 24), hit: hit(el), outBoxX: r.left < br.left - 0.5 || r.right > br.right + 0.5, inkOutBoxX: rects.length > 0 && (inkL < br.left - 0.5 || inkR > br.right + 0.5), outBoxY: r.top < br.top - 0.5 || r.bottom > br.bottom + 0.5 };
  });
  out.overlaps = [];
  for (let a = 0; a < els.length; a++) for (let b = a + 1; b < els.length; b++) {
    const ra = els[a].getBoundingClientRect(), rb = els[b].getBoundingClientRect();
    if (ra.width < 1 || rb.width < 1) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 1 && oy > 1) out.overlaps.push({ a, b, ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
  }
  // The row stacks (label + value), top to bottom: do two rows share vertical space?
  const rows = Array.from(box.children).map((c) => c.getBoundingClientRect());
  out.rowOverlaps = [];
  for (let a = 0; a + 1 < rows.length; a++) { const d = rows[a].bottom - rows[a + 1].top; if (d > 1) out.rowOverlaps.push({ a, b: a + 1, by: +d.toFixed(1) }); }
  // Anything else on the page drawn across the box (a card, a notice)?
  out.crossing = [];
  for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
    if (el.contains(box) || box.contains(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const ox = Math.min(r.right, br.right) - Math.max(r.left, br.left), oy = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
    if (ox > 1 && oy > 1) out.crossing.push({ id: el.getAttribute('data-testid'), rect: R(r), pos: getComputedStyle(el).position });
  }
  return out;
})()`

export type Reading = Record<string, any>

export function measure(page: Page, panelSel: string): Promise<Reading> {
  return page.evaluate(MEASURE.replace('PANEL', panelSel.replace(/'/g, "\\'"))) as Promise<Reading>
}

/** Print one reading in a form a person can check by eye. */
export function show(tag: string, m: Reading): void {
  console.log(`\n── ${tag}`)
  console.log(`   viewport ${String(m.vw)}x${String(m.vh)} dpr ${String(m.dpr)}; doc scrollWidth ${String(m.docSW)} / clientWidth ${String(m.docCW)}; content ${JSON.stringify(m.content)}`)
  console.log(`   panel present ${String(m.panelPresent)}; boxes on page ${String(m.boxCount)}; box in panel ${String(m.boxPresent)}`)
  if (m.panelPresent) console.log(`   panel ${JSON.stringify(m.panel)} sw/cw ${String(m.panelSW)}/${String(m.panelCW)} sh/ch ${String(m.panelSH)}/${String(m.panelCH)} overflow ${String(m.panelOverflow)} spinner ${String(m.spinner)} skeletons ${String(m.skeletons)}`)
  if (!m.boxPresent) {
    if (m.panelPresent) console.log(`   panel text: ${JSON.stringify(m.panelText)}`)
    return
  }
  console.log(`   box ${JSON.stringify(m.box)} sw/cw ${String(m.boxSW)}/${String(m.boxCW)} sh/ch ${String(m.boxSH)}/${String(m.boxCH)} outPanel ${String(m.boxOutPanel)} outView ${String(m.boxOutView)} outContent ${String(m.boxOutContent)} hit ${String(m.boxHit)}`)
  for (const it of m.items as Reading[]) {
    const flags = [
      it.sw > it.cw + 1 ? `CUT-X sw ${String(it.sw)} > cw ${String(it.cw)}` : '',
      it.sh > it.ch + 1 ? `CUT-Y sh ${String(it.sh)} > ch ${String(it.ch)}` : '',
      it.outBoxX ? 'OUT-BOX-X' : '',
      it.inkOutBoxX ? 'INK-OUT-BOX-X' : '',
      it.outBoxY ? 'OUT-BOX-Y' : '',
      it.hit !== 'self' ? `HIT ${String(it.hit)}` : ''
    ].filter(Boolean)
    console.log(`   [${String(it.i).padStart(2)}] ${JSON.stringify(it.text)}  x ${String(it.rect.x)} y ${String(it.rect.y)} w ${String(it.rect.w)} h ${String(it.rect.h)} lines ${String(it.lines)} ink ${String(it.inkL)}..${String(it.inkR)} font ${String(it.font)} ws ${String(it.ws)} wb ${String(it.wb)} to ${String(it.to)} ${flags.join(' | ')}`)
  }
  console.log(`   element overlaps: ${JSON.stringify(m.overlaps)}; row overlaps: ${JSON.stringify(m.rowOverlaps)}; crossing: ${JSON.stringify(m.crossing)}`)
}

/** Words that must never be on screen: a full path, the Windows user name, a long dash. */
export function privacy(tag: string, text: string, extra: readonly string[] = []): void {
  const bad: string[] = []
  for (const [name, re] of [
    ['windows user name', /jerem/i],
    ['Users folder', /[\\/]Users[\\/]/i],
    ['AppData', /AppData/i],
    ['drive path', /[A-Za-z]:[\\/]/],
    ['temp stage dir', /everquest-companion-e2e/i],
    ['em or en dash', /[\u2013\u2014]/]
  ] as const) {
    const m = re.exec(text)
    if (m) bad.push(`${name}: ${JSON.stringify(text.slice(Math.max(0, m.index - 40), m.index + 60))}`)
  }
  for (const e of extra) if (e && text.includes(e)) bad.push(`contains ${JSON.stringify(e)}`)
  console.log(`   privacy/dash scan [${tag}]: ${bad.length === 0 ? 'clean' : `FOUND ${bad.join(' || ')}`}`)
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  console.log(`   first-run notice answered: gone=${String(await settleGone(page, notice, { timeoutMs: 8_000 }))}`)
}

/** Resize through the app's own window; the minimum is lowered only so 900 can be asked for. */
export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<number> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  const got = await settle(
    () => page.evaluate(() => window.outerWidth),
    (v) => Math.abs(v - width) <= 24,
    { timeoutMs: 15_000 }
  )
  await sleep(700)
  return got
}

export async function windowFacts(app: ElectronApplication, page: Page): Promise<string> {
  const win = await app.browserWindow(page)
  return JSON.stringify(await win.evaluate((w) => ({ bounds: w.getBounds(), min: w.getMinimumSize(), content: w.getContentBounds(), zoom: w.webContents.getZoomFactor() })))
}

/** The app's own text size (Preferences, Text size): the same IPC the stepper calls. */
export async function setScale(page: Page, scale: number): Promise<string> {
  const before = await page.evaluate(() => window.devicePixelRatio)
  const stored = await page.evaluate((s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s), scale)
  const after = await settle(() => page.evaluate(() => window.devicePixelRatio), (v) => (scale === 1 ? Math.abs(v - before) > 0.001 || v === before : Math.abs(v - before) > 0.001), { timeoutMs: 8_000 }).catch(() => -1)
  await sleep(700)
  return `stored ${String(stored)}; dpr ${String(before)} -> ${String(after)}; innerWidth ${String(await page.evaluate(() => window.innerWidth))}`
}

/** A timer that closes the app if the probe runs away. */
export function bounded(close: () => Promise<void>, ms: number): { done: () => void } {
  const t = setTimeout(() => {
    console.log(`probe: BOUND of ${String(ms)} ms hit, closing the app`)
    void close().then(() => process.exit(2))
  }, ms)
  return { done: () => clearTimeout(t) }
}

export function ipcReport(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => (window as unknown as { eq: { logReadReport: () => Promise<Record<string, unknown>> } }).eq.logReadReport())
}

/** What a tab's content area says, squeezed to one line. */
export function contentText(page: Page): Promise<string> {
  return page.evaluate(() => ((document.querySelector('[data-testid="app-content"]') as HTMLElement | null)?.innerText ?? '(no app-content)').replace(/\s*\n\s*/g, ' / '))
}
