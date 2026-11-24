/**
 * "SEND MY LOOT TO THE WIKI", THE CARD A PLAYER SETS UP (requirements/drop-db-submit.md, the
 * 2026-11-24 row) — read on screen in the real app, with the network fenced off.
 *
 * `tests/dropObsView.test.mts` pins the words; this spec pins what a unit test cannot see: that the
 * card in Preferences → Game walks a new player through the two setup steps with sending held off,
 * and that once a sign-in has worked the steps fold into one "Signed in as" line, the three ways to
 * send are offered (Off, in the background, only when I press Send), and the reports the wiki
 * refused can be opened as a list.
 *
 * NOTHING HERE REACHES THE WIKI. The second launch is seeded with a state file whose sign-in has
 * "worked" and whose password is not a real ciphertext; it is in "Only when I press Send" and Send
 * now is never pressed, so the drain never runs; and every launch goes through a dead proxy (WORKFLOW.md, scratch probes), so even a stray
 * request would go nowhere. Save and sign in is never pressed: it would sign in to eqlwiki.
 *
 * Run: `npm run test:e2e -- drop-obs-card`
 */
import type { Page } from 'playwright-core'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIfStale, check, reportRun } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const DEAD_PROXY = { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9' }

interface CardText {
  all: string
  status: string
  /** The two ways to send are held off until a sign-in is saved. */
  sendModesDisabled: boolean
  sendNow: string | null
  signedIn: string
  hasSteps: boolean
}

async function openCard(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
  await page.click('[data-testid="nav-preferences"]', { timeout: 60_000 })
  await page.waitForSelector('[data-testid="prefs-rail-game"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-game"]')
  await page.waitForSelector('[data-testid="drop-obs-status"]', { timeout: 20_000 })
}

function readCard(page: Page): Promise<CardText> {
  // No named local functions inside `evaluate` (esbuild's __name helper is not in the page).
  return page.evaluate(() => ({
    all: document.querySelector('[data-testid="pref-drop-obs"]')?.textContent ?? '',
    status: document.querySelector('[data-testid="drop-obs-status"]')?.textContent ?? '',
    sendModesDisabled:
      (document.querySelector('input[data-testid="drop-obs-mode-background"]') as HTMLInputElement | null)?.disabled !== false &&
      (document.querySelector('input[data-testid="drop-obs-mode-manual"]') as HTMLInputElement | null)?.disabled !== false,
    sendNow: document.querySelector('[data-testid="drop-obs-send-now"]')?.textContent ?? null,
    signedIn: document.querySelector('[data-testid="drop-obs-signed-in"]')?.textContent ?? '',
    hasSteps: document.querySelector('[data-testid="drop-obs-user"]') !== null
  }))
}

/** A state file whose sign-in has worked, in manual mode, with two refused reports. */
function seededState(): string {
  return JSON.stringify({
    version: 1,
    enabled: true,
    manual: true,
    username: 'Tester@Companion',
    passwordEnc: 'bm90LWEtcmVhbC1jaXBoZXJ0ZXh0',
    delivered: ['eqc-1', 'eqc-2', 'eqc-3'],
    kept: {
      'eqc-4': { code: 'conflict', observedAt: '2026-11-20T10:00:00Z', npc: 'a skeleton', item: 'Bone Chips' },
      'eqc-5': { code: 'eoz-invalid-batch', observedAt: '2026-11-21T10:00:00Z', npc: 'a gnoll', item: 'Gnoll Fang' }
    },
    inFlight: null,
    nextAttemptAt: 0,
    failures: 0,
    lastError: null,
    lastSuccessAt: Date.now() - 5 * 60_000,
    stopped: null,
    signedInAs: 'Tester'
  })
}

async function freshPlayer(): Promise<void> {
  const launched = await launchOnFixture('e2e-overview.log', { env: DEAD_PROXY })
  try {
    const page = await mainWindow(launched.app)
    await openCard(page)
    const c = await readCard(page)
    check('a new player sees the two numbered setup steps', c.hasSteps && c.all.includes('Make a Bot password on the wiki') && c.all.includes('Paste it here'), c.all.slice(0, 300))
    check('…told which grant to tick, by the name the wiki shows', c.all.includes('Submit attributed gameplay observations'))
    check('…the three ways to send are offered, Off chosen', c.all.includes('Send in the background') && c.all.includes('Only when I press Send'))
    check('…and both ways to send are held off until a sign-in is saved', c.sendModesDisabled && c.all.includes('Sign in above first.'))
    check('…with no Send now button outside manual mode', c.sendNow === null)
    check('…while the status box already says what would be sent, in words', /ready to send|No loot reports waiting|Waiting for your log/.test(c.status), c.status)
    check('no wiki code on the card', !/eoz-|eqc-/.test(c.all), c.all)
  } finally {
    await launched.close()
  }
}

async function signedInPlayer(): Promise<void> {
  const userData = makeUserData()
  writeFileSync(join(userData, 'wiki-observations.json'), seededState(), 'utf8')
  const launched = await launchOnFixture('e2e-overview.log', { env: DEAD_PROXY, userData })
  try {
    const page = await mainWindow(launched.app)
    await openCard(page)
    const c = await readCard(page)
    check('once signed in, the steps fold into one line', !c.hasSteps && c.signedIn.includes('Signed in as Tester'), c.signedIn)
    check('…the ways to send are live', !c.sendModesDisabled)
    check('…and manual mode shows its Send now button, sized to what is waiting', c.sendNow !== null && /^(Send [\d,]+ now|Nothing to send)$/.test(c.sendNow), String(c.sendNow))
    check('…and what went is counted', c.status.includes('3 reports sent so far'), c.status)
    await page.click('[data-testid="drop-obs-kept-toggle"]')
    await page.waitForTimeout(1500)
    const after = await readCard(page)
    check('the reports the wiki did not take open as a list, with a reason in words', after.status.includes('Bone Chips from a skeleton') && after.status.includes('already reported with different details'), after.status)
    await page.click('text=Change')
    await page.waitForSelector('[data-testid="drop-obs-user"]', { timeout: 5000 })
    const editing = await readCard(page)
    check('Change opens the fields with the saved user name, no step 1 again', editing.all.includes('Change the sign-in') && !editing.all.includes('Make a Bot password'), editing.all.slice(0, 300))
  } finally {
    await launched.close()
    await removeUserData(userData)
  }
}

async function main(): Promise<void> {
  buildIfStale()
  await freshPlayer()
  await signedInPlayer()
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})
