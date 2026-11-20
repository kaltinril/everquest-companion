/**
 * THROWAWAY PROBE 3 (never committed).
 *   STEP 1  what the Preferences search shows for the words printed on the Left menu card
 *   STEP 2  every labelled stepper row on the Appearance page at 150% in the minimum window
 *           (and at 125% minimum for comparison): is the label's box wide enough to show it
 *   STEP 3  110% at the default window, the shipped menu: which rows the player can see
 *
 * Run: node --import tsx tests/e2e/zz-probe-nav-menu-3.mts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/nav-menu'

const lines: string[] = []
function say(s: string): void {
  lines.push(s)
  console.log(s)
}
const sel = (id: string): string => `[data-testid="${id}"]`
const textOf = (page: Page, selector: string): Promise<string> =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)

/* Page-side, as strings (no esbuild rewriting). */
const CARDS = String.raw`(() => {
  const out = [];
  for (const sec of document.querySelectorAll('[data-testid^="prefs-section-"]')) {
    for (const card of sec.querySelectorAll('.MuiPaper-outlined')) {
      const h = card.querySelector('.MuiTypography-subtitle2');
      if (!h) continue;
      const r = card.getBoundingClientRect();
      out.push({ section: sec.getAttribute('data-testid'), label: h.innerText.trim(), y: +r.top.toFixed(0), hasNav: !!card.querySelector('[data-testid="pref-nav-text"]'), note: (card.querySelector('[data-testid="pref-nav-note"]') || {}).innerText || '' });
    }
  }
  const pane = document.querySelector('[data-testid="prefs-search"]');
  let root = pane; for (let i = 0; i < 6 && root && root.parentElement; i++) root = root.parentElement;
  return { cards: out, paneText: out.length === 0 && root ? root.innerText.replace(/\n+/g, ' | ').slice(0, 400) : '' };
})()`

const LABELS = String.raw`(() => {
  const out = [];
  const sec = document.querySelector('[data-testid="prefs-section-textsize"]');
  if (!sec) return out;
  for (const card of sec.querySelectorAll('.MuiPaper-outlined')) {
    const h = card.querySelector('.MuiTypography-subtitle2');
    const cr = card.getBoundingClientRect();
    for (const st of card.querySelectorAll('[data-testid$="-minus"]')) {
      const stepper = st.parentElement;
      const rowEl = stepper.parentElement;
      const label = rowEl.querySelector(':scope > .MuiTypography-root');
      const sr = stepper.getBoundingClientRect();
      const o = { card: h ? h.innerText.trim() : '', stepper: stepper.getAttribute('data-testid'), stepperX: +sr.left.toFixed(1), stepperR: +sr.right.toFixed(1), cardX: +cr.left.toFixed(1), cardR: +cr.right.toFixed(1), aria: st.getAttribute('aria-label') };
      if (label && label !== stepper) {
        const lr = label.getBoundingClientRect();
        const cs = getComputedStyle(label);
        o.label = label.innerText.trim() || label.textContent.trim();
        o.labelBoxW = +lr.width.toFixed(1); o.labelNeeds = label.scrollWidth; o.labelClient = label.clientWidth; o.ws = cs.whiteSpace; o.to = cs.textOverflow; o.ov = cs.overflow;
      } else { o.label = '(no label element beside it)'; }
      out.push(o);
    }
  }
  return out;
})()`

const VISIBLE_ROWS = String.raw`(() => {
  const paper = document.querySelector('.MuiDrawer-paper');
  const pr = paper.getBoundingClientRect();
  const seen = [], hidden = [];
  for (const row of paper.querySelectorAll('[data-testid^="nav-"]')) {
    const r = row.getBoundingClientRect();
    if (r.height < 1) continue;
    const name = row.innerText.replace(/\n+/g, ' / ');
    if (r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5) seen.push(name);
    else hidden.push(name + ' (' + (r.bottom - pr.bottom).toFixed(1) + 'px past the drawer foot)');
  }
  const chip = paper.lastElementChild.lastElementChild.getBoundingClientRect();
  return { drawer: paper.clientHeight, menu: paper.scrollHeight, bar: paper.offsetWidth - paper.clientWidth - 1, seen: seen.length, hidden, versionLinePast: +(chip.bottom - pr.bottom).toFixed(1), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
})()`

