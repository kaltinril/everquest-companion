// What happens after a DOWNLOAD fails. The check that found the build succeeded, and the poll was
// already re-armed at the healthy 4 hour spacing before the download died, so a passing failure
// (a reset connection, a truncated file) used to wait 3 to 5 hours for its next try. The failed
// download now re-arms the poll itself, at the 15 minute backoff.
//
// The decision is pure (src/shared/update.ts); the wiring is pinned from the source, because
// electron-updater cannot run in a node test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BACKOFF_BASE_MS,
  CHECK_INTERVAL_MS,
  JITTER_FRACTION,
  type UpdateFailureKind,
  nextCheckDelayMs,
  rescheduleAfterUpdateError
} from '../src/shared/update'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const updater = readFileSync(join(ROOT, 'src', 'main', 'updater.ts'), 'utf8')

test('a failed download asks for the next check soon', () => {
  const kinds: UpdateFailureKind[] = ['http', 'parse', 'unreachable', 'other']
  for (const kind of kinds) {
    assert.equal(rescheduleAfterUpdateError({ step: 'download', kind }), true, kind)
  }
})

test('a failed check does not: the poll loop already re-arms after every check', () => {
  const kinds: UpdateFailureKind[] = ['http', 'parse', 'unreachable', 'other', 'blocked']
  for (const kind of kinds) {
    assert.equal(rescheduleAfterUpdateError({ step: 'check', kind }), false, kind)
  }
})

test('a blocked signature check does not: 15 minutes will not change this PC, and each try re-downloads', () => {
  assert.equal(rescheduleAfterUpdateError({ step: 'download', kind: 'blocked' }), false)
})

test('an interrupted download does not: it already has its own short retry', () => {
  assert.equal(rescheduleAfterUpdateError({ step: 'download', kind: 'interrupted' }), false)
})

test('the retry a failed download earns is the 15 minute backoff, well inside the 4 hour spacing', () => {
  for (const rand of [0, 0.5, 0.999]) {
    const delay = nextCheckDelayMs({ phase: 'periodic', consecutiveFailures: 1 }, () => rand)
    assert.ok(delay >= BACKOFF_BASE_MS * (1 - JITTER_FRACTION), `${delay} is too soon`)
    assert.ok(delay <= BACKOFF_BASE_MS * (1 + JITTER_FRACTION), `${delay} is too late`)
    assert.ok(delay < CHECK_INTERVAL_MS * (1 - JITTER_FRACTION))
  }
})

test('THE WIRING: the error handler re-arms the poll after it has counted the failure', () => {
  // The sink is the ordinary poll, so the switch-off guard and the backoff both apply to it.
  assert.match(updater, /retrySoon: \(\) => schedule\('periodic'\)/)
  const handler = updater.slice(updater.indexOf("autoUpdater.on('error'"))
  const counted = handler.indexOf('consecutiveFailures++')
  const rearmed = handler.indexOf('if (rescheduleAfterUpdateError({ step, kind })) retrySoon()')
  assert.ok(counted > 0, 'the failure is counted')
  assert.ok(rearmed > counted, 'and the poll is re-armed after the count, so the delay is the backoff')
})
