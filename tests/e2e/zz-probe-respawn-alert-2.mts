// THROWAWAY PROBE 2 (key: respawn-alert): (1) a real firing of the pre-alert, (2) the shared-name
// switch inside the edit dialog, (3) the LAYOUT of the control and the dialog at four sizes:
// default, the app's minimum window (900x600), 125% text, and both together.
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, type FixtureLog } from './logFixture.mjs'
import {
  DIALOG,
  INPUT,
  OWN_MOB,
  SAVE,
  WIKI_MOB,
  answerNotice,
  bodyText,
  closeEditor,
  install,
  leaves,
  m,
  openEditor,
  resizeTo,
  rowSel,
  saveDisabled,
  say,
  setScale,
  storedAlert,
  view,
  windowBounds,
  type M
} from './zz-probe-respawn-alert-0.mjs'

interface Def {
  id: string
  name: string
  enabled: boolean
  trigger: { type: string; signal?: string }
  [k: string]: unknown
}
function listAlerts(page: Page): Promise<Def[]> {
  return page.evaluate(() => (window as unknown as { eq: { listAlerts: () => Promise<Def[]> } }).eq.listAlerts())
}
function saveAlert(page: Page, def: Def): Promise<unknown> {
  return page.evaluate((d) => (window as unknown as { eq: { saveAlert: (x: unknown) => Promise<unknown> } }).eq.saveAlert(d), def)
}
function deleteAlert(page: Page, id: string): Promise<unknown> {
  return page.evaluate((i) => (window as unknown as { eq: { deleteAlert: (x: string) => Promise<unknown> } }).eq.deleteAlert(i), id)
}
function spoken(page: Page): Promise<{ text: string; uttered: boolean }[]> {
  return page.evaluate(
    () => (window as unknown as { __eqSpeech?: { spoken: { text: string; uttered: boolean }[] } }).__eqSpeech?.spoken ?? []
  )
}
function watches(page: Page): Promise<unknown> {
  return page.evaluate(() => (window as unknown as { eq: { getRespawn: () => Promise<unknown> } }).eq.getRespawn())
}

async function gotoTimers(page: Page): Promise<void> {
  await page.click('[data-testid="nav-timers"]', { timeout: 30_000 })
  await settle(() => countOf(page, '[data-testid="timers-view"]'), (n) => n === 1, { timeoutMs: 30_000 })
  await sleep(900)
}
async function gotoAlerts(page: Page): Promise<void> {
  await page.click('[data-testid="nav-alerts"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="alerts-list"]', { timeout: 30_000 })
  await sleep(600)
}
/** Leave the Timers tab and come back: the control reads the alert list fresh when it mounts. */
async function remountTimers(page: Page): Promise<void> {
  await gotoAlerts(page)
  await gotoTimers(page)
}

function flags(g: M): string {
  const f: string[] = []
  if (g.sw > g.cw + 1) f.push(`SCROLLW ${String(g.sw)}>${String(g.cw)}`)
  if (g.sh > g.ch + 1) f.push(`SCROLLH ${String(g.sh)}>${String(g.ch)}`)
  if (g.outOfViewport) f.push('OUT-OF-VIEWPORT')
  if (g.clippedBy) f.push(`CLIPPED-BY ${g.clippedBy} visible ${String(g.visibleW)}x${String(g.visibleH)}`)
  if (g.hit !== 'self') f.push(`HIT=${g.hit}`)
  return f.join(' | ') || 'clean'
}

async function one(page: Page, tag: string, name: string, sel: string): Promise<M | null> {
  const got = await m(page, sel)
  if (got.length === 0) {
    say(tag, `${name}: ABSENT`)
    return null
  }
  const g = got[0]
  say(tag, `${name}: "${g.text.slice(0, 140)}" rect=${JSON.stringify(g.rect)} sw/cw=${String(g.sw)}/${String(g.cw)} sh/ch=${String(g.sh)}/${String(g.ch)} ws=${g.whiteSpace} to=${g.textOverflow} lh=${g.lineHeight} disabled=${String(g.disabled)} checked=${String(g.checked)} -> ${flags(g)}`)
  return g
}

