/**
 * THROWAWAY PROBE (never committed): the settings recovery notice, one staged userData per run.
 *
 * Run: node --import tsx tests/e2e/zz-probe-settings-notice-1.mts <state>
 *   state = reset | backup | torn | healthy | second
 *
 * Each run launches the hidden app ONCE on its own userData, prints what the card says and where
 * it sits at the default window, the 900x600 minimum, and 125% text size at both, then drives OK
 * and proves the card stays away. Full readings go to the scratchpad as JSON.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, settleGone, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const OUT =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/ui-probe/settings-notice'
mkdirSync(OUT, { recursive: true })

const STATE = process.argv[2] ?? 'reset'
const STORE = 'everquest-companion-progress.json'
const CARD = '[data-testid="settings-recovery-notice"]'
const OK = '[data-testid="settings-recovery-notice-close"]'
const FIRST_RUN = '[data-testid="telemetry-notice"]'

/* The page-side reading, as a STRING so tsx/esbuild never rewrites it (no __name helper). */
const MEASURE = String.raw`(() => {
  const R = (r) => ({ x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) });
  const rectOf = (el) => (el ? R(el.getBoundingClientRect()) : null);
  const ink = (el) => {
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const rects = Array.from(rg.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
    const tops = [];
    for (const q of rects) { if (!tops.some((t) => Math.abs(t - q.top) < 2)) tops.push(q.top); }
    return { lines: tops.length, box: R(rg.getBoundingClientRect()) };
  };
  const part = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const k = ink(el);
    return { text: (el.innerText || el.textContent || '').trim(), rect: R(el.getBoundingClientRect()), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, font: cs.fontSize, lh: cs.lineHeight, weight: cs.fontWeight, ws: cs.whiteSpace, to: cs.textOverflow, ov: cs.overflow, wrap: cs.overflowWrap, color: cs.color, bg: cs.backgroundColor, lines: k.lines, ink: k.box };
  };
  const hit = (el) => {
    if (!el) return 'absent';
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 'collapsed';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'centre outside the viewport';
    const top = document.elementFromPoint(cx, cy);
    if (!top) return 'nothing';
    if (el.contains(top) || top.contains(el)) return 'self';
    const near = top.closest('[data-testid]');
    return 'covered by ' + top.tagName + '.' + String(top.className).slice(0, 50) + ' [' + (near ? near.getAttribute('data-testid') : '') + ']';
  };
  const overlap = (a, b) => {
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return ox > 1 && oy > 1 ? { ox: +ox.toFixed(1), oy: +oy.toFixed(1) } : null;
  };
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth, docSH: document.documentElement.scrollHeight, docCH: document.documentElement.clientHeight };
  // the title bar: the first element whose own app-region is 'drag'
  let bar = null;
  for (const el of document.querySelectorAll('body *')) { if (getComputedStyle(el).getPropertyValue('-webkit-app-region') === 'drag') { bar = el; break; } }
  out.titleBar = rectOf(bar);
  out.drawer = rectOf(document.querySelector('.MuiDrawer-paper'));
  out.content = rectOf(document.querySelector('[data-testid="app-content"]'));
  out.firstRun = part(document.querySelector('[data-testid="telemetry-notice"]'));
  out.snackbars = Array.from(document.querySelectorAll('.MuiSnackbar-root')).map((s) => ({ id: s.getAttribute('data-testid') || (s.querySelector('[data-testid]') ? s.querySelector('[data-testid]').getAttribute('data-testid') : ''), rect: R(s.getBoundingClientRect()), z: getComputedStyle(s).zIndex }));
  const snack = document.querySelector('[data-testid="settings-recovery-notice"]');
  out.present = !!snack;
  if (!snack) return out;
  const scs = getComputedStyle(snack);
  out.snack = { rect: R(snack.getBoundingClientRect()), position: scs.position, top: scs.top, left: scs.left, right: scs.right, transform: scs.transform, z: scs.zIndex, pointer: scs.pointerEvents };
  const alert = snack.querySelector('.MuiAlert-root');
  const ar = alert.getBoundingClientRect();
  out.alert = part(alert);
  out.alert.role = alert.getAttribute('role');
  out.alert.classes = alert.className.replace(/css-\S+/g, '').replace(/\s+/g, ' ').trim();
  out.alert.maxWidth = getComputedStyle(alert).maxWidth;
  out.icon = rectOf(alert.querySelector('.MuiAlert-icon'));
  out.message = part(alert.querySelector('.MuiAlert-message'));
  out.title = part(alert.querySelector('.MuiAlertTitle-root'));
  const text = alert.querySelector('[data-testid="settings-recovery-notice-text"]');
  out.text = part(text);
  const btn = alert.querySelector('[data-testid="settings-recovery-notice-close"]');
  out.button = part(btn);
  out.button.disabled = btn.disabled;
  out.button.ariaDisabled = btn.getAttribute('aria-disabled');
  out.button.tabIndex = btn.tabIndex;
  out.button.border = getComputedStyle(btn).borderColor;
  out.hits = { title: hit(alert.querySelector('.MuiAlertTitle-root')), text: hit(text), button: hit(btn), alert: hit(alert) };
  // every drawn glyph run of the sentence, against the card's own box and the viewport
  const rg = document.createRange();
  rg.selectNodeContents(text);
  let outside = 0, offscreen = 0, widest = 0;
  for (const q of rg.getClientRects()) {
    if (q.width <= 0) continue;
    if (q.left < ar.left - 0.5 || q.right > ar.right + 0.5 || q.top < ar.top - 0.5 || q.bottom > ar.bottom + 0.5) outside++;
    if (q.left < 0 || q.right > innerWidth || q.top < 0 || q.bottom > innerHeight) offscreen++;
    widest = Math.max(widest, q.right);
  }
  out.glyphs = { outsideCard: outside, offscreen, widestRight: +widest.toFixed(1), cardRight: +ar.right.toFixed(1) };
  out.inViewport = ar.left >= 0 && ar.top >= 0 && ar.right <= innerWidth && ar.bottom <= innerHeight;
  // what the card is drawn over
  const named = { titleBar: bar, drawer: document.querySelector('.MuiDrawer-paper'), firstRun: document.querySelector('[data-testid="telemetry-notice"]'), content: document.querySelector('[data-testid="app-content"]') };
  out.over = {};
  for (const k of Object.keys(named)) out.over[k] = named[k] ? overlap(ar, named[k].getBoundingClientRect()) : 'absent';
  out.coveredControls = [];
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="combobox"], [role="checkbox"], [role="switch"], [role="menuitem"]')) {
    if (snack.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const o = overlap(ar, r);
    if (!o) continue;
    const near = el.closest('[data-testid]');
    out.coveredControls.push({ what: (el.getAttribute('data-testid') || el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 40) || el.tagName) + (near && near !== el ? ' in [' + near.getAttribute('data-testid') + ']' : ''), rect: R(r), shared: o, centre: hit(el) });
  }
  out.coveredText = [];
  for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, .MuiTypography-root, .MuiChip-root, .MuiAlert-root, .MuiTab-root')) {
    if (snack.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const o = overlap(ar, r);
    if (!o) continue;
    const t = (el.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    out.coveredText.push({ text: t.slice(0, 70), rect: R(r), shared: o, centre: hit(el) });
  }
  out.text.userSelect = getComputedStyle(text).userSelect;
  out.title.userSelect = getComputedStyle(alert.querySelector('.MuiAlertTitle-root')).userSelect;
  // the GLYPHS the card is drawn over: every text node outside the card whose own ink meets it
  out.coveredInk = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim() || !n.parentElement || snack.contains(n.parentElement)) continue;
    const pcs = getComputedStyle(n.parentElement);
    if (pcs.visibility === 'hidden' || pcs.display === 'none') continue;
    const g = document.createRange();
    g.selectNodeContents(n);
    let best = null;
    for (const q of g.getClientRects()) {
      if (q.width <= 0 || q.height <= 0) continue;
      const o = overlap(ar, q);
      if (o && (!best || o.ox * o.oy > best.ox * best.oy)) best = { ox: o.ox, oy: o.oy, of: +q.width.toFixed(1) + 'x' + +q.height.toFixed(1) };
    }
    if (!best) continue;
    const near = n.parentElement.closest('[data-testid]');
    out.coveredInk.push({ text: n.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 50), where: near ? near.getAttribute('data-testid') : '', shared: best });
  }
  out.active = document.activeElement ? document.activeElement.tagName + '[' + (document.activeElement.getAttribute('data-testid') || '') + ']' : '';
  return out;
})()`

