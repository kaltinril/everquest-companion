// zz-probe-skills-0.mts: THROWAWAY helpers for the Skills tab probes. Never committed.
import type { ElectronApplication, Page } from 'playwright-core'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINE_BIN, MAIN_ENTRY, countOf, settle, settleGone, sleep } from './appHarness.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/skills'

export function save(name: string, value: unknown): void {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name), typeof value === 'string' ? value : JSON.stringify(value, null, 1), 'utf8')
}

export function say(label: string, value: unknown): void {
  console.log(`\n## ${label}\n${typeof value === 'string' ? value : JSON.stringify(value)}`)
}

/** The build is used as it stands: this never builds, it only refuses to run with none. */
export function requireBuilt(): void {
  if (!existsSync(MAIN_ENTRY)) throw new Error(`no app build at ${MAIN_ENTRY}`)
  if (!existsSync(ENGINE_BIN)) throw new Error(`no engine at ${ENGINE_BIN}`)
  console.log(`build: app ${new Date(statSync(MAIN_ENTRY).mtimeMs).toISOString()} engine ${new Date(statSync(ENGINE_BIN).mtimeMs).toISOString()}`)
}

/** A timer that closes the app whatever the probe is doing. */
export function bound(close: () => Promise<void>, ms: number): () => void {
  const t = setTimeout(() => {
    console.log(`\n!! probe exceeded ${String(ms)} ms: closing the app`)
    void close().finally(() => process.exit(3))
  }, ms)
  return () => clearTimeout(t)
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 15_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<{ w: number; h: number }> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setMinimumSize(360, 360)
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  await sleep(1500)
  return page.evaluate('({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight })') as Promise<{ w: number; h: number }>
}

export async function setScale(page: Page, scale: number): Promise<number> {
  await page.evaluate(`window.eq.setUiScale(${String(scale)})`)
  await sleep(1500)
  return page.evaluate('window.devicePixelRatio') as Promise<number>
}

export async function openSkills(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
  await page.click('[data-testid="nav-skills"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="skills-view"]', { timeout: 30_000 })
}

export function rowCount(page: Page): Promise<number> {
  return countOf(page, '[data-testid="skill-row"]')
}

export function waitRows(page: Page, n: number, timeoutMs = 30_000): Promise<number> {
  return settle(() => rowCount(page), (c) => c >= n, { timeoutMs })
}

