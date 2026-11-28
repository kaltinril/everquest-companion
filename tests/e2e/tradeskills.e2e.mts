/**
 * e2e: the Tradeskills section (fork #6). Home's tiles, a workbench's recipe book, and the links
 * out and back.
 *
 * What it holds, on a fixture log given a Jewelry Making level and an inventory dump:
 *   - the nav row sits under Research, and the open menu still fits the default window;
 *   - Home shows the log's level on the Jewelcrafting tile;
 *   - a tile opens its workbench, whose table scrolls to the recipe marked next, the one Home's
 *     tile named; the panel lists its materials, and item names are the app's standard item link;
 *   - an item name opens its Loot page and Back returns to the same workbench;
 *   - leaving by the menu and coming back reopens the workbench;
 *   - Have reads the dump's tradeskill depot;
 *   - links IN: a tradeskill's name on the Skills tab opens its workbench with a Back to Skills,
 *     and the Loot page's crafted note opens the workbench on that item's own recipe;
 *   - "Gear that raises this skill" lists items, each the standard item link, with whether the dump holds it, and
 *     its last link opens the Gear tab with the search box filled;
 *   - the player's own log, the routes, the planner and the rest: tradeskills-log.e2e.mts, the
 *     second half, with a launch of its own.
 *
 * Every claim about a recipe is a property of what is on screen, never a name or a count from the
 * wiki data, so a data refresh cannot turn it red.
 *
 * VALUES ARE THE UNIT SUITE'S (owner, 2026-11-27: e2e proves wiring). The ladder order, the next
 * mark, Hide trivial, the unrated heading, the search and its empty line are pinned by
 * tests/tradeskillBook.test.mts; the "Not in log" tile and its bar by tests/tradeskillHome.test.mts;
 * the gear panel's order and words by tests/tradeskillGear.test.mts. The search box and Hide
 * trivial are still driven here, by the Have and Loot steps.
 *
 * Run: `npm run test:e2e -- tradeskills` (both halves)
 */
import type { Page } from 'playwright-core'
import { buildIfStale, check, countOf, dumpArtifacts, failures, note, reportRun, settle, settleGone } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { E2E_LEVEL as LEVEL } from './tradeskillLogSteps.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const VIEW = sel('tradeskills-view')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const ROW = sel('tradeskill-recipe-row')
const PICKED = sel('tradeskill-picked')
const SCROLL = sel('tradeskill-recipes-scroll')
const tile = (name: string): string => sel(`tradeskill-tile-${name}`)

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

interface RowFacts {
  state: string
  trivial: number | null
  item: string
  text: string
  inView: boolean
}

/** The mounted recipe lines, in order, with whether each is inside the scroller's box. */
function rows(page: Page): Promise<RowFacts[]> {
  return page.evaluate(
    ([rowSel, scrollSel]) => {
      const box = document.querySelector(scrollSel)?.getBoundingClientRect()
      return [...document.querySelectorAll<HTMLElement>(rowSel)].map((r) => {
        const cells = r.querySelectorAll('td')
        const trivial = cells[0]?.textContent.trim() ?? ''
        const at = r.getBoundingClientRect()
        return {
          state: r.dataset.state ?? '',
          trivial: trivial === '' ? null : Number(trivial),
          item: r.querySelector('[data-testid="planner-donor-name"]')?.textContent ?? '',
          text: r.textContent.toLowerCase(),
          inView: box !== undefined && at.top >= box.top && at.bottom <= box.bottom + 1
        }
      })
    },
    [ROW, SCROLL] as const
  )
}

async function stepNav(page: Page): Promise<void> {
  check('the Tradeskills nav row is present', (await countOf(page, NAV)) === 1)
  const placed = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[data-testid^="nav-"]')].map((e) => e.getAttribute('data-testid'))
    const paper = document.querySelector<HTMLElement>('.MuiDrawer-paper')
    return {
      afterMaps: ids.indexOf('nav-tradeskills') === ids.indexOf('nav-maps') + 1,
      label: document.querySelector<HTMLElement>('[data-testid="nav-tradeskills"]')?.innerText.trim() ?? '',
      // `rows` is the height the menu's own blocks take: what is left of the drawer is the room for one more row.
      fit: paper === null ? null : { drawer: paper.clientHeight, menu: paper.scrollHeight, rows: [...paper.children].reduce((sum, c) => sum + (c as HTMLElement).offsetHeight, 0) }
    }
  })
  check('…under Research, right after Maps', placed.afterMaps)
  check('…named Tradeskills', placed.label === 'Tradeskills', placed.label)
  check('…and the open menu still fits the default window, with no scrollbar', placed.fit !== null && placed.fit.menu <= placed.fit.drawer, JSON.stringify(placed.fit))
  note(`left menu: ${JSON.stringify(placed.fit)}`)
}

