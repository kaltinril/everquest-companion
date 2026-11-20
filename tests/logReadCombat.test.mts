// The meter's own reads, after the log is read (fork #9, phase R3): one place decides, from the
// newest outcome of each question, and a reply that is too large can never lead to a restart.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMBAT_READ_FRESH_MS, LOG_READ_SLOW_MS, type LogReadCombatRead, type LogReadFacts } from '../src/shared/logReadReport'
import { LOG_READ_ACTION, LOG_READ_TRY, LOG_READ_WORDS } from '../src/shared/logReadWords'
import { health, report, NOW } from './logReadFactsHarness.mts'

const LIVE: Partial<LogReadFacts> = { readiness: 'ok', health: health('live'), waitingSince: NOW - 7_200_000 }

const PHRASE: Record<string, string> = {
  tooLarge: 'the reply was too large to show',
  timedOut: 'the engine did not answer in time',
  refused: 'the engine refused',
  guess: 'the engine’s answer would have been a guess',
  notLive: 'the engine is still folding'
}

/** One meter question's newest read: unserved for `why`, or served when `why` is null. */
function read(key: string, why: string | null, over: Partial<LogReadCombatRead> = {}): LogReadCombatRead {
  const unserved = why === null ? null : PHRASE[why]
  return { key, unserved, why, code: null, at: NOW, since: why === null ? null : NOW, ...over }
}

function live(...combatReads: LogReadCombatRead[]): ReturnType<typeof report> {
  return report({ ...LIVE, combatReads })
}

test('A REPLY TOO LARGE BEATS A TIMED-OUT AND A REFUSED KEY, and it has no button', () => {
  const r = live(read('zone', 'timedOut'), read('fight', 'tooLarge'), read('heal', 'refused', { code: 'internal' }))
  assert.equal(r.wait, 'replyTooLarge')
  assert.equal(r.action, null, 'no button can make the reply smaller')
  assert.equal(LOG_READ_ACTION.replyTooLarge, null)
  assert.equal(r.show, true, 'waiting longer will not change it')
})

test('A TIMED-OUT KEY WITH THE LOG READ IS A SLOW PANEL, not a dead engine', () => {
  const r = live(read('fight', 'timedOut'))
  assert.equal(r.wait, 'panelSlow')
  assert.equal(LOG_READ_WORDS[r.wait], 'Your log is read. This panel is taking too long to build.')
  assert.equal(r.tryLine, 'Wait a moment. If it stays, turn on Summarize and archive log in Preferences.')
  assert.equal(LOG_READ_TRY.panelSlow, r.tryLine)
  assert.equal(r.action, null, 'a slow panel was offered a restart of the connection')
  assert.equal(r.lastError, 'the engine did not answer in time')
})

test('a refusal with a timeout code is a slow panel too: the request ran out the client-s own deadline', () => {
  assert.equal(live(read('fight', 'refused', { code: 'timeout' })).wait, 'panelSlow')
})

test('ANOTHER REFUSAL IS THE ENGINE NOT ANSWERING, with the reconnect button', () => {
  const r = live(read('fight', 'refused', { code: 'internal' }))
  assert.equal(r.wait, 'notAnswering')
  assert.equal(r.action, 'reconnect')
  assert.equal(r.lastError, 'the engine refused (internal)')
  // A refusal with no code at all is still a refusal.
  assert.equal(live(read('fight', 'refused')).wait, 'notAnswering')
  // A slow key outranks it: the engine that is slow on one question is answering.
  assert.equal(live(read('fight', 'refused', { code: 'internal' }), read('zone', 'timedOut')).wait, 'panelSlow')
})

test('A SERVED READ OF ANOTHER KEY DOES NOT HIDE A FAILED ONE', () => {
  // An overlay's served read used to overwrite the one slot the Combat tab's failure was in.
  assert.equal(live(read('fight', 'timedOut'), read('overlay', null)).wait, 'panelSlow')
  assert.equal(live(read('overlay', null), read('fight', 'timedOut')).wait, 'panelSlow')
  assert.equal(live(read('fight', null), read('overlay', null)).wait, 'ok')
})

test('a guess, a reason that is about readiness, and nothing at all are all `ok`', () => {
  assert.equal(live(read('fight', 'guess')).wait, 'ok')
  // Readiness is ok now: a read that was told otherwise was told about a moment that has passed.
  assert.equal(live(read('fight', 'notLive')).wait, 'ok')
  assert.equal(live().wait, 'ok')
  assert.equal(live().waitingSince, NOW - 7_200_000)
})

test('while the log is still being read, the read is the wait whatever the meter was told', () => {
  const r = report({ combatReads: [read('fight', 'tooLarge'), read('zone', 'timedOut')] })
  assert.equal(r.wait, 'reading')
})

test('THE WAIT IS TIMED FROM WHEN ITS OWN KEYS BEGAN FAILING, and shows after 15 s', () => {
  const young = read('fight', 'timedOut', { since: NOW - 1_000 })
  const old = read('zone', 'timedOut', { since: NOW - LOG_READ_SLOW_MS })
  // A refused key that has failed for longer does not lend its clock to the slow ones.
  const other = read('heal', 'refused', { code: 'internal', since: NOW - 600_000 })
  assert.equal(live(young, other).waitingSince, NOW - 1_000)
  assert.equal(live(young, other).show, false, 'one slow read was put on every tab')
  const held = live(young, old, other)
  assert.equal(held.waitingSince, NOW - LOG_READ_SLOW_MS)
  assert.equal(held.show, true)
})

test('a key nobody has asked again for 30 s says nothing any more', () => {
  const stale = { at: NOW - COMBAT_READ_FRESH_MS - 1 }
  assert.equal(live(read('fight', 'timedOut', { at: NOW - COMBAT_READ_FRESH_MS })).wait, 'panelSlow')
  assert.equal(live(read('fight', 'timedOut', stale)).wait, 'ok')
  assert.equal(live(read('fight', 'tooLarge', stale)).wait, 'ok')
  // A stale too-large key does not outrank a fresh slow one.
  assert.equal(live(read('fight', 'tooLarge', stale), read('zone', 'timedOut')).wait, 'panelSlow')
})

test('the Last error row quotes the newest read of the kind that decided', () => {
  const first = read('fight', 'refused', { code: 'internal', at: NOW - 2_000 })
  const newest = read('zone', 'refused', { code: 'badParams', at: NOW - 500 })
  assert.equal(live(first, newest).lastError, 'the engine refused (badParams)')
})