/** A string, so tsx's keepNames helper never reaches the page. */
const MEASURE = `(() => {
  const f = (n) => Math.round(n * 10) / 10;
  const rc = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: f(r.left), y: f(r.top), w: f(r.width), h: f(r.height), right: f(r.right), bottom: f(r.bottom) }; };
  const textRect = (el) => { if (!el || !el.firstChild) return null; const g = document.createRange(); g.selectNodeContents(el); const r = g.getBoundingClientRect(); return { x: f(r.left), y: f(r.top), w: f(r.width), h: f(r.height), right: f(r.right), bottom: f(r.bottom) }; };
  const hit = (el) => { if (!el) return 'absent'; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return 'collapsed'; const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre off viewport'; const top = document.elementFromPoint(cx, cy); if (!top) return 'nothing'; if (el === top || el.contains(top)) return 'hit'; if (top.contains(el)) return 'hit-ancestor ' + top.tagName; return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 60) + '#' + (top.getAttribute('data-testid') || ''); };
  const cut = (el) => el ? { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight } : null;
  const q = (s, root) => (root || document).querySelector(s);
  const qa = (s, root) => Array.from((root || document).querySelectorAll(s));
  const css = (el, p) => el ? getComputedStyle(el)[p] : null;
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, docOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight };

  const nav = q('[data-testid="nav-skills"]');
  const paper = q('.MuiDrawer-paper');
  if (nav) {
    const svg = q('svg', nav);
    const prim = q('.MuiListItemText-primary', nav);
    const pr = paper ? paper.getBoundingClientRect() : null;
    const nr = nav.getBoundingClientRect();
    out.nav = {
      text: nav.innerText, rect: rc(nav), selected: nav.classList.contains('Mui-selected'), hit: hit(nav),
      icon: svg ? { testid: svg.getAttribute('data-testid'), rect: rc(svg), paths: qa('path', svg).length, fill: css(svg, 'fill'), color: css(svg, 'color'), fontSize: css(svg, 'fontSize') } : null,
      label: prim ? { rect: rc(prim), text: textRect(prim), cut: cut(prim), fontSize: css(prim, 'fontSize'), overflow: css(prim, 'textOverflow'), ws: css(prim, 'whiteSpace') } : null,
      insideDrawer: pr ? (nr.top >= pr.top - 0.5 && nr.bottom <= pr.bottom + 0.5 && nr.left >= pr.left - 0.5 && nr.right <= pr.right + 0.5) : null,
      rowCut: cut(nav)
    };
    out.drawer = paper ? { rect: rc(paper), cut: cut(paper), scrollTop: paper.scrollTop, overflowY: css(paper, 'overflowY') } : null;
    out.navRows = qa('.MuiDrawer-paper [data-testid^="nav-"]').map((r) => { const b = r.getBoundingClientRect(); return (r.getAttribute('data-testid') || '') + ' y=' + f(b.top) + ' h=' + f(b.height) + ' ' + JSON.stringify(r.innerText.replace(/\\s+/g, ' ').trim()) + (r.classList.contains('Mui-selected') ? ' SELECTED' : '') + ' ' + hit(r); });
  }

  const view = q('[data-testid="skills-view"]');
  out.viewPresent = !!view;
  if (view) {
    out.viewText = view.innerText;
    out.view = { rect: rc(view), cut: cut(view) };
    const content = q('[data-testid="app-content"]');
    out.content = content ? { rect: rc(content), cut: cut(content) } : null;
    const h6 = q('h6', view);
    out.title = h6 ? { text: h6.innerText, rect: rc(h6), hit: hit(h6) } : null;
    const sw = q('[data-testid="skills-tradeskills-only"]', view);
    const swInput = sw ? q('input', sw) : null;
    const lab = q('label', view);
    out.switch = sw ? { rect: rc(sw), checked: swInput ? swInput.checked : null, disabled: swInput ? swInput.disabled : null, ariaLabel: swInput ? swInput.getAttribute('aria-label') : null, role: swInput ? swInput.getAttribute('role') : null, type: swInput ? swInput.type : null, labelText: lab ? lab.innerText : null, labelRect: rc(lab), labelCut: cut(lab), hit: hit(sw), labelHit: hit(lab) } : null;
    const cap = qa('span.MuiTypography-caption', view)[0];
    out.caption = cap ? { text: cap.innerText, rect: rc(cap), textRect: textRect(cap), cut: cut(cap), hit: hit(cap), display: css(cap, 'display') } : null;
    const empty = q('[data-testid="skills-empty"]', view);
    out.empty = empty ? { text: empty.innerText, rect: rc(empty), textRect: textRect(empty), cut: cut(empty), hit: hit(empty), inViewport: empty.getBoundingClientRect().bottom <= innerHeight && empty.getBoundingClientRect().right <= innerWidth } : null;
    const table = q('[data-testid="skills-table"]', view);
    if (table) {
      const sc = table.parentElement;
      out.scroller = { rect: rc(sc), cut: cut(sc), scrollTop: sc.scrollTop, overflow: css(sc, 'overflowX') + '/' + css(sc, 'overflowY'), bottomInViewport: sc.getBoundingClientRect().bottom <= innerHeight + 0.5 };
      out.table = { rect: rc(table), cut: cut(table), layout: css(table, 'tableLayout') };
      out.head = qa('thead th', table).map((th) => ({ text: th.innerText, rect: rc(th), textRect: textRect(th), align: css(th, 'textAlign'), pos: css(th, 'position'), top: css(th, 'top'), bg: css(th, 'backgroundColor'), z: css(th, 'zIndex'), cut: cut(th), ws: css(th, 'whiteSpace'), hit: hit(th), anchors: qa('.eq-tip-anchor', th).length }));
      const sr = sc.getBoundingClientRect();
      const headBottom = (q('thead', table) || table).getBoundingClientRect().bottom;
      const rows = qa('[data-testid="skill-row"]', table);
      out.rowCount = rows.length;
      out.rows = rows.map((tr, i) => {
        const b = tr.getBoundingClientRect();
        const visible = b.top >= headBottom - 0.5 && b.bottom <= sr.bottom + 0.5;
        return {
          i, y: f(b.top), h: f(b.height), visible,
          cells: qa('td', tr).map((td) => { const t = textRect(td); const c = td.getBoundingClientRect(); return { text: td.innerText, x: f(c.left), w: f(c.width), right: f(c.right), align: css(td, 'textAlign'), ws: css(td, 'whiteSpace'), ovf: css(td, 'textOverflow'), sw: td.scrollWidth, cw: td.clientWidth, tx: t ? t.x : null, tright: t ? t.right : null, th: t ? t.h : null, padR: css(td, 'paddingRight'), padL: css(td, 'paddingLeft'), hit: visible ? hit(td) : 'n/a', withheld: !!q('[data-testid="skill-rate-withheld"]', td) }; })
        };
      });
      out.rowOverlaps = [];
      for (let i = 0; i + 1 < rows.length; i++) { const a = rows[i].getBoundingClientRect(), b = rows[i + 1].getBoundingClientRect(); if (a.bottom > b.top + 0.5) out.rowOverlaps.push(i + ':' + f(a.bottom) + '>' + f(b.top)); }
    }
  }
  const notice = q('[data-testid="telemetry-notice"]');
  out.notice = notice ? rc(notice) : null;
  out.tooltips = qa('[role="tooltip"]').map((t) => ({ text: t.innerText, rect: rc(t) }));
  return out;
})()`