async function stepHome(page: Page): Promise<string> {
  await page.click(NAV)
  const mounted = await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 20_000 })
  check('the Tradeskills view opens on Home', mounted === 1 && (await countOf(page, VIEW)) === 1)
  const level = await settle(() => textOf(page, `${tile('Jewelcrafting')} ${sel('tradeskill-tile-level')}`), (t) => t === String(LEVEL), { timeoutMs: 30_000 })
  check("the Jewelcrafting tile shows the log's Jewelry Making level", level === String(LEVEL), level)
  check('the old row of small buttons is gone', (await countOf(page, sel('tradeskills-unseen'))) === 0)
  const name = await settle(() => textOf(page, `${tile('Jewelcrafting')} ${sel('planner-donor-name')}`), (t) => t !== '', { timeoutMs: 15_000 })
  check("the next recipe's name is the app's item link", name !== '', name)
  return name
}

async function stepWorkbench(page: Page, tileNext: string): Promise<void> {
  await page.click(`${tile('Jewelcrafting')} button`)
  const up = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('a tile opens its workbench', up === 1)
  check('…named for the tradeskill', (await textOf(page, sel('tradeskill-name'))) === 'Jewelcrafting')
  check('…with the level', (await textOf(page, sel('tradeskill-level'))) === String(LEVEL))
  // The table places itself on the next recipe; a scroll in the hidden window lands late.
  const seen = await settle(() => rows(page), (rs) => rs.some((r) => r.state === 'next' && r.inView), { timeoutMs: 20_000 })
  const at = seen.findIndex((r) => r.state === 'next')
  const next = seen[at]
  check('one recipe is marked next', seen.filter((r) => r.state === 'next').length === 1)
  check('the table opens on it', next?.inView === true)
  check("…and it is the recipe Home's tile named", next?.item === tileNext, `${next?.item ?? ''} / ${tileNext}`)
  const materials = await countOf(page, `${PICKED} ${sel('tradeskill-material')}`)
  const noMaterials = await countOf(page, `${PICKED} ${sel('tradeskill-no-materials')}`)
  check('the panel lists its materials, or says the wiki lists none', materials > 0 || noMaterials === 1, `${String(materials)} materials`)
}

async function stepLinks(page: Page): Promise<void> {
  const item = await textOf(page, `${PICKED} ${sel('planner-donor-name')}`)
  await page.click(`${PICKED} ${sel('planner-donor-name')}`)
  const drilled = await settle(() => countOf(page, sel('loot-detail')), (n) => n === 1, { timeoutMs: 20_000 })
  check("an item name opens the item's Loot page", drilled === 1)
  check('…on that item', (await textOf(page, sel('loot-detail-title'))).startsWith(item), item)
  const label = await page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-label') ?? '', sel('loot-back'))
  check('…whose Back names the Tradeskills tab', label === 'Back to Tradeskills', label)
  await page.click(sel('loot-back'))
  const back = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('Back returns to the workbench, not to Home', back === 1 && (await textOf(page, sel('tradeskill-name'))) === 'Jewelcrafting')
  const again = await settle(() => textOf(page, `${PICKED} ${sel('planner-donor-name')}`), (t) => t === item, { timeoutMs: 15_000 })
  check('…on the same recipe', again === item, again)

  await page.click(sel('nav-overview'))
  await settleGone(page, VIEW, { timeoutMs: 15_000 })
  await page.click(NAV)
  const reopened = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('leaving by the menu and coming back reopens the workbench', reopened === 1 && (await textOf(page, sel('tradeskill-name'))) === 'Jewelcrafting')
  await stepDropLinks(page)
}

const navSelected = (page: Page, view: string): Promise<boolean> =>
  page.evaluate((s) => document.querySelector(s)?.classList.contains('Mui-selected') ?? false, sel(`nav-${view}`))

