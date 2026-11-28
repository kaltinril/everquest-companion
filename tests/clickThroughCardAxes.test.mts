// THE CLICK-THROUGH ITEM CARD'S POPPER AXES (2026-11-27 audit, dup-ui-a-1).
//
// A click-through item card (lib/KnownItemTooltip.tsx, `clickThrough`) opens `bottom-start`. For a
// top/bottom placement Popper's `mainAxis` is the HORIZONTAL one (`getMainAxisFromPlacement` gives
// 'x'), so the card must clamp sideways and never move vertically: `{ mainAxis: true, altAxis: false,
// padding: 8 }`, the pair the gear compare card measured (JOS-344). The item card had the pair
// inverted, so a card near the window's right edge hung off screen and one near the bottom slid up
// over its own row. The two cards stay separate; since the same day the mode is one file,
// lib/clickThroughHover.ts, and this pins that file's pair and that neither card writes its own.
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

// The mode lives in one file, lib/clickThroughHover.ts (audit 2026-11-27), and both cards import it.
test('the shared click-through mode keeps the measured pair and never flips', () => {
  const mode = src('lib/clickThroughHover.ts')
  assert.deepEqual(preventOverflowOptions(mode), [MEASURED])
  assert.match(mode, /\{ name: 'flip', enabled: false \}/)
})

test('both click-through cards take the shared mode and write no modifiers of their own', () => {
  for (const rel of ['features/gear/GearCompareCard.tsx', 'lib/KnownItemTooltip.tsx']) {
    const text = src(rel)
    assert.deepEqual(preventOverflowOptions(text), [], rel)
    assert.match(text, /import \{ CLICK_THROUGH_POPPER, useCloseOnPointerDown \} from '[./]+(lib\/)?clickThroughHover'/, rel)
  }
})
