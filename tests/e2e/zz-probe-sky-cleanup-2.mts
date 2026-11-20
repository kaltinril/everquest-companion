/**
 * zz-probe-sky-cleanup-2.mts: EACH COUNT SOURCE: what the '+' hover promises, and what the item
 * count beside it does when '+' is pressed. Dump holds 1 skin; the log then loots one skin and one
 * rune (after the dump was read). Throwaway, never committed.
 */
import { ITEM, RUNE, S, m, openQuest, pickSource, say, settle, sleep, turnInState, withApp, haveText } from './zz-probe-sky-cleanup-0.mjs'

const SOURCES = ['both', 'log', 'inventory', 'rebaseline', 'handins']

await withApp('probe-2', 220_000, {}, async ({ page, launched }) => {
  if (!(await openQuest(page))) return
  launched.log.append(
    `--You have looted a ${ITEM} from a spiroc guardian's corpse.--`,
    `--You have looted a ${RUNE} from an azarack's corpse.--`
  )
  await settle(() => haveText(page, RUNE), (v) => v === '1/1', { timeoutMs: 20_000 })
  await sleep(800)
  say('staged: dump has 1 skin; log looted 1 skin + 1 rune after it')
  say('source control:', await m(page, `window.__m.first('${S.source}')`))
  say('line under the source control:', await m(page, `(() => { const s = document.querySelector('${S.source}'); const box = s && s.parentElement; return box ? [...box.children].map(c => ({ text: (c.innerText||'').replace(/\\s+/g,' ').slice(0,200), rect: window.__m.r(c) })) : null })()`))

  for (const src of SOURCES) {
    say(`\n== source ${src}`)
    await pickSource(page, src)
    await sleep(600)
    const before = await turnInState(page)
    say('before "+":', before)
    await page.click(S.record)
    await sleep(1600)
    const after = await turnInState(page)
    say('after  "+":', after)
    say(
      `VERDICT ${src}: hover="${String((before.plus as { hover: string }).hover)}" | skin ${String(before.haveSkin)} -> ${String(after.haveSkin)} | rune ${String(before.haveRune)} -> ${String(after.haveRune)}`
    )
    say('summary chips of the row:', await m(page, `[...document.querySelectorAll('${S.summary} .MuiChip-root')].map(c => (c.innerText||'').trim()).filter(Boolean)`))
    await page.click(S.undo)
    await sleep(1400)
    say('after  "-":', await turnInState(page))
  }

  say('\n== the source menu itself, open')
  await page.click(`${S.source} [role="combobox"]`)
  await page.waitForSelector('li[role="option"]', { timeout: 10_000 })
  await sleep(500)
  say(await m(page, `window.__m.all('li[role="option"]').map(o => ({ text: o.text, title: o.title, rect: o.rect, sw: o.sw, cw: o.cw, inViewport: o.inViewport, hit: o.hit }))`))
  say('viewport:', await m(page, 'window.__m.vp()'))
  await page.keyboard.press('Escape')
})
