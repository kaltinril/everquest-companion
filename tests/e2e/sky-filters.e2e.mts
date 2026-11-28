/**
 * Headless Electron integration test for THE SKY TAB'S STICKY FILTERS (JOS-90, JOS-124, JOS-145).
 *
 * THE BUG, in the reporter's words: tick "Hide completed" on the Plane of Sky tab to see exactly
 * what is left, click away to any other tab, come back — and every quest you have already turned
 * in is on the screen again. Hiding completed steps is not a momentary filter, it is how a user
 * says "show me what is left", and the app forgot it the moment the view unmounted.
 *
 * WHY THE ROUND TRIP HAS TO BE DRIVEN BY A REAL APP. The unit-testable half of this is one line —
 * a `useState` initialiser reading localStorage — and a test of THAT would pass while the feature
 * stayed broken, because the bug was never in the read. It was in the LIFECYCLE: `App`'s
 * `ViewContent` mounts exactly one feature view at a time, so leaving the Sky tab destroys
 * `useQuestList` and everything it was holding. Only a spec that actually leaves the tab can
 * distinguish "the state is stored" from "the state survives being thrown away", which is why
 * every assertion below is bracketed by a NAVIGATION, and why the trip out asserts the filter bar
 * is GONE first — an unmount that never happened would make the rest of this spec a tautology.
 *
 * TWO LAUNCHES, ONE userData DIR. The tab round trip and the RESTART are different promises, and
 * a spec that only proved the first would leave "preferred, if that is where other view toggles
 * live" untested. `makeUserData()` hands both launches the same dir (the telemetry/overlay-sync
 * pattern), so launch 2 reads the localStorage launch 1 wrote — through a real process exit, not
 * a simulated one.
 *
 * WHAT IT DOES NOT ASSERT: which quests the tick removes from the list. That is
 * `selectQuests`'s filter, pinned without a browser in tests/questSort.test.mts, and repeating it
 * here would only make this spec depend on the committed quest data staying the shape it is.
 * The subject here is the STATE, and the state is what the box says.
 *
 * JOS-145 ADDS A SECOND HIDE-BOX beside the first ("hide quests I have turned in"), and with it the
 * one promise a per-control spec cannot make: that the two are INDEPENDENT. See
 * `stepBoxesAreIndependent` for why that is the assertion worth having and where the two boxes'
 * EFFECTS are pinned instead.
 *
 * JOS-124 ADDS THE BOSS AND ISLAND FACETS to the same subject, because they make the same promise
 * for a control with more to lose: a pick is a chip in a picker, and a picker that comes back empty
 * looks like the app forgot rather than like a filter cleared. Their step DOES read the counts line
 * ("N of M quests") — not to pin which quests survive (questFacets.test.mts owns that against the
 * committed data) but because a filter whose state persists while its EFFECT does not would pass
 * every localStorage assertion in this file. So the step asserts that picking narrows and that the
 * narrowing comes back after the remount. (The AND between the dimensions and "clearing restores
 * everything" are `filterByFacets` values, pinned in tests/questFacets.test.mts and no longer
 * re-checked here: owner ruling 2026-11-27, e2e proves wiring, unit tests prove values.)
 *
 * JOS-191 ADDS THE PAGE CAP to the same file, because it is the same subject read from the other
 * side: the thing the user asked for has to survive what the app does next. The cap was RESET BY
 * DATA — a star, a drop, a turn-in each rebuilt the filtered array and threw a fully paged-open
 * list back to the first forty rows — so the two steps here count ROWS rather than read a stored
 * bit, and the stored bit ("show all") is checked on top because the preference is the second half
 * of the ask. See `stepShowAllSurvivesInteraction`.
 *
 * JOS-206 ADDS ONE MORE ROW-COUNTING STEP for the same reason JOS-191's are here: typing in the
 * search box stalled the app, and the largest single cause was that a COLLAPSED quest's panel was
 * still in the DOM being reconciled. The fix is structural and so is the assertion —
 * `stepCollapsedRowsDrawNoPanel` counts a panel-only control before, during and after an expand.
 * The milliseconds are deliberately not in here; they are a machine's number, and this file's job
 * is the promise that number rests on.
 *
 * JOS-207 ADDS THE SEARCH BOX to the facet steps, because it is now reading the facets' own data.
 * Since 2026-11-27 only its wiring is here (a boss name typed into the box narrows the list); that
 * typing a name finds the same quests as picking it is pinned in tests/questSearch.test.mts. See
 * `stepSearchFindsBosses`.
 *
 * TAB ROUND TRIPS: two, one per storage hook — the two boxes ticked together (`useStoredFlag`) and
 * the facet picks (`useStoredNames`). Three more, one per box state, re-proved the same hook and
 * were cut 2026-11-27; the restart still carries the boxes across a new process in different
 * states.
 *
 * WHY IT NEVER TAKES THE SCREEN: `EQ_E2E=1` (src/main/e2e.ts) shows no window, skips the
 * single-instance lock, and points `userData` at a throwaway temp dir minted per launch.
 *
 * Run: `npm run test:e2e -- sky-filters` (or node --import tsx this file).
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countIn,
  countOf,
  dumpArtifacts,
  failures,
  reportRun,
  settle,
  settleGone,
  settleStable
} from './appHarness.mjs'
import { launchApp, mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
// The remount guard (JOS-279) — see `skyMount` below and that module's header for the argument.
import { mountGuard, type MountGuard } from './viewRemount.mjs'

const NAV_SKY = '[data-testid="nav-posky"]'
const NAV_OVERVIEW = '[data-testid="nav-overview"]'
/** The checkbox under test. MUI renders the real `<input>` inside this node — see `boxState`. */
const BOX = '[data-testid="posky-hide-completed"]'
/** The preference itself, as `useQuestList` stores it. Read back so the spec pins the KEY too:
 *  a rename that kept the round trip working would still break an existing user's saved choice. */
