/**
 * THROWAWAY PROBE (never committed): the settings recovery notice, the follow-up questions.
 *
 *   A. reset state: which CSS rules decide the card's `top` (the component asks for 56),
 *      and what of the title bar and the left menu sits under the card at 100% / 125% / 150%.
 *   B. the SAME userData launched again without OK ever being pressed: does the card come back.
 *   C. a file padded with NULs that carries real settings (first-run answered, text size 125%):
 *      is "All of your settings were recovered" true, and does Enter on OK close the card.
 *
 * Run: node --import tsx tests/e2e/zz-probe-settings-notice-2.mts
 * One app at a time; every launch is closed in a finally and bounded by a timer.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, type FixtureLaunch } from './logFixture.mjs'

const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/settings-notice'
mkdirSync(OUT, { recursive: true })

const STORE = 'everquest-companion-progress.json'
const CARD = '[data-testid="settings-recovery-notice"]'
const OK = '[data-testid="settings-recovery-notice-close"]'
const FIRST_RUN = '[data-testid="telemetry-notice"]'

/** Every CSS rule that sets `top` on the card's own root, in sheet order, with its media. */
const TOP_RULES = String.raw`(() => {
  const snack = document.querySelector('[data-testid="settings-recovery-notice"]');
  if (!snack) return null;
  const found = [];
  const visit = (rules, media) => {
    for (const rule of rules) {
      if (rule.cssRules && rule.media) { visit(rule.cssRules, rule.media.mediaText); continue; }
      if (!rule.selectorText || !rule.style) continue;
      let hit = false;
      try { hit = snack.matches(rule.selectorText); } catch (e) { hit = false; }
      if (!hit) continue;
      const top = rule.style.getPropertyValue('top');
      if (top) found.push({ selector: rule.selectorText.slice(0, 60), media: media || '(none)', top, mediaMatches: media ? matchMedia(media).matches : true });
    }
  };
  for (const sheet of document.styleSheets) { try { visit(sheet.cssRules, ''); } catch (e) { /* cross-origin */ } }
  return { cls: snack.className, computedTop: getComputedStyle(snack).top, inlineTop: snack.style.top, rules: found, vw: innerWidth };
})()`

/** What of the title bar and the drawer the card is drawn over, as boxes. */
const UNDER = String.raw`(() => {
  const R = (r) => ({ x: +r.left.toFixed(1), y: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) });
  const snack = document.querySelector('[data-testid="settings-recovery-notice"]');
  if (!snack) return null;
  const ar = snack.querySelector('.MuiAlert-root').getBoundingClientRect();
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, card: R(ar), items: [] };
  const bar = document.querySelector('[data-testid="title-bar"]');
  out.titleBar = bar ? R(bar.getBoundingClientRect()) : null;
  const pool = [];
  if (bar) for (const el of bar.querySelectorAll('button, [role="combobox"], [role="button"], img, svg')) pool.push(['title bar', el]);
  const drawer = document.querySelector('.MuiDrawer-paper');
  if (drawer) for (const el of drawer.querySelectorAll('svg, .MuiChip-root, .MuiListItemText-primary')) pool.push(['left menu', el]);
  for (const [where, el] of pool) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    let ink = r;
    if (el.classList && el.classList.contains('MuiListItemText-primary')) { const g = document.createRange(); g.selectNodeContents(el); ink = g.getBoundingClientRect(); }
    const ox = Math.min(ar.right, ink.right) - Math.max(ar.left, ink.left);
    const oy = Math.min(ar.bottom, ink.bottom) - Math.max(ar.top, ink.top);
    if (ox <= 0.5 || oy <= 0.5) continue;
    const near = el.closest('[data-testid]');
    const label = el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.innerText || '').trim().slice(0, 30) || el.tagName;
    out.items.push({ where, what: label + (near && near !== el ? ' in [' + near.getAttribute('data-testid') + ']' : ''), box: R(ink), hiddenPx: +ox.toFixed(1) + 'x' + +oy.toFixed(1), ofPx: +ink.width.toFixed(1) + 'x' + +ink.height.toFixed(1) });
  }
  return out;
})()`

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  await sleep(1_200)
}

async function setScale(page: Page, scale: number, baseDpr: number): Promise<void> {
  await page.evaluate(
    (s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s),
    scale
  )
  await settle(() => page.evaluate(() => window.devicePixelRatio), (d) => Math.abs(d / baseDpr - scale) < 0.01, {
    timeoutMs: 10_000
  })
  await sleep(900)
}

/** One bounded launch: the body runs, the app is always closed. */
async function withApp(userData: string, label: string, body: (app: ElectronApplication, page: Page) => Promise<void>): Promise<void> {
  console.log(`\n===== launch ${label} on ${userData}`)
  const launched: FixtureLaunch = await launchOnFixture('e2e-voice.log', { userData })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  const bound = setTimeout(() => {
    console.log('probe: time bound reached, closing the app')
    void close().finally(() => process.exit(2))
  }, 150_000)
  try {
    const page = await mainWindow(launched.app)
    await page.waitForSelector('[data-testid="nav-alerts"]', { timeout: 60_000 })
    await body(launched.app, page)
  } finally {
    clearTimeout(bound)
    await close()
    console.log(`===== launch ${label} closed`)
  }
}

