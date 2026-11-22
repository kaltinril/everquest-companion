/**
 * e2e: the Tradeskills section, second half (fork #6). Split from tradeskills.e2e.mts along its
 * own seam: everything here runs after the log's level has been raised, which is why it came
 * last there. One launch of its own, so neither half needs a longer cap than the runner's default.
 *
 * What it holds, in the order the steps build on each other:
 *   - the player's own log, the history tab and the guides tab: tradeskillLogSteps.mts;
 *   - the goal routes and the shopping list: tradeskillRouteSteps.mts;
 *   - Make an item and Maps at a merchant: tradeskillPlanSteps.mts;
 *   - the held-only route, Can make now and Missing on the wiki: tradeskillHeldSteps.mts;
 *   - the crafting AAs, fishing outcomes and the Foraging tile: tradeskillGatherSteps.mts;
 *   - level bars, Pick up where you left off and wishing a crafted item: tradeskillHomeSteps.mts;
 *   - the Faction goal: tradeskillFactionSteps.mts.
 *
 * Every claim is a property of what is on screen, never a name or a count from the wiki data.
 *
 * Run: `npm run test:e2e -- tradeskills` (both halves)
 */
import type { Page } from 'playwright-core'
import { buildIfStale, check, countOf, dumpArtifacts, failures, note, reportRun, settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { stepFaction } from './tradeskillFactionSteps.mjs'
import { stepAaAndGather } from './tradeskillGatherSteps.mjs'
import { stepHeldAndWiki } from './tradeskillHeldSteps.mjs'
import { stepHomeAndWish } from './tradeskillHomeSteps.mjs'
import { E2E_LEVEL as LEVEL, stepGuides, stepHistory, stepOwnLog } from './tradeskillLogSteps.mjs'
import { stepPlanner } from './tradeskillPlanSteps.mjs'
import { stepRoute } from './tradeskillRouteSteps.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const JEWELCRAFTING = sel('tradeskill-tile-Jewelcrafting')

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

/**
 * What the first half left standing: the workbench open, at the level the log states. The level
 * is waited for first, because until it lands the table marks a different recipe as next.
 */
async function openWorkbench(page: Page): Promise<void> {
  await page.click(sel('nav-tradeskills'))
  await settle(() => countOf(page, sel('tradeskills-home')), (n) => n === 1, { timeoutMs: 20_000 })
  const level = await settle(() => textOf(page, `${JEWELCRAFTING} ${sel('tradeskill-tile-level')}`), (t) => t === String(LEVEL), { timeoutMs: 30_000 })
  check('the section is up at the level the log states', level === String(LEVEL), level)
  await page.click(`${JEWELCRAFTING} button`)
  await settle(() => countOf(page, sel('tradeskill-workbench')), (n) => n === 1, { timeoutMs: 20_000 })
}

async function main(): Promise<void> {
  buildIfStale()
  const { app, close, log } = await launchOnFixture('e2e-overview.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  let page: Page | null = null
  try {
    page = await mainWindow(app)
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    await page.waitForSelector(sel('nav-overview'), { timeout: 60_000 })
    log.append(`You have become better at Jewelry Making! (${String(LEVEL)})`)

    await openWorkbench(page)
    const crafted = await stepOwnLog(page, log, LEVEL)
    if (crafted !== null) {
      await stepHistory(page, crafted)
      await stepGuides(page, LEVEL)
    }
    await stepRoute(page)
    await stepPlanner(page)
    await stepHeldAndWiki(page)
    await stepAaAndGather(page, log)
    await stepHomeAndWish(page)
    await stepFaction(page)

    check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
    if (failures.length) await dumpArtifacts(page, 'tradeskills-log-FAIL')
  } finally {
    await close()
  }
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  note('the tradeskills-log spec did not complete')
  process.exitCode = 1
})
