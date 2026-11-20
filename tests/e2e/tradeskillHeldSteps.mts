/**
 * e2e steps: "Only use materials I have" on the route, "Can make now" and "Missing on the wiki"
 * on the recipes tab, and the wiki page link (owner's rulings of 2026-11-20). A STEP MODULE, the
 * tradeskillRouteSteps.mts precedent: the launched app and the staged log are already standing in
 * tradeskills.e2e.mts, and that spec is at its line budget. It runs last, after the planner steps,
 * which leave the planner up.
 *
 * What it holds:
 *   - the planner marks an item "can make now" exactly when its gather list says everything is
 *     held, and a tree whose materials are the guide's says the wiki page lacks them, with a link
 *     to eqlwiki.com;
 *   - the route has an "Only use materials I have" switch: where nothing says what is held it is
 *     disabled and says why; where it can be used, turning it on leaves a route whose every step
 *     states the combines the held materials cover, or one line saying nothing qualifies, and the
 *     switch is remembered across a trip to another tab;
 *   - "Missing on the wiki" keeps only lines that carry a wiki link, its count matches the count
 *     line, and a picked one says what the page lacks with the page's link;
 *   - "Can make now" keeps only lines that wear the mark, or says nothing can be made;
 *   - no link anywhere on these screens leaves for a host other than eqlwiki.com.
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
const STEP = sel('tradeskill-route-step')
const ROW = sel('tradeskill-recipe-row')
const WIKI_LINK = sel('tradeskill-wiki-link')
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
    note('no item is planned when these steps start: the planner mark and its wiki line were not checked')
  } else {
    const marked = (await countOf(page, sel('tradeskill-plan-can-make'))) === 1
    const total = await textOf(page, sel('tradeskill-plan-gather-total'))
    if (total === '') note('the gather total was not found by its test id: the planner mark was not checked against it')
    else check('the planner marks "can make now" exactly when the gather list says everything is held', marked === /you hold everything/i.test(total), `${String(marked)} / ${total}`)
    if ((await countOf(page, sel('tradeskill-plan-guide-materials'))) > 0) {
      const href = await page.evaluate((s) => document.querySelector<HTMLAnchorElement>(s)?.href ?? '', `${sel('tradeskill-plan-tree')} ${WIKI_LINK}`)
      check("a tree whose materials are the guide's says the wiki page lacks them", (await countOf(page, `${sel('tradeskill-plan-tree')} ${sel('tradeskill-wiki-gap')}`)) > 0)
      check('…with a link to that page on eqlwiki.com', href.startsWith('https://eqlwiki.com/'), href)
    } else {
      note("the planned item's materials are the wiki's: the planner's wiki line was not checked")
    }
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
    const why = await textOf(page, sel('tradeskill-held-only-why'))
    check('with nothing saying what is held the switch is disabled and says why', why.length > 10, why)
    note('no inventory dump and no depot line in the staged log: the held-only route itself was not checked')
    return
  }
  if (!before.on) await page.click(HELD_ONLY)
  const on = await settle(() => heldOnlyOf(page), (v) => v === 'true', { timeoutMs: 10_000 })
  check('turning it on rebuilds the route from held recipes only', on === 'true', on)
  check('…and the route says so', /^only recipes you hold every material for/i.test(await textOf(page, sel('tradeskill-route-basis'))))
  const steps = await countOf(page, STEP)
  if (steps === 0) {
    const empty = await textOf(page, sel('tradeskill-route-empty'))
    check('when nothing qualifies the route says so in one line', empty.length > 10 && !empty.includes('\n'), empty)
  } else {
    const covers = await page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.innerText.trim()), sel('tradeskill-route-hand'))
    check('every step states the combines the held materials cover', covers.length === steps && covers.every((t) => /^your held materials cover \d+ combines?/i.test(t)), covers.slice(0, 2).join(' | '))
  }
  const text = await textOf(page, sel('tradeskill-route-list'))
  check('nothing on the held route reads as a chance or a forecast', !/%|chance|expected|estimate/i.test(text), text.slice(0, 200))

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

/** How many of the visible lines hold something under a selector, and how many lines there are. */
function rowsWith(page: Page, inner: string): Promise<{ rows: number; withIt: number }> {
  return page.evaluate(
    ([row, child]) => {
      const rows = [...document.querySelectorAll(row)]
      return { rows: rows.length, withIt: rows.filter((r) => r.querySelector(child) !== null).length }
    },
    [ROW, inner] as const
  )
}

