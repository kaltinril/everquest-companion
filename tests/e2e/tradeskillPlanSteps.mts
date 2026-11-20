/**
 * e2e steps: "Make an item" in the Tradeskills section, and the Maps tab opened at a merchant.
 * A STEP MODULE rather than a spec (the tradeskillLogSteps.mts precedent): the launched app, the
 * staged log and the open Tradeskills section are already standing in tradeskills.e2e.mts, which
 * calls `stepPlanner` last.
 *
 * What they hold:
 *   - Home draws the Make an item panel; its search finds the item a Home tile names as next, the
 *     result's name is the app's item link, and Plan opens the planner on it;
 *   - the plan names the item, lists the tradeskill it needs with the player's level, draws a way
 *     there for a skill that is short, and states no percentage anywhere (no chance is shown);
 *   - the count multiplies what to gather, and is remembered;
 *   - leaving by the menu and coming back reopens the plan; an item name opens its Loot page and
 *     Back returns to the plan;
 *   - "Plan this item" on a workbench's picked recipe opens the planner on that recipe's item,
 *     and its Back returns to that workbench;
 *   - where a "Show on map" link is drawn, it opens the Maps tab with a Back to Tradeskills, rings
 *     a pin when the zone's map is installed, and Back returns to the plan.
 *
 * Every claim is a property of what is on screen. The one name taken from the data, Fleeting
 * Quiver (the owner's own example), is searched for softly: when the data no longer holds it the
 * step says so in a note and checks nothing.
 *
 * Written on `tradeskill-planner` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle, settleGone } from './appHarness.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const VIEW = sel('tradeskills-view')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const PLANNER = sel('tradeskill-planner')
const PLAN = sel('tradeskill-plan')
const HEAD = sel('tradeskill-plan-head')
const SEARCH = sel('tradeskill-plan-search')
const RESULT = sel('tradeskill-plan-result')
const NAME = sel('planner-donor-name')

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

/** The item a search result row names, row by row. */
function resultNames(page: Page): Promise<string[]> {
  return page.evaluate(([row, name]) => [...document.querySelectorAll(row)].map((r) => r.querySelector(name)?.textContent ?? ''), [RESULT, NAME] as const)
}

/** Types into the planner's search box and picks the result named exactly `item`; false when none is. */
async function planByName(page: Page, item: string): Promise<boolean> {
  await page.fill(SEARCH, item)
  const names = await settle(() => resultNames(page), (ns) => ns.includes(item) || ns.length === 0, { timeoutMs: 15_000 })
  const at = names.indexOf(item)
  if (at < 0) return false
  await page.click(`${RESULT} >> nth=${String(at)} >> ${sel('tradeskill-plan-pick')}`)
  await settle(() => textOf(page, `${HEAD} ${NAME}`), (t) => t === item, { timeoutMs: 20_000 })
  return true
}

/** The Need column of the gather list, top to bottom. */
function gatherNeeds(page: Page): Promise<number[]> {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => Number(e.textContent)), sel('tradeskill-plan-gather-need'))
}

