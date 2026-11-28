/**
 * The Gear tab's CLASS filter and its WEAPON TYPE filter (JOS-302, the owner's first and third
 * asks). A module rather than more of `gear.e2e.mts`, the `gearSetSteps.mts` / `gearColumnSteps.mts`
 * precedent: everything these steps need is already standing in the host spec, and that file is at
 * the repo's 400-code-line factoring ceiling. The SLOT half of the ticket has no step of its own any
 * more: the slot picker's wiring is asserted where the comparison step picks SECONDARY
 * (gearCompareSteps.mts), and the union is pinned in `tests/gearFilter.test.mts`.
 *
 * WHAT NEEDS A REAL APP HERE, given `tests/gearFilter.test.mts` owns both predicates without a DOM
 * (owner, 2026-11-27: e2e proves the wiring; which rows a pick keeps is a unit test's to state):
 *
 *   * THE CLASS PICKER IS FILLED BY DETECTION, not by the test. `useGearClasses` reads the combo
 *     module's live inference, so what is in that control at mount is a fact about the log the app
 *     is tailing — and since JOS-302 it NARROWS. No unit test can see that chain (log → parser →
 *     combo module → IPC → the picker → `filterGearRows`), and it is exactly the chain that decides
 *     what a user sees the first time they open the tab.
 *   * THE CHIP IS GONE FROM THE ROWS. `planner-mismatch-chip` is a shared component still drawn by
 *     two OTHER surfaces, so "we deleted it here" is a claim about a rendered table rather than
 *     about a module, and the only honest way to state it is to look at the table.
 *   * EACH PICKER REACHES THE TABLE. A pick narrows the readout through the real autocomplete, the
 *     real filter memo and the real windowed list. A category being exactly the union of its
 *     member types was asserted here as a count identity until 2026-11-27; it is pinned in
 *     `tests/gearFilter.test.mts` ('a category is nothing but the UNION of its member types').
 *
 * IT ALSO LEAVES THE TAB CLEAN, on purpose and load-bearingly: the class step CLEARS the picker
 * before it returns. Every step after it in the host spec was written against an unfiltered corpus
 * (Thelvorn is PAL-only, and the ownership steps hunt for it by key), so a detected trio left in
 * place would make the rest of the spec depend on what the fixture log happens to infer.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'

const COUNT = '[data-testid="gear-count"]'
const SEARCH = '[data-testid="gear-search"] input'
const CLASSES = '[data-testid="gear-classes"]'
const WEAPON = '[data-testid="gear-weapon"]'
const ZONE = '[data-testid="gear-zone"]'
const MISMATCH = '[data-testid="planner-mismatch-chip"]'

const until = (fn: () => Promise<boolean>, ms: number): Promise<boolean> => settle(fn, (ok) => ok, { timeoutMs: ms })

/** `"212 of 6,814 items"` → 212. The readout is the only place the filtered total is stated. */
async function shownCount(page: Page): Promise<number> {
  const text = await page.evaluate(
    (s) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? '',
    COUNT
  )
  return Number((/[\d,]+/.exec(text)?.[0] ?? '0').replace(/,/g, ''))
}

/** Let the DEFERRED filter land — the count going still IS the condition (never a clock). */
async function settled(page: Page): Promise<number> {
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

async function search(page: Page, value: string): Promise<number> {
  await page.fill(SEARCH, value, { timeout: 15_000 })
  return settled(page)
}

/** The chips a picker is showing, in order — what the user SEES their filter to be. */
function chipsIn(page: Page, picker: string): Promise<string[]> {
  return page.evaluate(
    (sel) => [...document.querySelectorAll(`${sel} .MuiChip-label`)].map((n) => n.textContent ?? ''),
    picker
  )
}

/**
 * Pick one option out of a ChipMultiSelect by TYPING it and taking the highlighted hit — the
 * sky-filters helper, verbatim in behaviour and for the same reason: the listbox is a portal with
 * its own geometry, and clicking into it is a bet about layout that has nothing to do with the
 * filter under test. Escape closes the popup so it is not an overlay the next click has to fight.
 */
export async function pickIn(page: Page, picker: string, typed: string): Promise<void> {
  await page.click(`${picker} input`, { timeout: 15_000 })
  await page.fill(`${picker} input`, typed)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
}

/** Empty a picker the way a user does: focus its input and backspace every chip off. */
export async function clearPicks(page: Page, picker: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if ((await chipsIn(page, picker)).length === 0) break
    await page.click(`${picker} input`, { timeout: 15_000 })
    await page.keyboard.press('Backspace')
  }
  await page.keyboard.press('Escape')
}

/**
 * THE OWNER'S FIRST ASK, and the one that overruled a stated law: picking classes REMOVES the rows
 * that do not fit instead of chipping them.
 *
 * It runs EARLY in the host spec and leaves the picker EMPTY — see the file header on why every
 * later step depends on that.
 */
