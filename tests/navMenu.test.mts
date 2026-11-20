// navMenu.test.mts - the left menu's own text size and row height (fork #10; src/shared/navMenu.ts).
// The ladder rules, then source pins for the wiring a unit test cannot draw. The rendered row
// heights are tests/e2e/text-size.e2e.mts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  NAV_ROW_DEFAULT,
  NAV_ROW_KEY,
  NAV_ROW_STEPS,
  NAV_TEXT_DEFAULT,
  NAV_TEXT_KEY,
  NAV_TEXT_STEPS,
  navMenuMetrics,
  navPx,
  readNavStep,
  stepNavStep
} from '../src/shared/navMenu'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

const LADDERS = [
  { name: 'text', steps: NAV_TEXT_STEPS, dflt: NAV_TEXT_DEFAULT },
  { name: 'row', steps: NAV_ROW_STEPS, dflt: NAV_ROW_DEFAULT }
] as const

test('each ladder ascends without a repeat and holds its own default', () => {
  for (const { name, steps, dflt } of LADDERS) {
    assert.deepEqual([...steps], [...steps].sort((a, b) => a - b), `${name} ascends`)
    assert.equal(new Set(steps).size, steps.length, `${name} has no duplicate stop`)
    assert.ok(steps.includes(dflt), `${name} default is one of its stops`)
  }
  // The look before the setting stays reachable: 16px text in 48px rows.
  assert.ok(NAV_TEXT_STEPS.includes(16))
  assert.ok(NAV_ROW_STEPS.includes(48))
  // The shipped row is not the shortest one: a player who wants it tighter still has a stop to go to.
  assert.ok(NAV_ROW_DEFAULT > Math.min(...NAV_ROW_STEPS))
})

// A renamed key reads every saved pick as absent; two equal keys make each stepper move the other.
test('the two picks live under their own keys, apart from the folds', () => {
  assert.equal(NAV_TEXT_KEY, 'eq.nav.textPx')
  assert.equal(NAV_ROW_KEY, 'eq.nav.rowPx')
  assert.notEqual(NAV_TEXT_KEY, NAV_ROW_KEY)
  for (const key of [NAV_TEXT_KEY, NAV_ROW_KEY]) {
    assert.ok(!key.startsWith('eq.nav.open.'), `${key} is not a fold key`)
  }
})

test('an absent or malformed stored value reads as the default', () => {
  for (const { name, steps, dflt } of LADDERS) {
    for (const raw of [null, '', '  ', 'abc', 'NaN', 'Infinity', '-Infinity']) {
      assert.equal(readNavStep(raw, steps, dflt), dflt, `${name} ${String(raw)}`)
    }
  }
})

test('a stored stop reads as itself, and reading it again changes nothing', () => {
  for (const { steps, dflt } of LADDERS) {
    for (const step of steps) {
      assert.equal(readNavStep(String(step), steps, dflt), step)
    }
  }
})

test('an off-ladder value snaps to the nearest stop, a tie to the smaller', () => {
  assert.equal(readNavStep('33', NAV_ROW_STEPS, NAV_ROW_DEFAULT), 32)
  assert.equal(readNavStep('35', NAV_ROW_STEPS, NAV_ROW_DEFAULT), 36)
  assert.equal(readNavStep('45', NAV_ROW_STEPS, NAV_ROW_DEFAULT), 48)
  assert.equal(readNavStep('13.4', NAV_TEXT_STEPS, NAV_TEXT_DEFAULT), 13)
  // The exact midpoints: 30 sits between 28 and 32, 44 between 40 and 48, 12.5 between 12 and 13.
  assert.equal(readNavStep('30', NAV_ROW_STEPS, NAV_ROW_DEFAULT), 28)
  assert.equal(readNavStep('44', NAV_ROW_STEPS, NAV_ROW_DEFAULT), 40)
  assert.equal(readNavStep('12.5', NAV_TEXT_STEPS, NAV_TEXT_DEFAULT), 12)
})

test('a value beyond either end lands on that end', () => {
  for (const { steps, dflt } of LADDERS) {
    const min = Math.min(...steps)
    const max = Math.max(...steps)
    for (const raw of ['0', '-5', '1']) assert.equal(readNavStep(raw, steps, dflt), min)
    for (const raw of ['100', '9999']) assert.equal(readNavStep(raw, steps, dflt), max)
  }
})

test('a press moves one stop each way, and the ends are fixed points', () => {
  for (const { name, steps } of LADDERS) {
    for (let i = 0; i < steps.length - 1; i++) {
      const here = steps[i] as number
      const next = steps[i + 1] as number
      assert.equal(stepNavStep(steps, here, 1), next, `${name} ${String(here)} up`)
      assert.equal(stepNavStep(steps, next, -1), here, `${name} ${String(next)} down`)
    }
    const min = Math.min(...steps)
    const max = Math.max(...steps)
    assert.equal(stepNavStep(steps, min, -1), min, `${name} stays at its bottom`)
    assert.equal(stepNavStep(steps, max, 1), max, `${name} stays at its top`)
  }
})

