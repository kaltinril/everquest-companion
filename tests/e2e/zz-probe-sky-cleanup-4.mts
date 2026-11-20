/**
 * zz-probe-sky-cleanup-4.mts: THE CLEANUP PENCIL at the default window: focus, Enter, Escape, the
 * numbers 0 / 7 / 99999 / 100000 / blank / -5 / 2.7, the hidden-chip line and the summary chip.
 * Throwaway, never committed.
 */
import {
  ITEM,
  S,
  TURN_IN,
  cleanRows,
  cleanupSnap,
  editorSnap,
  haveText,
  m,
  openCleanup,
  openQuest,
  reopenQuestPanel,
  say,
  settle,
  sleep,
  withApp
} from './zz-probe-sky-cleanup-0.mjs'

await withApp('probe-4', 280_000, {}, async ({ page, launched }) => {
  if (!(await openQuest(page))) return
  const log = launched.log
  log.append(...TURN_IN)
  await settle(() => haveText(page, ITEM), (v) => v === '0/1', { timeoutMs: 20_000 })
  await openCleanup(page)
  say('\n== 0. the quest is turned in and nothing is held: the empty tab')
  await sleep(800)
  say(await cleanupSnap(page))

  log.append(`--You have looted 3 ${ITEM} from a spiroc guardian's corpse.--`)
  await settle(() => cleanRows(page), (r) => r.length === 1 && r[0].count === 3, { timeoutMs: 30_000 })
  await sleep(1500)
  say('\n== 1. one row, x3, no hand count')
  say('rows:', await cleanRows(page))
  say(await cleanupSnap(page))
  say('every hover on the tab:', await m(page, `window.__m.titles('${S.cleanup}')`))

  const typeAndEnter = async (text: string, label: string): Promise<void> => {
    say(`\n== pencil: type "${text}" then Enter (${label})`)
    const bodyBefore = await m<string>(page, `document.querySelector('${S.cleanup}').innerText`)
    await page.click(S.rowEdit)
    await page.waitForSelector(S.rowInput, { timeout: 8000 })
    await sleep(300)
    const opened = await editorSnap(page)
    say('editor on open:', opened)
    await page.fill(S.rowInput, text)
    await sleep(200)
    say('with the text in:', await m(page, `(() => { const i = document.querySelector('${S.rowInput}'); return { value: i.value, valid: i.validity.valid, msg: i.validationMessage, sw: i.scrollWidth, cw: i.clientWidth, ariaInvalid: i.getAttribute('aria-invalid') } })()`))
    await page.press(S.rowInput, 'Enter')
    await sleep(1500)
    const bodyAfter = await m<string>(page, `(document.querySelector('${S.cleanup}') || document.body).innerText`)
    say('editor still open:', (await m<number>(page, `document.querySelectorAll('[data-testid="posky-item-count-input"]').length`)) > 0)
    say('rows after:', await cleanRows(page))
    say('tab label:', await m(page, `document.querySelector('${S.tabCleanup}').textContent`))
    say('tab text changed:', bodyBefore !== bodyAfter)
    say('tab text now:', bodyAfter.replace(/\s+/g, ' ').slice(0, 700))
    say('anything role=alert/status on the page:', await m(page, `[...document.querySelectorAll('[role="alert"], [role="status"], .MuiSnackbar-root, .MuiFormHelperText-root')].map(a => (a.innerText || '').replace(/\\s+/g, ' ').slice(0, 90))`))
    say('focus is now on:', await m(page, `(() => { const a = document.activeElement; return a ? a.tagName + '[' + (a.getAttribute('data-testid') || '') + ']' : null })()`))
  }

  // 100000 FIRST, on a row with no hand count in force.
  await typeAndEnter('100000', 'one past the cap, nothing set yet')
  await typeAndEnter('7', 'a normal number')
  say('snapshot with By hand: 7 on the row:', await cleanupSnap(page))
  say('every hover on the tab:', await m(page, `window.__m.titles('${S.cleanup}')`))
  await typeAndEnter('99999', 'the cap')
  say('snapshot with By hand: 99999 on the row:', await cleanupSnap(page))
  await typeAndEnter('100000', 'one past the cap, 99999 in force')
  await typeAndEnter('', 'blank')
  await typeAndEnter('-5', 'negative')
  await typeAndEnter('2.7', 'a fraction')
  await typeAndEnter('1e5', 'the same 100000 in e-notation')

  say('\n== Escape: open, type 55, Escape')
  await page.click(S.rowEdit)
  await page.waitForSelector(S.rowInput, { timeout: 8000 })
  await page.fill(S.rowInput, '55')
  await page.press(S.rowInput, 'Escape')
  await sleep(1000)
  say('editor open:', (await m<number>(page, `document.querySelectorAll('[data-testid="posky-item-count-input"]').length`)) > 0, 'rows:', await cleanRows(page))
  say('focus is now on:', await m(page, `(() => { const a = document.activeElement; return a ? a.tagName + '[' + (a.getAttribute('data-testid') || '') + ']' : null })()`))

  say('\n== the cancel X: open, type 66, click X; then the check: open, type 5, click the check')
  await page.click(S.rowEdit)
  await page.fill(S.rowInput, '66')
  await page.click(S.rowCancel)
  await sleep(800)
  say('after X:', await cleanRows(page))
  await page.click(S.rowEdit)
  await page.fill(S.rowInput, '5')
  await page.click(S.rowSave)
  await sleep(1200)
  say('after the check:', await cleanRows(page))

  say('\n== 0: the row leaves, the hidden-chip line and the summary chip speak')
  await page.click(S.rowEdit)
  await page.fill(S.rowInput, '0')
  await page.press(S.rowInput, 'Enter')
  await settle(() => cleanRows(page), (r) => r.length === 0, { timeoutMs: 15_000 })
  await sleep(1000)
  say(await cleanupSnap(page))
  say('every hover on the tab:', await m(page, `window.__m.titles('${S.cleanup}')`))
  say('summary chip sits ABOVE the hidden line (the hover says "under this chip"):', await m(page, `(() => { const c = document.querySelector('${S.active}'), h = document.querySelector('${S.hidden}'); return c && h && { chipBottom: c.getBoundingClientRect().bottom, lineTop: h.getBoundingClientRect().top } })()`))

  say('\n== the Quests tab while that 0 stands')
  await reopenQuestPanel(page)
  await sleep(800)
  say('counts line:', await m(page, `window.__m.first('${S.counts}')`))
  say('summary chip on Quests:', await m(page, `window.__m.first('${S.active}')`))
  say('have cell of the skin:', await haveText(page, ITEM), await m(page, `window.__m.all('${S.override}').map(x => ({ text: x.text, title: x.title, rect: x.rect, hit: x.hit }))`))

  say('\n== back on Cleanup: the x on the hidden chip brings the row back')
  await openCleanup(page)
  await sleep(600)
  await page.click(`${S.hiddenChip} .MuiChip-deleteIcon`)
  const back = await settle(() => cleanRows(page), (r) => r.length === 1, { timeoutMs: 15_000 })
  await sleep(800)
  say('rows:', back)
  say('hidden line left:', await m(page, `document.querySelectorAll('${S.hidden}').length`), 'summary chip left:', await m(page, `document.querySelectorAll('${S.active}').length`))

  say('\n== a hand count of 1, then a hand "+" on the quest: what the hidden line says')
  await page.click(S.rowEdit)
  await page.fill(S.rowInput, '1')
  await page.press(S.rowInput, 'Enter')
  await settle(() => cleanRows(page), (r) => r.length === 1 && r[0].count === 1, { timeoutMs: 15_000 })
  say('rows with the 1:', await cleanRows(page))
  await reopenQuestPanel(page)
  await sleep(1100)
  await page.click(S.record)
  await sleep(1500)
  say('quest after "+":', await haveText(page, ITEM), await m(page, `window.__m.first('${S.turnCount}')?.text`))
  await openCleanup(page)
  await sleep(1200)
  say('rows:', await cleanRows(page))
  const snap = await cleanupSnap(page)
  say({ tab: snap.tab, summaryChip: snap.summaryChip, hiddenLine: snap.hiddenLine, hiddenKids: snap.hiddenKids, empty: snap.empty })
})
