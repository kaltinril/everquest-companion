// zz-probe-bazaar-buffs-3.mts: THROWAWAY. Buffs tab: the card caption second by second as a buff outlives
// its estimate, for each duration source this probe can stage (db, From my log, Set it myself, a death
// bound), the Durations table cells, the edit dialog's words, and a saved choice against a running bar.
import type { Page } from 'playwright-core'
import { settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture, type FixtureLog } from './logFixture.mjs'
import { answerNotice, bound, ev, requireBuilt, save, say, sleep } from './zz-probe-bazaar-buffs-0.mjs'

const DIALOG = '[data-testid="buff-duration-dialog"]'

/** Every active card as one line: group, then the card's own text. */
function cards(page: Page): Promise<string[]> {
  return ev(page, `[...document.querySelectorAll('[data-testid="active-buff-name"]')].map((n) => { const card = n.closest('.MuiPaper-root'); const group = card.parentElement.previousElementSibling; return (group ? group.innerText.replace(/\\s+/g, ' ').trim() : '?') + ' :: ' + card.innerText.replace(/\\s*\\n\\s*/g, ' | '); })`)
}

function tableRows(page: Page): Promise<string[]> {
  return ev(page, `[...document.querySelectorAll('[data-testid="buff-stats-row"]')].map((r) => [...r.children].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()).join(' ; ') + '  {title: ' + ((r.querySelector('span[title]') || {}).title || '') + '}')`)
}

function header(page: Page): Promise<string> {
  return ev(page, `(() => { const h = [...document.querySelectorAll('h6')].find((x) => x.innerText.trim() === 'Buffs'); return h ? h.parentElement.innerText.replace(/\\s*\\n\\s*/g, ' | ') : 'no header'; })()`)
}

function cast(log: FixtureLog, spell: string, landed: string): void {
  const at = new Date()
  log.appendAt(new Date(at.getTime() - 1000), `You begin casting ${spell}.`)
  log.appendAt(at, landed)
}

