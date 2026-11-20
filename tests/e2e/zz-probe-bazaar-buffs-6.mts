// zz-probe-bazaar-buffs-6.mts: THROWAWAY. Bazaar: a tier with its own watch (no box ticked) beside an
// every-tier watch: what its row chip and panel say against what alerts; then "Every tier" ticked on
// that tier while an every-tier watch already exists.
import type { Page } from 'playwright-core'
import { settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { LIB, answerNotice, bound, ev, requireBuilt, say, sleep, typeAndBlur } from './zz-probe-bazaar-buffs-0.mjs'

const DAY = 86_400_000
const ROW0 = '[data-testid="bazaar-row-Fleeting Quiver|0"]'
const ROW4 = '[data-testid="bazaar-row-Fleeting Quiver|4"]'
const WMAX = '[data-testid="bazaar-watch-wts-max"]'

async function tick(page: Page, testid: string): Promise<void> {
  await ev(page, `document.querySelector('[data-testid="${testid}"] input, input[data-testid="${testid}"]').click()`)
  await sleep(500)
}
async function tickLabel(page: Page, label: string): Promise<void> {
  await ev(page, `[...document.querySelectorAll('[data-testid="bazaar-watch"] label')].find((l) => l.innerText.trim() === ${JSON.stringify(label)}).querySelector('input').click()`)
  await sleep(600)
}
const chipsOf = (page: Page): Promise<unknown> => ev(page, `[...document.querySelectorAll('[data-testid^="bazaar-row-Fleeting"]')].map((r) => r.getAttribute('data-testid').slice(11) + ' => ' + ((r.querySelector('[data-testid="bazaar-watch-chip"]') || {}).innerText || 'no chip'))`)
const stored = (page: Page): Promise<unknown> => ev(page, 'window.eq.getBazaarWatch().then((l) => l.entries)')
const panel = (page: Page): Promise<unknown> => ev(page, `[...document.querySelectorAll('[data-testid="bazaar-watch"] input')].map((i) => (i.type === 'checkbox' ? (i.closest('label').innerText.trim() + '=' + i.checked) : (i.getAttribute('data-testid') + '=' + JSON.stringify(i.value))))`)
const heard = (page: Page): Promise<string | null> => ev(page, `(() => { const h = document.querySelector('[data-testid="bazaar-heard"]'); return h ? h.innerText.replace(/\\n+/g, ' | ') : null; })()`)

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const now = Date.now()
  const at = (days: number): Date => new Date(now - days * DAY)
  log.appendAt(at(2), "Leric auctions, 'WTS Fleeting Quiver 14k'", "Leric auctions, 'WTS Fleeting Quiver +4 30k'")
  log.appendAt(at(1), "Ivor auctions, 'WTS Fleeting Quiver 15k'", "Jask auctions, 'WTS Fleeting Quiver +4 29k'")

  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 200_000)
  try {
    const page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-bazaar"]', { timeout: 60_000 })
    await answerNotice(page)
    await page.click('[data-testid="nav-bazaar"]')
    await page.waitForSelector('[data-testid="bazaar-view"]', { timeout: 30_000 })
    await settle(() => ev<number>(page, `document.querySelectorAll('[data-testid^="bazaar-row-"]').length`), (n) => n >= 2, { timeoutMs: 30_000 })

    // +4: watched, neither box ticked.
    await page.click(ROW4)
    await sleep(500)
    await tick(page, 'bazaar-watch-on')
    // +0: watched, WTS at or under 31k, then every tier.
    await page.click(ROW0)
    await sleep(500)
    await tick(page, 'bazaar-watch-on')
    await tick(page, 'bazaar-watch-wts')
    await typeAndBlur(page, WMAX, '31000')
    await tickLabel(page, 'Every tier')
    say('STEP 1 stored', await stored(page))
    say('STEP 1 chips', await chipsOf(page))
    await page.click(ROW4)
    await sleep(500)
    say('STEP 1 +4 panel', await panel(page))

    log.append("Tovi auctions, 'WTS Fleeting Quiver +4 25k'")
    const h = await settle(() => heard(page), (x) => x !== null && /Tovi/.test(x), { timeoutMs: 15_000 })
    say('STEP 2 heard after a +4 sale at 25k', h ?? 'no alert')
    say('STEP 2 chips', await chipsOf(page))
    say('STEP 2 +4 panel', await panel(page))
    say('STEP 2 heard line geometry', await ev(page, `(() => { ${LIB} const l = document.querySelector('[data-testid="bazaar-heard"] .MuiTypography-body2'); if (!l) return null; const t = l.querySelector('span'); const g = document.createRange(); g.selectNodeContents(l.lastChild); const tr = g.getBoundingClientRect(); return { time: rc(t), textStartsAt: f(tr.left), gap: f(tr.left - t.getBoundingClientRect().right) }; })()`))

    // "Every tier" ticked on +4, while an every-tier watch already exists.
    await tickLabel(page, 'Every tier')
    say('STEP 3 after ticking Every tier on +4: stored', await stored(page))
    say('STEP 3 chips', await chipsOf(page))
    await page.click(ROW0)
    await sleep(500)
    say('STEP 3 +0 panel', await panel(page))
  } finally {
    unbound()
    await launch.close()
    await log.dispose()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
