/**
 * e2e steps: the Tradeskills Home after the owner's first look (2026-11-20): the level bars, the
 * subtitle, "Pick up where you left off", wishing a crafted item and "Working towards", the
 * sources line, and the Skills tab's door to the section. A STEP MODULE, the
 * tradeskillHeldSteps.mts precedent: the launched app and the staged log are already standing in
 * tradeskills-log.e2e.mts. It runs last.
 *
 * What it holds:
 *   - Home says what the section draws on, and every tile carries a level bar; a bar's fill is
 *     its own tile's level over the scale the tile states; a tradeskill the log never showed is
 *     not a tile but a small button under "Not in your log yet", with no bar and no next recipe;
 *   - "Pick up where you left off" names a tradeskill and its button opens that workbench, whose
 *     head carries the same bar;
 *   - the picked recipe has the app's wish control; a wished item is listed on Home under
 *     "Working towards" by the app's item link, its link opens Make an item on that item, and
 *     the planner's head carries the same control, which takes the wish off again;
 *   - the sources line is words: no link on Home leaves for a host other than eqlwiki.com;
 *   - the Skills tab's "Open Tradeskills" button opens the section.
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
const TILE = '[data-testid^="tradeskill-tile-"][class*="MuiCard"]'
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

interface TileBar {
  name: string
  level: string
  of: string
  bars: number
  fill: number
}

/** Each tile's level words and its bar, read off the page. */
function tileBars(page: Page): Promise<TileBar[]> {
  return page.evaluate(
    ([tileSel, barSel]) =>
      [...document.querySelectorAll<HTMLElement>(tileSel)].map((card) => ({
        name: (card.dataset.testid ?? '').replace('tradeskill-tile-', ''),
        level: card.querySelector('[data-testid="tradeskill-tile-level"]')?.textContent ?? '',
        of: card.querySelector('[data-testid="tradeskill-bar-of"]')?.textContent ?? '',
        bars: card.querySelectorAll(barSel).length,
        fill: Number(card.querySelector<HTMLElement>(barSel)?.dataset.fill ?? 'NaN')
      })),
    [TILE, BAR] as const
  )
}

interface SmallDoor {
  name: string
  inRow: boolean
  buttons: number
  bars: number
  next: number
}

/** The doors of tradeskills the log never showed (`data-tile="unseen"`): where each sits and what it holds. */
function smallDoors(page: Page): Promise<SmallDoor[]> {
  return page.evaluate(
    ([doorSel, barSel]) =>
      [...document.querySelectorAll<HTMLElement>(doorSel)].map((door) => ({
        name: (door.dataset.testid ?? '').replace('tradeskill-tile-', ''),
        inRow: door.closest('[data-testid="tradeskills-unseen"]') !== null,
        buttons: door.querySelectorAll('button').length,
        bars: door.querySelectorAll(barSel).length,
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

async function checkHome(page: Page): Promise<void> {
  const subtitle = await textOf(page, sel('tradeskills-subtitle'))
  check('Home says what the section draws on', /wiki/i.test(subtitle) && /guides/i.test(subtitle) && /log/i.test(subtitle), subtitle)
  // The levels arrive with the engine's skills module: wait for one before reading any bar.
  const tiles = await settle(() => tileBars(page), (ts) => ts.some((t) => t.level !== ''), { timeoutMs: 30_000 })
  check('every tile carries one level bar', tiles.length > 0 && tiles.every((t) => t.bars === 1), tiles.filter((t) => t.bars !== 1).map((t) => t.name).join(', '))
  const scaled = tiles.filter((t) => t.level !== '' && /^of \d+$/.test(t.of))
  check('a tile with a level states its scale', scaled.length > 0, `${String(scaled.length)} of ${String(tiles.length)}`)
  const off = scaled.filter((t) => Math.abs(t.fill - Math.min(1, Number(t.level) / Number(t.of.slice(3)))) > 0.002)
  check("…and its bar is filled to that level's share of it", off.length === 0, off.map((t) => `${t.name} ${t.level} ${t.of} ${String(t.fill)}`).join(' | '))
  check('a full tile is drawn only for a tradeskill the log has shown', tiles.every((t) => t.level !== ''), tiles.filter((t) => t.level === '').map((t) => t.name).join(', '))
  const small = await smallDoors(page)
  if (small.length === 0) note('the log has shown every tradeskill: the "Not in your log yet" row is not drawn and was not checked')
  else {
    const odd = small.filter((d) => !d.inRow || d.buttons !== 1 || d.bars !== 0 || d.next !== 0)
    check('a tradeskill the log never showed is one small button under "Not in your log yet", with no bar and no next recipe', odd.length === 0, odd.map((d) => d.name).join(', '))
    check('…under that heading', (await textOf(page, sel('tradeskills-unseen-heading'))) === 'Not in your log yet')
  }
  const sources = await textOf(page, sel('tradeskills-sources'))
  check('the foot of Home names the sources', sources.startsWith('Sources:') && /wiki data/i.test(sources) && /your own log/i.test(sources), sources)
  check('…as words: no link on Home leaves for another host', (await foreignLinks(page, HOME)).length === 0)
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
  if (await checkPickUp(page)) await checkWish(page)
  await checkSkillsDoor(page)
}
