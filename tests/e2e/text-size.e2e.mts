/**
 * Headless Electron integration test for PREFERENCES → APPEARANCE (JOS-123, JOS-405, JOS-407,
 * reshaped by JOS-408).
 *
 * WHY IT IS AN E2E SPEC AND NOT A UNIT TEST. `tests/uiScale.test.mts` pins the ladder, the
 * normalizer, the stepper's rungs, its disabled ends and the wiring as source, and
 * `tests/navMenu.test.mts` the left menu's ladders and their greyed ends (since 2026-11-27 this
 * spec no longer walks either ladder to its ends: owner, e2e proves wiring). Every remaining claim
 * is about a WINDOW:
 *
 *   1. "the control makes the app bigger" is a claim about a real webContents. The store write, the
 *      IPC handler and the `setZoomFactor` call could all be perfect and the window still not move;
 *      the only honest evidence is the page measuring itself before and after.
 *   2. "it persists across launches, and is applied at startup" is a claim about a SECOND boot
 *      reading a file the first one wrote, so this spec runs two launches over one userData dir —
 *      the telemetry-restart pattern. A reload would prove nothing: the zoom is already on that
 *      webContents.
 *   3. "…before the first paint" is the half no test can watch directly (there is no frame to
 *      inspect in a window that is never shown). What IS assertable is that the window is already
 *      at the stored size the first time the renderer can be asked at all, with nothing in this
 *      spec having touched it — which is what a `webPreferences.zoomFactor` build gives and what a
 *      post-load zoom would not. The construction itself is pinned as source next door.
 *
 * SINCE JOS-408 THE SECTION IS CALLED APPEARANCE AND IS TWO CARDS: this window's text size as an
 * A− / A+ over the same five-stop ladder, and ONE Overlays card whose single Independent switch
 * governs both the overlays' text size and their transparency. The overlay steps live in
 * ./overlaysAppearanceSteps.mts — one module for one card, folded together the way the two cards
 * were — and they belong to an e2e for a reason on top of the three above: they are claims about
 * SEPARATE RENDERER PROCESSES agreeing, which no assertion in one process can make. Between the two
 * sits the Left menu card (fork #10): the drawer's own text size and row height, `stepNavMenu`.
 *
 * The main window's measurement is `window.devicePixelRatio`, which Chromium reports as the
 * display's own scale multiplied by this webContents' zoom factor. Absolute values are a fact about
 * whatever machine this ran on, so every assertion here is a RATIO against the same window's
 * reading at 100%.
 *
 * Run: `npm run test:e2e -- text-size`
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countOf,
  dumpArtifacts,
  failures,
  note,
  reportRun,
  settle
} from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
// THE OVERLAYS' appearance (JOS-405, JOS-407, JOS-408) — the same Preferences section, but every
// claim about it spans two renderer processes, so the steps live in their own module beside the
// harness ones.
import {
  openTwoMeters,
  stepClosedTag,
  stepIndependentRow,
  stepIndependentShape,
  stepPinnedMeterFollows,
  stepRowFollowsWindow,
  stepSharedAlphaAppliesLive,
  stepSharedSizeAppliesLive,
  stepSurvivesTheSwitch,
  stepSyncedShape,
  stepWindowMovesShared
} from './overlaysAppearanceSteps.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { UI_SCALE_DEFAULT, uiScalePercent } from '../../src/shared/uiScale'
import {
  NAV_ROW_DEFAULT,
  NAV_ROW_STEPS,
  NAV_TEXT_DEFAULT,
  NAV_TEXT_STEPS,
  navPx
} from '../../src/shared/navMenu'

const RAIL = '[data-testid="prefs-rail-textsize"]'
const PANE = '[data-testid="pref-text-size"]'
const NOTE = '[data-testid="pref-text-size-note"]'
const VALUE = '[data-testid="pref-text-size-value"]'
const MINUS = '[data-testid="pref-text-size-minus"]'
const PLUS = '[data-testid="pref-text-size-plus"]'

/** The stop this spec chooses. A middle rung on purpose: an end would also pass a control that
 *  could only ever go to its own limit. It is TWO presses of A+ from the default, because the
 *  stepper walks the ladder's own rungs (100 → 110 → 125) rather than adding a fixed amount. */
const CHOSEN = 1.25
const PRESSES_TO_CHOSEN = 2
/** Floating point through a ratio of two measured pixel ratios; a stop is 0.1 away from its
 *  neighbour, so this is tight enough to tell them apart by an order of magnitude. */
const TOLERANCE = 0.005

