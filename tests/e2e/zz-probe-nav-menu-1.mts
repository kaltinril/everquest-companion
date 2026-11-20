/**
 * THROWAWAY PROBE (never committed): Preferences > Appearance > Left menu, every stop of both
 * ladders, at the default window and the app's minimum, at 100% and 125% text size.
 * Prints one line per cell and writes the full readings as JSON under the scratchpad.
 *
 * Run: node --import tsx tests/e2e/zz-probe-nav-menu-1.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { NAV_ROW_STEPS, NAV_TEXT_STEPS, navPx } from '../../src/shared/navMenu'

const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/nav-menu'
mkdirSync(OUT, { recursive: true })

/* The page-side reading, as a STRING so tsx/esbuild never rewrites it (no __name helper). */
const MEASURE = String.raw`(() => {
  const R = (r) => ({ x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) });
  const ink = (el) => {
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const rects = Array.from(rg.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
    const tops = [];
    for (const q of rects) { if (!tops.some((t) => Math.abs(t - q.top) < 2)) tops.push(q.top); }
    return { lines: tops.length, box: R(rg.getBoundingClientRect()) };
  };
  const part = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const k = ink(el);
    return { text: (el.innerText || el.textContent || '').trim(), rect: R(el.getBoundingClientRect()), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, font: cs.fontSize, lh: cs.lineHeight, ws: cs.whiteSpace, to: cs.textOverflow, ov: cs.overflow, lines: k.lines, ink: k.box };
  };
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 'collapsed';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre outside the viewport';
    const top = document.elementFromPoint(cx, cy);
    if (!top) return 'nothing';
    if (el.contains(top) || top.contains(el)) return 'self';
    return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 50) + ' [' + (top.getAttribute('data-testid') || (top.closest('[data-testid]') ? top.closest('[data-testid]').getAttribute('data-testid') : '')) + ']';
  };
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth, docSH: document.documentElement.scrollHeight, docCH: document.documentElement.clientHeight };
  const paper = document.querySelector('.MuiDrawer-paper');
  const pr = paper.getBoundingClientRect();
  const pcs = getComputedStyle(paper);
  out.paper = { rect: R(pr), ch: paper.clientHeight, sh: paper.scrollHeight, cw: paper.clientWidth, sw: paper.scrollWidth, ow: paper.offsetWidth, scrollTop: paper.scrollTop, ovY: pcs.overflowY, ovX: pcs.overflowX, vars: [pcs.getPropertyValue('--nav-row'), pcs.getPropertyValue('--nav-text'), pcs.getPropertyValue('--nav-icon'), pcs.getPropertyValue('--nav-icon-col')].join(' ') };
  out.rows = [];
  for (const row of paper.querySelectorAll('[data-testid^="nav-"]')) {
    const r = row.getBoundingClientRect();
    const o = { id: row.getAttribute('data-testid'), text: row.innerText.replace(/\n+/g, ' | '), rect: R(r), sw: row.scrollWidth, cw: row.clientWidth, sh: row.scrollHeight, ch: row.clientHeight, ariaDisabled: row.getAttribute('aria-disabled'), ariaLabel: row.getAttribute('aria-label'), ariaExpanded: row.getAttribute('aria-expanded'), muiDisabled: row.classList.contains('Mui-disabled'), selected: row.classList.contains('Mui-selected'), hit: hit(row) };
    o.visible = r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5 && r.bottom <= innerHeight + 0.5;
    o.primary = part(row.querySelector('.MuiListItemText-primary'));
    o.secondary = part(row.querySelector('.MuiListItemText-secondary'));
    o.heading = row.getAttribute('data-testid').startsWith('nav-group-') ? part(row.querySelector('.MuiTypography-root')) : null;
    const svg = row.querySelector('.MuiListItemIcon-root svg');
    o.icon = svg ? R(svg.getBoundingClientRect()) : null;
    const chip = row.querySelector('.MuiChip-root');
    o.chip = chip ? { text: chip.innerText.trim(), rect: R(chip.getBoundingClientRect()), sw: chip.scrollWidth, cw: chip.clientWidth } : null;
    out.rows.push(o);
  }
  const bottom = paper.lastElementChild;
  const topList = paper.firstElementChild;
  out.bottom = { rect: R(bottom.getBoundingClientRect()), topListBottom: +topList.getBoundingClientRect().bottom.toFixed(1), kids: [] };
  for (const kid of bottom.children) {
    out.bottom.kids.push({ tag: kid.tagName, cls: String(kid.className).slice(0, 40), text: (kid.innerText || '').trim().replace(/\n+/g, ' | '), rect: R(kid.getBoundingClientRect()), sw: kid.scrollWidth, cw: kid.clientWidth, sh: kid.scrollHeight, ch: kid.clientHeight });
  }
  const chipEl = bottom.lastElementChild;
  out.updateChip = { text: (chipEl.innerText || '').trim().replace(/\n+/g, ' | '), rect: R(chipEl.getBoundingClientRect()), hit: hit(chipEl), leaves: [] };
  for (const leaf of chipEl.querySelectorAll('.MuiTypography-root, button, svg')) {
    const cs = getComputedStyle(leaf);
    out.updateChip.leaves.push({ tag: leaf.tagName, text: (leaf.innerText || '').trim(), title: leaf.getAttribute('title'), aria: leaf.getAttribute('aria-label'), rect: R(leaf.getBoundingClientRect()), sw: leaf.scrollWidth, cw: leaf.clientWidth, ws: cs.whiteSpace, to: cs.textOverflow, lines: leaf.tagName === 'svg' ? 0 : ink(leaf).lines });
  }
  // The Preferences card.
  out.card = null;
  const tx = document.querySelector('[data-testid="pref-nav-text"]');
  if (tx) {
    const cardEl = tx.closest('.MuiPaper-root');
    const c = { text: cardEl ? cardEl.innerText.replace(/\n+/g, ' | ') : '', rect: cardEl ? R(cardEl.getBoundingClientRect()) : null, sw: cardEl ? cardEl.scrollWidth : 0, cw: cardEl ? cardEl.clientWidth : 0, steppers: {} };
    let sc = cardEl ? cardEl.parentElement : null;
    while (sc) { const cs = getComputedStyle(sc); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll')) break; sc = sc.parentElement; }
    c.scroller = sc ? { rect: R(sc.getBoundingClientRect()), sh: sc.scrollHeight, ch: sc.clientHeight, sw: sc.scrollWidth, cw: sc.clientWidth, scrollTop: sc.scrollTop } : null;
    for (const id of ['pref-nav-text', 'pref-nav-row']) {
      const st = document.querySelector('[data-testid="' + id + '"]');
      const rowEl = st.parentElement;
      const label = rowEl.querySelector(':scope > .MuiTypography-root');
      const minus = st.querySelector('[data-testid="' + id + '-minus"]');
      const plus = st.querySelector('[data-testid="' + id + '-plus"]');
      const value = st.querySelector('[data-testid="' + id + '-value"]');
      c.steppers[id] = {
        label: part(label), rowRect: R(rowEl.getBoundingClientRect()), rect: R(st.getBoundingClientRect()),
        value: part(value),
        minus: { text: minus.innerText.trim(), aria: minus.getAttribute('aria-label'), disabled: minus.disabled, rect: R(minus.getBoundingClientRect()), hit: hit(minus) },
        plus: { text: plus.innerText.trim(), aria: plus.getAttribute('aria-label'), disabled: plus.disabled, rect: R(plus.getBoundingClientRect()), hit: hit(plus) }
      };
    }
    c.note = part(document.querySelector('[data-testid="pref-nav-note"]'));
    out.card = c;
  }
  out.ls = { text: localStorage.getItem('eq.nav.textPx'), row: localStorage.getItem('eq.nav.rowPx') };
  return out;
})()`

