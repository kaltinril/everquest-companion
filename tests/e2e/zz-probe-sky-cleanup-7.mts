/**
 * zz-probe-sky-cleanup-7.mts: (b) THE HAND-COUNT HOVER'S PROMISES under each count source ("anything
 * looted since then is counted on top, and any turn-in recorded since then is taken off"), then
 * (a) THE TURN-IN TOOLBAR AND THE QUEST ROW'S PENCIL at the default window, the minimum, and 125%.
 * Throwaway, never committed.
 */
import type { Page } from 'playwright-core'
import {
  ITEM,
  S,
  TURN_IN,
  cleanRows,
  haveText,
  m,
  openCleanup,
  openQuest,
  pickSource,
  reopenQuestPanel,
  resizeTo,
  say,
  settle,
  sleep,
  turnInState,
  withApp
} from './zz-probe-sky-cleanup-0.mjs'

const SOURCES = ['both', 'log', 'inventory', 'rebaseline', 'handins']
const skin = async (page: Page): Promise<string> => {
  const r = await cleanRows(page)
  const row = r.find((x) => x.item === ITEM)
  return row ? `x${String(row.count)}` : 'no row'
}

const TOOLBAR = `(() => {
  const M = window.__m
  const count = document.querySelector('${S.turnCount}')
  const bar = count.parentElement.parentElement
  const kids = [...bar.children].filter(c => c.getBoundingClientRect().width > 0).map(c => { const o = M.one(c); return { text: o.text.slice(0, 60), rect: o.rect, hit: o.hit, inViewport: o.inViewport, sw: o.sw, cw: o.cw } })
  const parts = ['${S.turnCount}', '${S.undo}', '${S.record}'].map(s => { const o = M.first(s); return { s: s.slice(14, -2), text: o.text, rect: o.rect, hit: o.hit, inViewport: o.inViewport, sw: o.sw, cw: o.cw, disabled: o.disabled, hover: o.title || o.spanTitle } })
  const bb = bar.getBoundingClientRect()
  const pairs = []
  const cs = [...bar.children]
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i].getBoundingClientRect(), b = cs[j].getBoundingClientRect(); if (a.width < 1 || b.width < 1) continue; const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ix > 1 && iy > 1) pairs.push([cs[i].innerText.slice(0, 20), cs[j].innerText.slice(0, 20), Math.round(ix), Math.round(iy)]) }
  const badge = M.first('${S.badge}')
  const sum = document.querySelector('${S.summary}')
  const sumChips = [...sum.querySelectorAll('.MuiChip-root')].map(c => { const o = M.one(c); const l = c.querySelector('.MuiChip-label'); return { text: o.text, rect: o.rect, hit: o.hit, labelCut: l ? l.scrollWidth - l.clientWidth : 0 } })
  const row = document.querySelector('${S.questRow}'); const rb = row.getBoundingClientRect()
  return { vp: M.vp(), bar: { rect: M.r(bar), sw: bar.scrollWidth, cw: bar.clientWidth, lines: new Set(kids.map(k => Math.round(k.rect.y / 12))).size }, kids, parts, overlapsInBar: pairs, badge: badge && { text: badge.text, rect: badge.rect, hit: badge.hit }, sumChips, summaryOverlaps: M.overlaps('${S.summary} .MuiChip-root'), questRow: { left: Math.round(rb.left), right: Math.round(rb.right), sw: row.scrollWidth, cw: row.clientWidth }, appContent: (() => { const t = document.querySelector('[data-testid="app-content"]'); return { sw: t.scrollWidth, cw: t.clientWidth } })() }
})()`

const QUEST_EDITOR = `(() => {
  const M = window.__m
  const tr = [...document.querySelectorAll('tr')].find(t => (t.cells[1]?.textContent ?? '').trim().startsWith('${ITEM}'))
  if (!tr) return null
  const td = tr.cells[2]
  const parts = ['[data-testid="posky-item-count-input"]', '[data-testid="posky-item-count-input"] label', '[data-testid="posky-item-count-save"]', '[data-testid="posky-item-count-cancel"]', '[data-testid="posky-item-count-edit"]', '[data-testid="posky-item-override"]'].map(s => { const e = td.querySelector(s); if (!e) return null; const o = M.one(e); return { s: s.slice(14), text: o.text, rect: o.rect, hit: o.hit, inViewport: o.inViewport } }).filter(Boolean)
  const table = tr.closest('table'); const wrap = table.parentElement
  const i = td.querySelector('input')
  return { cell: M.r(td), cellSW: td.scrollWidth, cellCW: td.clientWidth, cells: [...tr.cells].map(c => ({ t: c.innerText.replace(/\\s+/g, ' ').slice(0, 40), w: Math.round(c.getBoundingClientRect().width), sw: c.scrollWidth, cw: c.clientWidth })), parts, table: { w: Math.round(table.getBoundingClientRect().width), wrapSW: wrap.scrollWidth, wrapCW: wrap.clientWidth, wrapOverflow: getComputedStyle(wrap).overflowX }, input: i && { value: i.value, focused: document.activeElement === i } }
})()`

