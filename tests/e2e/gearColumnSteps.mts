/**
 * The Gear tab's COLUMN PICKER, its configurable filter bar, and the width law that holds when a
 * chosen set is wider than the pane (JOS-297). A module rather than more of `gear.e2e.mts`, the
 * `gearSetSteps.mts` precedent: everything these steps need is already standing in the host spec,
 * and that file is at the repo's 400-code-line factoring ceiling.
 *
 * WHAT NEEDS A REAL APP HERE, given `tests/gearColumnPrefs.test.mts` owns the model without a DOM:
 *
 *   * THE WIDTH. `gearTableLayout` states pixels past ten columns and the table states a minimum —
 *     but whether that produces a scrollbar INSIDE the list box or a page that slides sideways is a
 *     fact about `tableLayout: fixed`, a flex row with `minWidth: 0`, and a real Chromium. No unit
 *     test can see it. This spec measures all three boxes in one breath: the list overflows, the
 *     document does not, the content area does not.
 *   * THE FIXED-HEIGHT CONTRACT. The windowing hook's every index assumes each row is exactly
 *     `ROW_HEIGHT`, and eighteen columns is precisely the situation in which a cell would wrap and
 *     desync it. So the rows are MEASURED, not trusted.
 *   * WHAT IT NO LONGER ASSERTS (owner, 2026-11-27: e2e proves wiring, unit tests prove values):
 *     a picked column's sort order and absent-last rule (`tests/gearColumnPrefs.test.mts`, 'every
 *     exposed key ranks BOTH ways, and an absent value sorts LAST either way'); the numbers re-read
 *     beside the picked columns (the host spec's upgrade step reads the same cells at the same plus);
 *     a hidden filter control going inert and keeping its value (`tests/gearColumnPrefs.test.mts`,
 *     'a control that is not on screen is not filtering either - every field goes INERT', 'a HIDDEN
 *     control keeps its stored value when the bar writes ...'); and the sorted column staying after
 *     a reset (`tests/gearFilter.test.mts`, 'the columns are the core, plus whatever is being SORTED
 *     on'). Taking a control off the toolbar is still proved, by the parked choice and the relaunch.
 *   * PERSISTENCE ACROSS A PROCESS. `localStorage` is a real file under the temp `userData` dir, so
 *     the second launch is what proves an EXPLICIT choice beat the derivation rather than merely
 *     agreeing with it: it asserts a column the derivation would always draw (AC, a core column) is
 *     ABSENT, and one it would never draw (CHA) is present.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'

const ROW = '[data-testid="gear-row"]'
const TABLE = '[data-testid="gear-table"]'
const COUNT = '[data-testid="gear-count"]'
const SEARCH = '[data-testid="gear-search"] input'
const COLUMNS_TOGGLE = '[data-testid="gear-columns-toggle"]'
const COLUMNS_RESET = '[data-testid="gear-columns-reset"]'
const FILTERS_TOGGLE = '[data-testid="gear-filters-toggle"]'
const SLOT_SELECT = '[data-testid="gear-slot"]'
const EFFECT_SELECT = '[data-testid="gear-effect"]'

/** The dense row height GearTable states, and the number `useWindowedRows` is handed. */
const ROW_HEIGHT = 37

/**
 * What the picker is asked for. Fourteen keys on top of the core four, which is eighteen numeric
 * columns — comfortably past the ten a percentage budget can serve at a legible floor, and that is
 * the whole point of the list.
 *
 * The seven attributes lead it because they are what the owner named: *ALL stats should be there
 * (STR, DEX, etc.)*. `WIS` and `DMG` close it so the width step measures a set the host spec's
 * own columns do not already draw.
 */
const PICK: readonly string[] = [
  'STR',
  'STA',
  'AGI',
  'DEX',
  'INT',
  'CHA',
  'END',
  'ATTACK',
  'HASTE',
  'SV_FIRE',
  'SV_COLD',
  'SV_MAGIC',
  'WIS',
  'DMG'
]

function until(fn: () => Promise<boolean>, ms: number): Promise<boolean> {
  return settle(fn, (ok) => ok, { timeoutMs: ms })
}

function textOf(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? '', sel)
}

