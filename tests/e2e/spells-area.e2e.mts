/**
 * THE SPELLS AREA IS DRAWN IN EVERY BUILD (owner, 2026-10-29: "everyone should always see all
 * tabs"). This file was the area's absence spec while it sat behind the review gate; the gate is
 * gone, so it states the opposite claims, on one launch of a production-shaped build:
 *
 *   1. the Spells row is present, opens the area's tab bar with all three tabs, and the
 *      Spellbook view mounts, AND
 *   2. the GEAR area - built on the same `AreaTabs` component, through the same `MainColumn`
 *      branch - is present and works, AND
 *   3. `spells:stackViews`, the area's IPC door, answers safely: `{}` rather than a throw on a
 *      machine with no EverQuest install, and it refuses nonsense at the door.
 *
 * Run: `npm run test:e2e -- spells-area` (or node --import tsx this file).
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countOf,
  dumpArtifacts,
  failures,
  note,
  reportRun,
  settle,
  settleGone
} from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

/** The Spells row, its tab bar and its three tabs. Every one of these must be present. */
const NAV_SPELLS = '[data-testid="nav-spells"]'
const SPELL_AREA_TABS = '[data-testid="spell-area-tabs"]'
const TAB_SPELLBOOK = '[data-testid="tab-spells"]'
const TAB_UPGRADES = '[data-testid="tab-spellUpgrades"]'
const TAB_LOADOUT = '[data-testid="tab-spellLoadout"]'
const SPELLBOOK_VIEW = '[data-testid="spellbook-view"]'

/** The gear area, which shares every piece of machinery the spells area uses. */
const NAV_GEAR = '[data-testid="nav-gear"]'
const GEAR_AREA_TABS = '[data-testid="gear-area-tabs"]'
const TAB_GEAR = '[data-testid="tab-gear"]'

/**
 * Answer the analytics first-run notice. A fresh `userData` always shows it and it sits along the
 * bottom edge, where it can take a click meant for a nav row.
 */
async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  check(
    'the analytics first-run notice can be answered out of the way',
    await settleGone(page, notice, { timeoutMs: 8_000 })
  )
}

/** STEP 1 — the Spells row opens the area: its tab bar, its three tabs, and the Spellbook. */
async function stepPresent(page: Page): Promise<void> {
  check('the Spells nav row is present', (await countOf(page, NAV_SPELLS)) === 1)
  await page.click(NAV_SPELLS)
  const bars = await settle(() => countOf(page, SPELL_AREA_TABS), (n) => n === 1, { timeoutMs: 15_000 })
  check('the Spells tab bar mounts', bars === 1, `saw ${String(bars)}`)
  for (const [what, sel] of [
    ['the Spellbook tab', TAB_SPELLBOOK],
    ['the Upgrades tab', TAB_UPGRADES],
    ['the Loadout tab', TAB_LOADOUT]
  ] as const) {
    check(`…and it draws ${what}`, (await countOf(page, sel)) === 1)
  }
  const views = await settle(() => countOf(page, SPELLBOOK_VIEW), (n) => n === 1, { timeoutMs: 15_000 })
  check('the Spellbook view mounts', views === 1, `saw ${String(views)}`)
}

/** STEP 2 — the gear area, on the same `AreaTabs` component and the same `MainColumn` branch. */
async function stepControl(page: Page): Promise<void> {
  check('the Gear nav row is present', (await countOf(page, NAV_GEAR)) === 1)
  await page.click(NAV_GEAR)
  // `settle` polls a READING until a predicate holds, and hands back the last one either way - so
  // the count itself is what this asserts on rather than a boolean somebody could read as a timeout.
  const bars = await settle(() => countOf(page, GEAR_AREA_TABS), (n) => n === 1, { timeoutMs: 15_000 })
  check('the gear area tab bar mounts', bars === 1, `saw ${String(bars)}`)
  check('…and it draws its first tab', (await countOf(page, TAB_GEAR)) === 1)
}

/**
 * STEP 3 — the one door wave 6 added answers rather than throwing.
 *
 * It reads the player's own `spells_us.txt` and validates at the handler, so on a machine with no
 * EverQuest install it answers `{}`. What must never happen is a rejection - a caller reading an
 * empty map as "no exact verdicts" is a supported state, and a throw is a defect.
 */
async function stepDoor(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    try {
      const bridge = (window as unknown as {
        eq?: { getSpellStackViews?: (n: readonly string[]) => Promise<Record<string, unknown>> }
      }).eq
      if (!bridge?.getSpellStackViews) return { ok: false, why: 'no bridge method' }
      const empty = await bridge.getSpellStackViews([])
      // Nonsense the handler must refuse rather than trust: a name far past the length cap.
      const junk = await bridge.getSpellStackViews(['x'.repeat(500)])
      return {
        ok: typeof empty === 'object' && typeof junk === 'object',
        emptyKeys: Object.keys(empty).length,
        junkKeys: Object.keys(junk).length,
        why: ''
      }
    } catch (e) {
      return { ok: false, why: String(e) }
    }
  })
  check('spells:stackViews answers instead of throwing', result.ok, result.why)
  check('…an empty ask answers an empty map', result.emptyKeys === 0)
  check('…and an over-long name is refused at the door', result.junkKeys === 0)
}

async function main(): Promise<void> {
  buildIfStale()

  console.log('launch: production-shaped build — the Spells area must be drawn…')
  const { app, close } = await launchOnFixture('e2e-planner.log')

  let page: Page | null = null
  try {
    page = await mainWindow(app)
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await answerNotice(page)

    await stepPresent(page)
    await stepControl(page)
    await stepDoor(page)

    check(
      'no renderer console errors',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | ')
    )
    if (failures.length) await dumpArtifacts(page, 'spells-area-FAIL')
  } finally {
    await close()
  }

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  note('the spells-area spec did not complete')
  process.exitCode = 1
})
