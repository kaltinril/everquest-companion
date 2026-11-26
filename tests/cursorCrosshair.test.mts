// The cursor overlay's crosshair (owner, 2026-11-26: "1 vertical line across the entire screen at
// the mouse posiiton, and 1 horizontal at the mouse position (they can control line color and
// weight)"). Pins: off by default (an upgrade adds nothing), the colour goes through the strict
// normalizer, the weight is clamped 1 to 8, the lines sit centred on the RAW pointer whatever the
// shape's offset, and a parked point sends both off screen. Also the shape's own switch, which the
// crosshair needed ("on with or without the shape").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CURSOR_RING,
  DEFAULT_CROSSHAIR_WEIGHT_PX,
  MAX_CROSSHAIR_WEIGHT_PX,
  MIN_CROSSHAIR_WEIGHT_PX,
  normalizeCursorRing
} from '../src/shared/presencePrefs'
import {
  CROSSHAIR_OFF_SCREEN_PX,
  crosshairLineOffset,
  crosshairLineStyles,
  crosshairOf,
  crosshairTransforms,
  crosshairWeight,
  isParkedPoint
} from '../src/shared/cursorCrosshair'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

test('the crosshair is off by default and the shape is on, so nobody’s overlay changes on upgrade', () => {
  assert.equal(DEFAULT_CURSOR_RING.crosshairEnabled, false)
  assert.equal(DEFAULT_CURSOR_RING.showShape, true)
  assert.equal(DEFAULT_CURSOR_RING.crosshairColorHex, '#ffffff')
  assert.equal(DEFAULT_CURSOR_RING.crosshairWeightPx, DEFAULT_CROSSHAIR_WEIGHT_PX)
  assert.equal(DEFAULT_CROSSHAIR_WEIGHT_PX, 2)
  const old = normalizeCursorRing({ enabled: true, sizePx: 44, thicknessPx: 4, colorHex: '#00ff00' })
  assert.equal(old.crosshairEnabled, false)
  assert.equal(old.showShape, true)
  assert.equal(old.crosshairColorHex, '#ffffff', 'the shape’s colour is not borrowed silently')
})

test('the crosshair fields are defaulted and clamped field by field', () => {
  const v = normalizeCursorRing({
    crosshairEnabled: true,
    crosshairColorHex: '#F80',
    crosshairWeightPx: 99,
    showShape: false
  })
  assert.equal(v.crosshairEnabled, true)
  assert.equal(v.crosshairColorHex, '#ff8800')
  assert.equal(v.crosshairWeightPx, MAX_CROSSHAIR_WEIGHT_PX)
  assert.equal(v.showShape, false)
  assert.equal(normalizeCursorRing({ crosshairWeightPx: 0 }).crosshairWeightPx, MIN_CROSSHAIR_WEIGHT_PX)
  assert.equal(normalizeCursorRing({ crosshairWeightPx: 3.4 }).crosshairWeightPx, 3)
  for (const junk of ['4', null, NaN, {}, true]) {
    assert.equal(normalizeCursorRing({ crosshairWeightPx: junk }).crosshairWeightPx, 2)
  }
  // The colour only ever reaches a style through the strict normalizer.
  for (const junk of ['red', 'rgb(1,2,3)', 'var(--x)', '#ff000;background:url(x)', 7, null]) {
    assert.equal(normalizeCursorRing({ crosshairColorHex: junk }).crosshairColorHex, '#ffffff')
  }
  for (const junk of ['true', 1, null]) {
    assert.equal(normalizeCursorRing({ crosshairEnabled: junk }).crosshairEnabled, false)
    assert.equal(normalizeCursorRing({ showShape: junk }).showShape, true)
  }
})

test('a config without crosshair fields (an older main) draws no crosshair', () => {
  const c = crosshairOf({})
  assert.equal(c.on, false)
  assert.equal(c.weightPx, DEFAULT_CROSSHAIR_WEIGHT_PX)
  assert.equal(c.color, 'rgba(255, 255, 255, 0.9)')
  assert.equal(crosshairOf({ crosshairEnabled: true, crosshairColorHex: '#00e5ff' }).color, 'rgba(0, 229, 255, 0.9)')
  assert.equal(crosshairWeight(12), MAX_CROSSHAIR_WEIGHT_PX)
  assert.equal(crosshairWeight(-3), MIN_CROSSHAIR_WEIGHT_PX)
})

test('the lines are centred on the pointer across their weight, whole px', () => {
  assert.deepEqual(crosshairTransforms({ x: 100, y: 200 }, 2), {
    vertical: 'translate3d(99px, 0, 0)',
    horizontal: 'translate3d(0, 199px, 0)'
  })
  assert.deepEqual(crosshairTransforms({ x: 100, y: 200 }, 3), {
    vertical: 'translate3d(99px, 0, 0)',
    horizontal: 'translate3d(0, 199px, 0)'
  })
  assert.deepEqual(crosshairTransforms({ x: 100.6, y: 10 }, 1), {
    vertical: 'translate3d(100px, 0, 0)',
    horizontal: 'translate3d(0, 10px, 0)'
  })
  assert.equal(crosshairLineOffset(60, 4), 58)
})

test('a parked point sends both lines off screen', () => {
  assert.equal(isParkedPoint({ x: -9999, y: -9999 }), true)
  assert.equal(isParkedPoint({ x: 0, y: 0 }), false)
  const t = crosshairTransforms({ x: -9999, y: -9999 }, 8)
  assert.equal(t.vertical, `translate3d(${CROSSHAIR_OFF_SCREEN_PX}px, 0, 0)`)
  assert.equal(t.horizontal, `translate3d(0, ${CROSSHAIR_OFF_SCREEN_PX}px, 0)`)
})

test('the line styles carry only the weight and the normalized colour', () => {
  const s = crosshairLineStyles(crosshairOf({ crosshairEnabled: true, crosshairWeightPx: 5, crosshairColorHex: '#000000' }))
  assert.deepEqual(s, {
    vertical: { width: '5px', backgroundColor: 'rgba(0, 0, 0, 0.9)' },
    horizontal: { height: '5px', backgroundColor: 'rgba(0, 0, 0, 0.9)' }
  })
})

test('the overlay window follows the raw point for the crosshair and skips what is switched off', () => {
  const ring = readFileSync(join(REPO, 'src/renderer/src/overlay/cursorRing.ts'), 'utf8')
  // The crosshair is fed `latest`, never the shape's offset.
  assert.match(ring, /crosshairTransforms\(latest, crossWeight\)/)
  assert.doesNotMatch(ring, /crosshairTransforms\([^)]*offset/)
  assert.match(ring, /if \(crossOn\)/)
  assert.match(ring, /if \(shapeOn\) ring\.style\.transform/)
  const html = readFileSync(join(REPO, 'src/renderer/cursor.html'), 'utf8')
  assert.match(html, /<div id="cross-v" class="cross"><\/div>/)
  assert.match(html, /<div id="cross-h" class="cross"><\/div>/)
})
