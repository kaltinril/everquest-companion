/**
 * e2e steps: the AAs on a workbench, fishing outcomes on the Fishing workbench's history tab and
 * the Foraging tile on Home (owner, 2026-11-20: "there are AA's that pertain to crafting, we
 * should somehow show stuff related to that"; fork #6: "Fishing and Foraging also come to mind").
 * A STEP MODULE, the tradeskillRouteSteps.mts precedent: the launched app and the staged log are
 * already standing in tradeskills.e2e.mts, and that spec is at its line budget. It runs last.
 *
 * What it holds:
 *   - a workbench lists the AAs for its tradeskill on one line; a purchase line appended to the
 *     log for the first of them shows as the rank the log shows bought; "Show what they do" opens
 *     one block per AA with the wiki's words, and its one link goes to eqlwiki.com;
 *   - the Fishing workbench's history tab counts the casts, catches and misses appended to the
 *     log, with the catch rate over the casts that had an outcome; a spilled beer is its own small
 *     count and adds no miss; the catch is listed under the standard item link; this session's
 *     line is drawn;
 *   - the Foraging tile on Home (when the mount is in) is a tile of the tradeskills' grid showing
 *     the Forage level and found and failed with the rate; a click on it opens, in place, the
 *     items found, this session's line and the Foraging AA.
 *
 * Every claim is a property of what is on screen. The AA whose purchase is appended is whichever
 * the panel lists first; no AA name or count is taken from the wiki data.
 *
 * Written on `tradeskills-aa-gather` (2026-11-20) and NOT yet run.
 */
import type { Page } from 'playwright-core'
import { check, countOf, note, settle } from './appHarness.mjs'
import type { FixtureLog } from './logFixture.mjs'

const sel = (id: string): string => `[data-testid="${id}"]`
const NAV = sel('nav-tradeskills')
const HOME = sel('tradeskills-home')
const BENCH = sel('tradeskill-workbench')
const AA = sel('tradeskill-aa')
const AA_ITEM = sel('tradeskill-aa-item')
const FISHING = sel('tradeskill-fishing')
const FORAGE = sel('tradeskill-forage-tile')
const FORAGE_DETAIL = sel('tradeskill-forage-detail')
const DONOR = sel('planner-donor-name')

function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.trim() ?? '', selector)
}

function textsOf(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.innerText.trim()), selector)
}

/** The big number of one figure (`<prefix>-<id>` holds a caption and an h6). */
function figureOf(page: Page, testid: string): Promise<string> {
  return textOf(page, `${sel(testid)} h6`)
}

/** One number of the Foraging tile's line (`data-value` on `<prefix>-<id>` holds the number alone). */
function valueOf(page: Page, testid: string): Promise<string> {
  return page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.value ?? '', sel(testid))
}

