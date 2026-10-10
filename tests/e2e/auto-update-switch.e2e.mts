/**
 * Headless Electron integration test for the "Update automatically" switch.
 *
 * What it proves: the switch opens ON (the shipped default), flipping it OFF is what MAIN reports
 * in the update status, the card says the app is staying on its version, and the choice survives
 * a relaunch on the same profile.
 *
 * What it cannot see: the updater machinery it steers (the poll, the download, apply-on-quit)
 * runs only in a packaged build, and this harness launches unpackaged.
 *
 * Run: `npm run test:e2e -- auto-update-switch`
 */
import type { Page } from 'playwright-core'
import { buildIfStale, check, dumpArtifacts, failures, reportRun, settle, settleGone, countOf } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { openPrefs, openSection, setSwitch } from './prefsFirstPaintSteps.mjs'

const SWITCH = 'pref-auto-update'

/** The update status straight from main: the proof, rather than the switch's own opinion. */
async function storedOff(page: Page): Promise<boolean> {
  const s = await page.evaluate(() =>
    (window as unknown as { eq: { getUpdateStatus: () => Promise<{ autoUpdateOff?: boolean }> } }).eq.getUpdateStatus()
  )
  return s.autoUpdateOff === true
}

async function dismissFirstRunNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

async function openUpdates(page: Page): Promise<void> {
  await dismissFirstRunNotice(page)
  await openPrefs(page)
  await openSection(page, 'updates', `[data-testid="${SWITCH}"]`)
}

async function switchOn(page: Page): Promise<boolean> {
  return page.$eval(`[data-testid="${SWITCH}"] input`, (el) => (el as HTMLInputElement).checked)
}

async function stepFirstRun(page: Page): Promise<void> {
  await openUpdates(page)
  check('the switch opens ON, the shipped default', await switchOn(page))
  check('and main agrees on a fresh profile', !(await storedOff(page)))

  check('the switch takes OFF', await setSwitch(page, SWITCH, false))
  check('and main reports it off', await settle(() => storedOff(page), (v) => v, { timeoutMs: 8_000 }))
  const body = (await page.textContent('body')) ?? ''
  check('the card says the app is staying on its version', body.includes('Staying on'), body.slice(0, 200))
}

async function stepRelaunch(page: Page): Promise<void> {
  await openUpdates(page)
  check('after a relaunch the switch is still OFF', !(await switchOn(page)))
  check('and main still reports it off', await storedOff(page))

  check('it takes ON again', await setSwitch(page, SWITCH, true))
  check('with main agreeing', !(await settle(() => storedOff(page), (v) => !v, { timeoutMs: 8_000 })))
}

/** One launch on the shared profile, running one step. */
async function launchAndRun(
  log: ReturnType<typeof stageFixture>,
  userData: string,
  step: (page: Page) => Promise<void>
): Promise<void> {
  const app = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(app.app)
    await step(page)
    if (failures.length) await dumpArtifacts(page, 'auto-update-switch-FAIL')
  } finally {
    await app.close()
  }
}

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  const log = stageFixture('e2e-telemetry.log')
  try {
    await launchAndRun(log, userData, stepFirstRun)
    await launchAndRun(log, userData, stepRelaunch)
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
