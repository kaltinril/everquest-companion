// THROWAWAY PROBE 1 (key: respawn-alert): every STATE of the pre-alert control, the edit dialog and
// the seeded alert, at the default window and 100% text. Words and measurements only.
import type { Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import {
  DIALOG,
  INPUT,
  LEAD,
  OWN_MOB,
  WIKI_MOB,
  answerNotice,
  bodyText,
  closeEditor,
  dashes,
  dumpControl,
  dumpDialog,
  install,
  leadValue,
  openEditor,
  rowSel,
  saveDisabled,
  say,
  show,
  showLeaves,
  stageClocks,
  storedAlert,
  view,
  windowBounds
} from './zz-probe-respawn-alert-0.mjs'

interface Def {
  id: string
  name: string
  enabled: boolean
  trigger: { type: string; signal?: string }
  [k: string]: unknown
}
function listAlerts(page: Page): Promise<Def[]> {
  return page.evaluate(() => (window as unknown as { eq: { listAlerts: () => Promise<Def[]> } }).eq.listAlerts())
}
function spoken(page: Page): Promise<{ text: string; uttered: boolean }[]> {
  return page.evaluate(
    () => (window as unknown as { __eqSpeech?: { spoken: { text: string; uttered: boolean }[] } }).__eqSpeech?.spoken ?? []
  )
}

/** Type into the seconds field, then finish the typing one way, and say what the field and the store hold. */
async function typeLead(page: Page, typed: string, finish: 'enter' | 'blur' | 'none'): Promise<void> {
  await page.click(LEAD, { timeout: 10_000 })
  await page.fill(LEAD, typed)
  const during = await leadValue(page)
  const duringM = (await show(page, `lead typed "${typed}" (before ${finish})`, LEAD))[0]
  const helper = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="respawn-alert-lead"]')?.closest('.MuiTextField-root')
    return {
      helper: root?.querySelector('.MuiFormHelperText-root')?.textContent ?? null,
      error: root?.querySelector('.Mui-error') !== null,
      note: document.querySelector('[data-testid="respawn-alert-silent"]')?.textContent ?? null
    }
  })
  if (finish === 'enter') await page.press(LEAD, 'Enter')
  if (finish === 'blur') {
    // click the page heading: a real pointer press elsewhere, which is how a player leaves the box
    await page.click('[data-testid="timers-view"] h6')
  }
  await sleep(500)
  say(
    'lead',
    `typed "${typed}" finish=${finish}: field showed "${during}" validity=${String(duringM?.validity)} helper=${JSON.stringify(helper)} -> field now "${await leadValue(page)}" stored=${JSON.stringify(await storedAlert(page))} view=${JSON.stringify(await view(page))}`
  )
}

async function gotoTimers(page: Page): Promise<void> {
  await page.click('[data-testid="nav-timers"]', { timeout: 30_000 })
  await settle(() => countOf(page, '[data-testid="timers-view"]'), (n) => n === 1, { timeoutMs: 30_000 })
  await sleep(700)
}
async function gotoAlerts(page: Page): Promise<void> {
  await page.click('[data-testid="nav-alerts"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="alerts-list"]', { timeout: 30_000 })
  await sleep(700)
}

async function stepControlFresh(page: Page): Promise<void> {
  console.log('\n=== A. the control on a fresh install ===')
  say('A', `stored=${JSON.stringify(await storedAlert(page))}`)
  await dumpControl(page, 'A fresh')
  // the tooltip
  await page.hover('label:has([data-testid="respawn-alert-on"])')
  const tip = await settle(
    () => page.evaluate(() => document.querySelector('[role="tooltip"]')?.textContent ?? ''),
    (t) => t.length > 0,
    { timeoutMs: 6_000 }
  )
  say('A', `tooltip on the box: "${tip}"`)
  await show(page, 'A tooltip', '[role="tooltip"]')
  await page.mouse.move(0, 0)
  await sleep(600)
}