/** A dropped material's mob opens the mob's page, and its zone opens the Maps tab: the other tabs' own doors. */
async function stepDropLinks(page: Page): Promise<void> {
  const mob = `${PICKED} ${sel('tradeskill-material-drops')} ${sel('tradeskill-mob-link')} [role="button"]`
  const zone = `${PICKED} ${sel('tradeskill-material-drops')} ${sel('tradeskill-zone-link')} [role="button"]`
  if ((await countOf(page, mob)) === 0 || (await countOf(page, zone)) === 0) {
    note('the picked recipe lists no dropped material with a mob and a mapped zone: the mob and zone links were not clicked')
    return
  }
  await page.click(`${mob} >> nth=0`)
  const paged = await settle(() => countOf(page, sel('mobs-back')), (n) => n === 1, { timeoutMs: 20_000 })
  check("a dropped material's mob opens the mob's page", paged === 1)
  const label = await textOf(page, sel('mobs-back'))
  check('…whose Back names the Tradeskills tab', /tradeskills/i.test(label), label)
  await page.click(sel('mobs-back'))
  const back = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('…and Back returns to the workbench', back === 1 && (await textOf(page, sel('tradeskill-name'))) === 'Jewelcrafting')
  await settle(() => countOf(page, zone), (n) => n > 0, { timeoutMs: 15_000 })
  await page.click(`${zone} >> nth=0`)
  const mapped = await settle(() => navSelected(page, 'maps'), (on) => on, { timeoutMs: 20_000 })
  check("a drop's zone opens the Maps tab", mapped)
  await page.click(NAV)
  const reopened = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('…and coming back from Maps reopens the workbench', reopened === 1 && (await textOf(page, sel('tradeskill-name'))) === 'Jewelcrafting')
}