/* eslint-disable @typescript-eslint/no-explicit-any */
type Reading = any

const lines: string[] = []
const defects: string[] = []
function say(s: string): void {
  lines.push(s)
  console.log(s)
}
function defect(s: string): void {
  defects.push(s)
  console.log(`  !! ${s}`)
}

const sel = (id: string): string => `[data-testid="${id}"]`

function measure(page: Page): Promise<Reading> {
  return page.evaluate(MEASURE) as Promise<Reading>
}

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate(
    (s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '',
    selector
  )
}

function isDisabled(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    (s) => (document.querySelector(s) as HTMLButtonElement | null)?.disabled === true,
    selector
  )
}

function navRowHeight(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelector('[data-testid="nav-combat"]')?.getBoundingClientRect().height ?? 0
  )
}

async function clickOrSay(page: Page, selector: string, tag: string): Promise<void> {
  try {
    await page.click(selector, { timeout: 10_000 })
  } catch (err) {
    defect(`${tag}: a real click on ${selector} did not land in 10 s (${String(err).split('\n')[0].slice(0, 140)})`)
    await page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), selector)
  }
}

/** One press of one end of one stepper; hands back what the readout prints afterwards. */
async function step(page: Page, stepper: string, end: 'minus' | 'plus', tag: string): Promise<string> {
  const value = sel(`${stepper}-value`)
  const before = await textOf(page, value)
  await clickOrSay(page, sel(`${stepper}-${end}`), tag)
  return settle(() => textOf(page, value), (v) => v !== before, { timeoutMs: 8_000 })
}