/** What the page can say about how big it is being drawn. */
interface Zoom {
  /** display scale x zoom factor. Independent of the window's size, which is why it leads. */
  dpr: number
  /** CSS pixels across the window: shrinks as the zoom grows, at a fixed window size. */
  innerWidth: number
}

function zoomOf(page: Page): Promise<Zoom> {
  return page.evaluate(() => ({ dpr: window.devicePixelRatio, innerWidth: window.innerWidth }))
}

function storedScale(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as unknown as { eq: { getUiScale: () => Promise<number> } }).eq.getUiScale()
  )
}

/** What the stepper is printing. The five buttons became one readout in JOS-408, so "which stop is
 *  chosen" is a string rather than an `aria-pressed` scan. */
function shownScale(page: Page): Promise<string> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText.trim() ?? '',
    VALUE
  )
}

/** Whether one of the stepper's ends is disabled, as the DOM states it. */
function isDisabled(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as HTMLButtonElement | null)?.disabled === true,
    selector
  )
}

/** Press one end N times, waiting for the readout to settle after each — the size applies over IPC
 *  and a press sent into a value that has not landed yet would step from the old rung. */
async function press(page: Page, selector: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    const before = await shownScale(page)
    await page.click(selector, { timeout: 15_000 })
    await settle(() => shownScale(page), (v) => v !== before, { timeoutMs: 15_000 }).catch(() => before)
  }
}

async function openAppearance(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.click(RAIL, { timeout: 15_000 })
  await page.waitForSelector(PANE, { timeout: 15_000 })
}

/** The card itself: ONE stepper, the stored rung printed, and the sentence that says this control
 *  is about the app window and the overlays are below. */
async function stepCard(page: Page): Promise<void> {
  check('Preferences → Appearance has an in-app text size', (await countOf(page, PANE)) === 1)
  // The rail row's name and the card being ONE stepper are source facts, pinned in
  // tests/uiScale.test.mts (2026-11-27: e2e proves wiring, not what a component is built from).
  const shown = await shownScale(page)
  check(
    'a fresh install prints 100% — the default is unchanged for everybody who never chose',
    shown === uiScalePercent(UI_SCALE_DEFAULT),
    shown || 'nothing printed'
  )
  const text = (await page.evaluate(
    (sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText ?? '',
    NOTE
  ))
    .replace(/\s+/g, ' ')
    .trim()
  // JOS-408 NARROWED WHAT THIS SENTENCE CLAIMS. It used to say "the whole window"; the owner asked
  // for it to be about the app itself, with the overlays named as the card below rather than as a
  // footnote on this one.
  check(
    '…and the caption says this is the app window only, with the overlays below',
    /app window/i.test(text) && /overlays/i.test(text),
    text.slice(0, 160)
  )
}

// ---- the left menu's own sizes (fork #10) ----

const navSel = (id: string): string => `[data-testid="${id}"]`

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText.trim() ?? '',
    selector
  )
}

/** The drawn height of one destination row, in CSS px. */
function navRowHeight(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelector('[data-testid="nav-combat"]')?.getBoundingClientRect().height ?? 0
  )
}

/** Press one end of a left-menu stepper until it prints `stop` or disables; hands back what it prints. */
async function pressNav(page: Page, stepper: string, end: 'minus' | 'plus', stop: number): Promise<string> {
  const button = navSel(`${stepper}-${end}`)
  const value = navSel(`${stepper}-value`)
  let shown = await textOf(page, value)
  for (let i = 0; i < 8 && shown !== navPx(stop) && !(await isDisabled(page, button)); i++) {
    const before = shown
    await page.click(button, { timeout: 15_000 })
    shown = await settle(() => textOf(page, value), (v) => v !== before, { timeoutMs: 15_000 })
  }
  return shown
}

/**
 * The drawer rows that do not fit: wider than their box, a label outside its row, or a one-line
 * row taller than `rowPx` (a wrapped label grows the row, it does not clip). Headings are skipped;
 * the two-line feedback row is checked for fit, not for height.
 */
function navMisfits(page: Page, rowPx: number): Promise<string[]> {
  return page.evaluate((want) => {
    const bad: string[] = []
    for (const row of document.querySelectorAll<HTMLElement>('.MuiDrawer-paper [data-testid^="nav-"]')) {
      const id = row.getAttribute('data-testid') ?? ''
      const label = row.querySelector('.MuiListItemText-root')
      if (id.startsWith('nav-group-') || !label) continue
      const r = row.getBoundingClientRect()
      const l = label.getBoundingClientRect()
      const inside =
        l.top >= r.top - 0.5 && l.bottom <= r.bottom + 0.5 && l.left >= r.left - 0.5 && l.right <= r.right + 0.5
      const tall = id !== 'nav-feedback' && Math.abs(r.height - want) >= 0.5
      if (row.scrollWidth > row.clientWidth || !inside || tall) bad.push(`${id} ${String(r.height)}px`)
    }
    return bad
  }, rowPx)
}

