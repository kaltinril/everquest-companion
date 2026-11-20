// zz-probe-bazaar-buffs-0.mts: THROWAWAY helpers for the Bazaar watch / Buffs caption probes. Never committed.
import type { ElectronApplication, Page } from 'playwright-core'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINE_BIN, MAIN_ENTRY, countOf, settleGone, sleep } from './appHarness.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/bazaar-buffs'

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

/** Evaluate a string expression in the page (no tsx __name wrapping can reach it). */
export function ev<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate(expr) as Promise<T>
}

/** Shared in-page measuring helpers, as source text. */
export const LIB = `
  const f = (n) => Math.round(n * 10) / 10;
  const rc = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: f(r.left), y: f(r.top), w: f(r.width), h: f(r.height), right: f(r.right), bottom: f(r.bottom) }; };
  const hit = (el) => { if (!el) return 'absent'; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return 'collapsed'; const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre off viewport'; const top = document.elementFromPoint(cx, cy); if (!top) return 'nothing'; if (el === top || el.contains(top)) return 'hit'; if (top.contains(el)) return 'hit-ancestor ' + top.tagName; return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 60) + '#' + (top.getAttribute('data-testid') || ''); };
  const cut = (el) => el ? { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight } : null;
  const txt = (el) => el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  const inter = (a, b) => a && b && a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
  const clipBy = (el) => { const out = []; if (!el) return out; const r = el.getBoundingClientRect(); for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue; const pr = p.getBoundingClientRect(); if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) out.push((p.getAttribute('data-testid') || p.tagName) + ' ' + JSON.stringify({ x: f(pr.left), y: f(pr.top), right: f(pr.right), bottom: f(pr.bottom), ox: s.overflowX, oy: s.overflowY, sw: p.scrollWidth, cw: p.clientWidth })); } return out; };
  const style = (el, ks) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const k of ks) o[k] = s[k]; return o; };
`

/** Type into a controlled input the way a player does, then leave it (blur commits). */
export async function typeAndBlur(page: Page, sel: string, text: string): Promise<void> {
  await page.click(sel, { timeout: 15_000 })
  await page.fill(sel, text)
  await page.evaluate(`document.querySelector(${JSON.stringify(sel)}).blur()`)
  await sleep(500)
}

export { sleep }
