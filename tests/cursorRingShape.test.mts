// ============================================================================
// cursorRingShape.test.mts — the cursor ring gets shapes (owner, 2026-11-26).
// ============================================================================
//
// "the cursor thing is very plain. Can we have more shape options? diamond (45 degree rotated
// square ish) square, oval". Three claims come with it, and this file owns all three:
//
//   1. THE DEFAULT DOES NOT MOVE. The circle is the ring every player already has: the same box,
//      the same stroke and the same transform string the ring window always built. An upgrade
//      moves nobody's ring.
//   2. THE SIZE SLIDER MEANS ONE FOOTPRINT. No shape is drawn wider or taller than `sizePx`; the
//      diamond's corners touch the box the circle fills.
//   3. ONLY A KNOWN SHAPE SURVIVES. The name arrives from the store file, a renderer or a share
//      import; anything else draws the circle and costs the player none of their other settings.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CURSOR_RING,
  DEFAULT_RING_SHAPE,
  RING_SHAPES,
  normalizeCursorRing,
  normalizeRingShape,
  ringStrokeColor
} from '../src/shared/presencePrefs'
import {
  OVAL_HEIGHT_RATIO,
  innerMarkStyle,
  ringBoxStyle,
  ringGeometry,
  ringTransform
} from '../src/shared/cursorRingShape'

const ring = (shape: string, sizePx = 44, thicknessPx = 4): ReturnType<typeof ringGeometry> =>
  ringGeometry({ sizePx, thicknessPx, shape })

test('the default shape is the circle, and the circle is the old ring number for number', () => {
  assert.equal(DEFAULT_RING_SHAPE, 'circle')
  assert.equal(DEFAULT_CURSOR_RING.shape, 'circle')
  const g = ringGeometry(DEFAULT_CURSOR_RING)
  assert.deepEqual(g, { widthPx: 44, heightPx: 44, strokePx: 4, borderRadius: '50%', rotateDeg: 0, inner: null })
  // The string cursorRing.ts built before shapes existed: translate3d by the point less the radius.
  for (const p of [{ x: 100, y: 200 }, { x: 10.4, y: 7.6 }, { x: -9999, y: -9999 }]) {
    const radius = 44 / 2
    assert.equal(
      ringTransform(g, p),
      `translate3d(${Math.round(p.x - radius)}px, ${Math.round(p.y - radius)}px, 0)`
    )
  }
  assert.deepEqual(ringBoxStyle(g, ringStrokeColor('#ffffff')), {
    width: '44px',
    height: '44px',
    borderWidth: '4px',
    borderRadius: '50%',
    borderColor: 'rgba(255, 255, 255, 0.9)'
  })
})

test('a config with no shape at all draws the circle (an older main, a test harness)', () => {
  assert.deepEqual(ringGeometry({ sizePx: 60, thicknessPx: 5 }), ring('circle', 60, 5))
})

test('every shape fits the size footprint, and the diamond fills it corner to corner', () => {
  for (const size of [20, 44, 45, 120, 200]) {
    for (const shape of RING_SHAPES) {
      const g = ring(shape, size)
      // The drawn extent: a turned box's corners reach side * sqrt(2).
      const turn = g.rotateDeg === 45 ? Math.SQRT2 : 1
      assert.ok(g.widthPx * turn <= size + 0.75, `${shape} ${size}: too wide`)
      assert.ok(g.heightPx * turn <= size + 0.75, `${shape} ${size}: too tall`)
    }
    const d = ring('diamond', size)
    assert.equal(d.rotateDeg, 45)
    assert.equal(d.borderRadius, '0')
    assert.equal(d.widthPx, d.heightPx)
    assert.ok(Math.abs(d.widthPx * Math.SQRT2 - size) <= 1, `diamond ${size}: corners touch the box`)
  }
})

test('oval, square and rounded square are the circle box with one thing changed', () => {
  const oval = ring('oval', 100)
  assert.equal(oval.widthPx, 100)
  assert.equal(oval.heightPx, Math.round(100 * OVAL_HEIGHT_RATIO))
  assert.equal(oval.borderRadius, '50%')
  assert.deepEqual(ring('square', 100), { ...ring('circle', 100), borderRadius: '0' })
  const rounded = ring('rounded', 100)
  assert.match(rounded.borderRadius, /^\d+px$/)
  assert.ok(parseInt(rounded.borderRadius, 10) > 0 && parseInt(rounded.borderRadius, 10) < 50)
  for (const shape of ['oval', 'square', 'rounded']) assert.equal(ring(shape).rotateDeg, 0)
})