/**
 * THE LEFT MENU'S OWN TEXT SIZE AND ROW HEIGHT (fork #10). The claim is a DRAWN height: the pixel
 * figures behind the ladders were computed from MUI's sources, and only a rendered row proves the
 * sx rules outrank MUI's own. It leaves both values at their defaults for the steps after it.
 */
async function stepNavMenu(page: Page): Promise<void> {
  const rowMin = Math.min(...NAV_ROW_STEPS)
  const rowMax = Math.max(...NAV_ROW_STEPS)
  const near = (px: number) => (h: number): boolean => Math.abs(h - px) < 0.5
  const drawn = (px: number): Promise<number> => settle(() => navRowHeight(page), near(px), { timeoutMs: 15_000 })

  const fresh = await drawn(NAV_ROW_DEFAULT)
  check(`a fresh install draws a menu row ${navPx(NAV_ROW_DEFAULT)} tall`, near(NAV_ROW_DEFAULT)(fresh), `${String(fresh)}px`)
  const shown = await textOf(page, navSel('pref-nav-row-value'))
  check('…and the Left menu card prints it', shown === navPx(NAV_ROW_DEFAULT), shown || 'nothing printed')
  // The shipped menu, every group open, fits the default window. Measured here because a new tab
  // adds a row: the day one does not fit, this says so (32px rows ran 21px over with Skills).
  const fit = await page.evaluate(() => {
    const paper = document.querySelector<HTMLElement>('.MuiDrawer-paper')
    return paper === null ? null : { drawer: paper.clientHeight, menu: paper.scrollHeight }
  })
  check('…and at that height the open menu fits the default window, with no scrollbar', fit !== null && fit.menu <= fit.drawer, JSON.stringify(fit))

  // Which button greys at which stop is `navStepEnds`, pinned in tests/navMenu.test.mts; what only
  // a window shows is the DRAWN row height and the fit.
  await pressNav(page, 'pref-nav-row', 'minus', rowMin)
  const short = await drawn(rowMin)
  check(`minus draws the rows ${navPx(rowMin)} tall at once, with no relaunch`, near(rowMin)(short), `${String(short)}px`)

  await pressNav(page, 'pref-nav-row', 'plus', rowMax)
  const tall = await drawn(rowMax)
  check(`plus walks the ladder up to ${navPx(rowMax)} rows`, near(rowMax)(tall), `${String(tall)}px`)

  // The largest text, in the tallest rows and then the shortest: the two fits that could fail.
  const textTop = Math.max(...NAV_TEXT_STEPS)
  const topText = await pressNav(page, 'pref-nav-text', 'plus', textTop)
  check('the text size walks up to its top stop', topText === navPx(textTop), topText)
  const wide = await navMisfits(page, rowMax)
  check('at the largest text no menu row overflows or wraps', wide.length === 0, wide.join(', '))
  await pressNav(page, 'pref-nav-row', 'minus', rowMin)
  await drawn(rowMin)
  const tight = await navMisfits(page, rowMin)
  check('…nor in the shortest rows, where the label has the least room', tight.length === 0, tight.join(', '))

  // THE KEYBOARD STAYS IN THE STEPPER (screen pass, 2026-11-19). The rows are at their shortest
  // here. Enter on plus all the way up used to drop focus to the page body on the press that
  // reached the top, where plus disables itself: Enter then did nothing and Tab began again.
  const focusOn = (): Promise<string> => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '')
  await page.focus(navSel('pref-nav-row-plus'))
  for (let i = 0; i < NAV_ROW_STEPS.length - 1; i++) await page.keyboard.press('Enter')
  const top = await settle(() => textOf(page, navSel('pref-nav-row-value')), (v) => v === navPx(rowMax), { timeoutMs: 10_000 })
  const held = await settle(focusOn, (t) => t === 'pref-nav-row-minus', { timeoutMs: 5_000 })
  check('Enter on plus up to the top stop hands the keyboard to minus, not to the page', top === navPx(rowMax) && held === 'pref-nav-row-minus', `${top}, focus on ${held}`)
  await page.keyboard.press('Enter')
  const stepped = await settle(() => textOf(page, navSel('pref-nav-row-value')), (v) => v !== navPx(rowMax), { timeoutMs: 5_000 })
  check('…and Enter there steps the rows back down', stepped !== navPx(rowMax), stepped)
  await pressNav(page, 'pref-nav-row', 'minus', rowMin)

  // Home again, so the launches after this one start from the shipped menu.
  const text = await pressNav(page, 'pref-nav-text', 'minus', NAV_TEXT_DEFAULT)
  const row = await pressNav(page, 'pref-nav-row', 'plus', NAV_ROW_DEFAULT)
  check('both step back to their defaults', text === navPx(NAV_TEXT_DEFAULT) && row === navPx(NAV_ROW_DEFAULT), `${text} / ${row}`)
}

