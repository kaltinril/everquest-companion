/**
 * e2e: the Tradeskills section (fork #6). Home's tiles, a workbench's recipe book, and the links
 * out and back.
 *
 * What it holds, on a fixture log given a Jewelry Making level and an inventory dump:
 *   - the nav row sits under Research, and the open menu still fits the default window;
 *   - Home draws a door per tradeskill: a tile with the log's level for one the log has shown, a
 *     small button under "Not in your log yet" for one it has not;
 *   - a tile opens its workbench, whose table opens on the recipe marked next: the first one
 *     above the level, with nothing above it in the list that is not at or under the level;
 *   - the panel shows that recipe's materials with the wiki's source words, and item names are
 *     the app's standard item link;
 *   - Hide trivial and the search take lines away; recipes with no trivial sit under their heading;
 *   - an item name opens its Loot page and Back returns to the same workbench;
 *   - leaving by the menu and coming back reopens the workbench;
 *   - Have reads the dump's tradeskill depot;
 *   - links IN: a tradeskill's name on the Skills tab opens its workbench with a Back to Skills,
 *     and the Loot page's crafted note opens the workbench on that item's own recipe;
 *   - "Gear that raises this skill" lists items with their mod, each the standard item link, and
 *     its last link opens the Gear tab with the search box filled;
 *   - the player's own log, the history tab and the guides tab: tradeskillLogSteps.mts (written
 *     on `workbench-data`, not yet run).
 *
 * Every claim about a recipe is a property of what is on screen, never a name or a count from the
 * wiki data, so a data refresh cannot turn it red.
 *
 * Run: `npm run test:e2e -- tradeskills`
 */
import type { Page } from 'playwright-core'
import { buildIfStale, check, countOf, dumpArtifacts, failures, note, reportRun, settle, settleGone } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { stepGuides, stepHistory, stepOwnLog } from './tradeskillLogSteps.mjs'
import { TRADESKILLS } from '../../src/shared/tradeskills'

const LEVEL = 205
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

async function answerNotice(page: Page): Promise<void> {
  const notice = sel('telemetry-notice')
  if ((await countOf(page, notice)) === 0) return
  await page.click(sel('telemetry-notice-off'))
  await settleGone(page, notice, { timeoutMs: 8_000 })
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
  // A door is a full tile (the log has shown the tradeskill) or a small button (it has not): `data-tile` is on both.
  const doors = await settle(() => countOf(page, '[data-testid^="tradeskill-tile-"][data-tile]'), (n) => n === TRADESKILLS.length, { timeoutMs: 20_000 })
  check('Home draws one door per tradeskill', doors === TRADESKILLS.length, `saw ${String(doors)}`)
  const level = await settle(() => textOf(page, `${tile('Jewelcrafting')} ${sel('tradeskill-tile-level')}`), (t) => t === String(LEVEL), { timeoutMs: 30_000 })
  check("the Jewelcrafting tile shows the log's Jewelry Making level", level === String(LEVEL), level)
  const heading = await textOf(page, sel('tradeskills-unseen-heading'))
  const inRow = await countOf(page, `${sel('tradeskills-unseen')} ${tile('Pottery')}[data-tile="unseen"] button`)
  check('a tradeskill the log never showed is a small button under "Not in your log yet"', inRow === 1 && heading === 'Not in your log yet', `${String(inRow)} / ${heading}`)
  check('…with no level bar and no next recipe', (await countOf(page, `${tile('Pottery')} ${sel('tradeskill-bar')}`)) === 0 && (await countOf(page, `${tile('Pottery')} ${sel('tradeskill-tile-next')}`)) === 0)
  const text = await textOf(page, tile('Jewelcrafting'))
  check('the tile states its wiki recipes', /\d+ wiki recipes/.test(text), text)
  const next = /trivial (\d+)/.exec(await textOf(page, `${tile('Jewelcrafting')} ${sel('tradeskill-tile-next')}`))
  check('…and a next recipe above the level', next !== null && Number(next[1]) > LEVEL, next?.[0] ?? 'no next line')
  const name = await textOf(page, `${tile('Jewelcrafting')} ${sel('planner-donor-name')}`)
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
  check('…it is above the level', next !== undefined && next.trivial !== null && next.trivial > LEVEL, String(next?.trivial))
  const before = seen.slice(0, Math.max(0, at))
  check('…and every line before it is trivial: at or under the level', before.every((r) => r.state === 'trivial' && r.trivial !== null && r.trivial <= LEVEL))
  check('the lines are ascending by trivial', seen.every((r, i) => i === 0 || r.trivial === null || (seen[i - 1]?.trivial ?? 0) <= r.trivial))
  check("…and it is the recipe Home's tile named", next?.item === tileNext, `${next?.item ?? ''} / ${tileNext}`)
  const picked = await textOf(page, `${PICKED} ${sel('planner-donor-name')}`)
  check('the panel shows the next recipe', picked === next?.item, picked)
  const materials = await countOf(page, `${PICKED} ${sel('tradeskill-material')}`)
  const noMaterials = await countOf(page, `${PICKED} ${sel('tradeskill-no-materials')}`)
  check('…with its materials, or says the wiki lists none', materials > 0 || noMaterials === 1, `${String(materials)} materials`)
  check('…and its facts line states the trivial', (await textOf(page, sel('tradeskill-picked-facts'))).includes(`trivial ${String(next?.trivial)}`))
}

