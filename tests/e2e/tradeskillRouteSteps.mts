/**
 * e2e steps: the goal routes and the shopping list on a Tradeskills workbench ("Your route").
 * A STEP MODULE rather than a spec, the tradeskillLogSteps.mts precedent: the launched app, the
 * staged log and the Tradeskills section are already standing in tradeskills.e2e.mts, and that
 * spec is at its line budget. It runs last, after the own-log steps.
 *
 * What it holds:
 *   - the workbench has a "Your route" tab with five goals, Cheapest first (the fifth, Faction,
 *     has its own steps: tradeskillFactionSteps.mts);
 *   - a route lists steps from the level up, each stretch starting where the one before ended,
 *     with exactly one marked as the next step, and states what it is ranked on;
 *   - nothing on the route reads as a chance or a forecast;
 *   - the shopping list is for the next step, its needs follow the number of combines, and
 *     "Copy list" says the text reached the clipboard;
 *   - the goal is remembered across a trip to another tab, the community route is credited, and
 *     a step opens its recipe on the recipes tab.
 *
 * Every claim is a property of what is on screen, never a name or a count from the wiki data.
 *
 * Written on `tradeskill-routes` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const ROUTE = sel('tradeskill-route')
const STEP = sel('tradeskill-route-step')
const SHOP = sel('tradeskill-shopping')
const LINE = sel('tradeskill-shopping-line')
const COMBINES = sel('tradeskill-shopping-combines')
const goalButton = (id: string): string => sel(`tradeskill-goal-${id}`)
/** The first item link on the route, in document order: the first step's, on a route whose steps are wiki recipes. */
const FIRST_NAME = `${STEP} ${sel('planner-donor-name')}`

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

function goalOf(page: Page): Promise<string> {
  return page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.goal ?? '', ROUTE)
}

async function pickGoal(page: Page, id: string): Promise<boolean> {
  await page.click(goalButton(id))
  return (await settle(() => goalOf(page), (g) => g === id, { timeoutMs: 10_000 })) === id
}

/** The Jewelcrafting workbench, from wherever the steps before left the section. */
async function openBench(page: Page): Promise<void> {
  await page.click(NAV)
  await settle(async () => (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 20_000 })
  if ((await countOf(page, BENCH)) === 1 && (await textOf(page, sel('tradeskill-name'))) !== 'Jewelcrafting') await page.click(sel('tradeskill-home'))
  if ((await countOf(page, BENCH)) === 0) {
    await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
    await page.click(`${sel('tradeskill-tile-Jewelcrafting')} button`)
  }
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
}

/** Each listed stretch as [from, to], for the routes that climb ("205 to 218"). */
function stretches(page: Page): Promise<[number, number][]> {
  return page.evaluate(
    (s) =>
      [...document.querySelectorAll<HTMLElement>(s)]
        .map((e) => /^(\d+) to (\d+)$/.exec(e.innerText.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [Number(m[1]), Number(m[2])] as [number, number]),
    sel('tradeskill-route-range')
  )
}

function needs(page: Page): Promise<number[]> {
  return page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => Number(e.innerText.trim())), `${LINE} ${sel('tradeskill-shopping-need')}`)
}

async function setCombines(page: Page, n: number): Promise<void> {
  await page.fill(COMBINES, String(n))
}

/** The route itself: the goals, the steps from the level up, the next mark and the honest lines. */
async function checkRoute(page: Page): Promise<string> {
  check('the route tab has five goals', (await countOf(page, '[data-testid^="tradeskill-goal-"]')) === 5)
  const goals = (await textOf(page, sel('tradeskill-goals'))).toLowerCase()
  check('…Cheapest, Fastest, Explore, the community route and Faction', ['cheapest', 'fastest', 'explore', 'community route', 'faction'].every((g) => goals.includes(g)), goals)
  check('Cheapest is the goal a workbench opens on', (await goalOf(page)) === 'cheapest')
  const steps = await settle(() => countOf(page, STEP), (n) => n > 0, { timeoutMs: 20_000 })
  check('the route lists steps', steps > 0)
  check('…with exactly one marked as the next step', (await countOf(page, sel('tradeskill-route-next'))) === 1)
  check('…the first one', await page.evaluate(([s, mark]) => document.querySelector(s)?.querySelector(mark) != null, [STEP, sel('tradeskill-route-next')] as const))
  const level = Number(await textOf(page, sel('tradeskill-level')))
  const ranges = await stretches(page)
  check('the first stretch starts at the level', ranges[0]?.[0] === level, JSON.stringify(ranges[0]))
  check('…each stretch starts where the one before ended, going up', ranges.every(([from, to], i) => to > from && (i === 0 || from === ranges[i - 1]?.[1])), JSON.stringify(ranges))
  check('the route says what it is ranked on', (await textOf(page, sel('tradeskill-route-basis'))).length > 20)
  const text = await textOf(page, sel('tradeskill-route-list'))
  check('no step reads as a chance or a forecast', !/%|chance|expected|estimate/i.test(text), text.slice(0, 200))
  check('every step says why it was chosen', (await countOf(page, sel('tradeskill-route-why'))) === steps)
  return textOf(page, FIRST_NAME)
}