function inter(a: M, b: M): [number, number] {
  const ox = Math.min(a.rect[0] + a.rect[2], b.rect[0] + b.rect[2]) - Math.max(a.rect[0], b.rect[0])
  const oy = Math.min(a.rect[1] + a.rect[3], b.rect[1] + b.rect[3]) - Math.max(a.rect[1], b.rect[1])
  return [Math.round(ox), Math.round(oy)]
}

/** The control row at one size, in one alert state. Compact: every part, then what collides. */
async function controlAt(page: Page, tag: string): Promise<void> {
  const v = await view(page)
  say(tag, `view ${String(v.innerWidth)}x${String(v.innerHeight)} dpr=${String(v.dpr)}`)
  const parts: [string, M | null][] = [
    ['scope switch', await one(page, tag, 'scope switch', '[data-testid="respawn-scope"]')],
    ['Clear all', await one(page, tag, 'Clear all', '[data-testid="respawn-clear-all"]')],
    ['box', await one(page, tag, 'box', '[data-testid="respawn-alert-on"]')],
    ['box label', await one(page, tag, 'box label', 'label:has([data-testid="respawn-alert-on"])')],
    ['seconds field', await one(page, tag, 'seconds field', '.MuiTextField-root:has([data-testid="respawn-alert-lead"])')],
    ['seconds input', await one(page, tag, 'seconds input', '[data-testid="respawn-alert-lead"]')],
    ['seconds label', await one(page, tag, 'seconds label', '.MuiTextField-root:has([data-testid="respawn-alert-lead"]) label')],
    ['note', await one(page, tag, 'note', '[data-testid="respawn-alert-silent"]')]
  ]
  await one(page, tag, 'timers-view (scroller)', '[data-testid="timers-view"]')
  const rowInfo = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="respawn-alert-on"]')
    const inner = box?.closest('label')?.parentElement as HTMLElement | null
    const outer = inner?.parentElement as HTMLElement | null
    const next = outer?.nextElementSibling as HTMLElement | null
    const ir = inner?.getBoundingClientRect()
    const or = outer?.getBoundingClientRect()
    const nr = next?.getBoundingClientRect()
    const view = document.querySelector('[data-testid="timers-view"]') as HTMLElement | null
    const vr = view?.getBoundingClientRect()
    return {
      inner: ir ? [Math.round(ir.left), Math.round(ir.top), Math.round(ir.width), Math.round(ir.height)] : null,
      innerScroll: inner ? `${String(inner.scrollWidth)}/${String(inner.clientWidth)}` : '',
      outer: or ? [Math.round(or.left), Math.round(or.top), Math.round(or.width), Math.round(or.height)] : null,
      outerScroll: outer ? `${String(outer.scrollWidth)}/${String(outer.clientWidth)}` : '',
      panelsTop: nr ? Math.round(nr.top) : null,
      viewBox: vr ? [Math.round(vr.left), Math.round(vr.top), Math.round(vr.width), Math.round(vr.height)] : null,
      viewScroll: view ? `w ${String(view.scrollWidth)}/${String(view.clientWidth)} h ${String(view.scrollHeight)}/${String(view.clientHeight)}` : ''
    }
  })
  say(tag, `rows: ${JSON.stringify(rowInfo)}`)
  // which of the row's own parts share pixels (box sits inside its label, input inside its field: skipped)
  const skip = new Set(['box|box label', 'seconds field|seconds input', 'seconds field|seconds label', 'seconds input|seconds label'])
  const hits: string[] = []
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const [an, a] = parts[i]
      const [bn, b] = parts[j]
      if (!a || !b || skip.has(`${an}|${bn}`)) continue
      const [ox, oy] = inter(a, b)
      if (ox > 1 && oy > 1) hits.push(`${an} x ${bn} ${String(ox)}x${String(oy)}px`)
    }
  }
  say(tag, hits.length ? `!! PARTS OVERLAP: ${hits.join(' ; ')}` : 'no two parts of the row overlap')
  // the note's own text lines
  const noteLines = await page.evaluate(() => {
    const n = document.querySelector('[data-testid="respawn-alert-silent"]')
    if (!n) return null
    const rg = document.createRange()
    rg.selectNodeContents(n)
    const rects = Array.from(rg.getClientRects())
    const tops = Array.from(new Set(rects.map((r) => Math.round(r.top))))
    return { lines: tops.length, right: Math.round(Math.max(...rects.map((r) => r.right))), bottom: Math.round(Math.max(...rects.map((r) => r.bottom))) }
  })
  say(tag, `note text lines: ${JSON.stringify(noteLines)}`)
}

