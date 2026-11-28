/**
 * e2e steps: "Only use materials I have" on the route, "Can make now" and "Missing on the wiki"
 * on the recipes tab, and the wiki page link (owner's rulings of 2026-11-20). A STEP MODULE, the
 * tradeskillRouteSteps.mts precedent: the launched app and the staged log are already standing in
 * tradeskills-log.e2e.mts, and that spec is at its line budget. It runs last, after the planner steps,
 * which leave the planner up.
 *
 * What it holds:
 *   - the route has an "Only use materials I have" switch; turning it on rebuilds the route from
 *     held recipes, the switch is remembered across a trip to another tab, and on a goal it does
 *     not change it is disabled and says which goals it is for;
 *   - the recipes tab's "Missing on the wiki" and "Can make now" switches each change what the
 *     table lists, and give it back when turned off;
 *   - no link anywhere on these screens leaves for a host other than eqlwiki.com.
 *
 * WHAT each switch keeps, the planner's can-make mark, the wiki gap lines and their links, the
 * held route's basis, cover and empty lines, and its no-forecast rule are the unit suite's
 * (owner, 2026-11-27: e2e proves wiring): tests/tradeskillHeld.test.mts and
 * tests/tradeskillWiki.test.mts.
 *
 * Every claim is a property of what is on screen, never a name or a count from the wiki data.
 *
 * Written on `tradeskill-held-wiki` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const PLANNER = sel('tradeskill-planner')
const ROUTE = sel('tradeskill-route')
const HELD_ONLY = sel('tradeskill-held-only')
const GAPS_ONLY = sel('tradeskill-wiki-gaps-only')
const CAN_MAKE_ONLY = sel('tradeskill-can-make-only')

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

/** Whether a switch (the testid sits on its root) is on, and whether it can be used. */
function switchState(page: Page, selector: string): Promise<{ on: boolean; disabled: boolean }> {
  return page.evaluate((s) => {
    const input = document.querySelector<HTMLInputElement>(`${s} input`)
    return { on: input?.checked === true, disabled: input?.disabled === true }
  }, selector)
}

/** The words beside a switch: its label holds the count. */
function switchLabel(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s)?.closest('label') as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

/** Every link under a selector that does not go to eqlwiki.com. */
function foreignLinks(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (s) => [...document.querySelectorAll<HTMLAnchorElement>(`${s} a[href]`)].map((a) => a.href).filter((href) => /^https?:/i.test(href) && !/^https:\/\/eqlwiki\.com\//i.test(href)),
    selector
  )
}

/** The planner the steps before left up: its mark against its own gather list, and the wiki line. */
async function checkPlanner(page: Page): Promise<void> {
  await page.click(NAV)
  const up = await settle(async () => (await countOf(page, PLANNER)) + (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 20_000 })
  check('the Tradeskills section is up', up > 0)
  if ((await countOf(page, sel('tradeskill-plan'))) === 0) {
    note('no item is planned when these steps start: the planner links were not checked')
  } else {
    const foreign = await foreignLinks(page, PLANNER)
    check('the planner links to no host but eqlwiki.com', foreign.length === 0, foreign.slice(0, 3).join(' | '))
  }
  if ((await countOf(page, PLANNER)) === 1) await page.click(sel('tradeskill-plan-back'))
}

/** The Jewelcrafting workbench, from Home or from another workbench. */
async function openBench(page: Page): Promise<void> {
  await settle(async () => (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 20_000 })
  if ((await countOf(page, BENCH)) === 1 && (await textOf(page, sel('tradeskill-name'))) !== 'Jewelcrafting') await page.click(sel('tradeskill-home'))
  if ((await countOf(page, BENCH)) === 0) {
    await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
    await page.click(`${sel('tradeskill-tile-Jewelcrafting')} button`)
  }
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
}

function heldOnlyOf(page: Page): Promise<string> {
  return page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.heldOnly ?? '', ROUTE)
}

