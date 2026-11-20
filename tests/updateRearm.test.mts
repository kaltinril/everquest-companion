// Turning "Update automatically" back ON with a build already downloaded.
//
// electron-updater registers its install-on-quit handler only when a download resolves while
// autoInstallOnAppQuit is true (BaseUpdater.js addQuitHandler). A build downloaded with the switch
// off therefore has no handler, and flipping the switch on did not add one: the caption then
// promised "install when you close the app" and closing installed nothing.
//
// The decision is pure (src/shared/update.ts); the wiring is pinned from the source, because
// electron-updater cannot run in a node test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldRearmStagedBuild } from '../src/shared/update'
import type { UpdateStatus } from '../src/shared/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const updater = readFileSync(join(ROOT, 'src', 'main', 'updater.ts'), 'utf8')

test('switch on, build downloaded while it was off: install-on-close is armed now', () => {
  assert.equal(shouldRearmStagedBuild({ quitArmed: false, autoUpdateOff: false, state: 'ready' }), true)
})

test('already armed in this session: nothing to do, and no second hash of the installer', () => {
  assert.equal(shouldRearmStagedBuild({ quitArmed: true, autoUpdateOff: false, state: 'ready' }), false)
})

test('switch off: never armed, whatever is downloaded', () => {
  assert.equal(shouldRearmStagedBuild({ quitArmed: false, autoUpdateOff: true, state: 'ready' }), false)
  assert.equal(shouldRearmStagedBuild({ quitArmed: true, autoUpdateOff: true, state: 'ready' }), false)
})

test('nothing downloaded yet: the ordinary check arms it when the download lands', () => {
  const states: UpdateStatus['state'][] = ['idle', 'checking', 'available', 'downloading', 'error']
  for (const state of states) {
    assert.equal(shouldRearmStagedBuild({ quitArmed: false, autoUpdateOff: false, state }), false, state)
  }
})

test('THE WIRING: the switch sets the flag first, then re-resolves the downloaded build', () => {
  const apply = updater.slice(updater.indexOf('applyAutoUpdate = () => {'))
  const flag = apply.indexOf('autoUpdater.autoInstallOnAppQuit = !autoUpdateOff')
  const rearm = apply.indexOf('rearmApplyOnQuit()')
  assert.ok(flag > 0 && rearm > flag, 'the flag must be true before the download resolves')
  // Re-resolving goes through the library's public door, which validates the cached file and
  // runs the callback that registers the quit handler.
  const fn = updater.slice(updater.indexOf('function rearmApplyOnQuit'))
  assert.match(fn.slice(0, 400), /shouldRearmStagedBuild\(/)
  assert.match(fn.slice(0, 400), /autoUpdater\.downloadUpdate\(\)/)
})

test('THE WIRING: "armed" is recorded only when a download lands with install-on-close on', () => {
  assert.match(updater, /if \(autoUpdater\.autoInstallOnAppQuit\) quitArmed = true/)
})
