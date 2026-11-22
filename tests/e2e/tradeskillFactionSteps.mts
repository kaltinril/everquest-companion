/**
 * e2e steps: the Faction goal on a Tradeskills workbench's "Your route" tab.
 * A STEP MODULE rather than a spec, the tradeskillRouteSteps.mts precedent: the launched app, the
 * staged log and the Tradeskills section are already standing in tradeskills-log.e2e.mts. It runs
 * last: it leaves the Baking workbench open on the Faction goal.
 *
 * What it holds:
 *   - Faction is the fifth goal of the switch, and picking it draws either the turn-ins of a
 *     picked faction or one line saying no turn-in of the tradeskill raises one;
 *   - every row names a quest through a wiki link and states at least one raise, and the panel
 *     says what the order ranks on; what the rows do not know is behind "How to read this",
 *     closed until asked for;
 *   - rows the item's own page backs come before shared pages, and those before rows named on the
 *     quest page only;
 *   - nothing on the panel reads as a chance or a forecast;
 *   - the picked faction is one of a list, the goal opens on the list's first entry, and the pick
 *     is remembered across a trip to another tab;
 *   - a long list of changes is cut until "and N more" opens it in place;
 *   - the shopping list is for the first row, and "Shop for this" moves it to another row (both on
 *     the faction with the most recipes, which the pick step leaves up);
 *   - the faction's link opens the Factions tab, whose Back returns to the route.
 *
 * Every claim is a property of what is on screen, never a name or a count from the wiki data.
 *
 * Written on `tradeskill-faction` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const ROUTE = sel('tradeskill-route')
const PANES = sel('tradeskill-faction')
const ROW = sel('tradeskill-faction-row')
const NONE = sel('tradeskill-faction-none')
const OPTION = sel('tradeskill-faction-option')
const SHOP_FOR = `${sel('tradeskill-shopping-for')} ${sel('planner-donor-name')}`
/** The tradeskill the steps open: one whose made items quests take. If the data ever holds none, the one line is checked instead. */
const TRADESKILL = 'Baking'

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

function goalOf(page: Page): Promise<string> {
  return page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.goal ?? '', ROUTE)
}

function factionOf(page: Page): Promise<string> {
  return page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.faction ?? '', PANES)
}

/** The item name of the nth row. */
function rowName(page: Page, nth: number): Promise<string> {
  return page.evaluate(
    ([row, name, n]) => (document.querySelectorAll(row)[Number(n)]?.querySelector(name) as HTMLElement | null)?.innerText.trim() ?? '',
    [ROW, sel('planner-donor-name'), String(nth)] as const
  )
}

/** The route tab of the workbench, from wherever the steps before left the section. */
async function openRoute(page: Page): Promise<boolean> {
  await page.click(NAV)
  await settle(async () => (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 20_000 })
  if ((await countOf(page, BENCH)) === 1 && (await textOf(page, sel('tradeskill-name'))) !== TRADESKILL) await page.click(sel('tradeskill-home'))
  if ((await countOf(page, BENCH)) === 0) {
    await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
    await page.click(`${sel(`tradeskill-tile-${TRADESKILL}`)} button`)
  }
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 15_000 })
  await page.click(sel('tradeskill-tab-route'))
  return (await settle(() => countOf(page, ROUTE), (n) => n === 1, { timeoutMs: 20_000 })) === 1
}

/** The order's first key, `data-group` on each row: own, then shared, then questOnly. */
async function checkGroups(page: Page, rows: number): Promise<void> {
  const groups = await page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((r) => ['own', 'shared', 'questOnly'].indexOf(r.dataset.group ?? '')), ROW)
  check(
    "rows the item's own page backs come first, then shared pages, then rows named on the quest page only",
    groups.length === rows && groups.every((g, i) => g >= 0 && (i === 0 || (groups[i - 1] ?? 0) <= g)),
    JSON.stringify(groups)
  )
}

