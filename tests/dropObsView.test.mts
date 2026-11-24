// The words the "Send my loot to the wiki" card shows (features/preferences/dropObsView.ts;
// requirements/drop-db-submit.md, 2026-11-24 row): a count and a rough time left while sending,
// plain reasons instead of wiki codes, and the setup stage that decides what the card asks for.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ago, errorWords, keptReason, progressView, setupStage, timeLeft } from '../src/renderer/src/features/preferences/dropObsView'
import type { DropObsStatus } from '../src/shared/dropObs'

const NOW = Date.UTC(2026, 10, 24, 15, 0, 0)

function st(over: Partial<DropObsStatus> = {}): DropObsStatus {
  return {
    enabled: false,
    username: 'Kal@Companion',
    hasPassword: true,
    encryptionAvailable: true,
    ready: 0,
    inFlight: 0,
    delivered: 0,
    kept: 0,
    lastError: null,
    stopped: null,
    nextAttemptAt: 0,
    lastSuccessAt: 0,
    signedInAs: 'Kal',
    keptItems: [],
    ...over
  }
}

test('setup stage: nothing saved, saved but never signed in, signed in', () => {
  assert.equal(setupStage(st({ hasPassword: false, username: '', signedInAs: '' })), 'no-sign-in')
  assert.equal(setupStage(st({ hasPassword: false })), 'no-sign-in')
  assert.equal(setupStage(st({ signedInAs: '' })), 'not-signed-in')
  assert.equal(setupStage(st()), 'signed-in')
})

test('switched off: the count that turning it on would send, never a wiki code', () => {
  assert.deepEqual(progressView(st({ ready: 1234 }), NOW), { tone: 'info', headline: '1,234 loot reports from your log are ready to send.', detail: 'Turn the switch on to send them, newest first.' })
  assert.equal(progressView(st({ ready: 1 }), NOW).headline, '1 loot report from your log is ready to send.')
  assert.equal(progressView(st({ ready: 0 }), NOW).headline, 'No loot reports waiting.')
  assert.equal(progressView(st({ ready: null }), NOW).headline, 'Waiting for your log to load.')
})

test('sending: what is left (the batch in flight counted) and roughly how long', () => {
  const v = progressView(st({ enabled: true, ready: 900, inFlight: 100, delivered: 340, lastSuccessAt: NOW - 5 * 60_000 }), NOW)
  assert.equal(v.tone, 'busy')
  assert.equal(v.headline, 'Sending… 1,000 left, about 5 minutes to go.')
  assert.equal(v.detail, '340 reports sent so far · last sent 5 minutes ago')
})

test('caught up: done, with what went and when', () => {
  const v = progressView(st({ enabled: true, ready: 0, delivered: 1, lastSuccessAt: NOW - 10_000 }), NOW)
  assert.equal(v.tone, 'done')
  assert.match(v.headline, /^All caught up/)
  assert.equal(v.detail, '1 report sent so far · last sent just now')
})

test('a retry waiting says why in words and when it tries again', () => {
  const v = progressView(st({ enabled: true, ready: 50, lastError: 'eoz-rate-limit', nextAttemptAt: NOW + 120_000 }), NOW)
  assert.equal(v.tone, 'warn')
  assert.match(v.headline, /^The wiki asked the app to slow down\. Trying again at /)
  assert.equal(v.detail, '50 left')
})

test('a stop leads with the reason main gave, ahead of everything else', () => {
  const v = progressView(st({ enabled: true, ready: 50, stopped: 'The wiki signed this session out. Press Sign in again.' }), NOW)
  assert.equal(v.tone, 'warn')
  assert.equal(v.headline, 'Sending stopped. The wiki signed this session out. Press Sign in again.')
})

test('error and refusal codes become words', () => {
  assert.equal(errorWords('eqc-network'), 'Could not reach the wiki')
  assert.equal(errorWords('eqc-http-503'), 'The wiki is busy')
  assert.equal(errorWords('eoz-capacity'), 'The wiki is busy')
  assert.equal(errorWords('eqc-http-429'), 'The wiki asked the app to slow down')
  assert.match(errorWords('eqc-bad-receipt'), /eqc-bad-receipt/)
  assert.equal(keptReason('conflict'), 'already reported with different details')
  assert.match(keptReason('eoz-invalid-batch'), /with its batch/)
})

test('time left rounds up to whole minutes at 100 reports per 30 s', () => {
  assert.equal(timeLeft(1), 'about a minute')
  assert.equal(timeLeft(200), 'about a minute')
  assert.equal(timeLeft(201), 'about 2 minutes')
  assert.equal(timeLeft(5000), 'about 25 minutes')
})

test('ago: seconds read as just now, then minutes, hours, days', () => {
  assert.equal(ago(NOW - 30_000, NOW), 'just now')
  assert.equal(ago(NOW - 60_000, NOW), '1 minute ago')
  assert.equal(ago(NOW - 3 * 3600_000, NOW), '3 hours ago')
  assert.equal(ago(NOW - 72 * 3600_000, NOW), '3 days ago')
})