/** Watch one spell's card for `seconds`, printing every change of its text with the second it changed. */
async function watch(page: Page, spell: string, seconds: number): Promise<string[]> {
  const t0 = Date.now()
  const seen: string[] = []
  let last = ''
  while (Date.now() - t0 < seconds * 1000) {
    const mine = (await cards(page)).filter((c) => c.includes(`:: ${spell} |`) || c.includes(`:: ${spell}`)).join(' && ') || '(no card)'
    if (mine !== last) {
      seen.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s  ${mine}`)
      last = mine
    }
    await sleep(250)
  }
  return seen
}

async function openDialog(page: Page, spell: string): Promise<string> {
  await ev(page, `[...document.querySelectorAll('[data-testid="buff-stats-row"]')].find((r) => r.dataset.spell === ${JSON.stringify(spell)}).querySelector('[data-testid="buff-duration-edit"]').click()`)
  await page.waitForSelector(DIALOG, { timeout: 10_000 })
  await sleep(400)
  return dialogText(page)
}

function dialogText(page: Page): Promise<string> {
  return ev(page, `(() => { const d = document.querySelector('${DIALOG} .MuiDialog-paper'); if (!d) return 'no dialog'; const inp = d.querySelector('[data-testid="buff-duration-input"]'); const radios = [...d.querySelectorAll('input[type=radio]')].map((r) => r.value + (r.checked ? '*' : '')).join(','); const saveBtn = d.querySelector('[data-testid="buff-duration-save"]'); return d.innerText.replace(/\\s*\\n\\s*/g, ' | ') + '  {radios ' + radios + '; input ' + (inp ? JSON.stringify(inp.value) : 'none') + '; save disabled ' + (saveBtn ? saveBtn.disabled : '?') + '}'; })()`)
}

async function pick(page: Page, mode: 'auto' | 'log' | 'fixed'): Promise<void> {
  await ev(page, `document.querySelector('${DIALOG} input[type=radio][value="${mode}"]').click()`)
  await sleep(300)
}

async function saveDialog(page: Page): Promise<void> {
  await page.click('[data-testid="buff-duration-save"]')
  await settle(() => ev<number>(page, `document.querySelectorAll('${DIALOG}').length`), (n) => n === 0, { timeoutMs: 8_000 })
  await sleep(700)
}

async function cancelDialog(page: Page): Promise<void> {
  await page.click('[data-testid="buff-duration-cancel"]')
  await settle(() => ev<number>(page, `document.querySelectorAll('${DIALOG}').length`), (n) => n === 0, { timeoutMs: 8_000 })
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 330_000)
  const errors: string[] = []
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-buffs"]', { timeout: 60_000 })
    await answerNotice(page)
    await page.click('[data-testid="nav-buffs"]')
    await sleep(1500)
    say('STEP 0 empty tab', { header: await header(page), body: await ev(page, `document.querySelector('[data-testid="app-content"]').innerText.replace(/\\s*\\n\\s*/g, ' | ')`) })

    // A. db: Bounce, 12 s in the spell data.
    cast(log, 'Bounce', 'A reflective aura surrounds you.')
    say('STEP A db source, Bounce 12 s: the card, second by second', (await watch(page, 'Bounce', 16)).join('\n'))
    say('STEP A header', await header(page))
    say('STEP A table', (await tableRows(page)).join('\n'))
    say('STEP A dialog', await openDialog(page, 'Bounce'))
    await cancelDialog(page)
    log.append('The reflective aura fades.')
    await sleep(1500)
    say('STEP A after the fade: cards', await cards(page))
    say('STEP A after the fade: table', (await tableRows(page)).join('\n'))

    // B. From my log: Jonthan's Whistling Warsong, one clean 4 s cast, then the choice, then a second cast.
    cast(log, "Jonthan's Whistling Warsong", 'You whistle an ancient warsong.')
    await sleep(4000)
    log.append('You stop whistling.')
    await sleep(1500)
    say('STEP B after one 4 s cast: table', (await tableRows(page)).join('\n'))
    say('STEP B dialog before', await openDialog(page, "Jonthan's Whistling Warsong"))
    await pick(page, 'log')
    say('STEP B dialog with From my log picked', await dialogText(page))
    await saveDialog(page)
    say('STEP B table after From my log', (await tableRows(page)).join('\n'))
    cast(log, "Jonthan's Whistling Warsong", 'You whistle an ancient warsong.')
    say('STEP B From my log: the card, second by second', (await watch(page, "Jonthan's Whistling Warsong", 9)).join('\n'))
    say('STEP B dialog reopened', await openDialog(page, "Jonthan's Whistling Warsong"))
    await cancelDialog(page)

    // C. Set it myself: Bounce typed 7.5.
    say('STEP C dialog before', await openDialog(page, 'Bounce'))
    await pick(page, 'fixed')
    const readings: string[] = []
    for (const t of ['abc', '', '0.5', '7,5', '1:30', '1m 30s', '4h', '7.5']) {
      await page.fill('[data-testid="buff-duration-input"]', t)
      await sleep(200)
      readings.push(`typed ${JSON.stringify(t)} -> ${await ev<string>(page, `document.querySelector('[data-testid="buff-duration-reading"]').innerText`)} ; save disabled ${String(await ev<boolean>(page, `document.querySelector('[data-testid="buff-duration-save"]').disabled`))}`)
    }
    say('STEP C typed readings', readings.join('\n'))
    say('STEP C dialog with 7.5 typed', await dialogText(page))
    await saveDialog(page)
    say('STEP C table after Set it myself 7.5', (await tableRows(page)).join('\n'))
    cast(log, 'Bounce', 'A reflective aura surrounds you.')
    say('STEP C Set it myself 7.5 s: the card, second by second', (await watch(page, 'Bounce', 11)).join('\n'))
    say('STEP C dialog reopened', await openDialog(page, 'Bounce'))
    await cancelDialog(page)

    // D. A saved choice against a bar already running: Divine Barrier, 18 s in the spell data.
    cast(log, 'Divine Barrier', 'You are surrounded by a divine barrier.')
    await sleep(2500)
    say('STEP D running, before any choice', (await cards(page)).filter((c) => c.includes('Divine Barrier')))
    await openDialog(page, 'Divine Barrier')
    await pick(page, 'fixed')
    await page.fill('[data-testid="buff-duration-input"]', '40')
    await saveDialog(page)
    say('STEP D after Set it myself 40', { card: (await cards(page)).filter((c) => c.includes('Divine Barrier')), row: (await tableRows(page)).filter((r) => r.startsWith('Divine Barrier')) })
    await openDialog(page, 'Divine Barrier')
    await page.fill('[data-testid="buff-duration-input"]', '3')
    await saveDialog(page)
    say('STEP D after Set it myself 3 (already older than 3 s)', { card: (await cards(page)).filter((c) => c.includes('Divine Barrier')), row: (await tableRows(page)).filter((r) => r.startsWith('Divine Barrier')) })
    await openDialog(page, 'Divine Barrier')
    await pick(page, 'auto')
    await saveDialog(page)
    say('STEP D back to Automatic', { card: (await cards(page)).filter((c) => c.includes('Divine Barrier')), row: (await tableRows(page)).filter((r) => r.startsWith('Divine Barrier')) })

    // E. A death bound: Flash of Light (12 s) on a named mob that dies 15 s in.
    cast(log, 'Flash of Light', 'Fippy Darkpaw is blinded by a flash of light.')
    say('STEP E debuff on a mob: the card, second by second', (await watch(page, 'Flash of Light', 15)).join('\n'))
    log.append('You have slain Fippy Darkpaw!')
    await sleep(1500)
    say('STEP E after the death: table', (await tableRows(page)).join('\n'))
    cast(log, 'Flash of Light', 'Fippy Darkpaw is blinded by a flash of light.')
    say('STEP E second cast: the card', (await watch(page, 'Flash of Light', 4)).join('\n'))

    say('STEP F every card now', await cards(page))
    say('STEP F header', await header(page))
    save('3-page.txt', await ev<string>(page, `document.querySelector('[data-testid="app-content"]').innerText`))
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
