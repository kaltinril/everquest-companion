/** Skeptic probe: Quests tab column at the minimum window, 100% and 125%. Throwaway. */
import { S, m, openQuest, resizeTo, say, settle, sleep, withApp } from './zz-probe-sky-cleanup-0.mjs'

const COL = `(() => {
  const counts = document.querySelector('${S.counts}')
  const list = document.querySelector('${S.questRow}')
  let col = counts.parentElement
  while (col && !col.contains(list)) col = col.parentElement
  const kids = [...col.children].map(c => { const b = c.getBoundingClientRect(); return { what: (c.getAttribute('data-testid') || (c.innerText || '').replace(/\s+/g, ' ').slice(0, 50)), top: Math.round(b.top), h: Math.round(b.height), sh: c.scrollHeight, ch: c.clientHeight, ov: getComputedStyle(c).overflowY } })
  const anc = []
  for (let p = col; p; p = p.parentElement) { const cs = getComputedStyle(p); const b = p.getBoundingClientRect(); anc.push({ tag: p.tagName, ov: cs.overflowY, top: Math.round(b.top), h: Math.round(b.height), sh: p.scrollHeight, ch: p.clientHeight }) }
  return { vp: { w: innerWidth, h: innerHeight }, kids, anc }
})()`

async function wheelTry(page: import('playwright-core').Page, tag: string): Promise<void> {
  // Wheel over the filter bar's middle: does anything scroll to bring the list in?
  const pt = await m<{ x: number; y: number }>(page, `(() => { const b = document.querySelector('${S.counts}').getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 } })()`)
  await page.mouse.move(pt.x, pt.y)
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 300)
  await sleep(1600)
  say(tag, 'after wheel over counts row:', await m(page, COL))
  const plus = await m(page, `(() => { const e = document.querySelector('${S.record}'); if (!e) return null; const b = e.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2); return { top: Math.round(b.top), bottom: Math.round(b.bottom), hitSelf: h === e || e.contains(h), hit: h ? (h.getAttribute('data-testid') || h.tagName) : null, vh: innerHeight } })()`)
  say(tag, '"+" placement:', plus)
}

await withApp('verify-1', 180_000, {}, async ({ page, app }) => {
  if (!(await openQuest(page))) return
  say('== default', await m(page, COL))
  await resizeTo(app, page, 900, 600)
  await sleep(1500)
  say('== 900x600 100%', await m(page, COL))
  await wheelTry(page, '900x600 100%')
  const before = await m<{ dpr: number }>(page, '({ dpr: devicePixelRatio })')
  await page.evaluate('window.eq.setUiScale(1.25)')
  await settle(() => m<{ dpr: number }>(page, '({ dpr: devicePixelRatio })'), (z) => Math.abs(z.dpr / before.dpr - 1.25) < 0.02, { timeoutMs: 15_000 })
  await sleep(1800)
  say('== 900x600 125%', await m(page, COL))
  await wheelTry(page, '900x600 125%')
  say('window outer', await m(page, '({ ow: outerWidth, oh: outerHeight })'))
})
