// Where the keyboard goes when a Preferences stepper's button reaches its end (screen pass,
// 2026-11-19): the press that reached the end used to drop focus to the page body. The rule is
// features/preferences/prefStepperFocus.ts; the running app is checked in tests/e2e/text-size.e2e.mts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusAfterStep } from '../src/renderer/src/features/preferences/prefStepperFocus'

test('a press that reaches its own end hands the keyboard to the other button', () => {
  assert.equal(focusAfterStep(1, false, true), 'minus')
  assert.equal(focusAfterStep(-1, true, false), 'plus')
})

test('a press that leaves the value mid-range, or a mouse click, moves no focus', () => {
  assert.equal(focusAfterStep(1, false, false), null)
  assert.equal(focusAfterStep(-1, false, false), null)
  // No keyboard press noted (a click with the mouse, or a value changed from elsewhere).
  assert.equal(focusAfterStep(null, false, true), null)
  assert.equal(focusAfterStep(null, true, false), null)
  // The OTHER end being shut is not this press's doing.
  assert.equal(focusAfterStep(1, true, false), null)
  assert.equal(focusAfterStep(-1, false, true), null)
})

test('a stepper with one stop has no other button to take the keyboard', () => {
  assert.equal(focusAfterStep(1, true, true), null)
  assert.equal(focusAfterStep(-1, true, true), null)
})
