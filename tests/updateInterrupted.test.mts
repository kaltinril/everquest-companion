// A check or download cut short by a network change or by the PC sleeping.
//
// It is not a failure (owner ruling, JOS-307), and it is not a completed check either. After a
// click, the chip used to read "up to date" for the cooldown window and Preferences showed its
// "up to date" chip, about a check that never finished. The poll's own short retry was also lost:
// the loop re-armed at the 4 hour spacing right after the interrupted check returned.
//
// The words and the two decisions are pure (src/shared/update.ts); the wiring is pinned from the
// source, because electron-updater cannot run in a node test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_INTERRUPTED_RETRIES,
  checkEarnsCooldown,
  checkFollowUpPhase,
  updateChipLine,
  updateChipState,
  updatePrefsChip
} from '../src/shared/update'
import type { UpdateStatus } from '../src/shared/types'

const CURRENT = '1.2.3'
const T = 1_700_000_000_000

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const line = (status: UpdateStatus, cooldown: boolean, busy = false): ReturnType<typeof updateChipLine> =>
  updateChipLine(updateChipState(status, CURRENT), { version: CURRENT, age: '3h ago', busy, cooldown })

const prefsChip = (status: UpdateStatus, cooldown = false): string =>
  updatePrefsChip(status, updateChipState(status, CURRENT), cooldown).label

const CHECK_CUT: UpdateStatus = { state: 'idle', interrupted: 'check', checkedAt: T }
const DOWNLOAD_CUT: UpdateStatus = { state: 'idle', interrupted: 'download', checkedAt: T }

// ------------------------------------------------------------------ the words

test('an interrupted check never reads "up to date", in or out of the cooldown window', () => {
  for (const cooldown of [true, false]) {
    const got = line(CHECK_CUT, cooldown)
    assert.equal(got.label, `v${CURRENT} · check interrupted`)
    assert.doesNotMatch(got.label, /up to date/)
  }
})

test('an interrupted download says it was the download', () => {
  assert.equal(line(DOWNLOAD_CUT, true).label, `v${CURRENT} · download interrupted`)
})

test('the tooltip says why and what to do, in one short sentence', () => {
  const { tip } = line(CHECK_CUT, false)
  assert.match(tip, /try again/)
  const words = tip.split(/\s+/).length
  assert.ok(words >= 7 && words <= 15, `${words} words`)
  assert.doesNotMatch(tip, /[–—]/)
})

test('it is stated quietly: an interruption is not a failed check', () => {
  assert.equal(line(CHECK_CUT, false).failed, false)
})

test('a check that completed still reads "up to date" in the cooldown window', () => {
  assert.equal(line({ state: 'idle', checkedAt: T }, true).label, `v${CURRENT} · up to date`)
  assert.equal(line({ state: 'idle', checkedAt: T }, false).label, `v${CURRENT} · checked 3h ago`)
})

test('a check in flight outranks the interruption it is retrying', () => {
  assert.equal(line(CHECK_CUT, false, true).label, 'Checking for updates…')
})

test('Preferences names the interruption instead of "up to date"', () => {
  assert.equal(prefsChip(CHECK_CUT), 'check interrupted')
  assert.equal(prefsChip(CHECK_CUT, true), 'check interrupted')
  assert.equal(prefsChip(DOWNLOAD_CUT), 'download interrupted')
  assert.equal(prefsChip({ ...CHECK_CUT, autoUpdateOff: true }), 'check interrupted')
})

// ------------------------------------------------------------ the two decisions

test('an interrupted check earns no cooldown: the player can click again at once', () => {
  assert.equal(checkEarnsCooldown(CHECK_CUT), false)
  assert.equal(checkEarnsCooldown(DOWNLOAD_CUT), false)
  assert.equal(checkEarnsCooldown({ state: 'idle', checkedAt: T }), true)
  assert.equal(checkEarnsCooldown({ state: 'error', message: 'offline' }), true)
  assert.equal(checkEarnsCooldown({ state: 'ready', version: '1.3.0' }), true)
})

test('after an interrupted check the poll comes back soon, not in 4 hours', () => {
  assert.equal(checkFollowUpPhase(CHECK_CUT, 1), 'resume')
  assert.equal(checkFollowUpPhase(CHECK_CUT, MAX_INTERRUPTED_RETRIES), 'resume')
})

test('a network that keeps changing is not polled every 30 seconds forever', () => {
  assert.equal(checkFollowUpPhase(CHECK_CUT, MAX_INTERRUPTED_RETRIES + 1), 'periodic')
})

test('a check that reached a verdict keeps the ordinary spacing', () => {
  assert.equal(checkFollowUpPhase({ state: 'idle', checkedAt: T }, 0), 'periodic')
  assert.equal(checkFollowUpPhase({ state: 'error', message: 'offline' }, 0), 'periodic')
  assert.equal(checkFollowUpPhase({ state: 'available', version: '1.3.0' }, 0), 'periodic')
})

// ------------------------------------------------------------------ the wiring

test('THE WIRING: main marks the interruption and both callers of a check use the follow-up', () => {
  const updater = read('src/main/updater.ts')
  assert.match(updater, /sinks\.push\(\{ state: 'idle', interrupted: step \}\)/)
  // The poll loop and the manual check both re-arm from the verdict, so neither can overwrite
  // the short retry with the 4 hour spacing.
  assert.match(updater, /\.finally\(\(\) => schedule\(checkFollowUpPhase\(lastStatus, interruptedInARow\)\)\)/)
  assert.match(updater, /schedule\(checkFollowUpPhase\(res, interruptedInARow\)\)/)
  assert.doesNotMatch(updater, /finally\(\(\) => schedule\('periodic'\)\)/)
  // Counted per interruption, cleared by any check that completes.
  assert.match(updater, /interruptedInARow\+\+/)
  assert.match(updater, /interruptedInARow = 0/)
})

test('THE WIRING: both check buttons skip the cooldown after an interruption', () => {
  assert.match(read('src/renderer/src/components/UpdateChip.tsx'), /checkEarnsCooldown\(/)
  assert.match(read('src/renderer/src/features/preferences/UpdateSetting.tsx'), /checkEarnsCooldown\(/)
})
