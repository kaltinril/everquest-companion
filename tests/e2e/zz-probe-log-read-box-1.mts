/**
 * THROWAWAY PROBE (never committed): the "Reading log..." box with NO ENGINE BINARY.
 *
 * Steps: launch with a cwd that has no engine (engine-absent.e2e.mts's way); time the box's
 * arrival on Overview; measure it at the default window, at 900 px and at 125 % text; the same on
 * Combat; then read what Loot, Leveling and Timers say.
 *
 * Run: node --import tsx tests/e2e/zz-probe-log-read-box-1.mts
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIfStale, countOf, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { BOX, OUT, answerNotice, bounded, contentText, ipcReport, measure, privacy, resizeTo, setScale, show, windowFacts } from './zz-probe-log-read-box-0.mjs'

async function main(): Promise<void> {
  buildIfStale()
  const record: Record<string, unknown> = {}
  const launched = await launchOnFixture('e2e-overview.log', { cwd: tmpdir(), waitForEngine: false })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  const bound = bounded(close, 240_000)
  try {
    const { app, log } = launched
    const page = await mainWindow(app)
    const t0 = Date.now()
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    console.log(`staged log: ${log.logPath}`)
    console.log(`window: ${await windowFacts(app, page)}`)
    console.log(`nav rows: ${JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="nav-"]')).map((e) => e.getAttribute('data-testid'))))}`)
    await answerNotice(page)

    // STEP 1: Overview, how long until the box is drawn
    await page.click('[data-testid="nav-overview"]')
    const tMount = Date.now()
    let seenAt = -1
    while (Date.now() - tMount < 25_000) {
      if ((await countOf(page, `[data-testid="overview-hydrating"] ${BOX}`)) > 0) {
        seenAt = Date.now() - tMount
        break
      }
      await sleep(250)
    }
    console.log(`\nSTEP 1 Overview: box drawn ${String(seenAt)} ms after the tab was clicked (${String(Date.now() - t0)} ms after the window)`)
    console.log(`   main says: ${JSON.stringify(await ipcReport(page))}`)
    const m1 = await measure(page, '[data-testid="overview-hydrating"]')
    show('STEP 1 engine missing | Overview | default window', m1)
    record.overviewDefault = m1
    privacy('overview box', String(m1.boxText ?? ''), [tmpdir()])
    console.log(`   whole Overview tab: ${JSON.stringify(await contentText(page))}`)
    const body = await page.evaluate(() => document.body.innerText)
    privacy('whole window', body, [tmpdir()])
    console.log(`   engine-launch-failure card: ${JSON.stringify(await page.evaluate(() => { const c = document.querySelector('[data-testid="engine-launch-failure"]') as HTMLElement | null; if (!c) return null; const r = c.getBoundingClientRect(); return { text: c.innerText, x: r.left, y: r.top, w: r.width, h: r.height, pos: getComputedStyle(c).position } }))}`)

    // STEP 2: the "Waiting" row counts up between asks?
    const w1 = String((m1.items as { text: string }[] | undefined)?.map((i) => i.text).join(' | '))
    await sleep(7000)
    const m1b = await measure(page, '[data-testid="overview-hydrating"]')
    console.log(`\nSTEP 2 seven seconds later the rows read: ${String((m1b.items as { text: string }[] | undefined)?.map((i) => i.text).join(' | '))}\n   (before: ${w1})`)

    // STEP 3: Combat
    await page.click('[data-testid="nav-combat"]')
    const tC = Date.now()
    let cAt = -1
    while (Date.now() - tC < 25_000) {
      if ((await countOf(page, `[data-testid="combat-hydrating"] ${BOX}`)) > 0) {
        cAt = Date.now() - tC
        break
      }
      await sleep(250)
    }
    console.log(`\nSTEP 3 Combat: box drawn ${String(cAt)} ms after the tab was clicked`)
    const m3 = await measure(page, '[data-testid="combat-hydrating"]')
    show('STEP 3 engine missing | Combat | default window', m3)
    record.combatDefault = m3
    privacy('combat box', String(m3.boxText ?? ''), [tmpdir()])
    console.log(`   whole Combat tab: ${JSON.stringify(await contentText(page))}`)

    // STEP 4: 900 px
    const got = await resizeTo(app, page, 900, 700)
    console.log(`\nSTEP 4 narrowed: outerWidth ${String(got)}; ${await windowFacts(app, page)}`)
    const m4 = await measure(page, '[data-testid="combat-hydrating"]')
    show('STEP 4 engine missing | Combat | 900 px', m4)
    record.combat900 = m4
    await page.click('[data-testid="nav-overview"]')
    await page.waitForSelector(`[data-testid="overview-hydrating"] ${BOX}`, { timeout: 25_000 }).catch(() => undefined)
    const m4o = await measure(page, '[data-testid="overview-hydrating"]')
    show('STEP 4b engine missing | Overview | 900 px', m4o)
    record.overview900 = m4o

    // STEP 5: 125 % text at 900 px, then at the default width
    console.log(`\nSTEP 5 text size 125 %: ${await setScale(page, 1.25)}`)
    await page.waitForSelector(`[data-testid="overview-hydrating"] ${BOX}`, { timeout: 25_000 }).catch(() => undefined)
    const m5 = await measure(page, '[data-testid="overview-hydrating"]')
    show('STEP 5 engine missing | Overview | 900 px, 125 %', m5)
    record.overview900x125 = m5
    await page.click('[data-testid="nav-combat"]')
    await page.waitForSelector(`[data-testid="combat-hydrating"] ${BOX}`, { timeout: 25_000 }).catch(() => undefined)
    const m5c = await measure(page, '[data-testid="combat-hydrating"]')
    show('STEP 5b engine missing | Combat | 900 px, 125 %', m5c)
    record.combat900x125 = m5c
    await resizeTo(app, page, 1280, 860)
    const m5d = await measure(page, '[data-testid="combat-hydrating"]')
    show('STEP 5c engine missing | Combat | 1280 px, 125 %', m5d)
    record.combat1280x125 = m5d
    console.log(`   back to 100 %: ${await setScale(page, 1)}`)

    // STEP 6: the other tabs
    for (const view of ['loot', 'leveling', 'timers', 'buffs', 'bazaar', 'gaps']) {
      const sel = `[data-testid="nav-${view}"]`
      if ((await countOf(page, sel)) === 0) {
        console.log(`\nSTEP 6 ${view}: no such nav row`)
        continue
      }
      await page.click(sel)
      await sleep(2500)
      const t = await contentText(page)
      console.log(`\nSTEP 6 ${view}: boxes ${String(await countOf(page, BOX))}; says: ${JSON.stringify(t.slice(0, 900))}`)
      record[`tab_${view}`] = t
    }
    console.log(`\nconsole errors: ${String(errors.length)} ${errors.slice(0, 4).join(' | ').slice(0, 600)}`)
  } finally {
    bound.done()
    await close()
    writeFileSync(join(OUT, 'probe1.json'), JSON.stringify(record, undefined, 1))
    console.log('probe: app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