async function shownCount(page: Page): Promise<number> {
  const text = await textOf(page, COUNT)
  return Number((/[\d,]+/.exec(text)?.[0] ?? '0').replace(/,/g, ''))
}

/** Type into the search box and let the DEFERRED filter land — the count settling IS the condition. */
async function typeAndSettle(page: Page, value: string): Promise<number> {
  await page.fill(SEARCH, value, { timeout: 15_000 })
  // A THREE-POLL STREAK, not two equal samples (flake, 2026-08-15 — the AGENTS.md ledger has the
  // row): the search is DEFERRED, so two polls can both read the count from BEFORE the fill
  // flushed and report the old answer as "settled". Three consecutive equal reads spans the
  // deferral in practice; the timeout stays the honest bound when it does not.
  let last = -1
  let streak = 0
  await settle(
    async () => {
      const shown = await shownCount(page)
      streak = shown === last ? streak + 1 : 0
      last = shown
      return streak >= 2
    },
    (ok) => ok,
    { timeoutMs: 15_000 }
  )
  return last
}

/**
 * One numeric cell of one row, as text. `''` is both "not on screen" and "states none" (by design).
 *
 * EXPORTED, and the spec next door imports it instead of keeping the byte-identical copy it used
 * to (JOS-324). `gear.e2e.mts` sits AT the measured 400-line file ceiling and the rule here is to
 * split rather than ratchet; a helper that already existed twice is the cheapest honest split, and
 * "which cell of which row" is this file's own subject.
 */
export function cellText(page: Page, key: string, column: string): Promise<string> {
  return page.evaluate(
    ([k, c]) => {
      const cell = document
        .querySelector(`[data-testid="gear-row"][data-item-key="${k}"]`)
        ?.querySelector(`[data-testid="gear-cell-${c}"]`)
      return cell instanceof HTMLElement ? cell.innerText.trim() : ''
    },
    [key, column]
  )
}

/**
 * THE THREE BOXES, in one read. `list` is how far the table overflows its own scroller — which is
 * where a wide column set is SUPPOSED to go. `doc` and `content` are the page, which must never
 * move sideways no matter how many columns are asked for.
 *
 * `content` is named by its testid rather than taken as `main`'s first child, for the reason
 * `pageOverflow` states in appHarness.mts: since JOS-324 the gear area's tab bar is that first
 * child, and measuring it instead would have been a permanent silent pass.
 */
function overflowX(page: Page): Promise<{ list: number; doc: number; content: number }> {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="gear-list"]')
    const content = document.querySelector('[data-testid="app-content"]') as HTMLElement | null
    return {
      list: list === null ? -1 : list.scrollWidth - list.clientWidth,
      doc: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      content: content === null ? -1 : Math.max(0, content.scrollWidth - content.clientWidth)
    }
  })
}

/** Every mounted row's height, deduped — the windowing hook's precondition, measured. */
function rowHeights(page: Page): Promise<number[]> {
  return page.evaluate((sel) => {
    const seen = new Set<number>()
    for (const el of document.querySelectorAll(sel)) seen.add(Math.round(el.getBoundingClientRect().height))
    return [...seen]
  }, ROW)
}

/** Open a picker menu, click a list of options, and close it with the platform's own gesture. */
async function pick(page: Page, toggle: string, testId: string, keys: readonly string[]): Promise<void> {
  await page.click(toggle, { timeout: 15_000 })
  for (const key of keys) {
    await page.click(`[data-testid="${testId}-option-${key}"]`, { timeout: 15_000 })
  }
  await page.keyboard.press('Escape')
  await until(async () => (await countOf(page, `[data-testid="${testId}-option-${keys[0] ?? 'AC'}"]`)) === 0, 10_000)
}

/**
 * PUT THESE STAT COLUMNS ON THE TABLE, for a caller outside this module (JOS-302).
 *
 * The host spec's upgrade step used to get its DMG and WIS columns by typing two stat THRESHOLDS,
 * which derived them as a side effect. The fourth owner ask deleted the thresholds, and the picker
 * is where that job went — so the step names the columns it wants instead of conjuring them, which
 * is both the honest replacement and a smaller lie than the old one ever was.
 *
 * IT MUST BE PAIRED WITH `resetColumns`. A picked list is EXPLICIT and wins outright, and
 * `toggleColumn` toggles: this module's own `stepPick` starts from whatever it is handed, so a
 * caller that leaves a choice behind would silently un-pick two of its keys.
 */