/** "Missing on the wiki": only lines with a wiki link, the count, and the picked recipe's own line. */
async function checkWikiGaps(page: Page): Promise<void> {
  const label = await switchLabel(page, GAPS_ONLY)
  const count = Number(/\((\d+)\)/.exec(label)?.[1] ?? 'NaN')
  check('the recipes tab has a "Missing on the wiki" switch with a count', /^missing on the wiki \(\d+\)$/i.test(label), label)
  await page.click(GAPS_ONLY)
  if (count === 0) {
    const empty = await settle(() => textOf(page, sel('tradeskill-empty')), (t) => t !== '', { timeoutMs: 10_000 })
    check('with nothing missing the table says so', /missing/i.test(empty), empty)
  } else {
    const kept = await settle(() => rowsWith(page, WIKI_LINK), (r) => r.rows > 0 && r.withIt === r.rows, { timeoutMs: 15_000 })
    check('every line it keeps carries a link to its wiki page', kept.rows > 0 && kept.withIt === kept.rows, JSON.stringify(kept))
    const shown = await textOf(page, sel('tradeskill-count'))
    check('…and the count line agrees with the switch', shown.startsWith(`${String(count)} of `) || shown.startsWith(`${String(count)} wiki`), `${label} / ${shown}`)
    await page.click(`${ROW} >> nth=0 >> td >> nth=2`)
    const gap = await settle(() => textOf(page, `${sel('tradeskill-picked')} ${sel('tradeskill-wiki-gap')}`), (t) => t !== '', { timeoutMs: 10_000 })
    check('a picked one says what its wiki page lacks', /wiki page (lists|states) no/i.test(gap), gap)
    const href = await page.evaluate((s) => document.querySelector<HTMLAnchorElement>(s)?.href ?? '', `${sel('tradeskill-picked')} ${sel('tradeskill-wiki-gap')} a`)
    check('…with a link to that page on eqlwiki.com', href.startsWith('https://eqlwiki.com/'), href)
  }
  await page.click(GAPS_ONLY)
  await settle(() => switchState(page, GAPS_ONLY), (s) => !s.on, { timeoutMs: 10_000 })
}

/** "Can make now": only lines that wear the mark, or one line saying nothing can be made. */
async function checkCanMake(page: Page): Promise<void> {
  check('the recipes tab has a "Can make now" switch', /^can make now/i.test(await switchLabel(page, CAN_MAKE_ONLY)), await switchLabel(page, CAN_MAKE_ONLY))
  if ((await switchState(page, CAN_MAKE_ONLY)).disabled) {
    const why = await textOf(page, sel('tradeskill-can-make-why'))
    check('with nothing saying what is held it is disabled and says why', why.length > 10, why)
    check('…and no line wears the mark', (await countOf(page, sel('tradeskill-can-make-chip'))) === 0)
    return
  }
  await page.click(CAN_MAKE_ONLY)
  const seen = await settle(
    async () => ({ ...(await rowsWith(page, sel('tradeskill-can-make-chip'))), empty: await textOf(page, sel('tradeskill-empty')) }),
    (r) => r.empty !== '' || (r.rows > 0 && r.withIt === r.rows),
    { timeoutMs: 15_000 }
  )
  if (seen.empty !== '') check('with nothing to make the table says so', /do not hold every material/i.test(seen.empty), seen.empty)
  else check('every line it keeps wears the "can make" mark with a count', seen.withIt === seen.rows && /^can make \d+$/i.test(await textOf(page, `${ROW} ${sel('tradeskill-can-make-chip')}`)))
  await page.click(CAN_MAKE_ONLY)
  await settle(() => switchState(page, CAN_MAKE_ONLY), (s) => !s.on, { timeoutMs: 10_000 })
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
  await checkWikiGaps(page)
  await checkCanMake(page)
  const foreign = await foreignLinks(page, BENCH)
  check('the workbench links to no host but eqlwiki.com', foreign.length === 0, foreign.slice(0, 3).join(' | '))
}
