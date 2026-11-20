// THROWAWAY PROBE LIBRARY (key: respawn-alert). Never committed. Shared by zz-probe-respawn-alert-1/2.
import type { ElectronApplication, Page } from 'playwright-core'
import { countOf, settle, settleGone, sleep } from './appHarness.mjs'
import type { FixtureLog } from './logFixture.mjs'

/** In-page measurement code, shipped as a STRING so tsx/esbuild never rewrites it. */
const MEASURE_JS = `
window.__m = function (sel) {
  return Array.from(document.querySelectorAll(sel)).map(function (el) {
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var top = document.elementFromPoint(cx, cy);
    var hit = 'none';
    if (top) hit = (el === top || el.contains(top) || top.contains(el)) ? 'self'
      : (top.tagName + '.' + String(top.className && top.className.baseVal !== undefined ? top.className.baseVal : top.className).slice(0, 70) + '#' + (top.getAttribute('data-testid') || ''));
    var vx0 = r.left, vy0 = r.top, vx1 = r.right, vy1 = r.bottom, clipper = '';
    for (var p = el.parentElement; p; p = p.parentElement) {
      var pcs = getComputedStyle(p);
      if (pcs.overflowX === 'visible' && pcs.overflowY === 'visible') continue;
      var pr = p.getBoundingClientRect();
      if (pr.left > vx0 + 0.5 || pr.top > vy0 + 0.5 || pr.right < vx1 - 0.5 || pr.bottom < vy1 - 0.5) clipper = clipper || (p.tagName + '.' + String(p.className).slice(0, 50) + '#' + (p.getAttribute('data-testid') || ''));
      vx0 = Math.max(vx0, pr.left); vy0 = Math.max(vy0, pr.top); vx1 = Math.min(vx1, pr.right); vy1 = Math.min(vy1, pr.bottom);
    }
    var txt = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? ('value=' + el.value) : (el.innerText || el.textContent || '');
    return {
      text: String(txt).replace(/\\s+/g, ' ').trim().slice(0, 260),
      rect: [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
      sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, overflow: cs.overflowX + '/' + cs.overflowY,
      fontSize: cs.fontSize, lineHeight: cs.lineHeight, color: cs.color,
      hit: hit,
      outOfViewport: (r.right > window.innerWidth + 0.5 || r.left < -0.5 || r.bottom > window.innerHeight + 0.5 || r.top < -0.5),
      clippedBy: clipper,
      visibleW: Math.round(Math.max(0, vx1 - vx0) * 10) / 10, visibleH: Math.round(Math.max(0, vy1 - vy0) * 10) / 10,
      disabled: el.disabled === true, ariaDisabled: el.getAttribute('aria-disabled'), ariaInvalid: el.getAttribute('aria-invalid'),
      ariaLabel: el.getAttribute('aria-label'), checked: el.checked === undefined ? null : el.checked,
      validity: el.validity ? (el.validity.valid ? 'valid' : ('invalid:' + (el.validity.rangeOverflow ? 'rangeOverflow ' : '') + (el.validity.rangeUnderflow ? 'rangeUnderflow ' : '') + (el.validity.badInput ? 'badInput ' : '') + (el.validity.stepMismatch ? 'stepMismatch' : ''))) : null
    };
  });
};
window.__leaves = function (sel) {
  var root = document.querySelector(sel);
  if (!root) return null;
  var out = [];
  var all = root.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var own = '';
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
    own = own.replace(/\\s+/g, ' ').trim();
    var isCtl = el.tagName === 'INPUT' || el.tagName === 'BUTTON';
    if (!own && !isCtl) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // the text's own box: a range over the element's contents (an inline element's rect is its lines)
    var r;
    if (own && !isCtl) { var rg = document.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect(); } else r = el.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    var x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom, clip = '';
    for (var p = el; p; p = p.parentElement) {
      var pcs = getComputedStyle(p);
      if (pcs.overflowX === 'visible' && pcs.overflowY === 'visible') continue;
      var pr = p.getBoundingClientRect();
      if (pr.left > x0 + 0.5 || pr.top > y0 + 0.5 || pr.right < x1 - 0.5 || pr.bottom < y1 - 0.5) clip = clip || (p.tagName + '#' + (p.getAttribute('data-testid') || String(p.className).slice(0, 40)));
      x0 = Math.max(x0, pr.left); y0 = Math.max(y0, pr.top); x1 = Math.min(x1, pr.right); y1 = Math.min(y1, pr.bottom);
    }
    out.push({
      tag: el.tagName, tid: el.getAttribute('data-testid') || '', text: (isCtl && el.tagName === 'INPUT') ? ('value=' + el.value) : (own || (el.innerText || '').replace(/\\s+/g, ' ').trim()).slice(0, 120),
      raw: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      x0: x0, y0: y0, x1: x1, y1: y1, clip: clip,
      elW: Math.round(er.width), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      to: cs.textOverflow, ws: cs.whiteSpace, ovx: cs.overflowX,
      out: (r.right > window.innerWidth + 0.5 || r.left < -0.5 || r.bottom > window.innerHeight + 0.5 || r.top < -0.5),
      disabled: el.disabled === true
    });
  }
  return out;
};
window.__view = function () {
  return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio,
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
    hasFocus: document.hasFocus(), active: document.activeElement ? (document.activeElement.tagName + '#' + (document.activeElement.getAttribute('data-testid') || '')) : '' };
};
'installed'
`

