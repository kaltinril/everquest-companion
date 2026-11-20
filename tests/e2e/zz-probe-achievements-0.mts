// zz-probe-achievements-0.mts: THROWAWAY helpers for the Achievements / Factions probes. Never committed.
import type { ElectronApplication, Page } from 'playwright-core'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINE_BIN, MAIN_ENTRY, countOf, settleGone, sleep } from './appHarness.mjs'

export const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/achievements'

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

export async function windowBounds(app: ElectronApplication, page: Page): Promise<unknown> {
  const win = await app.browserWindow(page)
  return win.evaluate((w) => ({ bounds: w.getBounds(), min: w.getMinimumSize(), content: w.getContentSize() }))
}

export async function setScale(page: Page, scale: number): Promise<number> {
  await page.evaluate(`window.eq.setUiScale(${String(scale)})`)
  await sleep(1500)
  return page.evaluate('window.devicePixelRatio') as Promise<number>
}

/** In-page helpers, as a string so tsx's keepNames helper never reaches the page. */
export const LIB = `
  const f = (n) => Math.round(n * 10) / 10;
  const rc = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: f(r.left), y: f(r.top), w: f(r.width), h: f(r.height), r: f(r.right), b: f(r.bottom) }; };
  const txt = (el) => el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  const css = (el, p) => el ? getComputedStyle(el)[p] : null;
  const q = (s, root) => (root || document).querySelector(s);
  const qa = (s, root) => Array.from((root || document).querySelectorAll(s));
  const hit = (el) => { if (!el) return 'absent'; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return 'collapsed'; const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre off viewport'; const top = document.elementFromPoint(cx, cy); if (!top) return 'nothing'; if (el === top || el.contains(top)) return 'hit'; if (top.contains(el)) return 'hit-ancestor ' + top.tagName; return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 50) + '#' + (top.getAttribute('data-testid') || '') + ' "' + txt(top).slice(0, 30) + '"'; };
  const cut = (el) => el ? { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight } : null;
  const isCut = (el) => el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  const scroller = (el) => { let p = el ? el.parentElement : null; while (p) { const o = getComputedStyle(p); if (/(auto|scroll)/.test(o.overflowY) || /(auto|scroll)/.test(o.overflowX)) return p; p = p.parentElement; } return null; };
  const within = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5; };
  const inter = (a, b) => { const x = Math.min(a.right, b.right) - Math.max(a.left, b.left); const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return x > 1 && y > 1 ? [f(x), f(y)] : null; };
  const overlaps = (els) => { const out = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const o = inter(els[i].getBoundingClientRect(), els[j].getBoundingClientRect()); if (o) out.push('"' + txt(els[i]).slice(0, 30) + '" x "' + txt(els[j]).slice(0, 30) + '" by ' + o.join('x')); } return out; };
  const piece = (el) => { const lab = el.classList.contains('MuiChip-root') ? q('.MuiChip-label', el) : el; return { tag: el.tagName.toLowerCase() + (el.classList.contains('MuiChip-root') ? '.chip' : ''), t: txt(el), rect: rc(el), cut: isCut(lab) ? cut(lab) : undefined, ws: css(lab, 'whiteSpace'), to: css(lab, 'textOverflow'), lines: Math.round(el.getBoundingClientRect().height / (parseFloat(css(lab, 'lineHeight')) || 16) * 10) / 10 }; };
  const base = () => ({ vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docOverX: document.documentElement.scrollWidth - document.documentElement.clientWidth, docOverY: document.documentElement.scrollHeight - document.documentElement.clientHeight, tooltips: qa('[role="tooltip"]').map((t) => ({ t: txt(t), rect: rc(t) })) });
`

/* eslint-disable @typescript-eslint/no-explicit-any */
export function evalLib(page: Page, body: string): Promise<any> {
  return page.evaluate(`(() => { ${LIB}\n${body} })()`)
}

