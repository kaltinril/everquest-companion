/**
 * sky-quests-min-window.e2e.mts - THE SKY QUEST LIST AT THE MINIMUM WINDOW (screen pass, 2026-11-19).
 *
 * The Quests tab is a column: tabs, the filter bar, the counts, then the list, which took whatever
 * was left. At 900x600 that was 54 px, and 0 px at 125% text, so a quest's "+", "-" and pencil
 * could not be clicked. The list now keeps a floor and the page scrolls instead.
 *
 * Only the running app can show this: it is how one column's heights add up in a real window. The
 * claim checked is the player's: at the minimum window, at 100% and at 125% text, the list has
 * room for a quest, and a quest row can be brought on screen and hit with the mouse.
 */

import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, check, dumpArtifacts, failures, note, reportRun, settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const LIST = '[data-testid="posky-quest-list"]'
const ROW = '[data-testid="posky-quest-row"]'
/** The floor QuestList.tsx keeps (QUEST_LIST_MIN_PX). */
const FLOOR = 240

interface Room {
  /** The list box's own height. Not clientHeight: a sideways scrollbar takes 12 px of that. */
  listH: number
  /** Does the list scroll sideways at this size? Reported in the detail, not judged here. */
  sideways: boolean
  rows: number
  /** Is the first quest row, once scrolled to, the thing under the mouse at its own middle? */
  hit: boolean
  dpr: number
}

function room(page: Page): Promise<Room | null> {
  return page.evaluate(
    ([listSel, rowSel]) => {
      const list = document.querySelector(listSel)
      const row = document.querySelector(rowSel)
      if (!list || !row) return null
      row.scrollIntoView({ block: 'center' })
      const b = row.getBoundingClientRect()
      const under = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 16))
      return {
        listH: Math.round(list.getBoundingClientRect().height),
        sideways: list.scrollWidth > list.clientWidth,
        rows: document.querySelectorAll(rowSel).length,
        hit: under !== null && row.contains(under),
        dpr: window.devicePixelRatio
      }
    },
    [LIST, ROW]
  )
}

async function stepRoomFor(page: Page, label: string): Promise<void> {
  const got = await settle(
    () => room(page),
    (v) => v !== null && v.listH >= FLOOR && v.hit,
    { timeoutMs: 10_000 }
  )
  if (got === null) {
    check(`${label}: the quest list and a quest row are on the page`, false)
    return
  }
  check(`${label}: the quest list keeps room for a quest`, got.listH >= FLOOR, JSON.stringify(got))
  check(`${label}: …and a quest row can be brought on screen and hit`, got.hit, JSON.stringify(got))
}

async function setScale(page: Page, scale: number, baseDpr: number): Promise<void> {
  await page.evaluate((s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s), scale)
  await settle(
    () => page.evaluate(() => window.devicePixelRatio),
    (dpr) => Math.abs(dpr / baseDpr - scale) < 0.02,
    { timeoutMs: 15_000 }
  )
}

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate(
    (w, b) => {
      w.setBounds({ ...w.getBounds(), width: b.width, height: b.height })
    },
    { width, height }
  )
  await settle(
    () => page.evaluate(() => window.outerWidth),
    (w) => Math.abs(w - width) <= 2,
    { timeoutMs: 10_000 }
  )
}

async function run(): Promise<void> {
  buildIfStale()
  console.log('launch: hidden Electron (EQ_E2E=1), Sky > Quests at the minimum window…')
  const { app, close, log } = await launchOnFixture('e2e-copy.log')
  let page: Page | null = null
  try {
    page = await mainWindow(app)
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await page.click('[data-testid="nav-posky"]', { timeout: 30_000 })
    await page.waitForSelector('[data-testid="posky-search"]', { timeout: 60_000 })
    await page.click('[data-testid="posky-tab-quests"]', { timeout: 15_000 })
    await page.waitForSelector(ROW, { timeout: 30_000 })
    const baseDpr = await page.evaluate(() => window.devicePixelRatio)

    await resizeTo(app, page, 900, 600)
    await stepRoomFor(page, '900x600 at 100%')
    await setScale(page, 1.25, baseDpr)
    await stepRoomFor(page, '900x600 at 125% text')
    await setScale(page, 1, baseDpr)

    if (failures.length) await dumpArtifacts(page, 'sky-quests-min-window-FAIL')
  } finally {
    await close()
    await log.dispose()
  }
  reportRun()
}

run().catch((err: unknown) => {
  console.error('e2e: harness error -', err)
  note('the sky-quests-min-window spec did not complete')
  process.exitCode = 1
})