/** A long list of changes is cut to the picked faction's own and eight more until "and N more" opens it in place. */
async function checkLongList(page: Page): Promise<void> {
  const MORE = sel('tradeskill-faction-more')
  const long = page.locator(ROW).filter({ has: page.locator(MORE) }).first()
  if ((await long.count()) === 0) {
    note('no row of the picked faction lists more than nine changes: the cut list was not checked')
    return
  }
  const changes = long.locator(sel('tradeskill-faction-change'))
  const cut = await changes.count()
  check('a long list of changes shows the picked faction and at most eight more', cut > 0 && cut <= 9, String(cut))
  check('...the picked faction first', (await changes.first().getAttribute('data-picked')) === 'true')
  const more = Number(/(\d+)/.exec(await long.locator(MORE).innerText())?.[1] ?? 'NaN')
  await long.locator(`${MORE} [role="button"]`).click()
  const all = await settle(() => changes.count(), (n) => n > cut, { timeoutMs: 10_000 })
  check('"and N more" opens the whole list in place', all === cut + more, `${String(cut)} + ${String(more)} / ${String(all)}`)
  // Closed again, so the rows are as the steps after this one expect.
  await long.locator(`${MORE} [role="button"]`).click()
  await settle(() => changes.count(), (n) => n === cut, { timeoutMs: 10_000 })
}

/** The rows of the picked faction and the lines above them. */
async function checkRows(page: Page): Promise<number> {
  const rows = await settle(() => countOf(page, ROW), (n) => n > 0, { timeoutMs: 20_000 })
  check('the picked faction lists turn-ins', rows > 0)
  const quests = await page.evaluate((s) => [...document.querySelectorAll<HTMLAnchorElement>(s)].map((a) => a.href), `${ROW} ${sel('tradeskill-faction-quest')}`)
  check('every row names its quest through a wiki link', quests.length === rows && quests.every((href) => href.startsWith('https://eqlwiki.com/')), JSON.stringify(quests.slice(0, 3)))
  const raises = await page.evaluate(
    ([row, change]) => [...document.querySelectorAll(row)].map((r) => r.querySelectorAll(`${change}[data-up="true"]`).length),
    [ROW, sel('tradeskill-faction-change')] as const
  )
  check('every row states at least one raise', raises.length === rows && raises.every((n) => n > 0), JSON.stringify(raises))
  check('every row states its trivial', (await countOf(page, sel('tradeskill-faction-trivial'))) === rows)
  check('the panel says what the order ranks on', (await textOf(page, sel('tradeskill-faction-basis'))).length > 20)
  // The reading notes sit behind one control. A fresh profile has never opened it.
  const HOW = sel('tradeskill-faction-how')
  if ((await page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.open ?? '', HOW)) === 'true') {
    note('"How to read this" was already open when the step began: closed-by-default was not checked')
  } else {
    check('the reading notes are closed until asked for', (await countOf(page, sel('tradeskill-faction-caveat'))) === 0)
    await page.click(`${HOW} [role="button"]`)
  }
  await settle(() => countOf(page, sel('tradeskill-faction-caveat')), (n) => n > 0, { timeoutMs: 10_000 })
  const caveats = await page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.innerText).join(' '), sel('tradeskill-faction-caveat'))
  check('"How to read this" opens them in place: that a quest page states one list for the whole page', /one list of faction changes/i.test(caveats), caveats.slice(0, 200))
  check('...and that nothing is forecast', /nothing is forecast/i.test(caveats), caveats.slice(0, 200))
  await checkGroups(page, rows)
  const text = await textOf(page, sel('tradeskill-faction-list'))
  check('no row reads as a chance or a forecast', !/%|chance|expected|estimate|to reach/i.test(text), text.slice(0, 200))
  // A marked row carries its reason in words, not only the chip.
  const marked = await countOf(page, `${ROW}[data-shared="true"]`)
  check('a row marked as a shared page says why', (await countOf(page, sel('tradeskill-faction-shared'))) === marked, String(marked))
  return rows
}

/** The shopping list: for the first row, and for another row once the reader asks. */
async function checkShopping(page: Page, rows: number): Promise<void> {
  check('exactly one row carries the shopping list', (await countOf(page, sel('tradeskill-faction-shopping'))) === 1)
  const first = await rowName(page, 0)
  const shown = await settle(() => textOf(page, SHOP_FOR), (t) => t === first, { timeoutMs: 10_000 })
  check('the shopping list is for the first row', shown === first && first !== '', `${first} / ${shown}`)
  if (rows < 2) {
    note('the picked faction has one turn-in: moving the shopping list was not checked')
    return
  }
  const second = await rowName(page, 1)
  // The first row has no such button, so the first one on screen is the second row's.
  await page.click(`${sel('tradeskill-faction-shop')} >> nth=0`)
  const moved = await settle(() => textOf(page, SHOP_FOR), (t) => t === second, { timeoutMs: 10_000 })
  check('"Shop for this" puts the shopping list on that row', moved === second && second !== '', `${second} / ${moved}`)
  check('...and the mark moves with it', (await page.locator(ROW).nth(1).locator(sel('tradeskill-faction-shopping')).count()) === 1)
}