interface Reading {
  vw: number
  vh: number
  dpr: number
  present: boolean
  [k: string]: unknown
}

const rawMeasure = (page: Page): Promise<Reading> => page.evaluate(MEASURE) as Promise<Reading>

/** Measure once the card's own box has stopped moving (its entry transition scales it). */
async function measure(page: Page): Promise<Reading> {
  let last = ''
  for (let i = 0; i < 20; i++) {
    const r = await rawMeasure(page)
    const key = JSON.stringify((r.alert as { rect?: unknown } | undefined)?.rect ?? null)
    if (key === last) return r
    last = key
    await sleep(400)
  }
  return rawMeasure(page)
}

/** WCAG relative-luminance contrast of two `rgb()`/`rgba()` strings (alpha ignored). */
function contrast(a: string, b: string): number {
  const lum = (c: string): number => {
    const m = /(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(c)
    if (!m) return 0
    const ch = [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Stage the userData for one state; answers what was written. */
function stage(userData: string): Record<string, string> {
  const live = join(userData, STORE)
  const wrote: Record<string, string> = {}
  const put = (path: string, text: string): void => {
    writeFileSync(path, text, 'utf8')
    wrote[path.slice(userData.length + 1)] = text.replace(/\u0000/g, '\\0')
  }
  const cutOff = '{\n\t"byCharacter": {\n\t\t"Primitive": {\n\t\t\t"lev'
  if (STATE === 'reset') put(live, cutOff)
  if (STATE === 'backup' || STATE === 'backupold') {
    put(live, cutOff)
    const backup = join(userData, 'everquest-companion-progress.v13.backup.json')
    put(
      backup,
      JSON.stringify(
        STATE === 'backup'
          ? { schemaVersion: 13, byCharacter: {}, telemetry: { enabled: false, noticeShown: true, analyticsId: null } }
          : { schemaVersion: 13, byCharacter: {} },
        undefined,
        '\t'
      )
    )
    // A stated save date, so the date the card prints can be checked against a fact.
    const saved = new Date(2026, 7, 2, 12, 0, 0)
    utimesSync(backup, saved, saved)
  }
  if (STATE === 'torn') put(live, `{"schemaVersion": 14, "byCharacter": {}}\u0000\u0000\u0000\u0000`)
  if (STATE === 'healthy') put(live, '{"schemaVersion": 14, "byCharacter": {}}')
  if (STATE === 'second') {
    put(join(userData, 'everquest-companion-progress.corrupt.json'), '{"byCharacter": {"earlier": ')
    put(live, cutOff)
  }
  return wrote
}

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate((w, b) => {
    w.setBounds({ ...w.getBounds(), width: b.w, height: b.h })
  }, { w: width, h: height })
  // The renderer agrees when its CSS width is the window's width over the zoom.
  const zoom = await page.evaluate(() => window.devicePixelRatio)
  await settle(
    () => page.evaluate(() => window.innerWidth * window.devicePixelRatio),
    (v) => Math.abs(v - width * (zoom / zoom)) <= 30 * zoom || Math.abs(v / zoom - width / zoom) <= 30,
    { timeoutMs: 10_000 }
  )
  await sleep(700)
}

async function setScale(page: Page, scale: number, baseDpr: number): Promise<number> {
  await page.evaluate(
    (s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s),
    scale
  )
  const got = await settle(
    () => page.evaluate(() => window.devicePixelRatio),
    (d) => Math.abs(d / baseDpr - scale) < 0.01,
    { timeoutMs: 10_000 }
  )
  await sleep(700)
  return got
}

function summary(tag: string, r: Reading): void {
  const j = (v: unknown): string => JSON.stringify(v)
  console.log(`\n[${tag}] viewport ${String(r.vw)}x${String(r.vh)} css px, dpr ${String(r.dpr)}, card present: ${String(r.present)}`)
  console.log(`  titleBar ${j(r.titleBar)}  drawer ${j(r.drawer)}  content ${j(r.content)}`)
  console.log(`  snackbars on screen: ${j(r.snackbars)}`)
  const fr = r.firstRun as { rect: unknown } | null
  console.log(`  first-run notice: ${fr ? j(fr.rect) : 'absent'}`)
  if (!r.present) return
  const alert = r.alert as Record<string, unknown>
  const title = r.title as Record<string, unknown>
  const text = r.text as Record<string, unknown>
  const button = r.button as Record<string, unknown>
  const msg = r.message as Record<string, unknown>
  console.log(`  snack ${j(r.snack)}`)
  console.log(`  card rect ${j(alert.rect)} maxWidth ${String(alert.maxWidth)} role=${String(alert.role)} classes="${String(alert.classes)}" inViewport=${String(r.inViewport)}`)
  console.log(`  card scroll ${String(alert.sw)}/${String(alert.cw)} w, ${String(alert.sh)}/${String(alert.ch)} h; message scroll ${String(msg.sw)}/${String(msg.cw)} w, ${String(msg.sh)}/${String(msg.ch)} h, overflow ${String(msg.ov)}`)
  console.log(`  title "${String(title.text)}" rect ${j(title.rect)} lines ${String(title.lines)} scroll ${String(title.sw)}/${String(title.cw)} font ${String(title.font)}`)
  console.log(`  text  "${String(text.text)}"`)
  console.log(`  text rect ${j(text.rect)} lines ${String(text.lines)} font ${String(text.font)} ws=${String(text.ws)} wrap=${String(text.wrap)} to=${String(text.to)}; glyphs ${j(r.glyphs)}`)
  console.log(`  button "${String(button.text)}" rect ${j(button.rect)} disabled=${String(button.disabled)} aria-disabled=${String(button.ariaDisabled)} tabIndex=${String(button.tabIndex)}`)
  console.log(`  hit tests ${j(r.hits)}`)
  console.log(`  colours: card bg ${String(alert.bg)} text ${String(text.color)} (contrast ${contrast(String(alert.bg), String(text.color)).toFixed(2)}), title ${String(title.color)}, button text ${String(button.color)} border ${String(button.border)}`)
  console.log(`  drawn over: ${j(r.over)}`)
  console.log(`  controls under the card: ${j(r.coveredControls)}`)
  console.log(`  text boxes under the card: ${String((r.coveredText as unknown[]).length)}`)
  console.log(`  user-select of the sentence: ${String(text.userSelect)}`)
  console.log(`  glyph runs the card is drawn over (${String((r.coveredInk as unknown[]).length)}): ${j(r.coveredInk)}`)
}

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  const wrote = stage(userData)
  console.log(`state: ${STATE}\nuserData: ${userData}\nstaged: ${JSON.stringify(wrote)}`)

  const record: Record<string, unknown> = { state: STATE, userData, staged: wrote }
  const launched = await launchOnFixture('e2e-voice.log', { userData })
  const { app } = launched
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  // THE BOUND: whatever happens, this launch is closed.
  const bound = setTimeout(() => {
    console.log('probe: time bound reached, closing the app')
    void close().finally(() => process.exit(2))
  }, 240_000)

  try {
    const page = await mainWindow(app)
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-alerts"]', { timeout: 60_000 })

    // 1. does the card appear
    const shown = await settle(() => countOf(page, CARD), (n) => n > 0, { timeoutMs: STATE === 'healthy' ? 6_000 : 15_000 })
    const ipc = await page.evaluate(() =>
      (window as unknown as { eq: { getSettingsRecoveryNotice: () => Promise<unknown> } }).eq.getSettingsRecoveryNotice()
    )
    console.log(`\nSTEP 1 card count ${String(shown)}; main's notice over IPC: ${JSON.stringify(ipc)}`)
    record.ipc = ipc
    record.cardCount = shown

    // 2. the files on disk, and the path the card prints
    const files = readdirSync(userData).filter((n) => n.startsWith('everquest-companion-progress'))
    console.log(`STEP 2 store files now: ${JSON.stringify(files)}`)
    record.files = files
    const said = (ipc as { text?: string } | null)?.text ?? ''
    const kept = /kept at (.+)\.$/.exec(said)?.[1]
    if (kept !== undefined) {
      console.log(`  path printed: ${kept} (${String(kept.length)} chars) exists on disk: ${String(existsSync(kept))}`)
      if (existsSync(kept)) console.log(`  its bytes: ${JSON.stringify(readFileSync(kept, 'utf8').slice(0, 80))}`)
      record.keptPath = kept
      record.keptExists = existsSync(kept)
    }
    const live = join(userData, STORE)
    if (existsSync(live)) {
      const now = JSON.parse(readFileSync(live, 'utf8')) as Record<string, unknown>
      console.log(`  live store keys now: ${JSON.stringify(Object.keys(now))} telemetry=${JSON.stringify(now.telemetry)} schemaVersion=${JSON.stringify(now.schemaVersion)}`)
      record.liveStore = { keys: Object.keys(now), telemetry: now.telemetry, schemaVersion: now.schemaVersion }
    } else {
      console.log('  live store file: ABSENT')
    }
    console.log(`  dashes in the words: ${/[\u2013\u2014]/.test(JSON.stringify(ipc)) ? 'YES (en or em dash)' : 'none'}`)

    // 3. measure: default window
    const base = await page.evaluate(() => window.devicePixelRatio)
    const readings: Record<string, Reading> = {}
    readings.default = await measure(page)
    summary('STEP 3 default window', readings.default)

    // 4. the app's minimum, 900x600
    await resizeTo(app, page, 900, 600)
    readings.min900 = await measure(page)
    summary('STEP 4 minimum 900x600', readings.min900)

    // 5. 125% text at the minimum
    const dpr125 = await setScale(page, 1.25, base)
    readings.min900at125 = await measure(page)
    summary(`STEP 5 minimum 900x600 at 125% (dpr ${String(dpr125)})`, readings.min900at125)

    // 6. 125% text at the default window
    await resizeTo(app, page, 1280, 860)
    readings.defaultAt125 = await measure(page)
    summary('STEP 6 default window at 125%', readings.defaultAt125)

    // 6b. 150%, the top stop, at the minimum (the tightest a player can make it)
    await resizeTo(app, page, 900, 600)
    await setScale(page, 1.5, base)
    readings.min900at150 = await measure(page)
    summary('STEP 6b minimum 900x600 at 150%', readings.min900at150)

    await setScale(page, 1, base)
    await resizeTo(app, page, 1280, 860)
    record.readings = readings

    if (shown > 0) {
      const html = await page.evaluate((sel) => document.querySelector(sel)?.outerHTML ?? '', CARD)
      writeFileSync(join(OUT, `${STATE}-card.html`), html, 'utf8')

      // 7. the card survives a change of view and a reload until it is answered
      await page.click('[data-testid="nav-alerts"]', { timeout: 20_000 }).catch((e: unknown) => {
        console.log(`  nav click failed: ${String(e).slice(0, 200)}`)
      })
      await sleep(800)
      console.log(`\nSTEP 7 after opening Alerts: card count ${String(await countOf(page, CARD))}`)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForSelector('[data-testid="nav-alerts"]', { timeout: 60_000 })
      const afterReload = await settle(() => countOf(page, CARD), (n) => n > 0, { timeoutMs: 10_000 })
      console.log(`  after a window reload, before OK: card count ${String(afterReload)}`)
      record.beforeOkReload = afterReload

      // 8. OK, with the first-run notice (if any) still on screen
      const firstRun = await countOf(page, FIRST_RUN)
      console.log(`\nSTEP 8 first-run notice on screen while OK is pressed: ${String(firstRun)}`)
      const t0 = Date.now()
      let clickError = ''
      await page.click(OK, { timeout: 15_000 }).catch((e: unknown) => {
        clickError = String(e).slice(0, 300)
      })
      const gone = await settleGone(page, CARD, { timeoutMs: 8_000 })
      console.log(`  OK clicked (${clickError || 'no error'}), card gone: ${String(gone)} after ${String(Date.now() - t0)} ms`)
      const ipcAfter = await page.evaluate(() =>
        (window as unknown as { eq: { getSettingsRecoveryNotice: () => Promise<unknown> } }).eq.getSettingsRecoveryNotice()
      )
      console.log(`  main's notice after OK: ${JSON.stringify(ipcAfter)}`)
      console.log(`  first-run notice still on screen after OK: ${String(await countOf(page, FIRST_RUN))}`)
      record.ok = { clickError, gone, ipcAfter }

      // 9. it does not come back: another view, then a reload
      await page.click('[data-testid="nav-preferences"]', { timeout: 20_000 }).catch(() => undefined)
      await sleep(800)
      const afterNav = await countOf(page, CARD)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForSelector('[data-testid="nav-alerts"]', { timeout: 60_000 })
      await sleep(4_000)
      const afterReload2 = await countOf(page, CARD)
      console.log(`\nSTEP 9 after OK: card count on another view ${String(afterNav)}, after a reload ${String(afterReload2)}`)
      record.afterOk = { afterNav, afterReload: afterReload2 }
    }

    console.log(`\nconsole errors: ${String(consoleErrors.length)} ${consoleErrors.slice(0, 4).join(' | ').slice(0, 600)}`)
    record.consoleErrors = consoleErrors
  } finally {
    clearTimeout(bound)
    await close()
    writeFileSync(join(OUT, `${STATE}.json`), JSON.stringify(record, undefined, 2), 'utf8')
    // Second launch on the same userData would be step 10; the dir is kept for it when asked.
    if (process.env.PROBE_KEEP_USERDATA === '1') console.log(`kept userData: ${userData}`)
    else await removeUserData(userData)
    console.log('probe: app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