/** The mounted lines as marks, the heading among them, in the table's own order. */
function marks(page: Page): Promise<string[]> {
  return page.evaluate(
    (s) => [...document.querySelectorAll<HTMLElement>(s)].map((r) => (r.dataset.testid === 'tradeskill-unrated-heading' ? 'heading' : (r.dataset.state ?? ''))),
    `${ROW}, ${sel('tradeskill-unrated-heading')}`
  )
}

/**
 * Recipes with no trivial: at the end, under their own heading. Only the lines in view are
 * mounted, so the table is walked up from its end until the heading comes into view.
 */
async function stepUnrated(page: Page): Promise<void> {
  const scrollBy = (by: number): Promise<void> =>
    page.evaluate(
      ([s, px]) => {
        const el = document.querySelector<HTMLElement>(s)
        if (el === null) return
        el.scrollTop = Math.max(0, Math.min(el.scrollHeight, el.scrollTop + px))
        // Said at once: the hidden window delivers its own scroll event late.
        el.dispatchEvent(new Event('scroll'))
      },
      [SCROLL, by] as const
    )
  await scrollBy(1_000_000)
  // A scroll in the hidden window lands late: wait for the end of the list to mount.
  const tail = await settle(() => rows(page), (rs) => rs.at(-1)?.state === 'unrated', { timeoutMs: 10_000 })
  if (tail.at(-1)?.state !== 'unrated') {
    note(`no recipe without a trivial is at the end of this list (last line: ${tail.at(-1)?.state ?? 'none'}): the unrated heading was not checked`)
    return
  }
  check('recipes with no trivial are at the end, and state none', tail.filter((r) => r.state === 'unrated').every((r) => r.trivial === null))
  let seen = await marks(page)
  for (let i = 0; i < 20 && !seen.includes('heading'); i++) {
    await scrollBy(-500)
    seen = await settle(() => marks(page), (m) => m.includes('heading') || m[0] !== 'unrated', { timeoutMs: 1_500 })
  }
  const at = seen.indexOf('heading')
  check('…under a heading that sets them apart', at >= 0 && seen.filter((m) => m === 'heading').length === 1, seen.join(','))
  check('…every line after it has no trivial', seen.slice(at + 1).every((m) => m === 'unrated'))
  check('…and no line before it lacks one', seen.slice(0, Math.max(0, at)).every((m) => m !== 'unrated'))
}