/** Walk one stepper to a stop by pressing, checking it never skips. */
async function walkTo(page: Page, stepper: string, steps: readonly number[], want: number, tag: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const shown = await textOf(page, sel(`${stepper}-value`))
    if (shown === navPx(want)) return
    const cur = Number(shown.replace('px', ''))
    const end = cur < want ? 'plus' : 'minus'
    if (await isDisabled(page, sel(`${stepper}-${end}`))) {
      defect(`${tag}: ${stepper} ${end} is disabled at ${shown} although ${navPx(want)} is further that way`)
      return
    }
    const next = await step(page, stepper, end, tag)
    const at = steps.indexOf(cur)
    const expect = steps[at + (end === 'plus' ? 1 : -1)]
    if (next !== navPx(expect)) defect(`${tag}: ${stepper} ${end} from ${shown} printed "${next}", expected ${navPx(expect)}`)
  }
}

const DASH = /[\u2013\u2014]/

/** Judge one cell's reading; returns the one-line summary. */
function judge(tag: string, m: Reading, textPx: number, rowPx: number): string {
  const p = m.paper
  const overBy = p.sh - p.ch
  const bad: string[] = []
  const live = m.rows.filter((r: Reading) => r.rect.h > 0)
  for (const r of live) {
    const isGroup = String(r.id).startsWith('nav-group-')
    if (isGroup) {
      if (r.heading && (r.heading.lines > 1 || r.heading.sw > r.heading.cw)) bad.push(`${r.id} heading wraps/cuts (${String(r.heading.lines)} lines, sw ${String(r.heading.sw)}/cw ${String(r.heading.cw)})`)
      continue
    }
    if (r.id !== 'nav-feedback' && Math.abs(r.rect.h - rowPx) >= 0.5) bad.push(`${r.id} is ${String(r.rect.h)}px tall, not ${String(rowPx)}`)
    if (r.sw > r.cw) bad.push(`${r.id} row scrollWidth ${String(r.sw)} > clientWidth ${String(r.cw)}`)
    if (r.sh > r.ch + 1) bad.push(`${r.id} row scrollHeight ${String(r.sh)} > clientHeight ${String(r.ch)}`)
    for (const key of ['primary', 'secondary']) {
      const t = r[key]
      if (!t) continue
      if (t.lines > 1) bad.push(`${r.id} ${key} "${t.text}" wraps to ${String(t.lines)} lines (ink ${String(t.ink.w)}x${String(t.ink.h)})`)
      if (t.sw > t.cw) bad.push(`${r.id} ${key} "${t.text}" cut: scrollWidth ${String(t.sw)} > clientWidth ${String(t.cw)}`)
      if (t.ink.y < r.rect.y - 0.6 || t.ink.b > r.rect.b + 0.6 || t.ink.x < r.rect.x - 0.6 || t.ink.r > r.rect.r + 0.6) bad.push(`${r.id} ${key} ink ${JSON.stringify(t.ink)} leaves its row ${JSON.stringify(r.rect)}`)
      if (r.chip && t.ink.r > r.chip.rect.x + 0.6 && t.ink.b > r.chip.rect.y && t.ink.y < r.chip.rect.b) bad.push(`${r.id} label ink runs under its "${r.chip.text}" chip (ink right ${String(t.ink.r)} > chip left ${String(r.chip.rect.x)})`)
      if (key === 'primary' && t.font !== `${String(textPx)}px`) bad.push(`${r.id} primary font is ${t.font}, not ${String(textPx)}px`)
    }
    if (r.icon && (r.icon.y < r.rect.y - 0.6 || r.icon.b > r.rect.b + 0.6)) bad.push(`${r.id} icon ${String(r.icon.h)}px leaves its ${String(r.rect.h)}px row`)
    if (r.chip && (r.chip.rect.r > r.rect.r + 0.6 || r.chip.rect.y < r.rect.y - 0.6 || r.chip.rect.b > r.rect.b + 0.6)) bad.push(`${r.id} chip leaves its row`)
    if (r.visible && r.hit !== 'self') bad.push(`${r.id} ${r.hit}`)
    if (DASH.test(r.text) || DASH.test(r.ariaLabel ?? '')) bad.push(`${r.id} carries an em/en dash`)
  }
  // rows printing on top of each other
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i].rect
      const b = live[j].rect
      const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y)
      const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x)
      if (oy > 0.6 && ox > 0.6) bad.push(`${live[i].id} and ${live[j].id} share ${String(+oy.toFixed(1))}px of height`)
    }
  }
  if (m.bottom.rect.y < m.bottom.topListBottom - 0.6) bad.push(`the bottom block starts at ${String(m.bottom.rect.y)}, above the menu list's bottom ${String(m.bottom.topListBottom)}`)
  if (p.sw > p.cw) bad.push(`the drawer scrolls sideways: scrollWidth ${String(p.sw)} > clientWidth ${String(p.cw)}`)
  const fb = live.find((r: Reading) => r.id === 'nav-feedback')
  const pf = live.find((r: Reading) => r.id === 'nav-preferences')
  const uc = m.updateChip
  for (const leaf of uc.leaves) {
    if (leaf.tag !== 'svg' && leaf.text && (leaf.sw > leaf.cw || leaf.lines > 1)) bad.push(`update line "${leaf.text}" ${leaf.lines > 1 ? `wraps to ${String(leaf.lines)} lines` : `cut ${String(leaf.sw)}>${String(leaf.cw)}`}`)
  }
  for (const b of bad) defect(`${tag}: ${b}`)
  const sbar = p.ow - p.cw - 1
  return `${tag} | drawn row ${String(live.find((r: Reading) => r.id === 'nav-combat')?.rect.h)} | drawer ${String(p.ch)} menu ${String(p.sh)} over ${String(overBy)}${overBy > 0 ? ` SCROLLS (bar ${String(sbar)}px)` : ' fits'} | feedback ${String(fb?.rect.h)}px p${String(fb?.primary?.lines)}/s${String(fb?.secondary?.lines)} vis ${String(fb?.visible)} | prefs row vis ${String(pf?.visible)} | update "${String(uc.text)}" | misfits ${String(bad.length)}`
}