async function stepSecondsField(page: Page): Promise<void> {
  console.log('\n=== B. the seconds field and its limits ===')
  const attrs = await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLInputElement | null
    return el ? { type: el.type, min: el.min, max: el.max, step: el.step, value: el.value } : null
  }, LEAD)
  say('B', `input attrs ${JSON.stringify(attrs)}`)
  await typeLead(page, '600', 'none')
  await typeLead(page, '600', 'enter')
  await typeLead(page, '3', 'enter')
  await typeLead(page, '45', 'blur')
  await typeLead(page, '', 'enter')
  await typeLead(page, '0', 'blur')
  await typeLead(page, '-10', 'enter')
  await typeLead(page, '12.6', 'enter')
  await typeLead(page, '1e2', 'enter')
  await typeLead(page, '300', 'enter')
  await typeLead(page, '301', 'blur')
  await typeLead(page, '5', 'enter')
  await typeLead(page, '4', 'blur')
  await typeLead(page, '20', 'enter')
}

async function stepTick(page: Page): Promise<void> {
  console.log('\n=== C. ticking the box (seeded alert present and on) ===')
  const defs = await listAlerts(page)
  const seeded = defs.filter((d) => d.trigger.type === 'app' && d.trigger.signal === 'respawnSoon')
  say('C', `alerts in store: ${String(defs.length)}; on the respawnSoon signal: ${JSON.stringify(seeded)}`)
  await page.click('[data-testid="respawn-alert-on"] input', { timeout: 10_000, force: true })
  await sleep(800)
  say('C', `after the click stored=${JSON.stringify(await storedAlert(page))}`)
  await dumpControl(page, 'C ticked, alert ok')
}

async function stepDialogs(page: Page): Promise<void> {
  console.log('\n=== D. the rows and the edit dialog ===')
  for (const mob of [OWN_MOB, WIKI_MOB]) {
    say('D row', await bodyText(page, rowSel(mob)))
    await show(page, 'D row', `${rowSel(mob)} [data-testid="respawn-duration"]`)
    await show(page, 'D row', `${rowSel(mob)} [data-testid="respawn-edit"]`)
    await showLeaves(page, `D row ${mob}`, rowSel(mob), true)
  }

  console.log('\n--- D1. a LEARNED ("your kills") row, untouched ---')
  say('D1', `opened=${String(await openEditor(page, OWN_MOB))}`)
  await dumpDialog(page, 'D1 learned untouched')
  say('D1', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)
  // Enter on the untouched field: does anything happen?
  await page.press(INPUT, 'Enter')
  await sleep(500)
  say('D1', `after Enter on the untouched field: dialog open=${String(await countOf(page, DIALOG))} row source=${String(await page.evaluate((s) => document.querySelector(s)?.getAttribute('data-respawn-source'), rowSel(OWN_MOB)))}`)

  const typeAndRead = async (tag: string, text: string): Promise<void> => {
    await page.fill(INPUT, text)
    await sleep(300)
    const reading = await page.evaluate(() => ({
      reading: document.querySelector('[data-testid="respawn-edit-reading"]')?.textContent ?? null,
      error: document.querySelector('[data-testid="respawn-edit-error"]')?.textContent ?? null,
      note: document.querySelector('[data-testid="respawn-edit-save-note"]')?.textContent ?? null
    }))
    say(tag, `typed "${text}": Save=${await saveDisabled(page)} ${JSON.stringify(reading)}`)
  }
  const prefill = await page.inputValue(INPUT)
  await typeAndRead('D1', `${prefill} `) // the prefill plus a space
  await typeAndRead('D1', prefill) // the very same text retyped
  await typeAndRead('D1', '180') // the same number, another spelling
  await typeAndRead('D1', '3m 00s')
  await typeAndRead('D1', '')
  await typeAndRead('D1', 'banana')
  await typeAndRead('D1', '0')
  await typeAndRead('D1', '8d')
  await typeAndRead('D1', '7d')
  await typeAndRead('D1', '44m 30s')
  await dumpDialog(page, 'D1 learned, typed 44m 30s', true)
  say('D1', `closed via Close=${String(await closeEditor(page, 'cancel'))}; row after: ${await bodyText(page, rowSel(OWN_MOB))}`)

  console.log('\n--- D2. the LEARNED row, the shared-name switch ticked (the field follows the number in force) ---')
  await openEditor(page, OWN_MOB)
  await page.click(`${DIALOG} [data-testid="respawn-edit-shared-name"] input`, { force: true })
  await sleep(1500)
  await dumpDialog(page, 'D2 learned + shared name', true)
  say('D2', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)
  say('D2', `row behind: ${await bodyText(page, rowSel(OWN_MOB))}`)
  await page.click(`${DIALOG} [data-testid="respawn-edit-shared-name"] input`, { force: true })
  await sleep(1500)
  say('D2', `unticked again: prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)} title: ${await bodyText(page, `${DIALOG} .MuiDialogTitle-root`)}`)
  await closeEditor(page, 'cancel')

  console.log('\n--- D3. a WIKI row, untouched ---')
  say('D3', `opened=${String(await openEditor(page, WIKI_MOB))}`)
  await dumpDialog(page, 'D3 wiki untouched')
  say('D3', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)
  await page.fill(INPUT, '12m')
  await sleep(300)
  say('D3', `typed 12m: Save=${await saveDisabled(page)}`)
  say('D3', `saved, closed=${String(await closeEditor(page, 'save'))}`)
  await settle(() => page.evaluate((s) => document.querySelector(s)?.getAttribute('data-respawn-source') ?? '', rowSel(WIKI_MOB)), (v) => v === 'custom', { timeoutMs: 20_000 })
  say('D3', `row after save: ${await bodyText(page, rowSel(WIKI_MOB))}`)

  console.log('\n--- D4. a TYPED ("your number") row ---')
  say('D4', `opened=${String(await openEditor(page, WIKI_MOB))}`)
  await dumpDialog(page, 'D4 typed untouched')
  say('D4', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)
  await typeAndRead('D4', '12m')
  await typeAndRead('D4', '720')
  await typeAndRead('D4', '')
  say('D4', `Use calculated, closed=${String(await closeEditor(page, 'clear'))}`)
  await settle(() => page.evaluate((s) => document.querySelector(s)?.getAttribute('data-respawn-source') ?? '', rowSel(WIKI_MOB)), (v) => v === 'wiki', { timeoutMs: 20_000 })
  say('D4', `row after Use calculated: ${await bodyText(page, rowSel(WIKI_MOB))}`)
}

