// An alert's cooldown is whole milliseconds everywhere it is read.
//
// The editor's "Cooldown (ms)" box took 0.5 or 1500.5 as typed and the save kept it. The engine
// reads a cooldown as a whole number and took a fraction for "none given", so a log-triggered
// alert got the 2 s default while the editor still showed the typed number. The box and the save
// now round the way the engine does (fold/src/modules/alerts_rules.rs cooldown_ms_of).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cooldownFromInput, cooldownOver, normalizeCooldownMs, sanitizeCooldownMs } from '../src/shared/alertCooldown.ts'
import type { AlertDef } from '../src/shared/types.ts'

const def = (over: Partial<AlertDef> = {}): AlertDef => ({
  id: 'a',
  name: 'Tell',
  enabled: true,
  trigger: { type: 'raw', regex: 'x' },
  sound: { packId: 'p', soundId: 's' },
  ...over
})

test('a cooldown is rounded to whole milliseconds and never below zero', () => {
  assert.equal(normalizeCooldownMs(2000), 2000)
  assert.equal(normalizeCooldownMs(0), 0)
  assert.equal(normalizeCooldownMs(1500.5), 1501)
  assert.equal(normalizeCooldownMs(1500.4), 1500)
  assert.equal(normalizeCooldownMs(0.5), 1)
  assert.equal(normalizeCooldownMs(0.4), 0)
  assert.equal(normalizeCooldownMs(-5), 0)
})

test('what is not a number is no cooldown at all, so the default applies', () => {
  for (const raw of [undefined, null, '2000', Number.NaN, Number.POSITIVE_INFINITY, {}]) {
    assert.equal(normalizeCooldownMs(raw), undefined)
  }
})

test('the editor box shows the number that will be stored', () => {
  assert.equal(cooldownFromInput('3000'), 3000)
  assert.equal(cooldownFromInput('1500.5'), 1501)
  assert.equal(cooldownFromInput('0.5'), 1)
  assert.equal(cooldownFromInput('-3'), 0)
  assert.equal(cooldownFromInput(''), 0)
  assert.equal(cooldownFromInput('abc'), 0)
})

test('a saved alert keeps a whole cooldown as it is and gets a fraction rounded', () => {
  const whole = def({ cooldownMs: 3000 })
  assert.equal(sanitizeCooldownMs(whole), whole)
  const none = def()
  assert.equal(sanitizeCooldownMs(none), none)
  const typed = def({ cooldownMs: 1500.5, volume: 0.5 })
  assert.deepEqual(sanitizeCooldownMs(typed), { ...typed, cooldownMs: 1501 })
  assert.equal(typed.cooldownMs, 1500.5, 'the def handed in is not changed')
})

test('a saved cooldown that is not a number is dropped, and the rest of the alert still saves', () => {
  const bad = def({ cooldownMs: '500' as unknown as number, volume: 0.5 })
  const clean = sanitizeCooldownMs(bad)
  assert.equal('cooldownMs' in clean, false)
  assert.equal(clean.volume, 0.5)
})

test('the app-signal gate: quiet inside the cooldown, open at its end, never shut at zero', () => {
  assert.equal(cooldownOver(def(), undefined, 5000), true)
  assert.equal(cooldownOver(def(), 5000, 6999), false)
  assert.equal(cooldownOver(def(), 5000, 7000), true)
  assert.equal(cooldownOver(def({ cooldownMs: 500 }), 5000, 5499), false)
  assert.equal(cooldownOver(def({ cooldownMs: 500 }), 5000, 5500), true)
  assert.equal(cooldownOver(def({ cooldownMs: 0 }), 5000, 5000), true)
})