/** The shopping list: it is for the next step, follows the combines, and copies as text. */
async function checkShopping(page: Page, first: string): Promise<void> {
  check('the shopping list is beside the route', (await countOf(page, SHOP)) === 1)
  check("…for the route's next step", (await textOf(page, `${sel('tradeskill-shopping-for')} ${sel('planner-donor-name')}`)) === first, first)
  if ((await countOf(page, LINE)) === 0) {
    note('the next step lists no materials: the shopping lines, the combines and the copy were not checked')
    return
  }
  await setCombines(page, 1)
  const one = await settle(() => needs(page), (n) => n.length > 0 && n[0] !== undefined && n[0] > 0, { timeoutMs: 10_000 })
  await setCombines(page, 3)
  const three = await settle(() => needs(page), (n) => n[0] === (one[0] ?? 0) * 3 || n[0] === 1, { timeoutMs: 10_000 })
  // A tool the combine gives back is needed once whatever the number.
  check('the first material is needed three times over for three combines', three[0] === (one[0] ?? 0) * 3 || (one[0] === 1 && three[0] === 1), `${JSON.stringify(one)} then ${JSON.stringify(three)}`)
  check('the list ends in a total, or in why there is none', (await textOf(page, sel('tradeskill-shopping-total'))).length > 0)
  await page.click(sel('tradeskill-shopping-copy'))
  const copied = await settle(() => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.state ?? '', sel('tradeskill-shopping-copied')), (s) => s !== '', { timeoutMs: 8_000 })
  check('Copy list says the text reached the clipboard', copied === 'copied', copied)
}

/** The other goals, the memory of the pick, and a step opening its recipe. */
async function checkGoals(page: Page): Promise<void> {
  check('Fastest is one click away', await pickGoal(page, 'fastest'))
  const caveats = await page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.innerText).join(' '), sel('tradeskill-route-caveat'))
  check('…and says the failure rate is not measured', /not measured/i.test(caveats), caveats)
  check('the community route is a goal', await pickGoal(page, 'guide'))
  const credit = await settle(() => textOf(page, sel('tradeskill-route-credit')), (t) => t !== '', { timeoutMs: 10_000 })
  check('…credited to its author', /, by .+\(.+\)/.test(credit), credit)
  check('Explore is a goal', await pickGoal(page, 'explore'))
  const listed = (await countOf(page, sel('tradeskill-route-heading'))) + (await countOf(page, sel('tradeskill-route-empty')))
  check('…grouped under headings, or saying why it lists nothing', listed > 0)

  await page.click(sel('nav-skills'))
  await page.click(NAV)
  await settle(() => countOf(page, ROUTE), (n) => n === 1, { timeoutMs: 20_000 })
  check('leaving and coming back reopens the route tab on the goal last picked', (await goalOf(page)) === 'explore')

  check('…and Cheapest is one click back', await pickGoal(page, 'cheapest'))
  await settle(() => countOf(page, STEP), (n) => n > 0, { timeoutMs: 15_000 })
  const name = await textOf(page, FIRST_NAME)
  // The range cell: a click there opens the recipe and no item link.
  await page.click(`${STEP} >> nth=0 >> ${sel('tradeskill-route-range')}`)
  const picked = await settle(() => textOf(page, `${sel('tradeskill-picked')} ${sel('planner-donor-name')}`), (t) => t === name, { timeoutMs: 15_000 })
  check('a step opens its recipe on the recipes tab', picked === name && name !== '', `${name} / ${picked}`)
}

/** "Your route" on the Jewelcrafting workbench: the goals, the route, the shopping list. */
export async function stepRoute(page: Page): Promise<void> {
  await openBench(page)
  await page.click(sel('tradeskill-tab-route'))
  const up = await settle(() => countOf(page, ROUTE), (n) => n === 1, { timeoutMs: 20_000 })
  check('the workbench has a route tab', up === 1)
  if (up !== 1) return
  const first = await checkRoute(page)
  await checkShopping(page, first)
  await checkGoals(page)
}