const KEY = 'eq.posky.hideCompleted'
/** JOS-145's second box and its own key: the other reading of done, stored separately on purpose. */
const TURNED_IN_BOX = '[data-testid="posky-hide-turned-in"]'
const TURNED_IN_KEY = 'eq.posky.hideTurnedIn'
/** The two JOS-124 pickers, and the keys their picks are stored under. */
const ISLAND = '[data-testid="posky-island-filter"]'
const BOSS = '[data-testid="posky-boss-filter"]'
const ISLANDS_KEY = 'eq.posky.islands'
const BOSSES_KEY = 'eq.posky.bosses'
/** JOS-207: the free-text box, which now searches the same boss/island facts the pickers offer. */
const SEARCH = '[data-testid="posky-search"] input'
/** The one boss name that appears in NO quest name, reward or item name — see `stepSearchFinds…`. */
const BOSS_NAME = 'Gorgalosk'
/** "N of M quests · counting from …" — where a narrowing filter becomes visible. */
const COUNTS = '[data-testid="posky-counts"]'
/** JOS-191: one quest row, the three footer buttons, and the bit "show all" is stored as. */
const ROW = '[data-testid="posky-quest-row"]'
const SHOW_MORE = '[data-testid="posky-show-more"]'
const SHOW_ALL = '[data-testid="posky-show-all"]'
const SHOW_FEWER = '[data-testid="posky-show-fewer"]'
const SHOW_ALL_KEY = 'eq.posky.showAll'
/**
 * JOS-206: the manual turn-in counter, which lives ONLY in a quest's expanded panel. Counting it
 * is how "the collapsed panel is not in the DOM at all" is asked of a real app — and it is one of
 * this app's own testids rather than a MUI class, so it is a claim about the tab rather than a bet
 * on `.MuiAccordionDetails-root` surviving a library upgrade.
 */
const DETAILS = '[data-testid="posky-record-turnin"]'
/** The control that opens one, by MUI's own name for it — the spec has no handle of its own here. */
const EXPAND = `${ROW} .MuiAccordionSummary-expandIconWrapper`
/** The quest-level star, by the label it announces itself with (favorites/QuestFlagButtons). */
const STAR = '[aria-label="Favorite this quest"]'
const UNSTAR = '[aria-label="Unfavorite this quest"]'
/**
 * `useQuestList`'s QUEST_PAGE, restated. The spec cannot import the renderer's module (it drives a
 * built app, not this source tree), so the number is written down — and every assertion that uses
 * it also reads the counts line, so a change to the page size fails here loudly rather than
 * silently passing against a list that never had two pages.
 */
const PAGE = 40

/** Is the box ticked? `null` when it is not mounted — never confused with "unticked". */
function boxState(page: Page, box: string = BOX): Promise<boolean | null> {
  return page.evaluate(
    (sel) => (document.querySelector(`${sel} input`) as HTMLInputElement | null)?.checked ?? null,
    box
  )
}

/** What the renderer has actually stored, verbatim. `null` when the key was never written. */
function storedValue(page: Page, key: string = KEY): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key)
}

/** How many quests the filters leave, off the counts line itself. `null` when it is not mounted. */
function filteredCount(page: Page): Promise<number | null> {
  return page.evaluate((sel) => {
    const text = document.querySelector(sel)?.textContent ?? ''
    const m = /(\d+) of (\d+) quests/.exec(text)
    return m ? Number(m[1]) : null
  }, COUNTS)
}

