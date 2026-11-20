/**
 * zz-probe-sky-cleanup-0.mts: SHARED HELPERS for the sky-cleanup probes. Throwaway, never committed.
 * Not a probe itself: the numbered probes import it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, type FixtureLaunch } from './logFixture.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/sky-cleanup'

export const QUEST = 'Beastlord Test of Azarack'
export const GIVER = 'Animist Kratho'
export const ITEM = 'Azarack Skin'
export const RUNE = 'Wind Rune Heda'
export const DUMP = 'Primitive_freeport-Inventory.txt'
export const TURN_IN = [
  `You offered 1 ${ITEM} to ${GIVER}.`,
  `You offered 1 ${RUNE} to ${GIVER}.`,
  `You complete the trade with ${GIVER}.`
]

export const S = {
  navSky: '[data-testid="nav-posky"]',
  navOverview: '[data-testid="nav-overview"]',
  search: '[data-testid="posky-search"]',
  counts: '[data-testid="posky-counts"]',
  questRow: '[data-testid="posky-quest-row"]',
  summary: '[data-testid="posky-quest-row"] .MuiAccordionSummary-root',
  record: '[data-testid="posky-record-turnin"]',
  undo: '[data-testid="posky-undo-turnin"]',
  turnCount: '[data-testid="posky-turnin-count"]',
  badge: '[data-testid="posky-turned-in"]',
  tabQuests: '[data-testid="posky-tab-quests"]',
  tabCleanup: '[data-testid="posky-tab-cleanup"]',
  cleanup: '[data-testid="posky-cleanup"]',
  row: '[data-testid="posky-cleanup-row"]',
  rowEdit: '[data-testid="posky-cleanup-row"] [data-testid="posky-item-count-edit"]',
  rowInput: '[data-testid="posky-cleanup-row"] [data-testid="posky-item-count-input"] input',
  rowSave: '[data-testid="posky-cleanup-row"] [data-testid="posky-item-count-save"]',
  rowCancel: '[data-testid="posky-cleanup-row"] [data-testid="posky-item-count-cancel"]',
  source: '[data-testid="posky-count-source"]',
  hidden: '[data-testid="posky-cleanup-hand-hidden"]',
  hiddenChip: '[data-testid="posky-cleanup-hand-hidden-chip"]',
  active: '[data-testid="posky-overrides-active"]',
  override: '[data-testid="posky-item-override"]'
}

const lines: string[] = []
export function say(...parts: unknown[]): void {
  const text = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  lines.push(text)
  console.log(text)
}
export function saveLog(name: string): void {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name), lines.join('\n'), 'utf8')
}

/** Page-side measuring code, installed as a STRING so tsx never rewrites it. */
const PAGE_LIB = `
window.__m = {
  r(el) { const b = el.getBoundingClientRect(); return { x: Math.round(b.left*10)/10, y: Math.round(b.top*10)/10, w: Math.round(b.width*10)/10, h: Math.round(b.height*10)/10, r: Math.round(b.right*10)/10, b: Math.round(b.bottom*10)/10 } },
  one(el) {
    if (!el) return null
    const cs = getComputedStyle(el)
    const b = el.getBoundingClientRect()
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2
    const top = (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) ? document.elementFromPoint(cx, cy) : null
    let hit = 'off-viewport'
    if (top) hit = (el === top || el.contains(top) || top.contains(el)) ? 'self' : ('covered by ' + top.tagName + '.' + String(top.className).slice(0, 60) + ' "' + (top.textContent || '').slice(0, 30) + '"')
    const span = el.closest('span[title]')
    return {
      tag: el.tagName, testid: el.getAttribute('data-testid'),
      text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
      rect: this.r(el),
      sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      inViewport: b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5,
      hit,
      title: el.getAttribute('title'), spanTitle: span ? span.getAttribute('title') : null,
      disabled: el.disabled === true || el.classList.contains('Mui-disabled'),
      aria: Object.fromEntries([...el.attributes].filter(a => a.name.startsWith('aria-') || a.name === 'role').map(a => [a.name, a.value])),
      textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, overflow: cs.overflowX + '/' + cs.overflowY,
      data: Object.fromEntries([...el.attributes].filter(a => a.name.startsWith('data-') && a.name !== 'data-testid').map(a => [a.name, a.value]))
    }
  },
  all(sel) { return [...document.querySelectorAll(sel)].map(el => this.one(el)) },
  first(sel) { return this.one(document.querySelector(sel)) },
  vp() { return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth } },
  /** every ancestor of sel that clips: does the element stick out of it? */
  clip(sel) {
    const el = document.querySelector(sel); if (!el) return null
    const b = el.getBoundingClientRect(); const out = []
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
      const pb = p.getBoundingClientRect()
      const stick = { left: Math.round(pb.left - b.left), right: Math.round(b.right - pb.right), top: Math.round(pb.top - b.top), bottom: Math.round(b.bottom - pb.bottom) }
      out.push({ anc: p.tagName + '[' + (p.getAttribute('data-testid') || String(p.className).slice(0, 40)) + ']', overflow: cs.overflowX + '/' + cs.overflowY, sw: p.scrollWidth, cw: p.clientWidth, sh: p.scrollHeight, ch: p.clientHeight, stick })
    }
    return out
  },
  /** do any two of these elements' boxes intersect by more than 1px? */
  overlaps(sel) {
    const els = [...document.querySelectorAll(sel)]; const out = []
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect()
      if (a.width < 1 || b.width < 1) continue
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ix > 1 && iy > 1) out.push({ a: (els[i].innerText || '').slice(0, 40), b: (els[j].innerText || '').slice(0, 40), ix: Math.round(ix), iy: Math.round(iy) })
    }
    return out
  },
  cross(selA, selB) {
    const A = [...document.querySelectorAll(selA)], B = [...document.querySelectorAll(selB)]; const out = []
    for (const x of A) for (const y of B) {
      if (x === y || x.contains(y) || y.contains(x)) continue
      const a = x.getBoundingClientRect(), b = y.getBoundingClientRect()
      if (a.width < 1 || b.width < 1) continue
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ix > 1 && iy > 1) out.push({ a: (x.innerText || '').slice(0, 50), ar: this.r(x), b: (y.innerText || '').slice(0, 50), br: this.r(y), ix: Math.round(ix), iy: Math.round(iy) })
    }
    return out
  },
  dashes(sel) {
    const el = document.querySelector(sel) || document.body
    const hits = []
    const txt = el.innerText || ''
    for (const m of txt.matchAll(/[^\\n]*[\\u2013\\u2014][^\\n]*/g)) hits.push('text: ' + m[0].slice(0, 120))
    for (const t of el.querySelectorAll('[title]')) { const v = t.getAttribute('title') || ''; if (/[\\u2013\\u2014]/.test(v)) hits.push('title: ' + v.slice(0, 160)) }
    return hits
  },
  titles(sel) {
    const el = document.querySelector(sel); if (!el) return null
    return [...el.querySelectorAll('[title]')].map(t => ({ on: t.tagName + '[' + (t.getAttribute('data-testid') || '') + ']', title: t.getAttribute('title') }))
  }
}
true`

