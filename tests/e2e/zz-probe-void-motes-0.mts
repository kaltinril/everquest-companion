/**
 * THROWAWAY PROBE LIBRARY (void-motes). Never committed. Shared by zz-probe-void-motes-<n>.mts.
 *
 * The page-side measurement is a STRING, not a function: tsx wraps named bindings in `__name`,
 * which the page lacks.
 */
import type { ElectronApplication, Page } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { countOf, settle, settleGone, sleep } from './appHarness.mjs'

export const OUT = 'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/void-motes'
mkdirSync(OUT, { recursive: true })

export const MEASURE = `(() => {
  const rc = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) } }
  const q = (s, root) => (root || document).querySelector(s)
  const qa = (s, root) => [...(root || document).querySelectorAll(s)]
  const info = (el) => {
    if (!el) return null
    const cs = getComputedStyle(el)
    const b = el.getBoundingClientRect()
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2
    const top = document.elementFromPoint(cx, cy)
    return {
      text: el.innerText, title: el.getAttribute('title'), rect: rc(el),
      sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      to: cs.textOverflow, ws: cs.whiteSpace, ov: cs.overflowX + '/' + cs.overflowY, fs: cs.fontSize, op: cs.opacity,
      hit: top === null ? 'null' : (top === el || el.contains(top)) ? 'self' : ('OTHER:' + (top.getAttribute('data-testid') || (top.tagName + '.' + String(top.className).slice(0, 60)))),
      disabled: el.disabled === true ? 'true' : el.getAttribute('aria-disabled'),
      pressed: el.getAttribute('aria-pressed'),
      testid: el.getAttribute('data-testid')
    }
  }
  const view = q('[data-testid="void-motes-view"]')
  const panel = q('[data-testid="gear-motes"]')
  const list = q('[data-testid="gear-motes-list"]')
  const content = q('[data-testid="app-content"]')
  const target = q('[data-testid="gear-motes-target"]')
  const headStack = panel ? panel.firstElementChild : null
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, docW: document.documentElement.clientWidth },
    docOverflow: { x: document.documentElement.scrollWidth - document.documentElement.clientWidth, y: document.documentElement.scrollHeight - document.documentElement.clientHeight },
    content: content ? { rect: rc(content), sw: content.scrollWidth, cw: content.clientWidth, sh: content.scrollHeight, ch: content.clientHeight } : null,
    notice: qa('[data-testid="telemetry-notice"]').length,
    tabs: qa('[data-testid^="tab-"]').map((t) => ({ id: t.getAttribute('data-testid'), text: t.innerText, sel: t.getAttribute('aria-selected'), rect: rc(t) })),
    view: info(view),
    viewText: view ? view.innerText : null,
    dumpLine: info(q('[data-testid="void-motes-dump-line"]')),
    panel: info(panel),
    headStack: info(headStack),
    subtitle: headStack ? info(headStack.firstElementChild) : null,
    plan: info(q('[data-testid="gear-motes-plan"]')),
    target: info(target),
    targetValue: target ? (q('.MuiSelect-select', target) || target).innerText : null,
    targetLabel: target ? (q('label', target) || {}).innerText : null,
    targetSelect: target ? info(q('.MuiSelect-select', target)) : null,
    orderGroup: info(q('[data-testid="gear-motes-order"]')),
    orders: qa('[data-testid^="gear-motes-order-"]').map(info),
    empty: info(q('[data-testid="gear-motes-empty"]')),
    unranked: info(q('[data-testid="gear-motes-unranked"]')),
    list: list ? { ...info(list), scrollTop: list.scrollTop, scrollLeft: list.scrollLeft } : null,
    table: list ? info(q('table', list)) : null,
    head: list ? qa('thead th', list).map(info) : [],
    rows: qa('[data-testid="gear-motes-row"]').map((row) => ({
      pick: row.getAttribute('data-pick'), gate: row.getAttribute('data-gate'), op: getComputedStyle(row).opacity,
      selected: row.classList.contains('Mui-selected'),
      rect: rc(row),
      cells: [...row.children].map(info),
      name: info(q('[data-testid="planner-donor-name"]', row)),
      tier: info(q('[data-testid="gear-motes-tier"]', row)),
      opens: info(q('[data-testid="gear-motes-opens"]', row))
    }))
  }
})()`

/* eslint-disable @typescript-eslint/no-explicit-any */
export type M = any