async function shapes(page: Page, tag: string): Promise<void> {
  await page.evaluate(`document.querySelector('${S.turnCount}').scrollIntoView({ block: 'center' })`)
  await sleep(1500)
  say(`TOOLBAR [${tag}]`, await m(page, TOOLBAR))
  say(`QUEST ROW HAVE CELL [${tag}]`, await m(page, QUEST_EDITOR))
  const edit = `tr:has-text("${ITEM}") [data-testid="posky-item-count-edit"]`
  await page.click(edit, { timeout: 10_000 })
  await page.waitForSelector(`tr:has-text("${ITEM}") [data-testid="posky-item-count-input"] input`, { timeout: 8000 })
  await sleep(400)
  say(`QUEST ROW EDITOR OPEN [${tag}]`, await m(page, QUEST_EDITOR))
  await page.keyboard.press('Escape')
  await sleep(300)
}

await withApp('probe-7', 295_000, {}, async ({ page, launched, app }) => {
  if (!(await openQuest(page))) return
  const log = launched.log
  log.append(...TURN_IN)
  await settle(() => haveText(page, ITEM), (v) => v === '0/1', { timeoutMs: 20_000 })
  await sleep(1100)
  log.append(`--You have looted 3 ${ITEM} from a spiroc guardian's corpse.--`)
  await openCleanup(page)
  await settle(() => cleanRows(page), (r) => r.length === 1, { timeoutMs: 30_000 })
  await sleep(1000)

  for (const src of SOURCES) {
    say(`\n== hand count under source ${src}`)
    await pickSource(page, src)
    await sleep(800)
    say('before any hand count the row reads:', await skin(page))
    if ((await skin(page)) === 'no row') {
      say('   (no row to put a pencil on under this source; setting the count from the quest row instead)')
      await reopenQuestPanel(page)
      await page.click(`tr:has-text("${ITEM}") [data-testid="posky-item-count-edit"]`)
      await page.fill(`tr:has-text("${ITEM}") [data-testid="posky-item-count-input"] input`, '5')
      await page.keyboard.press('Enter')
      await sleep(900)
      await openCleanup(page)
    } else {
      await page.click(S.rowEdit)
      await page.fill(S.rowInput, '5')
      await page.press(S.rowInput, 'Enter')
    }
    await settle(() => skin(page), (v) => v === 'x5', { timeoutMs: 10_000 })
    const set = await skin(page)
    say('set 5 by hand ->', set, '| chip hover:', await m(page, `window.__m.first('${S.row} ${S.override}')?.title`))
    await sleep(1100)
    log.append(`--You have looted a ${ITEM} from a spiroc guardian's corpse.--`)
    await settle(() => skin(page), (v) => v === 'x6', { timeoutMs: 8000 })
    const looted = await skin(page)
    say('one more looted ->', looted, looted === 'x6' ? '(counted on top: hover true)' : '(NOT counted on top)')
    await reopenQuestPanel(page)
    await sleep(600)
    const plusHover = (await turnInState(page)).plus
    await page.click(S.record)
    await sleep(1500)
    await openCleanup(page)
    await sleep(900)
    const after = await skin(page)
    say('a hand "+" on the quest ->', after, '| "+" hover was:', plusHover)
    await reopenQuestPanel(page)
    await page.click(S.undo)
    await sleep(1200)
    await openCleanup(page)
    await sleep(700)
    say('"-" again ->', await skin(page))
    await page.click(`${S.row} ${S.override} .MuiChip-deleteIcon`)
    await sleep(1200)
    say('hand count removed ->', await skin(page), '| chips left:', await m(page, `document.querySelectorAll('${S.active}').length`))
  }

  say('\n== (a) the turn-in toolbar and the quest row pencil, by window size')
  await pickSource(page, 'both')
  await reopenQuestPanel(page)
  await page.click(S.record)
  await sleep(1200)
  await page.click(`tr:has-text("${ITEM}") [data-testid="posky-item-count-edit"]`)
  await page.fill(`tr:has-text("${ITEM}") [data-testid="posky-item-count-input"] input`, '99999')
  await page.keyboard.press('Enter')
  await sleep(1200)
  say('state:', await turnInState(page))
  const size = await m<{ w: number; h: number }>(page, '({ w: window.outerWidth, h: window.outerHeight })')
  await shapes(page, 'default window, 100%')
  const got = await resizeTo(app, page, 900, 600)
  say(`narrowed: viewport ${String(got)}px`)
  await shapes(page, 'minimum 900x600, 100%')
  const before = await m<{ dpr: number }>(page, '({ dpr: devicePixelRatio })')
  await page.evaluate('window.eq.setUiScale(1.25)')
  await settle(() => m<{ dpr: number }>(page, '({ dpr: devicePixelRatio })'), (z) => Math.abs(z.dpr / before.dpr - 1.25) < 0.02, { timeoutMs: 15_000 })
  await sleep(1500)
  await shapes(page, 'minimum 900x600, 125%')
  await resizeTo(app, page, size.w, size.h)
  await shapes(page, 'default window, 125%')
})
