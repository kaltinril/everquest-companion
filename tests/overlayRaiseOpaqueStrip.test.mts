// "BRING OVERLAYS TO FRONT" AND THE RECOVER KEY LEAVE A RESTING OPAQUE STRIP HIDDEN.
//
// In opaque-overlay mode (Wine, or the Preferences switch) the toast, alert banner and con card
// windows are solid, so each is hidden while it has nothing to draw (windows.ts
// applyOpaqueStripVisibility). The raise used to show every hidden overlay, which put a solid dark
// rectangle over the game until the next card came and went.
//
// The rule is pure (overlayLayout.ts). Its call sites need a real window stack, so they are pinned
// as source, the bargain tests/topmost.test.mts strikes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STRIP_KINDS, opaqueStripRests } from '../src/main/overlayLayout'

const src = (path: string): string => readFileSync(new URL(`../src/main/${path}`, import.meta.url), 'utf8')

test('an opaque strip rests until its overlay says a card is up', () => {
  for (const kind of STRIP_KINDS) {
    assert.equal(opaqueStripRests(kind, true, undefined), true, `${kind}: no word yet reads as resting`)
    assert.equal(opaqueStripRests(kind, true, true), true, `${kind}: nothing to draw`)
    assert.equal(opaqueStripRests(kind, true, false), false, `${kind}: a card is up, or it is unlocked`)
  }
})

test('a see-through strip never rests: empty, it is already invisible', () => {
  for (const kind of STRIP_KINDS) {
    for (const idle of [undefined, true, false]) {
      assert.equal(opaqueStripRests(kind, false, idle), false, kind)
      assert.equal(opaqueStripRests(kind, undefined, idle), false, kind)
    }
  }
})

test('a panel never rests, opaque or not: it fills its window', () => {
  for (const kind of ['fight', 'events', 'xp', 'mapPins'] as const) {
    for (const idle of [undefined, true, false]) assert.equal(opaqueStripRests(kind, true, idle), false, kind)
  }
})

test('the raise asks the rule before it shows a hidden window', () => {
  const code = src('overlayReset.ts')
  const start = code.indexOf('export function raiseOverlays(')
  const body = code.slice(start, code.indexOf('\n}', start))
  const guard = body.indexOf('if (!w.isVisible() && opaqueStripResting(kind)) continue')
  assert.notEqual(guard, -1, 'a resting opaque strip is skipped: no show, no opacity, no raise')
  const shows = [...body.matchAll(/\.show(?:Inactive)?\(/g)].map((m) => m.index)
  assert.equal(shows.length, 1, 'one show in the raise')
  assert.ok(shows[0] > guard, 'and it comes after the guard')
})

test('windows.ts answers from the window that exists, with the one rule', () => {
  const code = src('windows.ts')
  assert.match(code, /export function opaqueStripResting\(kind: OverlayKind\): boolean \{\s*return opaqueStripRests\(kind, opaqueStripWindow\[kind\], opaqueStripIdle\[kind\]\)/)
  // The un-hide pass (setOverlaysHidden) holds the same door shut, through the same function.
  assert.doesNotMatch(code, /opaqueStripIdle\[kind\] !== false/, 'no second spelling of the rule')
})
