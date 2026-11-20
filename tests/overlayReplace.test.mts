// RE-PLACING AN OPEN OVERLAY (a monitor change, the Recover key, a text-size change).
//
// The con card's window height follows its card, and what the store holds for it is a first-open
// placeholder. A monitor change and the Recover key used to put that placeholder on the live
// window: a taller card was cut off at the bottom, a shorter one left an empty apron that took
// mouse clicks, and nothing re-fitted it until a card of another height came.
//
// The rule is pure (overlayLayout.ts) and tested as such. overlayBounds.ts and windows.ts cannot
// be loaded without Electron, so their single use of it is pinned as source, the bargain
// tests/topmost.test.mts strikes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { overlayDefaultSize, placedOverlayBounds, scaledStripBounds } from '../src/main/overlayLayout'

const src = (path: string): string => readFileSync(new URL(`../src/main/${path}`, import.meta.url), 'utf8')

/** The body of one top-level function, up to its closing brace at column zero. */
function bodyOf(code: string, name: string): string {
  const start = code.indexOf(`export function ${name}(`)
  assert.notEqual(start, -1, `${name} exists`)
  return code.slice(start, code.indexOf('\n}', start))
}

const area = { x: 0, y: 0, width: 1920, height: 1040 }

test('the stored height of a con card is a placeholder, whatever the card on screen measures', () => {
  const placeholder = overlayDefaultSize('conCard').height
  const stored = { x: 695, y: 12, width: 530, height: placeholder }
  assert.equal(scaledStripBounds('conCard', stored, 1, area).height, placeholder)
  assert.equal(scaledStripBounds('conCard', stored, 1.5, area).height, placeholder)
})

test('a re-placed con card keeps the height it is wearing', () => {
  const next = { x: 695, y: 12, width: 530, height: overlayDefaultSize('conCard').height }
  assert.deepEqual(placedOverlayBounds('conCard', next, 412), { x: 695, y: 12, width: 530, height: 412 })
  assert.deepEqual(placedOverlayBounds('conCard', next, 150), { x: 695, y: 12, width: 530, height: 150 })
})

test('every other kind is re-placed at the height that was worked out for it', () => {
  const next = { x: 100, y: 200, width: 640, height: 220 }
  for (const kind of ['toast', 'alertBanner', 'fight', 'events'] as const) {
    assert.deepEqual(placedOverlayBounds(kind, next, 412), next, kind)
  }
})

test('a monitor change and the Recover key re-place through the one rule', () => {
  const reconcile = bodyOf(src('windows.ts'), 'reconcileOverlayDisplays')
  assert.match(reconcile, /replaceOverlay\(kind\)/)
  assert.doesNotMatch(reconcile, /applyOverlayBounds\(/, 'never the stored rectangle straight onto the window')
})

test('re-placing keeps the worn height, then clamps the last measured card to the new screen', () => {
  const bounds = src('overlayBounds.ts')
  const replace = bodyOf(bounds, 'replaceOverlay')
  const apply = replace.indexOf('applyOverlayBounds(kind, placedOverlayBounds(kind, next, w.getBounds().height))')
  assert.notEqual(apply, -1, 'the live height goes through the rule')
  assert.ok(replace.indexOf('refitOverlay(kind)') > apply, 'and the fit runs after the move')
  assert.match(bodyOf(bounds, 'refitStripsForTextScale'), /replaceOverlay\(kind\)/, 'a text-size change uses the same rule')
})