async function stepHomeSearch(page: Page): Promise<string> {
  if ((await countOf(page, HOME)) === 0) await page.click(sel('tradeskill-home'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  check('Home draws the Make an item panel', (await countOf(page, sel('tradeskill-plan-home'))) === 1)
  check('…with a count of the craftable items it searches', /\d[\d,]* craftable items/.test(await textOf(page, sel('tradeskill-plan-count'))))
  check('…and no result until something is typed', (await countOf(page, RESULT)) === 0)
  const item = await textOf(page, `${sel('tradeskill-tile-Jewelcrafting')} ${NAME}`)
  await page.fill(SEARCH, item)
  const names = await settle(() => resultNames(page), (ns) => ns.includes(item), { timeoutMs: 15_000 })
  check('the search finds the item a tile names as next', names.includes(item), `${item} in ${names.slice(0, 5).join(' | ')}`)
  check('…best match first', names[0] === item, names[0] ?? '')
  check("…each result's name is the app's item link", names.every((n) => n !== ''))
  await page.click(`${RESULT} >> nth=${String(Math.max(0, names.indexOf(item)))} >> ${sel('tradeskill-plan-pick')}`)
  const up = await settle(() => countOf(page, PLANNER), (n) => n === 1, { timeoutMs: 20_000 })
  check('Plan opens the planner', up === 1 && (await countOf(page, HOME)) === 0)
  check('…on that item', (await textOf(page, `${HEAD} ${NAME}`)) === item, item)
  check('…with the search cleared', (await page.inputValue(SEARCH)) === '')
  return item
}

async function stepPlanPanels(page: Page): Promise<void> {
  check('the plan draws What it takes', (await countOf(page, sel('tradeskill-plan-tree'))) === 1)
  const skills = await settle(() => countOf(page, sel('tradeskill-plan-skill')), (n) => n > 0, { timeoutMs: 20_000 })
  check('…and where the player stands in each tradeskill it needs', skills > 0)
  const first = await textOf(page, `${sel('tradeskill-plan-skill')} ${sel('tradeskill-plan-skill-level')}`)
  check("…the item's own tradeskill first, with the log's level", /^Jewelcrafting: \d+$/.test(first), first)
  const stand = await page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.dataset.stand ?? '', sel('tradeskill-plan-skill'))
  // The planned item is the recipe marked next: its trivial is above the level.
  check('…short of the trivial', stand === 'short', stand)
  const routes = await countOf(page, sel('tradeskill-plan-route'))
  check('a skill that is short gets a way there', routes > 0)
  const source = await textOf(page, sel('tradeskill-plan-route-source'))
  check('…that says where its steps come from', /Route steps from .+, by .+|wiki recipes that go trivial/.test(source), source)
  const panel = await textOf(page, sel('tradeskill-plan-skills'))
  check('no success chance is stated', !panel.includes('%') && (await countOf(page, sel('tradeskill-plan-chance-note'))) === 1)
}

async function stepGather(page: Page, item: string): Promise<void> {
  const heading = await textOf(page, sel('tradeskill-plan-gather-heading'))
  check('What to gather names the count and the item', heading === `What to gather for 1 ${item}`, heading)
  const one = await gatherNeeds(page)
  if (one.length === 0) {
    note('the planned recipe lists no material: the count was not changed')
    return
  }
  await page.fill(sel('tradeskill-plan-count-input'), '3')
  await settle(() => textOf(page, sel('tradeskill-plan-gather-heading')), (t) => t.includes('for 3 '), { timeoutMs: 15_000 })
  const three = await gatherNeeds(page)
  // A tool the combine gives back stays at one; every other need triples.
  check('the count multiplies every need', three.length === one.length && three.every((n, i) => n === (one[i] ?? 0) * 3 || (n === 1 && one[i] === 1)), `${one.join(',')} -> ${three.join(',')}`)
  check('…and a failed combine is said not to be counted', (await textOf(page, sel('tradeskill-plan-gather-note'))).includes('not been measured'))
}

async function stepRemembered(page: Page, item: string): Promise<void> {
  await page.click(sel('nav-overview'))
  await settleGone(page, VIEW, { timeoutMs: 15_000 })
  await page.click(NAV)
  const again = await settle(() => textOf(page, `${HEAD} ${NAME}`), (t) => t === item, { timeoutMs: 20_000 })
  check('leaving by the menu and coming back reopens the plan', again === item && (await countOf(page, PLANNER)) === 1, again)
  check('…with the count it was left at', (await textOf(page, sel('tradeskill-plan-gather-heading'))).includes('for 3 ') || (await countOf(page, sel('tradeskill-plan-gather-empty'))) === 1)

  await page.click(`${HEAD} ${NAME}`)
  const drilled = await settle(() => countOf(page, sel('loot-detail')), (n) => n === 1, { timeoutMs: 20_000 })
  check("the planned item's name opens its Loot page", drilled === 1)
  await page.click(sel('loot-back'))
  const back = await settle(() => textOf(page, `${HEAD} ${NAME}`), (t) => t === item, { timeoutMs: 20_000 })
  check('Back returns to the plan, not to Home or a workbench', back === item && (await countOf(page, PLANNER)) === 1, back)
}

async function stepFromWorkbench(page: Page): Promise<void> {
  await page.click(sel('tradeskill-plan-back'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  check('the planner leaves for Home', (await countOf(page, PLANNER)) === 0)
  check('…where the plan is offered again', (await countOf(page, sel('tradeskill-plan-continue'))) === 1)
  await page.click(`${sel('tradeskill-tile-Jewelcrafting')} button`)
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  await page.click(sel('tradeskill-tab-recipes'))
  const picked = await settle(() => textOf(page, `${sel('tradeskill-picked')} ${NAME}`), (t) => t !== '', { timeoutMs: 20_000 })
  await page.click(sel('tradeskill-plan-this'))
  const planned = await settle(() => textOf(page, `${HEAD} ${NAME}`), (t) => t === picked, { timeoutMs: 20_000 })
  check('Plan this item opens the planner on the picked recipe', planned === picked && (await countOf(page, BENCH)) === 0, `${planned} / ${picked}`)
  const label = await textOf(page, sel('tradeskill-plan-back'))
  check('…whose Back names the workbench it came from', label === 'Back to Jewelcrafting', label)
  await page.click(sel('tradeskill-plan-back'))
  const bench = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('…and returns to it', bench === 1 && (await textOf(page, sel('tradeskill-name'))) === 'Jewelcrafting')
  await page.click(sel('tradeskill-plan-this'))
  await settle(() => countOf(page, PLANNER), (n) => n === 1, { timeoutMs: 20_000 })
}

/** The owner's own example. Soft: a data refresh that drops the item turns this into a note. */
async function stepQuiverAndMap(page: Page): Promise<void> {
  if (!(await planByName(page, 'Fleeting Quiver'))) {
    note('the data holds no craftable Fleeting Quiver: the guide materials and the map link were not checked')
    return
  }
  const nodes = await settle(() => countOf(page, `${PLAN} ${sel('tradeskill-plan-node')}`), (n) => n > 0, { timeoutMs: 20_000 })
  check('Fleeting Quiver lists materials', nodes > 0, String(nodes))
  check('…a made one opened to its own recipe', (await countOf(page, `${PLAN} ${sel('tradeskill-plan-sub')}`)) > 0)
  if ((await countOf(page, sel('tradeskill-plan-guide-materials'))) === 1) {
    check('materials taken from the guide carry its credit', (await countOf(page, sel('tradeskill-plan-guide-credit'))) === 1)
  }
  const made = await countOf(page, sel('tradeskill-plan-get'))
  await page.click(`${sel('tradeskill-plan-get')} [role="button"] >> nth=0`)
  const closed = await settle(() => countOf(page, sel('tradeskill-plan-make')), (n) => n === 1, { timeoutMs: 15_000 })
  check('a made material can be closed, and opened again', closed === 1 && (await countOf(page, sel('tradeskill-plan-get'))) < made)
  await page.click(`${sel('tradeskill-plan-make')} [role="button"]`)
  await settle(() => countOf(page, sel('tradeskill-plan-get')), (n) => n === made, { timeoutMs: 15_000 })

  const link = `${sel('tradeskill-plan-tree')} ${sel('tradeskill-map-link')} [role="button"]`
  if ((await countOf(page, link)) === 0) {
    note('no merchant in the plan has a pin on the Maps tab: Show on map was not clicked')
    return
  }
  await page.click(`${link} >> nth=0`)
  const onMaps = await settle(() => countOf(page, sel('maps-back')), (n) => n === 1, { timeoutMs: 20_000 })
  check('Show on map opens the Maps tab with a Back', onMaps === 1)
  check('…that names the Tradeskills tab', (await textOf(page, sel('maps-back'))) === 'Back to Tradeskills')
  // The ring needs the zone's map: a machine with no map pack for it shows the zone picker instead.
  const drawn = await settle(() => countOf(page, sel('maps-surface')), (n) => n === 1, { timeoutMs: 20_000 })
  if (drawn === 1) {
    const ring = await settle(() => countOf(page, sel('maps-pane-marker')), (n) => n === 1, { timeoutMs: 20_000 })
    check("…with the merchant's pin ringed", ring === 1)
    check('…and the sidebar open, where the pins are drawn', (await countOf(page, sel('maps-pane'))) === 1)
  } else note('no map is installed for the merchant zone: the ring was not checked')
  await page.click(sel('maps-back'))
  const back = await settle(() => textOf(page, `${HEAD} ${NAME}`), (t) => t === 'Fleeting Quiver', { timeoutMs: 20_000 })
  check('Back from Maps returns to the plan', back === 'Fleeting Quiver' && (await countOf(page, PLANNER)) === 1, back)
  await page.click(sel('nav-maps'))
  await settleGone(page, VIEW, { timeoutMs: 15_000 })
  check('the Maps tab reached by the menu has no Back', (await countOf(page, sel('maps-back'))) === 0)
  await page.click(NAV)
  await settle(() => countOf(page, PLANNER), (n) => n === 1, { timeoutMs: 20_000 })
}

/** Make an item, from Home's search through the plan, the workbench's door and the map link. */
export async function stepPlanner(page: Page): Promise<void> {
  const item = await stepHomeSearch(page)
  await stepPlanPanels(page)
  await stepGather(page, item)
  await stepRemembered(page, item)
  await stepFromWorkbench(page)
  await stepQuiverAndMap(page)
}