const notice = (page: Page): Promise<unknown> =>
  page.evaluate(() =>
    (window as unknown as { eq: { getSettingsRecoveryNotice: () => Promise<unknown> } }).eq.getSettingsRecoveryNotice()
  )

async function main(): Promise<void> {
  buildIfStale()
  const record: Record<string, unknown> = {}

  // ---------------------------------------------------------------- A + B: reset, then relaunch
  const dirA = makeUserData()
  writeFileSync(join(dirA, STORE), '{\n\t"byCharacter": {\n\t\t"Primitive": {\n\t\t\t"lev', 'utf8')
  try {
    await withApp(dirA, 'A (cut-off file, no backup)', async (app, page) => {
      await settle(() => countOf(page, CARD), (n) => n > 0, { timeoutMs: 15_000 })
      await sleep(1_500)
      const base = await page.evaluate(() => window.devicePixelRatio)
      const rules = await page.evaluate(TOP_RULES)
      console.log(`STEP A1 the rules that set the card's top: ${JSON.stringify(rules, undefined, 1)}`)
      record.topRules = rules
      const under: Record<string, unknown> = {}
      under['1280x860 @100%'] = await page.evaluate(UNDER)
      await resizeTo(app, page, 900, 600)
      under['900x600 @100%'] = await page.evaluate(UNDER)
      await setScale(page, 1.25, base)
      under['900x600 @125%'] = await page.evaluate(UNDER)
      await setScale(page, 1.5, base)
      under['900x600 @150%'] = await page.evaluate(UNDER)
      for (const [k, v] of Object.entries(under)) console.log(`STEP A2 under the card at ${k}: ${JSON.stringify(v)}`)
      record.under = under
      await setScale(page, 1, base)
      await resizeTo(app, page, 1280, 860)
      console.log(`STEP A3 leaving WITHOUT pressing OK; card count ${String(await countOf(page, CARD))}`)
    })

    await withApp(dirA, 'B (the same userData, next launch)', async (_app, page) => {
      await sleep(8_000)
      const count = await countOf(page, CARD)
      const files = readdirSync(dirA).filter((n) => n.startsWith('everquest-companion-progress'))
      console.log(`STEP B1 next launch: card count ${String(count)}; main's notice ${JSON.stringify(await notice(page))}`)
      console.log(`STEP B2 files: ${JSON.stringify(files)}; first-run notice on screen: ${String(await countOf(page, FIRST_RUN))}`)
      record.nextLaunch = { count, files }
    })
  } finally {
    await removeUserData(dirA)
  }

  // ---------------------------------------------------------------- C: NUL-padded, real settings
  const dirC = makeUserData()
  const whole = JSON.stringify(
    {
      schemaVersion: 14,
      byCharacter: {},
      uiScale: 1.25,
      telemetry: { enabled: false, noticeShown: true, analyticsId: null }
    },
    undefined,
    '\t'
  )
  writeFileSync(join(dirC, STORE), `${whole}\u0000\u0000\u0000\u0000\u0000\u0000`, 'utf8')
  try {
    await withApp(dirC, 'C (NUL-padded file that carries settings)', async (_app, page) => {
      const count = await settle(() => countOf(page, CARD), (n) => n > 0, { timeoutMs: 15_000 })
      console.log(`STEP C1 card count ${String(count)}; main's notice ${JSON.stringify(await notice(page))}`)
      const live = JSON.parse(readFileSync(join(dirC, STORE), 'utf8')) as Record<string, unknown>
      const dpr = await page.evaluate(() => window.devicePixelRatio)
      const scale = await page.evaluate(() =>
        (window as unknown as { eq: { getUiScale: () => Promise<number> } }).eq.getUiScale()
      )
      console.log(
        `STEP C2 live store after the repair: uiScale=${JSON.stringify(live.uiScale)} telemetry=${JSON.stringify(live.telemetry)}; the window: dpr ${String(dpr)}, stored text size ${String(scale)}; first-run notice on screen: ${String(await countOf(page, FIRST_RUN))}`
      )
      console.log(`  kept copy exists: ${String(existsSync(join(dirC, 'everquest-companion-progress.corrupt.json')))}`)
      await sleep(1_200)
      const box = await page.evaluate(() => {
        const a = document.querySelector('[data-testid="settings-recovery-notice"] .MuiAlert-root')
        const r = a?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight } : null
      })
      console.log(`  card box at the restored 125%: ${JSON.stringify(box)}`)

      // The keyboard: focus OK, press Enter, time the card leaving (polled in the page, no click wait).
      await page.focus(OK)
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
      const t0 = Date.now()
      await page.keyboard.press('Enter')
      const left = await settle(() => countOf(page, CARD), (n) => n === 0, { timeoutMs: 8_000, pollMs: 50 })
      console.log(`STEP C3 focus on "${focused}", Enter pressed: card count ${String(left)} after ${String(Date.now() - t0)} ms; main's notice now ${JSON.stringify(await notice(page))}`)
      record.keyboard = { focused, left }
    })
  } finally {
    await removeUserData(dirC)
  }

  writeFileSync(join(OUT, 'probe2.json'), JSON.stringify(record, undefined, 2), 'utf8')
  console.log('probe: done, no app left running')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