/** A workbench by its tile, from wherever the section stands. */
async function openBench(page: Page, tradeskill: string): Promise<void> {
  await page.click(NAV)
  await settle(async () => (await countOf(page, BENCH)) + (await countOf(page, HOME)), (n) => n > 0, { timeoutMs: 20_000 })
  if ((await countOf(page, BENCH)) === 1 && (await textOf(page, sel('tradeskill-name'))) === tradeskill) return
  if ((await countOf(page, BENCH)) === 1) await page.click(sel('tradeskill-home'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  await page.click(`${sel(`tradeskill-tile-${tradeskill}`)} button`)
  await settle(() => textOf(page, sel('tradeskill-name')), (t) => t === tradeskill, { timeoutMs: 20_000 })
}

/** The AA line of a workbench, a purchase read from the log, and the wiki's words on demand. */
async function checkAas(page: Page, log: Pick<FixtureLog, 'appendAt'>): Promise<void> {
  await openBench(page, 'Jewelcrafting')
  const listed = await settle(() => countOf(page, `${AA} ${AA_ITEM}`), (n) => n > 0, { timeoutMs: 20_000 })
  if (listed === 0) {
    note('the Jewelcrafting workbench drew no AA panel (the mount is not in, or the wiki table lists no AA for it): the AA step did not run')
    return
  }
  check('the workbench lists the AAs for its tradeskill', listed > 0, String(listed))
  const first = (await textsOf(page, `${AA} ${AA_ITEM} ${sel('tradeskill-aa-name')}`))[0] ?? ''
  check('…each by name', first !== '', first)
  if (first === '') return
  // Rank 1 is the quoted form, a later rank the improved form: the game's two purchase lines.
  log.appendAt(new Date(Date.now() + 1000), `You have gained the ability "${first}" at a cost of 2 ability points.`)
  log.appendAt(new Date(Date.now() + 2000), `You have improved ${first} 2 at a cost of 4 ability points.`)
  // The first entry's whole text: its name, then what the log shows of it.
  const firstEntry = async (): Promise<string> => (await textsOf(page, `${AA} ${AA_ITEM}`))[0] ?? ''
  const bought = await settle(firstEntry, (t) => /rank 2\b/i.test(t), { timeoutMs: 30_000 })
  check('a purchase line in the log shows as the rank the log shows bought', /rank 2( of \d+)? in your log/i.test(bought), bought)

  check('the details are closed until asked for', (await countOf(page, sel('tradeskill-aa-details'))) === 0)
  await page.click(`${sel('tradeskill-aa-toggle')} [role="button"]`)
  const details = await settle(() => countOf(page, sel('tradeskill-aa-detail')), (n) => n === listed, { timeoutMs: 10_000 })
  check('"Show what they do" opens one block per AA', details === listed, `${String(details)} / ${String(listed)}`)
  const words = await textsOf(page, sel('tradeskill-aa-text'))
  check("…each with the wiki's words", words.length === listed && words.every((t) => t.length > 20), words.join(' | ').slice(0, 200))
  const said = (await textsOf(page, sel('tradeskill-aa-detail')))[0] ?? ''
  check('…and the purchase as a sentence about the log', /Your log shows rank 2\b/i.test(said), said)
  const links = await page.evaluate((s) => [...document.querySelectorAll<HTMLAnchorElement>(`${s} a[href]`)].map((a) => a.href), AA)
  check('the panel links to the wiki page and to no other host', links.length === 1 && links.every((href) => href.startsWith('https://eqlwiki.com/')), links.join(' | '))
  await page.click(`${sel('tradeskill-aa-toggle')} [role="button"]`)
  const closed = await settle(() => countOf(page, sel('tradeskill-aa-details')), (n) => n === 0, { timeoutMs: 10_000 })
  check('…and the same link closes them again', closed === 0)
}

/** Fishing outcomes on the Fishing workbench's history tab. */
async function checkFishing(page: Page, log: Pick<FixtureLog, 'appendAt'>): Promise<void> {
  await openBench(page, 'Fishing')
  await page.click(sel('tradeskill-tab-history'))
  await settle(() => countOf(page, sel('tradeskill-history')), (n) => n === 1, { timeoutMs: 15_000 })
  const before = await settle(async () => (await countOf(page, FISHING)) + (await countOf(page, sel('tradeskill-fishing-empty'))), (n) => n > 0, { timeoutMs: 30_000 })
  if (before === 0) {
    note('the Fishing history tab drew no fishing panel: the fishing step did not run')
    return
  }
  const fresh = (await countOf(page, sel('tradeskill-fishing-empty'))) === 1
  check('with no fishing line in the log the tab says so in one line', !fresh || (await textOf(page, sel('tradeskill-fishing-empty'))).length > 0)
  const at = (seconds: number): Date => new Date(Date.now() + seconds * 1000)
  log.appendAt(at(3), 'You cast your line.')
  log.appendAt(at(4), 'You caught Fresh Fish!')
  log.appendAt(at(5), 'You cast your line.')
  // A spilled beer prints beside the miss of its second: one miss, not two.
  log.appendAt(at(6), 'You spill your beer while bringing in your line.', "You didn't catch anything.")
  // A cast nothing follows: in Casts, in neither side of the rate.
  log.appendAt(at(7), 'You cast your line.')
  await settle(() => figureOf(page, 'tradeskill-fishing-casts'), (t) => Number(t) >= 3, { timeoutMs: 30_000 })
  const casts = Number(await figureOf(page, 'tradeskill-fishing-casts'))
  const caught = Number(await figureOf(page, 'tradeskill-fishing-caught'))
  const nothing = Number(await figureOf(page, 'tradeskill-fishing-nothing'))
  const rate = await figureOf(page, 'tradeskill-fishing-rate')
  if (fresh) check('the casts, the catch and the miss appended to the log are counted', casts === 3 && caught === 1 && nothing === 1, `${String(casts)}/${String(caught)}/${String(nothing)}`)
  check('the catch rate is caught over the casts that had an outcome, not over the casts', rate === `${String(Math.round((caught / (caught + nothing)) * 100))}%`, rate)
  const spilled = await textOf(page, sel('tradeskill-fishing-spilled'))
  check('a spilled beer is its own small count', /\b[1-9]\d*$/.test(spilled), spilled)
  check('…and a cast with no outcome is said in its own line', (await textOf(page, sel('tradeskill-fishing-no-outcome'))).length > 0)
  const names = await textsOf(page, `${sel('tradeskill-fishing-item')} ${DONOR}`)
  check('the catch is listed under the standard item link', names.includes('Fresh Fish'), names.join(' | '))
  const session = await textOf(page, sel('tradeskill-fishing-session'))
  check("this session's fishing is drawn while the session has any", /^This session: \d+ casts?, \d+ caught, \d+ nothing/.test(session), session)
}

/** The Foraging tile on Home: level, found and failed on the tile; the items found, the session and the Foraging AA behind a click. */
async function checkForaging(page: Page, log: Pick<FixtureLog, 'appendAt'>): Promise<void> {
  const at = (seconds: number): Date => new Date(Date.now() + seconds * 1000)
  log.appendAt(at(8), 'You have scrounged up Roots.', 'You have become better at Forage! (12)')
  log.appendAt(at(9), 'You fail to locate any food nearby.')
  log.appendAt(at(10), 'You have scrounged up a Pod of Water.')
  await page.click(sel('tradeskill-home'))
  await settle(() => countOf(page, HOME), (n) => n === 1, { timeoutMs: 15_000 })
  const drawn = await settle(() => countOf(page, FORAGE), (n) => n === 1, { timeoutMs: 30_000 })
  if (drawn === 0) {
    note('Home drew no Foraging tile (the mount is not in): the Foraging step did not run')
    return
  }
  await settle(() => valueOf(page, 'tradeskill-forage-found'), (t) => Number(t) >= 2, { timeoutMs: 30_000 })
  check("the Foraging tile sits in the tradeskills' grid", (await countOf(page, `${sel('tradeskills-tiles')} > ${FORAGE}`)) === 1)
  const level = await settle(() => textOf(page, sel('tradeskill-forage-level')), (t) => t !== '', { timeoutMs: 30_000 })
  check('the Foraging tile shows the Forage level the log last stated', level === '12', level)
  const found = Number(await valueOf(page, 'tradeskill-forage-found'))
  const failed = Number(await valueOf(page, 'tradeskill-forage-failed'))
  const rate = await valueOf(page, 'tradeskill-forage-rate')
  check('…what was found and what failed', found >= 2 && failed >= 1, `${String(found)}/${String(failed)}`)
  check('…and the rate of the two', rate === `${String(Math.round((found / (found + failed)) * 100))}%`, rate)
  // What was found is behind a click on the tile. A fresh profile has never opened it.
  if ((await page.evaluate((s) => document.querySelector<HTMLElement>(s)?.dataset.open ?? '', FORAGE)) === 'true') {
    note('the Foraging tile was already open when the step began: closed-by-default was not checked')
  } else {
    check('what was found is closed until the tile is clicked', (await countOf(page, FORAGE_DETAIL)) === 0 && (await countOf(page, sel('tradeskill-forage-item'))) === 0)
    await page.click(`${FORAGE} button`)
  }
  const opened = await settle(() => countOf(page, FORAGE_DETAIL), (n) => n === 1, { timeoutMs: 10_000 })
  check('a click on the tile opens what was found, in place', opened === 1)
  const names = await textsOf(page, `${FORAGE_DETAIL} ${sel('tradeskill-forage-item')} ${DONOR}`)
  check('the items found are listed under the standard item link, the leading article dropped', names.includes('Roots') && names.includes('Pod of Water'), names.join(' | '))
  check("…with this session's numbers", (await textOf(page, `${FORAGE_DETAIL} ${sel('tradeskill-forage-session')}`)).startsWith('This session:'))
  if ((await countOf(page, sel('tradeskill-forage-aa'))) === 0) {
    note('the wiki table lists no AA for foraging: the tile drew none')
  } else {
    const words = await textOf(page, `${sel('tradeskill-forage-aa')} ${sel('tradeskill-aa-text')}`)
    check("the tile states the Foraging AA in the wiki's words", words.length > 20, words)
    const bought = await textOf(page, `${sel('tradeskill-forage-aa')} ${sel('tradeskill-aa-bought')}`)
    check('…and what the log shows of buying it', /^Your log shows /.test(bought), bought)
  }
}

export async function stepAaAndGather(page: Page, log: Pick<FixtureLog, 'appendAt'>): Promise<void> {
  await checkAas(page, log)
  await checkFishing(page, log)
  await checkForaging(page, log)
}