/** The card's own claims at one cell. */
function judgeCard(tag: string, m: Reading, textPx: number, rowPx: number): void {
  const c = m.card
  if (!c) {
    defect(`${tag}: the Left menu card is not on screen`)
    return
  }
  const t = c.steppers['pref-nav-text']
  const r = c.steppers['pref-nav-row']
  if (t.value.text !== navPx(textPx)) defect(`${tag}: text stepper prints "${t.value.text}", the drawer is at ${navPx(textPx)}`)
  if (r.value.text !== navPx(rowPx)) defect(`${tag}: row stepper prints "${r.value.text}", the drawer is at ${navPx(rowPx)}`)
  const wantT = { minus: textPx === NAV_TEXT_STEPS[0], plus: textPx === NAV_TEXT_STEPS[NAV_TEXT_STEPS.length - 1] }
  const wantR = { minus: rowPx === NAV_ROW_STEPS[0], plus: rowPx === NAV_ROW_STEPS[NAV_ROW_STEPS.length - 1] }
  if (t.minus.disabled !== wantT.minus || t.plus.disabled !== wantT.plus) defect(`${tag}: text stepper disabled minus=${String(t.minus.disabled)} plus=${String(t.plus.disabled)} at ${navPx(textPx)}`)
  if (r.minus.disabled !== wantR.minus || r.plus.disabled !== wantR.plus) defect(`${tag}: row stepper disabled minus=${String(r.minus.disabled)} plus=${String(r.plus.disabled)} at ${navPx(rowPx)}`)
  for (const [name, s] of [['text', t], ['row', r]] as const) {
    if (s.label.sw > s.label.cw) defect(`${tag}: card label "${s.label.text}" cut: ${String(s.label.sw)} > ${String(s.label.cw)}`)
    if (s.value.sw > s.value.cw || s.value.lines > 1) defect(`${tag}: ${name} value "${s.value.text}" cut or wrapped`)
    if (c.rect && (s.rect.r > c.rect.r + 0.6 || s.rect.x < c.rect.x - 0.6)) defect(`${tag}: ${name} stepper ${JSON.stringify(s.rect)} leaves its card ${JSON.stringify(c.rect)}`)
    const overLabel = Math.min(s.label.ink.r, s.rect.r) - Math.max(s.label.ink.x, s.rect.x)
    if (overLabel > 0.6) defect(`${tag}: ${name} label ink overlaps its stepper by ${String(+overLabel.toFixed(1))}px`)
  }
  if (c.sw > c.cw) defect(`${tag}: the card scrolls sideways ${String(c.sw)} > ${String(c.cw)}`)
  if (m.docSW > m.docCW) defect(`${tag}: the page scrolls sideways ${String(m.docSW)} > ${String(m.docCW)}`)
  if (DASH.test(c.text)) defect(`${tag}: the card carries an em/en dash`)
}

