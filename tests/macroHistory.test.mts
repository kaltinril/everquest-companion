// The Macros tab's Undo and Redo: steps, the cap, typing joined into one step, the shortcut (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COALESCE_MS, HISTORY_CAP, amend, canRedo, canUndo, historyKey, record, redo, startHistory, undo } from '../src/shared/macros/history'

const step = (at: number): { field: null; at: number } => ({ field: null, at })
const typed = (field: string, at: number): { field: string; at: number } => ({ field, at })

test('history: a change is a step; undo and redo walk it; a new change empties redo', () => {
  let h = startHistory('a')
  assert.equal(canUndo(h), false)
  assert.equal(undo(h), h)
  assert.equal(redo(h), h)
  h = record(h, 'b', step(1))
  h = record(h, 'c', step(2))
  assert.deepEqual([h.past, h.present, h.future], [['a', 'b'], 'c', []])
  h = undo(h)
  assert.deepEqual([h.past, h.present, h.future], [['a'], 'b', ['c']])
  h = undo(h)
  assert.deepEqual([h.present, canUndo(h), canRedo(h)], ['a', false, true])
  h = redo(h)
  assert.deepEqual([h.past, h.present, h.future], [['a'], 'b', ['c']])
  h = record(h, 'd', step(3))
  assert.deepEqual([h.past, h.present, h.future], [['a', 'b'], 'd', []])
})

test('history: the same document is no step, and an amend moves the present without one', () => {
  const h = record(startHistory('a'), 'b', step(1))
  assert.equal(record(h, 'b', step(2)), h)
  assert.equal(amend(h, 'b'), h)
  const amended = amend(h, 'B')
  assert.deepEqual([amended.past, amended.present], [['a'], 'B'])
  assert.equal(undo(amended).present, 'a')
})

test('history: typing in one field within a second is one step; another field or a pause is a new one', () => {
  let h = startHistory('')
  h = record(h, 'A', typed('name', 1000))
  h = record(h, 'As', typed('name', 1400))
  h = record(h, 'Ass', typed('name', 1400 + COALESCE_MS))
  assert.deepEqual([h.past, h.present], [[''], 'Ass'])
  h = record(h, 'Ass!', typed('name', 1400 + 2 * COALESCE_MS + 1))
  assert.deepEqual(h.past, ['', 'Ass'])
  h = record(h, 'Ass!/', typed('line1', 1400 + 2 * COALESCE_MS + 2))
  assert.deepEqual(h.past, ['', 'Ass', 'Ass!'])
  // A step that is not typing never joins, and typing after it starts fresh.
  h = record(h, 'x', step(5000))
  h = record(h, 'xy', typed('line1', 5001))
  assert.deepEqual(h.past, ['', 'Ass', 'Ass!', 'Ass!/', 'x'])
  // After an undo the next key is its own step.
  h = undo(h)
  h = record(h, 'xz', typed('line1', 5002))
  assert.deepEqual([h.past.at(-1), h.present], ['x', 'xz'])
})

test('history: at most HISTORY_CAP steps back are kept, the oldest go first', () => {
  let h = startHistory(0)
  for (let i = 1; i <= HISTORY_CAP + 5; i++) h = record(h, i, step(i))
  assert.equal(h.past.length, HISTORY_CAP)
  assert.equal(h.past[0], 5)
  for (let i = 0; i < HISTORY_CAP + 5; i++) h = undo(h)
  assert.equal(h.present, 5)
  assert.equal(h.future.length, HISTORY_CAP)
})

test('the shortcut: Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo', () => {
  const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
    historyKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods })
  assert.equal(press('z', { ctrlKey: true }), 'undo')
  assert.equal(press('Z', { ctrlKey: true, shiftKey: true }), 'redo')
  assert.equal(press('y', { ctrlKey: true }), 'redo')
  assert.equal(press('z', { metaKey: true }), 'undo')
  assert.equal(press('z'), null)
  assert.equal(press('z', { ctrlKey: true, altKey: true }), null)
  assert.equal(press('y', { ctrlKey: true, shiftKey: true }), null)
  assert.equal(press('a', { ctrlKey: true }), null)
})
