/**
 * THROWAWAY PROBE (never committed): the Summarize and archive log card, scenarios B and C, on the
 * install scenario A left (stage.json in the scratchpad).
 *
 *   b  a fresh launch with one sealed archive: the History row, the Refresh and Put back questions
 *      (one, then both open), a Refresh, then Put back (the app's own restart is turned into a
 *      plain exit so no second app is left running).
 *   c  the launch after the put back: the caption, the list, Archive now and what it leaves.
 *
 * Run: node --import tsx tests/e2e/zz-probe-log-archive-card-2.mts b|c
 */
import { appendFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stamp } from './logFixture.mjs'
import { CARD, OUT, answerNotice, archiveDir, asFixture, bounded, brief, cardText, ipcStatus, loadStage, measure, normalize, openCard, reopenCard, resizeTo, setScale, show, sweep, sweepTight, waitMessage } from './zz-probe-log-archive-card-0.mjs'

const WHICH = process.argv[2] ?? 'b'

const cancelAll = async (page: Page): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate((sel) => Array.from(document.querySelectorAll(`${sel} button`)).filter((b) => (b as HTMLElement).innerText.trim().toLowerCase() === 'cancel').length, CARD)
    if (n === 0) return
    await page.click(`${CARD} button:has-text("Cancel")`, { timeout: 10_000 }).catch(() => undefined)
    await sleep(200)
  }
}

