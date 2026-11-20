/**
 * THROWAWAY PROBE (never committed): the Summarize and archive log card, on the install the earlier
 * scenarios left (stage.json).
 *
 *   h  two characters archived in ONE run: the first, then the second (a 15-letter name), with the
 *      result line measured at the 900x600 minimum and at 125%.
 *   i  an archive interrupted DURING this run (the compressed copy cannot be written: a folder sits
 *      where its temporary file goes), the result line and the reason the card then shows; then
 *      the second character's card in the same run.
 *
 * Run: node --import tsx tests/e2e/zz-probe-log-archive-card-5.mts h|i
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stamp } from './logFixture.mjs'
import { OUT, answerNotice, archiveDir, asFixture, bounded, brief, ipcStatus, loadStage, measure, normalize, openCard, reopenCard, resizeTo, setScale, show, sweep, waitMessage, type Reading } from './zz-probe-log-archive-card-0.mjs'

const WHICH = process.argv[2] ?? 'h'

function alertBox(tag: string, r: Reading): void {
  for (const it of r.items ?? []) {
    if (it.kind !== 'alertmsg') continue
    console.log(`  ${tag}: result line box w${String(it.rect.w)} scrollWidth ${String(it.sw)} clientWidth ${String(it.cw)}, ink ${String(it.inkL)}..${String(it.inkR)} against box right ${String(it.rect.r)} (overflow ${it.ov})${it.sw > it.cw + 1 ? '  <<< CUT-X' : ''}`)
  }
}

const switchTo = (page: Page, logPath: string): Promise<unknown> =>
  page.evaluate((p) => (window as unknown as { eq: { setCharacter: (x: string) => Promise<unknown> } }).eq.setCharacter(p), logPath)

async function settledCard(page: Page): Promise<void> {
  for (let i = 0; i < 15; i++) {
    const s = await ipcStatus(page)
    if (!s.rotateBlockers.some((b) => b.startsWith('The app is still reading'))) break
    await sleep(1000)
  }
  await reopenCard(page)
}

async function main(): Promise<void> {
  buildIfStale()
  const stage = loadStage()
  const dir = archiveDir(stage)
  const second = stage.others.Wolfgangamadeus
  const block = join(dir, `eqlog_Primitive_freeport_${new Date().toISOString().slice(0, 4)}-PLACEHOLDER`)
  void block
  if (WHICH === 'i') {
    // The first character's log gets a few lines stamped now, and a folder sits where the archive's
    // temporary file goes (backup.ts writes `<name>.log.gz.partial`).
    rmSync(join(dir, 'rotation-journal.json'), { force: true })
    writeFileSync(stage.logPath, '')
    const now = new Date()
    appendFileSync(stage.logPath, ['You have entered East Commonlands.', 'You have slain a probe rat!', 'You have slain a probe bat!'].map((l) => `${stamp(now)} ${l}\r\n`).join(''))
    const day = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const tmp = join(dir, `eqlog_Primitive_freeport_${day}_to_${day}.log.gz.partial`)
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'in-the-way.txt'), 'x')
    console.log(`staged a folder where the temporary archive goes: ${tmp}`)
  }
  console.log(`scenario ${WHICH}\nfolder before launch: ${JSON.stringify(readdirSync(dir))}\nlive log bytes: first ${String(statSync(stage.logPath).size)}, second ${String(statSync(second).size)}`)
  const record: Record<string, unknown> = { which: WHICH }
  const launched = await launchOnFixture(asFixture(stage), { userData: stage.userData })
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
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    await answerNotice(page)
    const base = await normalize(app, page)
    await openCard(page)
    await settledCard(page)
    console.log(`\nSTEP 1 the first character's card; main says ${brief(await ipcStatus(page))}`)

    if (WHICH === 'h') {
      await page.click('[data-testid="log-archive-rotate"]', { timeout: 20_000 })
      await page.click('[data-testid="log-archive-rotate-yes"]', { timeout: 20_000 })
      console.log(`  first character archived; result line: "${await waitMessage(page, 90_000)}"`)

      console.log(`\nSTEP 2 switch to the second character: ${JSON.stringify(await switchTo(page, second)).slice(0, 120)}`)
      await sleep(3000)
      await settledCard(page)
      console.log(`  main says ${brief(await ipcStatus(page))}`)
      show('H2 second character, the first archived this run | default 1280x860', await measure(page), record)

      await resizeTo(app, page, 900, 600)
      await page.click('[data-testid="log-archive-rotate"]', { timeout: 20_000 })
      await page.click('[data-testid="log-archive-rotate-yes"]', { timeout: 20_000 })
      console.log(`\nSTEP 3 second character archived in the same run; result line: "${await waitMessage(page, 90_000)}"\n  main says ${brief(await ipcStatus(page))}`)
      let r = await measure(page)
      show('H3 second character (15-letter name) just archived | minimum 900x600', r, record)
      alertBox('900x600', r)
      await setScale(page, 1.25, base)
      r = await measure(page)
      show('H3 second character (15-letter name) just archived | minimum 900x600 at 125%', r, record)
      alertBox('900x600 at 125%', r)
      await resizeTo(app, page, 1280, 860)
      r = await measure(page)
      alertBox('1280x860 at 125%', r)
      record['H3 default at 125%'] = r
      await setScale(page, 1, base)
      await switchTo(page, stage.logPath)
      await sleep(2500)
    }

    if (WHICH === 'i') {
      await page.click('[data-testid="log-archive-rotate"]', { timeout: 20_000 })
      await page.click('[data-testid="log-archive-rotate-yes"]', { timeout: 20_000 })
      const said = await waitMessage(page, 90_000)
      console.log(`\nSTEP 2 Archive now, with the copy unable to be written; result line: "${said}"\n  main says ${brief(await ipcStatus(page))}\n  folder: ${JSON.stringify(readdirSync(dir))}\n  live log bytes: ${String(statSync(stage.logPath).size)}`)
      const moving = readdirSync(dir).filter((f) => f.endsWith('.moving'))
      console.log(`  the old log on disk: ${JSON.stringify(moving.map((f) => `${f} (${String(statSync(join(dir, f)).size)} bytes)`))}; journal there: ${String(existsSync(join(dir, 'rotation-journal.json')))}`)
      await sweep(app, page, 'I2 archive interrupted during this run', record, base)
      let r = await measure(page)
      alertBox('1280x860', r)

      console.log(`\nSTEP 3 switch to the second character: ${JSON.stringify(await switchTo(page, second)).slice(0, 120)}`)
      await sleep(3000)
      await settledCard(page)
      console.log(`  main says ${brief(await ipcStatus(page))}`)
      r = await measure(page)
      show('I3 second character while the first one\'s archive is unfinished | default 1280x860', r, record)
      await switchTo(page, stage.logPath)
      await sleep(2500)
    }
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
