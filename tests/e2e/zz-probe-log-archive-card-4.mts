/**
 * THROWAWAY PROBE (never committed): the Summarize and archive log card, the unhappy states, on the
 * install the earlier scenarios left (stage.json; one sealed archive, an empty live log).
 *
 *   e  one launch: (1) a file in the archive folder that cannot be read, a put back's leftover piece,
 *      and a live log that starts before the archive ends; (2) a journal that appears while the app
 *      runs (an archive interrupted, no reason known to this run).
 *   d  the next launch on that journal: the archive that could not be finished, its reason and
 *      where the old log is kept.
 *   g  the same install with no engine binary to be found.
 *   clean  remove what e staged (journal, moved file, captured record, bad file, piece).
 *
 * Run: node --import tsx tests/e2e/zz-probe-log-archive-card-4.mts e|d|g|clean
 */
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { settleEngineServing } from './engineSteps.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { OUT, answerNotice, archiveDir, asFixture, bounded, brief, cardText, ipcStatus, loadStage, measure, normalize, openCard, reopenCard, show, sweep, sweepTight } from './zz-probe-log-archive-card-0.mjs'

const WHICH = process.argv[2] ?? 'e'
const FAKE = 'primitive_freeport-20261119210000-4096'
const OLDER = 'primitive_freeport-20260601120000-31457280'

