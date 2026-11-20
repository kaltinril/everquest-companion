/**
 * THROWAWAY PROBE HELPERS (never committed): Preferences, the Summarize and archive log card.
 * Shared by zz-probe-log-archive-card-<n>.mts. Not a spec: nothing here launches the app by itself.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { countOf, settle, settleGone, sleep } from './appHarness.mjs'
import type { FixtureLog } from './logFixture.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/log-archive-card'
mkdirSync(OUT, { recursive: true })

export const CARD = '[data-testid="pref-log-archive"]'
const STATE_FILE = join(OUT, 'stage.json')

export interface Stage {
  installDir: string
  logPath: string
  userData: string
  others: Record<string, string>
}

export function saveStage(s: Stage): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, undefined, 2))
}

export function loadStage(): Stage {
  if (!existsSync(STATE_FILE)) throw new Error('no staged install: run scenario a first')
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Stage
}

/** A FixtureLog over an install an earlier run staged, so a relaunch reads the same folder. */
export function asFixture(s: Stage): FixtureLog {
  return {
    installDir: s.installDir,
    logPath: s.logPath,
    others: s.others,
    append: () => 0,
    appendAt: () => 0,
    dispose: async () => undefined
  }
}

export const archiveDir = (s: Stage): string => join(s.installDir, 'Logs', 'companion-archive')

/* The page-side reading, as a STRING so tsx/esbuild never rewrites it. */
const MEASURE = String.raw`(() => {
  const R = (r) => ({ x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) });
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth };
  const card = document.querySelector('[data-testid="pref-log-archive"]');
  out.present = !!card;
  out.loading = Array.from(document.querySelectorAll('.MuiTypography-root')).some((p) => p.textContent === 'Loading\u2026');
  if (!card) return out;
  let sc = card.parentElement;
  while (sc && sc !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) break; sc = sc.parentElement; }
  if (sc === document.body) sc = null;
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
  const els = Array.from(card.querySelectorAll('.MuiTypography-root, button, .MuiAlert-root, .MuiAlert-message, .MuiSwitch-root'));
  const hits = new Map();
  for (const el of els) { if (el.matches('button, .MuiSwitch-root')) { el.scrollIntoView({ block: 'center' }); hits.set(el, hit(el)); } }
  card.scrollIntoView({ block: 'start' });
  const cr = card.getBoundingClientRect();
  out.card = R(cr); out.cardSW = card.scrollWidth; out.cardCW = card.clientWidth;
  const scr = sc ? sc.getBoundingClientRect() : null;
  out.scroller = sc ? { rect: R(scr), sw: sc.scrollWidth, cw: sc.clientWidth, sh: sc.scrollHeight, ch: sc.clientHeight, ox: getComputedStyle(sc).overflowX, id: sc.getAttribute('data-testid') || sc.tagName } : null;
  out.items = els.map((el, i) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const rg = document.createRange(); rg.selectNodeContents(el);
    const rects = Array.from(rg.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
    const tops = []; let inkL = 1e9, inkR = -1e9;
    for (const q of rects) { if (!tops.some((t) => Math.abs(t - q.top) < 2)) tops.push(q.top); inkL = Math.min(inkL, q.left); inkR = Math.max(inkR, q.right); }
    const kind = el.matches('button') ? 'button' : el.matches('.MuiAlert-root') ? 'alert' : el.matches('.MuiAlert-message') ? 'alertmsg' : el.matches('.MuiSwitch-root') ? 'switch' : 'text';
    const leaf = !el.querySelector('.MuiTypography-root, button');
    const input = el.querySelector('input');
    const titled = el.getAttribute('title') || (el.querySelector('[title]') ? el.querySelector('[title]').getAttribute('title') : '');
    return { i, kind, leaf, testid: el.getAttribute('data-testid') || '', variant: (String(el.className).match(/MuiTypography-(body1|body2|caption|overline)/) || [])[1] || '', severity: (String(el.className).match(/MuiAlert-color(\w+)/) || [])[1] || '', text: (el.innerText || el.textContent || '').trim(), title: titled || '', rect: R(r), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, lines: tops.length, inkL: +inkL.toFixed(1), inkR: +inkR.toFixed(1), ws: cs.whiteSpace, to: cs.textOverflow, ov: cs.overflow, wb: cs.wordBreak, ow: cs.overflowWrap, font: cs.fontSize, color: cs.color, disabled: el.disabled === true, ariaDisabled: el.getAttribute('aria-disabled'), checked: input ? input.checked : null, hit: hits.get(el) || null, outCardX: r.left < cr.left - 0.5 || r.right > cr.right + 0.5, inkOutCardX: rects.length > 0 && (inkL < cr.left - 0.5 || inkR > cr.right + 0.5), outViewX: r.left < -0.5 || r.right > innerWidth + 0.5, outScrollerX: scr ? (r.left < scr.left - 0.5 || r.right > scr.right + 0.5) : false };
  });
  out.overlaps = [];
  const leafs = els.map((el, i) => ({ el, i })).filter(({ el }) => !el.matches('.MuiAlert-message') && (el.matches('button, .MuiAlert-root, .MuiSwitch-root') || !el.querySelector('.MuiTypography-root, button')));
  for (let a = 0; a < leafs.length; a++) for (let b = a + 1; b < leafs.length; b++) {
    const A = leafs[a].el, B = leafs[b].el; if (A.contains(B) || B.contains(A)) continue;
    const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
    if (ra.width < 1 || rb.width < 1) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 1 && oy > 1) out.overlaps.push({ a: leafs[a].i, b: leafs[b].i, ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
  }
  out.text = card.innerText;
  return out;
})()`