/**
 * The quest NAMES of every row that is currently expanded, in order. Empty when none is.
 *
 * By name rather than by index, deliberately: the interaction under test (a star) re-orders the
 * list, so "row 61 is still open" would be a claim about a position the click legitimately moved.
 * What the user is owed is that the QUEST they opened is still open.
 */
function expandedNames(page: Page): Promise<string[]> {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel}.Mui-expanded`)].map(
        (n) => n.querySelector('.MuiTypography-subtitle2')?.textContent ?? ''
      ),
    ROW
  )
}

/**
 * THE PRECONDITION EVERY EXPANDED-ROW ASSERTION IN THIS FILE RESTS ON, and which for six ledgered
 * runs was left to luck (AGENTS.md's flake ledger; fixed in JOS-279).
 *
 * This spec launches against the machine's OWN growing log rather than a staged fixture, so the
 * `viewKey` rebuilds `App` pushes as the historical fold lands arrive while the spec is already
 * driving the tab — and a rebuild remounts `PoskyView`, which closes an accordion the step opened
 * one line ago. That is correct app behaviour and a false failure: the steps below ask whether
 * FAVORITING collapses the list and whether CLOSING a panel unmounts it, never whether a character
 * rebuild does. `viewRemount.mts` carries the whole argument and the vocabulary.
 *
 * The anchor is the Sky tab's own sub-tab strip: inside the keyed subtree, and mounted whichever
 * sub-tab is showing.
 */
const skyMount = (page: Page): MountGuard => mountGuard(page, '[data-testid="posky-tab-quests"]')

/** The chips a picker is showing, in order — what the user SEES their filter to be. */
function chipsIn(page: Page, picker: string): Promise<string[]> {
  return page.evaluate(
    (sel) => [...document.querySelectorAll(`${sel} .MuiChip-label`)].map((n) => n.textContent ?? ''),
    picker
  )
}

/**
 * Pick one option out of a ChipMultiSelect by TYPING it and taking the highlighted hit.
 *
 * Typing rather than clicking a `li[role="option"]`: the listbox is a portal with its own
 * geometry, and a click into it is a bet about layout that has nothing to do with what this spec
 * is testing. ArrowDown is what highlights (MUI does not auto-highlight), and Escape closes the
 * popup afterwards — a popup left open is an overlay the next `page.click` on the nav would have
 * to fight.
 */
async function pick(page: Page, picker: string, typed: string): Promise<void> {
  await page.click(`${picker} input`, { timeout: 15_000 })
  await page.fill(`${picker} input`, typed)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
}

/** Clear a picker the way a user does: focus its (now empty) input and backspace the chip off. */
async function clearPick(page: Page, picker: string): Promise<void> {
  await page.click(`${picker} input`, { timeout: 15_000 })
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
}

/** Open the Sky tab and wait for its toolbar. Safe when the tab is already the open one. */
async function openSky(page: Page, timeoutMs = 60_000): Promise<boolean> {
  await page.click(NAV_SKY, { timeout: 30_000 })
  return page.waitForSelector(BOX, { timeout: timeoutMs }).then(
    () => true,
    () => false
  )
}

/**
 * Leave for another tab, and confirm the Sky view is really gone. This is the step the bug lived
 * in: the assertion after it means nothing unless `useQuestList` was actually unmounted here.
 */
async function leaveSky(page: Page): Promise<boolean> {
  await page.click(NAV_OVERVIEW, { timeout: 30_000 })
  return settleGone(page, BOX, { timeoutMs: 15_000 })
}

/** Click the box and wait for the tick to reach the state we asked for. */
async function setBox(page: Page, want: boolean, box: string = BOX): Promise<boolean | null> {
  await page.click(box, { timeout: 15_000 })
  return settle(() => boxState(page, box), (v) => v === want, { timeoutMs: 8_000 })
}

/** Away to the Overview and back to Sky, with the unmount actually asserted in between. */
async function awayAndBack(page: Page): Promise<boolean> {
  if (!check('leaving the Sky tab unmounts it (the filter bar is gone)', await leaveSky(page))) {
    return false
  }
  return check('…and the Sky tab comes back', await openSky(page))
}

/** A fresh install shows everything — the pref is absent, and absence is the default, not `false`. */
async function stepDefault(page: Page): Promise<void> {
  check('a fresh install opens the Sky tab with "Hide completed" UNTICKED', (await boxState(page)) === false)
  check('…and mounts exactly one such box', (await countOf(page, BOX)) === 1)
  check(
    '…and JOS-145\'s "Hide turned in" is beside it, also unticked on a fresh install',
    (await boxState(page, TURNED_IN_BOX)) === false
  )
  check('…exactly one of it too', (await countOf(page, TURNED_IN_BOX)) === 1)
}

/**
 * JOS-206: A CLOSED QUEST IS NOT DRAWN AT ALL.
 *
 * Typing in the search box stalled the app — 82 ms per character at the default page cap, 179 ms
 * with "show all" — and roughly 60% of what each row cost to re-render was a panel nobody had
 * opened: MUI's Collapse keeps its children mounted by default, so forty quests' item tables,
 * shared-item sections and turn-in toolbars (~2,700 DOM nodes) were reconciled on every keystroke
 * behind `height: 0`. The row now unmounts them.
 *
 * WHY IT IS ASSERTED HERE AND LIKE THIS. The measurement is a machine's number and does not belong
 * in a spec (frozen numbers rot); what belongs is the STRUCTURAL claim the speed rests on, which is
 * only visible with a real list: no expanded panel exists until a user opens one, opening one
 * builds it, and closing it takes it away again. The last of the three is what a naive
 * `unmountOnExit` on a controlled accordion gets wrong, and it is also the promise the next
 * keystroke depends on.
 *
 * It runs on the FIRST row and leaves it closed, so the steps after it still start from a list
 * with nothing expanded.
 */
async function stepCollapsedRowsDrawNoPanel(page: Page): Promise<void> {
  const mount = skyMount(page)
  await mount.run('the panel-unmount step', async () => {
    // The list has to be settled before an absence means anything: a page of rows that is still
    // arriving is trivially a page with no expanded panel in it.
    await settle(() => countIn(page, ROW), (n) => n === PAGE, { timeoutMs: 15_000 })
    const closed = await settleStable(() => countIn(page, DETAILS), { timeoutMs: 8_000 })
    await page.locator(EXPAND).first().click({ timeout: 15_000 })
    const opened = await settle(() => countIn(page, DETAILS), (n) => n === 1, { timeoutMs: 8_000 })
    await page.locator(EXPAND).first().click({ timeout: 15_000 })
    // The Collapse animates out before it unmounts, so this is a settle rather than a read.
    const gone = await settle(() => countIn(page, DETAILS), (n) => n === 0, { timeoutMs: 8_000 })
    // EVERY reading is taken before a single check runs; NOW ask whether the tab they were taken
    // from is still the one the mark was planted on. A rebuild would have closed the row this step
    // had just opened — "opening a quest builds its panel" would fail against correct behaviour —
    // and it would also make the closing assertion pass for a reason nobody tested.
    if (!(await mount.intact())) return false
    check('a list of collapsed quests mounts NO expanded panel at all', closed === 0, String(closed))
    check('OPENING A QUEST BUILDS ITS PANEL', opened === 1, String(opened))
    check('…AND CLOSING IT TAKES THE PANEL BACK OUT OF THE DOM', gone === 0, String(gone))
    return true
  })
}

/**
 * THE JOS-191 DEFECT, in the reporter's words: on the Plane of Sky tab, after loading the whole
 * list, "any interaction — clicking an item, favoriting — resets the page back to collapsed" and
 * they have to load it all over again.
 *
 * WHY IT COULD ONLY BE CAUGHT HERE. The cap lived in a `useEffect` keyed on the FILTERED ARRAY, and
 * that array is a `useMemo` over the quests and the favorites — so it changes identity when a star
 * is clicked, when a drop lands, when a turn-in is written. Every unit-testable piece of that is
 * correct in isolation: the memo recomputes because its inputs changed, and the effect fires
 * because its dependency changed. The defect is what the two of them MEAN together, which is only
 * visible with a real list, a real click, and a count of what is left mounted afterwards.
 *
 * The expanded row is half the report and gets its own assertion: rows past the cap UNMOUNT when it
 * snaps back, so an open accordion at row 61 is destroyed rather than closed. It is opened at the
 * BOTTOM of the list precisely because that is the region the old behaviour could not keep.
 *
 * Leaves "show all" ON; `stepShowFewerPutsTheCapBack` immediately below turns it off again.
 */
async function stepShowAllSurvivesInteraction(page: Page): Promise<void> {
  const all = await settle(() => filteredCount(page), (n) => n !== null && n > PAGE, { timeoutMs: 30_000 })
  if (!check(`the fresh list is longer than one page of ${String(PAGE)}`, all !== null && all > PAGE, String(all))) {
    return
  }
  const first = await settle(() => countIn(page, ROW), (n) => n === PAGE, { timeoutMs: 15_000 })
  check('a fresh install draws the first page and offers the rest', first === PAGE, String(first))

  await page.click(SHOW_ALL, { timeout: 15_000 })
  const opened = await settle(() => countIn(page, ROW), (n) => n === all, { timeoutMs: 15_000 })
  if (!check('SHOW ALL draws every quest the filters leave', opened === all, `${String(opened)} of ${String(all)}`)) {
    return
  }
  check(`…and the ask is stored under ${SHOW_ALL_KEY}`, (await storedValue(page, SHOW_ALL_KEY)) === '1')

  // THE EXPANDED HALF RUNS ON A TAB THAT IS HOLDING STILL (JOS-279). This step is the first thing
  // the spec does after the tab opens, which is exactly when the historical fold is still landing
  // and `App` is still bumping `viewKey` — six ledgered sightings, every one of them this step's
  // expansion assertion against a remount. See `viewRemount.mts`.
  const mount = skyMount(page)
  await mount.run('the show-all interaction step', async () => {
    await page.locator(EXPAND).last().click({ timeout: 15_000 })
    const open = await settle(() => expandedNames(page), (n) => n.length === 1, { timeoutMs: 8_000 })
    if (!(await mount.intact())) return false
    if (!check('the LAST quest in the list expands', open.length === 1, open.join())) return true

    // The interaction itself. One click on a star used to hand the user back forty rows.
    await page.click(STAR, { timeout: 15_000 })
    const after = await settleStable(() => countIn(page, ROW), { timeoutMs: 8_000 })
    const still = await expandedNames(page)
    if (!(await mount.intact())) {
      // Put the star back before the retry, so a discarded attempt leaves no favorite behind.
      if ((await countOf(page, UNSTAR)) > 0) await page.click(UNSTAR, { timeout: 15_000 })
      return false
    }
    check('FAVORITING A QUEST LEAVES THE WHOLE LIST LOADED', after === all, `${String(after)} of ${String(all)}`)
    check('…AND THE QUEST THAT WAS EXPANDED IS STILL EXPANDED', still.join() === open.join(), still.join())

    await page.click(UNSTAR, { timeout: 15_000 })
    const cleaned = await settleStable(() => countIn(page, ROW), { timeoutMs: 8_000 })
    check('…and un-favoriting it does not collapse the list either', cleaned === all, String(cleaned))
    return true
  })
}

/**
 * The off switch, which is the other half of making this a stored preference: a bit that survives
 * everything and cannot be turned off is a trap rather than a setting. It also puts the rest of
 * this launch back on the paged list the later steps were written against.
 */
async function stepShowFewerPutsTheCapBack(page: Page): Promise<void> {
  await page.click(SHOW_FEWER, { timeout: 15_000 })
  const back = await settle(() => countIn(page, ROW), (n) => n === PAGE, { timeoutMs: 15_000 })
  check('SHOW FEWER puts the page cap back', back === PAGE, String(back))
  check('…and stores the un-ask, not merely un-remembers it', (await storedValue(page, SHOW_ALL_KEY)) === '0')
  check('…and the paging button is on offer again', (await countIn(page, SHOW_MORE)) === 1)
}

/**
 * THE HEADLINE'S FIRST HALF: the tick is written under its key. The tab round trip that reads it
 * back is `stepBoxesAreIndependent`'s, with both boxes ticked at once (2026-11-27 trim: every box
 * goes through the same `useStoredFlag`, so one round trip with both keys set proves the remount
 * read for each; a round trip per box re-proved the same hook).
 */
async function stepSticksAcrossTabs(page: Page): Promise<void> {
  const ticked = await setBox(page, true)
  if (!check('the box ticks when clicked', ticked === true, String(ticked))) return
  const stored = await settle(() => storedValue(page), (v) => v === '1', { timeoutMs: 8_000 })
  check(`the tick is stored under ${KEY}`, stored === '1', `stored ${String(stored)}`)
}

/**
 * The other direction, and the reason this is a PREFERENCE rather than a latch: the un-tick is
 * WRITTEN. A "sticky" implementation that only ever remembered `true` (a write that skipped
 * `false`) fails here. The READ of a stored '0' as unticked is proved after a new process in
 * `stepSurvivesRestart` (the JOS-145 box crosses the restart unticked, through the same hook).
 */
async function stepUntickSticksToo(page: Page): Promise<void> {
  const unticked = await setBox(page, false)
  if (!check('the box un-ticks when clicked again', unticked === false, String(unticked))) return
  const stored = await settle(() => storedValue(page), (v) => v === '0', { timeoutMs: 8_000 })
  check('…and the un-tick is stored too, not merely un-remembered', stored === '0', `stored ${String(stored)}`)
}

/**
 * THE JOS-145 PAIR: two hide-boxes, two keys, two answers that never move together.
 *
 * The owner asked for the OTHER reading of done ("hide quests I have ever turned in") as an
 * OPTION beside the one JOS-131 chose, not instead of it. That makes independence the promise
 * worth a spec: what would silently break the ask is a shared key or a shared bit, and both would
 * pass every assertion in this file that looks at one box at a time. So every step below reads
 * BOTH boxes and BOTH stored values — ticking one leaves the other exactly where it was, and the
 * round trip returns the pair rather than one of them.
 *
 * WHICH QUESTS EACH BOX REMOVES is not asserted here; that needs a quest with a turn-in on it,
 * which means a log, which is tests/e2e/sky-turnin.e2e.mts (it hands one in and watches the two
 * boxes disagree about it). The subject here is the STATE, as everywhere else in this file.
 *
 * Leaves BOTH boxes explicitly unticked, which is what the facet steps and `stepArmRestart` below
 * expect to start from.
 */
async function stepBoxesAreIndependent(page: Page): Promise<void> {
  const ticked = await setBox(page, true, TURNED_IN_BOX)
  if (!check('"Hide turned in" ticks when clicked', ticked === true, String(ticked))) return
  const stored = await settle(() => storedValue(page, TURNED_IN_KEY), (v) => v === '1', { timeoutMs: 8_000 })
  check(`the tick is stored under ${TURNED_IN_KEY}`, stored === '1', `stored ${String(stored)}`)
  check(
    'TICKING ONE BOX DOES NOT TICK THE OTHER — two readings, two bits',
    (await boxState(page)) === false && (await storedValue(page)) === '0',
    `completed box ${String(await boxState(page))} / stored ${String(await storedValue(page))}`
  )

  // Both at once, because "independent" has to survive them being on together. This is the
  // spec's ONE tab round trip for the boxes (the per-box trips were cut 2026-11-27, see
  // `stepSticksAcrossTabs`); the boxes crossing in DIFFERENT states is `stepSurvivesRestart`'s.
  if (!check('the older box ticks alongside it', (await setBox(page, true)) === true)) return
  const pair = await settle(
    () => Promise.all([storedValue(page), storedValue(page, TURNED_IN_KEY)]),
    ([a, b]) => a === '1' && b === '1',
    { timeoutMs: 8_000 }
  )
  check('both preferences are stored, separately', pair.join('|') === '1|1', pair.join('|'))
  if (!(await awayAndBack(page))) return
  const both = await settle(
    () => Promise.all([boxState(page), boxState(page, TURNED_IN_BOX)]),
    ([a, b]) => a !== null && b !== null,
    { timeoutMs: 8_000 }
  )
  check('BOTH BOXES COME BACK TICKED, TOGETHER', both.join('|') === 'true|true', both.join('|'))

  // Hand the rest of the launch the unticked pair it expects.
  check('the pair un-ticks again', (await setBox(page, false)) === false)
  check('…both of them', (await setBox(page, false, TURNED_IN_BOX)) === false)
}

/**
 * THE JOS-124 ASK, in the reporter's words: a filter for Sky by boss/island. Pick an island, and
 * the list is the quests that island holds; pick a boss on top of it and it is the quests that
 * boss stands in front of ON that island — the two facets AND, so one more chip always narrows.
 *
 * Returns the UNFILTERED count so the clearing step can prove it came back, or null when the
 * counts line never appeared (in which case nothing below it is assertable).
 */
async function stepFacetsNarrow(page: Page): Promise<number | null> {
  const all = await settle(() => filteredCount(page), (n) => n !== null && n > 0, { timeoutMs: 30_000 })
  if (!check('the counts line states how many quests the filters leave', all !== null && all > 0, String(all))) {
    return null
  }

  await pick(page, ISLAND, 'Island 7')
  const kept = await settle(() => storedValue(page, ISLANDS_KEY), (v) => v === '["Island 7"]', { timeoutMs: 8_000 })
  if (!check(`the island pick is stored under ${ISLANDS_KEY}`, kept === '["Island 7"]', String(kept))) return null
  const island = await settle(() => filteredCount(page), (n) => n !== null && n < all, { timeoutMs: 8_000 })
  check('PICKING AN ISLAND NARROWS THE LIST', island !== null && island > 0 && island < all, `${String(all)} -> ${String(island)}`)

  await pick(page, BOSS, 'Spiroc')
  const boss = await settle(() => storedValue(page, BOSSES_KEY), (v) => v === '["The Spiroc Lord"]', { timeoutMs: 8_000 })
  check(`the boss pick is stored under ${BOSSES_KEY}`, boss === '["The Spiroc Lord"]', String(boss))
  // The boss picker is its own control and key, so its narrowing is its own wiring check (and the
  // settled count the remount below must come back to). The AND semantics behind it are
  // `filterByFacets`'s (tests/questFacets.test.mts, 'AND across the dimensions: one more chip
  // always narrows').
  const narrower = island ?? all
  const both = await settle(() => filteredCount(page), (n) => n !== null && n < narrower, { timeoutMs: 8_000 })
  check(
    'PICKING A BOSS NARROWS THE LIST',
    both !== null && both > 0 && both < narrower,
    `${String(island)} -> ${String(both)}`
  )

  if (!(await awayAndBack(page))) return null
  check(
    'THE ISLAND AND BOSS PICKS SURVIVE LEAVING AND RETURNING TO THE SKY TAB',
    (await settle(() => chipsIn(page, ISLAND), (c) => c.length > 0, { timeoutMs: 8_000 })).join() === 'Island 7' &&
      (await chipsIn(page, BOSS)).join() === 'The Spiroc Lord',
    `${(await chipsIn(page, ISLAND)).join()} / ${(await chipsIn(page, BOSS)).join()}`
  )
  const after = await settle(() => filteredCount(page), (n) => n === both, { timeoutMs: 8_000 })
  check('…and so does the narrowing they were doing', after === both, `${String(both)} -> ${String(after)}`)
  return all
}

/**
 * Clearing restores everything — the other half of the ask, and the half a "sticky" filter gets
 * wrong: a pick that survives a tab switch but leaves a chip nothing can remove is a trap rather
 * than a filter. Cleared by backspace, the way the picker itself offers.
 */
async function stepFacetsClear(page: Page, all: number): Promise<void> {
  await clearPick(page, BOSS)
  await clearPick(page, ISLAND)
  const stored = await settle(
    () => Promise.all([storedValue(page, ISLANDS_KEY), storedValue(page, BOSSES_KEY)]),
    ([i, b]) => i === '[]' && b === '[]',
    { timeoutMs: 8_000 }
  )
  check('clearing both pickers empties both stored picks', stored.join('|') === '[]|[]', stored.join('|'))
  // That empty picks filter nothing is `filterByFacets`'s value (tests/questFacets.test.mts, 'empty
  // is NO FILTER, and hands back the caller's own array untouched'); the wait stays so the next
  // step starts from the whole list.
  await settle(() => filteredCount(page), (n) => n === all, { timeoutMs: 8_000 })
}

/**
 * THE JOS-207 ASK: the search box finds bosses too — as WIRING only, since 2026-11-27.
 *
 * Which quests a boss name finds, and that typing a name equals picking it, are values of
 * `filterByQuery`/`filterByFacets` over the committed data: tests/questSearch.test.mts 'where a
 * boss name appears nowhere else, typing it and picking it give the same list', 'JOS-207 — typing
 * an island finds the quests that name it' and '…and the same for every island offered'. The
 * picker-vs-search equalities this step used to drive (four picks, four clears) re-checked those
 * values through the UI. What stays is the one thing only the app shows: the box reaches the list.
 * `Gorgalosk` appears in no quest name, reward or item name, so a narrowing here can only come
 * from the boss facts the box now reads.
 *
 * Ends with the box cleared, so `stepArmRestart` below still starts from the long list it expects.
 */
async function stepSearchFindsBosses(page: Page, all: number): Promise<void> {
  await page.fill(SEARCH, BOSS_NAME)
  const typed = await settle(() => filteredCount(page), (n) => n !== null && n < all, { timeoutMs: 15_000 })
  check(
    `TYPING ${BOSS_NAME} INTO THE SEARCH BOX NARROWS THE LIST to the quests he stands in front of`,
    typed !== null && typed > 0 && typed < all,
    `${String(all)} -> ${String(typed)}`
  )
  await page.fill(SEARCH, '')
  await settle(() => filteredCount(page), (n) => n === all, { timeoutMs: 15_000 })
}

/**
 * Leave the box ticked and an island picked for launch 2 — the restart half reads what this
 * launch wrote, and both kinds of preference (a bit, a list) make the same promise.
 *
 * The JOS-145 box is deliberately left UNTICKED, so the pair crosses the process boundary in
 * DIFFERENT states: one shared key or one shared bit would come back as two ticks, and the
 * restart is the last place that could still be hiding.
 */
async function stepArmRestart(page: Page): Promise<boolean> {
  // JOS-191 rides along: the facets were just cleared, so the list is long again and the footer is
  // offering "Show all". Arming it here is what lets the restart step prove the CAP is off after a
  // new process, rather than only that a bit crossed the boundary.
  await page.click(SHOW_ALL, { timeout: 15_000 })
  check(
    'the "show all" ask is armed for the restart check',
    (await settle(() => storedValue(page, SHOW_ALL_KEY), (v) => v === '1', { timeoutMs: 8_000 })) === '1'
  )
  const ticked = await setBox(page, true)
  await pick(page, ISLAND, 'Island 3')
  check(
    'the two boxes are left in DIFFERENT states for the restart check',
    ticked === true && (await boxState(page, TURNED_IN_BOX)) === false
  )
  return check('the box is left ticked for the restart check', ticked === true, String(ticked))
}

/** THE RESTART: a second process, the same userData dir, the same answer. */
async function stepSurvivesRestart(page: Page): Promise<void> {
  if (!check('the Sky tab opens after a restart', await openSky(page))) return
  const after = await settle(() => boxState(page), (v) => v !== null, { timeoutMs: 8_000 })
  check('HIDE COMPLETED SURVIVES A FULL RESTART', after === true, String(after))
  check('…and the stored pref crossed the process boundary intact', (await storedValue(page)) === '1')
  check(
    'THE TWO BOXES CROSS A RESTART SEPARATELY — one ticked, one not, exactly as left',
    (await boxState(page, TURNED_IN_BOX)) === false && (await storedValue(page, TURNED_IN_KEY)) === '0',
    `${String(await boxState(page, TURNED_IN_BOX))} / ${String(await storedValue(page, TURNED_IN_KEY))}`
  )
  const chips = await settle(() => chipsIn(page, ISLAND), (c) => c.length > 0, { timeoutMs: 8_000 })
  check('THE ISLAND FILTER SURVIVES A FULL RESTART, chip and all', chips.join() === 'Island 3', chips.join())

  // JOS-191, the far end: the bit crossed, and so did what it MEANS. Clearing the island widens the
  // list back past a page — which is also the moment the cap used to reset — and every row is drawn.
  check('"show all" crossed the process boundary', (await storedValue(page, SHOW_ALL_KEY)) === '1')
  await clearPick(page, ISLAND)
  const all = await settle(() => filteredCount(page), (n) => n !== null && n > PAGE, { timeoutMs: 15_000 })
  if (!check('clearing the island leaves more than one page of quests', all !== null && all > PAGE, String(all))) {
    return
  }
  const rows = await settle(() => countIn(page, ROW), (n) => n === all, { timeoutMs: 15_000 })
  check('SHOW ALL SURVIVES A FULL RESTART — the whole list draws, uncapped', rows === all, `${String(rows)} of ${String(all)}`)
}

async function main(): Promise<void> {
  buildIfStale()

  // OWNED BY THIS SPEC, not by either launch: the restart assertion IS the dir outliving a
  // process, so `launchApp` must not delete what it did not create.
  const userData = makeUserData()
  try {
    console.log('launch 1: a fresh install — default, tab round trip, the un-tick, the pair, and the facets…')
    const first = await launchApp({ userData })
    let page: Page | null = null
    try {
      page = await mainWindow(first.app)
      await page.waitForSelector(NAV_OVERVIEW, { timeout: 60_000 })
      if (!check('the Sky tab opens', await openSky(page))) {
        throw new Error('never reached the Plane of Sky tab — nothing below can be asserted')
      }
      await stepDefault(page)
      // JOS-191 first, while nothing is filtered and the list is at its longest.
      await stepShowAllSurvivesInteraction(page)
      await stepShowFewerPutsTheCapBack(page)
      // JOS-206 straight after it: the cap is back, so the list is one page of CLOSED rows again
      // (the quest the step above expanded was row 95 and the cap just unmounted it). The ORDER
      // used to be the whole of this step's defence against the historical fold still remounting
      // the tab underneath — which it can be in the first seconds of a launch against a real log,
      // and which would close a row this step had just opened. Order alone was a bet, and it lost
      // six times (AGENTS.md's ledger): both expanded-row steps now hold the precondition
      // themselves, through `withStableMount`, and the order is kept only for what it was always
      // also worth — starting from a paged list of closed rows.
      await stepCollapsedRowsDrawNoPanel(page)
      await stepSticksAcrossTabs(page)
      await stepUntickSticksToo(page)
      await stepBoxesAreIndependent(page)
      const all = await stepFacetsNarrow(page)
      if (all !== null) {
        await stepFacetsClear(page, all)
        // JOS-207 right after the facets: it measures the box's narrowing against the cleared
        // list the step above just restored.
        await stepSearchFindsBosses(page, all)
      }
      await stepArmRestart(page)
      if (failures.length) await dumpArtifacts(page, 'sky-filters-FAIL')
    } finally {
      await first.close()
    }

    console.log('launch 2: the SAME userData dir, a new process — the tick must still be there…')
    const second = await launchApp({ userData })
    let restarted: Page | null = null
    try {
      restarted = await mainWindow(second.app)
      await restarted.waitForSelector(NAV_OVERVIEW, { timeout: 60_000 })
      await stepSurvivesRestart(restarted)
      if (failures.length) await dumpArtifacts(restarted, 'sky-filters-restart-FAIL')
    } finally {
      await second.close()
    }
  } finally {
    await removeUserData(userData)
  }

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})
