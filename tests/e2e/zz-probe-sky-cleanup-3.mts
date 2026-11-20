/**
 * zz-probe-sky-cleanup-3.mts: QUICK CLICKS on '+' and '-' at human gaps, with NO dump loaded (so the
 * default source's '+' really does subtract), and the mix of a log turn-in with hand ones.
 * Throwaway, never committed.
 */
import { ITEM, RUNE, S, TURN_IN, m, openQuest, say, settle, sleep, turnInState, withApp, haveText } from './zz-probe-sky-cleanup-0.mjs'

function burst(sel: string, times: number, gapMs: number): string {
  return `(async () => { const b = document.querySelector('${sel}'); const seen = []; for (let i = 0; i < ${String(times)}; i++) { const live = document.querySelector('${sel}'); seen.push(live ? (live.disabled ? 'disabled' : 'clicked') : 'absent'); if (live && !live.disabled) live.click(); if (i < ${String(times - 1)}) await new Promise(r => setTimeout(r, ${String(gapMs)})) } return seen })()`
}

await withApp('probe-3', 200_000, { inventory: false }, async ({ page, launched }) => {
  if (!(await openQuest(page))) return
  const log = launched.log
  const count = (): Promise<string> => m<string>(page, `window.__m.first('${S.turnCount}')?.text`)

  log.append(
    `--You have looted a ${ITEM} from a spiroc guardian's corpse.--`,
    `--You have looted a ${RUNE} from an azarack's corpse.--`
  )
  await settle(() => haveText(page, RUNE), (v) => v === '1/1', { timeoutMs: 20_000 })
  await sleep(600)
  say('== no dump, source both, log looted 1 skin + 1 rune')
  say('line under the source control:', await m(page, `(() => { const s = document.querySelector('${S.source}'); const box = s && s.parentElement; return box ? [...box.children].map(c => ({ text: (c.innerText||'').replace(/\\s+/g,' ').slice(0,200), rect: window.__m.r(c) })) : null })()`))
  say('before:', await turnInState(page))
  await page.click(S.record)
  await sleep(1500)
  say('after "+":', await turnInState(page))
  await page.click(S.undo)
  await sleep(1500)
  say('after "-":', await turnInState(page))

  for (const gap of [8, 40, 120]) {
    say(`\n== two "+" ${String(gap)}ms apart, then two "-" ${String(gap)}ms apart`)
    say('clicks:', await page.evaluate(burst(S.record, 2, gap)))
    await sleep(1500)
    say('after ++ :', await count(), '| badge', await m(page, `window.__m.first('${S.badge}')?.text`))
    say('clicks:', await page.evaluate(burst(S.undo, 2, gap)))
    await sleep(1500)
    say('after -- :', await count(), '| undo', await m(page, `(() => { const b = window.__m.first('${S.undo}'); return b && { disabled: b.disabled, hover: b.spanTitle } })()`))
  }

  say('\n== three "+" 40ms apart, then three "-" 40ms apart')
  say('clicks:', await page.evaluate(burst(S.record, 3, 40)))
  await sleep(1500)
  say('after +++ :', await count())
  say('clicks:', await page.evaluate(burst(S.undo, 3, 40)))
  await sleep(1500)
  say('after --- :', await count())

  say('\n== "+" then "-" 40ms later (the "-" must take back only that "+")')
  await page.click(S.record)
  await sleep(1200)
  say('one standing turn-in:', await count())
  say('clicks +:', await page.evaluate(burst(S.record, 1, 0)))
  await sleep(40)
  say('clicks -:', await page.evaluate(burst(S.undo, 1, 0)))
  await sleep(1500)
  say('after + then - :', await count(), '(1 standing before, so "Turned in" is right)')
  await page.click(S.undo)
  await sleep(1200)

  say('\n== a log turn-in plus two hand ones, then three "-" 40ms apart')
  log.append(...TURN_IN)
  await settle(count, (t) => t === 'Turned in', { timeoutMs: 20_000 })
  await sleep(600)
  say('log one in:', await turnInState(page))
  say('clicks:', await page.evaluate(burst(S.record, 2, 40)))
  await sleep(1500)
  say('log 1 + hand 2:', await turnInState(page))
  say('clicks:', await page.evaluate(burst(S.undo, 3, 40)))
  await sleep(1800)
  say('after --- :', await turnInState(page))
  log.append('You say, \'probe three\'')
  await sleep(3500)
  say('3.5s and a log line later (must stay taken back):', await turnInState(page))
})
