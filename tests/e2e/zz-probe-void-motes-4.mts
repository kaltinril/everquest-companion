/**
 * THROWAWAY PROBE 4 (void-motes): what the tab says while it loads, what it remembers, and a launch
 * with no engine. Three launches, one at a time.
 *  L1 gear known: is the "not in the item data" ring known to the app elsewhere? set target AC and
 *     order Biggest gain, leave the app on the Void motes tab.
 *  L2 the same userData, not waiting for the engine: every sentence the tab shows from the first
 *     click on, by a MutationObserver (the loading texts), and whether the two picks came back.
 *  L3 no engine binary (cwd = tmp), gear known.
 */
import type { Page } from 'playwright-core'
import { tmpdir } from 'node:os'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, openTab, report, save } from './zz-probe-void-motes-0.mjs'

const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

const WATCH = `(() => {
  window.__seq = []
  const read = () => {
    const t = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null }
    const s = JSON.stringify({ view: document.querySelector('[data-testid="void-motes-view"]') !== null, empty: t('[data-testid="gear-motes-empty"]'), plan: t('[data-testid="gear-motes-plan"]'), rows: document.querySelectorAll('[data-testid="gear-motes-row"]').length, dump: t('[data-testid="void-motes-dump-line"]'), unranked: t('[data-testid="gear-motes-unranked"]') })
    const last = window.__seq[window.__seq.length - 1]
    if (!last || last.s !== s) window.__seq.push({ at: Math.round(performance.now()), s })
  }
  new MutationObserver(read).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
  read()
})()`

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  const log = stageFixture('e2e-planner.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  try {
    // ---- L1 ----
    console.log('L1: gear known, fresh userData')
    const first = await launchOnFixture(log, { userData })
    const t1 = bound(150_000, first.close)
    try {
      const page: Page = await mainWindow(first.app)
      await openTab(page)
      await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 30_000 }).catch(() => undefined)
      await sleep(800)
      // L1a: does the app know the ring the tab calls "not in the item data"?
      const known = await page.evaluate(`(async () => {
        const k = await window.eq.lookupItem("Djarn's Amethyst Ring")
        const idx = await window.eq.gearIndex()
        const rows = idx.rows || []
        const hit = rows.filter((r) => /djarn/i.test(r.name))
        const inv = await window.eq.plannerInventory()
        const host = inv && inv.hosts ? inv.hosts.filter((h) => /djarn/i.test(h.name)) : []
        const sheet = await window.eq.characterSheet()
        const cells = sheet && sheet.cells ? sheet.cells.filter((c) => c.item && /djarn/i.test(c.item.name)).map((c) => ({ name: c.item.name, known: c.item.known })) : 'no cells field: ' + (sheet ? Object.keys(sheet).join(',') : 'null')
        return { lookup: { page: k && k.page, found: k && k.found, keys: k ? Object.keys(k).slice(0, 12) : null, stats: k && k.statsBlock }, gearRows: hit.map((r) => ({ key: r.key, name: r.name })), host, cells }
      })()`)
      console.log(`L1a the ring elsewhere in the app: ${JSON.stringify(known)}`)
      const m0 = await measure(page)
      console.log(`L1a the tab says: "${one(m0.unranked?.text)}"`)

      // L1b: pick AC and Biggest gain, to see whether they come back.
      await page.click('[data-testid="gear-motes-target"] .MuiSelect-select', { timeout: 10_000 })
      await page.waitForSelector('li[data-value="AC"]', { timeout: 10_000 })
      await page.click('li[data-value="AC"]')
      await sleep(500)
      await page.click('[data-testid="gear-motes-order-gain"]', { timeout: 10_000 })
      await sleep(800)
      const m1 = await measure(page)
      console.log(`L1b set: target "${one(m1.targetValue)}", ${m1.orders.map((o: { text: string; pressed: string }) => `${one(o.text)}=${o.pressed}`).join(', ')}`)

      // L1c: the Gear tab's class pick, as this tab reads it. What does the gear area offer?
      const chips = await page.evaluate(`[...document.querySelectorAll('[data-testid^="gear-class"], [data-testid*="class-chip"], [data-testid*="classes"]')].map((e) => e.getAttribute('data-testid') + ':' + e.innerText.replace(/\\s+/g, ' ').slice(0, 80))`)
      console.log(`L1c class controls on the Void motes tab: ${JSON.stringify(chips)}`)
      await sleep(1200)
    } finally {
      clearTimeout(t1)
      await first.close()
    }

    // ---- L2 ----
    console.log('\nL2: the same userData, not waiting for the engine')
    const second = await launchOnFixture(log, { userData, waitForEngine: false })
    const t2 = bound(150_000, second.close)
    try {
      const t0 = Date.now()
      const page: Page = await mainWindow(second.app)
      await page.evaluate(WATCH)
      await page.waitForSelector('[data-testid="nav-gear"]', { timeout: 60_000 })
      await page.click('[data-testid="nav-gear"]', { timeout: 30_000 })
      console.log(`L2 clicked the Gear door ${String(Date.now() - t0)} ms after the window`)
      await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 60_000 }).catch(() => undefined)
      await sleep(2500)
      const seq = (await page.evaluate('window.__seq')) as { at: number; s: string }[]
      save('4-L2-sequence', seq)
      console.log('L2 every state the tab showed, in order (ms since page start):')
      for (const e of seq) console.log(`  ${String(e.at).padStart(6)}  ${e.s}`)
      const m = await measure(page)
      console.log(`L2 the door opened on: ${m.tabs.filter((t: { sel: string }) => t.sel === 'true').map((t: { text: string }) => one(t.text)).join(',')}`)
      console.log(`L2 came back: target "${one(m.targetValue)}", ${m.orders.map((o: { text: string; pressed: string }) => `${one(o.text)}=${o.pressed}`).join(', ')}`)
      console.log(`L2 plan "${one(m.plan?.text)}" first rows: ${m.rows.slice(0, 4).map((r: { name: { text: string }; cells: { text: string }[] }) => `${one(r.name?.text)} ${one(r.cells[3].text)}`).join(' | ')}`)
    } finally {
      clearTimeout(t2)
      await second.close()
    }

    // ---- L3 ----
    console.log('\nL3: no engine binary (cwd = tmp), gear known, fresh userData')
    const third = await launchOnFixture(log, { cwd: tmpdir(), waitForEngine: false })
    const t3 = bound(150_000, third.close)
    try {
      const page: Page = await mainWindow(third.app)
      await page.waitForSelector('[data-testid="nav-gear"]', { timeout: 60_000 })
      await answerNotice(page)
      await page.evaluate(WATCH)
      await page.click('[data-testid="nav-gear"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="tab-voidMotes"]', { timeout: 30_000 })
      await page.click('[data-testid="tab-voidMotes"]', { timeout: 15_000 })
      await sleep(8000)
      const seq = (await page.evaluate('window.__seq')) as { at: number; s: string }[]
      save('4-L3-sequence', seq)
      for (const e of seq) console.log(`  ${String(e.at).padStart(6)}  ${e.s}`)
      const m = await measure(page)
      save('4-L3-no-engine', m)
      report('L3 no engine, gear known, default window', m)
      const cards = await page.evaluate(`[...document.querySelectorAll('[data-testid*="engine"]')].map((e) => e.getAttribute('data-testid') + ': ' + e.innerText.replace(/\\s+/g, ' ').slice(0, 200) + ' @' + JSON.stringify(e.getBoundingClientRect()))`)
      console.log(`L3 engine cards on screen: ${JSON.stringify(cards)}`)
    } finally {
      clearTimeout(t3)
      await third.close()
    }
  } finally {
    await removeUserData(userData)
    await log.dispose()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
