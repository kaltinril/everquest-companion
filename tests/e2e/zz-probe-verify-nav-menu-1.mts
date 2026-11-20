import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const textOf = (page: Page, selector: string): Promise<string> =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)

const MEASURE = String.raw`(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [+b.left.toFixed(1), +b.right.toFixed(1), +b.width.toFixed(1)]; };
  const out = { vw: innerWidth, drawer: r(document.querySelector('.MuiDrawer-paper')), rail: r(document.querySelector('[data-testid="prefs-rail-textsize"]')?.parentElement), search: r(document.querySelector('[data-testid="prefs-search"]')), rows: [] };
  const sec = document.querySelector('[data-testid="prefs-section-textsize"]');
  for (const st of sec.querySelectorAll('[data-testid$="-minus"]')) {
    const stepper = st.parentElement; const row = stepper.parentElement;
    const labs = [...row.querySelectorAll('.MuiTypography-body2')].filter((l) => !stepper.contains(l));
    for (const l of labs) { const cs = getComputedStyle(l); out.rows.push({ stepper: stepper.getAttribute('data-testid'), label: l.textContent.trim(), box: r(l), needs: l.scrollWidth, client: l.clientWidth, ws: cs.whiteSpace }); }
    if (labs.length === 0) out.rows.push({ stepper: stepper.getAttribute('data-testid'), label: '(none)', row: r(row), stepperBox: r(stepper) });
  }
  const card = document.querySelector('[data-testid="pref-nav-text"]').closest('.MuiPaper-outlined');
  const cs = getComputedStyle(card); out.navCard = { box: r(card), padL: cs.paddingLeft, padR: cs.paddingRight };
  return out;
})()`

async function setZoom(page: Page, want: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const shown = await textOf(page, sel('pref-text-size-value'))
    if (shown === want) break
    const end = Number(shown.replace('%', '')) < Number(want.replace('%', '')) ? 'plus' : 'minus'
    await page.click(sel(`pref-text-size-${end}`), { timeout: 10_000 })
    await settle(() => textOf(page, sel('pref-text-size-value')), (v) => v !== shown, { timeoutMs: 10_000 })
  }
  await sleep(800)
}
async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  const before = await page.evaluate(() => window.innerWidth)
  await win.evaluate((w, b) => { w.setBounds({ ...w.getBounds(), width: b.w, height: b.h }) }, { w: width, h: height })
  await settle(() => page.evaluate(() => window.innerWidth), (v) => v !== before, { timeoutMs: 6_000 })
  await sleep(800)
}

async function main(): Promise<void> {
  buildIfStale()
  const launch = await launchOnFixture('e2e-telemetry.log')
  const bomb = setTimeout(() => { console.log('TIMER'); void launch.close().finally(() => process.exit(3)) }, 3 * 60_000)
  try {
    const page = await mainWindow(launch.app)
    await page.waitForSelector(sel('nav-preferences'), { timeout: 60_000 })
    await page.waitForSelector(sel('telemetry-notice'), { timeout: 30_000 }).catch(() => undefined)
    if ((await countOf(page, sel('telemetry-notice'))) > 0) { await page.click(sel('telemetry-notice-off')); await settleGone(page, sel('telemetry-notice'), { timeoutMs: 8_000 }) }
    await page.click(sel('nav-preferences'), { timeout: 30_000 })
    await page.click(sel('prefs-rail-textsize'), { timeout: 15_000 })
    await page.waitForSelector(sel('pref-nav-text'), { timeout: 15_000 })
    await resizeTo(launch.app, page, 900, 600)
    for (const z of ['125%', '150%']) { await setZoom(page, z); console.log(z, JSON.stringify(await page.evaluate(MEASURE))) }
    await setZoom(page, '100%')
  } finally { clearTimeout(bomb); await launch.close() }
}
main().catch((e: unknown) => { console.error(e); process.exitCode = 1 })
