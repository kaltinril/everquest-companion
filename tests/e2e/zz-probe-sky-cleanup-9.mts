/**
 * zz-probe-sky-cleanup-9.mts: (default window at 125%, and where the height goes at the minimum) CAN THE TURN-IN CONTROLS AND THE QUEST ROW'S PENCIL BE REACHED at the
 * app's minimum window (900x600) and at 125% text? The scroll chain above them, where they land,
 * and whether a real click on each one works. Throwaway, never committed.
 */
import type { Page } from 'playwright-core'
import { ITEM, S, m, openQuest, resizeTo, say, settle, sleep, turnInState, withApp } from './zz-probe-sky-cleanup-0.mjs'

const CHAIN = (sel: string): string => `(() => {
  const el = document.querySelector('${sel}'); if (!el) return null
  const out = []
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible' && p.scrollHeight <= p.clientHeight + 1) continue
    const b = p.getBoundingClientRect()
    out.push({ el: p.tagName + '[' + (p.getAttribute('data-testid') || String(p.className).split(' ').slice(0, 2).join('.')) + ']', overflow: cs.overflowX + '/' + cs.overflowY, top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), sh: p.scrollHeight, ch: p.clientHeight, st: Math.round(p.scrollTop), sw: p.scrollWidth, cw: p.clientWidth, sl: Math.round(p.scrollLeft) })
  }
  return out
})()`

const WHERE = `(() => {
  const M = window.__m
  const pencil = [...document.querySelectorAll('tr')].find(t => (t.cells[1]?.textContent ?? '').trim().startsWith('${ITEM}'))?.querySelector('[data-testid="posky-item-count-edit"]')
  const pick = (o) => o && ({ rect: o.rect, hit: o.hit, inViewport: o.inViewport })
  return { vp: M.vp(), count: pick(M.first('${S.turnCount}')), minus: pick(M.first('${S.undo}')), plus: pick(M.first('${S.record}')), pencil: pencil ? pick(M.one(pencil)) : null, badge: pick(M.first('${S.badge}')), search: pick(M.first('${S.search}')), counts: pick(M.first('${S.counts}')), tabs: pick(M.first('${S.tabQuests}')) }
})()`

async function reach(page: Page, tag: string): Promise<void> {
  say(`\n== ${tag}`)
  say('scroll chain above the "+":', await m(page, CHAIN(S.record)))
  say('as it stands:', await m(page, WHERE))
  // What a wheel does: scroll every scrollable ancestor as far as it helps (scrollIntoView does that).
  await page.evaluate(`document.querySelector('${S.record}').scrollIntoView({ block: 'center', inline: 'nearest' })`)
  await sleep(1600)
  say('after scrolling the "+" to the middle:', await m(page, WHERE))
  say('scroll chain now:', await m(page, CHAIN(S.record)))
  const before = (await turnInState(page)).count
  const plus = await page.click(S.record, { timeout: 6000 }).then(() => 'clicked', (e: unknown) => `FAILED: ${String(e).split('\n').filter((l) => /intercepts|outside|Timeout/.test(l)).slice(0, 3).join(' | ')}`)
  await sleep(1200)
  say('a real click on "+":', plus, '| count', before, '->', (await turnInState(page)).count)
  const minus = await page.click(S.undo, { timeout: 6000 }).then(() => 'clicked', (e: unknown) => `FAILED: ${String(e).split('\n').filter((l) => /intercepts|outside|Timeout/.test(l)).slice(0, 3).join(' | ')}`)
  await sleep(1200)
  say('a real click on "-":', minus, '| count now', (await turnInState(page)).count)
  const pencilSel = `tr:has-text("${ITEM}") [data-testid="posky-item-count-edit"]`
  await page.evaluate(`[...document.querySelectorAll('tr')].find(t => (t.cells[1]?.textContent ?? '').trim().startsWith('${ITEM}')).scrollIntoView({ block: 'center', inline: 'nearest' })`)
  await sleep(1600)
  say('after scrolling the item row to the middle:', await m(page, WHERE))
  const pen = await page.click(pencilSel, { timeout: 6000 }).then(() => 'clicked', (e: unknown) => `FAILED: ${String(e).split('\n').filter((l) => /intercepts|outside|Timeout/.test(l)).slice(0, 3).join(' | ')}`)
  await sleep(500)
  say('a real click on the quest row pencil:', pen, '| editor open:', await m(page, `document.querySelectorAll('[data-testid="posky-item-count-input"]').length`))
  await page.keyboard.press('Escape')
  say('how far the item table reaches below the window:', await m(page, `(() => { const t = [...document.querySelectorAll('${S.questRow} table')][0]; if (!t) return null; const b = t.getBoundingClientRect(); return { tableTop: Math.round(b.top), tableBottom: Math.round(b.bottom), windowHeight: innerHeight } })()`))
}

const HEIGHTS = `(() => {
  const M = window.__m
  const list = document.querySelector('${S.questRow}').closest('.MuiBox-root')
  const counts = document.querySelector('${S.counts}')
  let col = list.parentElement
  while (col && !col.contains(counts)) col = col.parentElement
  const kids = [...col.children].map(c => { const b = c.getBoundingClientRect(); return { what: c.getAttribute('data-testid') || (c.innerText || '').replace(/\\s+/g, ' ').slice(0, 70), top: Math.round(b.top), height: Math.round(b.height), isList: c === list || c.contains(list) } })
  return { window: { w: innerWidth, h: innerHeight }, column: M.r(col), kids }
})()`

await withApp('probe-9', 200_000, {}, async ({ page, app }) => {
  if (!(await openQuest(page))) return
  const size = await m<{ w: number; h: number }>(page, '({ w: window.outerWidth, h: window.outerHeight })')
  const got = await resizeTo(app, page, 900, 600)
  await sleep(1200)
  say('== minimum 900x600 (viewport ' + String(got) + 'px), 100%: where the height goes on the Quests tab')
  say(await m(page, HEIGHTS))
  await resizeTo(app, page, size.w, size.h)
  const before = await m<{ dpr: number }>(page, '({ dpr: devicePixelRatio })')
  await page.evaluate('window.eq.setUiScale(1.25)')
  await settle(() => m<{ dpr: number }>(page, '({ dpr: devicePixelRatio })'), (z) => Math.abs(z.dpr / before.dpr - 1.25) < 0.02, { timeoutMs: 15_000 })
  await sleep(1500)
  await reach(page, 'default window 1280x860, 125%')
})