export interface Item {
  i: number
  kind: string
  leaf: boolean
  testid: string
  variant: string
  severity: string
  text: string
  title: string
  rect: { x: number; y: number; w: number; h: number; r: number; b: number }
  sw: number
  cw: number
  sh: number
  ch: number
  lines: number
  inkL: number
  inkR: number
  ws: string
  to: string
  ov: string
  wb: string
  font: string
  disabled: boolean
  ariaDisabled: string | null
  checked: boolean | null
  hit: string | null
  outCardX: boolean
  inkOutCardX: boolean
  outViewX: boolean
  outScrollerX: boolean
}

export interface Reading {
  vw: number
  vh: number
  dpr: number
  docSW: number
  docCW: number
  present: boolean
  loading: boolean
  card?: Item['rect']
  cardSW?: number
  cardCW?: number
  scroller?: { rect: Item['rect']; sw: number; cw: number; sh: number; ch: number; ox: string; id: string } | null
  items?: Item[]
  overlaps?: { a: number; b: number; ox: number; oy: number }[]
  text?: string
}

export const measure = (page: Page): Promise<Reading> => page.evaluate(MEASURE) as Promise<Reading>

/** What is wrong with one item, by measurement; empty when nothing is. */
function flags(it: Item): string[] {
  const f: string[] = []
  if (it.kind !== 'switch' && it.sw > it.cw + 1) f.push(`CUT-X scroll ${String(it.sw)} > client ${String(it.cw)}`)
  if (it.kind !== 'switch' && it.sh > it.ch + 1) f.push(`CUT-Y scroll ${String(it.sh)} > client ${String(it.ch)}`)
  if (it.outCardX) f.push('BOX-OUTSIDE-CARD')
  if (it.inkOutCardX) f.push(`INK-OUTSIDE-CARD ink ${String(it.inkL)}..${String(it.inkR)}`)
  if (it.outViewX) f.push('OUTSIDE-VIEWPORT-X')
  if (it.outScrollerX) f.push('OUTSIDE-SCROLLER-X')
  if (it.hit !== null && it.hit !== 'self') f.push(`HIT ${it.hit}`)
  if (/[\u2013\u2014]/.test(it.text)) f.push('DASH')
  if (it.to === 'ellipsis') f.push('ELLIPSIS-STYLE')
  return f
}