export function installLib(page: Page): Promise<unknown> {
  return page.evaluate(PAGE_LIB)
}
/** Run a page-side expression (a STRING) and return its JSON. */
export function m<T = unknown>(page: Page, expr: string): Promise<T> {
  return page.evaluate(`(() => { try { return JSON.parse(JSON.stringify(${expr} ?? null)) } catch (e) { return { error: String(e) } } })()`) as Promise<T>
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 15_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) {
    say('notice: none shown')
    return
  }
  await page.click('[data-testid="telemetry-notice-off"]')
  say('notice answered, gone =', await settleGone(page, notice, { timeoutMs: 8_000 }))
}

export interface Probe {
  launched: FixtureLaunch
  app: ElectronApplication
  page: Page
  errors: string[]
}

/** Launch, bounded by a timer that closes the app whatever the probe is doing. */
export async function withApp(
  name: string,
  budgetMs: number,
  opts: { inventory?: boolean; countSource?: string },
  body: (p: Probe) => Promise<void>
): Promise<void> {
  buildIfStale()
  const launched = await launchOnFixture('e2e-copy.log', opts.inventory === false ? {} : { inventory: DUMP })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close().catch((e: unknown) => console.log('close error', String(e)))
  }
  const timer = setTimeout(() => {
    say(`!! ${name}: budget of ${String(budgetMs)}ms spent, closing the app`)
    saveLog(`${name}.log`)
    void close().then(() => process.exit(2))
  }, budgetMs)
  const errors: string[] = []
  try {
    const page = await mainWindow(launched.app)
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector(S.navOverview, { timeout: 60_000 })
    if (opts.countSource) {
      await page.evaluate(`localStorage.setItem('eq.countSource', ${JSON.stringify(opts.countSource)})`)
    }
    await installLib(page)
    await answerNotice(page)
    await body({ launched, app: launched.app, page, errors })
    say('renderer console errors:', errors.length, errors.slice(0, 5))
  } catch (err) {
    say('!! probe threw:', String(err))
  } finally {
    clearTimeout(timer)
    saveLog(`${name}.log`)
    await close()
    say('app closed')
  }
}

