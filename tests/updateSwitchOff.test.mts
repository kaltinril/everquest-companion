// What the app says about updates when "Update automatically" is off, and what it says about a
// build that is downloaded but not installed. Pure wording functions (src/shared/update.ts), plus
// source pins on the main-process wiring that a node test cannot run (electron-updater needs a
// packaged app).
//
// The defect: with the switch off, a build the player downloaded by hand was forgotten when the app
// closed, and Preferences then said "up to date" about a version it knew was behind.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  autoUpdateCaption,
  readyChipTip,
  updateChipLine,
  updateChipState,
  updatePrefsChip
} from '../src/shared/update'
import type { UpdateStatus } from '../src/shared/types'

const CURRENT = '0.39.0'
const NEWER = '0.40.0'
const T = 1_700_000_000_000

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const prefsChip = (status: UpdateStatus, cooldown = false): string =>
  updatePrefsChip(status, updateChipState(status, CURRENT), cooldown).label

const navLine = (status: UpdateStatus, cooldown = false): { label: string; tip: string } =>
  updateChipLine(updateChipState(status, CURRENT), {
    version: CURRENT,
    age: status.checkedAt === undefined ? null : '5m ago',
    busy: false,
    cooldown
  })

// ------------------------------------------------------------ Preferences chip

test('switch off: Preferences does not say "up to date" about a check nothing repeats', () => {
  const off: UpdateStatus = { state: 'idle', checkedAt: T, autoUpdateOff: true }
  assert.equal(prefsChip(off), 'automatic updates off')
  // Never checked at all is the same claim with even less behind it.
  assert.equal(prefsChip({ state: 'idle', autoUpdateOff: true }), 'automatic updates off')
})

test('switch off: the verdict of a check the player just ran is still stated', () => {
  const off: UpdateStatus = { state: 'idle', checkedAt: T, autoUpdateOff: true }
  assert.equal(prefsChip(off, true), 'up to date')
})

test('switch on: the Preferences chip reads as it always did', () => {
  assert.equal(prefsChip({ state: 'idle', checkedAt: T }), 'up to date')
  assert.equal(prefsChip({ state: 'checking', checkedAt: T }), 'checking')
  assert.equal(prefsChip({ state: 'available', version: NEWER }), 'update available')
  assert.equal(prefsChip({ state: 'downloading', version: NEWER, percent: 4 }), 'downloading')
  assert.equal(prefsChip({ state: 'ready', version: NEWER }), 'update ready')
  assert.equal(prefsChip({ state: 'error', message: 'x' }), 'check failed')
  // A 'ready' naming the build we already run is not an offer.
  assert.equal(prefsChip({ state: 'ready', version: CURRENT, checkedAt: T }), 'up to date')
  const ready: UpdateStatus = { state: 'ready', version: NEWER }
  assert.deepEqual(updatePrefsChip(ready, updateChipState(ready, CURRENT), false), {
    label: 'update ready',
    color: 'success'
  })
})

test('a launch that has never checked does not claim "up to date"', () => {
  assert.equal(prefsChip({ state: 'idle' }), 'not checked yet')
})

test('a dev build says updates are off, whatever else the status carries', () => {
  const dev: UpdateStatus = { state: 'idle', disabled: true, autoUpdateOff: true, stagedVersion: NEWER }
  assert.equal(prefsChip(dev), 'dev build - updates off')
})

// ------------------------------------------- a build downloaded, then the app closed

test('a downloaded build that was not installed is named after a restart, never "up to date"', () => {
  const status: UpdateStatus = { state: 'idle', checkedAt: T, autoUpdateOff: true, stagedVersion: NEWER }
  assert.equal(prefsChip(status), 'update not installed')
  assert.equal(prefsChip(status, true), 'update not installed')

  const line = navLine(status)
  assert.equal(line.label, `v${CURRENT} · update not installed`)
  assert.match(line.tip, new RegExp(`v${NEWER.replaceAll('.', '\\.')}`))
  assert.doesNotMatch(navLine(status, true).label, /up to date/)
})