/** Print one reading; answers how many flags it raised. */
export function show(tag: string, r: Reading, record: Record<string, unknown>): number {
  record[tag] = r
  console.log(`\n[${tag}] viewport ${String(r.vw)}x${String(r.vh)} css px, dpr ${String(r.dpr)}, doc scroll ${String(r.docSW)}/${String(r.docCW)}, card present ${String(r.present)}, loading ${String(r.loading)}`)
  if (!r.present || r.items === undefined) return 0
  const s = r.scroller
  console.log(`  card ${JSON.stringify(r.card)} scroll ${String(r.cardSW)}/${String(r.cardCW)}; scroller ${s ? `${s.id} ${JSON.stringify(s.rect)} w ${String(s.sw)}/${String(s.cw)} h ${String(s.sh)}/${String(s.ch)} ox=${s.ox}` : 'none'}`)
  let n = 0
  for (const it of r.items) {
    if (it.kind === 'text' && !it.leaf) continue
    if (it.kind === 'alertmsg') continue
    const f = flags(it)
    n += f.length
    const ctl = it.kind === 'button' ? ` disabled=${String(it.disabled)}` : it.kind === 'switch' ? ` checked=${String(it.checked)}` : ''
    const sev = it.severity ? ` severity=${it.severity}` : ''
    console.log(`  #${String(it.i)} ${it.kind}${it.variant ? `/${it.variant}` : ''}${it.testid ? ` [${it.testid}]` : ''}${ctl}${sev} x${String(it.rect.x)} y${String(it.rect.y)} w${String(it.rect.w)} h${String(it.rect.h)} lines ${String(it.lines)} font ${it.font}${it.hit ? ` hit=${it.hit}` : ''}${f.length ? `  <<< ${f.join('; ')}` : ''}`)
    console.log(`       "${it.text.replace(/\n/g, ' / ')}"${it.title ? `  (title: ${it.title})` : ''}`)
  }
  const ov = r.overlaps ?? []
  if (ov.length > 0) {
    n += ov.length
    for (const o of ov) console.log(`  <<< OVERLAP #${String(o.a)} with #${String(o.b)}: ${String(o.ox)} x ${String(o.oy)} px`)
  }
  console.log(`  flags: ${String(n)}`)
  return n
}

export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  await settle(
    () => page.evaluate(() => Math.round(window.innerWidth * window.devicePixelRatio)),
    (v) => Math.abs(v - width) <= 40,
    { timeoutMs: 10_000 }
  )
  await sleep(700)
}

export async function setScale(page: Page, scale: number, baseDpr: number): Promise<number> {
  await page.evaluate(
    (s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s),
    scale
  )
  const got = await settle(
    () => page.evaluate(() => window.devicePixelRatio),
    (d) => Math.abs(d / baseDpr - scale) < 0.01,
    { timeoutMs: 10_000 }
  )
  await sleep(700)
  return got
}

/** The four sizes: default, the 900x600 minimum, 125% at the minimum, 125% at the default. */
export async function sweep(app: ElectronApplication, page: Page, tag: string, record: Record<string, unknown>, baseDpr: number): Promise<number> {
  let n = 0
  n += show(`${tag} | default 1280x860`, await measure(page), record)
  await resizeTo(app, page, 900, 600)
  n += show(`${tag} | minimum 900x600`, await measure(page), record)
  await setScale(page, 1.25, baseDpr)
  n += show(`${tag} | minimum 900x600 at 125%`, await measure(page), record)
  await resizeTo(app, page, 1280, 860)
  n += show(`${tag} | default 1280x860 at 125%`, await measure(page), record)
  await setScale(page, 1, baseDpr)
  return n
}

