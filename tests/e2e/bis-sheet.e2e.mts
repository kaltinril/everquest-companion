/**
 * The gear area's Best in slot tab (Malkil and the owner, 2026-11-24; plans/2026-11-24-bis-sheet.md),
 * driven in a hidden window. The scoring, the defaults and the sheet are unit-tested
 * (tests/tierWeights.test.mts, tests/bisSheet.test.mts, tests/bisView.test.mts); what only a window
 * can prove is the chain:
 *
 *   1. the tab sits between Gear and Recommended and mounts the board and the sheet;
 *   2. the board draws the seven lanes and a chip per stat; clicking a chip opens its menu, and
 *      picking Off moves the chip to the Doesn't count lane and marks the board edited;
 *   3. the sheet fills (a card per cell, most with an item) and reads the staged
 *      `/outputfile inventory` dump's worn items;
 *   4. the choice survives a relaunch on the same profile (`eq.gear.tiers`), and Reset brings the
 *      default back;
 *   5. the Gear tab's BEST header says it is scored by the tier list.
 *
 * Runs on the committed `Primitive_freeport-Inventory.txt` dump, as gear.e2e.mts does.
 *
 * Run: `npm run test:e2e -- bis-sheet`
 */
import type { Page } from 'playwright-core'
import { buildIfStale, check, countOf, dumpArtifacts, failures, reportRun, settle } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'

const NAV = '[data-testid="nav-gear"]'
const TAB = '[data-testid="tab-bis"]'
const VIEW = '[data-testid="bis-view"]'
const CELL = '[data-testid="bis-cell"]'
const CELL_ITEM = '[data-testid="bis-cell-item"]'
const WORN = '[data-testid="bis-cell-worn"]'
const CHIP_AGI = '[data-testid="bis-chip-AGI"]'
const OFF_LANE = '[data-testid="bis-lane-Off"]'
const EDITED = '[data-testid="bis-edited"]'
const RESET = '[data-testid="bis-reset"]'
const DUMP_FIXTURE = 'Primitive_freeport-Inventory.txt'

const until = (fn: () => Promise<boolean>, ms: number): Promise<boolean> => settle(fn, (ok) => ok, { timeoutMs: ms })

/** The gear area's tab ids, in bar order. */
async function tabOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('[data-testid^="tab-"]')].map((el) => el.getAttribute('data-testid') ?? ''))
}

async function openTab(page: Page): Promise<boolean> {
  await page.waitForSelector(NAV, { timeout: 60_000 })
  await page.click(NAV, { timeout: 15_000 })
  if (!(await until(async () => (await countOf(page, TAB)) === 1, 30_000))) return false
  await page.click(TAB, { timeout: 15_000 })
  return until(async () => (await countOf(page, VIEW)) === 1 && (await countOf(page, CELL)) === 23, 60_000)
}

async function stepFirstRun(page: Page): Promise<void> {
  check('the Best in slot tab mounts the board and 23 cells', await openTab(page))
  const order = await tabOrder(page)
  check('…between Gear and Recommended', order.indexOf('tab-bis') === order.indexOf('tab-gear') + 1 && order.indexOf('tab-plan') === order.indexOf('tab-bis') + 1, order.join(' '))
  check('the board draws seven lanes', (await countOf(page, '[data-testid^="bis-lane-"]')) === 7)
  check('most cells have an item', (await countOf(page, CELL_ITEM)) >= 18, String(await countOf(page, CELL_ITEM)))
  check('the worn items come from the staged dump', (await countOf(page, WORN)) > 0)

  await page.click(CHIP_AGI, { timeout: 15_000 })
  check('a chip opens its menu', await until(async () => (await countOf(page, '[data-testid="bis-chip-menu"]')) === 1, 10_000))
  await page.click('[data-testid="bis-menu-Off"]', { timeout: 15_000 })
  check('Off moves the chip to the Doesn\'t count lane', await until(async () => (await countOf(page, `${OFF_LANE} ${CHIP_AGI}`)) === 1, 10_000))
  check('…and the board reads edited', (await countOf(page, EDITED)) === 1)
}

async function stepRelaunch(page: Page): Promise<void> {
  check('after a relaunch the tab opens', await openTab(page))
  check('the edited board came back (eq.gear.tiers)', (await countOf(page, `${OFF_LANE} ${CHIP_AGI}`)) === 1)
  await page.click(RESET, { timeout: 15_000 })
  check('Reset brings the default back', await until(async () => (await countOf(page, EDITED)) === 0, 10_000))

  await page.click('[data-testid="tab-gear"]', { timeout: 15_000 })
  const title = await settle(
    () => page.evaluate(() => document.querySelector('[data-col="BIS"]')?.getAttribute('title') ?? null),
    (t) => t !== null,
    { timeoutMs: 30_000 }
  )
  check('the Gear tab\'s BEST header says it reads the tier list (when the column is shown)', title === null || title.includes('tier list'), String(title))
}

async function launchAndRun(log: ReturnType<typeof stageFixture>, userData: string, step: (page: Page) => Promise<void>, name: string): Promise<void> {
  const app = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(app.app)
    await step(page)
    if (failures.length) await dumpArtifacts(page, `${name}-FAIL`)
  } finally {
    await app.close()
  }
}

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  const log = stageFixture('e2e-planner.log', { inventory: DUMP_FIXTURE })
  try {
    await launchAndRun(log, userData, stepFirstRun, 'bis-sheet-first')
    await launchAndRun(log, userData, stepRelaunch, 'bis-sheet-relaunch')
  } finally {
    await removeUserData(userData)
    await log.dispose()
  }
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error -', err)
  process.exitCode = 1
})
