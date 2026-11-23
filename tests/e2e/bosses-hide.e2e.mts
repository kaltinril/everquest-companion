/**
 * Headless Electron integration test for HIDING RAID TARGETS (GitHub issue #32).
 *
 * THE ASK: "I do not personally see much of a use in displaying all hate minis on the page and
 * even plane of sky could be hideable since it's not effected by the weekly loot as well." The
 * pure half (hidden drops first, the peek, the case armour) is tests/bossHiddenTargets.test.mts;
 * what needs a real app is the SURFACE and the LIFECYCLE:
 *
 *   1. The card's corner control hides WITHOUT routing — the card's own click opens the mob
 *      page, so a hide that also navigated would punish the feature's only gesture. Asserted by
 *      the mode toggle still being mounted after the click.
 *   2. The tally's DENOMINATOR moves with a hide and does NOT move with the peek — hiding is
 *      "this card is not my raid week" (it leaves the count), peeking is looking. Two different
 *      promises, both read off the one toolbar line.
 *   3. The toolbar switch exists ONLY while something is hidden: a fresh install never sees it.
 *   4. THE SET SURVIVES A RESTART and THE PEEK DOES NOT — two launches, one userData dir
 *      through a real process exit. A hide is a standing choice; "show me what I hid" is a
 *      moment.
 *
 * STAGED ON A FIXTURE, unlike bosses-week: a bare `launchApp` leans on a REAL EverQuest install
 * being auto-discoverable, which is true on the owner's machine and false in most other places —
 * on a machine with no install the app (rightly) opens on the no-logs-found onboarding and the
 * Bosses tab never mounts. The roster needs no kills for this spec's subject (a hide is about
 * CARDS, and undefeated cards are still cards), so any committed fixture do — the telemetry
 * one is the smallest.
 *
 * Run: `npm run test:e2e -- bosses-hide` (or node --import tsx this file).
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countOf,
  dumpArtifacts,
  failures,
  reportRun,
  settle,
  settleGone
} from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { stepLoadoutSectionsAreHonest } from './loadoutSectionSteps.mjs'
import { launchOnFixture, stageFixture, type FixtureLog } from './logFixture.mjs'

const NAV_OVERVIEW = '[data-testid="nav-overview"]'
const NAV_BOSSES = '[data-testid="nav-bosses"]'
const MODE = '[data-testid="boss-mode"]'
const CARD = '[data-testid="boss-card"]'
const HIDE = '[data-testid="boss-card-hide"]'
const SHOW_HIDDEN = '[data-testid="boss-show-hidden"]'
const TALLY = '[data-testid="boss-tally"]'

async function openBosses(page: Page): Promise<boolean> {
  await page.click(NAV_BOSSES, { timeout: 30_000 })
  return page.waitForSelector(MODE, { timeout: 60_000 }).then(
    () => true,
    () => false
  )
}

/** The tally's denominator — `<n> / <total> defeated · …` on the overall view. */
async function tallyTotal(page: Page): Promise<number | null> {
  const text = (await page.textContent(TALLY, { timeout: 15_000 })) ?? ''
  const m = /\/ (\d+) defeated/.exec(text)
  return m ? Number(m[1]) : null
}

/** The switch's checked state, or null while it is not mounted at all. */
function peekState(page: Page): Promise<boolean | null> {
  return page.evaluate((sel) => {
    const input = document.querySelector<HTMLInputElement>(`${sel} input`)
    return input ? input.checked : null
  }, SHOW_HIDDEN)
}

/** Record every text the tally shows from here on, so a flash too short to poll is still caught. */
function watchTally(page: Page): Promise<void> {
  return page.evaluate((sel) => {
    const seen: string[] = []
    ;(window as unknown as { tallySeen: string[] }).tallySeen = seen
    new MutationObserver(() => {
      const text = document.querySelector(sel)?.textContent
      if (text && seen[seen.length - 1] !== text) seen.push(text)
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  }, TALLY)
}

function tallySeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { tallySeen: string[] }).tallySeen)
}

