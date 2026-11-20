/**
 * e2e steps: the player's own log, the history tab and the guides tab on a Tradeskills workbench
 * (fork #6). A STEP MODULE rather than a spec, the customPhraseSteps.mts precedent: the launched
 * app, the staged log and the open Tradeskills section are already standing in
 * tradeskills.e2e.mts, and that spec is at its line budget.
 *
 * What they hold:
 *   - combines, a raise, the game's trivial notice, purchases, a sale and a depot draw appended to
 *     the log show on the picked recipe, on its line and in the workbench's head;
 *   - the history tab lists the items combined, in place of the recipe book, and a row opens its
 *     recipe on the recipes tab;
 *   - the guides tab places the level on the leveling guide's route once, after the steps it has
 *     finished, credits the guide, and is the tab the workbench reopens on.
 *
 * Every claim is a property of what is on screen: the recipe is whichever one is marked next.
 *
 * Written on `workbench-data` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'
import type { FixtureLog } from './logFixture.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const HOME = sel('tradeskills-home')
const ROW = sel('tradeskill-recipe-row')
const PICKED = sel('tradeskill-picked')
const SCROLL = sel('tradeskill-recipes-scroll')

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

const TAB = (id: string): string => sel(`tradeskill-tab-${id}`)

/** The picked recipe's item and its materials' names, as the panel draws them. */
function pickedNames(page: Page): Promise<{ item: string; materials: string[] }> {
  return page.evaluate(
    ([panel, material]) => {
      // No named helper in here: the runner's bundler wraps one in `__name`, which the page lacks.
      const box = document.querySelector(panel)
      const donor = '[data-testid="planner-donor-name"]'
      return {
        item: box?.querySelector(donor)?.textContent ?? '',
        materials: [...(box?.querySelectorAll(material) ?? [])].map((el) => el.querySelector(donor)?.textContent ?? '').filter((n) => n !== '')
      }
    },
    [PICKED, sel('tradeskill-material')] as const
  )
}

/**
 * The player's own log on the workbench. The recipe marked next is picked, then the log is given
 * purchases of each of its materials, two made combines (one with a raise, one after the game's
 * trivial notice), a failed one, a sale and a depot draw; the panel, the line, the head and the
 * history tab must then say exactly that.
 */
export async function stepOwnLog(page: Page, log: Pick<FixtureLog, 'appendAt'>, level: number): Promise<string | null> {
  await page.click(sel('tradeskill-home'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  await page.click(`${sel('tradeskill-tile-Jewelcrafting')} button`)
  await settle(() => countOf(page, `${ROW}[data-state="next"]`), (n) => n === 1, { timeoutMs: 20_000 })
  await page.click(`${ROW}[data-state="next"] >> td >> nth=0`)
  const { item, materials } = await pickedNames(page)
  if (item === '' || materials.length === 0) {
    note('the recipe marked next lists no wiki material: the own-log step did not run')
    return null
  }
  const at = (seconds: number): Date => new Date(Date.now() + seconds * 1000)
  const made = `You have fashioned the items together to create something new: ${item}.`
  log.appendAt(at(1), ...materials.map((m) => `You purchased 2 ${m} from Jeweler Anvo for  21 platinum.`))
  // A raise pairs with the combine of its own second.
  log.appendAt(at(2), made, `You have become better at Jewelry Making! (${String(level + 1)})`)
  log.appendAt(at(4), `You lacked the skills to fashion ${item}.`)
  // The trivial notice is claimed by the next combine within a second.
  log.appendAt(at(6), 'You can no longer advance your skill from making this item.', made)
  log.appendAt(at(8), `You receive 30 platinum from Jeweler Anvo for the ${item}(s).`)
  log.appendAt(at(9), `Consumed 1 x ${materials[0] ?? ''} (leaving 7) from your personal depot.`)

  const you = await settle(() => textOf(page, sel('tradeskill-picked-you')), (t) => t.includes('made 2, failed 1'), { timeoutMs: 30_000 })
  check('the panel states the combines the log shows of the picked recipe', you.includes('made 2, failed 1'), you)
  check('…with the raise a combine gave', you.includes('1 raise'), you)
  check("…and the game's own trivial notice as its own mark", (await countOf(page, `${PICKED} ${sel('tradeskill-notice-chip')}`)) === 1)
  const line = await textOf(page, `${ROW}.Mui-selected ${sel('tradeskill-row-you')}`)
  check('the recipe line states the same', line.includes('made 2, failed 1'), line)
  const paid = await page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.innerText), `${PICKED} ${sel('tradeskill-material-paid')}`)
  check('each material says where it was last bought and for how much', paid.length === materials.length && paid.every((t) => t.includes('10.50 pp') && t.includes('Jeweler Anvo')), paid.join(' | '))
  const cost = await textOf(page, sel('tradeskill-picked-cost'))
  check('the cost of one combine is stated from those prices', /^your log\s*One combine costs \d+\.\d+ pp/.test(cost), cost)
  const sale = await textOf(page, sel('tradeskill-picked-sale'))
  check('…and what a merchant last paid for the result', sale.includes('30.00 pp') && sale.includes('Jeweler Anvo'), sale)
  check('the line carries the cost and the sale', (await textOf(page, `${ROW}.Mui-selected ${sel('tradeskill-row-cost')}`)).endsWith(' pp') && (await textOf(page, `${ROW}.Mui-selected ${sel('tradeskill-row-sells')}`)) === '30.00 pp')
  const have = await page.evaluate(
    (s) => {
      const first = document.querySelector(s)
      return { count: first?.querySelector('[data-testid="tradeskill-material-have"]')?.textContent ?? '', log: first?.querySelector('[data-testid="tradeskill-material-have-log"]') !== null }
    },
    `${PICKED} ${sel('tradeskill-material')}`
  )
  check("a depot count the log stated after the dump replaces the dump's, and is marked", have.count === '7' && have.log, JSON.stringify(have))
  const totals = /(\d+) combines in your log: (\d+) made, (\d+) failed/.exec(await textOf(page, sel('tradeskill-totals')))
  check('the head counts the combines of the tradeskill', totals !== null && Number(totals[1]) >= 3 && Number(totals[2]) + Number(totals[3]) === Number(totals[1]), totals?.[0] ?? 'no totals line')
  return item
}