export interface M {
  text: string
  rect: [number, number, number, number]
  sw: number
  cw: number
  sh: number
  ch: number
  textOverflow: string
  whiteSpace: string
  overflow: string
  fontSize: string
  lineHeight: string
  color: string
  hit: string
  outOfViewport: boolean
  clippedBy: string
  visibleW: number
  visibleH: number
  disabled: boolean
  ariaDisabled: string | null
  ariaInvalid: string | null
  ariaLabel: string | null
  checked: boolean | null
  validity: string | null
}

export interface Leaf {
  tag: string
  tid: string
  text: string
  raw: [number, number, number, number]
  x0: number
  y0: number
  x1: number
  y1: number
  clip: string
  elW: number
  sw: number
  cw: number
  sh: number
  ch: number
  to: string
  ws: string
  ovx: string
  out: boolean
  disabled: boolean
}

export async function install(page: Page): Promise<void> {
  await page.evaluate(MEASURE_JS)
}

export function m(page: Page, sel: string): Promise<M[]> {
  return page.evaluate(`window.__m(${JSON.stringify(sel)})`) as Promise<M[]>
}

export function leaves(page: Page, sel: string): Promise<Leaf[] | null> {
  return page.evaluate(`window.__leaves(${JSON.stringify(sel)})`) as Promise<Leaf[] | null>
}

export function view(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate('window.__view()') as Promise<Record<string, unknown>>
}

export function say(tag: string, what: unknown): void {
  console.log(`[${tag}] ${typeof what === 'string' ? what : JSON.stringify(what)}`)
}

/** Print one measured element per line, short. */
export async function show(page: Page, tag: string, sel: string): Promise<M[]> {
  const got = await m(page, sel)
  if (got.length === 0) say(tag, `${sel} -> ABSENT`)
  got.forEach((g, i) => {
    const flags: string[] = []
    if (g.sw > g.cw + 1) flags.push(`SCROLLW ${String(g.sw)}>${String(g.cw)}`)
    if (g.sh > g.ch + 1) flags.push(`SCROLLH ${String(g.sh)}>${String(g.ch)}`)
    if (g.outOfViewport) flags.push('OUT-OF-VIEWPORT')
    if (g.clippedBy) flags.push(`CLIPPED-BY ${g.clippedBy} visible ${String(g.visibleW)}x${String(g.visibleH)}`)
    if (g.hit !== 'self') flags.push(`COVERED/HIT=${g.hit}`)
    say(
      tag,
      `${sel}[${String(i)}] text="${g.text}" rect=${JSON.stringify(g.rect)} sw/cw=${String(g.sw)}/${String(g.cw)} sh/ch=${String(g.sh)}/${String(g.ch)} to=${g.textOverflow} ws=${g.whiteSpace} ov=${g.overflow} font=${g.fontSize} disabled=${String(g.disabled)} ariaDisabled=${String(g.ariaDisabled)} checked=${String(g.checked)} validity=${String(g.validity)} ariaInvalid=${String(g.ariaInvalid)} ariaLabel=${String(g.ariaLabel)} ${flags.join(' | ')}`
    )
  })
  return got
}

