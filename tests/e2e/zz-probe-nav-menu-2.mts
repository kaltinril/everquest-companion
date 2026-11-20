/**
 * THROWAWAY PROBE 2 (never committed): the Left menu card's edges.
 *   STEP 1  the spare room under the default menu, and the drawer scrolled to its foot at tall rows
 *   STEP 2  the keyboard on a stepper, to its end
 *   STEP 3  the Preferences search finds the card
 *   STEP 4  the other in-app text sizes (90, 110, 150%) at the default window and the minimum
 *   STEP 5  a stored value that is not on the ladder
 *
 * Run: node --import tsx tests/e2e/zz-probe-nav-menu-2.mts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { NAV_ROW_STEPS, NAV_TEXT_STEPS, navPx } from '../../src/shared/navMenu'

const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/nav-menu'

// The same page-side reading probe 1 uses, read from its file so the two cannot drift.
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'zz-probe-nav-menu-1.mts'), 'utf8')
const from = src.indexOf('const MEASURE = String.raw`') + 'const MEASURE = String.raw`'.length
const MEASURE = src.slice(from, src.indexOf('`\n', from))

/* eslint-disable @typescript-eslint/no-explicit-any */
type Reading = any
const lines: string[] = []
function say(s: string): void {
  lines.push(s)
  console.log(s)
}
const sel = (id: string): string => `[data-testid="${id}"]`
const measure = (page: Page): Promise<Reading> => page.evaluate(MEASURE) as Promise<Reading>
const textOf = (page: Page, selector: string): Promise<string> =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
const isDisabled = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => (document.querySelector(s) as HTMLButtonElement | null)?.disabled === true, selector)

async function walkTo(page: Page, stepper: string, want: number): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const shown = await textOf(page, sel(`${stepper}-value`))
    if (shown === navPx(want)) return
    const end = Number(shown.replace('px', '')) < want ? 'plus' : 'minus'
    if (await isDisabled(page, sel(`${stepper}-${end}`))) return
    await page.click(sel(`${stepper}-${end}`), { timeout: 10_000 })
    await settle(() => textOf(page, sel(`${stepper}-value`)), (v) => v !== shown, { timeoutMs: 8_000 })
  }
}

async function setZoom(page: Page, want: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const shown = await textOf(page, sel('pref-text-size-value'))
    if (shown === want) break
    const end = Number(shown.replace('%', '')) < Number(want.replace('%', '')) ? 'plus' : 'minus'
    await page.click(sel(`pref-text-size-${end}`), { timeout: 10_000 })
    await settle(() => textOf(page, sel('pref-text-size-value')), (v) => v !== shown, { timeoutMs: 10_000 })
  }
  await sleep(700)
}

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  const before = await page.evaluate(() => window.innerWidth)
  await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  await settle(() => page.evaluate(() => window.innerWidth), (v) => v !== before, { timeoutMs: 6_000 })
  await sleep(800)
}

async function openAppearance(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.click('[data-testid="prefs-rail-textsize"]', { timeout: 15_000 })
  await page.waitForSelector('[data-testid="pref-nav-text"]', { timeout: 15_000 })
}

/** The menu's real content height against the drawer, whether or not it scrolls. */
function fitLine(m: Reading): string {
  const need = m.bottom.topListBottom - m.paper.rect.y + m.paper.scrollTop + m.bottom.rect.h
  const fb = m.rows.find((r: Reading) => r.id === 'nav-feedback')
  return `drawer ${String(m.paper.ch)} tall, the menu needs ${String(+need.toFixed(1))} (spare ${String(+(m.paper.ch - need).toFixed(1))}), scrollHeight ${String(m.paper.sh)}, scrollbar ${String(m.paper.ow - m.paper.cw - 1)}px; feedback row ${String(fb.rect.h)}px, its second line "${String(fb.secondary.text)}" on ${String(fb.secondary.lines)} line(s), ink ${String(fb.secondary.ink.w)} in ${String(fb.secondary.cw)}`
}

