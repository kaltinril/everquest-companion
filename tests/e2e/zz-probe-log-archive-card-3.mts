/**
 * THROWAWAY PROBE (never committed): does the card's "still reading your log" line go away by
 * itself? On the install the earlier scenarios left (stage.json).
 *
 * It polls main's own answer (logArchiveStatus over the bridge) from the first moment the window
 * exists and prints every change with its time, opens the card at a stated moment, and then reads
 * the card and main side by side for a while WITHOUT touching the card.
 *
 * Run: node --import tsx tests/e2e/zz-probe-log-archive-card-3.mts [early|late]
 *   early = open the card as soon as the window can be driven (before the engine has caught up)
 *   late  = open it 4 s after main first says nothing blocks the archive
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { buildIfStale, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { settleEngineServing } from './engineSteps.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { CARD, OUT, answerNotice, asFixture, bounded, ipcStatus, loadStage, openCard, reopenCard } from './zz-probe-log-archive-card-0.mjs'

const WHEN = process.argv[2] ?? 'late'

const cardSays = (page: Page): Promise<{ blockers: string; archiveNowDisabled: boolean | null }> =>
  page.evaluate((sel) => {
    const card = document.querySelector(sel)
    const b = card?.querySelector('[data-testid="log-archive-blockers"]') as HTMLElement | null
    const btn = card?.querySelector('[data-testid="log-archive-rotate"]') as HTMLButtonElement | null
    return { blockers: b ? b.innerText : '', archiveNowDisabled: btn ? btn.disabled : null }
  }, CARD)

async function main(): Promise<void> {
  buildIfStale()
  const stage = loadStage()
  const t0 = Date.now()
  const at = (): string => `${((Date.now() - t0) / 1000).toFixed(1)} s`
  const record: Record<string, unknown> = { when: WHEN }
  const launched = await launchOnFixture(asFixture(stage), { userData: stage.userData, waitForEngine: false })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  const bound = bounded(close, 200_000)
  try {
    const { app } = launched
    let servingAt = ''
    void settleEngineServing(app, 120_000).then((ok) => {
      servingAt = at()
      console.log(`[${servingAt}] the app printed its engine-serving sentence: ${String(ok)}`)
    })
    const page = await mainWindow(app)
    await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
    console.log(`[${at()}] the window can be driven`)

    // main's answer, polled; every change is printed
    const timeline: { at: string; blockers: string[] }[] = []
    let last = '?'
    let stop = false
    let firstClear = 0
    const poll = (async (): Promise<void> => {
      while (!stop) {
        try {
          const s = await ipcStatus(page)
          const key = JSON.stringify(s.rotateBlockers)
          if (key !== last) {
            last = key
            timeline.push({ at: at(), blockers: s.rotateBlockers })
            console.log(`[${at()}] main: blockers = ${key}`)
            if (s.rotateBlockers.length === 0 && firstClear === 0) firstClear = Date.now()
          }
        } catch {
          // the window went away
        }
        await sleep(150)
      }
    })()

    if (WHEN === 'early') {
      await answerNotice(page)
      console.log(`[${at()}] opening the card now: ${String(await openCard(page))}`)
    } else {
      while (firstClear === 0) await sleep(100)
      await sleep(4000)
      await answerNotice(page)
      console.log(`[${at()}] opening the card 4 s after main first said nothing blocks: ${String(await openCard(page))}`)
    }
    const first = await cardSays(page)
    console.log(`[${at()}] CARD on opening: blockers "${first.blockers}", Archive now disabled = ${String(first.archiveNowDisabled)}`)
    record.onOpening = first

    // Leave the card alone and read both sides.
    const side: unknown[] = []
    for (let i = 0; i < 8; i++) {
      await sleep(3000)
      const c = await cardSays(page)
      const m = await ipcStatus(page)
      side.push({ at: at(), card: c, main: m.rotateBlockers })
      console.log(`[${at()}] card: "${c.blockers}" disabled=${String(c.archiveNowDisabled)} | main: ${JSON.stringify(m.rotateBlockers)}`)
    }
    record.sideBySide = side

    console.log(`[${at()}] leave the card and come back: ${String(await reopenCard(page))}`)
    const again = await cardSays(page)
    console.log(`[${at()}] CARD after coming back: blockers "${again.blockers}", Archive now disabled = ${String(again.archiveNowDisabled)}`)
    record.afterComingBack = again
    stop = true
    await poll
    record.timeline = timeline
    record.servingAt = servingAt
  } finally {
    bound.done()
    await close()
    writeFileSync(join(OUT, `f-${WHEN}.json`), JSON.stringify(record, undefined, 1))
    console.log('probe: app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