/** Brewing's Royal Temper takes Griffenne Blood, and the fixture dump's depot holds 2 of it. */
async function stepHave(page: Page): Promise<void> {
  await page.click(sel('tradeskill-home'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  await page.click(`${tile('Brewing')} button`)
  await settle(() => textOf(page, sel('tradeskill-name')), (t) => t === 'Brewing', { timeoutMs: 15_000 })
  check('a tradeskill the log never showed opens from level 0, and says so', (await countOf(page, sel('tradeskill-level-unseen'))) === 1)
  const before = (await rows(page)).length
  await page.fill(sel('tradeskill-search'), 'Griffenne Blood')
  const found = await settle(() => rows(page), (rs) => rs.length > 0 && rs.every((r) => r.text.includes('griffenne blood')), { timeoutMs: 15_000 })
  // THE SEARCH BOX IS WIRED: typing reaches the table. Which lines a query keeps is
  // tests/tradeskillBook.test.mts ('the search reads item and material names, ...').
  check('typing in the workbench search narrows the recipe list', found.length > 0 && found.length < before, `${String(before)} -> ${String(found.length)} lines`)
  if (found.length === 0) {
    note('no Brewing recipe takes Griffenne Blood in this data: the Have check did not run')
    return
  }
  const have = await settle(
    () =>
      page.evaluate((s) => {
        const line = [...document.querySelectorAll<HTMLElement>(s)].find((m) => m.textContent.includes('Griffenne Blood'))
        return line?.querySelector('[data-testid="tradeskill-material-have"]')?.textContent ?? ''
      }, `${PICKED} ${sel('tradeskill-material')}`),
    (t) => t !== '',
    { timeoutMs: 15_000 }
  )
  check("Have reads the dump's tradeskill depot", have === '2', have)
  check('…and the panel dates the dump', (await textOf(page, sel('tradeskill-have-date'))).startsWith('Have is from your inventory dump of'))
  await page.fill(sel('tradeskill-search'), '')
  await stepOpenInPlace(page)
}

/** Picks lines from the top until one has a material that is itself made, and opens it in place. */
async function stepOpenInPlace(page: Page): Promise<void> {
  const opener = `${PICKED} ${sel('tradeskill-material-open')}`
  const nested = `${PICKED} ${sel('tradeskill-subrecipe')}`
  const lines = await settle(() => countOf(page, ROW), (n) => n > 3, { timeoutMs: 15_000 })
  for (let i = 0; i < Math.min(lines, 25); i++) {
    // The trivial cell: a click there picks the line and opens no link.
    await page.click(`${ROW} >> nth=${String(i)} >> td >> nth=0`)
    const found = await settle(() => countOf(page, opener), (n) => n > 0, { timeoutMs: 700 })
    if (found === 0) continue
    await page.click(`${opener} >> nth=0`)
    const opened = await settle(() => countOf(page, nested), (n) => n > 0, { timeoutMs: 10_000 })
    check('a material that is itself made opens in place to its own recipe', opened > 0)
    const materials = await countOf(page, `${nested} ${sel('tradeskill-material')}`)
    const none = await countOf(page, `${nested} ${sel('tradeskill-no-materials')}`)
    check('…with its own materials, or the line that the wiki lists none', materials > 0 || none > 0, `${String(materials)} materials`)
    await page.click(`${opener} >> nth=0`)
    check('…and closes again', await settleGone(page, nested, { timeoutMs: 10_000 }))
    return
  }
  note('none of the first Brewing recipes has a material that is itself made: opening one in place did not run')
}

const BACK = sel('tradeskills-back')

/** A tradeskill's name on the Skills tab is a door to its workbench, and the section's Back goes home to Skills. */
async function stepFromSkills(page: Page): Promise<void> {
  await page.click(sel('nav-skills'))
  const link = `${sel('skill-row')} ${sel('skill-tradeskill-link')} [role="button"]`
  const linked = await settle(() => countOf(page, link), (n) => n > 0, { timeoutMs: 20_000 })
  check("a tradeskill's name on the Skills tab is a link", linked > 0)
  if (linked === 0) return
  // `textOf` is a plain querySelector, which takes the first match itself.
  const name = await textOf(page, link)
  check("…the skill the log raised, in the log's own spelling", name === 'Jewelry Making', name)
  await page.click(`${link} >> nth=0`)
  const up = await settle(() => textOf(page, sel('tradeskill-name')), (t) => t === 'Jewelcrafting', { timeoutMs: 20_000 })
  check('…that opens its workbench in the Tradeskills section', up === 'Jewelcrafting', up)
  const label = await settle(() => textOf(page, BACK), (t) => t !== '', { timeoutMs: 10_000 })
  check('…whose header says where Back goes', /^back to skills$/i.test(label), label)
  await page.click(BACK)
  const home = await settle(() => countOf(page, sel('skills-view')), (n) => n === 1, { timeoutMs: 20_000 })
  check('…and Back returns to the Skills tab', home === 1)
  await page.click(NAV)
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('a visit by the menu shows no Back: nothing is parked', (await countOf(page, BACK)) === 0)
}

/**
 * The Loot page's crafted note: each way of making the item that names a tradeskill is a door to
 * that workbench, on the item's own recipe. The recipe is one above the table's opening line, so
 * normally a trivial one: Hide trivial then proves the panel keeps what a link opened even when
 * the table hides its line.
 */
async function stepFromLoot(page: Page): Promise<void> {
  await page.fill(sel('tradeskill-search'), '')
  await settle(() => countOf(page, ROW), (n) => n > 0, { timeoutMs: 15_000 })
  // The trivial cell: a click there picks the line and opens no link.
  await page.click(`${ROW} >> nth=0 >> td >> nth=0`)
  const first = (await rows(page))[0]
  const item = await settle(() => textOf(page, `${PICKED} ${sel('planner-donor-name')}`), (t) => t === first?.item, { timeoutMs: 10_000 })
  await page.click(`${PICKED} ${sel('planner-donor-name')}`)
  await settle(() => countOf(page, sel('loot-detail')), (n) => n === 1, { timeoutMs: 20_000 })
  const made = `${sel('loot-crafted')} [role="button"]`
  const linked = await settle(() => countOf(page, made), (n) => n > 0, { timeoutMs: 20_000 })
  if (linked === 0) {
    note(`the Loot page of ${item} drew no crafted note with a tradeskill link: the link in from Loot was not clicked`)
    await page.click(sel('loot-back'))
    await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
    return
  }
  check("the Loot page's crafted note names the tradeskill as a link", linked > 0)
  await page.click(`${made} >> nth=0`)
  const up = await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  check('…that opens the workbench', up === 1)
  const shown = await settle(() => textOf(page, `${PICKED} ${sel('planner-donor-name')}`), (t) => t === item, { timeoutMs: 15_000 })
  check("…on the item's own recipe", shown === item, `${shown} / ${item}`)
  const label = await textOf(page, BACK)
  check('…with a Back to the Loot tab', /^back to loot$/i.test(label), label)
  // The same note's "Plan this item": Make an item on that item, and back to the workbench it left.
  await page.click(BACK)
  await settle(() => countOf(page, sel('loot-detail')), (n) => n === 1, { timeoutMs: 20_000 })
  await page.click(`${sel('loot-crafted-plan')} [role="button"]`)
  const planHead = `${sel('tradeskill-plan-head')} ${sel('planner-donor-name')}`
  const planned = await settle(() => textOf(page, planHead), (t) => t === item, { timeoutMs: 20_000 })
  check("the Loot page's Plan this item opens Make an item on it", planned === item, `${planned} / ${item}`)
  await page.click(sel('tradeskill-plan-back'))
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
  if (first?.state === 'trivial') {
    await page.click(sel('tradeskill-hide-trivial'))
    const kept = await settle(() => countOf(page, sel('tradeskill-picked-unlisted')), (n) => n === 1, { timeoutMs: 10_000 })
    check('Hide trivial takes its line away and the panel keeps the recipe, saying so', kept === 1 && (await textOf(page, `${PICKED} ${sel('planner-donor-name')}`)) === item)
    await page.click(sel('tradeskill-hide-trivial'))
    await settleGone(page, sel('tradeskill-picked-unlisted'), { timeoutMs: 10_000 })
  } else {
    note(`the recipe opened from Loot is not a trivial one (${first?.state ?? 'none'}): keeping it under Hide trivial was not checked`)
  }
  await page.click(BACK)
  check('…and Back returns to the Loot tab', (await settle(() => navSelected(page, 'loot'), (on) => on, { timeoutMs: 20_000 })) === true)
  await page.click(NAV)
  await settle(() => countOf(page, BENCH), (n) => n === 1, { timeoutMs: 20_000 })
}

/** Fishing's workbench: the gear whose skill mod names it, and the door to the Gear tab searched for it. */
async function stepSkillGear(page: Page): Promise<void> {
  await page.click(sel('tradeskill-home'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  await page.click(`${tile('Fishing')} button`)
  await settle(() => textOf(page, sel('tradeskill-name')), (t) => t === 'Fishing', { timeoutMs: 15_000 })
  const panel = sel('tradeskill-gear')
  // The Gear index is one fetch per window: the panel arrives after the workbench does.
  const drawn = await settle(() => countOf(page, panel), (n) => n === 1, { timeoutMs: 30_000 })
  if (drawn === 0) {
    note('the Fishing workbench drew no gear panel (no item in this data and era raises Fishing): it was not checked')
    return
  }
  // The held words wait on the workbench's own read of the inventory dump, which settles after
  // the panel is drawn: read the facts once they are there.
  await settle(() => countOf(page, `${panel} ${sel('tradeskill-gear-held')}`), (n) => n > 0, { timeoutMs: 15_000 })
  const facts = await page.evaluate(
    (s) =>
      [...document.querySelectorAll<HTMLElement>(s)].map((e) => ({
        name: e.querySelector('[data-testid="planner-donor-name"]')?.textContent ?? '',
        held: e.querySelector<HTMLElement>('[data-testid="tradeskill-gear-held"]')?.innerText ?? ''
      })),
    `${panel} ${sel('tradeskill-gear-item')}`
  )
  check('"Gear that raises this skill" lists items', facts.length > 0, (await textOf(page, panel)).slice(0, 120))
  check("…each by the app's item link", facts.every((g) => g.name !== ''))
  check('…and whether the inventory dump holds it', facts.every((g) => g.held === 'not held' || /^you have \d+$/.test(g.held)), facts.map((g) => g.held).join(' | '))
  await page.click(`${sel('tradeskill-gear-open')} [role="button"]`)
  const onGear = await settle(() => navSelected(page, 'gear'), (on) => on, { timeoutMs: 20_000 })
  check('its last link opens the Gear tab', onGear)
  const typed = await settle(() => page.evaluate((s) => document.querySelector<HTMLInputElement>(s)?.value ?? '', `${sel('gear-search')} input`), (t) => t !== '', { timeoutMs: 20_000 })
  check('…with the search box filled for that skill', typed === 'skill mod fishing', typed)
  // The Gear search is session state: clear it so a later Gear visit in this run starts clean.
  await page.fill(`${sel('gear-search')} input`, '')
  await page.click(NAV)
  const back = await settle(() => textOf(page, sel('tradeskill-name')), (t) => t === 'Fishing', { timeoutMs: 20_000 })
  check('…and the menu comes back to the same workbench', back === 'Fishing', back)
}

async function main(): Promise<void> {
  buildIfStale()
  const { app, close, log } = await launchOnFixture('e2e-overview.log', { inventory: 'Primitive_freeport-Inventory.txt' })
  let page: Page | null = null
  try {
    page = await mainWindow(app)
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    await page.waitForSelector(sel('nav-overview'), { timeout: 60_000 })
    log.append(`You have become better at Jewelry Making! (${String(LEVEL)})`)

    await stepNav(page)
    const tileNext = await stepHome(page)
    await stepWorkbench(page, tileNext)
    await stepLinks(page)
    await stepFromSkills(page)
    await stepFromLoot(page)
    await stepHave(page)
    await stepSkillGear(page)
    // What raises the level, and everything after it, is tradeskills-log.e2e.mts.

    check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
    if (failures.length) await dumpArtifacts(page, 'tradeskills-FAIL')
  } finally {
    await close()
  }
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  note('the tradeskills spec did not complete')
  process.exitCode = 1
})
