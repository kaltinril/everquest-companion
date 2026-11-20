/**
 * THROWAWAY PROBE 1 (void-motes): gear known (the committed inventory dump), the default window.
 * Steps: A default list; B each order; C each target; D the picker's menu; E hover texts.
 */
import type { Page } from 'playwright-core'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { bound, measure, openTab, report, save, titles } from './zz-probe-void-motes-0.mjs'

const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

async function main(): Promise<void> {
  buildIfStale()
  const { app, close } = await launchOnFixture('e2e-planner.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  const timer = bound(240_000, close)
  try {
    const page: Page = await mainWindow(app)
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    const t0 = Date.now()
    await openTab(page)
    // STEP A0: what the tab says the instant it opens (the loading sentences).
    const first = await measure(page)
    console.log(`A0 first frame after ${String(Date.now() - t0)} ms: empty="${one(first.empty?.text)}" plan="${one(first.plan?.text)}" rows=${String(first.rows.length)} dumpLine="${one(first.dumpLine?.text)}"`)
    await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 30_000 }).catch(() => undefined)
    await sleep(1500)
    // STEP A: the settled list at the default window.
    const a = await measure(page)
    save('1-A-default', a)
    report('A default window, Balanced, Recommended', a)

    // STEP B: each order.
    for (const o of ['gain', 'effort', 'recommended']) {
      await page.click(`[data-testid="gear-motes-order-${o}"]`, { timeout: 10_000 })
      await sleep(700)
      const m = await measure(page)
      save(`1-B-order-${o}`, m)
      console.log(`\nB order=${o}: pressed ${m.orders.map((x: { text: string; pressed: string }) => `${one(x.text)}=${x.pressed}`).join(', ')}`)
      console.log(`  plan "${one(m.plan?.text)}"`)
      for (const r of m.rows) console.log(`  ${one(r.cells[0].text).padEnd(2)} ${one(r.name?.text)} ${one(r.tier?.text)} | gain ${one(r.cells[3].text)} | saves ${one(r.cells[5].text)} | gate ${String(r.gate)} pick ${String(r.pick)}`)
    }

    // STEP D: the picker's menu.
    await page.click('[data-testid="gear-motes-target"] .MuiSelect-select', { timeout: 10_000 })
    await page.waitForSelector('ul[role="listbox"]', { timeout: 10_000 })
    await sleep(600)
    const menu = (await page.evaluate(`(() => {
      const ul = document.querySelector('ul[role="listbox"]')
      const paper = ul.closest('.MuiPaper-root')
      const pb = paper.getBoundingClientRect()
      return { paper: { x: pb.x, y: pb.y, w: pb.width, h: pb.height, b: pb.bottom }, vh: window.innerHeight, sh: paper.scrollHeight, ch: paper.clientHeight,
        items: [...ul.children].map((li) => ({ text: li.innerText, value: li.getAttribute('data-value'), role: li.getAttribute('role'), sel: li.getAttribute('aria-selected'), sw: li.scrollWidth, cw: li.clientWidth })) }
    })()`)) as { paper: unknown; vh: number; sh: number; ch: number; items: { text: string; value: string | null; role: string | null; sel: string | null; sw: number; cw: number }[] }
    save('1-D-menu', menu)
    console.log(`\nD target menu: paper ${JSON.stringify(menu.paper)} viewport h ${String(menu.vh)} sh/ch ${String(menu.sh)}/${String(menu.ch)}`)
    console.log(`  ${menu.items.map((i) => `${i.value === null ? `[${one(i.text)}]` : `${one(i.text)}${i.sel === 'true' ? '*' : ''}`}${i.sw > i.cw + 1 ? '(CUT)' : ''}`).join(' | ')}`)
    const values = menu.items.map((i) => i.value).filter((v): v is string => v !== null)
    await page.keyboard.press('Escape')
    await sleep(500)

    // STEP C: every target in turn: the gain column, the plan line, the empty text if any.
    for (const v of values) {
      await page.click('[data-testid="gear-motes-target"] .MuiSelect-select', { timeout: 10_000 })
      await page.waitForSelector(`li[data-value="${v}"]`, { timeout: 10_000 })
      await page.click(`li[data-value="${v}"]`)
      await sleep(900)
      const m = await measure(page)
      save(`1-C-target-${v}`, m)
      const gains = m.rows.map((r: { cells: { text: string }[] }) => one(r.cells[3].text) || '(blank)')
      const marks = m.rows.map((r: { cells: { text: string; title: string | null }[] }) => `${one(r.cells[0].text) || '_'}${r.cells[0].title ? `{${r.cells[0].title}}` : ''}`)
      console.log(`\nC target=${v}: shown "${one(m.targetValue)}" (select sw/cw ${String(m.targetSelect?.sw)}/${String(m.targetSelect?.cw)}) rows ${String(m.rows.length)} empty "${one(m.empty?.text)}"`)
      console.log(`  plan "${one(m.plan?.text)}" sw/cw ${String(m.plan?.sw)}/${String(m.plan?.cw)}`)
      console.log(`  names ${m.rows.map((r: { name: { text: string } }) => one(r.name?.text)).join(' | ')}`)
      console.log(`  gains ${gains.join(' | ')}`)
      console.log(`  marks ${marks.join(' | ')}`)
      const overlap = m.rows.some((r: { rect: { y: number } }, i: number) => i > 0 && r.rect.y < m.rows[i - 1].rect.b - 0.6)
      console.log(`  list sw/cw ${String(m.list?.sw)}/${String(m.list?.cw)} rows overlap ${String(overlap)}`)
    }
    // back to the default
    await page.click('[data-testid="gear-motes-target"] .MuiSelect-select', { timeout: 10_000 })
    await page.waitForSelector('li[data-value="balanced"]', { timeout: 10_000 })
    await page.click('li[data-value="balanced"]')
    await sleep(700)

    // STEP E: every hover text under the view.
    const t = await titles(page)
    save('1-E-titles', t)
    console.log('\nE hover texts:')
    for (const s of t) console.log(`  "${s}"${/[–—]/.test(s) ? '  <<< DASH' : ''}`)

    console.log(`\nconsole errors: ${String(errors.length)} ${errors.slice(0, 4).join(' | ')}`)
  } finally {
    clearTimeout(timer)
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
