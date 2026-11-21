// The game's twenty macro colours, and that each stays readable where the app draws it (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MACRO_COLORS, contrast, macroSwatch, swatchBack } from '../src/shared/macros/colors'
import { COLOR_MAX, COLOR_MIN } from '../src/shared/macros/limits'
import { validateMacro } from '../src/shared/macros/validate'

test('one colour for every number the game has, as measured', () => {
  assert.equal(MACRO_COLORS.length, COLOR_MAX - COLOR_MIN + 1)
  assert.deepEqual(MACRO_COLORS[0], [240, 240, 240])
  assert.deepEqual(MACRO_COLORS[10], [0, 0, 0])
  assert.deepEqual(MACRO_COLORS[19], [128, 0, 128])
  assert.equal(macroSwatch(13)?.color, 'rgb(240, 0, 0)')
})

test('every colour is readable on its swatch, the dark ones included', () => {
  for (const rgb of MACRO_COLORS) assert.ok(contrast(rgb, swatchBack(rgb)) >= 3, `colour ${rgb.join(',')}`)
})

test('a stored number outside the twenty has no swatch and keeps its warning', () => {
  for (const n of [-1, 20, 99, 2.5]) assert.equal(macroSwatch(n), null)
  assert.deepEqual(validateMacro({ name: 'x', color: 25, lines: [] }).map((w) => w.code), ['color-range'])
})