interface Cell {
  config: string
  text: number
  row: number
  m: Reading
}
const cells: Cell[] = []

/** Every stop of both ladders, by real presses, snaking through the grid. */
async function walkGrid(page: Page, config: string): Promise<void> {
  say(`---- ${config} ----`)
  let up = true
  for (const text of NAV_TEXT_STEPS) {
    await walkTo(page, 'pref-nav-text', NAV_TEXT_STEPS, text, config)
    const rowStops = up ? [...NAV_ROW_STEPS] : [...NAV_ROW_STEPS].reverse()
    for (const row of rowStops) {
      const tag = `${config} text ${String(text)} row ${String(row)}`
      await walkTo(page, 'pref-nav-row', NAV_ROW_STEPS, row, tag)
      await settle(() => navRowHeight(page), (h) => Math.abs(h - row) < 0.5, { timeoutMs: 8_000 })
      await sleep(150)
      const m = await measure(page)
      cells.push({ config, text, row, m })
      say(judge(tag, m, text, row))
      judgeCard(tag, m, text, row)
    }
    up = !up
  }
}

function describeCard(config: string, m: Reading): void {
  const c = m.card
  if (!c) return
  say(`${config} CARD text: ${String(c.text)}`)
  say(`${config} CARD rect ${JSON.stringify(c.rect)} viewport ${String(m.vw)}x${String(m.vh)} dpr ${String(m.dpr)} scroller ${JSON.stringify(c.scroller)}`)
  for (const id of ['pref-nav-text', 'pref-nav-row']) {
    const s = c.steppers[id]
    say(`${config} ${id}: label "${s.label.text}" (sw ${String(s.label.sw)}/cw ${String(s.label.cw)}, ${s.label.ws}, ${s.label.to}) value "${s.value.text}" rect ${JSON.stringify(s.rect)} | minus face "${s.minus.text}" aria "${s.minus.aria}" disabled ${String(s.minus.disabled)} hit ${s.minus.hit} | plus face "${s.plus.text}" aria "${s.plus.aria}" disabled ${String(s.plus.disabled)} hit ${s.plus.hit}`)
  }
  say(`${config} NOTE "${c.note.text}" lines ${String(c.note.lines)} rect ${JSON.stringify(c.note.rect)} sw ${String(c.note.sw)}/cw ${String(c.note.cw)}`)
}

function describeDrawer(config: string, m: Reading): void {
  say(`${config} DRAWER vars ${m.paper.vars} rect ${JSON.stringify(m.paper.rect)} overflowY ${m.paper.ovY}`)
  for (const r of m.rows) {
    const t = r.primary ?? r.heading
    say(`${config}   ${r.id}: "${r.text}" row ${JSON.stringify(r.rect)} ink ${t ? `${String(t.ink.w)}x${String(t.ink.h)} @${String(t.ink.x)} font ${t.font}` : '-'}${r.secondary ? ` | second line "${r.secondary.text}" ink ${String(r.secondary.ink.w)}w in ${String(r.secondary.cw)}cw font ${r.secondary.font} lines ${String(r.secondary.lines)}` : ''}${r.chip ? ` | chip "${r.chip.text}" @${String(r.chip.rect.x)}-${String(r.chip.rect.r)}` : ''}${r.muiDisabled ? ` | DISABLED aria-label "${String(r.ariaLabel)}"` : ''} hit ${r.hit} vis ${String(r.visible)}`)
  }
  say(`${config}   bottom block ${JSON.stringify(m.bottom.rect)}; update line "${m.updateChip.text}" ${JSON.stringify(m.updateChip.rect)} hit ${m.updateChip.hit}`)
  for (const leaf of m.updateChip.leaves) say(`${config}     update leaf ${leaf.tag} "${leaf.text}" title "${String(leaf.title)}" aria "${String(leaf.aria)}" ${JSON.stringify(leaf.rect)} sw ${String(leaf.sw)}/cw ${String(leaf.cw)} lines ${String(leaf.lines)}`)
}