/** THE ASSERTION THE TICKET IS ABOUT: pressing A+ makes this window bigger, now. */
async function stepBiggerNow(page: Page, base: Zoom): Promise<void> {
  await press(page, PLUS, PRESSES_TO_CHOSEN)
  const after = await settle(
    () => zoomOf(page),
    (z) => Math.abs(z.dpr / base.dpr - CHOSEN) < TOLERANCE,
    { timeoutMs: 15_000 }
  )
  check(
    `two presses of A+ walk the ladder to ${uiScalePercent(CHOSEN)} and draw the window that much bigger, without a relaunch`,
    Math.abs(after.dpr / base.dpr - CHOSEN) < TOLERANCE,
    `devicePixelRatio ${String(base.dpr)} -> ${String(after.dpr)}`
  )
  check(
    '…which is a LAYOUT change, not a font swap: the same window now holds fewer CSS pixels',
    after.innerWidth < base.innerWidth,
    `${String(base.innerWidth)} -> ${String(after.innerWidth)} CSS px`
  )
  const stored = await storedScale(page)
  check('…and the stored answer is the RUNG, never a value between two of them', stored === CHOSEN, String(stored))
  const shown = await shownScale(page)
  check('…with the stepper printing it', shown === uiScalePercent(CHOSEN), shown || 'nothing printed')
}

/** The second launch: the size is already on before this spec touches anything. */
async function stepPersisted(page: Page, base: Zoom): Promise<void> {
  const arrived = await zoomOf(page)
  check(
    'a relaunch comes up ALREADY at the chosen size — nothing in this spec has clicked yet',
    Math.abs(arrived.dpr / base.dpr - CHOSEN) < TOLERANCE,
    `devicePixelRatio ${String(base.dpr)} at 100% -> ${String(arrived.dpr)} on arrival`
  )
  const stored = await storedScale(page)
  check('…because the choice outlived the process that made it', stored === CHOSEN, String(stored))
  await openAppearance(page)
  // NO SETTLE NEEDED SINCE JOS-340, and this is where that fix is most visible: the card seeds from
  // the pane's hydration snapshot, so the stored rung is what it prints on its FIRST frame. The
  // wait is only for the pane to exist at all.
  const shown = await settle(() => shownScale(page), (v) => v !== '', { timeoutMs: 15_000 })
  check('…and Preferences agrees with the window it is drawn in', shown === uiScalePercent(CHOSEN), shown || 'nothing printed')
}

/**
 * A RELOAD KEEPS THE SIZE — the assertion that decides whether main needs a `did-finish-load`
 * listener re-stating the zoom, and the reason it does not have one.
 *
 * Chromium keeps a zoom LEVEL per origin, so "a reload resets it" is a plausible enough worry that
 * the first cut of this feature carried a re-apply against it. Measured here instead. (The
 * re-apply was also not free — a post-load setZoomFactor wedged Playwright's stability check in a
 * never-composited window and took loadout-override.e2e.mts from green to a hard timeout.)
 */
async function stepSurvivesReload(page: Page, base: Zoom): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('[data-testid="nav-preferences"]', { timeout: 60_000 })
  const after = await zoomOf(page)
  check(
    'a reload keeps the size, with nothing in main re-stating it',
    Math.abs(after.dpr / base.dpr - CHOSEN) < TOLERANCE,
    `devicePixelRatio ${String(base.dpr)} at 100% -> ${String(after.dpr)} after reload`
  )
}

/**
 * THE WAY BACK, through A−: two presses from the chosen 125% to 100%.
 *
 * THE LADDER WALK TO BOTH ENDS WAS REMOVED (2026-11-27). Which rung a press lands on, that the ends
 * are fixed points, and that the card disables a button only at a clamp are `stepUiScale` and the
 * card's source, pinned in tests/uiScale.test.mts; and launch 1 already proved a press reaches the
 * window. What stays is A− reaching the window and the store, the direction launch 1 never pressed.
 */
