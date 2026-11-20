/**
 * THROWAWAY (never committed). Skeptic's check: a fresh install, switch on, left on Preferences,
 * then a plain relaunch. Does the card keep a stale "still reading" line after main clears it?
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { buildIfStale, countOf, settle, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { CARD, answerNotice, bounded, ipcStatus, openCard } from './zz-probe-log-archive-card-0.mjs'

const OUT = 'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/verify-log-archive-card'
mkdirSync(OUT, { recursive: true })

const cardSays = (page: Page): Promise<{ caption: string; blockers: string; disabled: boolean | null; present: boolean }> =>
  page.evaluate((sel) => {
    const card = document.querySelector(sel)
    const b = card?.querySelector('[data-testid="log-archive-blockers"]') as HTMLElement | null
    const btn = card?.querySelector('[data-testid="log-archive-rotate"]') as HTMLButtonElement | null
    const cap = card?.querySelector('.MuiTypography-caption') as HTMLElement | null
    return { present: card !== null, caption: cap?.innerText ?? '', blockers: b ? b.innerText : '', disabled: btn ? btn.disabled : null }
  }, CARD)

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  const log = stageFixture('e2e-overview.log')
  const record: Record<string, unknown> = {}
  try {
    // Launch 1: switch on, stay on Preferences > Game.
    {
      const l = await launchOnFixture(log, { userData })
      const b = bounded(() => l.close(), 120_000)
      try {
        const page = await mainWindow(l.app)
        await answerNotice(page)
        console.log('L1 card open:', await openCard(page))
        await page.click('[data-testid="log-archive-switch"] input', { timeout: 15_000 })
        await settle(() => ipcStatus(page), (s) => s.enabled, { timeoutMs: 20_000 })
        await sleep(1500)
        console.log('L1 card:', JSON.stringify(await cardSays(page)))
      } finally {
        b.done()
        await l.close()
      }
    }
    // Launch 2: plain relaunch, same userData, do not touch the card.
    {
      const t0 = Date.now()
      const at = (): string => `${((Date.now() - t0) / 1000).toFixed(1)} s`
      const l = await launchOnFixture(log, { userData, waitForEngine: false })
      const b = bounded(() => l.close(), 120_000)
      try {
        const page = await mainWindow(l.app)
        await settle(() => countOf(page, CARD), (c) => c > 0, { timeoutMs: 60_000 })
        const rows: unknown[] = []
        for (let i = 0; i < 10; i++) {
          const c = await cardSays(page)
          const m = await ipcStatus(page)
          rows.push({ at: at(), card: c, main: m.rotateBlockers })
          console.log(`[${at()}] card: ${JSON.stringify(c)} | main: ${JSON.stringify(m.rotateBlockers)}`)
          await sleep(2000)
        }
        record.relaunch = rows
      } finally {
        b.done()
        await l.close()
      }
    }
  } finally {
    writeFileSync(join(OUT, 'v1.json'), JSON.stringify(record, undefined, 1))
    await log.dispose()
    await removeUserData(userData)
    console.log('probe: done')
  }
}

main().catch((e: unknown) => {
  console.error('probe error', e)
  process.exitCode = 1
})
