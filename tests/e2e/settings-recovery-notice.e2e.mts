/**
 * settings-recovery-notice.e2e.mts - THE "YOUR SETTINGS FILE WAS DAMAGED" CARD, IN THE REAL WINDOW
 * (screen pass, 2026-11-19).
 *
 * The card's words are pinned in tests/settingsRecovery.test.mts. What only the running app can
 * show is where it is drawn: the component asked for 56 px from the top and got 24, because MUI's
 * own rule for a top-anchored Snackbar sits inside a media query and won. The card covered the
 * bottom 16 px of the title bar.
 *
 * ONE LAUNCH on a settings file cut off mid-write, which is the damage a crash leaves. The app must
 * come up, say so in the card, draw the card clear of the title bar at the default window and at
 * the minimum one, and take the card away on OK.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, check, countOf, dumpArtifacts, failures, note, reportRun, settle } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const CARD = '[data-testid="settings-recovery-notice"]'
/** The settings file's name, spelled out as telemetry.e2e.mts does: STORE_NAME lives in main. */
const STORE_FILE = 'everquest-companion-progress.json'
/** A file cut off mid-write. */
const CUT_OFF = '{\n\t"byCharacter": {\n\t\t"Primitive": {\n\t\t\t"lev'

interface Placed {
  cardTop: number
  barBottom: number
  cssTop: string
}

function placed(page: Page): Promise<Placed | null> {
  return page.evaluate((sel) => {
    const card = document.querySelector(sel)
    const bar = document.querySelector('[data-testid="title-bar"]')
    if (!card || !bar) return null
    return {
      cardTop: card.getBoundingClientRect().top,
      barBottom: bar.getBoundingClientRect().bottom,
      cssTop: getComputedStyle(card).top
    }
  }, CARD)
}

async function stepClearOfTheTitleBar(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate(
    (w, b) => {
      w.setBounds({ ...w.getBounds(), width: b.width, height: b.height })
    },
    { width, height }
  )
  const at = `at ${String(width)}x${String(height)}`
  // The resize lands a moment later; the reading that matters is the settled one.
  const got = await settle(
    () => placed(page),
    (v) => v !== null && v.cardTop >= v.barBottom + 8,
    { timeoutMs: 10_000 }
  )
  if (got === null) {
    check(`${at}: the card and the title bar are both on the page`, false)
    return
  }
  check(`${at}: the card is drawn under the title bar, with a gap`, got.cardTop >= got.barBottom + 8, JSON.stringify(got))
  check(`${at}: …at the offset the component asks for`, got.cssTop === '56px', JSON.stringify(got))
}

interface Fit {
  cardLeft: number
  cardRight: number
  cardWidth: number
  cardBottom: number
  menuRight: number
  viewW: number
  viewH: number
  /** Is OK the thing under the mouse at its own middle? The first-run strip used to be. */
  okHit: boolean
}

function fit(page: Page): Promise<Fit | null> {
  return page.evaluate((sel) => {
    const card = document.querySelector(`${sel} .MuiAlert-root`)
    const menu = document.querySelector('.MuiDrawer-paper')
    const ok = document.querySelector('[data-testid="settings-recovery-notice-close"]')
    if (!card || !menu || !ok) return null
    const c = card.getBoundingClientRect()
    const b = ok.getBoundingClientRect()
    const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return {
      cardLeft: c.left,
      cardRight: c.right,
      cardWidth: c.width,
      cardBottom: c.bottom,
      menuRight: menu.getBoundingClientRect().right,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      okHit: under !== null && ok.contains(under)
    }
  }, CARD)
}

/**
 * The card over the CONTENT, at one text size in the minimum window: not on the left menu, inside
 * the window, and its OK button reachable although a reset has also brought the first-run strip
 * back along the bottom edge.
 */
async function stepFitsBesideTheMenu(page: Page, scale: number, baseDpr: number): Promise<void> {
  await page.evaluate((n) => (window as unknown as { eq: { setUiScale: (x: number) => Promise<number> } }).eq.setUiScale(n), scale)
  await settle(
    () => page.evaluate(() => window.devicePixelRatio),
    (dpr) => Math.abs(dpr / baseDpr - scale) < 0.02,
    { timeoutMs: 15_000 }
  )
  const at = `900x600 at ${String(Math.round(scale * 100))}% text`
  const got = await settle(
    () => fit(page),
    (v) => v !== null && v.cardLeft >= v.menuRight && v.okHit,
    { timeoutMs: 10_000 }
  )
  if (got === null) {
    check(`${at}: the card, the menu and OK are on the page`, false)
    return
  }
  check(`${at}: the card is beside the left menu, not over it`, got.cardLeft >= got.menuRight, JSON.stringify(got))
  check(`${at}: …inside the window`, got.cardRight <= got.viewW && got.cardBottom <= got.viewH, JSON.stringify(got))
  check(`${at}: …and its OK button can be clicked`, got.okHit, JSON.stringify(got))
}

async function run(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  writeFileSync(join(userData, STORE_FILE), CUT_OFF, 'utf8')

  console.log('launch: hidden Electron (EQ_E2E=1) on a settings file cut off mid-write…')
  const { app, close, log } = await launchOnFixture('e2e-voice.log', { userData })
  let page: Page | null = null
  try {
    page = await mainWindow(app)
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    const shown = await settle(() => countOf(page as Page, CARD), (n) => n === 1, { timeoutMs: 20_000 })
    if (check('a damaged settings file is said in a card, and the app still starts', shown === 1)) {
      await stepClearOfTheTitleBar(app, page, 1280, 860)
      // Centred over the CONTENT (from the menu's right edge to the window's), not over the window,
      // and never wider than its 520 px. The 16 px allows for the page's own scrollbar.
      const wide = await fit(page)
      const off = wide === null ? Infinity : Math.abs((wide.cardLeft + wide.cardRight) / 2 - (wide.menuRight + wide.viewW) / 2)
      check('at 1280x860: the card is centred over the content, at most 520 px wide', wide !== null && off <= 16 && wide.cardWidth <= 521, JSON.stringify(wide))
      await stepClearOfTheTitleBar(app, page, 900, 600)
      const baseDpr = await page.evaluate(() => window.devicePixelRatio)
      await stepFitsBesideTheMenu(page, 1, baseDpr)
      await stepFitsBesideTheMenu(page, 1.25, baseDpr)
      await stepFitsBesideTheMenu(page, 1.5, baseDpr)
      await page.evaluate(() => (window as unknown as { eq: { setUiScale: (x: number) => Promise<number> } }).eq.setUiScale(1))
      await page.click('[data-testid="settings-recovery-notice-close"]', { timeout: 10_000 })
      const gone = await settle(() => countOf(page as Page, CARD), (n) => n === 0, { timeoutMs: 10_000 })
      check('OK takes the card away', gone === 0)
    }
    if (failures.length) await dumpArtifacts(page, 'settings-recovery-notice-FAIL')
  } finally {
    await close()
    await log.dispose()
    await removeUserData(userData)
  }
  reportRun()
}

run().catch((err: unknown) => {
  console.error('e2e: harness error -', err)
  note('the settings-recovery-notice spec did not complete')
  process.exitCode = 1
})
