/**
 * THROWAWAY PROBE 5 (void-motes): gear known, default window.
 *  P1 the list scrolled: does the header stay, opaque, over the rows?
 *  P2 the Gear tab's class pick: does it move this tab's numbers, and does this tab say so?
 *  P3 the longest item names the item data holds, worn at +9: the Item cell and the plan line.
 *  P4 a click on an item name: where it lands.
 */
import type { Page } from 'playwright-core'
import { readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, buildIfStale, settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { bound, measure, openTab, report, save, type M } from './zz-probe-void-motes-0.mjs'

const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
const CLASSES = '[data-testid="gear-classes"]'

const gains = (m: M): string => m.rows.map((r: { name: { text: string }; cells: { text: string }[] }) => `${one(r.name?.text)} ${one(r.cells[3].text) || '(blank)'}`).join(' | ')

async function chips(page: Page): Promise<string[]> {
  return (await page.evaluate(`[...document.querySelectorAll('${CLASSES} .MuiChip-label')].map((n) => n.textContent || '')`)) as string[]
}

async function setTarget(page: Page, v: string): Promise<void> {
  await page.click('[data-testid="gear-motes-target"] .MuiSelect-select', { timeout: 10_000 })
  await page.waitForSelector(`li[data-value="${v}"]`, { timeout: 10_000 })
  await page.click(`li[data-value="${v}"]`)
  await sleep(800)
}

async function main(): Promise<void> {
  buildIfStale()
  const { app, close, log } = await launchOnFixture('e2e-planner.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  const timer = bound(280_000, close)
  try {
    const page: Page = await mainWindow(app)
    await openTab(page)
    await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 30_000 }).catch(() => undefined)
    await sleep(800)

    // P1: scroll the list.
    await page.evaluate(`document.querySelector('[data-testid="gear-motes-list"]').scrollTop = 140`)
    await sleep(1600)
    const p1 = (await page.evaluate(`(() => {
      const list = document.querySelector('[data-testid="gear-motes-list"]')
      const lb = list.getBoundingClientRect()
      const ths = [...list.querySelectorAll('thead th')]
      const rows = [...list.querySelectorAll('[data-testid="gear-motes-row"]')]
      return { scrollTop: list.scrollTop, listY: lb.y, listB: lb.bottom,
        th: ths.map((t) => { const b = t.getBoundingClientRect(); const cs = getComputedStyle(t); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { text: t.innerText, y: b.y, h: b.height, pos: cs.position, bg: cs.backgroundColor, z: cs.zIndex, hit: top === t || t.contains(top) ? 'self' : (top ? top.tagName + ':' + (top.getAttribute('data-testid') || '') : 'null') } }),
        under: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.y < lb.y + 29 && b.bottom > lb.y }).map((r) => ({ y: r.getBoundingClientRect().y, b: r.getBoundingClientRect().bottom, name: r.innerText.slice(0, 40) })),
        last: (() => { const b = rows[rows.length - 1].getBoundingClientRect(); return { y: b.y, b: b.bottom } })() }
    })()`)) as { scrollTop: number; listY: number; listB: number; th: { text: string; y: number; h: number; pos: string; bg: string; z: string; hit: string }[]; under: unknown[]; last: { y: number; b: number } }
    console.log(`P1 list scrolled to ${String(p1.scrollTop)}: list top ${String(p1.listY)}; header cells ${p1.th.map((t) => `${t.text}@y${t.y.toFixed(1)} ${t.pos} bg ${t.bg} z${t.z} hit ${t.hit}`).join(' | ')}`)
    console.log(`P1 rows passing under the header: ${JSON.stringify(p1.under)}`)
    await page.evaluate(`document.querySelector('[data-testid="gear-motes-list"]').scrollTop = 99999`)
    await sleep(1600)
    const end = (await page.evaluate(`(() => { const list = document.querySelector('[data-testid="gear-motes-list"]'); const rows = [...list.querySelectorAll('[data-testid="gear-motes-row"]')]; const b = rows[rows.length - 1].getBoundingClientRect(); const lb = list.getBoundingClientRect(); const u = document.querySelector('[data-testid="gear-motes-unranked"]'); return { lastB: b.bottom, listB: lb.bottom, unrankedY: u ? u.getBoundingClientRect().y : null, text: rows[rows.length - 1].innerText.slice(0, 50) } })()`)) as Record<string, unknown>
    console.log(`P1 scrolled to the end: ${JSON.stringify(end)}`)
    await page.evaluate(`document.querySelector('[data-testid="gear-motes-list"]').scrollTop = 0`)
    await sleep(800)

    // P2: the class pick.
    await setTarget(page, 'tank')
    const before = await measure(page)
    console.log(`\nP2 Tank, the classes as launched: ${gains(before)}`)
    console.log(`P2 plan before: "${one(before.plan?.text)}"`)
    const wordsAboutClass = /class|paladin|wizard|warrior/i.exec(before.viewText ?? '')
    console.log(`P2 does the tab name a class anywhere: ${wordsAboutClass === null ? 'no' : `yes: ${wordsAboutClass[0]}`}`)
    await page.click('[data-testid="tab-gear"]', { timeout: 15_000 })
    await page.waitForSelector(CLASSES, { timeout: 20_000 })
    await sleep(1500)
    console.log(`P2 the Gear tab's class picker holds: ${JSON.stringify(await chips(page))}`)
    for (let i = 0; i < 20; i++) {
      if ((await chips(page)).length === 0) break
      await page.click(`${CLASSES} input`, { timeout: 15_000 })
      await page.keyboard.press('Backspace')
    }
    await page.click(`${CLASSES} input`, { timeout: 15_000 })
    await page.fill(`${CLASSES} input`, 'Wizard')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await sleep(1000)
    console.log(`P2 the Gear tab's class picker now holds: ${JSON.stringify(await chips(page))}`)
    await page.click('[data-testid="tab-voidMotes"]', { timeout: 15_000 })
    await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 20_000 })
    await sleep(1200)
    const after = await measure(page)
    save('5-P2-wizard', after)
    console.log(`P2 Tank, after picking Wizard on the Gear tab: ${gains(after)}`)
    console.log(`P2 plan after: "${one(after.plan?.text)}"`)
    console.log(`P2 the numbers moved: ${String(gains(before) !== gains(after))}; the tab's words outside the table changed: ${String(one(before.plan?.text) !== one(after.plan?.text))}; dump line "${one(after.dumpLine?.text)}"`)
    // put the pick back to nothing
    await page.click('[data-testid="tab-gear"]', { timeout: 15_000 })
    await page.waitForSelector(CLASSES, { timeout: 20_000 })
    for (let i = 0; i < 20; i++) {
      if ((await chips(page)).length === 0) break
      await page.click(`${CLASSES} input`, { timeout: 15_000 })
      await page.keyboard.press('Backspace')
    }
    await page.keyboard.press('Escape')
    await page.click('[data-testid="tab-voidMotes"]', { timeout: 15_000 })
    await page.waitForSelector('[data-testid="gear-motes-row"]', { timeout: 20_000 })
    await sleep(800)
    const none = await measure(page)
    console.log(`P2 Tank, with no class picked: ${gains(none)}`)
    await setTarget(page, 'balanced')

    // P3: the longest names.
    const longest = (await page.evaluate(`window.eq.gearIndex().then((idx) => idx.rows.map((r) => r.name).sort((a, b) => b.length - a.length).slice(0, 4))`)) as string[]
    console.log(`\nP3 the longest names in the item data: ${JSON.stringify(longest)}`)
    const fixture = readFileSync(join(ROOT, 'tests', 'fixtures', 'Primitive_freeport-Inventory.txt'), 'utf8')
    let i = 0
    const text = fixture.split(/\r?\n/).map((line) => {
      const cols = line.split('\t')
      if (cols.length < 5 || /-Slot|^General|^Bank|^Shared|^Held|^Cursor|^Location/.test(cols[0] ?? '') || cols[1] === 'Empty') return line
      const n = i++
      const base = n < 3 ? (longest[n] ?? 'x') : (cols[1] ?? '').replace(/ \+\d+$/, '')
      return [cols[0], `${base} +${n < 3 ? '9' : '10'}`, ...cols.slice(2)].join('\t')
    }).join('\r\n')
    const sigOf = (m: M): string => `${one(m.plan?.text)}|${String(m.rows.length)}`
    const was = sigOf(await measure(page))
    const at = join(log.installDir, 'Primitive_freeport-Inventory.txt')
    writeFileSync(at, text, 'utf8')
    utimesSync(at, new Date(), new Date())
    await settle(() => measure(page), (m) => sigOf(m) !== was, { timeoutMs: 20_000, pollMs: 250 })
    await sleep(1200)
    const p3 = await measure(page)
    save('5-P3-long-names', p3)
    report('P3 the three longest names worn at +9, default window', p3)
    for (const r of p3.rows) console.log(`P3 item cell: td ${JSON.stringify(r.cells[1].rect)} name box w${String(r.name?.rect.w)} sw/cw ${String(r.name?.sw)}/${String(r.name?.cw)} title "${String(r.name?.title)}" tier box ${JSON.stringify(r.tier?.rect)} hit ${String(r.tier?.hit)}`)

    // P4: click a name.
    const nameSel = '[data-testid="gear-motes-row"] [data-testid="planner-donor-name"]'
    const clicked = one((await page.evaluate(`document.querySelector('${nameSel}').innerText`)) as string)
    const cursor = (await page.evaluate(`getComputedStyle(document.querySelector('${nameSel}')).cursor`)) as string
    await page.click(nameSel, { timeout: 10_000 })
    await sleep(2500)
    const land = (await page.evaluate(`(() => ({ motes: document.querySelector('[data-testid="void-motes-view"]') !== null, tabs: [...document.querySelectorAll('[data-testid^="tab-"]')].filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.innerText), nav: [...document.querySelectorAll('[data-testid^="nav-"]')].filter((n) => n.classList.contains('Mui-selected') || n.getAttribute('aria-current')).map((n) => n.getAttribute('data-testid')), heading: (document.querySelector('[data-testid="app-content"]') || document.body).innerText.replace(/\\s+/g, ' ').slice(0, 300), back: [...document.querySelectorAll('button, a')].filter((b) => /back/i.test(b.innerText || b.getAttribute('aria-label') || '')).map((b) => (b.innerText || b.getAttribute('aria-label')).slice(0, 60)) }))()`)) as Record<string, unknown>
    console.log(`\nP4 clicked "${clicked}" (cursor ${cursor}); landed: ${JSON.stringify(land)}`)
  } finally {
    clearTimeout(timer)
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
