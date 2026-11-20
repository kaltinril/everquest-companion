/**
 * THROWAWAY VERIFY PROBE: at 900 px, does the Gear catalog also scroll sideways (precedent)?
 * And on the Void motes tab, the minimum content width of each column (what a fix must fit).
 */
import type { Page } from 'playwright-core'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, openTab, resizeTo } from './zz-probe-void-motes-0.mjs'

async function main(): Promise<void> {
  buildIfStale()
  const { app, close } = await launchOnFixture('e2e-planner.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  const timer = bound(150_000, close)
  try {
    const page: Page = await mainWindow(app)
    await openTab(page)
    await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 30_000 })
    await resizeTo(app, page, 900, 760)
    const motes = await page.evaluate(`(() => {
      const l = document.querySelector('[data-testid="gear-motes-list"]')
      const ths = [...l.querySelectorAll('thead th')].map(t => t.textContent + ' w' + Math.round(t.getBoundingClientRect().width))
      const src = [...l.querySelectorAll('[data-testid="gear-motes-source"]')].map(c => Math.round(c.getBoundingClientRect().width))
      const name = [...l.querySelectorAll('[data-testid="gear-motes-row"] td:nth-child(2)')].map(c => c.scrollWidth + '/' + c.clientWidth)
      return { sw: l.scrollWidth, cw: l.clientWidth, ths, srcMax: Math.max(...src), nameOverflow: name.filter(s => { const [a,b] = s.split('/'); return +a > +b }) }
    })()`)
    console.log('MOTES 900', JSON.stringify(motes))
    await page.click('[data-testid="tab-gear"]', { timeout: 15_000 }).catch(async () => { await answerNotice(page) })
    await page.waitForSelector('[data-testid="gear-list"]', { timeout: 30_000 })
    await sleep(1500)
    const gear = await page.evaluate(`(() => {
      const l = document.querySelector('[data-testid="gear-list"]')
      const r = l.getBoundingClientRect()
      return { sw: l.scrollWidth, cw: l.clientWidth, right: r.right, vw: document.documentElement.clientWidth }
    })()`)
    console.log('GEAR 900', JSON.stringify(gear))
  } finally {
    clearTimeout(timer)
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
