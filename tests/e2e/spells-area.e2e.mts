/**
 * THE SPELLS AREA IS GATED, AND THIS SPEC MEASURES THAT PROMISE ON THE EMITTED BUNDLE
 * (docs/plans/spell-upgrades-and-loadout.md §2, wave 7).
 *
 * ── WHY AN ABSENCE SPEC, AND WHY IT IS NOT VACUOUS ────────────────────────────────────────────
 *
 * The area's three views sit behind `UNRELEASED` (devFlags.ts), which is `import.meta.env.DEV` and
 * therefore a literal `false` in every `electron-vite build`. So a production-shaped launch has no
 * nav row, no tab bar and no component tree - and the whole point of the gate is that this is a
 * STRIP rather than a hide: there is no bundled component to un-hide and no route into one.
 *
 * An absence assertion passes just as happily when a feature was never wired up at all, which is
 * the trap the character sheet's own gated spec named. So this file does not only assert that
 * `nav-spells` is missing. It asserts, on the SAME launch:
 *
 *   1. the Spells row and all three of its tabs are absent, AND
 *   2. the GEAR area - built on the same `AreaTabs` component, through the same `MainColumn`
 *      branch - is present and works. That is the control. If the shared machinery were broken
 *      rather than gated, this half goes red and the absence above stops meaning anything.
 *   3. `spells:stackViews`, the one IPC door wave 6 added, is REACHABLE and answers safely. The
 *      channel is deliberately NOT gated - it reads the player's own client file and refuses
 *      nonsense at the door - so a build must still answer `{}` rather than throw. A door that
 *      threw would be a live defect hiding behind a gated UI.
 *
 * ── WHAT THIS FILE BECOMES AT GRADUATION ──────────────────────────────────────────────────────
 *
 * The character sheet's spec is the precedent in both directions: it was an absence spec from
 * JOS-45 and was REWRITTEN into a presence spec when the owner released the tab (JOS-327). This one
 * follows it. When the Spells area graduates - `TELEMETRY_VIEWS` widened server-first, then the
 * `KNOWN_VIEWS` splice made unconditional - every claim below becomes false by design, and the file
 * states the opposite ones: not "the tab exists" (which a misspelled testid satisfies) but the
 * Spellbook mounts, its rows carry grants read off the committed catalog, and the tier slider moves
 * a number this spec can predict.
 *
 * Run: `npm run test:e2e -- spells-gate` (or node --import tsx this file).
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

/** The gated row and its three tabs. Every one of these must be absent from a build. */
const NAV_SPELLS = '[data-testid="nav-spells"]'
const SPELL_AREA_TABS = '[data-testid="spell-area-tabs"]'
const TAB_SPELLBOOK = '[data-testid="tab-spells"]'
const TAB_UPGRADES = '[data-testid="tab-spellUpgrades"]'
const TAB_LOADOUT = '[data-testid="tab-spellLoadout"]'
const SPELLBOOK_VIEW = '[data-testid="spellbook-view"]'

/** THE CONTROL: the gear area, which shares every piece of machinery the spells area uses. */
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

/** STEP 1 — nothing of the Spells area reached the bundle. */
async function stepAbsent(page: Page): Promise<void> {
  for (const [what, sel] of [
    ['the Spells nav row', NAV_SPELLS],
    ['the Spells tab bar', SPELL_AREA_TABS],
    ['the Spellbook tab', TAB_SPELLBOOK],
    ['the Upgrades tab', TAB_UPGRADES],
    ['the Loadout tab', TAB_LOADOUT],
    ['the Spellbook view', SPELLBOOK_VIEW]
  ] as const) {
    check(`${what} is absent from a production-shaped build`, (await countOf(page, sel)) === 0)
  }
}

/**
 * STEP 2 — THE CONTROL. The gear area is built on the same `AreaTabs` component and reached through
 * the same `MainColumn` branch, so its working is what makes step 1 a statement about the GATE
 * rather than about broken machinery.
 */
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
 * It is deliberately NOT behind the gate: it reads the player's own `spells_us.txt` and validates at
 * the handler, so on a machine with no EverQuest install it answers `{}`. What must never happen is
 * a rejection - a caller reading an empty map as "no exact verdicts" is a supported state, and a
 * throw is a defect that a gated UI would have hidden until graduation day.
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

  console.log('launch: production-shaped build — the Spells area must be structurally absent…')
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

    await stepAbsent(page)
    await stepControl(page)
    await stepDoor(page)

    check(
      'no renderer console errors',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | ')
    )
    if (failures.length) await dumpArtifacts(page, 'spells-gate-FAIL')
  } finally {
    await close()
  }

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  note('the spells-gate spec did not complete')
  process.exitCode = 1
})
