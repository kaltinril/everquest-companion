// The cursor overlay's trail / particles (owner, 2026-11-26: "trail/particle affects"). Pins the
// performance contract's half that lives in the shared maths: off by default and off spawns
// nothing, the live count is capped however fast the samples come, everything expires, the loop
// reports idle when empty (so a still mouse costs nothing), and a parked point clears the trail.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CURSOR_RING,
  DEFAULT_TRAIL_LENGTH,
  MAX_TRAIL_LENGTH,
  MIN_TRAIL_LENGTH,
  normalizeCursorRing,
  normalizeTrailMode
} from '../src/shared/presencePrefs'
import {
  SPARKLE_MAX_LIVE,
  TRAIL_MAX_LIVE,
  TRAIL_WIDTH_PX,
  createTrail,
  spawnTrail,
  stepTrail,
  trailBounds,
  trailChanged,
  trailParams,
  viewOf
} from '../src/shared/cursorTrail'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PARKED = { x: -9999, y: -9999 }

/** A fixed sequence, so the sparkle tests do not depend on Math.random. */
function seeded(): () => number {
  let n = 0
  return () => ((n = (n * 9301 + 49297) % 233280) / 233280)
}

test('the trail is off by default, and only a known mode survives the normalizer', () => {
  assert.equal(DEFAULT_CURSOR_RING.trail, 'off')
  assert.equal(DEFAULT_CURSOR_RING.trailLength, DEFAULT_TRAIL_LENGTH)
  assert.equal(normalizeCursorRing({ enabled: true }).trail, 'off')
  assert.equal(normalizeCursorRing({ trail: 'sparkles' }).trail, 'sparkles')
  for (const junk of ['Trail', 'fire', '', null, 1, {}, ['trail']]) assert.equal(normalizeTrailMode(junk), 'off')
  assert.equal(normalizeCursorRing({ trailLength: 99 }).trailLength, MAX_TRAIL_LENGTH)
  assert.equal(normalizeCursorRing({ trailLength: -2 }).trailLength, MIN_TRAIL_LENGTH)
  assert.equal(normalizeCursorRing({ trailLength: 6.6 }).trailLength, 7)
  assert.equal(normalizeCursorRing({ trailLength: '3' }).trailLength, DEFAULT_TRAIL_LENGTH)
})

test('off spawns nothing and is idle; a config from an older main is off', () => {
  const s = createTrail({})
  assert.equal(s.mode, 'off')
  assert.equal(s.params, null)
  spawnTrail(s, { x: 10, y: 10 }, 0)
  assert.equal(s.parts.length, 0)
  assert.equal(stepTrail(s, 0), false)
  assert.equal(trailBounds(s, 0), null)
})

test('the live count is capped for every mode and length, oldest dropped first', () => {
  for (const mode of ['trail', 'sparkles'] as const) {
    for (let length = MIN_TRAIL_LENGTH; length <= MAX_TRAIL_LENGTH; length++) {
      const s = createTrail({ trail: mode, trailLength: length })
      const cap = mode === 'trail' ? TRAIL_MAX_LIVE : SPARKLE_MAX_LIVE
      const rand = seeded()
      // A thousand samples in the same millisecond: the fastest mouse there could be.
      for (let i = 0; i < 1000; i++) {
        spawnTrail(s, { x: i, y: 5 }, 0, rand)
        assert.ok(s.parts.length <= cap, `${mode} ${length}: ${s.parts.length} live`)
      }
      assert.equal(s.parts.length, cap)
      // The newest survive: the last sample's point is still there.
      assert.equal(s.parts[s.parts.length - 1].x0, 999)
    }
  }
})

test('everything expires, and the loop reports idle once it has', () => {
  for (const mode of ['trail', 'sparkles'] as const) {
    const s = createTrail({ trail: mode, trailLength: MAX_TRAIL_LENGTH })
    const rand = seeded()
    for (let t = 0; t < 200; t += 8) spawnTrail(s, { x: t, y: t }, t, rand)
    assert.equal(stepTrail(s, 200), true, 'still fading just after the last sample')
    const longest = Math.max(...s.parts.map((p) => p.born + p.life))
    assert.equal(stepTrail(s, longest - 1), true)
    assert.equal(stepTrail(s, longest), false, `${mode}: idle once the last one has lived its life`)
    assert.equal(s.parts.length, 0)
    // A window hidden for a minute finds everything gone on its first frame.
    for (let t = 0; t < 50; t += 8) spawnTrail(s, { x: 1, y: 1 }, t, rand)
    assert.equal(stepTrail(s, 60_000), false)
  }
})