export async function stepGearClassFilter(page: Page): Promise<void> {
  const detected = await chipsIn(page, CLASSES)
  note(`the class picker mounted holding ${detected.length === 0 ? 'nothing' : detected.join(' ')} — whatever the log inferred`)

  await search(page, '')
  await clearPicks(page, CLASSES)
  const all = await settled(page)
  check('clearing the Classes picker returns the whole corpus', all > 0, `${String(all)} items`)

  // TYPED AS A WHOLE CLASS NAME since JOS-402: the control's options are still the /who codes and
  // still what the filter stores, but the words it offers and matches on are `Rogue` and `Paladin`
  // now, so a spec that typed `ROG` would filter the listbox to nothing and pick whatever was
  // highlighted. Typing what the user sees is also the only way this step proves the relabel.
  //
  // WHICH rows a class pick removes (Thelvorn is PAL-only, so it goes for a rogue and comes back for
  // a paladin) is the pure predicate's business: tests/gearFilter.test.mts, 'the class picks REMOVE
  // the rows they do not fit, and an unstated class list is never removed' (owner, 2026-11-27: e2e
  // proves the wiring, the unit test the values). What stays here is that the control reaches it.
  await pickIn(page, CLASSES, 'Rogue')
  const narrowed = await until(async () => (await shownCount(page)) < all, 15_000)
  const shown = await shownCount(page)
  check(
    'picking a class REMOVES the gear that class cannot use - it is not chipped and left on screen',
    narrowed && shown > 0,
    `${String(all)} items → ${String(shown)} a rogue can use`
  )
  // THE DELETED CHIP. `planner-mismatch-chip` still exists and two other surfaces still draw it;
  // what must never happen again is a gear SEARCH row wearing one.
  check('…and no search row wears an off-filter chip any more', (await countOf(page, MISMATCH)) === 0)
  // THE WORDS ON THE CONTROL (JOS-402). The pick went in as `Rogue`, so the chip the user is left
  // holding must be the class, not the code — the same claim the Sky filter has always made.
  check(
    'the picked class wears its whole name, never the /who code',
    (await chipsIn(page, CLASSES)).join() === 'Rogue',
    (await chipsIn(page, CLASSES)).join()
  )

  await clearPicks(page, CLASSES)
  const restored = await until(async () => (await shownCount(page)) === all, 15_000)
  if (!restored) note('the steps below were written against an unfiltered corpus and may now be reading a narrowed one')
}

/**
 * THE ZONE PICKER (fork decision, kaltinril 2026-09-26): a pick keeps what drops in that ZONE,
 * however the wiki spelled it, and a second pick is a union.
 *
 * `tests/gearZoneFilter.test.mts` owns the predicate, the label and the union ('a pick is a ZONE -
 * the three spellings the corpus prints for Unrest are one pick', 'several zones are a UNION, and
 * the union ANDs with everything else'); what needs a real app is that the OPTIONS arrive — they
 * are derived from the index the window fetched, so an empty listbox is a failure only a window can
 * have — and that a pick reaches the table. Runs on an unnarrowed corpus with the drop columns
 * drawn, and hands the picker back empty.
 */
export async function stepGearZonePicks(page: Page): Promise<void> {
  const all = await search(page, '')
  // TYPED AS THE SHORT NAME a player would type: the option reads `The Estate of Unrest`.
  await pickIn(page, ZONE, 'Unrest')
  const narrowed = await until(async () => (await shownCount(page)) < all, 15_000)
  const unrest = await shownCount(page)
  check('picking a zone narrows the table to what drops there', narrowed && unrest > 0, `${String(all)} items → ${String(unrest)} from Unrest`)

  await clearPicks(page, ZONE)
  await until(async () => (await shownCount(page)) === all, 15_000)
}

/**
 * THE OWNER'S THIRD ASK: weapon types, and categories that union several of them.
 *
 * WHICH rows a type or a category keeps is pinned in `tests/gearFilter.test.mts` ('the weapon filter
 * keeps the kinds asked for, and nothing that is not a weapon', 'a category is nothing but the UNION
 * of its member types', 'the weapon type ANDs with the slot and with the class picks'). This step
 * keeps the one claim only a window can make: the control, fed by the real autocomplete, reaches the
 * filter memo and the windowed list.
 */
export async function stepGearWeaponTypes(page: Page): Promise<void> {
  const all = await search(page, '')
  await clearPicks(page, WEAPON)

  await pickIn(page, WEAPON, '1H Slashing')
  const narrowed = await until(async () => (await shownCount(page)) < all, 15_000)
  const oneHandSlash = await shownCount(page)
  check(
    'picking a weapon type narrows the table to weapons of that skill',
    narrowed && oneHandSlash > 0,
    `${String(all)} items → ${String(oneHandSlash)} 1H slashers`
  )

  // Hand the tab back the way the steps below expect to find it.
  await clearPicks(page, WEAPON)
  await until(async () => (await shownCount(page)) === all, 15_000)
}
