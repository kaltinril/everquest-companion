// zz-probe-skills-2.mts: THROWAWAY. The Skills tab on a log with no skill-up line: the empty
// state's words in both filter positions, then a first live raise, then the filter's own empty line.
import type { Page } from 'playwright-core'
import { settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, openSkills, report, requireBuilt, resizeTo, rowCount, say, setScale, waitRows } from './zz-probe-skills-0.mjs'

const emptyText = (page: Page): Promise<string> =>
  page.evaluate('(document.querySelector("[data-testid=skills-empty]") || { innerText: "<none>" }).innerText') as Promise<string>

async function main(): Promise<void> {
  requireBuilt()
  const launch = await launchOnFixture('e2e-voice.log')
  const done = bound(launch.close, 200_000)
  try {
    const page: Page = await mainWindow(launch.app)
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })

    // STEP 1: the first-run notice is still up: does it sit over the tab?
    await page.click('[data-testid="nav-skills"]', { timeout: 30_000 }).catch((e: unknown) => say('click with the notice up failed', String(e)))
    await sleep(1500)
    report('1-empty-with-first-run-notice', await measure(page))
    await answerNotice(page)
    await openSkills(page)
    await settle(() => emptyText(page), (t) => t !== '<none>', { timeoutMs: 20_000 })
    say('STEP 2 engine snapshot', await page.evaluate('window.eq.getModuleSnapshot("skills")'))
    report('2-empty-default', await measure(page))

    // STEP 3: the switch on an empty log.
    await page.click('[data-testid="skills-tradeskills-only"]')
    await sleep(600)
    report('3-empty-tradeskills-only', await measure(page))
    say('STEP 3 localStorage', await page.evaluate('localStorage.getItem("eq.skills.tradeskills")'))

    // STEP 4: leave and come back: is the switch still on, is the line still there?
    await page.click('[data-testid="nav-leveling"]')
    await sleep(800)
    await openSkills(page)
    await sleep(600)
    const m4 = await measure(page)
    say('STEP 4 after leaving and returning', { switch: m4.switch.checked, empty: m4.empty?.text })

    // STEP 5: with the switch ON, a first raise of a skill that is not a tradeskill.
    launch.log.append('You have become better at Dodge! (12)')
    const t5 = await settle(() => emptyText(page), (t) => t.includes('tradeskill'), { timeoutMs: 20_000 })
    say('STEP 5 empty line after a live Dodge raise, switch on', t5)
    report('5-no-tradeskill', await measure(page))

    // STEP 6: the app's minimum, then 125% on top.
    say('STEP 6 resized to', await resizeTo(launch.app, page, 900, 600))
    report('6-no-tradeskill-min', await measure(page))
    say('STEP 6 dpr', await setScale(page, 1.25))
    report('6b-no-tradeskill-min-125', await measure(page))
    say('STEP 6c dpr', await setScale(page, 1.5))
    report('6c-no-tradeskill-min-150', await measure(page))
    await setScale(page, 1)
    await resizeTo(launch.app, page, 1280, 860)

    // STEP 7: a tradeskill raise arrives while the switch is on.
    launch.log.append('You have become better at Fishing! (1)')
    await waitRows(page, 1, 20_000)
    report('7-first-tradeskill-row', await measure(page))

    // STEP 8: switch off: both rows.
    await page.click('[data-testid="skills-tradeskills-only"]')
    await sleep(600)
    say('STEP 8 rows with the switch off', await rowCount(page))
    report('8-two-rows', await measure(page))

    // STEP 9: a line with no level in it (the parser's optional group), and a very long name.
    launch.log.append('You have become better at Swimming!', 'You have become better at Specialize Transmutation Of The Seventh Circle! (1)')
    await sleep(3000)
    report('9-odd-lines', await measure(page))
    say('STEP 9 snapshot', await page.evaluate('window.eq.getModuleSnapshot("skills")'))
    say('console errors', errors)
  } finally {
    done()
    await launch.close()
  }
}

main().catch((err: unknown) => {
  console.error('probe error:', err)
  process.exitCode = 1
})