export function filteredCount(page: Page): Promise<number | null> {
  return page.evaluate((sel) => {
    const hit = /(\d+) of (\d+) quests/.exec(document.querySelector(sel)?.textContent ?? '')
    return hit ? Number(hit[1]) : null
  }, S.counts)
}

export function haveText(page: Page, item: string): Promise<string | null> {
  return page.evaluate((name) => {
    const row = [...document.querySelectorAll('tr')].find((tr) =>
      (tr.cells[1]?.textContent ?? '').trim().startsWith(name)
    )
    if (!row) return null
    return /^\s*(\d+\/\d+)/.exec(row.cells[2]?.textContent ?? '')?.[1] ?? null
  }, item)
}

export async function openQuest(page: Page): Promise<boolean> {
  await page.click(S.navSky, { timeout: 30_000 })
  await page.waitForSelector(S.search, { timeout: 60_000 })
  await page.fill(`${S.search} input`, QUEST)
  const only = await settle(() => filteredCount(page), (n) => n === 1, { timeoutMs: 30_000 })
  if (only !== 1) {
    say('!! search did not narrow to one quest:', only)
    return false
  }
  await page.click(S.summary, { timeout: 15_000 })
  const have = await settle(() => haveText(page, ITEM), (v) => v !== null, { timeoutMs: 20_000 })
  say('quest open, item table have =', have)
  return have !== null
}

export async function reopenQuestPanel(page: Page): Promise<void> {
  await page.click(S.tabQuests, { timeout: 15_000 })
  await page.waitForSelector(S.summary, { timeout: 20_000 })
  const open = await page.evaluate(
    (sel) => document.querySelector(sel)?.getAttribute('aria-expanded') === 'true',
    S.summary
  )
  if (!open) await page.click(S.summary, { timeout: 15_000 })
  await settle(() => haveText(page, ITEM), (v) => v !== null, { timeoutMs: 20_000 })
}

export async function openCleanup(page: Page): Promise<void> {
  await page.click(S.tabCleanup, { timeout: 15_000 })
  await page.waitForSelector(S.cleanup, { timeout: 20_000 })
}

export interface CleanRow {
  item: string
  count: number
  text: string
}
export function cleanRows(page: Page): Promise<CleanRow[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((el) => ({
      item: el.getAttribute('data-item') ?? '',
      count: Number(el.getAttribute('data-count')),
      text: ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()
    }))
  }, S.row)
}

