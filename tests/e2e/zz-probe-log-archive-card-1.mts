/**
 * THROWAWAY PROBE (never committed): the Summarize and archive log card, scenario A.
 *
 * A fresh install with two characters. Steps: the switch OFF; ON with nothing archived; the
 * Archive now question; the archive itself (the result line and the row it leaves); the Turn it
 * off question; the second character's card in the same run.
 *
 * Run: node --import tsx tests/e2e/zz-probe-log-archive-card-1.mts
 * Leaves the staged install and userData for scenarios b, c, d (stage.json in the scratchpad).
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { OUT, loadStage, resizeTo, answerNotice, archiveDir, bounded, brief, cardText, ipcStatus, measure, openCard, reopenCard, saveStage, show, sweep, sweepTight, waitMessage, type Stage } from './zz-probe-log-archive-card-0.mjs'

async function main(): Promise<void> {
  buildIfStale()
  const QUICK = process.env.QUICK === '1'
  try {
    const old = loadStage()
    await removeUserData(old.userData)
    await removeUserData(old.installDir)
    console.log('removed the earlier staged install')
  } catch {
    // nothing staged before
  }
  const userData = makeUserData()
  const log = stageFixture('e2e-overview.log', { others: { Wolfgangamadeus: 'e2e-leveling.log' } })
  const stage: Stage = { installDir: log.installDir, logPath: log.logPath, userData, others: { ...log.others } }
  saveStage(stage)
  console.log(`staged: ${JSON.stringify(stage)}\nlive log bytes: ${String(statSync(log.logPath).size)}`)

  const record: Record<string, unknown> = { stage }
  const launched = await launchOnFixture(log, { userData })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  const bound = bounded(close, 300_000)
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
    const base = await page.evaluate(() => window.devicePixelRatio)

    // STEP 1: the switch off
    console.log(`\nSTEP 1 open the card: ${String(await openCard(page))}; main says ${brief(await ipcStatus(page))}`)
    if (!QUICK) await sweep(app, page, 'A1 switch OFF', record, base)

    // STEP 2: turn it on
    await page.click('[data-testid="log-archive-switch"]', { timeout: 20_000 })
    console.log(`\nSTEP 2 switch clicked; result line: "${await waitMessage(page)}"; main says ${brief(await ipcStatus(page))}`)
    if (!QUICK) await sweep(app, page, 'A2 ON, nothing archived', record, base)

    // STEP 3: the Archive now question
    await page.click('[data-testid="log-archive-rotate"]', { timeout: 20_000 })
    await sleep(400)
    console.log('\nSTEP 3 Archive now pressed once (the question)')
    if (!QUICK) await sweepTight(app, page, 'A3 Archive now question', record, base)

    // STEP 4: yes
    await page.click('[data-testid="log-archive-rotate-yes"]', { timeout: 20_000 })
    const said = await waitMessage(page, 90_000)
    const st = await ipcStatus(page)
    console.log(`\nSTEP 4 archived; result line: "${said}"\n  main says ${brief(st)}\n  folder: ${JSON.stringify(readdirSync(archiveDir(stage)))}\n  live log bytes now: ${String(statSync(stage.logPath).size)}`)
    if (!QUICK) await sweep(app, page, 'A4 just archived (same run)', record, base)

    // STEP 4b: come back to the card in the same run (the result line is gone, main is asked again)
    await sleep(2500)
    console.log(`\nSTEP 4b reopen the card: ${String(await reopenCard(page))}; main says ${brief(await ipcStatus(page))}`)
    await sweepTight(app, page, 'A4b archived this run, card reopened', record, base)

    // STEP 5: the Turn it off question
    await page.click('[data-testid="log-archive-switch"]', { timeout: 20_000 })
    await sleep(400)
    console.log('\nSTEP 5 switch clicked while on (the question)')
    await sweepTight(app, page, 'A5 Turn it off question', record, base)
    await page.click('[data-testid="log-archive-off-yes"]', { timeout: 20_000 })
    console.log(`  Turn off pressed; result line: "${await waitMessage(page)}"`)
    show('A5b turned OFF with an archive on disk | default 1280x860', await measure(page), record)
    await page.click('[data-testid="log-archive-switch"]', { timeout: 20_000 })
    console.log(`  on again; result line: "${await waitMessage(page)}"`)

    // STEP 6: the second character, same run
    const second = stage.others.Wolfgangamadeus
    const sw = await page.evaluate((p) => (window as unknown as { eq: { setCharacter: (x: string) => Promise<unknown> } }).eq.setCharacter(p), second)
    console.log(`\nSTEP 6 switched to the second character: ${JSON.stringify(sw).slice(0, 200)}`)
    await sleep(6000)
    console.log(`  reopen the card: ${String(await reopenCard(page))}; main says ${brief(await ipcStatus(page))}`)
    show('A6 second character, first archived this run | default 1280x860', await measure(page), record)
    // wait for its engine fold, then read again
    for (let i = 0; i < 10; i++) {
      const s = await ipcStatus(page)
      if (!s.rotateBlockers.some((b) => b.startsWith('The app is still reading'))) break
      await sleep(2000)
    }
    console.log(`  reopen the card: ${String(await reopenCard(page))}; main says ${brief(await ipcStatus(page))}`)
    show('A6b second character, engine caught up | default 1280x860', await measure(page), record)
    console.log(`  card text:\n${(await cardText(page)).split('\n').map((l) => `    ${l}`).join('\n')}`)

    // back to the first character so the next scenario starts on it
    await page.evaluate((p) => (window as unknown as { eq: { setCharacter: (x: string) => Promise<unknown> } }).eq.setCharacter(p), stage.logPath)
    await sleep(3000)
    console.log(`\nconsole errors: ${String(errors.length)} ${errors.slice(0, 4).join(' | ').slice(0, 600)}`)
    record.errors = errors
  } finally {
    bound.done()
    await close()
    writeFileSync(join(OUT, 'a.json'), JSON.stringify(record, undefined, 1))
    console.log('probe: app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