export function measure(page: Page): Promise<M> {
  return page.evaluate(MEASURE) as Promise<M>
}

export function save(name: string, data: unknown): void {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 1), 'utf8')
}

const cut = (i: any): boolean => i !== null && i.sw > i.cw + 1
const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** Print a state the way a reader needs it: words, then every measured oddity. */
export function report(tag: string, m: M): void {
  console.log(`\n===== ${tag} =====`)
  console.log(`viewport ${m.viewport.w}x${m.viewport.h} css px, dpr ${m.viewport.dpr}; doc overflow x${m.docOverflow.x} y${m.docOverflow.y}; app-content sw/cw ${m.content?.sw}/${m.content?.cw} sh/ch ${m.content?.sh}/${m.content?.ch}; notice ${m.notice}`)
  console.log(`tabs: ${m.tabs.map((t: any) => `${one(t.text)}${t.sel === 'true' ? '*' : ''}`).join(' | ')}`)
  if (m.view === null) {
    console.log('NO void-motes-view')
    return
  }
  console.log(`view rect ${JSON.stringify(m.view.rect)}`)
  console.log(`dump line: ${m.dumpLine === null ? 'ABSENT' : `"${one(m.dumpLine.text)}" rect ${JSON.stringify(m.dumpLine.rect)} sw/cw ${m.dumpLine.sw}/${m.dumpLine.cw} hit ${m.dumpLine.hit}`}`)
  console.log(`panel rect ${JSON.stringify(m.panel?.rect)} sw/cw ${m.panel?.sw}/${m.panel?.cw} sh/ch ${m.panel?.sh}/${m.panel?.ch} overflow ${m.panel?.ov}`)
  console.log(`head stack rect ${JSON.stringify(m.headStack?.rect)} sw/cw ${m.headStack?.sw}/${m.headStack?.cw}`)
  console.log(`subtitle "${one(m.subtitle?.text)}" rect ${JSON.stringify(m.subtitle?.rect)} sw/cw ${m.subtitle?.sw}/${m.subtitle?.cw}`)
  console.log(`PLAN "${one(m.plan?.text)}" title "${m.plan?.title}" rect ${JSON.stringify(m.plan?.rect)} sw/cw ${m.plan?.sw}/${m.plan?.cw} text-overflow ${m.plan?.to} ws ${m.plan?.ws} ${cut(m.plan) ? '<<< CUT OFF' : ''}`)
  console.log(`target: label "${one(m.targetLabel)}" value "${one(m.targetValue)}" title "${m.target?.title}" rect ${JSON.stringify(m.target?.rect)} select sw/cw ${m.targetSelect?.sw}/${m.targetSelect?.cw} hit ${m.target?.hit}`)
  console.log(`order group rect ${JSON.stringify(m.orderGroup?.rect)} sw/cw ${m.orderGroup?.sw}/${m.orderGroup?.cw}`)
  for (const o of m.orders) console.log(`  order "${one(o.text)}" pressed ${o.pressed} disabled ${o.disabled} title "${o.title}" rect ${JSON.stringify(o.rect)} sw/cw ${o.sw}/${o.cw} sh/ch ${o.sh}/${o.ch} ws ${o.ws} hit ${o.hit}${cut(o) ? ' <<< CUT OFF' : ''}`)
  if (m.empty !== null) console.log(`EMPTY "${one(m.empty.text)}" rect ${JSON.stringify(m.empty.rect)} sw/cw ${m.empty.sw}/${m.empty.cw} hit ${m.empty.hit}`)
  if (m.unranked !== null) console.log(`UNRANKED "${one(m.unranked.text)}" rect ${JSON.stringify(m.unranked.rect)} sw/cw ${m.unranked.sw}/${m.unranked.cw} sh/ch ${m.unranked.sh}/${m.unranked.ch} hit ${m.unranked.hit}`)
  if (m.list !== null) {
    console.log(`list rect ${JSON.stringify(m.list.rect)} sw/cw ${m.list.sw}/${m.list.cw} sh/ch ${m.list.sh}/${m.list.ch} overflow ${m.list.ov}${m.list.sw > m.list.cw + 1 ? ' <<< SCROLLS SIDEWAYS' : ''}`)
    console.log(`table rect ${JSON.stringify(m.table?.rect)}`)
    console.log(`head: ${m.head.map((h: any) => `[${one(h.text)} x${h.rect.x} w${h.rect.w} sw/cw ${h.sw}/${h.cw}${cut(h) ? ' CUT' : ''} title "${h.title}"]`).join(' ')}`)
    const viewR = m.viewport.w
    let prevBottom = -Infinity
    m.rows.forEach((row: any, i: number) => {
      const c = row.cells
      const flags: string[] = []
      if (row.rect.y < prevBottom - 0.6) flags.push(`OVERLAPS PREVIOUS ROW by ${(prevBottom - row.rect.y).toFixed(1)}`)
      prevBottom = row.rect.b
      c.forEach((cell: any, j: number) => {
        if (cut(cell)) flags.push(`cell${j} sw/cw ${cell.sw}/${cell.cw}`)
        if (cell.sh > cell.ch + 1) flags.push(`cell${j} sh/ch ${cell.sh}/${cell.ch}`)
        if (cell.rect.r > viewR + 0.5) flags.push(`cell${j} right ${cell.rect.r} past viewport ${viewR}`)
        if (m.list.rect && cell.rect.r > m.list.rect.r + 0.5) flags.push(`cell${j} right ${cell.rect.r} past list ${m.list.rect.r}`)
      })
      if (row.name !== null && cut(row.name)) flags.push(`NAME ELLIPSIS sw/cw ${row.name.sw}/${row.name.cw} title "${row.name.title}"`)
      const inView = row.rect.y >= m.list.rect.y && row.rect.b <= m.list.rect.b
      const hits = inView ? c.map((cell: any) => cell.hit).filter((h: string) => h !== 'self') : []
      if (hits.length > 0) flags.push(`hit ${hits.join(',')}`)
      console.log(`  row${i} y${row.rect.y} h${row.rect.h} pick=${row.pick} gate=${row.gate} op=${row.op}${inView ? '' : ' (outside list box)'} | #="${one(c[0].text)}" t0="${c[0].title ?? ''}" | ${one(row.name?.text)} ${one(row.tier?.text)} | ${one(c[2].text)} | gain "${one(c[3].text)}" | next "${one(c[4].text)}" (w${c[4].rect.w}) | saves "${one(c[5].text)}" t="${c[5].title ?? ''}" | src "${one(c[6].text)}" t="${c[6].title ?? ''}"${flags.length ? `  <<< ${flags.join('; ')}` : ''}`)
    })
  }
  const dash = /[\u2013\u2014]/.exec(m.viewText ?? '')
  console.log(`dashes in the view's text: ${dash === null ? 'none' : `FOUND "${dash[0]}" near "${(m.viewText as string).slice(Math.max(0, dash.index - 30), dash.index + 30)}"`}`)
}