/** The turn-in controls as a player reads them: the count words, the three hovers, the have. */
export async function turnInState(page: Page): Promise<Record<string, unknown>> {
  return {
    count: await m(page, `window.__m.first('${S.turnCount}')?.text`),
    badge: await m(page, `(() => { const b = window.__m.first('${S.badge}'); return b ? { text: b.text, title: b.title, n: b.data['data-count'] } : null })()`),
    undo: await m(page, `(() => { const b = window.__m.first('${S.undo}'); return b ? { disabled: b.disabled, hover: b.spanTitle, loading: b.data['data-loading'] } : null })()`),
    plus: await m(page, `(() => { const b = window.__m.first('${S.record}'); return b ? { disabled: b.disabled, hover: b.title } : null })()`),
    haveSkin: await haveText(page, ITEM),
    haveRune: await haveText(page, RUNE),
    source: await m(page, `(document.querySelector('${S.source} input') || {}).value`)
  }
}

export async function pickSource(page: Page, value: string): Promise<void> {
  await page.click(`${S.source} [role="combobox"]`, { timeout: 15_000 })
  await page.waitForSelector(`li[role="option"][data-value="${value}"]`, { timeout: 10_000 })
  await page.click(`li[role="option"][data-value="${value}"]`)
  await settleGone(page, '.MuiMenu-root', { timeoutMs: 8_000 })
  await sleep(400)
}

export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<number> {
  const win = await app.browserWindow(page)
  await win.evaluate(
    (w, b) => {
      w.setMinimumSize(360, 360)
      w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
    },
    { w: width, h: height }
  )
  const got = await settle(
    () => page.evaluate(() => document.documentElement.clientWidth),
    (v) => Math.abs(v - width) <= 24,
    { timeoutMs: 15_000 }
  )
  await sleep(600)
  return got
}

export { settle, settleGone, sleep, countOf }

/** Everything a player reads on the Cleanup tab, with its boxes. */
export async function cleanupSnap(page: Page): Promise<Record<string, unknown>> {
  await page.evaluate(`(() => { const s = document.querySelector('${S.source}'); const f = s && s.parentElement && s.parentElement.children[1]; if (f) f.setAttribute('data-probe', 'fresh') })()`)
  const pick = `(x) => x && ({ text: x.text, rect: x.rect, sw: x.sw, cw: x.cw, sh: x.sh, ch: x.ch, hit: x.hit, inViewport: x.inViewport, title: x.title, ws: x.whiteSpace, to: x.textOverflow })`
  return {
    vp: await m(page, 'window.__m.vp()'),
    tab: await m(page, `(document.querySelector('${S.tabCleanup}') || {}).textContent`),
    caveat: await m(page, `(${pick})(window.__m.first('[data-testid="posky-cleanup-caveat"]'))`),
    summaryChip: await m(page, `(${pick})(window.__m.first('${S.active}'))`),
    source: await m(page, `(${pick})(window.__m.first('${S.source}'))`),
    fresh: await m(page, `(${pick})(window.__m.first('[data-probe="fresh"]'))`),
    hiddenLine: await m(page, `(${pick})(window.__m.first('${S.hidden}'))`),
    hiddenKids: await m(page, `window.__m.all('${S.hidden} > *').map(${pick})`),
    hiddenChipX: await m(page, `window.__m.all('${S.hiddenChip} .MuiChip-deleteIcon').map(x => ({ rect: x.rect, hit: x.hit, aria: x.aria }))`),
    countLine: await m(page, `(${pick})(window.__m.first('[data-testid="posky-cleanup-count"]'))`),
    empty: await m(page, `(${pick})(window.__m.first('[data-testid="posky-cleanup-empty"]'))`),
    head: await m(page, `window.__m.all('${S.cleanup} th').map(x => ({ text: x.text, rect: x.rect, sw: x.sw, cw: x.cw }))`),
    cells: await m(page, `window.__m.all('${S.row} > td').map(${pick})`),
    qtyKids: await m(page, `window.__m.all('[data-testid="posky-cleanup-qty"] > div > *').map(x => ({ tag: x.tag, testid: x.testid, text: x.text, rect: x.rect, sw: x.sw, cw: x.cw, hit: x.hit, title: x.title, aria: x.aria }))`),
    qtyOverlaps: await m(page, `window.__m.overlaps('[data-testid="posky-cleanup-qty"] > div > *')`),
    scroller: await m(page, `(() => { const t = document.querySelector('${S.cleanup}'); const sc = t && t.lastElementChild; return sc && { sw: sc.scrollWidth, cw: sc.clientWidth, sh: sc.scrollHeight, ch: sc.clientHeight, rect: window.__m.r(sc) } })()`),
    pane: await m(page, `(() => { const t = document.querySelector('${S.cleanup}'); return t && { sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight, rect: window.__m.r(t) } })()`),
    appContent: await m(page, `(() => { const t = document.querySelector('[data-testid="app-content"]'); return t && { sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight } })()`),
    freshOverHidden: await m(page, `window.__m.cross('[data-probe="fresh"]', '${S.hidden} > *')`),
    freshOverChip: await m(page, `window.__m.cross('[data-probe="fresh"]', '${S.active}')`),
    freshOverCount: await m(page, `window.__m.cross('[data-probe="fresh"]', '[data-testid="posky-cleanup-count"], [data-testid="posky-cleanup-empty"], ${S.cleanup} th')`),
    hiddenOverlaps: await m(page, `window.__m.overlaps('${S.hidden} > *')`),
    dashes: await m(page, `window.__m.dashes('${S.cleanup}')`)
  }
}