/* eslint-disable @typescript-eslint/no-explicit-any */
export function measure(page: Page): Promise<any> {
  return page.evaluate(MEASURE)
}

/** A compact, readable account of one measurement. */
export function report(tag: string, m: any): void {
  save(`${tag}.json`, m)
  console.log(`\n==== ${tag} ==== viewport ${String(m.vw)}x${String(m.vh)} dpr ${String(m.dpr)} docOverflow x${String(m.docOverflowX)} y${String(m.docOverflowY)}`)
  if (m.nav) {
    console.log(`nav-skills: ${JSON.stringify(m.nav)}`)
    console.log(`drawer: ${JSON.stringify(m.drawer)}`)
  }
  if (!m.viewPresent) {
    console.log('skills-view: ABSENT')
    return
  }
  console.log(`viewText: ${JSON.stringify(m.viewText)}`)
  console.log(`view: ${JSON.stringify(m.view)} content: ${JSON.stringify(m.content)}`)
  console.log(`title: ${JSON.stringify(m.title)}`)
  console.log(`switch: ${JSON.stringify(m.switch)}`)
  console.log(`caption: ${JSON.stringify(m.caption)}`)
  console.log(`empty: ${JSON.stringify(m.empty)}`)
  console.log(`notice: ${JSON.stringify(m.notice)} tooltips: ${JSON.stringify(m.tooltips)}`)
  if (m.scroller) {
    console.log(`scroller: ${JSON.stringify(m.scroller)}`)
    console.log(`table: ${JSON.stringify(m.table)}`)
    for (const h of m.head) console.log(`  th ${JSON.stringify(h)}`)
    console.log(`rows: ${String(m.rowCount)} overlaps: ${JSON.stringify(m.rowOverlaps)}`)
    const bad: string[] = []
    for (const r of m.rows) {
      const line = r.cells.map((c: any) => c.text).join(' | ')
      console.log(`  row ${String(r.i)} y=${String(r.y)} h=${String(r.h)} ${r.visible ? 'vis' : 'off'} :: ${line}`)
      r.cells.forEach((c: any, ci: number) => {
        if (c.sw > c.cw) bad.push(`row ${String(r.i)} cell ${String(ci)} "${c.text}" scrollWidth ${String(c.sw)} > clientWidth ${String(c.cw)}`)
        if (c.tx !== null && (c.tx < c.x - 0.5 || c.tright > c.right + 0.5)) bad.push(`row ${String(r.i)} cell ${String(ci)} "${c.text}" text ${String(c.tx)}..${String(c.tright)} outside cell ${String(c.x)}..${String(c.right)}`)
        if (ci > 0 && c.align !== 'right') bad.push(`row ${String(r.i)} cell ${String(ci)} align ${String(c.align)}`)
        if (r.visible && c.hit !== 'hit') bad.push(`row ${String(r.i)} cell ${String(ci)} "${c.text}" ${String(c.hit)}`)
        if (c.th !== null && c.th > 30) bad.push(`row ${String(r.i)} cell ${String(ci)} "${c.text}" text is ${String(c.th)}px tall (wrapped)`)
      })
    }
    console.log(`cell problems: ${bad.length === 0 ? 'none' : `\n   ${bad.join('\n   ')}`}`)
    const r0 = m.rows[0]
    if (r0) console.log(`  row0 cells: ${JSON.stringify(r0.cells)}`)
  }
}