/** Every title attribute under the view, for the dash rule on hover texts. */
export async function titles(page: Page): Promise<string[]> {
  return (await page.evaluate(`[...new Set([...document.querySelectorAll('[data-testid="void-motes-view"] [title]')].map((e) => e.getAttribute('title')))]`)) as string[]
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 15_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

export async function openTab(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-gear"]', { timeout: 60_000 })
  await answerNotice(page)
  await page.click('[data-testid="nav-gear"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="tab-voidMotes"]', { timeout: 30_000 })
  await page.click('[data-testid="tab-voidMotes"]', { timeout: 15_000 })
  await page.waitForSelector('[data-testid="void-motes-view"]', { timeout: 15_000 })
}

export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<number> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setMinimumSize(360, 360)
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  const zoom = (await page.evaluate('window.devicePixelRatio')) as number
  void zoom
  await sleep(1500)
  return (await page.evaluate('document.documentElement.clientWidth')) as number
}

export async function setScale(page: Page, scale: number): Promise<number> {
  const before = (await page.evaluate('window.devicePixelRatio')) as number
  await page.evaluate(`window.eq.setUiScale(${String(scale)})`)
  const after = await settle(() => page.evaluate('window.devicePixelRatio') as Promise<number>, (d) => scale === 1 ? true : d !== before, { timeoutMs: 10_000 })
  await sleep(1200)
  return after
}

/** A bound on the whole probe: the app is closed whatever happens. */
export function bound(ms: number, close: () => Promise<void>): NodeJS.Timeout {
  return setTimeout(() => {
    console.log(`PROBE TIMEOUT after ${String(ms)} ms: closing the app`)
    void close().finally(() => process.exit(2))
  }, ms)
}