function cardLine(m: Reading): string {
  const c = m.card
  const t = c.steppers['pref-nav-text']
  const r = c.steppers['pref-nav-row']
  return `card ${JSON.stringify(c.rect)} in viewport ${String(m.vw)}x${String(m.vh)}; "Text size" label box ${String(t.label.cw)}px wide holding ${String(t.label.sw)}px (ink ${String(t.label.ink.w)}), stepper x ${String(t.rect.x)}..${String(t.rect.r)}; "Row height" label box ${String(r.label.cw)}px holding ${String(r.label.sw)}px (ink ${String(r.label.ink.w)}), stepper x ${String(r.rect.x)}..${String(r.rect.r)}; card inner right ${String(c.rect.r)}; note on ${String(c.note.lines)} line(s) ${String(c.note.sw)}/${String(c.note.cw)}; page sideways ${String(m.docSW)}/${String(m.docCW)}; pane scroller ${JSON.stringify(c.scroller)}`
}

async function main(): Promise<void> {
  buildIfStale()
  const launch = await launchOnFixture('e2e-telemetry.log')
  const bomb = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void launch.close().finally(() => process.exit(3))
  }, 6 * 60_000)
  const consoleErrors: string[] = []
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    const notice = '[data-testid="telemetry-notice"]'
    await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
    if ((await countOf(page, notice)) > 0) {
      await page.click('[data-testid="telemetry-notice-off"]')
      await settleGone(page, notice, { timeoutMs: 8_000 })
    }
    await openAppearance(page)

    // STEP 1a: the spare room at every stop that fits, default window, 100%.
    say('STEP 1a default window 100%: the spare room under the menu')
    for (const text of [14, 16]) {
      await walkTo(page, 'pref-nav-text', text)
      for (const row of NAV_ROW_STEPS) {
        await walkTo(page, 'pref-nav-row', row)
        await sleep(300)
        say(`  text ${String(text)} row ${String(row)}: ${fitLine(await measure(page))}`)
      }
    }
    // STEP 1b: the drawer scrolled to its foot, where the feedback row, Preferences and the version sit.
    for (const [text, row] of [[14, 36], [16, 48], [12, 32]] as const) {
      await walkTo(page, 'pref-nav-text', text)
      await walkTo(page, 'pref-nav-row', row)
      await page.evaluate(() => {
        const p = document.querySelector('.MuiDrawer-paper') as HTMLElement
        p.scrollTop = p.scrollHeight
      })
      await sleep(1_600)
      const m = await measure(page)
      say(`STEP 1b text ${String(text)} row ${String(row)}, drawer scrolled to its foot (scrollTop ${String(m.paper.scrollTop)}):`)
      for (const id of ['nav-timers', 'nav-feedback', 'nav-preferences']) {
        const r = m.rows.find((x: Reading) => x.id === id)
        say(`  ${id}: "${String(r.text)}" row ${JSON.stringify(r.rect)} visible ${String(r.visible)} hit ${String(r.hit)} label lines ${String(r.primary.lines)}${r.secondary ? `, second line on ${String(r.secondary.lines)} line(s), ink ${JSON.stringify(r.secondary.ink)}` : ''}`)
      }
      say(`  update line "${String(m.updateChip.text)}" ${JSON.stringify(m.updateChip.rect)} hit ${String(m.updateChip.hit)}; drawer rect ${JSON.stringify(m.paper.rect)}`)
      await page.evaluate(() => {
        ;(document.querySelector('.MuiDrawer-paper') as HTMLElement).scrollTop = 0
      })
      await sleep(600)
    }
    await walkTo(page, 'pref-nav-text', 14)
    await walkTo(page, 'pref-nav-row', 28)

    // STEP 2: the keyboard, to the end of the row ladder.
    await page.focus(sel('pref-nav-row-plus'))
    const presses: string[] = []
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Enter')
      await sleep(250)
      const state = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null
        return `${a?.tagName ?? 'none'}[${a?.getAttribute('data-testid') ?? ''}]`
      })
      presses.push(`${await textOf(page, sel('pref-nav-row-value'))} focus ${state} plusDisabled ${String(await isDisabled(page, sel('pref-nav-row-plus')))}`)
    }
    say(`STEP 2 keyboard Enter x7 on "Taller rows": ${presses.join(' -> ')}`)
    await walkTo(page, 'pref-nav-row', 28)

    // STEP 3: the search.
    for (const q of ['menu', 'compact', 'row height', 'sidebar', 'spacing']) {
      await page.fill('[data-testid="prefs-search"] input', q)
      await sleep(700)
      const found = await page.evaluate(() => {
        const st = document.querySelector('[data-testid="pref-nav-text"]')
        const card = st?.closest('.MuiPaper-root') as HTMLElement | null
        return card ? card.innerText.replace(/\n+/g, ' | ').slice(0, 90) : 'NOT SHOWN'
      })
      say(`STEP 3 search "${q}": ${found}`)
    }
    await page.fill('[data-testid="prefs-search"] input', '')
    await sleep(500)
    await page.click('[data-testid="prefs-rail-textsize"]', { timeout: 15_000 })
    await page.waitForSelector('[data-testid="pref-nav-text"]', { timeout: 15_000 })

    // STEP 4: the other in-app text sizes, menu at its defaults (14px in 28px rows).
    for (const zoom of ['90%', '110%', '125%', '150%']) {
      await resizeTo(launch.app, page, 1280, 860)
      await setZoom(page, zoom)
      const wide = await measure(page)
      say(`STEP 4 ${zoom} default window (dpr ${String(wide.dpr)}): ${fitLine(wide)}`)
      say(`STEP 4 ${zoom} default window: ${cardLine(wide)}`)
      // the shortest rows at this size
      await walkTo(page, 'pref-nav-row', 24)
      await sleep(300)
      say(`STEP 4 ${zoom} default window, rows at 24px: ${fitLine(await measure(page))}`)
      await walkTo(page, 'pref-nav-row', 28)
      await resizeTo(launch.app, page, 900, 600)
      const narrow = await measure(page)
      say(`STEP 4 ${zoom} minimum window: ${fitLine(narrow)}`)
      say(`STEP 4 ${zoom} minimum window: ${cardLine(narrow)}`)
    }
    await resizeTo(launch.app, page, 1280, 860)
    await setZoom(page, '100%')

    // STEP 5: a stored value that is not a stop.
    for (const [rawText, rawRow] of [['14', '30'], ['14', '26'], ['abc', ''], ['99', '9999'], ['-3', '0'], ['13.4', '33.9']] as const) {
      await page.evaluate(([t, r]) => {
        localStorage.setItem('eq.nav.textPx', t)
        localStorage.setItem('eq.nav.rowPx', r)
      }, [rawText, rawRow] as const)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      await openAppearance(page)
      const m = await measure(page)
      const combat = m.rows.find((r: Reading) => r.id === 'nav-combat')
      const t = m.card.steppers['pref-nav-text']
      const r = m.card.steppers['pref-nav-row']
      let line = `STEP 5 stored text "${rawText}" row "${rawRow}": card prints ${String(t.value.text)} / ${String(r.value.text)}; drawn row ${String(combat.rect.h)}px font ${String(combat.primary.font)}; text -/+ disabled ${String(t.minus.disabled)}/${String(t.plus.disabled)}, row -/+ disabled ${String(r.minus.disabled)}/${String(r.plus.disabled)}`
      if (!r.plus.disabled) {
        await page.click(sel('pref-nav-row-plus'), { timeout: 10_000 })
        await sleep(300)
        line += `; one press of taller prints ${await textOf(page, sel('pref-nav-row-value'))}`
      } else if (!r.minus.disabled) {
        await page.click(sel('pref-nav-row-minus'), { timeout: 10_000 })
        await sleep(300)
        line += `; one press of shorter prints ${await textOf(page, sel('pref-nav-row-value'))}`
      }
      say(line)
    }
    say(`ladders: text ${NAV_TEXT_STEPS.join(',')} row ${NAV_ROW_STEPS.join(',')}`)
    say(`console errors: ${String(consoleErrors.length)} ${consoleErrors.slice(0, 3).join(' | ')}`)
  } finally {
    clearTimeout(bomb)
    await launch.close()
    writeFileSync(join(OUT, 'probe2-lines.txt'), lines.join('\n'))
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
