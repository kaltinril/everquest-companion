/**
 * e2e steps: the Tradeskills Home after the owner's first look (2026-11-20): the level bars, the
 * subtitle, "Pick up where you left off", wishing a crafted item and "Working towards", the
 * sources line, and the Skills tab's door to the section. A STEP MODULE, the
 * tradeskillHeldSteps.mts precedent: the launched app and the staged log are already standing in
 * tradeskills-log.e2e.mts. It runs last.
 *
 * What it holds:
 *   - a not-in-log tile hides to the bottom line, the choice is stored, and it comes back;
 *   - "Pick up where you left off" names a tradeskill and its button opens that workbench, whose
 *     head carries the level bar;
 *   - the picked recipe has the app's wish control; a wished item is listed on Home under
 *     "Working towards" by the app's item link, its link opens Make an item on that item, and
 *     the planner's head carries the same control, which takes the wish off again;
 *   - the sources line is words: no link on Home leaves for a host other than eqlwiki.com;
 *   - the Skills tab's "Open Tradeskills" button opens the section.
 *
 * What the tiles, bars and lines SAY is tests/tradeskillHome.test.mts (owner, 2026-11-27).
 *
 * Every claim is a property of what is on screen, never a name or a count from the wiki data.
 *
 * Written on `tradeskills-home` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle, settleGone } from './appHarness.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const PLANNER = sel('tradeskill-planner')
const PICKED = sel('tradeskill-picked')
const NAME = sel('planner-donor-name')
const BAR = sel('tradeskill-bar')
const PICKUP = sel('tradeskills-pickup')
const WISHED_ROW = sel('tradeskills-wished-row')

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

/** A `data-*` value of the first match; '' when there is none. */
function dataOf(page: Page, selector: string, key: string): Promise<string> {
  return page.evaluate(([s, k]) => (document.querySelector(s) as HTMLElement | null)?.dataset[k] ?? '', [selector, key] as const)
}

/** Whichever screen of the section is up, go to Home. */
async function goHome(page: Page): Promise<boolean> {
  await page.click(NAV)
  await settle(async () => (await countOf(page, PLANNER)) + (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 20_000 })
  if ((await countOf(page, PLANNER)) > 0) await page.click(sel('tradeskill-plan-back'))
  await settle(async () => (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 15_000 })
  if ((await countOf(page, BENCH)) > 0) await page.click(sel('tradeskill-home'))
  return (await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })) === 1
}

interface UnseenPanel {
  name: string
  inGrid: boolean
  words: string
  numbers: number
  buttons: number
  bars: number
  fill: number
  next: number
}

/** The tiles of tradeskills the log never showed (`data-tile="unseen"`): where each sits and what it holds. */
function unseenPanels(page: Page): Promise<UnseenPanel[]> {
  return page.evaluate(
    ([doorSel, barSel]) =>
      [...document.querySelectorAll<HTMLElement>(doorSel)].map((door) => ({
        name: (door.dataset.testid ?? '').replace('tradeskill-tile-', ''),
        inGrid: door.parentElement?.dataset.testid === 'tradeskills-tiles',
        words: door.querySelector('[data-testid="tradeskill-tile-not-in-log"]')?.textContent ?? '',
        numbers: door.querySelectorAll('[data-testid="tradeskill-tile-level"]').length,
        buttons: door.querySelectorAll('button').length,
        bars: door.querySelectorAll(barSel).length,
        fill: Number(door.querySelector<HTMLElement>(barSel)?.dataset.fill ?? 'NaN'),
        next: door.querySelectorAll('[data-testid="tradeskill-tile-next"]').length
      })),
    ['[data-testid^="tradeskill-tile-"][data-tile="unseen"]', BAR] as const
  )
}

/** Every link under a selector that does not go to eqlwiki.com. */
function foreignLinks(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (s) => [...document.querySelectorAll<HTMLAnchorElement>(`${s} a[href]`)].map((a) => a.href).filter((href) => /^https?:/i.test(href) && !/^https:\/\/eqlwiki\.com\//i.test(href)),
    selector
  )
}

/**
 * Home's sources line is words: no link on Home leaves for another host. What Home's tiles, bars,
 * scales, "Not in log" tiles, subtitle and sources line SAY is tests/tradeskillHome.test.mts
 * (owner, 2026-11-27: e2e proves wiring); the level reaching a tile is tradeskills.e2e.mts.
 */
async function checkHome(page: Page): Promise<void> {
  check('no link on Home leaves for another host', (await foreignLinks(page, HOME)).length === 0)
}