async function stepFilters(page: Page): Promise<void> {
  const all = await textOf(page, sel('tradeskill-count'))
  await page.click(sel('tradeskill-hide-trivial'))
  const hidden = await settle(() => rows(page), (rs) => rs[0]?.state === 'next' && rs.every((r) => r.state !== 'trivial'), { timeoutMs: 15_000 })
  check('Hide trivial takes the trivial lines away', hidden.length > 0 && hidden.every((r) => r.state !== 'trivial'))
  check('…and the next recipe is now the first line', hidden[0]?.state === 'next', hidden[0]?.state)
  const fewer = await textOf(page, sel('tradeskill-count'))
  check('…and the count says how many are left', / of /.test(fewer) && fewer !== all, `${all} -> ${fewer}`)

  await stepUnrated(page)

  await page.fill(sel('tradeskill-search'), 'ruby')
  const found = await settle(() => rows(page), (rs) => rs.length > 0 && rs.every((r) => r.text.includes('ruby')), { timeoutMs: 15_000 })
  check('the search keeps recipes whose item or material matches', found.length > 0 && found.every((r) => r.text.includes('ruby')), `${String(found.length)} lines`)
  await page.fill(sel('tradeskill-search'), 'zzzz no such thing')
  const empty = await settle(() => textOf(page, sel('tradeskill-empty')), (t) => t !== '', { timeoutMs: 15_000 })
  check('a search with no match says so', empty === 'No recipe or material matches the search.', empty)
  await page.fill(sel('tradeskill-search'), '')
  await page.click(sel('tradeskill-hide-trivial'))
  await settle(() => rows(page), (rs) => rs.some((r) => r.state === 'trivial'), { timeoutMs: 15_000 })
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
  await page.fill(sel('tradeskill-search'), 'Griffenne Blood')
  const found = await settle(() => rows(page), (rs) => rs.length > 0 && rs.every((r) => r.text.includes('griffenne blood')), { timeoutMs: 15_000 })
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
        mod: e.querySelector<HTMLElement>('[data-testid="tradeskill-gear-mod"]')?.innerText ?? '',
        held: e.querySelector<HTMLElement>('[data-testid="tradeskill-gear-held"]')?.innerText ?? ''
      })),
    `${panel} ${sel('tradeskill-gear-item')}`
  )
  check('"Gear that raises this skill" lists items', facts.length > 0, (await textOf(page, panel)).slice(0, 120))
  check("…each by the app's item link", facts.every((g) => g.name !== ''))
  check('…with what it adds', facts.every((g) => /^\+\d/.test(g.mod)), facts.map((g) => g.mod).join(' | '))
  check('…largest first', facts.every((g, i) => i === 0 || parseFloat(facts[i - 1]?.mod.slice(1) ?? '0') >= parseFloat(g.mod.slice(1))))
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
    await answerNotice(page)
    log.append(`You have become better at Jewelry Making! (${String(LEVEL)})`)

    await stepNav(page)
    const tileNext = await stepHome(page)
    await stepWorkbench(page, tileNext)
    await stepFilters(page)
    await stepLinks(page)
    await stepFromSkills(page)
    await stepFromLoot(page)
    await stepHave(page)
    await stepSkillGear(page)
    // Last: it raises the level, which every step above reads as LEVEL.
    const crafted = await stepOwnLog(page, log, LEVEL)
    if (crafted !== null) {
      await stepHistory(page, crafted)
      await stepGuides(page, LEVEL)
    }
    await (await import('./tradeskillRouteSteps.mjs')).stepRoute(page)
    await (await import('./tradeskillPlanSteps.mjs')).stepPlanner(page) // Make an item and Maps at a merchant (written, not yet run)
    await (await import('./tradeskillHeldSteps.mjs')).stepHeldAndWiki(page) // held-only route, Can make now, Missing on the wiki (written, not yet run)
    await (await import('./tradeskillGatherSteps.mjs')).stepAaAndGather(page, log) // crafting AAs, fishing outcomes, the Foraging tile (written, not yet run)
    await (await import('./tradeskillHomeSteps.mjs')).stepHomeAndWish(page) // level bars, Pick up where you left off, wishing a crafted item, sources, the Skills tab's door (written, not yet run)
    await (await import('./tradeskillFactionSteps.mjs')).stepFaction(page) // the Faction goal: a faction's turn-ins, the shopping list, the Factions tab and back (written, not yet run)

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
