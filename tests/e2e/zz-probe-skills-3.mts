// zz-probe-skills-3.mts: THROWAWAY. What the Skills tab shows WHILE a long log is still being read.
import type { Page } from 'playwright-core'
import { writeFileSync } from 'node:fs'
import { sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture, stamp } from './logFixture.mjs'
import { bound, measure, report, requireBuilt, say } from './zz-probe-skills-0.mjs'

const LINES = Number(process.env.PROBE_LINES ?? '900000')

const SAMPLE = `(async () => {
  const view = document.querySelector('[data-testid="skills-view"]');
  const snap = await window.eq.getModuleSnapshot('skills');
  const combat = await window.eq.getCombatSnapshot({});
  const content = document.querySelector('[data-testid="app-content"]');
  return {
    view: view ? view.innerText : '<no skills view>',
    snap: snap === null ? 'null' : ('rows=' + (snap.state && snap.state.rows ? snap.state.rows.length : '?') + ' seq=' + snap.seq),
    hydrating: combat ? combat.hydrating : 'no combat snap',
    readingAnywhere: /Reading/i.test(document.body.innerText),
    content: content ? content.innerText.slice(0, 260) : '<no content>'
  };
})()`

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const now = Date.now()
  const start = now - (LINES + 3600) * 1000
  const parts: string[] = []
  parts.push(`${stamp(new Date(start))} Welcome to EverQuest Legends!`)
  for (let i = 1; i <= LINES; i++) {
    const at = stamp(new Date(start + i * 1000))
    if (i % 5000 === 0) parts.push(`${at} You have become better at ${['Fishing', 'Dodge', 'Offense', 'Baking'][(i / 5000) % 4]}! (${String(i / 5000)})`)
    else if (i % 7 === 0) parts.push(`${at} A decaying skeleton hits YOU for ${String(1 + (i % 40))} points of damage.`)
    else if (i % 11 === 0) parts.push(`${at} You have slain a decaying skeleton!`)
    else parts.push(`${at} You slash a decaying skeleton for ${String(1 + (i % 90))} points of damage.`)
  }
  writeFileSync(log.logPath, `${parts.join('\r\n')}\r\n`, 'utf8')
  say('staged lines', LINES)

  const t0 = Date.now()
  const launch = await launchOnFixture(log, { waitForEngine: false })
  const done = bound(async () => { await launch.close(); await log.dispose() }, 280_000)
  try {
    const page: Page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    say('window up after ms', Date.now() - t0)
    // The first-run notice is left alone: this is what a new player has on screen.
    await page.evaluate('document.querySelector("[data-testid=nav-skills]").click()')
    let last = ''
    let measuredLoading = false
    let toured = false
    const until = Date.now() + 200_000
    while (Date.now() < until) {
      const s = (await page.evaluate(SAMPLE)) as { view: string; snap: string; hydrating: unknown; readingAnywhere: boolean; content: string }
      const key = JSON.stringify([s.view.slice(0, 160), s.snap.startsWith('null') ? 'null' : 'rows', s.hydrating, s.readingAnywhere])
      if (key !== last) {
        last = key
        console.log(`\n[t+${String(Date.now() - t0)} ms] snap=${s.snap} combat.hydrating=${String(s.hydrating)} "Reading" anywhere on screen=${String(s.readingAnywhere)}\n   skills view text: ${JSON.stringify(s.view.slice(0, 300))}`)
      }
      if (!measuredLoading && s.hydrating === true && s.view !== '<no skills view>') {
        measuredLoading = true
        report('1-while-reading', await measure(page))
      }
      if (!toured && s.hydrating === true && s.view !== '<no skills view>') {
        toured = true
        // What the neighbouring tabs say in the same moment, for comparison.
        for (const v of ['leveling', 'loot', 'combat', 'overview', 'buffs']) {
          await page.evaluate(`document.querySelector('[data-testid="nav-${v}"]').click()`)
          await sleep(500)
          const c = (await page.evaluate(SAMPLE)) as { content: string; hydrating: unknown }
          console.log(`   [neighbour ${v}, hydrating=${String(c.hydrating)}] ${JSON.stringify(c.content.replace(/\s+/g, ' ').slice(0, 220))}`)
        }
        await page.evaluate('document.querySelector("[data-testid=nav-skills]").click()')
        await sleep(300)
      }
      if (s.hydrating === false && !s.snap.startsWith('null') && s.view.includes('Fishing')) break
      await sleep(120)
    }
    say('settled after ms', Date.now() - t0)
    report('2-after-reading', await measure(page))
  } finally {
    done()
    await launch.close()
    await log.dispose()
  }
}

main().catch((err: unknown) => {
  console.error('probe error:', err)
  process.exitCode = 1
})