/** Leaves of a container: every one printed, then pairwise overlaps and cut-offs. */
export async function showLeaves(page: Page, tag: string, sel: string, quiet = false): Promise<void> {
  const ls = await leaves(page, sel)
  if (ls === null) {
    say(tag, `${sel} -> ABSENT`)
    return
  }
  const problems: string[] = []
  ls.forEach((l, i) => {
    const visW = Math.max(0, l.x1 - l.x0)
    const visH = Math.max(0, l.y1 - l.y0)
    const rawW = l.raw[2] - l.raw[0]
    const rawH = l.raw[3] - l.raw[1]
    const cut = visW < rawW - 1.5 || visH < rawH - 1.5
    const ell = l.to === 'ellipsis' && l.sw > l.cw + 1
    if (!quiet) {
      say(tag, `leaf ${String(i)} <${l.tag}${l.tid ? ` ${l.tid}` : ''}> "${l.text}" raw=${JSON.stringify(l.raw)} vis=${String(Math.round(visW))}x${String(Math.round(visH))} sw/cw=${String(l.sw)}/${String(l.cw)} ws=${l.ws} to=${l.to}${l.disabled ? ' DISABLED' : ''}${l.out ? ' OUT-OF-VIEWPORT' : ''}${cut ? ` CUT-BY ${l.clip}` : ''}${ell ? ' ELLIPSIS-ACTIVE' : ''}`)
    }
    if (l.out) problems.push(`OUT-OF-VIEWPORT: "${l.text}" raw=${JSON.stringify(l.raw)}`)
    if (cut) problems.push(`CUT: "${l.text}" raw ${String(rawW)}x${String(rawH)} visible ${String(Math.round(visW))}x${String(Math.round(visH))} by ${l.clip}`)
    if (ell) problems.push(`ELLIPSIS: "${l.text}" sw ${String(l.sw)} > cw ${String(l.cw)}`)
  })
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i]
      const b = ls[j]
      if (a.x1 - a.x0 <= 0 || a.y1 - a.y0 <= 0 || b.x1 - b.x0 <= 0 || b.y1 - b.y0 <= 0) continue
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
      if (ox > 1.5 && oy > 1.5) problems.push(`OVERLAP: "${a.text}" x "${b.text}" ${String(Math.round(ox))}x${String(Math.round(oy))}px (a=${JSON.stringify(a.raw)} b=${JSON.stringify(b.raw)})`)
    }
  }
  say(tag, `${sel}: ${String(ls.length)} leaves, ${String(problems.length)} problem(s)`)
  for (const p of problems) say(tag, `  !! ${p}`)
}

export function bodyText(page: Page, sel: string): Promise<string> {
  return page.evaluate(
    (s) => (document.querySelector(s) as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '<absent>',
    sel
  )
}

export function dashes(text: string): string {
  const hits = text.match(/.{0,20}[‒–—―].{0,20}/g)
  return hits ? `DASHES: ${hits.join(' || ')}` : 'no em/en dash'
}

export async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 15_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) {
    say('setup', 'no first-run notice shown')
    return
  }
  await page.click('[data-testid="telemetry-notice-off"]')
  say('setup', `first-run notice answered: gone=${String(await settleGone(page, notice, { timeoutMs: 8_000 }))}`)
}

export async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate(
    (w, b) => {
      w.setMinimumSize(360, 360)
      w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
    },
    { w: width, h: height }
  )
  await sleep(1500)
  say('window', await view(page))
}

export async function windowBounds(app: ElectronApplication, page: Page): Promise<{ width: number; height: number }> {
  const win = await app.browserWindow(page)
  return win.evaluate((w) => w.getBounds())
}

export async function setScale(page: Page, scale: number): Promise<void> {
  const stored = await page.evaluate(
    (s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s),
    scale
  )
  await sleep(1500)
  say('scale', `asked ${String(scale)} stored ${String(stored)} view=${JSON.stringify(await view(page))}`)
}

export const WIKI_MOB = 'a frenzied ghoul'
export const OWN_MOB = 'a wan ghoul knight'
export const DIALOG = '[data-testid="respawn-edit-dialog"]'
export const INPUT = `${DIALOG} [data-testid="respawn-edit-input"] input`
export const SAVE = `${DIALOG} [data-testid="respawn-edit-save"]`

export function rowSel(mob: string): string {
  return `[data-testid="respawn-row"][data-respawn-mob="${mob}"]`
}

/** Play the kills the respawn spec plays and watch both mobs: one wiki row, one "your kills" row. */
export async function stageClocks(page: Page, log: FixtureLog): Promise<void> {
  log.append(`You have slain ${WIKI_MOB}!`)
  const now = new Date()
  const earlier = new Date(now.getTime() - 3 * 60_000)
  log.appendAt(earlier, `You have slain ${OWN_MOB}!`)
  log.appendAt(now, `You have slain ${OWN_MOB}!`)
  for (const mob of [WIKI_MOB, OWN_MOB]) {
    const cand = `[data-testid="respawn-candidate"][data-respawn-mob="${mob}"] [data-testid="respawn-watch"]`
    const seen = await settle(() => countOf(page, cand), (n) => n === 1, { timeoutMs: 30_000 })
    say('stage', `${mob}: offered in Recently killed = ${String(seen)}`)
    await page.click(cand, { timeout: 15_000 })
    await page.mouse.move(0, 0)
    const row = await settle(() => countOf(page, rowSel(mob)), (n) => n === 1, { timeoutMs: 30_000 })
    say('stage', `${mob}: clock row = ${String(row)}`)
  }
}

export async function openEditor(page: Page, mob: string): Promise<number> {
  await page.click(`${rowSel(mob)} [data-testid="respawn-edit"]`, { timeout: 15_000 })
  await page.mouse.move(0, 0)
  const n = await settle(() => countOf(page, DIALOG), (c) => c === 1, { timeoutMs: 20_000 })
  await sleep(600) // the dialog's opening transition, and the mob card's lookup landing
  return n
}

