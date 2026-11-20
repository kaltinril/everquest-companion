// respawnAlertNoteSteps - THE "NO ALERT WILL PLAY" NOTE DOES NOT SQUEEZE THE SECONDS FIELD
// (screen pass, 2026-11-19).
//
// Its own module for the reason the round 7-9 steps are: `respawn-timers.e2e.mts` is at the repo's
// factoring ceiling.
//
// WHAT ONLY THE REAL APP CAN SHOW. The note's words are pinned in tests/respawnAlert.test.mts; where
// it lands is layout. Beside the box it took the row's room: the seconds field went from 132 px to
// 85 at the minimum window and its label "Seconds (5-300)" was cut off. It is now on its own line
// under the box, and this measures that at the app's minimum window, where the row is tightest.
//
// IT RUNS LAST: it deletes the seeded alert, and nothing after it needs one.

import type { ElectronApplication, Page } from 'playwright-core'
import { check, countOf, settle } from './appHarness.mjs'

const BOX = '[data-testid="respawn-alert-on"] input'
const NOTE = '[data-testid="respawn-alert-silent"]'

interface Bridge {
  eq: { deleteAlert: (id: string) => Promise<unknown> }
}

interface Measured {
  fieldW: number
  labelScrollW: number
  labelClientW: number
  noteTop: number
  fieldBottom: number
  viewScrollW: number
  viewClientW: number
}

function measure(page: Page): Promise<Measured | null> {
  return page.evaluate((noteSel) => {
    const input = document.querySelector('[data-testid="respawn-alert-lead"]')
    const field = input?.closest('.MuiTextField-root')
    const label = field?.querySelector('label')
    const note = document.querySelector(noteSel)
    const view = document.querySelector('[data-testid="timers-view"]')
    if (!field || !label || !note || !view) return null
    const f = field.getBoundingClientRect()
    return {
      fieldW: f.width,
      labelScrollW: label.scrollWidth,
      labelClientW: label.clientWidth,
      noteTop: note.getBoundingClientRect().top,
      fieldBottom: f.bottom,
      viewScrollW: view.scrollWidth,
      viewClientW: view.clientWidth
    }
  }, NOTE)
}

/** Leave the Timers tab and come back: the control reads the alert list fresh when it mounts. */
async function remountTimers(page: Page): Promise<void> {
  await page.click('[data-testid="nav-alerts"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="alerts-list"]', { timeout: 30_000 })
  await page.click('[data-testid="nav-timers"]', { timeout: 30_000 })
  await settle(() => countOf(page, '[data-testid="timers-view"]'), (n) => n === 1, { timeoutMs: 30_000 })
}

export async function stepAlertNoteUnderTheBox(page: Page, app: ElectronApplication): Promise<void> {
  // The app's minimum window: the control row is at its narrowest.
  const win = await app.browserWindow(page)
  await win.evaluate((w) => {
    w.setBounds({ ...w.getBounds(), width: 900, height: 600 })
  })
  await page.evaluate(() => (window as unknown as Bridge).eq.deleteAlert('respawn-soon'))
  await remountTimers(page)
  if (!(await page.isChecked(BOX))) await page.click(BOX, { force: true })

  const shown = await settle(() => countOf(page, NOTE), (n) => n === 1, { timeoutMs: 15_000 })
  if (!check('with the alert deleted and the box ticked, the note says no alert will play', shown === 1)) return

  const got = await settle(
    () => measure(page),
    (v) => v !== null && v.noteTop >= v.fieldBottom - 1,
    { timeoutMs: 10_000 }
  )
  if (got === null) {
    check('…and every part of the control is on the page', false)
    return
  }
  check('…on its own line under the seconds field', got.noteTop >= got.fieldBottom - 1, JSON.stringify(got))
  check('…so the field keeps its full width', Math.abs(got.fieldW - 132) <= 1, JSON.stringify(got))
  check('…and its label is not cut off', got.labelScrollW <= got.labelClientW + 1, JSON.stringify(got))
  check('…and the tab does not scroll sideways for it', got.viewScrollW <= got.viewClientW + 1, JSON.stringify(got))
}
