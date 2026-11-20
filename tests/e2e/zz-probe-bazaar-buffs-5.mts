// zz-probe-bazaar-buffs-5.mts: THROWAWAY. Buffs tab: a death-bound estimate (the mob died still carrying
// the debuff), then the card on the next cast, second by second, until it outlives the bound.
import type { Page } from 'playwright-core'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture, type FixtureLog } from './logFixture.mjs'
import { answerNotice, bound, ev, requireBuilt, say, sleep } from './zz-probe-bazaar-buffs-0.mjs'

const DIALOG = '[data-testid="buff-duration-dialog"]'

function cards(page: Page): Promise<string[]> {
  return ev(page, `[...document.querySelectorAll('[data-testid="active-buff-name"]')].map((n) => { const card = n.closest('.MuiPaper-root'); const group = card.parentElement.previousElementSibling; return (group ? group.innerText.replace(/\\s+/g, ' ').trim() : '?') + ' :: ' + card.innerText.replace(/\\s*\\n\\s*/g, ' | '); })`)
}
function tableRows(page: Page): Promise<string[]> {
  return ev(page, `[...document.querySelectorAll('[data-testid="buff-stats-row"]')].map((r) => [...r.children].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()).join(' ; ') + '  {title: ' + ((r.querySelector('span[title]') || {}).title || '') + '}')`)
}
function cast(log: FixtureLog, spell: string, landed: string): void {
  const at = new Date()
  log.appendAt(new Date(at.getTime() - 1000), `You begin casting ${spell}.`)
  log.appendAt(at, landed)
}
async function watch(page: Page, seconds: number): Promise<string[]> {
  const t0 = Date.now()
  const seen: string[] = []
  let last = ''
  while (Date.now() - t0 < seconds * 1000) {
    const mine = (await cards(page)).join(' && ') || '(no card)'
    if (mine !== last) {
      seen.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s  ${mine}`)
      last = mine
    }
    await sleep(200)
  }
  return seen
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 200_000)
  const errors: string[] = []
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-buffs"]', { timeout: 60_000 })
    await answerNotice(page)
    await page.click('[data-testid="nav-buffs"]')
    await sleep(1200)

    // The wear-off sentence heard once, for a mob with no landing: the channel is known, no cast is measured.
    log.append('Your Flash of Light spell has worn off of a moss snake.')
    await sleep(800)
    cast(log, 'Flash of Light', 'Fippy Darkpaw is blinded by a flash of light.')
    say('STEP 1 first cast on Fippy Darkpaw, 12 s in the spell data', (await watch(page, 15)).join('\n'))
    log.append('You have slain Fippy Darkpaw!')
    await sleep(1500)
    say('STEP 2 after the death: cards', await cards(page))
    say('STEP 2 after the death: table', (await tableRows(page)).join('\n'))
    await ev(page, `(() => { const r = [...document.querySelectorAll('[data-testid="buff-stats-row"]')].find((x) => x.dataset.spell === 'Flash of Light'); if (r) r.querySelector('[data-testid="buff-duration-edit"]').click(); })()`)
    await sleep(800)
    say('STEP 2 dialog', await ev(page, `(() => { const d = document.querySelector('${DIALOG} .MuiDialog-paper'); return d ? d.innerText.replace(/\\s*\\n\\s*/g, ' | ') : 'no dialog'; })()`))
    await page.click('[data-testid="buff-duration-cancel"]').catch(() => undefined)
    await sleep(600)
    cast(log, 'Flash of Light', 'Fippy Darkpaw is blinded by a flash of light.')
    say('STEP 3 second cast, on the learned estimate', (await watch(page, 21)).join('\n'))
    say('console errors', errors.slice(0, 8))
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
