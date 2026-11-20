// HOW LARGE A REPLY WAS, AND WHAT THAT STOPS (fork #9): `src/main/dataServer/replySizes.ts`.
//
// Two limits, on purpose: what main may read (the transport's) and what main will hand to a window
// (MAX_FORWARD_CHARS, half of it). A reply over either is not asked for again until the log is
// re-read; a large one that is still shown is asked for at most once every five seconds.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LARGE_MESSAGE_CHARS, MAX_MESSAGE_CHARS } from '../src/shared/dataServer/ndjson'
import {
  LARGE_REPLY_FLOOR_MS,
  MAX_FORWARD_CHARS,
  createReplySizes,
  replySizes
} from '../src/main/dataServer/replySizes'

const MIB = 1024 * 1024
const LOOT = 'module.snapshot {"module":"loot"}'
const FIGHTS = 'combat.snapshot {"opts":{}}'

test('the show limit is half the read limit, and large starts at a quarter of it', () => {
  assert.equal(MAX_FORWARD_CHARS, 32 * MIB)
  assert.equal(MAX_FORWARD_CHARS * 2, MAX_MESSAGE_CHARS)
  assert.equal(LARGE_MESSAGE_CHARS, 16 * MIB)
})

test('BLOCKED after a refused reply, and after one too large to show; not after a 20 MiB one', () => {
  const sizes = createReplySizes()
  assert.equal(sizes.blocked(LOOT), false, 'nothing is known yet')

  sizes.note(LOOT, 20 * MIB, false)
  assert.equal(sizes.blocked(LOOT), false, 'a large reply that can be shown is still asked for')

  sizes.note(LOOT, MAX_FORWARD_CHARS, false)
  assert.equal(sizes.blocked(LOOT), false, 'exactly at the limit is shown')
  sizes.note(LOOT, MAX_FORWARD_CHARS + 1, false)
  assert.equal(sizes.blocked(LOOT), true, 'read by main, too large for a window')

  sizes.note(FIGHTS, 70 * MIB, true)
  assert.equal(sizes.blocked(FIGHTS), true, 'main could not read it at all')
  assert.equal(sizes.blocked('module.snapshot {"module":"kills"}'), false, 'one question blocks only itself')
})

test('a blocked question stays blocked for the rest of the read, whatever is noted next', () => {
  const sizes = createReplySizes()
  sizes.note(LOOT, 70 * MIB, true)
  sizes.note(LOOT, 20 * MIB, false)
  assert.equal(sizes.blocked(LOOT), true)
})

test('delayFor is 0 under 16 MiB, and the rest of five seconds at or over it', () => {
  const sizes = createReplySizes()
  const t0 = 1_000_000
  sizes.sent(LOOT, t0)
  assert.equal(sizes.delayFor(LOOT, t0 + 10), 0, 'no reply size is known')

  sizes.note(LOOT, LARGE_MESSAGE_CHARS - 1, false)
  assert.equal(sizes.delayFor(LOOT, t0 + 10), 0, 'under the large size there is no floor')

  sizes.note(LOOT, LARGE_MESSAGE_CHARS, false)
  assert.equal(sizes.delayFor(LOOT, t0 + 10), LARGE_REPLY_FLOOR_MS - 10)
  assert.equal(sizes.delayFor(LOOT, t0 + 4_999), 1)
  assert.equal(sizes.delayFor(LOOT, t0 + LARGE_REPLY_FLOOR_MS), 0)
  assert.equal(sizes.delayFor(LOOT, t0 + 60_000), 0, 'never negative')

  // The floor runs from the newest send.
  sizes.sent(LOOT, t0 + 6_000)
  assert.equal(sizes.delayFor(LOOT, t0 + 7_000), 4_000)
  assert.equal(sizes.delayFor(FIGHTS, t0 + 7_000), 0, 'one question delays only itself')
})

test('RESET CLEARS BOTH: a new read of the log starts with nothing known', () => {
  const sizes = createReplySizes()
  sizes.sent(LOOT, 1_000)
  sizes.note(LOOT, 20 * MIB, false)
  sizes.note(FIGHTS, 70 * MIB, true)
  assert.equal(sizes.delayFor(LOOT, 1_500), 4_500)
  assert.equal(sizes.blocked(FIGHTS), true)

  sizes.reset()
  assert.equal(sizes.delayFor(LOOT, 1_500), 0)
  assert.equal(sizes.blocked(FIGHTS), false)
})

test('the app has one instance, and it starts empty', () => {
  assert.equal(replySizes.blocked(LOOT), false)
  assert.equal(replySizes.delayFor(LOOT, Date.now()), 0)
})