async function stepBackTo100(page: Page, base: Zoom): Promise<void> {
  await press(page, MINUS, PRESSES_TO_CHOSEN)
  const back = await settle(
    () => zoomOf(page),
    (z) => Math.abs(z.dpr - base.dpr) < TOLERANCE,
    { timeoutMs: 15_000 }
  )
  check(
    'stepping back to 100% puts the window exactly where it started',
    Math.abs(back.dpr - base.dpr) < TOLERANCE,
    `devicePixelRatio ${String(base.dpr)} -> ${String(back.dpr)}`
  )
  const stored = await storedScale(page)
  check('…and stores it, so the next launch is ordinary again', stored === UI_SCALE_DEFAULT, String(stored))
}

/**
 * THE OVERLAYS CARD, in the order the ticket's confusion audit walks it: the synced shape, the
 * shared controls working in both directions, the pinned meter, then the switch and the twelve
 * rows, then back through the switch to prove nothing was lost.
 */
async function overlaySteps(page: Page, fight: Page, overall: Page): Promise<void> {
  await stepSyncedShape(page)
  await stepSharedSizeAppliesLive(page, fight, overall)
  await stepSharedAlphaAppliesLive(page, fight, overall)
  await stepWindowMovesShared(page, fight, overall)
  await stepPinnedMeterFollows(page, fight)

  await stepIndependentShape(page)
  await stepClosedTag(page)
  await stepIndependentRow(page, fight, overall)
  const remembered = await stepRowFollowsWindow(page, fight)
  await stepSurvivesTheSwitch(page, fight, overall, remembered)
}

async function main(): Promise<void> {
  buildIfStale()
  const consoleErrors: string[] = []
  const watch = (page: Page): void => {
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
  }

  // ONE dir for both launches, because the assertion between them is that it OUTLIVES the process
  // — the one thing a per-launch dir must not do by itself. And ONE staged log, so the two boots
  // are comparable in everything except the setting under test.
  const userData = makeUserData()
  const log = stageFixture('e2e-telemetry.log')

  /** The window's own reading at 100%, taken in launch 1 and compared against in launch 2. It is
   *  a fact about this display, so it can only come from this display. */
  let base: Zoom = { dpr: 1, innerWidth: 0 }

  console.log('launch 1: hidden Electron (EQ_E2E=1), fresh userData — the control and the press…')
  const first = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(first.app)
    watch(page)
    await openAppearance(page)
    await stepCard(page)
    // Before any zoom: the menu's row heights are read at 100%.
    await stepNavMenu(page)
    base = await zoomOf(page)
    check('the window reports a usable baseline to measure against', base.dpr > 0 && base.innerWidth > 0, JSON.stringify(base))
    await stepBiggerNow(page, base)
    if (failures.length) await dumpArtifacts(page, 'text-size-FAIL-first')
  } finally {
    await first.close()
  }

  console.log('launch 2: same userData — does the size survive a restart…')
  const second = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(second.app)
    watch(page)
    await stepPersisted(page, base)
    // The reload lands between the two on purpose: it needs a window that is already at the
    // chosen size, and it puts the view back to the app's default, so the steps after it re-open
    // the section like any arriving user would.
    await stepSurvivesReload(page, base)
    await openAppearance(page)
    // Home first: everything below runs at 100%, which is where the overlay steps' own clicking is
    // most reliable and where a reader of a failure screenshot expects to be.
    await stepBackTo100(page, base)

    // ---- THE OTHER HALF OF APPEARANCE (JOS-405, JOS-407, folded by JOS-408) ----
    // Every claim about the Overlays card is a claim about two renderer processes agreeing — see
    // tests/e2e/overlaysAppearanceSteps.mts for why none of it can be a unit test. It runs in this
    // launch because it needs a window whose Preferences pane is already open, and it leaves the
    // meters open for the teardown to close.
    const meters = await openTwoMeters(second.app, page)
    if (meters) await overlaySteps(page, meters[0], meters[1])
    if (failures.length) await dumpArtifacts(page, 'text-size-FAIL-restart')
  } finally {
    await second.close()
    await removeUserData(userData)
    await log.dispose()
  }

  // A missing IPC handler shows up here first (`invoke` rejects into an unhandled rejection).
  check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  if (consoleErrors.length === 0) {
    note('two real launches over one userData dir — the persistence claim is a restart, not a reload')
  }

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})
