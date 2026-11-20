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
  retryAfter,
  retryPlan,
  type RetryCount,
  type RetryEvent
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

/** The waits a window sits out over `rounds` tries, each one ending as `events` say. */
function waitsOver(rounds: number, events: readonly RetryEvent[]): (number | null)[] {
  let held: RetryCount = { tries: 0, phase: 'trying' }
  const waits: (number | null)[] = []
  for (let i = 0; i < rounds; i += 1) {
    for (const event of events) held = retryAfter(held, event)
    waits.push(retryPlan(held.tries, false).delayMs)
  }
  return waits
}

test('A CONNECTION TAKEN AND THEN FAILED AT HELLO COUNTS: five tries, then no timer', () => {
  // An engine that does not match this window, a refused token, a socket that closes at once:
  // the connection is handed over every time and never proven. Each used to count as try 1.
  assert.deepEqual(waitsOver(7, ['taken', 'failed']), [4_000, 8_000, 16_000, 30_000, null, null, null])
  let held: RetryCount = { tries: 0, phase: 'trying' }
  for (let i = 0; i < RETRY_MAX_TRIES; i += 1) held = retryAfter(retryAfter(held, 'taken'), 'failed')
  assert.deepEqual(held, { tries: 5, phase: 'stopped' })
  // A try that got no connection at all counts the same way.
  assert.deepEqual(waitsOver(6, ['failed']), [4_000, 8_000, 16_000, 30_000, null, null])
})

test('ONLY A PROVEN CONNECTION STARTS THE COUNT AGAIN, and a taken one stops the words being read', () => {
  const failing: RetryCount = { tries: 3, phase: 'waiting' }
  // Taken: the count stands, and the status's words (which move all through a read) are ignored.
  assert.deepEqual(retryAfter(failing, 'taken'), { tries: 3, phase: 'connected' })
  // The hello was accepted: the next failure is the first of a new run.
  assert.deepEqual(retryAfter(retryAfter(failing, 'taken'), 'ready'), { tries: 0, phase: 'connected' })
  // A connection that worked and was then lost (a respawn) waits the first 4 s every time.
  assert.deepEqual(waitsOver(6, ['taken', 'ready', 'failed']), [4_000, 4_000, 4_000, 4_000, 4_000, 4_000])
  assert.deepEqual(retryAfter({ tries: 0, phase: 'connected' }, 'failed'), { tries: 1, phase: 'waiting' })
})

test('THE PROVIDER ASKS THE PLAN: no fixed interval is left, and only a proven connection clears the count', () => {
  // engineProvider.tsx is a React component over `window.eq` and cannot be run here, so its
  // wiring is read from source with the comments taken out (the instrument logReadPokes uses).
  const provider = readFileSync(new URL('../src/renderer/src/lib/engineProvider.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(provider, /RETRY_MS/, 'the flat 4 s retry is back')
  const timers = provider.match(/setTimeout\(/g) ?? []
  assert.equal(timers.length, 1, 'a second timer could retry outside the plan')
  assert.match(provider, /retry\.current = retryAfter\(retry\.current, 'failed'\)\s*const \{ delayMs \} = retryPlan\(retry\.current\.tries, false\)/)
  assert.match(provider, /if \(delayMs === null\) return\s*timer = setTimeout\(/, 'out of tries, a timer is still set')
  // The count is cleared by the hello's answer and by nothing sooner; `taken` is said before the
  // attach, so a failure during it is not written over.
  assert.match(provider, /if \(state === 'ready'\) retry\.current = retryAfter\(retry\.current, 'ready'\)/)
  assert.match(provider, /retry\.current = retryAfter\(retry\.current, 'taken'\)\s*next\.attach\(/)
  assert.doesNotMatch(provider, /tries: 0, phase: 'connected'/, 'a connection that was only taken clears the count')
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