export async function closeEditor(page: Page, via: 'cancel' | 'save' | 'clear'): Promise<number> {
  await page.click(`${DIALOG} [data-testid="respawn-edit-${via}"]`, { timeout: 15_000 })
  await page.mouse.move(0, 0)
  return settle(() => countOf(page, DIALOG), (n) => n === 0, { timeoutMs: 20_000 })
}

export function saveDisabled(page: Page): Promise<string> {
  return page.evaluate((sel) => {
    const b = document.querySelector(sel) as HTMLButtonElement | null
    return b === null ? 'absent' : b.disabled ? 'DISABLED' : 'enabled'
  }, SAVE)
}

/** The whole dialog, as a player reads it: its words, each control, its leaves and overlaps. */
export async function dumpDialog(page: Page, tag: string, quiet = false): Promise<void> {
  say(tag, `dialog text: ${await bodyText(page, `${DIALOG} .MuiDialog-paper`)}`)
  say(tag, dashes(await bodyText(page, `${DIALOG} .MuiDialog-paper`)))
  await show(page, tag, `${DIALOG} .MuiDialog-paper`)
  await show(page, tag, `${DIALOG} .MuiDialogTitle-root`)
  await show(page, tag, `${DIALOG} .MuiDialogContent-root`)
  await show(page, tag, `${DIALOG} .MuiDialogActions-root`)
  await show(page, tag, INPUT)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-reading"]`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-error"]`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-save-note"]`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-wiki"]`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-calculated"]`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-shared-name"] input`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-clear"]`)
  await show(page, tag, `${DIALOG} [data-testid="respawn-edit-cancel"]`)
  await show(page, tag, SAVE)
  await showLeaves(page, tag, `${DIALOG} .MuiDialog-paper`, quiet)
}

export const CONTROL_ROW = '[data-testid="timers-view"] > .MuiStack-root:nth-of-type(2)'

/** The pre-alert control: box, label, field, its label, the note; and the row of controls it sits in. */
export async function dumpControl(page: Page, tag: string): Promise<void> {
  say(tag, `view=${JSON.stringify(await view(page))}`)
  await show(page, tag, '[data-testid="respawn-alert-on"] input')
  await show(page, tag, '[data-testid="respawn-alert-on"]')
  await show(page, tag, 'label:has([data-testid="respawn-alert-on"])')
  await show(page, tag, 'label:has([data-testid="respawn-alert-on"]) .MuiFormControlLabel-label')
  await show(page, tag, '[data-testid="respawn-alert-lead"]')
  await show(page, tag, '.MuiTextField-root:has([data-testid="respawn-alert-lead"])')
  await show(page, tag, '.MuiTextField-root:has([data-testid="respawn-alert-lead"]) label')
  await show(page, tag, '.MuiTextField-root:has([data-testid="respawn-alert-lead"]) legend')
  await show(page, tag, '[data-testid="respawn-alert-silent"]')
  await show(page, tag, '[data-testid="respawn-scope"]')
  await show(page, tag, '[data-testid="timers-view"]')
  // the control's own row (the inner Stack) and the wrapping row it is the last child of
  const rowInfo = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="respawn-alert-on"]')
    const inner = box?.closest('label')?.parentElement as HTMLElement | null
    const outer = inner?.parentElement as HTMLElement | null
    const kids = outer
      ? Array.from(outer.children).map((k) => {
          const r = k.getBoundingClientRect()
          return `${k.tagName}[${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}] "${(k as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 60)}"`
        })
      : []
    const ir = inner?.getBoundingClientRect()
    const or = outer?.getBoundingClientRect()
    return {
      inner: ir ? [Math.round(ir.left), Math.round(ir.top), Math.round(ir.width), Math.round(ir.height)] : null,
      innerScroll: inner ? `${String(inner.scrollWidth)}/${String(inner.clientWidth)}` : '',
      outer: or ? [Math.round(or.left), Math.round(or.top), Math.round(or.width), Math.round(or.height)] : null,
      outerScroll: outer ? `${String(outer.scrollWidth)}/${String(outer.clientWidth)}` : '',
      kids
    }
  })
  say(tag, `control row: ${JSON.stringify(rowInfo)}`)
  await showLeaves(page, tag, CONTROL_ROW)
}

export function storedAlert(page: Page): Promise<unknown> {
  return page.evaluate(() =>
    (window as unknown as { eq: { getRespawnAlert: () => Promise<unknown> } }).eq.getRespawnAlert()
  )
}

export const LEAD = '[data-testid="respawn-alert-lead"]'

export function leadValue(page: Page): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLInputElement | null)?.value ?? '<absent>', LEAD)
}