async function setZoom(page: Page, want: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const shown = await textOf(page, sel('pref-text-size-value'))
    if (shown === want) break
    const end = Number(shown.replace('%', '')) < Number(want.replace('%', '')) ? 'plus' : 'minus'
    await page.click(sel(`pref-text-size-${end}`), { timeout: 10_000 })
    await settle(() => textOf(page, sel('pref-text-size-value')), (v) => v !== shown, { timeoutMs: 10_000 })
  }
  await sleep(700)
}

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  const before = await page.evaluate(() => window.innerWidth)
  await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  await settle(() => page.evaluate(() => window.innerWidth), (v) => v !== before, { timeoutMs: 6_000 })
  await sleep(800)
}

async function main(): Promise<void> {
  buildIfStale()
  const launch = await launchOnFixture('e2e-telemetry.log')
  const bomb = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void launch.close().finally(() => process.exit(3))
  }, 4 * 60_000)
  try {
    const page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    const notice = '[data-testid="telemetry-notice"]'
    await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
    if ((await countOf(page, notice)) > 0) {
      await page.click('[data-testid="telemetry-notice-off"]')
      await settleGone(page, notice, { timeoutMs: 8_000 })
    }
    await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
    await page.click('[data-testid="prefs-rail-textsize"]', { timeout: 15_000 })
    await page.waitForSelector('[data-testid="pref-nav-text"]', { timeout: 15_000 })

    // STEP 1: the search, with the words the card itself prints and the words of the request.
    for (const q of ['row height', 'Row height', 'row', 'height', 'left menu', 'Left menu', 'text size', 'menu text', 'menu size', 'taller', 'compact', 'sidebar', 'spacing']) {
      await page.fill('[data-testid="prefs-search"] input', q)
      await sleep(700)
      const got = (await page.evaluate(CARDS)) as { cards: { section: string; label: string; y: number; hasNav: boolean; note: string }[]; paneText: string }
      const nav = got.cards.find((c) => c.hasNav)
      say(`STEP 1 search "${q}": ${nav ? 'Left menu card SHOWN' : 'Left menu card NOT SHOWN'}; cards in order: ${got.cards.map((c) => `${c.label}@${String(c.y)}`).join(', ') || 'none'}${got.paneText ? `; the pane reads: ${got.paneText}` : ''}${nav ? `; its note: "${nav.note}"; "In-app text size" card on screen above it: ${String(got.cards.some((c) => c.label === 'In-app text size' && c.y < nav.y))}` : ''}`)
    }
    await page.fill('[data-testid="prefs-search"] input', '')
    await sleep(500)
    await page.click('[data-testid="prefs-rail-textsize"]', { timeout: 15_000 })
    await page.waitForSelector('[data-testid="pref-nav-text"]', { timeout: 15_000 })

    // STEP 3 first (default window): 110%, the shipped menu.
    await setZoom(page, '110%')
    say(`STEP 3 110% default window, menu at 14px/28px, drawer at its top: ${JSON.stringify(await page.evaluate(VISIBLE_ROWS))}`)
    await setZoom(page, '100%')
    say(`STEP 3 100% default window for comparison: ${JSON.stringify(await page.evaluate(VISIBLE_ROWS))}`)

    // STEP 2: the labels at the minimum window, 125% then 150%.
    await resizeTo(launch.app, page, 900, 600)
    for (const zoom of ['100%', '125%', '150%']) {
      await setZoom(page, zoom)
      const vp = await page.evaluate(() => `${String(window.innerWidth)}x${String(window.innerHeight)} dpr ${String(window.devicePixelRatio)}`)
      say(`STEP 2 minimum window ${zoom} (CSS viewport ${vp}):`)
      for (const row of (await page.evaluate(LABELS)) as Record<string, unknown>[]) say(`  ${JSON.stringify(row)}`)
    }
    await setZoom(page, '100%')
    await resizeTo(launch.app, page, 1280, 860)
  } finally {
    clearTimeout(bomb)
    await launch.close()
    writeFileSync(join(OUT, 'probe3-lines.txt'), lines.join('\n'))
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
