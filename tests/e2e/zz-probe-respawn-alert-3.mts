// THROWAWAY PROBE 3 (key: respawn-alert): the "Several mobs share this name" switch in the edit
// dialog, followed from the click to the store, to the module's own row, to what the dialog says.
// And: is a firing of the seeded alert recorded in the Alerts tab's history?
import type { Page } from 'playwright-core'
import { buildIfStale, countOf, settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import {
  DIALOG,
  INPUT,
  OWN_MOB,
  WIKI_MOB,
  answerNotice,
  bodyText,
  closeEditor,
  install,
  openEditor,
  rowSel,
  saveDisabled,
  say,
  stageClocks
} from './zz-probe-respawn-alert-0.mjs'

function watches(page: Page): Promise<unknown> {
  return page.evaluate(() => (window as unknown as { eq: { getRespawn: () => Promise<unknown> } }).eq.getRespawn())
}
/** The respawn module's own row for a mob, as main serves it to any window that asks. */
function moduleRow(page: Page, mob: string): Promise<unknown> {
  return page.evaluate(async (key) => {
    const snap = (await (window as unknown as { eq: { getModuleSnapshot: (id: string) => Promise<{ rev?: number; snap?: { rows?: Record<string, unknown>[] } } | null> } }).eq.getModuleSnapshot('respawn')) as unknown as Record<string, unknown> | null
    if (snap === null) return 'no snapshot'
    const body = (snap.state ?? snap) as { rows?: Record<string, unknown>[]; prefs?: unknown }
    const row = (body.rows ?? []).find((r) => r.key === key)
    return { seq: snap.seq, stateKeys: Object.keys(body), prefs: body.prefs ?? null, row: row ?? null }
  }, mob)
}

const BOX = `${DIALOG} [data-testid="respawn-edit-shared-name"] input`
function checked(page: Page): Promise<boolean> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLInputElement | null)?.checked === true, BOX)
}

async function main(): Promise<void> {
  buildIfStale()
  const launched = await launchOnFixture('e2e-leveling.log')
  const killer = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void launched.close().finally(() => process.exit(2))
  }, 4 * 60_000)
  try {
    const page = await mainWindow(launched.app)
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await install(page)
    await answerNotice(page)
    await page.click('[data-testid="nav-timers"]', { timeout: 30_000 })
    await settle(() => countOf(page, '[data-testid="timers-view"]'), (n) => n === 1, { timeoutMs: 30_000 })
    await stageClocks(page, launched.log)

    console.log('\n=== S1. the learned 3m row, before ===')
    say('S1', `module row: ${JSON.stringify(await moduleRow(page, OWN_MOB))}`)
    say('S1', `row on the tab: ${await bodyText(page, rowSel(OWN_MOB))}`)
    await openEditor(page, OWN_MOB)
    say('S1', `box checked=${String(await checked(page))} store=${JSON.stringify(await watches(page))}`)

    console.log('\n=== S2. tick "Several mobs share this name" (a pointer click on its label) ===')
    await page.click(`${DIALOG} label:has([data-testid="respawn-edit-shared-name"])`, { timeout: 10_000 })
    for (const wait of [300, 700, 1000, 2000, 4000, 6000]) {
      await sleep(wait)
      say('S2', `+${String(wait)}ms: box checked=${String(await checked(page))} store=${JSON.stringify(await watches(page))} module row=${JSON.stringify(await moduleRow(page, OWN_MOB))}`)
    }
    say('S2', `dialog says: ${await bodyText(page, `${DIALOG} .MuiDialog-paper`)}`)
    say('S2', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)
    say('S2', `row behind: ${await bodyText(page, rowSel(OWN_MOB))} | row attrs source=${String(await page.evaluate((s) => document.querySelector(s)?.getAttribute('data-respawn-source'), rowSel(OWN_MOB)))}`)

    console.log('\n=== S3. close the dialog and open it again ===')
    await closeEditor(page, 'cancel')
    await sleep(800)
    say('S3', `row on the tab: ${await bodyText(page, rowSel(OWN_MOB))}`)
    await openEditor(page, OWN_MOB)
    say('S3', `reopened: box checked=${String(await checked(page))}; dialog says: ${await bodyText(page, `${DIALOG} .MuiDialog-paper`)}`)
    say('S3', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)

    console.log('\n=== S4. click the box again (the player trying a second time) ===')
    await page.click(`${DIALOG} label:has([data-testid="respawn-edit-shared-name"])`, { timeout: 10_000 })
    await sleep(3000)
    say('S4', `box checked=${String(await checked(page))} store=${JSON.stringify(await watches(page))} module row=${JSON.stringify(await moduleRow(page, OWN_MOB))}`)
    await closeEditor(page, 'cancel')

    console.log('\n=== S5. the same switch on the WIKI row (9m 30s, under the 10 minute floor only for gaps; it has none) ===')
    await openEditor(page, WIKI_MOB)
    await page.click(`${DIALOG} label:has([data-testid="respawn-edit-shared-name"])`, { timeout: 10_000 })
    await sleep(3000)
    say('S5', `box checked=${String(await checked(page))} store=${JSON.stringify(await watches(page))} module row=${JSON.stringify(await moduleRow(page, WIKI_MOB))}`)
    say('S5', `dialog says: ${await bodyText(page, `${DIALOG} .MuiDialog-paper`)}`)
    await closeEditor(page, 'cancel')

    console.log('\n=== S6. a relaunch-free check: leave the tab and come back ===')
    await page.click('[data-testid="nav-alerts"]')
    await sleep(800)
    await page.click('[data-testid="nav-timers"]')
    await sleep(1500)
    say('S6', `rows: ${await bodyText(page, '[data-testid="respawn-rows"]')}`)
    say('S6', `module rows: own=${JSON.stringify(await moduleRow(page, OWN_MOB))}`)
  } catch (err) {
    console.log(`PROBE ERROR: ${String(err)}`)
    process.exitCode = 1
  } finally {
    clearTimeout(killer)
    await launched.close()
    console.log('app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error -', err)
  process.exitCode = 1
})
