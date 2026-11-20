/**
 * zz-probe-sky-cleanup-5.mts: MANY ROWS AND MANY HIDDEN CHIPS, at the default window, at the app's
 * minimum (900x600), at 125% text, and at both together. Throwaway, never committed.
 */
import type { Page } from 'playwright-core'
import {
  S,
  cleanRows,
  cleanupSnap,
  editorSnap,
  filteredCount,
  m,
  openCleanup,
  resizeTo,
  say,
  settle,
  sleep,
  withApp
} from './zz-probe-sky-cleanup-0.mjs'

const QUESTS: readonly (readonly [string, readonly string[]])[] = [
  ['Magician Test of Displacement', ['Crown of Elemental Mastery', 'Large Opal', 'Djinni Stave']],
  ['Cleric Test of Resolution', ['Silvered Spiroc Necklace']],
  ['Monk Test of Sight', ['Cracked Leather Eyepatch']],
  ['Enchanter Test of Illusion', ['Finely Woven Cloth Cord']],
  ['Shadow Knight Test of Slash', ['Finely Woven Cloth Belt']],
  ['Ranger Test of Blade', ['Circlet of Brambles', 'Efreeti Long Sword']],
  ['Shaman Test of Snake', ['Bixie Essence', 'Spiritualist`s Ring']]
]
const ALL = QUESTS.flatMap(([, items]) => items)

const rowSel = (item: string): string => `${S.row}[data-item="${item}"]`

async function setByHand(page: Page, item: string, text: string): Promise<void> {
  await page.click(`${rowSel(item)} [data-testid="posky-item-count-edit"]`, { timeout: 10_000 })
  const input = `${rowSel(item)} [data-testid="posky-item-count-input"] input`
  await page.waitForSelector(input, { timeout: 8000 })
  await page.fill(input, text)
  await page.press(input, 'Enter')
  await sleep(700)
}

/** Page-side audit of the whole tab: anything cut off, drawn over, overlapping or off screen. */
const AUDIT = `(() => {
  const M = window.__m
  const pane = document.querySelector('${S.cleanup}')
  const sc = pane.lastElementChild
  const scB = sc.getBoundingClientRect()
  const bad = []
  const rows = [...document.querySelectorAll('${S.row}')]
  for (const r of rows) {
    const name = r.getAttribute('data-item')
    for (const td of r.cells) {
      if (td.scrollWidth > td.clientWidth + 1) bad.push({ what: 'cell wider than its box', item: name, text: td.innerText.slice(0, 40), sw: td.scrollWidth, cw: td.clientWidth })
      const b = td.getBoundingClientRect()
      if (b.right > scB.right + 1) bad.push({ what: 'cell runs past the scroll pane', item: name, text: td.innerText.slice(0, 40), by: Math.round(b.right - scB.right) })
    }
    const kids = [...r.querySelectorAll('[data-testid="posky-cleanup-qty"] > div > *')]
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect()
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ix > 1 && iy > 1) bad.push({ what: 'held-cell parts overlap', item: name, ix: Math.round(ix), iy: Math.round(iy) })
    }
    const td = r.querySelector('[data-testid="posky-cleanup-qty"]'); const tb = td.getBoundingClientRect()
    for (const k of kids) { const b = k.getBoundingClientRect(); if (b.right > tb.right + 1 || b.left < tb.left - 1) bad.push({ what: 'held-cell part sticks out of the cell', item: name, text: (k.innerText || k.getAttribute('data-testid') || '').slice(0, 30), by: Math.round(Math.max(b.right - tb.right, tb.left - b.left)) }) }
  }
  for (const l of pane.querySelectorAll('.MuiChip-label')) if (l.scrollWidth > l.clientWidth + 1) bad.push({ what: 'chip label cut', text: l.textContent, sw: l.scrollWidth, cw: l.clientWidth })
  for (const c of pane.querySelectorAll('.MuiChip-root, button, [data-testid="posky-cleanup-count"], [data-testid="posky-cleanup-empty"]')) {
    const o = M.one(c)
    if (o.rect.w > 0 && o.hit !== 'self' && o.hit !== 'off-viewport') bad.push({ what: 'drawn over', text: o.text || o.testid, rect: o.rect, hit: o.hit })
    const b = c.getBoundingClientRect()
    const inScroller = sc.contains(c)
    if (!inScroller && (b.left < 0 || b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5)) bad.push({ what: 'outside the window', text: o.text || o.testid, rect: o.rect })
  }
  const paneB = pane.getBoundingClientRect()
  const fresh = document.querySelector('[data-probe="fresh"]')
  const fb = fresh ? fresh.getBoundingClientRect() : null
  return {
    vp: M.vp(), rows: rows.length,
    rowHeights: rows.map(r => Math.round(r.getBoundingClientRect().height)),
    rowOverlaps: M.overlaps('${S.row}'),
    head: [...pane.querySelectorAll('th')].map(th => th.innerText + ':' + Math.round(th.getBoundingClientRect().width)),
    scroller: { sw: sc.scrollWidth, cw: sc.clientWidth, sh: sc.scrollHeight, ch: sc.clientHeight, top: Math.round(scB.top), bottom: Math.round(scB.bottom) },
    pane: { left: Math.round(paneB.left), right: Math.round(paneB.right), bottom: Math.round(paneB.bottom), sw: pane.scrollWidth, cw: pane.clientWidth, sh: pane.scrollHeight, ch: pane.clientHeight },
    fresh: fb && { left: Math.round(fb.left), right: Math.round(fb.right), top: Math.round(fb.top), bottom: Math.round(fb.bottom), sticksLeftOfPane: Math.round(paneB.left - fb.left), text: fresh.innerText.replace(/\\s+/g, ' ') },
    freshHit: fresh ? [...fresh.querySelectorAll('button, a, [title]')].map(e => { const o = M.one(e); return { text: o.text, hit: o.hit, rect: o.rect } }) : null,
    hidden: (() => { const h = document.querySelector('${S.hidden}'); if (!h) return null; const b = h.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), chips: h.querySelectorAll('.MuiChip-root').length, lines: new Set([...h.children].map(c => Math.round(c.getBoundingClientRect().top))).size, text: h.innerText.replace(/\\s+/g, ' ').slice(0, 400) } })(),
    hiddenOverlaps: M.overlaps('${S.hidden} > *'),
    freshOverHidden: M.cross('[data-probe="fresh"]', '${S.hidden} > *'),
    freshOverChip: M.cross('[data-probe="fresh"]', '${S.active}'),
    freshOverBody: M.cross('[data-probe="fresh"]', '[data-testid="posky-cleanup-count"], [data-testid="posky-cleanup-empty"], ${S.cleanup} th'),
    summaryVsSource: M.cross('${S.active}', '${S.source}'),
    summaryChip: (() => { const o = M.first('${S.active}'); return o && { text: o.text, rect: o.rect, hit: o.hit } })(),
    source: (() => { const o = M.first('${S.source}'); return o && { rect: o.rect, hit: o.hit, sw: o.sw, cw: o.cw } })(),
    caveat: (() => { const o = M.first('[data-testid="posky-cleanup-caveat"]'); return o && { rect: o.rect, sw: o.sw, cw: o.cw } })(),
    appContent: (() => { const t = document.querySelector('[data-testid="app-content"]'); return { sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight } })(),
    bad
  }
})()`

