/**
 * THROWAWAY PROBE 2 (void-motes): gear known; the app's minimum width (900 px) and 125% text.
 * Steps: A 900 px at 100%; B 900 px at 125%; C default 1280 at 125%.
 */
import type { Page } from 'playwright-core'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { bound, measure, openTab, report, resizeTo, save, setScale } from './zz-probe-void-motes-0.mjs'

async function main(): Promise<void> {
  buildIfStale()
  const { app, close } = await launchOnFixture('e2e-planner.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  const timer = bound(200_000, close)
  try {
    const page: Page = await mainWindow(app)
    await openTab(page)
    await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 30_000 }).catch(() => undefined)
    await sleep(1000)

    // STEP A: the app's minimum width, 100% text.
    const gotA = await resizeTo(app, page, 900, 760)
    console.log(`A resized: ${String(gotA)} css px of document`)
    const a = await measure(page)
    save('2-A-900', a)
    report('A 900 px window, 100% text', a)

    // STEP A2: the minimum height too (900 x 600).
    await resizeTo(app, page, 900, 600)
    const a2 = await measure(page)
    save('2-A2-900x600', a2)
    report('A2 900 x 600 window, 100% text', a2)

    // STEP B: 900 px at 125%.
    await resizeTo(app, page, 900, 760)
    const dpr = await setScale(page, 1.25)
    console.log(`B scale set: dpr ${String(dpr)}`)
    const b = await measure(page)
    save('2-B-900-125', b)
    report('B 900 px window, 125% text', b)

    // STEP C: the default window at 125%.
    await resizeTo(app, page, 1280, 860)
    const c = await measure(page)
    save('2-C-1280-125', c)
    report('C 1280 px window, 125% text', c)
  } finally {
    clearTimeout(timer)
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
