/**
 * The Overview widgets (docs/community/plans/2026-11-27-overview-widgets.md, Phase 1), as WIRING
 * only: the default page is the six cards it always had, Customize opens the checklist, a card
 * checked on mounts with engine data, and the layout survives a relaunch. The values each card
 * shows are pinned by tests/overviewCards.test.mts and tests/overviewLayout.test.mts.
 *
 * Its own file because overview.e2e.mts is already long; the spec calls these in order.
 */
import type { Page } from 'playwright-core'
import { check, countOf, settle, settleCount, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, type FixtureLog } from './logFixture.mjs'

const TODAY = ['dps', 'leveling', 'target', 'dpsCurve', 'drops', 'kills']
const NEW = ['buffs', 'respawns', 'motes', 'coin']
const GRID = '[data-testid="overview-grid"]'

/** The widget ids on the page, in page order. */
function shownWidgets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-overview-widget]')].map((e) => (e as HTMLElement).dataset.overviewWidget ?? '')
  )
}

function textOf(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? '', sel)
}

/** A fresh install draws the page exactly as it was before widgets: the six, in their order. */
export async function stepDefaultWidgets(page: Page): Promise<void> {
  const shown = await settle(() => shownWidgets(page), (w) => w.length >= TODAY.length, { timeoutMs: 15_000 })
  check(
    'a fresh install shows the six cards Overview always had, in their order, and none of the new ones',
    shown.join(',') === TODAY.join(','),
    shown.join(' · ')
  )
}

/** A buff the player casts and three motes they loot, so the new cards have engine data to show. */
function playBuffAndMotes(log: FixtureLog): void {
  const at = Date.now()
  log.appendAt(new Date(at), 'You begin casting Valor.')
  log.appendAt(new Date(at + 1_000), 'You feel valorous.')
  for (let i = 0; i < 3; i++) {
    log.appendAt(new Date(at + 2_000 + i * 1_000), "--You have looted a Mote of Major Potential from a fire giant warrior's corpse.--")
  }
}

/** Customize opens the checklist; checking the four new cards mounts each, with engine data. */
export async function stepCustomize(page: Page, log: FixtureLog): Promise<void> {
  playBuffAndMotes(log)
  await page.click('[data-testid="overview-customize"]', { timeout: 15_000 })
  const rows = await settleCount(page, '[data-testid^="overview-customize-row-"]', TODAY.length + NEW.length, { timeoutMs: 10_000 })
  if (!check('Customize opens a checklist of every card', rows === TODAY.length + NEW.length, `${String(rows)} rows`)) return
  for (const id of NEW) await page.click(`[data-testid="overview-customize-check-${id}"]`, { timeout: 15_000 })
  await page.click('[data-testid="overview-customize-done"]', { timeout: 15_000 })

  const want = [...TODAY, ...NEW].join(',')
  const shown = await settle(() => shownWidgets(page), (w) => w.join(',') === want, { timeoutMs: 10_000 })
  check('checking the four new cards mounts them after the six', shown.join(',') === want, shown.join(' · '))

  const buffs = await settle(() => textOf(page, '[data-testid="overview-buffs"]'), (t) => t.includes('Valor'), { timeoutMs: 20_000 })
  check('Buffs running out shows the buff the log just cast', buffs.includes('Valor'), buffs.slice(0, 80))
  const motes = await settle(() => textOf(page, '[data-testid="overview-motes"]'), (t) => t.includes('Major'), { timeoutMs: 20_000 })
  check('Motes counts the motes the log just looted, by tier', motes.includes('Major'), motes.slice(0, 80))
  const coin = await settle(() => textOf(page, '[data-testid="overview-coin-session"]'), (t) => /\d(pp|gp|sp|cp)/.test(t), { timeoutMs: 20_000 })
  check('Coin states the coin the log holds', /\d(pp|gp|sp|cp)/.test(coin), coin || 'empty')
  check('Respawns here mounts (no mob is watched: its quiet state)', (await countOf(page, '[data-testid="overview-respawns"]')) === 1)
}

/** Launch 2 on the same settings: the layout came back from the settings store. */
export async function stepLayoutSurvivesRelaunch(log: FixtureLog, userData: string): Promise<void> {
  console.log('launch 2: the same userData, to read the Overview layout back…')
  const { app, close } = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(app)
    await page.waitForSelector(GRID, { timeout: 60_000 })
    await waitHydrated(page)
    const want = [...TODAY, ...NEW].join(',')
    const shown = await settle(() => shownWidgets(page), (w) => w.join(',') === want, { timeoutMs: 15_000 })
    check('the Overview layout survives a relaunch (it is in the settings store)', shown.join(',') === want, shown.join(' · '))
  } finally {
    await close()
  }
}