/** The Achievements tab: the frame, the rail, the list head, the plan column. */
export const ACH = `
  const out = base();
  const view = q('[data-testid="achievements-view"]');
  out.viewPresent = !!view;
  if (!view) return out;
  out.view = { rect: rc(view), cut: cut(view) };
  const content = q('[data-testid="app-content"]');
  out.content = content ? { rect: rc(content), cut: cut(content) } : null;
  const fresh = q('[data-testid="achievements-freshness"]');
  out.fresh = fresh ? { t: txt(fresh), rect: rc(fresh), cut: cut(fresh), hit: hit(fresh) } : null;
  const empty = q('[data-testid="achievements-empty"]');
  out.empty = empty ? { t: txt(empty), rect: rc(empty), hit: hit(empty) } : null;
  const cols = view.lastElementChild ? Array.from(view.lastElementChild.children) : [];
  out.cols = cols.map((c) => ({ rect: rc(c), cut: cut(c) }));
  const rail = q('[data-testid="achievements-rail"]');
  if (rail) {
    out.rail = { rect: rc(rail), cut: cut(rail) };
    out.railRows = qa('[data-testid="achievements-rail-row"]', rail).map((r) => { const lab = q('.MuiTypography-body2', r); return txt(r) + (r.classList.contains('Mui-selected') ? ' [SELECTED]' : '') + (isCut(lab) ? ' [CUT ' + lab.scrollWidth + '>' + lab.clientWidth + ']' : ''); });
  }
  const title = q('[data-testid="achievements-title"]');
  out.title = title ? { t: txt(title), rect: rc(title) } : null;
  const openOnly = q('[data-testid="achievements-open-only"]');
  out.openOnly = openOnly ? { t: txt(openOnly), rect: rc(openOnly) } : null;
  const list = q('[data-testid="achievements-list"]');
  if (list) {
    out.list = { rect: rc(list), cut: cut(list), scrollTop: list.scrollTop };
    const ctl = list.parentElement.children[1];
    out.listControls = { t: txt(ctl), rect: rc(ctl), kids: Array.from(ctl.children).map((k) => ({ t: txt(k), rect: rc(k), hit: hit(k) })), overlaps: overlaps(Array.from(ctl.children)) };
    out.sections = qa('[data-testid="achievements-section"]', list).map((s) => txt(s) + ' @y' + f(s.getBoundingClientRect().top));
    const rows = qa('[data-testid="achievement-row"]', list);
    out.rowCount = rows.length;
    out.rows = rows.map((r) => {
      const name = q('[data-testid="achievement-name"]', r);
      const b = r.getBoundingClientRect();
      const box = q('input[type=checkbox]', r);
      const lines = qa('[data-testid="achievement-line"]', r).map((l) => txt(l));
      return { name: txt(name), nameCut: isCut(name) ? cut(name) : undefined, t: txt(r), y: f(b.top), h: f(b.height), right: f(b.right), done: r.getAttribute('data-done'), pick: box ? { label: box.getAttribute('aria-label'), checked: box.checked, ind: box.getAttribute('data-indeterminate') } : null, lines, caret: !!q('[data-testid="achievement-open"]', r), over: r.scrollWidth > r.clientWidth + 1 ? [r.scrollWidth, r.clientWidth] : undefined };
    });
    out.rowOverlaps = [];
    for (let i = 0; i + 1 < rows.length; i++) { const a = rows[i].getBoundingClientRect(), b = rows[i + 1].getBoundingClientRect(); if (a.bottom > b.top + 0.5) out.rowOverlaps.push(i + ':' + f(a.bottom) + '>' + f(b.top)); }
  }
  const nearly = q('[data-testid="slayer-pick-nearly"]');
  const clear = q('[data-testid="slayer-pick-clear"]');
  out.planPresent = !!q('[data-testid="slayer-zones-title"]');
  if (out.planPresent) {
    out.planButtons = [nearly, clear].map((b) => b ? { t: txt(b), rect: rc(b), disabled: b.disabled, hit: hit(b), cut: isCut(b) ? cut(b) : undefined } : null);
    out.planButtonsOverlap = overlaps([nearly, clear].filter(Boolean));
    const zt = q('[data-testid="slayer-zones-title"]');
    out.planTitle = { t: txt(zt), rect: rc(zt), cut: isCut(zt) ? cut(zt) : undefined };
    const zl = q('[data-testid="slayer-zones"]');
    const controls = zl.previousElementSibling;
    const lvl = q('[data-testid="slayer-max-level"]');
    out.planControls = { rect: rc(controls), t: txt(controls), level: lvl ? { value: lvl.value, rect: rc(lvl), label: txt(q('label', lvl.closest('.MuiFormControl-root'))), labelRect: rc(q('label', lvl.closest('.MuiFormControl-root'))), labelCut: cut(q('label', lvl.closest('.MuiFormControl-root'))) } : null,
      kids: Array.from(controls.children).map((k) => ({ t: txt(k), rect: rc(k), hit: hit(k), inside: within(k, controls) })),
      switches: qa('input[type=checkbox]', controls).map((i) => ({ label: txt(i.closest('label')), checked: i.checked, disabled: i.disabled })),
      toggles: qa('button.MuiToggleButton-root', controls).map((b) => ({ t: txt(b), pressed: b.getAttribute('aria-pressed'), rect: rc(b), disabled: b.disabled })),
      overlaps: overlaps(Array.from(controls.children)) };
    out.zones = { rect: rc(zl), cut: cut(zl), scrollTop: zl.scrollTop, count: qa('[data-testid="slayer-zone"]', zl).length, emptyText: zl.children.length && !q('[data-testid="slayer-zone"]', zl) ? txt(zl) : null };
  }
  return out;
`

/** Every zone row (or the first n), each with its header pieces, their overlaps, and its open mobs. */
export function zonesExpr(limit: number): string {
  return `
  const zl = q('[data-testid="slayer-zones"]');
  if (!zl) return null;
  const zr = zl.getBoundingClientRect();
  return qa('[data-testid="slayer-zone"]', zl).slice(0, ${String(limit)}).map((z) => {
    const head = z.firstElementChild;
    const info = head.children[1];
    const line1 = info.children[0], line2 = info.children[1];
    const p1 = Array.from(line1.children), p2 = Array.from(line2.children);
    const map = q('[data-testid="slayer-zone-map"]', z);
    const caret = head.children[0];
    const mobs = qa('[data-testid="slayer-mob"]', z).map((m) => { const kids = Array.from(m.children); return { t: txt(m), rect: rc(m), pieces: kids.map(piece), overlaps: overlaps(kids), outside: kids.filter((k) => !within(k, zl)).map((k) => txt(k)), rows: new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2))).size }; });
    return { name: txt(q('[data-testid="slayer-zone-name"]', z)), t: txt(head), rect: rc(z), headRect: rc(head), aria: caret.getAttribute('aria-label'),
      line1: p1.map(piece), line2: p2.map(piece), overlaps: overlaps([caret, ...p1, ...p2].concat(map ? [map] : [])),
      outside: [...p1, ...p2].filter((k) => !within(k, zl)).map((k) => txt(k)),
      map: map ? { rect: rc(map), hit: (z.getBoundingClientRect().top >= zr.top && z.getBoundingClientRect().bottom <= zr.bottom) ? hit(map) : 'row not fully in scroller', aria: map.getAttribute('aria-label') } : null,
      mobCount: mobs.length, mobs };
  });
`
}