async function main(): Promise<void> {
  buildIfStale()
  const stage = loadStage()
  const dir = archiveDir(stage)
  console.log(`scenario ${WHICH}\nstage: ${JSON.stringify(stage)}\nfolder before launch: ${JSON.stringify(readdirSync(dir))}\nlive log bytes before launch: ${String(statSync(stage.logPath).size)}`)
  const record: Record<string, unknown> = { stage, which: WHICH }
  const launched = await launchOnFixture(asFixture(stage), { userData: stage.userData })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  const bound = bounded(close, 320_000)
  try {
    const { app } = launched
    const page = await mainWindow(app)
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    await answerNotice(page)
    const base = await normalize(app, page)
    console.log(`base devicePixelRatio ${String(base)}`)
    const who = await page.evaluate(() => (window as unknown as { eq: { getCharacter: () => Promise<{ name: string } | null> } }).eq.getCharacter())
    console.log(`attached character: ${JSON.stringify(who).slice(0, 160)}`)

    if (WHICH === 'b') {
      console.log(`\nSTEP 1 open the card: ${String(await openCard(page))}; main says ${brief(await ipcStatus(page))}`)
      await sweep(app, page, 'B1 sealed archive listed (fresh launch)', record, base)

      await page.click('[data-testid="log-archive-refresh"]', { timeout: 20_000 })
      await sleep(300)
      console.log('\nSTEP 2 Refresh pressed once (the question)')
      await sweep(app, page, 'B2 Refresh question', record, base)
      await cancelAll(page)

      await page.click('[data-testid="log-archive-restore"]', { timeout: 20_000 })
      await sleep(300)
      console.log('\nSTEP 3 Put back pressed once (the question)')
      await sweep(app, page, 'B3 Put back question', record, base)

      await page.click('[data-testid="log-archive-refresh"]', { timeout: 20_000 }).catch((e: unknown) => console.log(`  Refresh not clickable beside the open question: ${String(e).slice(0, 200)}`))
      await sleep(300)
      console.log('\nSTEP 4 both questions open')
      await sweep(app, page, 'B4 Refresh and Put back questions both open', record, base)
      await cancelAll(page)
      await sleep(300)

      // STEP 5: a real Refresh
      await page.click('[data-testid="log-archive-refresh"]', { timeout: 20_000 })
      await page.click('[data-testid="log-archive-refresh-yes"]', { timeout: 20_000 })
      await sleep(250)
      console.log(`\nSTEP 5 Refresh running; the card says: "${await page.evaluate((sel) => (document.querySelector(`${sel} .MuiAlert-message`) as HTMLElement | null)?.innerText ?? '', CARD)}"`)
      show('B5a while the refresh runs | default 1280x860', await measure(page), record)
      const said = await waitMessage(page, 180_000)
      console.log(`  refresh result line: "${said}"; main says ${brief(await ipcStatus(page))}`)
      await sweepTight(app, page, 'B5 after Refresh', record, base)

      // STEP 6: the game writes a few lines, then Put back
      const lines = ['You have slain a probe rat!', 'You have slain a probe bat!', 'You have entered East Commonlands.']
      appendFileSync(stage.logPath, lines.map((l) => `${stamp(new Date())} ${l}\r\n`).join(''))
      await sleep(2500)
      await reopenCard(page)
      console.log(`\nSTEP 6 three lines written to the fresh log; main says ${brief(await ipcStatus(page))}`)
      show('B6 before Put back | default 1280x860', await measure(page), record)
      const stubbed = await app.evaluate(({ app: a }) => {
        ;(a as unknown as { relaunch: () => void }).relaunch = () => undefined
        return String(a.relaunch).slice(0, 40)
      })
      console.log(`  the app's restart is now a plain exit for this probe (relaunch = ${stubbed})`)
      await resizeTo(app, page, 900, 600)
      await setScale(page, 1.25, base)
      await page.click('[data-testid="log-archive-restore"]', { timeout: 20_000 })
      await page.click('[data-testid="log-archive-restore-yes"]', { timeout: 20_000 })
      // The app exits 1.5 s after the reply: read at once, in one round trip each.
      try {
        const msg = await waitMessage(page, 30_000)
        console.log(`  put back result line: "${msg}"`)
        show('B6b just after Put back, before the app exits | minimum 900x600 at 125%', await measure(page), record)
      } catch (e) {
        console.log(`  the app had already gone: ${String(e).slice(0, 200)}`)
      }
      await sleep(4000)
      console.log(`  folder after put back: ${JSON.stringify(readdirSync(dir))}\n  live log bytes: ${String(statSync(stage.logPath).size)}`)
    }

    if (WHICH === 'c') {
      console.log(`\nSTEP 1 open the card: ${String(await openCard(page))}; main says ${brief(await ipcStatus(page))}`)
      show('C1 put-back log (launch after the put back) | default 1280x860', await measure(page), record)
      console.log(`\nSTEP 1b leave the card and come back: ${String(await reopenCard(page))}; main says ${brief(await ipcStatus(page))}`)
      await sweepTight(app, page, 'C1b put-back log, card reopened', record, base)
      console.log(`  card text:\n${(await cardText(page)).split('\n').map((l) => `    ${l}`).join('\n')}`)

      await page.click('[data-testid="log-archive-rotate"]', { timeout: 20_000 })
      await sleep(300)
      console.log('\nSTEP 2 Archive now pressed once on a put-back log (the question)')
      await sweepTight(app, page, 'C2 Archive now question on a put-back log', record, base)

      await page.click('[data-testid="log-archive-rotate-yes"]', { timeout: 20_000 })
      const said = await waitMessage(page, 90_000)
      console.log(`\nSTEP 3 archived again; result line: "${said}"\n  main says ${brief(await ipcStatus(page))}\n  folder: ${JSON.stringify(readdirSync(dir))}\n  live log bytes: ${String(statSync(stage.logPath).size)}`)
      await sweep(app, page, 'C3 put-back log archived again (same run)', record, base)
    }

    console.log(`\nconsole errors: ${String(errors.length)} ${errors.slice(0, 4).join(' | ').slice(0, 600)}`)
    record.errors = errors
  } finally {
    bound.done()
    await close()
    writeFileSync(join(OUT, `${WHICH}.json`), JSON.stringify(record, undefined, 1))
    console.log('probe: app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