/** The edit dialog at one size. Compact: words, the paper against the window, each control's reachability. */
async function dialogAt(page: Page, tag: string): Promise<void> {
  const v = await view(page)
  say(tag, `view ${String(v.innerWidth)}x${String(v.innerHeight)}; words: ${await bodyText(page, `${DIALOG} .MuiDialog-paper`)}`)
  await one(page, tag, 'paper', `${DIALOG} .MuiDialog-paper`)
  await one(page, tag, 'title', `${DIALOG} .MuiDialogTitle-root`)
  await one(page, tag, 'title caption', `${DIALOG} .MuiDialogTitle-root .MuiTypography-caption`)
  await one(page, tag, 'content', `${DIALOG} .MuiDialogContent-root`)
  await one(page, tag, 'actions', `${DIALOG} .MuiDialogActions-root`)
  const scroll = await page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLElement | null
    return c ? { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight, overflowY: getComputedStyle(c).overflowY } : null
  }, `${DIALOG} .MuiDialogContent-root`)
  say(tag, `content scroll ${JSON.stringify(scroll)}`)
  await one(page, tag, 'mob card', `${DIALOG} [data-testid="mob-hover-card"]`)
  await one(page, tag, 'wiki line', `${DIALOG} [data-testid="respawn-edit-wiki"]`)
  await one(page, tag, 'calculated', `${DIALOG} [data-testid="respawn-edit-calculated"]`)
  await one(page, tag, 'shared-name box', `${DIALOG} [data-testid="respawn-edit-shared-name"]`)
  await one(page, tag, 'input', INPUT)
  await one(page, tag, 'reading', `${DIALOG} [data-testid="respawn-edit-reading"]`)
  await one(page, tag, 'error', `${DIALOG} [data-testid="respawn-edit-error"]`)
  await one(page, tag, 'save note', `${DIALOG} [data-testid="respawn-edit-save-note"]`)
  await one(page, tag, 'Use calculated', `${DIALOG} [data-testid="respawn-edit-clear"]`)
  await one(page, tag, 'Close', `${DIALOG} [data-testid="respawn-edit-cancel"]`)
  await one(page, tag, 'Save', SAVE)
  const ls = (await leaves(page, `${DIALOG} .MuiDialog-paper`)) ?? []
  const probs: string[] = []
  ls.forEach((l) => {
    if (l.clip.startsWith('LEGEND') || l.tag === 'LABEL') return
    const visW = Math.max(0, l.x1 - l.x0)
    const visH = Math.max(0, l.y1 - l.y0)
    const rawW = l.raw[2] - l.raw[0]
    const rawH = l.raw[3] - l.raw[1]
    if (l.out) probs.push(`OUT-OF-VIEWPORT "${l.text}" raw=${JSON.stringify(l.raw)}`)
    if (visW < rawW - 1.5 || visH < rawH - 1.5) probs.push(`CUT "${l.text}" raw ${String(rawW)}x${String(rawH)} visible ${String(Math.round(visW))}x${String(Math.round(visH))} by ${l.clip}`)
    if (l.to === 'ellipsis' && l.sw > l.cw + 1) probs.push(`ELLIPSIS "${l.text}"`)
  })
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i]
      const b = ls[j]
      if (a.clip.startsWith('LEGEND') || b.clip.startsWith('LEGEND') || a.tag === 'LABEL' || b.tag === 'LABEL') continue
      if (a.tag === 'A' || b.tag === 'A') continue // the link is inside the wiki line it is measured against
      if (a.x1 - a.x0 <= 0 || a.y1 - a.y0 <= 0 || b.x1 - b.x0 <= 0 || b.y1 - b.y0 <= 0) continue
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
      if (ox > 1.5 && oy > 1.5) probs.push(`OVERLAP "${a.text}" x "${b.text}" ${String(Math.round(ox))}x${String(Math.round(oy))}px`)
    }
  }
  say(tag, `${String(ls.length)} leaves; ${probs.length ? `!! ${probs.join(' ;; ')}` : 'no leaf cut, off screen or overlapping (CUT by the content scroller means: scroll to read)'}`)
}