// The card's rule (value <= lowest stop, value >= highest stop) against what a press really does.
test('a button is greyed exactly where its press would change nothing', () => {
  for (const { name, steps, dflt } of LADDERS) {
    const min = Math.min(...steps)
    const max = Math.max(...steps)
    for (const stop of steps) {
      assert.equal(stop <= min, stepNavStep(steps, stop, -1) === stop, `${name} ${String(stop)} minus`)
      assert.equal(stop >= max, stepNavStep(steps, stop, 1) === stop, `${name} ${String(stop)} plus`)
    }
    assert.equal(steps.filter((stop) => stop <= min).length, 1, `${name} has one bottom`)
    assert.equal(steps.filter((stop) => stop >= max).length, 1, `${name} has one top`)
    assert.ok(dflt > min && dflt < max, `${name} ships with both buttons live`)
  }
})

test('an off-ladder value is snapped before it is stepped', () => {
  assert.equal(stepNavStep(NAV_ROW_STEPS, 33, 1), 36)
  assert.equal(stepNavStep(NAV_ROW_STEPS, 33, -1), 28)
  assert.equal(stepNavStep(NAV_ROW_STEPS, 999, -1), 40)
  // Whatever goes in, a stop comes out.
  for (const v of [-5, 0, 13.4, 31, 1000, NaN]) {
    for (const dir of [1, -1] as const) {
      assert.ok(NAV_ROW_STEPS.includes(stepNavStep(NAV_ROW_STEPS, v, dir)), `${String(v)} ${String(dir)}`)
    }
  }
})

test('a stop is said in px', () => {
  assert.equal(navPx(14), '14px')
  assert.equal(navPx(32), '32px')
})

test('nothing outgrows the shortest row: every text size fits every row height', () => {
  for (const textPx of NAV_TEXT_STEPS) {
    for (const rowPx of NAV_ROW_STEPS) {
      const m = navMenuMetrics(textPx, rowPx)
      assert.equal(m.textPx, textPx)
      assert.equal(m.rowPx, rowPx)
      assert.ok(Number.isInteger(m.iconPx), 'the icon is a whole pixel')
      assert.ok(m.rowPx >= m.iconPx, `a ${String(m.iconPx)}px icon in a ${String(rowPx)}px row`)
      // 1.3 is the label's line height in NavDrawer.tsx.
      assert.ok(m.rowPx >= m.textPx * 1.3, `${String(textPx)}px text in a ${String(rowPx)}px row`)
      assert.equal(m.iconCol, m.iconPx + 16)
    }
  }
  // The old look, for the player who steps back to it: a 24px icon beside 16px text.
  assert.equal(navMenuMetrics(16, 48).iconPx, 24)
})

// ---- source pins ------------------------------------------------------------------------------

test('the card is two of the page’s steppers, walking the shared ladders', () => {
  const card = src('../src/renderer/src/features/preferences/NavMenuSetting.tsx')
  assert.equal((card.match(/<PrefStepper/g) ?? []).length, 2, 'a text size and a row height')
  assert.match(card, /useNavStep\(NAV_TEXT_KEY, NAV_TEXT_STEPS, NAV_TEXT_DEFAULT\)/)
  assert.match(card, /useNavStep\(NAV_ROW_KEY, NAV_ROW_STEPS, NAV_ROW_DEFAULT\)/)
  assert.doesNotMatch(card, /\b(text|row) [-+] /, 'and never by an increment of its own')
  // Each stepper greys a button only at the end of its OWN ladder, never the other one's.
  assert.match(card, /atMin=\{text <= Math\.min\(\.\.\.NAV_TEXT_STEPS\)\}/)
  assert.match(card, /atMax=\{text >= Math\.max\(\.\.\.NAV_TEXT_STEPS\)\}/)
  assert.match(card, /atMin=\{row <= Math\.min\(\.\.\.NAV_ROW_STEPS\)\}/)
  assert.match(card, /atMax=\{row >= Math\.max\(\.\.\.NAV_ROW_STEPS\)\}/)
  assert.equal((card.match(/at(Min|Max)=/g) ?? []).length, 4, 'two ends per stepper, no more')
  assert.match(card, /testid="pref-nav-text"/)
  assert.match(card, /testid="pref-nav-row"/)
  const hook = src('../src/renderer/src/components/useNavMenu.ts')
  assert.match(hook, /setRaw\(String\(stepNavStep\(steps, value, dir\)\)\)/, 'the press writes the next stop')
  assert.match(hook, /readNavStep\(raw, steps, dflt\)/, 'and a stored value is read through the ladder')
  // Renderer localStorage, like the folds: no IPC and no store field.
  assert.doesNotMatch(hook + card, /window\.eq\./)
})

test('the drawer sizes its rows from variables on the paper, and the headings stay fixed', () => {
  const drawer = src('../src/renderer/src/components/NavDrawer.tsx')
  for (const name of ['--nav-row', '--nav-text', '--nav-icon', '--nav-icon-col']) {
    assert.ok(drawer.includes(`'${name}': navPx(`), `${name} is set on the drawer paper`)
  }
  // minHeight, never height: a row grows before it clips.
  assert.match(drawer, /const NAV_ROW_SX = \{ minHeight: 'var\(--nav-row\)', py: 0 \}/)
  assert.match(drawer, /const GROUP_HEADING_SX = \{ minHeight: 28, mt: 0\.5, py: 0, pr: 1 \}/)
})

test('the row height stepper’s accessible names are whole sentences', () => {
  const stepper = src('../src/renderer/src/features/preferences/PrefStepper.tsx')
  for (const name of ['Shorter rows for', 'Taller rows for']) {
    assert.ok(stepper.includes(`'${name}'`), `${name} is not the label`)
  }
})