export async function pickColumns(page: Page, keys: readonly string[]): Promise<void> {
  await pick(page, COLUMNS_TOGGLE, 'gear-columns', keys)
}

/** Hand the columns back to the derivation — the state that has no stored key. */
export async function resetColumns(page: Page): Promise<void> {
  await page.click(COLUMNS_TOGGLE, { timeout: 15_000 })
  await page.click(COLUMNS_RESET, { timeout: 15_000 })
  await page.keyboard.press('Escape')
  await until(async () => (await page.getAttribute(TABLE, 'data-layout')) === 'percent', 15_000)
}

// =================================================================================

/**
 * 1. THE PICKER PUTS ANY STAT ON THE TABLE, AND EVERY ONE OF THEM SORTS.
 *
 * The gap the owner hit was never the sort machinery — `sortGearRows` has always taken any
 * `GearStatKey` — it was that a key with no column had no header to click. So the assertion is
 * exactly that: for every key picked, a header exists that carries the sort control.
 */
async function stepPick(page: Page): Promise<boolean> {
  await typeAndSettle(page, '')
  const before = await countOf(page, '[data-testid^="gear-sort-"]')
  await pick(page, COLUMNS_TOGGLE, 'gear-columns', PICK)

  const grew = await until(async () => (await countOf(page, '[data-testid^="gear-sort-"]')) > before, 15_000)
  const after = await countOf(page, '[data-testid^="gear-sort-"]')
  if (!check('picking stats puts them on the table as columns', grew, `${String(before)} headers → ${String(after)}`)) {
    return false
  }

  const missing: string[] = []
  for (const key of PICK) {
    if ((await countOf(page, `[data-testid="gear-sort-${key}"]`)) !== 1) missing.push(key)
  }
  check(
    'every picked stat gets a SORTABLE header - the exposure is the whole of "all columns sortable"',
    missing.length === 0,
    missing.length === 0 ? `${String(PICK.length)} picked, all sortable` : `no header for ${missing.join(' ')}`
  )
  // The chip says the choice is now the user's, not the app's. The drop trio's headers are
  // sortable too (2026-08-18) but they are the Drop-columns chip's, not this one's — so they and
  // the name header come off the sortable-header count before it must match the chip.
  const trio = (await countOf(page, '[data-testid="gear-sort-zone"]')) * 3
  check(
    'the Columns chip counts what is drawn',
    (await textOf(page, COLUMNS_TOGGLE)).includes(String(after - 1 - trio)),
    (await textOf(page, COLUMNS_TOGGLE)).replace(/\s+/g, ' ').trim()
  )
  return missing.length === 0
}

/**
 * 2. A SET WIDER THAN THE PANE SCROLLS INSIDE THE TABLE'S OWN BOX — never sideways on the page.
 *
 * This is JOS-260's law at width. The percentage budget cannot make a `tableLayout: fixed` table
 * wider than its container, so past ten numeric columns the layout states PIXELS and a table
 * minimum; the list box, which was already `overflow: auto` for the vertical case, is what absorbs
 * it. Both halves are measured, because either one alone would pass while the feature was broken.
 */
async function stepWidth(page: Page): Promise<void> {
  const mode = await page.getAttribute(TABLE, 'data-layout', { timeout: 15_000 })
  check('a column set past the percentage floor switches the table to stated pixel widths', mode === 'pixel', String(mode))

  const over = await overflowX(page)
  check(
    'the wide table scrolls horizontally INSIDE the gear list, which is its own box',
    over.list > 0,
    `list overflows by ${String(over.list)}px`
  )
  check(
    '…and the PAGE never scrolls sideways for it - not the document, not the content area',
    over.doc === 0 && over.content === 0,
    `document +${String(over.doc)}px · content area +${String(over.content)}px`
  )

  // THE FIXED-HEIGHT CONTRACT, MEASURED. Eighteen columns is exactly when a cell would wrap.
  const heights = await rowHeights(page)
  check(
    'every row is still exactly one clipped line tall - the windowing hook`s whole precondition',
    heights.length === 1 && Math.abs((heights[0] ?? 0) - ROW_HEIGHT) <= 1,
    `heights seen: ${heights.join(' ') || 'none'}`
  )
}

