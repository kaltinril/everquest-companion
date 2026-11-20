/**
 * zz-probe-sky-cleanup-1.mts: THE TURN-IN CONTROLS under the default count source (`both`, a dump
 * loaded): the words beside the '-' and '+', each hover, and what the item count does.
 * Throwaway, never committed.
 */
import { ITEM, RUNE, S, TURN_IN, m, openQuest, say, settle, sleep, turnInState, withApp, haveText } from './zz-probe-sky-cleanup-0.mjs'

await withApp('probe-1', 200_000, {}, async ({ page, launched }) => {
  if (!(await openQuest(page))) return
  const log = launched.log

  say('\n== A. never turned in, source both, dump holds 1 skin')
  say(await turnInState(page))
  say('toolbar boxes:', await m(page, `[window.__m.first('${S.turnCount}'), window.__m.first('${S.undo}'), window.__m.first('${S.record}')].map(x => x && ({ t: x.text, rect: x.rect, hit: x.hit, inViewport: x.inViewport, sw: x.sw, cw: x.cw }))`))

  say('\n== B. one hand "+"')
  await page.click(S.record)
  await settle(() => m<string>(page, `window.__m.first('${S.turnCount}')?.text`), (t) => t !== 'Not turned in yet', { timeoutMs: 8000 })
  await sleep(1200)
  say(await turnInState(page))

  say('\n== C. "-" takes it back')
  await page.click(S.undo)
  await settle(() => m<string>(page, `window.__m.first('${S.turnCount}')?.text`), (t) => t === 'Not turned in yet', { timeoutMs: 8000 })
  say(await turnInState(page))

  say('\n== D. two "+" in one tick, then two "-" in one tick')
  await page.evaluate(`(() => { const b = document.querySelector('${S.record}'); b.click(); b.click() })()`)
  await sleep(1500)
  say('after ++ :', await turnInState(page))
  await page.evaluate(`(() => { const b = document.querySelector('${S.undo}'); b.click(); b.click() })()`)
  await sleep(1500)
  say('after -- :', await turnInState(page))
  await sleep(2000)
  say('2s later :', await turnInState(page))

  say('\n== E. a turn-in read from the log')
  log.append(...TURN_IN)
  await settle(() => haveText(page, ITEM), (v) => v === '0/1', { timeoutMs: 20_000 })
  await sleep(800)
  say(await turnInState(page))

  say('\n== F. a hand "+" on top of the log one')
  await page.click(S.record)
  await sleep(1500)
  say('log 1 + hand 1:', await turnInState(page))
  await page.click(S.undo)
  await sleep(1500)
  say('after one "-" (the hand one goes):', await turnInState(page))
  await page.click(S.undo)
  await sleep(1500)
  say('after a second "-" (the log one goes):', await turnInState(page))
  log.append('You say, \'probe\'')
  await sleep(3000)
  say('3s and one more log line later:', await turnInState(page))

  say('\n== G. a NEW log turn-in, a hand "+", then two "-" in one tick')
  log.append(`--You have looted a ${ITEM} from a spiroc guardian's corpse.--`, `--You have looted a ${RUNE} from an azarack's corpse.--`)
  await sleep(1500)
  say('after looting one of each:', await turnInState(page))
  await sleep(1100)
  log.append(...TURN_IN)
  await settle(() => m<string>(page, `window.__m.first('${S.turnCount}')?.text`), (t) => t !== 'Not turned in yet', { timeoutMs: 20_000 })
  await sleep(800)
  say('log turn-in #2:', await turnInState(page))
  await page.click(S.record)
  await sleep(1500)
  say('plus a hand one:', await turnInState(page))
  await page.evaluate(`(() => { const b = document.querySelector('${S.undo}'); b.click(); b.click() })()`)
  await sleep(2000)
  say('after -- in one tick:', await turnInState(page))
  log.append('You say, \'probe two\'')
  await sleep(3000)
  say('3s and one more log line later:', await turnInState(page))

  say('\n== dashes anywhere in the quest row (text or hover)')
  say(await m(page, `window.__m.dashes('${S.questRow}')`))
  say('every hover on the quest row:', await m(page, `window.__m.titles('${S.questRow}')`))
})
