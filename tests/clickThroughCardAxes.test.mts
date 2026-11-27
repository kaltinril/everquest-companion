// THE CLICK-THROUGH ITEM CARD'S POPPER AXES (2026-11-27 audit, dup-ui-a-1).
//
// A click-through item card (lib/KnownItemTooltip.tsx, `clickThrough`) opens `bottom-start`. For a
// top/bottom placement Popper's `mainAxis` is the HORIZONTAL one (`getMainAxisFromPlacement` gives
// 'x'), so the card must clamp sideways and never move vertically: `{ mainAxis: true, altAxis: false,
// padding: 8 }`, the pair the gear compare card measured (JOS-344). The item card had the pair
// inverted, so a card near the window's right edge hung off screen and one near the bottom slid up
// over its own row. The two cards stay separate; this pins only that their axes agree.
//
// The card modules import through the renderer's `@shared` alias, which the test runner does not
// resolve, so the options are read from the source the way other renderer pins in this folder are.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string): string => readFileSync(join(import.meta.dirname, '../src/renderer/src', rel), 'utf8')

/** Every `preventOverflow` options object written in a file, whitespace squeezed. */
function preventOverflowOptions(text: string): string[] {
  const found = [...text.matchAll(/name:\s*'preventOverflow',\s*options:\s*(\{[^}]*\})/g)]
  return found.map((m) => m[1].replace(/\s+/g, ' '))
}

const MEASURED = '{ mainAxis: true, altAxis: false, padding: 8 }'

test('the gear compare card keeps the measured pair (the reference this pins against)', () => {
  assert.deepEqual(preventOverflowOptions(src('features/gear/GearCompareCard.tsx')), [MEASURED])
})

test('the click-through item card clamps sideways and never moves vertically, like the compare card', () => {
  const card = src('lib/KnownItemTooltip.tsx')
  assert.deepEqual(preventOverflowOptions(card), [MEASURED])
  // It still may not flip above its anchor.
  assert.match(card, /\{ name: 'flip', enabled: false \}/)
})
