// lib/formatDate.formatAge is the app's one "time ago" ladder (2026-11-27, dup-ui-b-1): the title
// bar, the update chip, Mobs, Gear, the Combat fight picker, the alert wizard tooltips, the drop
// report card and the overlay meter rows all read an age through it. The rungs are the same for
// every style (just now under 90 s, minutes under 90 min, hours under 36 h, then days); a style
// only changes the words. These tests pin each cut-off on both sides, for all three styles.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type AgeStyle, formatAge } from '../src/renderer/src/lib/formatDate'
import { timingLabel } from '../src/renderer/src/features/combat/fightPickerRows'
import { ago } from '../src/renderer/src/features/preferences/dropObsView'

const NOW = Date.UTC(2026, 10, 27, 20, 0, 0)
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN

/** The age `ms` before NOW in each style. */
const at = (ms: number, style: AgeStyle): string => formatAge(NOW - ms, NOW, style)

const CASES: { ms: number; short: string; terse: string; long: string }[] = [
  // just now: under 90 s.
  { ms: 0, short: 'just now', terse: 'now', long: 'just now' },
  { ms: 45 * SEC, short: 'just now', terse: 'now', long: 'just now' },
  { ms: 60 * SEC, short: 'just now', terse: 'now', long: 'just now' },
  { ms: 90 * SEC - 1, short: 'just now', terse: 'now', long: 'just now' },
  // minutes: 90 s (1.5 min rounds to 2) up to under 90 min.
  { ms: 90 * SEC, short: '2m ago', terse: '2m', long: '2 minutes ago' },
  { ms: 59 * MIN, short: '59m ago', terse: '59m', long: '59 minutes ago' },
  { ms: 60 * MIN, short: '60m ago', terse: '60m', long: '60 minutes ago' },
  { ms: 70 * MIN, short: '70m ago', terse: '70m', long: '70 minutes ago' },
  { ms: 90 * MIN - 1, short: '90m ago', terse: '90m', long: '90 minutes ago' },
  // hours: 90 min (1.5 h rounds to 2) up to under 36 h.
  { ms: 90 * MIN, short: '2h ago', terse: '2h', long: '2 hours ago' },
  { ms: 23 * HOUR, short: '23h ago', terse: '23h', long: '23 hours ago' },
  { ms: 30 * HOUR, short: '30h ago', terse: '30h', long: '30 hours ago' },
  { ms: 36 * HOUR - 1, short: '36h ago', terse: '36h', long: '36 hours ago' },
  // days: 36 h (1.5 d rounds to 2) and on.
  { ms: 36 * HOUR, short: '2d ago', terse: '2d', long: '2 days ago' },
  { ms: 72 * HOUR, short: '3d ago', terse: '3d', long: '3 days ago' },
  { ms: 1500 * 24 * HOUR, short: '1500d ago', terse: '1500d', long: '1,500 days ago' }
]

test('every cut-off reads the same rung in all three styles, on both sides of the line', () => {
  for (const c of CASES) {
    assert.equal(at(c.ms, 'short'), c.short, `short at ${c.ms} ms`)
    assert.equal(at(c.ms, 'terse'), c.terse, `terse at ${c.ms} ms`)
    assert.equal(at(c.ms, 'long'), c.long, `long at ${c.ms} ms`)
  }
})

test('short is the default style', () => {
  for (const c of CASES) assert.equal(formatAge(NOW - c.ms, NOW), c.short)
})

test('an unknown stamp is empty in every style, and a future one floors at just now', () => {
  for (const style of ['short', 'terse', 'long'] as const) {
    assert.equal(formatAge(undefined, NOW, style), '')
    assert.equal(formatAge(0, NOW, style), '')
  }
  assert.equal(formatAge(NOW + 5 * MIN, NOW), 'just now')
  assert.equal(formatAge(NOW + 5 * MIN, NOW, 'terse'), 'now')
  assert.equal(formatAge(NOW + 5 * MIN, NOW, 'long'), 'just now')
})

test('the fight picker reads a 70-minute-old fight as 70m ago, not 1h ago', () => {
  const label = timingLabel(NOW - 70 * MIN, 125, NOW)
  assert.ok(label.includes(' · 70m ago · '), label)
  assert.ok(!label.includes('1h ago'), label)
})

test('the drop report card reads the long style through the same ladder', () => {
  assert.equal(ago(NOW - 70 * MIN, NOW), '70 minutes ago')
  assert.equal(ago(NOW - 36 * HOUR, NOW), '2 days ago')
})
