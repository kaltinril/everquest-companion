/**
 * zz-probe-sky-cleanup-6.mts: A LONG CAMPAIGN: every Sky quest turned in, every item looted, then
 * the first 30 rows zeroed by hand (the upstream #73 user: "I traded these away"). How much room
 * the list keeps under the hidden-chip line, at the default window and at the minimum.
 * Throwaway, never committed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './appHarness.mjs'
import { S, cleanRows, m, openCleanup, resizeTo, say, settle, sleep, withApp } from './zz-probe-sky-cleanup-0.mjs'

interface Q {
  className: string
  name: string
  items: { name: string }[]
}
const quests = (JSON.parse(readFileSync(join(ROOT, 'src/renderer/src/data/eqlegends/posky.json'), 'utf8')) as { quests: Q[] }).quests
const items = [...new Set(quests.flatMap((q) => q.items.map((i) => i.name)))]

const MEASURE = `(() => {
  const M = window.__m
  const pane = document.querySelector('${S.cleanup}')
  const sc = pane.lastElementChild
  const scB = sc.getBoundingClientRect()
  const h = document.querySelector('${S.hidden}')
  const hb = h ? h.getBoundingClientRect() : null
  const rows = [...document.querySelectorAll('${S.row}')]
  const bad = []
  for (const r of rows) for (const td of r.cells) if (td.scrollWidth > td.clientWidth + 1) bad.push({ item: r.getAttribute('data-item'), text: td.innerText.slice(0, 30), sw: td.scrollWidth, cw: td.clientWidth })
  const cut = [...pane.querySelectorAll('.MuiChip-label')].filter(l => l.scrollWidth > l.clientWidth + 1).map(l => l.textContent)
  const first = rows[0] ? rows[0].getBoundingClientRect() : null
  const paneB = pane.getBoundingClientRect()
  return {
    vp: M.vp(), rows: rows.length,
    pane: { top: Math.round(paneB.top), bottom: Math.round(paneB.bottom), sh: pane.scrollHeight, ch: pane.clientHeight },
    list: { top: Math.round(scB.top), bottom: Math.round(scB.bottom), visibleHeight: sc.clientHeight, contentHeight: sc.scrollHeight, sw: sc.scrollWidth, cw: sc.clientWidth },
    firstRowHeight: first && Math.round(first.height),
    hidden: hb && { top: Math.round(hb.top), bottom: Math.round(hb.bottom), height: Math.round(hb.height), chips: h.querySelectorAll('.MuiChip-root').length, lines: new Set([...h.children].map(c => Math.round(c.getBoundingClientRect().top))).size, belowWindow: Math.round(hb.bottom - innerHeight), lastChip: (() => { const cs = h.querySelectorAll('.MuiChip-root'); const o = M.one(cs[cs.length - 1]); return { text: o.text, rect: o.rect, hit: o.hit, inViewport: o.inViewport } })() },
    hiddenOverlaps: M.overlaps('${S.hidden} > *').length,
    rowOverlaps: M.overlaps('${S.row}').length,
    appContent: (() => { const t = document.querySelector('[data-testid="app-content"]'); return { sh: t.scrollHeight, ch: t.clientHeight, sw: t.scrollWidth, cw: t.clientWidth } })(),
    countLine: (() => { const o = M.first('[data-testid="posky-cleanup-count"]'); return o && { text: o.text, rect: o.rect, hit: o.hit, inViewport: o.inViewport } })(),
    tableHead: (() => { const o = M.first('${S.cleanup} thead'); return o && { rect: o.rect, hit: o.hit, inViewport: o.inViewport } })(),
    cellsWiderThanBox: bad.slice(0, 5), chipLabelsCut: cut.slice(0, 5)
  }
})()`

await withApp('probe-6', 290_000, {}, async ({ page, launched, app }) => {
  const keys = quests.map((q) => `${q.className}::${q.name}`)
  const t0 = Date.now() - 3_600_000
  await page.evaluate(
    async ({ ks, base }) => {
      const eq = (window as unknown as { eq: { setQuestTurnIns: (k: string, i: number[]) => Promise<unknown> } }).eq
      for (let i = 0; i < ks.length; i++) await eq.setQuestTurnIns(ks[i], [base + i])
    },
    { ks: keys, base: t0 }
  )
  launched.log.append(...items.map((item) => `--You have looted 2 ${item} from a spiroc guardian's corpse.--`))
  say(`staged: ${String(keys.length)} quests turned in by hand an hour ago, ${String(items.length)} distinct items looted x2`)
  await page.click(S.navSky, { timeout: 30_000 })
  await page.waitForSelector(S.search, { timeout: 60_000 })
  await openCleanup(page)
  const rows = await settle(() => cleanRows(page), (r) => r.length >= items.length - 5, { timeoutMs: 40_000 })
  await sleep(2000)
  say('rows on the tab:', rows.length, '| tab label:', await m(page, `document.querySelector('${S.tabCleanup}').textContent`))
  say('counts shown (first 8):', rows.slice(0, 8).map((r) => `${r.item} x${String(r.count)}`))
  say('MEASURE [default, no hand counts]', await m(page, MEASURE))

  let zeroed = 0
  for (let i = 0; i < 30; i++) {
    const before = (await cleanRows(page)).length
    await page.click(S.rowEdit, { timeout: 10_000 })
    await page.waitForSelector(S.rowInput, { timeout: 8000 })
    await page.fill(S.rowInput, '0')
    await page.press(S.rowInput, 'Enter')
    const after = await settle(() => cleanRows(page).then((r) => r.length), (n) => n < before, { timeoutMs: 8000 })
    if (after < before) zeroed++
    if (i === 7 || i === 15) say(`MEASURE [default, ${String(zeroed)} zeroed]`, await m(page, MEASURE))
  }
  await sleep(1200)
  say('zeroed by the pencil:', zeroed, '| tab label:', await m(page, `document.querySelector('${S.tabCleanup}').textContent`), '| summary chip:', await m(page, `window.__m.first('${S.active}')?.text`))
  say(`MEASURE [default 1280x860, ${String(zeroed)} zeroed]`, await m(page, MEASURE))

  const got = await resizeTo(app, page, 900, 600)
  await sleep(1500)
  say(`\n== the app minimum: viewport ${String(got)}px`)
  say(`MEASURE [minimum 900x600, ${String(zeroed)} zeroed]`, await m(page, MEASURE))
  say('can the page be scrolled to the list? app-content scrollTop after scrolling to the bottom:', await m(page, `(() => { const t = document.querySelector('[data-testid="app-content"]'); t.scrollTop = 99999; return { scrollTop: t.scrollTop, sh: t.scrollHeight, ch: t.clientHeight } })()`))
  await sleep(1500)
  say('after that scroll:', await m(page, MEASURE))
})