/** "Only use materials I have": disabled with its reason, or a route made of held recipes only. */
async function checkHeldRoute(page: Page): Promise<void> {
  await page.click(sel('tradeskill-tab-route'))
  await settle(() => countOf(page, ROUTE), (n) => n === 1, { timeoutMs: 20_000 })
  await page.click(sel('tradeskill-goal-cheapest'))
  check('the route has an "Only use materials I have" switch', (await countOf(page, HELD_ONLY)) === 1)
  check('…named that', (await switchLabel(page, HELD_ONLY)).toLowerCase() === 'only use materials i have', await switchLabel(page, HELD_ONLY))
  const before = await switchState(page, HELD_ONLY)
  if (before.disabled) {
    note('no inventory dump and no depot line in the staged log: the held-only route itself was not checked')
    return
  }
  if (!before.on) await page.click(HELD_ONLY)
  const on = await settle(() => heldOnlyOf(page), (v) => v === 'true', { timeoutMs: 10_000 })
  check('turning it on rebuilds the route from held recipes only', on === 'true', on)

  await page.click(sel('nav-skills'))
  await page.click(NAV)
  await settle(() => countOf(page, ROUTE), (n) => n === 1, { timeoutMs: 20_000 })
  check('the switch is remembered across a trip to another tab', (await switchState(page, HELD_ONLY)).on)
  await page.click(sel('tradeskill-goal-explore'))
  const off = await settle(() => switchState(page, HELD_ONLY), (s) => s.disabled, { timeoutMs: 10_000 })
  check('on a goal it does not change the switch is disabled and says which goals it is for', off.disabled && /cheapest and fastest/i.test(await textOf(page, sel('tradeskill-held-only-why'))))
  // Left as it was found: Cheapest, the switch off.
  await page.click(sel('tradeskill-goal-cheapest'))
  await settle(() => switchState(page, HELD_ONLY), (s) => !s.disabled, { timeoutMs: 10_000 })
  await page.click(HELD_ONLY)
  await settle(() => heldOnlyOf(page), (v) => v === 'false', { timeoutMs: 10_000 })
}

/** The table's count line and its empty line, as one reading. */
function tableReading(page: Page): Promise<string> {
  return page.evaluate(
    ([count, empty]) => `${document.querySelector<HTMLElement>(count)?.innerText.trim() ?? ''}|${document.querySelector<HTMLElement>(empty)?.innerText.trim() ?? ''}`,
    [sel('tradeskill-count'), sel('tradeskill-empty')] as const
  )
}

/**
 * A recipes-tab switch is wired to the table: turning it on changes what the table states, and
 * turning it off gives the table back. WHICH lines each switch keeps is the unit suite's:
 * tests/tradeskillWiki.test.mts ("Missing on the wiki") and tests/tradeskillHeld.test.mts ("Can
 * make now").
 */
async function checkSwitchNarrows(page: Page, selector: string, name: string): Promise<void> {
  if ((await switchState(page, selector)).disabled) {
    note(`"${name}" is disabled on this log: its wiring was not checked`)
    return
  }
  const before = await tableReading(page)
  await page.click(selector)
  const after = await settle(() => tableReading(page), (r) => r !== before, { timeoutMs: 15_000 })
  check(`"${name}" changes what the recipe table lists`, after !== before, `${before} -> ${after}`)
  await page.click(selector)
  const back = await settle(() => tableReading(page), (r) => r === before, { timeoutMs: 15_000 })
  check('…and turning it off gives the table back', back === before, back)
}

/** The owner's three rulings of 2026-11-20 on the Jewelcrafting workbench and the planner. */
export async function stepHeldAndWiki(page: Page): Promise<void> {
  await checkPlanner(page)
  await openBench(page)
  await checkHeldRoute(page)
  await page.click(sel('tradeskill-tab-recipes'))
  const up = await settle(() => countOf(page, GAPS_ONLY), (n) => n === 1, { timeoutMs: 20_000 })
  check('the recipes tab is up with its switches', up === 1)
  if (up !== 1) return
  check('the recipes tab has a "Missing on the wiki" switch with a count', /^wiki is missing info \(\d+\)$/i.test(await switchLabel(page, GAPS_ONLY)), await switchLabel(page, GAPS_ONLY))
  await checkSwitchNarrows(page, GAPS_ONLY, 'Missing on the wiki')
  check('the recipes tab has a "Can make now" switch', /^can make now/i.test(await switchLabel(page, CAN_MAKE_ONLY)), await switchLabel(page, CAN_MAKE_ONLY))
  await checkSwitchNarrows(page, CAN_MAKE_ONLY, 'Can make now')
  const foreign = await foreignLinks(page, BENCH)
  check('the workbench links to no host but eqlwiki.com', foreign.length === 0, foreign.slice(0, 3).join(' | '))
}
