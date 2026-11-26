// The cursor ring's X/Y offset from the pointer (owner, 2026-11-26: "can we also control the
// offset, X/Y"). Pins: 0/0 by default (nobody's ring moves on upgrade), clamped to the bounds,
// junk falls back to 0, and the transform moves the shape by exactly the offset.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CURSOR_RING,
  MAX_RING_OFFSET_PX,
  MIN_RING_OFFSET_PX,
  normalizeCursorRing
} from '../src/shared/presencePrefs'
import { ringGeometry, ringOffset, ringTransform } from '../src/shared/cursorRingShape'

test('the offset defaults to 0/0, so an upgraded ring stays centred on the pointer', () => {
  assert.equal(DEFAULT_CURSOR_RING.offsetXPx, 0)
  assert.equal(DEFAULT_CURSOR_RING.offsetYPx, 0)
  const old = normalizeCursorRing({ enabled: true, sizePx: 44, thicknessPx: 4, colorHex: '#ffffff' })
  assert.equal(old.offsetXPx, 0)
  assert.equal(old.offsetYPx, 0)
})

test('the offset is clamped and rounded, and anything not a number reads as 0', () => {
  const v = normalizeCursorRing({ offsetXPx: 500, offsetYPx: -500 })
  assert.equal(v.offsetXPx, MAX_RING_OFFSET_PX)
  assert.equal(v.offsetYPx, MIN_RING_OFFSET_PX)
  assert.deepEqual(
    [normalizeCursorRing({ offsetXPx: 12.6, offsetYPx: -7.4 }).offsetXPx, normalizeCursorRing({ offsetYPx: -7.4 }).offsetYPx],
    [13, -7]
  )
  for (const junk of ['20', null, NaN, Infinity, {}, true]) {
    const j = normalizeCursorRing({ offsetXPx: junk, offsetYPx: junk })
    assert.equal(j.offsetXPx, 0)
    assert.equal(j.offsetYPx, 0)
  }
})

test('the transform moves the shape by exactly the offset, and 0/0 is the old string', () => {
  const g = ringGeometry(DEFAULT_CURSOR_RING)
  const p = { x: 100, y: 200 }
  assert.equal(ringTransform(g, p), 'translate3d(78px, 178px, 0)')
  assert.equal(ringTransform(g, p, { x: 0, y: 0 }), 'translate3d(78px, 178px, 0)')
  assert.equal(ringTransform(g, p, { x: 20, y: -15 }), 'translate3d(98px, 163px, 0)')
  const d = ringGeometry({ sizePx: 44, thicknessPx: 4, shape: 'diamond' })
  assert.match(ringTransform(d, p, { x: -10, y: 10 }), /^translate3d\(\d+px, \d+px, 0\) rotate\(45deg\)$/)
})

test('a parked ring stays off screen at the largest offset', () => {
  const g = ringGeometry({ sizePx: 200, thicknessPx: 4 })
  const t = ringTransform(g, { x: -9999, y: -9999 }, { x: MAX_RING_OFFSET_PX, y: MAX_RING_OFFSET_PX })
  const [x, y] = (t.match(/-?\d+(?=px)/g) ?? []).map(Number)
  assert.ok(x + g.widthPx < 0 && y + g.heightPx < 0, t)
})

test('ringOffset reads a config without offsets (an older main) as centred', () => {
  assert.deepEqual(ringOffset({}), { x: 0, y: 0 })
  assert.deepEqual(ringOffset({ offsetXPx: 'x', offsetYPx: 4.6 }), { x: 0, y: 5 })
})
