// zz-probe-skills-4.mts: THROWAWAY. The Skills tab on a launch with no engine binary.
import { tmpdir } from 'node:os'
import type { Page } from 'playwright-core'
import { sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, report, requireBuilt, say } from './zz-probe-skills-0.mjs'

async function main(): Promise<void> {
  requireBuilt()
  const launch = await launchOnFixture('e2e-overview.log', { cwd: tmpdir(), waitForEngine: false })
  const done = bound(launch.close, 120_000)
  try {
    const page: Page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    await sleep(8000)
    await answerNotice(page)
    await page.evaluate('document.querySelector("[data-testid=nav-skills]").click()')
    await sleep(1500)
    report('1-engine-absent', await measure(page))
    say('STEP 1 snapshot', await page.evaluate('window.eq.getModuleSnapshot("skills")'))
    say('STEP 1 failure card', await page.evaluate('(() => { const c = document.querySelector("[data-testid=engine-launch-failure]"); return c ? { text: c.innerText, rect: c.getBoundingClientRect().toJSON() } : null; })()'))
    say('STEP 1 whole content area', await page.evaluate('document.querySelector("[data-testid=app-content]").innerText'))
    say('STEP 1 body text', await page.evaluate('document.body.innerText.slice(0, 1500)'))
    // The switch: does it do anything a player can see?
    await page.click('[data-testid="skills-tradeskills-only"]').catch((e: unknown) => say('switch click failed', String(e)))
    await sleep(500)
    const m = await measure(page)
    say('STEP 2 after the switch', { viewText: m.viewText, switch: m.switch })
  } finally {
    done()
    await launch.close()
  }
}

main().catch((err: unknown) => {
  console.error('probe error:', err)
  process.exitCode = 1
})