async function main(): Promise<void> {
  buildIfStale()
  const stage = loadStage()
  const dir = archiveDir(stage)
  const journal = join(dir, 'rotation-journal.json')
  const moved = join(dir, `${FAKE}.moving`)
  const captured = join(dir, `${FAKE}.segment.json`)
  const bad = join(dir, 'older-build.segment.json')
  const sealed = readdirSync(dir)
    .filter((f) => f.endsWith('.segment.json') && f !== `${FAKE}.segment.json` && f !== `${OLDER}.segment.json` && f !== 'older-build.segment.json')
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id: string; state: string; log: { lastStamp: string } })
    .filter((s) => s.state === 'sealed')
    .sort((a, b) => a.log.lastStamp.localeCompare(b.log.lastStamp))
  const newest = sealed[sealed.length - 1]
  const piece = join(dir, `${newest?.id ?? 'none'}.70000.part`)
  const older = join(dir, `${OLDER}.segment.json`)

  if (WHICH === 'clean') {
    for (const f of [journal, moved, captured, bad, piece, older, join(dir, 'eqlog_Primitive_freeport_2026-06-01_to_2026-07-01.log.gz')]) rmSync(f, { force: true })
    console.log(`removed the staged files; folder: ${JSON.stringify(readdirSync(dir))}`)
    return
  }

  const writeJournal = (): void => {
    // A captured record whose moved log does not begin with the captured bytes: the launch
    // recovery cannot finish it and says why (rotate.ts finishFromMoved).
    const from = JSON.parse(readFileSync(join(dir, `${newest.id}.segment.json`), 'utf8')) as Record<string, unknown>
    const fake = { ...from, id: FAKE, state: 'captured', archivePath: null, log: { bytes: 4096, sha256: 'a'.repeat(64), headBytes: 4096, headSha256: 'b'.repeat(64), firstStamp: '2026-11-19 21:00:00', lastStamp: '2026-11-19 21:05:00' } }
    delete (fake as Record<string, unknown>).archiveSource
    delete (fake as Record<string, unknown>).archiveGzBytes
    writeFileSync(captured, JSON.stringify(fake))
    writeFileSync(moved, '[Thu Nov 19 21:00:00 2026] You have entered East Commonlands.\r\n'.repeat(80))
    writeFileSync(journal, JSON.stringify({ v: 1, logPath: stage.logPath, movedPath: moved, segmentId: FAKE, step: 'moved' }))
  }

  if (WHICH === 'e') {
    for (const f of [journal, moved, captured]) rmSync(f, { force: true })
    writeFileSync(bad, '{"v":1,"id":"older-build","character":"primitive_freeport","state":"sealed","log":{"bytes":10')
    writeFileSync(piece, '[Thu Nov 19 20:00:00 2026] You have slain a probe rat!\r\n')
    // The live log starts before the newest archive ends (a log edited by hand).
    if (statSync(stage.logPath).size === 0) appendFileSync(stage.logPath, '[Wed Aug 05 21:00:00 2026] You have entered East Commonlands.\r\n')
  }
  if (WHICH === 'd' && !existsSync(journal)) writeJournal()
  if (WHICH === 'd') {
    // A second, older kept archive, so the History list has two rows under the one held line.
    const from = JSON.parse(readFileSync(join(dir, `${newest.id}.segment.json`), 'utf8')) as Record<string, unknown>
    const gz = join(dir, 'eqlog_Primitive_freeport_2026-06-01_to_2026-07-01.log.gz')
    writeFileSync(gz, readFileSync(String(from.archivePath)))
    writeFileSync(older, JSON.stringify({ ...from, id: OLDER, archivePath: gz, log: { bytes: 31457280, sha256: 'c'.repeat(64), headBytes: 65536, headSha256: 'd'.repeat(64), firstStamp: '2026-06-01 12:00:00', lastStamp: '2026-07-01 12:00:00' }, archiveGzBytes: 2516582 }))
  }

  console.log(`scenario ${WHICH}\nnewest sealed: ${newest?.id ?? 'none'}\nfolder before launch: ${JSON.stringify(readdirSync(dir))}\nlive log bytes before launch: ${String(statSync(stage.logPath).size)}`)
  const record: Record<string, unknown> = { which: WHICH }
  const noEngine = WHICH === 'g' ? mkdtempSync(join(tmpdir(), 'zz-probe-no-engine-')) : undefined
  const launched = await launchOnFixture(asFixture(stage), {
    userData: stage.userData,
    ...(noEngine === undefined ? {} : { cwd: noEngine, waitForEngine: false })
  })
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
    const base = await normalize(app, page)

    if (WHICH === 'e') {
      // a few served reads, so main has decided which archives are shown and which are held
      await page.click('[data-testid="nav-overview"]', { timeout: 20_000 }).catch(() => undefined)
      await sleep(3000)
      console.log(`\nSTEP 1 open the card: ${String(await openCard(page))}`)
      await reopenCard(page)
      console.log(`  main says ${brief(await ipcStatus(page))}`)
      await sweep(app, page, 'E1 unreadable file + put-back piece + live log overlapping the archive', record, base)
      console.log(`  card text:\n${(await cardText(page)).split('\n').map((l) => `    ${l}`).join('\n')}`)

      writeJournal()
      console.log(`\nSTEP 2 a journal appears while the app runs; reopen: ${String(await reopenCard(page))}; main says ${brief(await ipcStatus(page))}`)
      await sweepTight(app, page, 'E2 interrupted archive, this run knows no reason', record, base)
    }

    if (WHICH === 'd') {
      console.log(`\nSTEP 1 open the card: ${String(await openCard(page))}`)
      show('D0 as the launch drew it | default 1280x860', await measure(page), record)
      await reopenCard(page)
      console.log(`  reopened; main says ${brief(await ipcStatus(page))}`)
      console.log(`  on disk: journal ${String(existsSync(journal))}, moved log ${String(existsSync(moved))} (${existsSync(moved) ? String(statSync(moved).size) : '-'} bytes), live log ${String(statSync(stage.logPath).size)} bytes`)
      await sweep(app, page, 'D1 an archive that could not be finished (reason from the launch)', record, base)
      console.log(`  card text:\n${(await cardText(page)).split('\n').map((l) => `    ${l}`).join('\n')}`)
    }

    if (WHICH === 'g') {
      const served = await settleEngineServing(app, 12_000)
      console.log(`\nSTEP 1 no engine binary can be found (cwd ${String(noEngine)}); the app said it is serving: ${String(served)}`)
      console.log(`  open the card: ${String(await openCard(page))}`)
      await sleep(8000)
      await reopenCard(page)
      console.log(`  20 s or so after launch, reopened; main says ${brief(await ipcStatus(page))}`)
      await sweepTight(app, page, 'G1 no engine', record, base)
      console.log(`  card text:\n${(await cardText(page)).split('\n').map((l) => `    ${l}`).join('\n')}`)
      const others = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid') ?? '').filter((t) => /engine/i.test(t)))
      console.log(`  engine notices on this screen (testids): ${JSON.stringify(others)}`)
    }

    console.log(`\nconsole errors: ${String(errors.length)} ${errors.slice(0, 4).join(' | ').slice(0, 600)}`)
    record.errors = errors
  } finally {
    bound.done()
    await close()
    if (noEngine !== undefined) rmSync(noEngine, { recursive: true, force: true })
    writeFileSync(join(OUT, `${WHICH}.json`), JSON.stringify(record, undefined, 1))
    console.log('probe: app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