async function stepAlertsTab(page: Page): Promise<void> {
  console.log('\n=== E. the Alerts tab: the seeded row and its Test ===')
  await gotoAlerts(page)
  const ROW = '[data-alert-id="respawn-soon"]'
  say('E', `rows on the tab: ${String(await countOf(page, '[data-testid="alert-row"]'))}; seeded row count=${String(await countOf(page, ROW))}`)
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), ROW)
  await sleep(1500)
  say('E', `row text: ${await bodyText(page, ROW)}`)
  say('E', dashes(await bodyText(page, ROW)))
  await show(page, 'E', ROW)
  await show(page, 'E', `${ROW} [data-testid="alert-test"]`)
  await show(page, 'E', `${ROW} input[type="checkbox"]`)
  await showLeaves(page, 'E seeded row', ROW)
  const before = (await spoken(page)).length
  await page.click(`${ROW} [data-testid="alert-test"]`, { timeout: 10_000 })
  const after = await settle(() => spoken(page), (all) => all.length > before, { timeoutMs: 10_000 })
  say('E', `Test pressed: speech ring ${String(before)} -> ${String(after.length)}; new: ${JSON.stringify(after.slice(before))}`)
  // what the edit dialog of the seeded alert says
  await page.click(`${ROW} [data-testid="alert-edit"]`, { timeout: 10_000 })
  await page.waitForSelector('[data-testid="alert-dialog"]', { timeout: 15_000 })
  await sleep(800)
  const dlg = await bodyText(page, '[data-testid="alert-dialog"] .MuiDialog-paper')
  say('E', `seeded alert's editor: ${dlg}`)
  say('E', dashes(dlg))
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="alert-dialog"] input, [data-testid="alert-dialog"] textarea')).map(
      (i) => `${(i as HTMLInputElement).type}:${(i as HTMLInputElement).value}`
    )
  )
  say('E', `editor inputs: ${JSON.stringify(inputs)}`)
  await page.keyboard.press('Escape')
  await settleGone(page, '[data-testid="alert-dialog"]', { timeoutMs: 10_000 })

  console.log('\n=== F. the alert switched OFF: the note on the Timers tab ===')
  await page.click(`${ROW} input[type="checkbox"]`, { timeout: 10_000, force: true })
  await sleep(800)
  say('F', `store: ${JSON.stringify((await listAlerts(page)).filter((d) => d.id === 'respawn-soon').map((d) => ({ id: d.id, enabled: d.enabled })))}`)
  await gotoTimers(page)
  await dumpControl(page, 'F ticked, alert off')

  console.log('\n=== G. the alert DELETED: the note, and whether its instruction can be followed ===')
  await page.evaluate(() => (window as unknown as { eq: { deleteAlert: (id: string) => Promise<unknown> } }).eq.deleteAlert('respawn-soon'))
  // the Timers tab reads the alert list fresh when the control mounts: leave and come back
  await gotoAlerts(page)
  say('G', `seeded row on the Alerts tab after delete: ${String(await countOf(page, ROW))}`)
  await gotoTimers(page)
  await dumpControl(page, 'G ticked, alert missing')

  // follow the note: Alerts tab -> add -> create manually -> Trigger type "App signal" -> "Respawn timer ending"
  await gotoAlerts(page)
  const addButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="alerts-list"] button, [data-testid="alerts-add-suggestion"]')).map((b) => (b as HTMLElement).innerText.trim()).filter((t) => t.length > 0)
  )
  say('G', `buttons on the Alerts tab that add: ${JSON.stringify(addButtons)}`)
  await page.click('[data-testid="alerts-add-suggestion"]')
  await page.waitForSelector('[data-testid="suggest-dialog"]', { timeout: 20_000 })
  await sleep(800)
  const sug = await bodyText(page, '[data-testid="suggest-dialog"] .MuiDialogTitle-root')
  say('G', `suggestion dialog title: ${sug}`)
  // does the suggestion picker offer it by search?
  await page.fill('[data-testid="suggest-search"] input', 'respawn')
  await sleep(1500)
  say('G', `suggestion search "respawn": rows=${String(await countOf(page, '[data-testid="suggest-row"]'))} dialog says: ${(await bodyText(page, '[data-testid="suggest-dialog"] .MuiDialogContent-root')).slice(0, 300)}`)
  say('G', `"Create manually" control text: ${await bodyText(page, '[data-testid="suggest-create-manually"]')}`)
  await page.click('[data-testid="suggest-create-manually"]')
  await page.waitForSelector('[data-testid="alert-dialog"]', { timeout: 20_000 })
  await sleep(800)
  say('G', `manual editor, as opened: ${(await bodyText(page, '[data-testid="alert-dialog"] .MuiDialog-paper')).slice(0, 700)}`)
  // open the Trigger type select and read its options
  const selects = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="alert-dialog"] .MuiSelect-select')).map((s, i) => `${String(i)}:${(s as HTMLElement).innerText.trim()}`)
  )
  say('G', `selects in the editor: ${JSON.stringify(selects)}`)
  const trig = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('[data-testid="alert-dialog"] .MuiSelect-select')).find((s) => /Log event|Raw line|App signal/.test((s as HTMLElement).innerText)) ?? null
  )
  const trigEl = trig.asElement()
  if (trigEl) {
    await trigEl.click()
    await page.waitForSelector('li[data-value="app"]', { timeout: 10_000 })
    say('G', `Trigger type options: ${JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.MuiMenu-root li')).map((l) => (l as HTMLElement).innerText.trim())))}`)
    await page.click('li[data-value="app"]')
    await settleGone(page, '.MuiMenu-root', { timeoutMs: 8_000 })
    await sleep(500)
    const sig = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('[data-testid="alert-dialog"] .MuiSelect-select')).find((s) => /Raid target|Quest completed|Bazaar|Respawn/.test((s as HTMLElement).innerText)) ?? null
    )
    const sigEl = sig.asElement()
    if (sigEl) {
      say('G', `Signal select shows first: "${await sigEl.innerText()}"`)
      await sigEl.click()
      await page.waitForSelector('li[data-value="respawnSoon"]', { timeout: 10_000 })
      say('G', `Signal options: ${JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.MuiMenu-root li')).map((l) => (l as HTMLElement).innerText.trim())))}`)
      await page.click('li[data-value="respawnSoon"]')
      await settleGone(page, '.MuiMenu-root', { timeoutMs: 8_000 })
      await page.fill('[data-testid="alert-name"] input', 'My respawn alert')
      await sleep(500)
      const dlg2 = await bodyText(page, '[data-testid="alert-dialog"] .MuiDialog-paper')
      say('G', `editor on App signal / Respawn timer ending: ${dlg2.slice(0, 900)}`)
      const saveState = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="alert-save"]') as HTMLButtonElement | null
        return b ? `${b.innerText} disabled=${String(b.disabled)}` : 'absent'
      })
      const packs = await page.evaluate(() => (window as unknown as { eq: { listSoundPacks: () => Promise<unknown[]> } }).eq.listSoundPacks().then((l) => l.length))
      say('G', `Add button: ${saveState}; installed sound packs in this offline run: ${String(packs)}`)
      if (!saveState.includes('disabled=true')) {
        await page.click('[data-testid="alert-save"]')
        await settleGone(page, '[data-testid="alert-dialog"]', { timeoutMs: 15_000 })
        const mine = (await listAlerts(page)).filter((d) => d.trigger.type === 'app' && d.trigger.signal === 'respawnSoon')
        say('G', `the player's own alert, as stored: ${JSON.stringify(mine)}`)
        await gotoTimers(page)
        await dumpControl(page, 'G2 ticked, own alert added')
        // …and the player's own alert switched off: what does the note call it?
        if (mine.length > 0) {
          await page.evaluate((d) => (window as unknown as { eq: { saveAlert: (x: unknown) => Promise<unknown> } }).eq.saveAlert({ ...d, enabled: false }), mine[0])
          await gotoAlerts(page)
          await gotoTimers(page)
          await show(page, 'G3 own alert "My respawn alert" switched off', '[data-testid="respawn-alert-silent"]')
        }
      } else {
        await page.keyboard.press('Escape')
      }
    } else say('G', 'no Signal select found')
  } else say('G', 'no Trigger type select found')
  if ((await countOf(page, '[data-testid="alert-dialog"]')) > 0) {
    await page.keyboard.press('Escape')
    await settleGone(page, '[data-testid="alert-dialog"]', { timeoutMs: 10_000 })
  }

  console.log('\n=== H. the box UNTICKED with no alert: the note leaves ===')
  await gotoTimers(page)
  await page.click('[data-testid="respawn-alert-on"] input', { timeout: 10_000, force: true })
  await sleep(800)
  say('H', `stored=${JSON.stringify(await storedAlert(page))} note count=${String(await countOf(page, '[data-testid="respawn-alert-silent"]'))}`)
}

async function main(): Promise<void> {
  buildIfStale()
  const launched = await launchOnFixture('e2e-leveling.log')
  const killer = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void launched.close().finally(() => process.exit(2))
  }, 7 * 60_000)
  try {
    const page = await mainWindow(launched.app)
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await install(page)
    await answerNotice(page)
    say('window', `bounds=${JSON.stringify(await windowBounds(launched.app, page))} view=${JSON.stringify(await view(page))}`)
    await gotoTimers(page)
    await stepControlFresh(page)
    await stepSecondsField(page)
    await stepTick(page)
    await stageClocks(page, launched.log)
    await sleep(1000)
    await dumpControl(page, 'C2 ticked, two clocks running')
    await stepDialogs(page)
    await stepAlertsTab(page)
    say('errors', `renderer console errors: ${String(errors.length)} ${errors.slice(0, 5).join(' | ')}`)
  } catch (err) {
    console.log(`PROBE ERROR: ${String(err)}`)
    process.exitCode = 1
  } finally {
    clearTimeout(killer)
    await launched.close()
    console.log('app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error -', err)
  process.exitCode = 1
})
