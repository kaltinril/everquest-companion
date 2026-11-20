/** zz-probe-verify-sky-cleanup-73.mts: pencil box width for 1..5 digits. Throwaway, never committed. */
import { ITEM, S, TURN_IN, cleanRows, haveText, m, openCleanup, openQuest, say, settle, sleep, withApp } from './zz-probe-sky-cleanup-0.mjs'

await withApp('verify-73-pencilwidth', 200_000, {}, async ({ page, launched }) => {
  if (!(await openQuest(page))) return
  launched.log.append(...TURN_IN)
  await settle(() => haveText(page, ITEM), (v) => v === '0/1', { timeoutMs: 20_000 })
  await openCleanup(page)
  launched.log.append(`--You have looted 3 ${ITEM} from a spiroc guardian's corpse.--`)
  await settle(() => cleanRows(page), (r) => r.length === 1 && r[0].count === 3, { timeoutMs: 30_000 })
  await sleep(1200)
  await page.click(S.rowEdit)
  await page.waitForSelector(S.rowInput, { timeout: 8000 })
  for (const t of ['7', '999', '9999', '12345', '88888', '99999']) {
    await page.fill(S.rowInput, t)
    await sleep(250)
    say('PW', t, await m(page, `(() => { const i = document.querySelector('${S.rowInput}'); const cs = getComputedStyle(i); return { sw: i.scrollWidth, cw: i.clientWidth, sl: i.scrollLeft, font: cs.fontSize + ' ' + cs.fontFamily.slice(0,20), w: i.getBoundingClientRect().width, focused: document.activeElement === i } })()`))
  }
  await page.evaluate(`document.querySelector('${S.rowInput}').blur()`)
  await sleep(300)
  say('PW blurred 99999', await m(page, `(() => { const i = document.querySelector('${S.rowInput}'); return i && { sw: i.scrollWidth, cw: i.clientWidth, sl: i.scrollLeft } })()`))
})