async function audit(page: Page, tag: string): Promise<void> {
  await page.evaluate(`(() => { const s = document.querySelector('${S.source}'); const f = s && s.parentElement && s.parentElement.children[1]; if (f) f.setAttribute('data-probe', 'fresh') })()`)
  say(`AUDIT [${tag}]`, await m(page, AUDIT))
}

async function editorAt(page: Page, tag: string, item: string): Promise<void> {
  await page.evaluate(`document.querySelector('${rowSel(item)}').scrollIntoView({ block: 'center' })`)
  await sleep(1500)
  await page.click(`${rowSel(item)} [data-testid="posky-item-count-edit"]`, { timeout: 10_000 })
  await page.waitForSelector(`${rowSel(item)} [data-testid="posky-item-count-input"] input`, { timeout: 8000 })
  await sleep(400)
  const base = rowSel(item)
  say(`EDITOR OPEN [${tag}] on ${item}:`, await m(page, `(() => {
    const M = window.__m
    const i = document.querySelector('${base} [data-testid="posky-item-count-input"] input')
    const parts = ['[data-testid="posky-item-count-input"]', '[data-testid="posky-item-count-input"] label', '[data-testid="posky-item-count-save"]', '[data-testid="posky-item-count-cancel"]'].map(s => { const o = M.first('${base} ' + s); return o && { s, rect: o.rect, hit: o.hit, inViewport: o.inViewport, text: o.text } })
    const td = document.querySelector('${base} [data-testid="posky-cleanup-qty"]'); const tb = td.getBoundingClientRect()
    const sc = document.querySelector('${S.cleanup}').lastElementChild
    return { value: i.value, focused: document.activeElement === i, inputSW: i.scrollWidth, inputCW: i.clientWidth, parts, cell: M.r(td), cellSW: td.scrollWidth, cellCW: td.clientWidth, overlaps: M.overlaps('${base} [data-testid="posky-cleanup-qty"] > div > *'), scroller: { sw: sc.scrollWidth, cw: sc.clientWidth }, rowOverlaps: M.overlaps('${S.row}') }
  })()`))
  await page.press(`${rowSel(item)} [data-testid="posky-item-count-input"] input`, 'Escape')
  await sleep(300)
}