/** (1) A REAL FIRING: the box ticked, a learned 3m clock whose lead moment is about a minute away. */
async function stepRealFiring(page: Page, log: FixtureLog): Promise<void> {
  console.log('\n=== 1. a real firing of the pre-alert ===')
  await page.click('[data-testid="respawn-alert-on"] input', { timeout: 10_000, force: true })
  await sleep(600)
  say('1', `box ticked, stored=${JSON.stringify(await storedAlert(page))}`)
  const now = Date.now()
  // The learned gap is 3m. The newer death is stamped 3m - 75s ago: due in 75 s, lead moment in 55 s.
  const newer = new Date(now - (180_000 - 75_000))
  const older = new Date(newer.getTime() - 180_000)
  log.append(`You have slain ${WIKI_MOB}!`)
  log.appendAt(older, `You have slain ${OWN_MOB}!`)
  log.appendAt(newer, `You have slain ${OWN_MOB}!`)
  for (const mob of [WIKI_MOB, OWN_MOB]) {
    const cand = `[data-testid="respawn-candidate"][data-respawn-mob="${mob}"] [data-testid="respawn-watch"]`
    await settle(() => countOf(page, cand), (n) => n === 1, { timeoutMs: 30_000 })
    await page.click(cand, { timeout: 15_000 })
    await page.mouse.move(0, 0)
    await settle(() => countOf(page, rowSel(mob)), (n) => n === 1, { timeoutMs: 30_000 })
  }
  say('1', `watched after ${String(Date.now() - now)} ms; row: ${await bodyText(page, rowSel(OWN_MOB))}`)
  const before = (await spoken(page)).length
  const t0 = Date.now()
  const after = await settle(() => spoken(page), (all) => all.length > before, { timeoutMs: 80_000, pollMs: 500 })
  const fired = after.slice(before)
  say('1', `speech ring ${String(before)} -> ${String(after.length)} after ${String(Math.round((Date.now() - now) / 1000))} s from the stamp (waited ${String(Math.round((Date.now() - t0) / 1000))} s): ${JSON.stringify(fired)}`)
  say('1', `row at that moment: ${await bodyText(page, rowSel(OWN_MOB))}`)
  await sleep(4000)
  say('1', `4 s later the ring holds ${String((await spoken(page)).length)} utterance(s) (a clock fires once)`)
  await gotoAlerts(page)
  const hist = await page.evaluate(() => {
    const row = document.querySelector('[data-alert-id="respawn-soon"]')
    return row ? Array.from(row.querySelectorAll('button[aria-label^="Recent fires"]')).map((b) => b.getAttribute('aria-label')) : null
  })
  say('1', `Alerts tab, seeded row history button: ${JSON.stringify(hist)}`)
  await page.click('[data-alert-id="respawn-soon"] button[aria-label^="Recent fires"]').catch(() => undefined)
  await sleep(700)
  say('1', `seeded row with its history open: ${await bodyText(page, '[data-alert-id="respawn-soon"]')}`)
  await page.click('[data-alert-id="respawn-soon"] button[aria-label^="Recent fires"]').catch(() => undefined)
  await gotoTimers(page)
}

/** (2) THE SHARED-NAME SWITCH: does it take, and what does the dialog say once it has? */
async function stepSharedName(page: Page): Promise<void> {
  console.log('\n=== 2. the shared-name switch on a learned 3m row ===')
  await openEditor(page, OWN_MOB)
  const BOX = `${DIALOG} [data-testid="respawn-edit-shared-name"] input`
  const checked = (): Promise<boolean> => page.evaluate((s) => (document.querySelector(s) as HTMLInputElement | null)?.checked === true, BOX)
  say('2', `before: checked=${String(await checked())} watches=${JSON.stringify(await watches(page))}`)
  await page.click(`${DIALOG} label:has([data-testid="respawn-edit-shared-name"])`, { timeout: 10_000 })
  const t0 = Date.now()
  const took = await settle(checked, (c) => c, { timeoutMs: 12_000, pollMs: 200 })
  say('2', `clicked the label: checked=${String(took)} after ${String(Date.now() - t0)} ms; watches=${JSON.stringify(await watches(page))}`)
  await sleep(1200)
  say('2', `dialog now: ${await bodyText(page, `${DIALOG} .MuiDialog-paper`)}`)
  say('2', `prefill="${await page.inputValue(INPUT)}" Save=${await saveDisabled(page)}`)
  await one(page, '2', 'reading', `${DIALOG} [data-testid="respawn-edit-reading"]`)
  await one(page, '2', 'save note', `${DIALOG} [data-testid="respawn-edit-save-note"]`)
  say('2', `row behind the dialog: ${await bodyText(page, rowSel(OWN_MOB))}`)
  // back
  if (await checked()) {
    await page.click(`${DIALOG} label:has([data-testid="respawn-edit-shared-name"])`, { timeout: 10_000 })
    const back = await settle(checked, (c) => !c, { timeoutMs: 12_000, pollMs: 200 })
    say('2', `unticked: checked=${String(back)}; dialog title: ${await bodyText(page, `${DIALOG} .MuiDialogTitle-root`)} prefill="${await page.inputValue(INPUT)}"`)
  }
  await closeEditor(page, 'cancel')
}

