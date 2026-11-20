// The window's own connection to the engine, retried with a cap (fork #9, phase R3). It asked
// again every 4 s for ever: the one retry on the log-loading path that the link keeper's cap did
// not cover. Recovery never loops blindly: a retry has a cap, or needs a changed fact.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  RETRY_DELAYS_MS,
  RETRY_MAX_TRIES,
  onStatusWords,
  retryPlan
} from '../src/shared/dataServer/retryPlan'

test('THE WAITS ARE 4, 8, 16 AND 30 s, one after each failed try', () => {
  assert.deepEqual(RETRY_DELAYS_MS, [4_000, 8_000, 16_000, 30_000])
  const waits = [1, 2, 3, 4].map((tries) => retryPlan(tries, false).delayMs)
  assert.deepEqual(waits, [4_000, 8_000, 16_000, 30_000])
  // The count is carried as it was: the caller counts its own failures.
  assert.deepEqual(retryPlan(3, false), { tries: 3, delayMs: 16_000 })
})

test('NO TIMER AFTER 5 TRIES: the window stops asking by the clock', () => {
  assert.equal(RETRY_MAX_TRIES, 5)
  assert.deepEqual(retryPlan(5, false), { tries: 5, delayMs: null })
  assert.equal(retryPlan(6, false).delayMs, null)
  assert.equal(retryPlan(500, false).delayMs, null)
  // The whole ladder is under a minute of waiting, and then nothing.
  assert.equal(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0), 58_000)
})

test('A STATUS CHANGE STARTS AGAIN: a try now, and the count from nothing', () => {
  assert.deepEqual(retryPlan(5, true), { tries: 0, delayMs: 0 })
  assert.deepEqual(retryPlan(2, true), { tries: 0, delayMs: 0 })
  // ...so the try after it, if it fails too, waits the first 4 s again.
  const again = retryPlan(retryPlan(5, true).tries + 1, false)
  assert.deepEqual(again, { tries: 1, delayMs: 4_000 })
})

test('a window that has not failed has nothing to wait for', () => {
  assert.deepEqual(retryPlan(0, false), { tries: 0, delayMs: null })
})

test('THE PROVIDER ASKS THE PLAN: no fixed interval is left, and a taken connection clears the count', () => {
  // engineProvider.tsx is a React component over `window.eq` and cannot be run here, so its
  // wiring is read from source with the comments taken out (the instrument logReadPokes uses).
  const provider = readFileSync(new URL('../src/renderer/src/lib/engineProvider.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(provider, /RETRY_MS/, 'the flat 4 s retry is back')
  const timers = provider.match(/setTimeout\(/g) ?? []
  assert.equal(timers.length, 1, 'a second timer could retry outside the plan')
  assert.match(provider, /retry\.current\.tries \+= 1\s*const \{ delayMs \} = retryPlan\(retry\.current\.tries, false\)/)
  assert.match(provider, /if \(delayMs === null\) return\s*timer = setTimeout\(/, 'out of tries, a timer is still set')
  assert.match(provider, /retry\.current = \{ tries: 0, phase: 'connected' \}/)
  // The changed fact: the engine words of the pushed status, and nothing else.
  assert.match(provider, /const engineWords = useLogReadReport\(\)\?\.engine \?\? null/)
  assert.match(provider, /const what = onStatusWords\(retry\.current\.phase\)/)
  assert.match(provider, /retry\.current\.tries = retryPlan\(retry\.current\.tries, true\)\.tries\s*if \(what === 'tryNow'\) setAttempt\(/)
})

test('WHAT A CHANGE OF THE ENGINE WORDS DOES depends on what the window is doing', () => {
  // Waiting out a timer, or out of tries: the changed fact is the reason to try now.
  assert.equal(onStatusWords('waiting'), 'tryNow')
  assert.equal(onStatusWords('stopped'), 'tryNow')
  // A try is already out: it is not thrown away, but its failure counts from nothing.
  assert.equal(onStatusWords('trying'), 'recount')
  // Connected: the words change all the time while the log is read, and none of it is a reason.
  assert.equal(onStatusWords('connected'), 'nothing')
})
