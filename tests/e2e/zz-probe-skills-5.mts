// zz-probe-skills-5.mts: THROWAWAY. A log whose first line repeats the level already known: the
// old log is archived, the fresh log's first skill line states the archived level again.
import type { Page } from 'playwright-core'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { settle, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, openSkills, report, requireBuilt, say, waitRows } from './zz-probe-skills-0.mjs'

const MIN = 60_000
const rowsText = (page: Page): Promise<string[]> =>
  page.evaluate('Array.from(document.querySelectorAll("[data-testid=skill-row]")).map((r) => Array.from(r.querySelectorAll("td")).map((c) => c.innerText).join(" | "))') as Promise<string[]>
const snapOf = (page: Page): Promise<unknown> => page.evaluate('window.eq.getModuleSnapshot("skills")')

async function main(): Promise<void> {
  requireBuilt()
  const now = Date.now()
  const log = stageFixture('e2e-voice.log')
  const userData = makeUserData()
  const y = 26 * 60
  log.appendAt(new Date(now - y * MIN), 'Welcome to EverQuest Legends!')
  log.appendAt(new Date(now - (y - 5) * MIN), 'You have become better at Fishing! (126)', 'You have become better at Dodge! (100)')
  log.appendAt(new Date(now - (y - 15) * MIN), 'You have become better at Fishing! (127)', 'You have become better at Baking! (40)')
  log.appendAt(new Date(now - 30 * MIN), 'Welcome to EverQuest Legends!')
  log.appendAt(new Date(now - 20 * MIN), 'You have become better at Fishing! (128)')
  log.appendAt(new Date(now - 19 * MIN), 'You have become better at Tailoring! (9)')

  let launch = await launchOnFixture(log, { userData })
  let done = bound(async () => { await launch.close(); await log.dispose(); await removeUserData(userData) }, 280_000)
  try {
    let page: Page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    await answerNotice(page)
    await openSkills(page)
    await waitRows(page, 4)
    say('STEP 1 before the archive: rows', (await rowsText(page)).join('\n'))

    // STEP 2: archive the log (Preferences does this through the same two calls).
    say('STEP 2 switch on', await page.evaluate('window.eq.setLogArchiveEnabled(true)'))
    let rotated: { ok?: boolean; message?: string } = {}
    for (let i = 0; i < 10; i++) {
      rotated = (await page.evaluate('window.eq.logArchiveRotate()')) as { ok?: boolean; message?: string }
      if (rotated.ok === true) break
      await sleep(2000)
    }
    say('STEP 2 archive reply', { ok: rotated.ok, message: rotated.message })
    say('STEP 2 live log bytes', statSync(log.logPath).size)
    say('STEP 2 archive folder', readdirSync(join(log.installDir, 'Logs', 'companion-archive')).join(', '))
    await sleep(3000)
    say('STEP 2 same run after the archive: rows', (await rowsText(page)).join('\n'))
    say('STEP 2 snapshot', await snapOf(page))

    // STEP 3: the fresh log's FIRST lines repeat the archived levels (a capped skill does this).
    log.append('You have become better at Fishing! (128)', 'You have become better at Dodge! (100)')
    await sleep(5000)
    say('STEP 3 same run, after the repeating first lines: rows', (await rowsText(page)).join('\n'))
    say('STEP 3 snapshot', await snapOf(page))
    report('3-same-run-after-repeat', await measure(page))
    done()
    await launch.close()

    // STEP 4: the next launch reads the fresh log and the archive.
    launch = await launchOnFixture(log, { userData })
    done = bound(async () => { await launch.close(); await log.dispose(); await removeUserData(userData) }, 200_000)
    page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    await answerNotice(page)
    await openSkills(page)
    await settle(() => rowsText(page), (r) => r.length >= 4, { timeoutMs: 30_000 })
    await sleep(2000)
    say('STEP 4 next launch (fresh log + archive): rows', (await rowsText(page)).join('\n'))
    say('STEP 4 snapshot', await snapOf(page))
    report('4-relaunch-after-repeat', await measure(page))

    // STEP 5: a real raise follows the repeated line in the same session.
    log.append('You have become better at Fishing! (129)')
    await settle(() => rowsText(page), (r) => r.some((x) => x.startsWith('Fishing | 129')), { timeoutMs: 20_000 })
    say('STEP 5 after a real raise to 129: rows', (await rowsText(page)).join('\n'))
    say('STEP 5 snapshot', await snapOf(page))
    await page.locator('[data-testid="skill-rate-withheld"]').first().hover({ timeout: 10_000 }).catch((e: unknown) => say('hover failed', String(e)))
    await sleep(1200)
    say('STEP 5 the dash reason', (await measure(page)).tooltips)
    await page.mouse.move(2, 2)

    // STEP 6: Tradeskills only over the joined rows.
    await page.click('[data-testid="skills-tradeskills-only"]')
    await sleep(600)
    say('STEP 6 tradeskills only: rows', (await rowsText(page)).join('\n'))
  } finally {
    done()
    await launch.close()
    await log.dispose()
    await removeUserData(userData)
  }
}

main().catch((err: unknown) => {
  console.error('probe error:', err)
  process.exitCode = 1
})