test('the diamond turns inside the same transform, after the translate', () => {
  const d = ring('diamond', 44)
  const half = d.widthPx / 2
  assert.equal(
    ringTransform(d, { x: 300, y: 150 }),
    `translate3d(${Math.round(300 - half)}px, ${Math.round(150 - half)}px, 0) rotate(45deg)`
  )
  // Parked: the turn does not pull it back on screen.
  assert.match(ringTransform(d, { x: -9999, y: -9999 }), /^translate3d\(-\d+px, -\d+px, 0\) rotate\(45deg\)$/)
})

test('a thick stroke on a short shape stays an outline, and the stored thickness is untouched', () => {
  // 20px oval is 12px tall: a 10px stroke would fill it. The drawing caps it; the prefs do not.
  const prefs = normalizeCursorRing({ sizePx: 20, thicknessPx: 10, shape: 'oval' })
  assert.equal(prefs.thicknessPx, 10)
  assert.equal(ringGeometry(prefs).strokePx, 6)
  assert.equal(ringGeometry({ ...prefs, shape: 'circle', offsetXPx: 0, offsetYPx: 0 }).strokePx, 10)
  for (const shape of RING_SHAPES) {
    const g = ring(shape, 20, 12)
    assert.ok(g.strokePx >= 1 && g.strokePx * 2 <= Math.min(g.widthPx, g.heightPx), shape)
  }
})

test('dot and target carry a centred inner mark that stays inside the hole', () => {
  for (const size of [24, 44, 45, 77, 200]) {
    for (const thickness of [1, 4, 7]) {
      for (const shape of ['dot', 'target']) {
        const g = ring(shape, size, thickness)
        assert.ok(g.inner, `${shape} ${size}/${thickness} has an inner mark`)
        const room = size - 2 * g.strokePx
        assert.ok(Number.isInteger(g.inner.offsetPx), 'centred on a whole pixel')
        assert.equal(g.inner.offsetPx * 2 + g.inner.sizePx, room, 'centred')
        assert.ok(g.inner.offsetPx >= 2, 'a gap between the outer stroke and the mark')
      }
      const dot = ring('dot', size, thickness).inner
      assert.ok(dot?.filled && dot.strokePx === 0)
      const target = ring('target', size, thickness).inner
      assert.ok(target && !target.filled && target.strokePx >= 1 && target.strokePx * 4 <= target.sizePx)
    }
  }
  // Only those two have one.
  for (const shape of ['circle', 'oval', 'square', 'rounded', 'diamond']) assert.equal(ring(shape).inner, null)
})

test('an inner mark that cannot fit is left out, never drawn over the stroke', () => {
  // 20px with a 10px stroke has no hole at all.
  assert.equal(ring('dot', 20, 10).inner, null)
  assert.equal(ring('target', 20, 10).inner, null)
})

test("the inner mark's style paints a dot's fill or a ring's border, in the stroke colour", () => {
  const stroke = ringStrokeColor('#ff8800')
  const dot = ring('dot').inner
  const target = ring('target').inner
  assert.ok(dot && target)
  const d = innerMarkStyle(dot, stroke)
  assert.equal(d.backgroundColor, stroke)
  assert.equal(d.borderWidth, '0px')
  const t = innerMarkStyle(target, stroke)
  assert.equal(t.backgroundColor, 'transparent')
  assert.equal(t.borderColor, stroke)
  assert.equal(t.left, `${target.offsetPx}px`)
})

test('ONLY A KNOWN SHAPE SURVIVES the normalizer', () => {
  for (const shape of RING_SHAPES) assert.equal(normalizeRingShape(shape), shape)
  for (const junk of ['hexagon', 'Circle', 'DIAMOND', ' oval', 'image', '', '__proto__', 'constructor', 7, null, undefined, {}, ['square']]) {
    assert.equal(normalizeRingShape(junk), 'circle', `${String(junk)} draws the circle`)
  }
  // A bad shape never costs the player the rest of their settings.
  const v = normalizeCursorRing({ enabled: true, sizePx: 90, thicknessPx: 6, colorHex: '#00ff00', shape: 'star' })
  assert.deepEqual(v, { enabled: true, sizePx: 90, thicknessPx: 6, colorHex: '#00ff00', shape: 'circle', offsetXPx: 0, offsetYPx: 0 })
  assert.equal(normalizeCursorRing({ shape: 'diamond' }).shape, 'diamond')
})