/** "Your history": the totals and the item rows, and a row opens its recipe on the recipes tab. */
export async function stepHistory(page: Page, item: string): Promise<void> {
  await page.click(TAB('history'))
  const listed = await settle(() => countOf(page, sel('tradeskill-history-row')), (n) => n > 0, { timeoutMs: 15_000 })
  check('the history tab lists the items the log shows combined', listed > 0)
  check('…in place of the recipe book, not under it', (await countOf(page, SCROLL)) === 0)
  check('…with the totals above them', Number(await textOf(page, `${sel('tradeskill-history-combines')} h6`)) >= 3)
  const at = await page.evaluate(([s, name]) => [...document.querySelectorAll(s)].findIndex((r) => r.querySelector('[data-testid="planner-donor-name"]')?.textContent === name), [sel('tradeskill-history-row'), item] as const)
  check('…the picked recipe among them', at >= 0)
  if (at < 0) return
  // The Made cell: a click there opens the recipe and no link.
  await page.click(`${sel('tradeskill-history-row')} >> nth=${String(at)} >> td >> nth=1`)
  const back = await settle(() => textOf(page, `${PICKED} ${sel('planner-donor-name')}`), (t) => t === item, { timeoutMs: 15_000 })
  check('a history row opens its recipe on the recipes tab', back === item, back)
}

/** "From the guides": the route with the level placed on it, the credit, and the tab remembered. */
export async function stepGuides(page: Page, level: number): Promise<void> {
  await page.click(TAB('guides'))
  const steps = await settle(() => countOf(page, sel('tradeskill-guide-step')), (n) => n > 0, { timeoutMs: 15_000 })
  check("the guides tab draws the leveling guide's route", steps > 0)
  const placed = await page.evaluate(
    ([stepSel, markSel]) => {
      const all = [...document.querySelectorAll<HTMLElement>(`${stepSel}, ${markSel}`)]
      const mark = all.findIndex((e) => e.dataset.testid === 'tradeskill-guide-level')
      return { mark: mark < 0 ? '' : (all[mark]?.innerText ?? ''), before: all.slice(0, Math.max(0, mark)).map((e) => e.dataset.state ?? ''), markers: all.filter((e) => e.dataset.testid === 'tradeskill-guide-level').length }
    },
    [`${sel('tradeskill-guide-step')}:not(${sel('tradeskill-guide-alternates')} *)`, sel('tradeskill-guide-level')] as const
  )
  check('the level is placed on the route once', placed.markers === 1 && placed.mark.toLowerCase() === `your level: ${String(level + 1)}`, JSON.stringify(placed))
  check('…after the steps it has finished', placed.before.every((s) => s === 'done'), placed.before.join(','))
  const credit = await textOf(page, `${sel('tradeskill-guide')} ${sel('tradeskill-guide-credit')}`)
  check('the guide is credited under its route', /, by .+\(.+\)/.test(credit), credit)
  await page.click(sel('nav-skills'))
  await page.click(NAV)
  const kept = await settle(() => countOf(page, sel('tradeskill-guide')), (n) => n === 1, { timeoutMs: 20_000 })
  check('leaving by the menu and coming back reopens the same tab', kept === 1)
  await page.click(TAB('recipes'))
  check('…and the recipes tab is one click away', (await settle(() => countOf(page, SCROLL), (n) => n === 1, { timeoutMs: 15_000 })) === 1)
  // A material the recipe guide places is marked as the guide's, and then the panel credits it.
  const marked = await countOf(page, `${PICKED} ${sel('tradeskill-material-guide')}`)
  if (marked === 0) note('the recipe guide places none of the picked materials: the guide line and its credit were not checked')
  else check('a guide line in the panel brings the guide credit with it', (await countOf(page, `${PICKED} ${sel('tradeskill-guide-credit')}`)) === 1)
}