async function stepHideOneCard(page: Page): Promise<{ cards: number; total: number } | null> {
  // WAIT FOR THE ROSTER, THEN READ IT. The tab is the first reader of the `kills` module since the
  // always-mounted celebration moved to `met` (444180476), so for the one round trip that fetch
  // takes (about 80 ms, 1 s once) there are no cards and the tally says it is waiting.
  // A one-shot read here passes or fails by luck: the same tree measured both ways on 2026-11-22.
  const cards = await settle(() => countOf(page, CARD), (n) => n > 0, { timeoutMs: 30_000 })
  const total = await settle(() => tallyTotal(page), (n) => n === cards, { timeoutMs: 8_000 })
  const seen = await tallySeen(page)
  check('THE TALLY NEVER CLAIMS AN EMPTY ROSTER while the kills load',
    seen.length > 0 && !seen.some((t) => t.startsWith('0 / 0')), seen.join(' | '))
  if (!check('the roster reads cleanly before anything is hidden', cards > 0 && total === cards)) return null
  check('a fresh install has NO Hidden switch at all', (await peekState(page)) === null)

  await page.click(`${CARD} ${HIDE}`, { timeout: 15_000 })
  const after = await settle(() => countOf(page, CARD), (n) => n === cards - 1, { timeoutMs: 8_000 })
  check('the card leaves the roster', after === cards - 1, `${String(after)} of ${String(cards)}`)
  check('…without routing to the mob page (the toolbar is still here)', (await countOf(page, MODE)) === 1)
  check('THE DENOMINATOR MOVES: a hidden target leaves the tally', (await tallyTotal(page)) === (total ?? 0) - 1)
  check('and the Hidden switch appears, off', (await peekState(page)) === false)
  return { cards, total: total ?? 0 }
}

async function stepPeekAndRestore(page: Page, base: { cards: number; total: number }): Promise<void> {
  await page.click(SHOW_HIDDEN, { timeout: 15_000 })
  const shown = await settle(() => countOf(page, CARD), (n) => n === base.cards, { timeoutMs: 8_000 })
  check('THE PEEK: every card renders again', shown === base.cards)
  check('…but the denominator does NOT move — peeking is looking, not un-hiding',
    (await tallyTotal(page)) === base.total - 1)

  // The hidden card is the one whose control now offers UNHIDE; clicking it restores the target.
  await page.click(`${CARD} [aria-label^="unhide "]`, { timeout: 15_000 })
  const gone = await settleGone(page, SHOW_HIDDEN, { timeoutMs: 8_000 })
  check('unhide empties the set and the switch leaves the toolbar with it', gone)
  check('…and the tally is whole again', (await tallyTotal(page)) === base.total)
}

/**
 * Launch 2, against the SAME userData: the hidden set must come back, the peek must not. Its own
 * body, not a block inside `main`: with the try/finally around each launch counted, the second
 * launch's assertions sat one level past the repo's `max-depth` ceiling.
 */
async function launchTwo(log: FixtureLog, userData: string, base: { cards: number; total: number }): Promise<void> {
  console.log('launch 2: the SAME userData dir, a new process — the SET survives, the PEEK does not…')
  const second = await launchOnFixture(log, { userData })
  let restarted: Page | null = null
  try {
    restarted = await mainWindow(second.app)
    await restarted.waitForSelector(NAV_OVERVIEW, { timeout: 60_000 })
    if (check('the Bosses tab opens again', await openBosses(restarted))) {
      const cards = await settle(() => countOf(restarted as Page, CARD), (n) => n === base.cards - 1, {
        timeoutMs: 8_000
      })
      check('THE HIDE SURVIVED THE RESTART', cards === base.cards - 1, `${String(cards)} cards`)
      check('…and the peek came back OFF: a hide is standing, a peek is a moment',
        (await peekState(restarted)) === false)
    }
    if (failures.length) await dumpArtifacts(restarted, 'bosses-hide-restart-FAIL')
  } finally {
    await second.close()
  }
}

async function main(): Promise<void> {
  await buildIfStale()
  const userData = makeUserData()
  // Staged ONCE and handed to both launches (an owned fixture would be disposed by launch 1's
  // close, taking the install out from under the restart).
  const log = stageFixture('e2e-telemetry.log')
  try {
    console.log('launch 1: a fresh install — hide, the peek, the restore, then arm the restart…')
    const first = await launchOnFixture(log, { userData })
    let page: Page | null = null
    let base: { cards: number; total: number } | null = null
    try {
      page = await mainWindow(first.app)
      await page.waitForSelector(NAV_OVERVIEW, { timeout: 60_000 })
      await watchTally(page)
      if (!check('the Bosses tab opens', await openBosses(page))) {
        throw new Error('never reached the Bosses tab - nothing below can be asserted')
      }
      base = await stepHideOneCard(page)
      if (base) {
        await stepPeekAndRestore(page, base)
        // THE ONE LAUNCH THAT ALWAYS HOLDS A KILL: bosses-week reads the real log, whose newest
        // character may have none, so the loadout HEADER is proved here on the committed fixture.
        await stepLoadoutSectionsAreHonest(page)
        // Arm the restart: hide one card again and leave the peek wherever it lies — the set
        // must come back, the peek must not.
        await page.click(`${CARD} ${HIDE}`, { timeout: 15_000 })
        await settle(() => peekState(page as Page), (v) => v === false || v === true, { timeoutMs: 8_000 })
      }
      if (failures.length) await dumpArtifacts(page, 'bosses-hide-FAIL')
    } finally {
      await first.close()
    }

    if (base) await launchTwo(log, userData, base)
  } finally {
    await log.dispose()
    await removeUserData(userData)
  }

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error -', err)
  process.exitCode = 1
})
