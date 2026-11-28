/**
 * The Gear tab's EFFECTIVE HP column (JOS-336) — the derived key, on the real corpus, through the
 * real render. A module rather than more of `gear.e2e.mts`, the `gearColumnSteps.mts` /
 * `gearFilterSteps.mts` precedent: everything this step needs is already standing in the host spec,
 * and that file sits at the repo's 400-code-line factoring ceiling.
 *
 * WHAT NEEDS A REAL APP HERE, given `tests/gearEffectiveHp.test.mts` owns the arithmetic without a
 * DOM: THAT IT IS PICKABLE AT ALL. `EFF_HP` is not a field of `GearStats`, so every layer between the
 * picker and the cell has to agree that a key with no vector entry is still a column: the picker's
 * option list, the stored-choice sanitizer, the header that carries the sort control, and
 * `GearTable`'s one `statText(sortValue(row, key), key)` cell path. A unit test can prove each of
 * those in isolation; only the app proves they meet — so the step picks it, sorts on it, and reads
 * numbers out of its cells.
 *
 * WHAT IT NO LONGER ASSERTS (owner, 2026-11-27: "we shouldn't be regression testing functions that
 * produce values"): the row-by-row HP + STA identity, the highest-first ranking with absent last,
 * the blank cell on Thelvorn, and the slider restating and re-ranking the column. Each is pinned in
 * `tests/gearEffectiveHp.test.mts` ('EFFECTIVE HP is HP plus STA, and law 1 decides both of the
 * interesting arms', 'effective HP ranks both ways, with absent LAST either way and the name as the
 * tiebreak', 'a cell states a PLAIN INTEGER, and a blank means the item stated neither', 'THE SLIDER
 * MOVES IT, and can RE-RANK on it', 'the sum is of the SCALED halves, never a scaled sum'); that the
 * global selector reaches the table's cells at all is the host spec's upgrade step.
 *
 * PRECONDITIONS, and the state it hands back. It runs on an UNNARROWED corpus with the global
 * selector at base. It returns the columns to the derivation and the search box empty; the only thing
 * it leaves moved is the SORT (effective HP), which the host spec's later steps set for themselves.
 */
import type { Page } from 'playwright-core'
import { check, countOf, settle } from './appHarness.mjs'
import { pickColumns, resetColumns } from './gearColumnSteps.mjs'

const COUNT = '[data-testid="gear-count"]'
const SEARCH = '[data-testid="gear-search"] input'
const SORT_EFF_HP = '[data-testid="gear-sort-EFF_HP"]'
const EFF_CELL = '[data-testid="gear-cell-EFF_HP"]'

/**
 * WHAT THE PICKER IS ASKED FOR, and why HP is not in the list. The derived seed is the core four
 * (AC, HP, MP, Ratio) and `toggleColumn` TOGGLES — so naming HP here would take the column away.
 * `STA` is not core, `EFF_HP` is the subject, and HP is already on the table.
 */
const PICK: readonly string[] = ['STA', 'EFF_HP']

const until = (fn: () => Promise<boolean>, ms: number): Promise<boolean> => settle(fn, (ok) => ok, { timeoutMs: ms })

const textOf = (page: Page, sel: string): Promise<string> =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? '', sel)

async function shownCount(page: Page): Promise<number> {
  const text = await textOf(page, COUNT)
  return Number((/[\d,]+/.exec(text)?.[0] ?? '0').replace(/,/g, ''))
}

/** Type into the search box and let the DEFERRED filter land — the count settling IS the condition. */
async function typeAndSettle(page: Page, value: string): Promise<number> {
  await page.fill(SEARCH, value, { timeout: 15_000 })
  let last = -1
  await settle(
    async () => {
      const shown = await shownCount(page)
      const stable = shown === last
      last = shown
      return stable
    },
    (ok) => ok,
    { timeoutMs: 15_000 }
  )
  return last
}

/** The stated (non-blank) effective-HP cells on screen, as text. */
function statedCells(page: Page): Promise<string[]> {
  return page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((c) => (c as HTMLElement).innerText.trim()).filter((t) => t !== ''),
    EFF_CELL
  )
}

/** 1. THE KEY IS PICKABLE, AND PICKING IT PUTS A SORTABLE HEADER ON THE TABLE. */
async function stepPickable(page: Page): Promise<boolean> {
  await typeAndSettle(page, '')
  await pickColumns(page, PICK)
  const drawn = await until(async () => (await countOf(page, SORT_EFF_HP)) === 1, 15_000)
  if (!check('EFFECTIVE HP is in the columns picker, and picking it draws a SORTABLE header', drawn)) return false

  const label = (await textOf(page, SORT_EFF_HP)).replace(/\s+/g, ' ').trim()
  check(
    '…under a label short enough for the 8% column ceiling - the underscore rule`s own spelling',
    label.includes('EFF HP'),
    `the header reads "${label}"`
  )
  return true
}

/** 2. ITS HEADER SORTS, AND ITS CELLS STATE NUMBERS — the derived key reached the cell path. */
async function stepSortable(page: Page): Promise<void> {
  await page.click(SORT_EFF_HP, { timeout: 15_000 })
  const ready = await until(async () => (await statedCells(page)).length > 1, 15_000)
  check(
    'sorting by effective HP leaves rows on screen with sums to compare',
    ready,
    (await statedCells(page)).slice(0, 6).join(' ')
  )
}

/**
 * THE WHOLE JOS-336 PASS. Run on an unnarrowed corpus with the selector at base; hands the tab back
 * with the columns derived and the search box empty.
 */
export async function stepGearEffectiveHp(page: Page): Promise<void> {
  if (!(await stepPickable(page))) return
  await stepSortable(page)

  // HAND THE COLUMNS BACK, because `pickColumns` TOGGLES against whatever it is handed
  // (gearColumnSteps.mts states that pairing).
  await resetColumns(page)
  await typeAndSettle(page, '')
  check(
    'the step hands the tab back with the columns following the sort again',
    (await countOf(page, '[data-testid="gear-sort-STA"]')) === 0,
    'a picked column left behind would silently un-pick itself in the next step'
  )
}