/** The open editor's parts. */
export async function editorSnap(page: Page): Promise<Record<string, unknown>> {
  return {
    input: await m(page, `(() => { const i = document.querySelector('${S.rowInput}'); if (!i) return null; const o = window.__m.one(i); return { value: i.value, focused: document.activeElement === i, type: i.type, min: i.min, max: i.max, step: i.step, valid: i.validity.valid, validationMessage: i.validationMessage, rect: o.rect, sw: o.sw, cw: o.cw, hit: o.hit, aria: o.aria, ariaInvalid: i.getAttribute('aria-invalid'), label: (i.labels && i.labels[0] ? i.labels[0].textContent : null) } })()`),
    label: await m(page, `(() => { const l = document.querySelector('${S.row} [data-testid="posky-item-count-input"] label'); if (!l) return null; const o = window.__m.one(l); return { text: o.text, rect: o.rect, sw: o.sw, cw: o.cw, hit: o.hit } })()`),
    field: await m(page, `(() => { const o = window.__m.first('${S.row} [data-testid="posky-item-count-input"]'); return o && { rect: o.rect, text: o.text } })()`),
    helper: await m(page, `window.__m.all('${S.row} .MuiFormHelperText-root').map(x => x.text)`),
    save: await m(page, `(() => { const o = window.__m.first('${S.rowSave}'); return o && { rect: o.rect, hit: o.hit, title: o.title, disabled: o.disabled, aria: o.aria } })()`),
    cancel: await m(page, `(() => { const o = window.__m.first('${S.rowCancel}'); return o && { rect: o.rect, hit: o.hit, title: o.title, disabled: o.disabled, aria: o.aria } })()`),
    cell: await m(page, `(() => { const o = window.__m.first('[data-testid="posky-cleanup-qty"]'); return o && { rect: o.rect, sw: o.sw, cw: o.cw, sh: o.sh, ch: o.ch } })()`),
    labelClip: await m(page, `window.__m.clip('${S.row} [data-testid="posky-item-count-input"] label')`),
    editorOverlaps: await m(page, `window.__m.overlaps('[data-testid="posky-cleanup-qty"] > div > *')`),
    headHeld: await m(page, `(() => { const th = [...document.querySelectorAll('${S.cleanup} th')][1]; return th && window.__m.r(th) })()`),
    alerts: await m(page, `[...document.querySelectorAll('[role="alert"], [role="status"], .MuiSnackbar-root')].map(a => (a.innerText || '').replace(/\\s+/g, ' ').slice(0, 120))`)
  }
}