/**
 * The list of factions, and the memory of the pick. The entry picked is the one with the most
 * recipes that is not already up (the list's last when none has more than one), so the steps
 * after this one have several rows to read. Returns how many rows that faction draws.
 */
async function checkPick(page: Page): Promise<number> {
  const opened = await factionOf(page)
  await page.click(`${sel('tradeskill-faction-pick')} [role="combobox"]`)
  const options = await settle(() => countOf(page, OPTION), (n) => n > 0, { timeoutMs: 10_000 })
  check('the faction is picked from a list', options > 0)
  const entries = await page.evaluate(
    (s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => ({ faction: e.dataset.faction ?? '', text: e.innerText, recipes: Number(/(\d+) recipes?/.exec(e.innerText)?.[1] ?? '0') })),
    OPTION
  )
  check('...each entry saying how many recipes feed it', entries.every((e) => e.recipes > 0), JSON.stringify(entries.slice(0, 3).map((e) => e.text)))
  // Nothing is remembered for this tradeskill on a fresh profile: the goal opened on the list's first entry.
  check('the goal opened on the first faction of the list', opened !== '' && entries[0]?.faction === opened, `${entries[0]?.faction ?? ''} / ${opened}`)
  let at = entries.length - 1
  let most = 0
  entries.forEach((entry, i) => {
    if (entry.faction === opened || entry.recipes <= most) return
    most = entry.recipes
    at = i
  })
  const target = entries[at]?.faction ?? ''
  await page.click(`${OPTION} >> nth=${String(at)}`)
  const picked = await settle(() => factionOf(page), (f) => f === target, { timeoutMs: 10_000 })
  check('picking an entry draws that faction', picked === target && target !== '', `${target} / ${picked}`)

  await page.click(sel('nav-skills'))
  await page.click(NAV)
  await settle(() => countOf(page, PANES), (n) => n === 1, { timeoutMs: 20_000 })
  check('leaving and coming back keeps the Faction goal', (await goalOf(page)) === 'faction')
  check('...and the faction last picked', (await factionOf(page)) === target, target)
  return settle(() => countOf(page, ROW), (n) => n > 0, { timeoutMs: 20_000 })
}

/** The faction's door to the Factions tab, and the way back. */
async function checkFactionsTab(page: Page): Promise<void> {
  const before = await factionOf(page)
  await page.click(`${sel('tradeskill-faction-open')} [role="button"]`)
  const there = await settle(() => countOf(page, sel('factions-view')), (n) => n === 1, { timeoutMs: 20_000 })
  check("the faction's link opens the Factions tab", there === 1)
  if (there !== 1) return
  const back = await settle(() => textOf(page, sel('factions-back')), (t) => t !== '', { timeoutMs: 10_000 })
  // A button's label reads back in capitals.
  check('...which offers a Back to Tradeskills', /back to tradeskills/i.test(back), back)
  await page.click(sel('factions-back'))
  await settle(() => countOf(page, PANES), (n) => n === 1, { timeoutMs: 20_000 })
  check('Back returns to the route, on the Faction goal and the same faction', (await goalOf(page)) === 'faction' && (await factionOf(page)) === before, before)
}

/** The Faction goal on the Baking workbench: the list, the rows, the shopping list, the Factions tab. */
export async function stepFaction(page: Page): Promise<void> {
  if (!(await openRoute(page))) {
    check('the workbench has a route tab', false)
    return
  }
  check('the route tab has five goals', (await countOf(page, '[data-testid^="tradeskill-goal-"]')) === 5)
  await page.click(sel('tradeskill-goal-faction'))
  const goal = await settle(() => goalOf(page), (g) => g === 'faction', { timeoutMs: 10_000 })
  check('Faction is a goal', goal === 'faction', goal)
  const drawn = await settle(async () => (await countOf(page, PANES)) + (await countOf(page, NONE)), (n) => n > 0, { timeoutMs: 20_000 })
  check('the goal draws its turn-ins, or one line saying there is none', drawn === 1)
  if ((await countOf(page, NONE)) === 1) {
    check('...the line names the tradeskill', (await textOf(page, NONE)).includes(TRADESKILL))
    note(`no ${TRADESKILL} turn-in raises a faction in this data: the rows, the list and the Factions tab were not checked`)
    return
  }
  if ((await checkRows(page)) === 0) return
  // The pick step leaves the faction with the most recipes up: the long list and the shopping list are read there.
  const rows = await checkPick(page)
  await checkGroups(page, rows)
  await checkLongList(page)
  await checkShopping(page, rows)
  await checkFactionsTab(page)
}