/**
 * 3. RESET GOES BACK TO THE DERIVED SEED — the state that has no stored key, made reachable.
 *
 * And with it the width law reverses: the derived set has always fitted the percentage budget, so
 * the list stops overflowing. That is the continuity claim in `gearColumns.ts`, measured.
 */
async function stepReset(page: Page): Promise<void> {
  await typeAndSettle(page, '')
  await resetColumns(page)

  const back = (await page.getAttribute(TABLE, 'data-layout')) === 'percent'
  check('resetting the picker returns the columns to following the sort', back)
  const gone = await until(async () => (await countOf(page, '[data-testid="gear-sort-CHA"]')) === 0, 10_000)
  check('…so a stat nothing is sorting on stops drawing a column', gone)
  const over = await overflowX(page)
  check(
    '…and the derived set fits the pane again, with no sideways scroll anywhere',
    over.list <= 1 && over.doc === 0 && over.content === 0,
    `list +${String(over.list)}px · document +${String(over.doc)}px`
  )
}

/**
 * THE WHOLE JOS-297 PASS. Runs on an unnarrowed corpus (nothing in the host spec leaves a slot pick
 * on before it any more, so the old hide-the-slot-control widening is gone with the steps that set it).
 *
 * IT LEAVES A CHOICE BEHIND ON PURPOSE: a column set that a derivation could never produce (CHA in,
 * the core AC out) and one hidden filter control, both for the relaunch step to find.
 */
export async function stepGearColumns(page: Page): Promise<void> {
  // THE SLOT CONTROL IS HIDDEN FOR THE WIDTH STEPS, as it always was (it used to be hidden to widen a
  // PRIMARY pick away). MEASURED 2026-11-27 when the pick went: with EVERY toolbar control on, the
  // Owned toggle ends 60px past the content area at the e2e window (1280 wide) whatever the columns
  // or the sort — a toolbar that does not wrap, reported as an app defect and not this step's
  // subject. Hiding one control keeps these steps measuring the TABLE's width law.
  await pick(page, FILTERS_TOGGLE, 'gear-filters', ['slot'])
  if (!(await stepPick(page))) return
  await stepWidth(page)
  await stepReset(page)
  await pick(page, FILTERS_TOGGLE, 'gear-filters', ['slot'])

  // The choice the second launch has to find. CHA is never derived here and AC is always derived,
  // so the pair is only explicable as a stored explicit list.
  await pick(page, COLUMNS_TOGGLE, 'gear-columns', ['CHA', 'AC'])
  await pick(page, FILTERS_TOGGLE, 'gear-filters', ['effect'])
  const parked =
    (await countOf(page, '[data-testid="gear-sort-CHA"]')) === 1 &&
    (await countOf(page, '[data-testid="gear-sort-AC"]')) === 0 &&
    (await countOf(page, EFFECT_SELECT)) === 0
  check('the tab is left holding a choice no derivation could have produced', parked)
  if (!parked) note('the relaunch step below cannot prove anything the first launch did not park')
}

/** AND IT ALL COMES BACK — a second launch over the same userData, reading the same localStorage. */
export async function stepGearColumnsRelaunched(page: Page): Promise<void> {
  const mounted = await until(async () => (await countOf(page, TABLE)) === 1, 30_000)
  if (!check('the table mounts on the second launch', mounted)) return

  const cha = await until(async () => (await countOf(page, '[data-testid="gear-sort-CHA"]')) === 1, 15_000)
  check('a picked column comes back after a relaunch, sortable header and all', cha)
  check(
    '…and an EXPLICIT choice beats the derivation across a process: the core AC column stays removed',
    (await countOf(page, '[data-testid="gear-sort-AC"]')) === 0,
    'AC would be drawn by the seed on every launch'
  )
  check(
    'a hidden filter control stays hidden, while the ones that were never unpicked come back',
    (await countOf(page, EFFECT_SELECT)) === 0 && (await countOf(page, SLOT_SELECT)) === 1
  )
}