/** (3) one size: the control in its three alert states, then the dialog on a learned, a wiki and a typed row. */
async function stepSize(page: Page, size: string, seeded: Def): Promise<void> {
  console.log(`\n=== 3. LAYOUT at ${size} ===`)
  // the alert present and on: no note
  await saveAlert(page, { ...seeded, enabled: true })
  await remountTimers(page)
  await controlAt(page, `${size} | control, alert on`)
  // tooltip of the box
  await page.hover('label:has([data-testid="respawn-alert-on"])')
  await settle(() => countOf(page, '[role="tooltip"]'), (n) => n > 0, { timeoutMs: 5_000 })
  await sleep(400)
  await one(page, `${size} | control`, 'box tooltip', '[role="tooltip"]')
  await page.mouse.move(0, 0)
  await sleep(500)
  // switched off
  await saveAlert(page, { ...seeded, enabled: false })
  await remountTimers(page)
  await controlAt(page, `${size} | control, alert OFF`)
  // missing
  await deleteAlert(page, seeded.id)
  await remountTimers(page)
  await controlAt(page, `${size} | control, alert MISSING`)
  // the rows under it, with the tallest control state above them
  for (const mob of [OWN_MOB, WIKI_MOB]) {
    await one(page, `${size} | row`, `${mob} row`, rowSel(mob))
    await one(page, `${size} | row`, `${mob} duration unit`, `${rowSel(mob)} [data-testid="respawn-duration"]`)
    await one(page, `${size} | row`, `${mob} edit icon`, `${rowSel(mob)} [data-testid="respawn-edit"]`)
  }
  await saveAlert(page, { ...seeded, enabled: true })

  // the dialog: learned
  say(`${size} | dialog`, `learned opened=${String(await openEditor(page, OWN_MOB))}`)
  await dialogAt(page, `${size} | dialog LEARNED untouched`)
  await page.fill(INPUT, 'banana')
  await sleep(300)
  await one(page, `${size} | dialog LEARNED typed banana`, 'error', `${DIALOG} [data-testid="respawn-edit-error"]`)
  await one(page, `${size} | dialog LEARNED typed banana`, 'Save', SAVE)
  await page.fill(INPUT, '')
  await sleep(300)
  await one(page, `${size} | dialog LEARNED emptied`, 'help', `${DIALOG} [data-testid="respawn-edit-reading"]`)
  await one(page, `${size} | dialog LEARNED emptied`, 'save note', `${DIALOG} [data-testid="respawn-edit-save-note"]`)
  await one(page, `${size} | dialog LEARNED emptied`, 'Save', SAVE)
  await closeEditor(page, 'cancel')
  // wiki
  say(`${size} | dialog`, `wiki opened=${String(await openEditor(page, WIKI_MOB))}`)
  await dialogAt(page, `${size} | dialog WIKI untouched`)
  await page.fill(INPUT, '12m')
  await sleep(300)
  say(`${size} | dialog`, `typed 12m: Save=${await saveDisabled(page)}`)
  await one(page, `${size} | dialog WIKI typed 12m`, 'Save', SAVE)
  await closeEditor(page, 'save')
  await settle(() => page.evaluate((s) => document.querySelector(s)?.getAttribute('data-respawn-source') ?? '', rowSel(WIKI_MOB)), (x) => x === 'custom', { timeoutMs: 20_000 })
  await one(page, `${size} | row`, 'typed row', rowSel(WIKI_MOB))
  await one(page, `${size} | row`, 'typed duration unit', `${rowSel(WIKI_MOB)} [data-testid="respawn-duration"]`)
  // typed
  say(`${size} | dialog`, `typed opened=${String(await openEditor(page, WIKI_MOB))}`)
  await dialogAt(page, `${size} | dialog TYPED untouched`)
  await closeEditor(page, 'clear')
  await settle(() => page.evaluate((s) => document.querySelector(s)?.getAttribute('data-respawn-source') ?? '', rowSel(WIKI_MOB)), (x) => x === 'wiki', { timeoutMs: 20_000 })
}