test('a remembered build that is not newer than the running one is not mentioned', () => {
  const installed: UpdateStatus = { state: 'idle', checkedAt: T, stagedVersion: CURRENT }
  assert.equal(prefsChip(installed), 'up to date')
  assert.equal(navLine(installed).label, `v${CURRENT} · checked 5m ago`)
  // Unknown running version: no claim either way.
  const ui = updateChipState({ state: 'idle', stagedVersion: NEWER }, undefined)
  assert.deepEqual(ui, { kind: 'quiet', checkedAt: undefined, failed: false, disabled: undefined })
})

test('a failed check still says it failed, with or without a remembered build', () => {
  const failed: UpdateStatus = { state: 'error', message: 'offline', checkedAt: T, stagedVersion: NEWER }
  assert.equal(navLine(failed).label, `v${CURRENT} · update check failed`)
  assert.equal(prefsChip(failed), 'check failed')
})

// ----------------------------------------------------- the switch's own sentence

test('switch off with a build ready: the caption says closing the app will not install it', () => {
  const ready = updateChipState({ state: 'ready', version: NEWER, autoUpdateOff: true }, CURRENT)
  const caption = autoUpdateCaption(true, CURRENT, ready)
  assert.match(caption, /v0\.40\.0 is downloaded/)
  assert.match(caption, /closing the app will not/)
})

test('switch off with a remembered build: the caption says how to finish it', () => {
  const ui = updateChipState({ state: 'idle', autoUpdateOff: true, stagedVersion: NEWER }, CURRENT)
  const caption = autoUpdateCaption(true, CURRENT, ui)
  assert.match(caption, /v0\.40\.0 is downloaded but not installed/)
  assert.match(caption, /Check for updates/)
})

test('the two captions the switch always had are unchanged', () => {
  const idle = updateChipState({ state: 'idle', checkedAt: T }, CURRENT)
  assert.equal(
    autoUpdateCaption(false, CURRENT, idle),
    'New versions download in the background and install when you close the app.'
  )
  assert.equal(
    autoUpdateCaption(true, CURRENT, idle),
    'Staying on v0.39.0. It updates only when you press Check for updates.'
  )
  assert.equal(
    autoUpdateCaption(true, '', idle),
    'Staying on this version. It updates only when you press Check for updates.'
  )
})

test('the gold chip tooltip: closing installs only when the switch is on', () => {
  assert.equal(readyChipTip(NEWER, false), 'Restart to update to v0.40.0')
  assert.equal(readyChipTip(undefined, false), 'Restart to update')
  assert.match(readyChipTip(NEWER, true), /closing the app will not install it/)
  const words = readyChipTip(NEWER, true).split(/\s+/).length
  assert.ok(words >= 7 && words <= 15, `${words} words`)
})

// ------------------------------------------------------------- the wiring

test('main remembers a downloaded version across launches and forgets it when it is installed', () => {
  const updater = read('src/main/updater.ts')
  // Remembered when the download lands, forgotten when the feed no longer offers it or a
  // download fails (which leaves no file behind).
  assert.match(updater, /rememberStaged\(version\)\s+push\(\{ state: 'ready', version \}\)/)
  assert.match(updater, /rememberStaged\(undefined\)\s+checkDone\(\{ state: 'idle' \}\)/)
  assert.match(updater, /if \(step === 'download'\) rememberStaged\(undefined\)/)
  assert.match(updater, /if \(stagedVersion\) lastStatus\.stagedVersion = stagedVersion/)
  // Read back at launch, and dropped unless it is newer than the build now running.
  assert.match(updater, /getUpdateStagedVersion\(\)/)
  assert.match(updater, /isNewerVersion\(stagedVersion, currentVersion\)/)
  // No background check is added for it: the switch still stops every unasked request.
  assert.match(updater, /if \(autoUpdateOff\) return/)
})

test('the two surfaces read their words from the shared functions', () => {
  const prefs = read('src/renderer/src/features/preferences/UpdateSetting.tsx')
  assert.match(prefs, /updatePrefsChip\(/)
  assert.match(prefs, /autoUpdateCaption\(/)
  assert.doesNotMatch(prefs, /label: 'up to date'/)
  assert.match(read('src/renderer/src/components/UpdateChip.tsx'), /readyChipTip\(/)
})