async function dismissNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) {
    say('no first-run notice showed')
    return
  }
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

async function openAppearance(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
  await clickOrSay(page, '[data-testid="nav-preferences"]', 'open Preferences')
  await clickOrSay(page, '[data-testid="prefs-rail-textsize"]', 'open Appearance')
  await page.waitForSelector('[data-testid="pref-nav-text"]', { timeout: 15_000 })
}

async function setZoom(page: Page, want: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const shown = await textOf(page, sel('pref-text-size-value'))
    if (shown === want) break
    const end = Number(shown.replace('%', '')) < Number(want.replace('%', '')) ? 'plus' : 'minus'
    await clickOrSay(page, sel(`pref-text-size-${end}`), `zoom to ${want}`)
    await settle(() => textOf(page, sel('pref-text-size-value')), (v) => v !== shown, { timeoutMs: 10_000 })
  }
  await sleep(600)
  const z = await page.evaluate(() => ({ dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight }))
  say(`in-app text size now prints ${await textOf(page, sel('pref-text-size-value'))}; window ${JSON.stringify(z)}`)
}

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  const before = await page.evaluate(() => window.innerWidth)
  const got = await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
    return { bounds: w.getBounds(), min: w.getMinimumSize() }
  }, { w: width, h: height })
  await settle(() => page.evaluate(() => window.innerWidth), (v) => v !== before, { timeoutMs: 8_000 })
  await sleep(800)
  const z = await page.evaluate(() => ({ dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight }))
  say(`window set to ${String(width)}x${String(height)}: bounds ${JSON.stringify(got.bounds)} app minimum ${JSON.stringify(got.min)} CSS viewport ${JSON.stringify(z)}`)
}

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  const log = stageFixture('e2e-telemetry.log')
  let closeNow: (() => Promise<void>) | null = null
  const bomb = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void (closeNow?.() ?? Promise.resolve()).finally(() => process.exit(3))
  }, 9 * 60_000)

  const consoleErrors: string[] = []
  const first = await launchOnFixture(log, { userData })
  closeNow = first.close
  try {
    const page = await mainWindow(first.app)
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })

    // STEP 0: the fresh install BEFORE anything is clicked (the notice still up).
    await page.waitForSelector('[data-testid="telemetry-notice"]', { timeout: 30_000 }).catch(() => undefined)
    const fresh = await measure(page)
    say(`STEP 0 fresh install, nothing clicked: viewport ${String(fresh.vw)}x${String(fresh.vh)} dpr ${String(fresh.dpr)} localStorage ${JSON.stringify(fresh.ls)}`)
    say(judge('STEP 0 fresh (notice up)', fresh, 14, 28))
    const noticeRect = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="telemetry-notice"]')
      if (!n) return null
      const r = n.getBoundingClientRect()
      return { x: r.left, y: r.top, r: r.right, b: r.bottom, text: (n as HTMLElement).innerText.slice(0, 80) }
    })
    say(`STEP 0 first-run notice rect ${JSON.stringify(noticeRect)}`)

    await dismissNotice(page)
    await openAppearance(page)

    // STEP 1: default window, 100%.
    const m1 = await measure(page)
    describeCard('STEP 1 default 100%', m1)
    describeDrawer('STEP 1 default 100%', m1)
    await walkGrid(page, 'A default-window 100%')

    // STEP 2: default window, 125%.
    await setZoom(page, '125%')
    await walkTo(page, 'pref-nav-text', NAV_TEXT_STEPS, 14, 'B home')
    await walkTo(page, 'pref-nav-row', NAV_ROW_STEPS, 28, 'B home')
    await sleep(300)
    const m2 = await measure(page)
    describeCard('STEP 2 default 125% (menu at its defaults)', m2)
    describeDrawer('STEP 2 default 125% (menu at its defaults)', m2)
    await walkGrid(page, 'B default-window 125%')

    // STEP 3: minimum window, 125%.
    await resizeTo(first.app, page, 900, 600)
    await walkTo(page, 'pref-nav-text', NAV_TEXT_STEPS, 14, 'C home')
    await walkTo(page, 'pref-nav-row', NAV_ROW_STEPS, 28, 'C home')
    await sleep(300)
    const m3 = await measure(page)
    describeCard('STEP 3 minimum 125% (menu at its defaults)', m3)
    describeDrawer('STEP 3 minimum 125% (menu at its defaults)', m3)
    await walkGrid(page, 'C minimum-window 125%')

    // STEP 4: minimum window, 100%.
    await setZoom(page, '100%')
    await walkTo(page, 'pref-nav-text', NAV_TEXT_STEPS, 14, 'D home')
    await walkTo(page, 'pref-nav-row', NAV_ROW_STEPS, 28, 'D home')
    await sleep(300)
    const m4 = await measure(page)
    describeCard('STEP 4 minimum 100% (menu at its defaults)', m4)
    describeDrawer('STEP 4 minimum 100% (menu at its defaults)', m4)
    await walkGrid(page, 'D minimum-window 100%')

    // STEP 5: back to the default window; choose 13px in 36px rows; reload.
    await resizeTo(first.app, page, 1280, 860)
    await walkTo(page, 'pref-nav-text', NAV_TEXT_STEPS, 13, 'E choose')
    await walkTo(page, 'pref-nav-row', NAV_ROW_STEPS, 36, 'E choose')
    await sleep(300)
    const before = await measure(page)
    say(`STEP 5 chosen 13px/36px: localStorage ${JSON.stringify(before.ls)} drawn row ${String(await navRowHeight(page))}`)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    const firstRead = await measure(page)
    say(`STEP 5 after reload, first reading: localStorage ${JSON.stringify(firstRead.ls)} vars ${firstRead.paper.vars} drawn row ${String(firstRead.rows.find((r: Reading) => r.id === 'nav-combat')?.rect.h)} font ${String(firstRead.rows.find((r: Reading) => r.id === 'nav-combat')?.primary?.font)}`)
    await openAppearance(page)
    const afterReload = await measure(page)
    say(`STEP 5 after reload, card prints text "${afterReload.card.steppers['pref-nav-text'].value.text}" row "${afterReload.card.steppers['pref-nav-row'].value.text}"`)
    say(judge('STEP 5 after reload 13/36', afterReload, 13, 36))
    judgeCard('STEP 5 after reload 13/36', afterReload, 13, 36)
    writeFileSync(join(OUT, 'probe1-cells.json'), JSON.stringify({ fresh, m1, m2, m3, m4, cells, afterReload }, null, 1))
  } finally {
    await first.close()
  }

  // STEP 6: a second launch on the same userData.
  const second = await launchOnFixture(log, { userData })
  closeNow = second.close
  try {
    const page = await mainWindow(second.app)
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    const arrived = await measure(page)
    say(`STEP 6 relaunch, nothing clicked: localStorage ${JSON.stringify(arrived.ls)} vars ${arrived.paper.vars} drawn row ${String(arrived.rows.find((r: Reading) => r.id === 'nav-combat')?.rect.h)} font ${String(arrived.rows.find((r: Reading) => r.id === 'nav-combat')?.primary?.font)} viewport ${String(arrived.vw)}x${String(arrived.vh)}`)
    await openAppearance(page)
    const m = await measure(page)
    say(`STEP 6 relaunch, card prints text "${m.card.steppers['pref-nav-text'].value.text}" row "${m.card.steppers['pref-nav-row'].value.text}"`)
    say(judge('STEP 6 relaunch 13/36', m, 13, 36))
    judgeCard('STEP 6 relaunch 13/36', m, 13, 36)
  } finally {
    await second.close()
    await removeUserData(userData)
    await log.dispose()
    clearTimeout(bomb)
  }

  say(`console errors: ${String(consoleErrors.length)} ${consoleErrors.slice(0, 3).join(' | ')}`)
  say(`DEFECT LINES: ${String(defects.length)}`)
  writeFileSync(join(OUT, 'probe1-lines.txt'), [...lines, '', 'DEFECTS', ...defects].join('\n'))
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