/** (4) the player's OWN alert on the signal, under another name, switched off: what the note calls it. */
async function stepOwnAlert(page: Page, seeded: Def): Promise<void> {
  console.log('\n=== 4. the note when the alert on the signal is the player\'s own, under another name ===')
  await deleteAlert(page, seeded.id)
  const own: Def = { ...seeded, id: 'probe-own-respawn', name: 'Camp is about to pop', enabled: false }
  delete own.note
  await saveAlert(page, own)
  await remountTimers(page)
  say('4', `alerts on the signal: ${JSON.stringify((await listAlerts(page)).filter((d) => d.trigger.signal === 'respawnSoon').map((d) => ({ id: d.id, name: d.name, enabled: d.enabled })))}`)
  await one(page, '4 own alert "Camp is about to pop" OFF', 'note', '[data-testid="respawn-alert-silent"]')
  await saveAlert(page, { ...own, enabled: true })
  await remountTimers(page)
  await one(page, '4 own alert "Camp is about to pop" ON', 'note', '[data-testid="respawn-alert-silent"]')
  // the RENAMED seeded alert, switched off
  await deleteAlert(page, own.id)
  await saveAlert(page, { ...seeded, name: 'Mob soon', enabled: false })
  await remountTimers(page)
  await one(page, '4 seeded alert renamed "Mob soon", OFF', 'note', '[data-testid="respawn-alert-silent"]')
  await saveAlert(page, { ...seeded, enabled: true })
  // does the note leave by itself when the alert comes back, without leaving the tab? (it is told of changes made in THIS window's Alerts tab only)
  await remountTimers(page)
  say('4', `seeded alert restored: note count=${String(await countOf(page, '[data-testid="respawn-alert-silent"]'))}`)
}

async function run(app: ElectronApplication, page: Page, log: FixtureLog): Promise<void> {
  await gotoTimers(page)
  await stepRealFiring(page, log)
  await stepSharedName(page)
  const seeded = (await listAlerts(page)).find((d) => d.id === 'respawn-soon')
  if (!seeded) {
    say('setup', 'NO SEEDED ALERT in the store: cannot stage the note states')
    return
  }
  const wide = await windowBounds(app, page)
  await stepSize(page, `default ${String(wide.width)}x${String(wide.height)} 100%`, seeded)
  await resizeTo(app, page, 900, 600)
  await stepSize(page, 'minimum 900x600 100%', seeded)
  await setScale(page, 1.25)
  await stepSize(page, 'minimum 900x600 125%', seeded)
  await resizeTo(app, page, wide.width, wide.height)
  await stepSize(page, `default ${String(wide.width)}x${String(wide.height)} 125%`, seeded)
  await setScale(page, 1)
  await stepOwnAlert(page, seeded)
}

async function main(): Promise<void> {
  buildIfStale()
  const launched = await launchOnFixture('e2e-leveling.log')
  const killer = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void launched.close().finally(() => process.exit(2))
  }, 8.5 * 60_000)
  try {
    const page = await mainWindow(launched.app)
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await install(page)
    await answerNotice(page)
    await run(launched.app, page, launched.log)
    say('errors', `renderer console errors: ${String(errors.length)} ${errors.slice(0, 5).join(' | ')}`)
  } catch (err) {
    console.log(`PROBE ERROR: ${String(err)}`)
    process.exitCode = 1
  } finally {
    clearTimeout(killer)
    await launched.close()
    console.log('app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error -', err)
  process.exitCode = 1
})