test('a trail point lives 60 ms per step of length; sparkles live longer and come more at length', () => {
  assert.deepEqual(trailParams('trail', 1), { lifeMs: 60, maxLive: TRAIL_MAX_LIVE, perSample: 1 })
  assert.deepEqual(trailParams('trail', 10), { lifeMs: 600, maxLive: TRAIL_MAX_LIVE, perSample: 1 })
  assert.equal(trailParams('sparkles', 1)?.perSample, 1)
  assert.equal(trailParams('sparkles', 4)?.perSample, 2)
  assert.equal(trailParams('sparkles', 10)?.perSample, 3)
  assert.equal(trailParams('off', 5), null)
})

test('a parked point spawns nothing and clears the trail', () => {
  const s = createTrail({ trail: 'trail', trailLength: 5 })
  spawnTrail(s, { x: 10, y: 10 }, 0)
  spawnTrail(s, { x: 20, y: 10 }, 8)
  assert.equal(s.parts.length, 2)
  spawnTrail(s, PARKED, 16)
  assert.equal(s.parts.length, 0, 'no line from where the pointer left to where it comes back')
  assert.equal(stepTrail(s, 16), false)
})

test('a particle fades from 1 to 0 over its life, and a sparkle falls', () => {
  const s = createTrail({ trail: 'trail', trailLength: 5 })
  spawnTrail(s, { x: 10, y: 20 }, 100)
  const v = { x: 0, y: 0, alpha: 0, size: 0 }
  assert.deepEqual(viewOf(s.parts[0], 100, v), { x: 10, y: 20, alpha: 1, size: TRAIL_WIDTH_PX })
  assert.equal(viewOf(s.parts[0], 250, v).alpha, 0.5)
  assert.equal(viewOf(s.parts[0], 50, v).alpha, 1, 'born after the frame began: drawn at birth')
  const sp = createTrail({ trail: 'sparkles', trailLength: 5 })
  spawnTrail(sp, { x: 0, y: 0 }, 0, seeded())
  const p = sp.parts[0]
  const early = viewOf(p, 0, { x: 0, y: 0, alpha: 0, size: 0 }).y
  const late = viewOf(p, p.life - 1, { x: 0, y: 0, alpha: 0, size: 0 }).y
  assert.equal(early, 0)
  assert.ok(Number.isFinite(late))
})

test('the bounds hold every drawn mark with room for its width and contour', () => {
  const s = createTrail({ trail: 'trail', trailLength: 5 })
  spawnTrail(s, { x: 100, y: 50 }, 0)
  spawnTrail(s, { x: 140, y: 80 }, 8)
  const b = trailBounds(s, 8)
  assert.ok(b)
  assert.ok(b.x <= 100 - TRAIL_WIDTH_PX / 2 - 1 && b.y <= 50 - TRAIL_WIDTH_PX / 2 - 1)
  assert.ok(b.x + b.w >= 140 + TRAIL_WIDTH_PX / 2 + 1 && b.y + b.h >= 80 + TRAIL_WIDTH_PX / 2 + 1)
  assert.ok(Number.isInteger(b.x) && Number.isInteger(b.w))
})

test('only a change of mode or length restarts the trail', () => {
  const s = createTrail({ trail: 'trail', trailLength: 5 })
  assert.equal(trailChanged(s, { trail: 'trail', trailLength: 5 }), false)
  assert.equal(trailChanged(s, { trail: 'sparkles', trailLength: 5 }), true)
  assert.equal(trailChanged(s, { trail: 'trail', trailLength: 6 }), true)
})

test('the overlay window feeds every sample to the trail and keeps the canvas hidden until it is on', () => {
  const ring = readFileSync(join(REPO, 'src/renderer/src/overlay/cursorRing.ts'), 'utf8')
  assert.match(ring, /trail\.point\(p\)/)
  const painter = readFileSync(join(REPO, 'src/renderer/src/overlay/cursorTrailCanvas.ts'), 'utf8')
  // Off is one early return; the loop ends on the idle answer.
  assert.match(painter, /point\(p\) \{\s*if \(!state\.params\) return/)
  assert.match(painter, /!stepTrail\(state, now\)\) \{\s*running = false\s*return/)
  const html = readFileSync(join(REPO, 'src/renderer/cursor.html'), 'utf8')
  const rule = html.slice(html.indexOf('#trail {'))
  assert.match(rule.slice(0, rule.indexOf('}')), /display: none;/)
})