await withApp('probe-5', 290_000, {}, async ({ page, launched, app }) => {
  await page.click(S.navSky, { timeout: 30_000 })
  await page.waitForSelector(S.search, { timeout: 60_000 })
  for (const [quest] of QUESTS) {
    await page.fill(`${S.search} input`, quest)
    const only = await settle(() => filteredCount(page), (n) => n === 1, { timeoutMs: 20_000 })
    if (only !== 1) {
      say('!! could not narrow to', quest, only)
      continue
    }
    await sleep(300)
    await page.click(S.summary, { timeout: 15_000 })
    await page.waitForSelector(S.record, { timeout: 15_000 })
    await page.click(S.record)
    await settle(() => m<string>(page, `window.__m.first('${S.turnCount}')?.text`), (t) => t === 'Turned in', { timeoutMs: 8000 })
    await page.click(S.summary, { timeout: 15_000 })
    await sleep(250)
  }
  await page.fill(`${S.search} input`, '')
  launched.log.append(...ALL.map((item, i) => `--You have looted ${String(i === 0 ? 12345 : i + 1)} ${item} from a spiroc guardian's corpse.--`))
  await openCleanup(page)
  const rows = await settle(() => cleanRows(page), (r) => r.length === ALL.length, { timeoutMs: 30_000 })
  say('staged rows:', rows.map((r) => `${r.item} x${String(r.count)}`))
  say('tab label:', await m(page, `document.querySelector('${S.tabCleanup}').textContent`), '| count line:', await m(page, `window.__m.first('[data-testid="posky-cleanup-count"]')?.text`))
  await sleep(1500)

  // Two rows carry the biggest hand count, eight are zeroed, one is left alone.
  await setByHand(page, 'Crown of Elemental Mastery', '99999')
  await setByHand(page, 'Finely Woven Cloth Cord', '99999')
  for (const item of ALL.filter((i) => !['Crown of Elemental Mastery', 'Finely Woven Cloth Cord', 'Large Opal'].includes(i))) {
    await setByHand(page, item, '0')
  }
  await sleep(1200)
  say('rows now:', (await cleanRows(page)).map((r) => `${r.item} x${String(r.count)}`))
  say('tab label:', await m(page, `document.querySelector('${S.tabCleanup}').textContent`), '| count line:', await m(page, `window.__m.first('[data-testid="posky-cleanup-count"]')?.text`))
  say('summary chip:', await m(page, `(() => { const o = window.__m.first('${S.active}'); return o && { text: o.text, title: o.title } })()`))

  const size = await m<{ w: number; h: number }>(page, '({ w: window.outerWidth, h: window.outerHeight })')
  say('window outer size:', size)
  await audit(page, 'default window, 100%')
  await editorAt(page, 'default window, 100%', 'Crown of Elemental Mastery')
  say('full snapshot at default:', await cleanupSnap(page))

  const got = await resizeTo(app, page, 900, 600)
  say(`\n== narrowed to the app minimum: viewport ${String(got)}px`)
  await sleep(1500)
  await audit(page, 'minimum 900x600, 100%')
  await editorAt(page, 'minimum 900x600, 100%', 'Crown of Elemental Mastery')
  say('editor parts via editorSnap (first row in DOM order):', await page.click(S.rowEdit).then(async () => { const s = await editorSnap(page); await page.keyboard.press('Escape'); return { input: s.input, label: s.label, save: s.save, cancel: s.cancel, cell: s.cell } }))

  say('\n== 125% text, set the way the stepper sets it (eq.setUiScale)')
  const before = await m<{ dpr: number; w: number }>(page, '({ dpr: devicePixelRatio, w: innerWidth })')
  await page.evaluate('window.eq.setUiScale(1.25)')
  const after = await settle(() => m<{ dpr: number; w: number }>(page, '({ dpr: devicePixelRatio, w: innerWidth })'), (z) => Math.abs(z.dpr / before.dpr - 1.25) < 0.02, { timeoutMs: 15_000 })
  say('zoom:', before, '->', after)
  await sleep(1500)
  await audit(page, 'minimum 900x600, 125%')
  await editorAt(page, 'minimum 900x600, 125%', 'Crown of Elemental Mastery')
  await editorAt(page, 'minimum 900x600, 125%', 'Large Opal')

  const wide = await resizeTo(app, page, size.w, size.h)
  say(`\n== back to the default window at 125%: viewport ${String(wide)}px`)
  await sleep(1500)
  await audit(page, 'default window, 125%')
  await editorAt(page, 'default window, 125%', 'Crown of Elemental Mastery')
  say('full snapshot at default 125%:', await cleanupSnap(page))
})