/** Hides one not-in-log tile, finds it on the bottom line, and brings it back, leaving Home as it was. */
async function checkHideTile(page: Page): Promise<void> {
  const [first] = await unseenPanels(page)
  if (first === undefined) {
    note('the log has shown every tradeskill: no tile to hide, the Hide steps did not run')
    return
  }
  const tile = sel(`tradeskill-tile-${first.name}`)
  const line = sel('tradeskills-hidden-line')
  const back = `${line} ${sel(`tradeskill-hidden-${first.name}`)}`
  check('nothing is on the hidden line until the player hides something', (await countOf(page, line)) === 0)
  await page.click(`${tile} ${sel('tradeskill-tile-hide')}`)
  check('Hide takes the tile out of the grid', await settleGone(page, tile, { timeoutMs: 10_000 }))
  check('…and puts it on the line at the bottom', (await settle(() => countOf(page, back), (n) => n === 1, { timeoutMs: 10_000 })) === 1)
  check('…without opening its workbench', (await countOf(page, BENCH)) === 0)
  const kept = await page.evaluate(() => localStorage.getItem('eq.tradeskills.hiddenTiles'))
  check('the choice is stored', (kept ?? '').includes(first.name), kept ?? 'nothing stored')
  await page.click(back)
  check('a click on the line brings the tile back', (await settle(() => countOf(page, tile), (n) => n === 1, { timeoutMs: 10_000 })) === 1)
  check('…and the empty line goes away', await settleGone(page, line, { timeoutMs: 10_000 }))
}

/** Opens the workbench "Pick up where you left off" names; false when the panel is not drawn. */
async function checkPickUp(page: Page): Promise<boolean> {
  const drawn = await settle(() => countOf(page, PICKUP), (n) => n === 1, { timeoutMs: 20_000 })
  if (drawn === 0) {
    note('"Pick up where you left off" is not drawn on this log: its button and the wish steps did not run')
    return false
  }
  const tradeskill = await dataOf(page, PICKUP, 'tradeskill')
  check('"Pick up where you left off" names a tradeskill', tradeskill !== '', tradeskill)
  await page.click(sel('tradeskills-pickup-open'))
  const up = await settle(() => textOf(page, sel('tradeskill-name')), (t) => t === tradeskill, { timeoutMs: 20_000 })
  check('…and one click opens that workbench', up === tradeskill, `${up} / ${tradeskill}`)
  check("the workbench's head carries the level bar", (await countOf(page, `${sel('tradeskill-level-bar')} ${BAR}`)) === 1)
  return true
}

/** Wishes the picked recipe's item, finds it on Home, opens its plan, and takes the wish off there. */
async function checkWish(page: Page): Promise<void> {
  const wish = `${PICKED} ${sel('tradeskill-wish')}`
  // The control is not drawn until the wish list has loaded.
  const ready = await settle(() => countOf(page, wish), (n) => n === 1, { timeoutMs: 20_000 })
  check('the picked recipe carries the wish control', ready === 1)
  if (ready === 0) return
  const item = await textOf(page, `${PICKED} ${NAME}`)
  if ((await dataOf(page, wish, 'wished')) === 'true') await page.click(wish)
  await settle(() => dataOf(page, wish, 'wished'), (w) => w === '', { timeoutMs: 10_000 })
  await page.click(wish)
  const on = await settle(() => dataOf(page, wish, 'wished'), (w) => w === 'true', { timeoutMs: 10_000 })
  check('a click puts the item on the wish list', on === 'true')

  if (!(await goHome(page))) return
  const listed = await settle(() => textOf(page, `${WISHED_ROW} ${NAME}`), (t) => t !== '', { timeoutMs: 20_000 })
  check('Home lists it under Working towards, by the item link', listed === item, `${listed} / ${item}`)
  check('…with what one takes', (await textOf(page, `${WISHED_ROW} ${sel('tradeskills-wished-materials')}`)) !== '')
  await page.click(`${WISHED_ROW} ${sel('tradeskills-wished-plan')} ${NAME}`)
  const planned = await settle(() => textOf(page, `${sel('tradeskill-plan-head')} ${NAME}`), (t) => t === item, { timeoutMs: 20_000 })
  check('a click on its name opens Make an item on that item', planned === item, `${planned} / ${item}`)

  const planWish = sel('tradeskill-plan-wish')
  const lit = await settle(() => dataOf(page, planWish, 'wished'), (w) => w === 'true', { timeoutMs: 10_000 })
  check("the planner's head carries the same control, already on", lit === 'true')
  await page.click(planWish)
  await settle(() => dataOf(page, planWish, 'wished'), (w) => w === '', { timeoutMs: 10_000 })
  if (!(await goHome(page))) return
  check('taking the wish off takes the item off Working towards', await settleGone(page, WISHED_ROW, { timeoutMs: 10_000 }))
}

async function checkSkillsDoor(page: Page): Promise<void> {
  await page.click(sel('nav-skills'))
  const door = sel('skills-open-tradeskills')
  const drawn = await settle(() => countOf(page, door), (n) => n === 1, { timeoutMs: 20_000 })
  check('the Skills tab has an Open Tradeskills button', drawn === 1)
  if (drawn === 0) return
  await page.click(door)
  const up = await settle(() => countOf(page, sel('tradeskills-view')), (n) => n === 1, { timeoutMs: 20_000 })
  check('…that opens the Tradeskills section', up === 1)
}

export async function stepHomeAndWish(page: Page): Promise<void> {
  if (!check('Home opens from any screen of the section', await goHome(page))) return
  await checkHome(page)
  await checkHideTile(page)
  if (await checkPickUp(page)) await checkWish(page)
  await checkSkillsDoor(page)
}
