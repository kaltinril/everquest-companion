// zz-probe-verify-combat-chart-71.mts: skeptic check (folded pet rate). Folded you+pet row rate
// vs the You-scope header. Throwaway, never committed.
import { settle, settleGone, sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, openCombat, readDash, requireBuilt, say, setLayoutKey } from './zz-probe-combat-chart-0.mjs'

const FIXTURE = process.argv[2] ?? 'g1-group-lifecycle.log'
const FIGHT = process.argv[3] ?? ''

async function main(): Promise<void> {
  requireBuilt()
  const { app, close } = await launchOnFixture(FIXTURE)
  const stop = bound(close, 180_000)
  try {
    const page = await mainWindow(app)
    await answerNotice(page)
    await openCombat(page)
    await waitHydrated(page)
    if (FIGHT) {
      await page.click('[data-testid="segment-select"]')
      await page.waitForSelector(`li[data-value="${FIGHT}"]`, { timeout: 15_000 })
      await page.click(`li[data-value="${FIGHT}"]`)
      await settleGone(page, '[data-testid="fight-picker"]', { timeoutMs: 8_000 })
      await sleep(800)
    }
    for (const layout of ['nested', 'separate'] as const) {
      say(`[${layout}] prefs agreed`, await setLayoutKey(page, layout))
      await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 30_000 })
      await sleep(700)
      for (const scope of ['you', 'everyone'] as const) {
        const btn = `[data-testid="meter-scope-${scope}"]`
        if ((await page.$$(btn)).length === 0) { say(`[${layout}/${scope}]`, 'no scope button'); continue }
        await page.click(btn, { timeout: 10_000 })
        await settle(async () => (await page.$$(`${btn}.Mui-selected`)).length, (n) => n === 1, { timeoutMs: 6000 })
        await sleep(600)
        const d = await readDash(page)
        say(`[${layout}/${scope}] head`, d.meterHead)
        say(`[${layout}/${scope}] rows`, [...(d.rows as { text: string }[]), ...((d.grows as { text: string }[]) ?? [])].map((r) => r.text))
      }
    }
    await setLayoutKey(page, 'nested')
  } finally {
    stop()
    await close()
  }
  console.log('verify-71 done')
}

main().catch((err: unknown) => { console.error('probe error', err); process.exitCode = 1 })