/** Only the two tight sizes, for the states that differ by one sentence. */
export async function sweepTight(app: ElectronApplication, page: Page, tag: string, record: Record<string, unknown>, baseDpr: number): Promise<number> {
  let n = 0
  n += show(`${tag} | default 1280x860`, await measure(page), record)
  await resizeTo(app, page, 900, 600)
  await setScale(page, 1.25, baseDpr)
  n += show(`${tag} | minimum 900x600 at 125%`, await measure(page), record)
  await setScale(page, 1, baseDpr)
  await resizeTo(app, page, 1280, 860)
  return n
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]', { timeout: 15_000 }).catch((e: unknown) => {
    console.log(`  first-run notice click failed: ${String(e).slice(0, 160)}`)
  })
  console.log(`  first-run notice answered: gone=${String(await settleGone(page, notice, { timeoutMs: 8_000 }))}`)
}

/** Preferences, the Game section, the card drawn (not "Loading"). */
export async function openCard(page: Page): Promise<boolean> {
  await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="prefs-rail-game"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-game"]', { timeout: 20_000 })
  const n = await settle(() => countOf(page, CARD), (c) => c > 0, { timeoutMs: 15_000 })
  return n > 0
}

/** Leave the card and come back, so it asks main for its state again (it reads once, on mount). */
export async function reopenCard(page: Page): Promise<boolean> {
  await page.click('[data-testid="prefs-rail-combat"]', { timeout: 20_000 })
  await settleGone(page, CARD, { timeoutMs: 8_000 })
  await page.click('[data-testid="prefs-rail-game"]', { timeout: 20_000 })
  const n = await settle(() => countOf(page, CARD), (c) => c > 0, { timeoutMs: 15_000 })
  return n > 0
}

export interface Status {
  enabled: boolean
  dir: string
  live: { path: string; bytes: number; modifiedMs: number } | null
  segments: { id: string; state: string; archivePath: string | null; firstStamp: string; lastStamp: string; logBytes: number; gzBytes: number | null }[]
  archived: { id: string }[]
  newestSealedId: string | null
  held: { id: string; text: string }[]
  skipped: { file: string; reason: string }[]
  rotateBlockers: string[]
  autoPaused: boolean
  busy: string | null
}

export const ipcStatus = (page: Page): Promise<Status> =>
  page.evaluate(() => (window as unknown as { eq: { logArchiveStatus: () => Promise<unknown> } }).eq.logArchiveStatus()) as Promise<Status>

export function brief(s: Status): string {
  return JSON.stringify({ enabled: s.enabled, live: s.live ? { bytes: s.live.bytes } : null, segments: s.segments.map((x) => `${x.id}:${x.state}`), archived: s.archived.length, newest: s.newestSealedId, held: s.held, skipped: s.skipped, blockers: s.rotateBlockers, autoPaused: s.autoPaused, busy: s.busy })
}

/** The card's result line (the MUI Alert), once it is no longer "Working". */
export async function waitMessage(page: Page, timeoutMs = 60_000): Promise<string> {
  return settle(
    () => page.evaluate((sel) => (document.querySelector(`${sel} .MuiAlert-message`) as HTMLElement | null)?.innerText ?? '', CARD),
    (t) => t !== '' && !t.startsWith('Working'),
    { timeoutMs, pollMs: 100 }
  )
}

export const cardText = (page: Page): Promise<string> =>
  page.evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText ?? '<no card>', CARD)

/** A launch that is always closed: by the caller's finally, or by this timer. */
export function bounded(close: () => Promise<void>, ms: number): { done: () => void } {
  const t = setTimeout(() => {
    console.log('probe: time bound reached, closing the app')
    void close().finally(() => process.exit(2))
  }, ms)
  return { done: () => clearTimeout(t) }
}

/** Start every launch from 100% text and the default window, whatever an earlier launch saved. */
export async function normalize(app: ElectronApplication, page: Page): Promise<number> {
  await page.evaluate(() => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(1))
  await sleep(800)
  await resizeTo(app, page, 1280, 860)
  return page.evaluate(() => window.devicePixelRatio)
}
