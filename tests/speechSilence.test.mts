// Shorter pauses (owner ask, 2026-11-13): the audio half (speech/silence.ts), the text half
// (speechText.ts tightenPauseText), and the pref and cache key that carry it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { speechCacheKey } from '../src/main/speech/cache'
import { EDGE_KEEP_MS, PAUSE_KEEP_MS, capSilence } from '../src/main/speech/silence'
import { normalizeVoicePrefs, tightenPauseText } from '../src/shared/speechText'

const RATE = 24000
const ms = (n: number): number => Math.round((RATE * n) / 1000)

/** A clip built from `[kind, milliseconds]` parts: 'tone' is loud, 'quiet' is digital silence. */
function clip(...parts: ['tone' | 'quiet', number][]): Float32Array {
  const out = new Float32Array(parts.reduce((n, [, len]) => n + ms(len), 0))
  let at = 0
  for (const [kind, len] of parts) {
    for (let i = 0; i < ms(len); i++) out[at + i] = kind === 'tone' ? (i % 2 === 0 ? 0.4 : -0.4) : 0
    at += ms(len)
  }
  return out
}

const loud = (s: Float32Array): number => s.reduce((n, v) => n + (Math.abs(v) > 0.1 ? 1 : 0), 0)

test('a long pause between words is capped, and every loud sample survives', () => {
  const input = clip(['tone', 200], ['quiet', 400], ['tone', 200])
  const out = capSilence(input, RATE)
  assert.equal(loud(out), loud(input))
  assert.equal(out.length, ms(200) + ms(PAUSE_KEEP_MS) + ms(200))
})

test('leading and trailing silence is trimmed to the edge allowance', () => {
  const input = clip(['quiet', 300], ['tone', 100], ['quiet', 500])
  const out = capSilence(input, RATE)
  assert.equal(loud(out), loud(input))
  assert.equal(out.length, ms(EDGE_KEEP_MS) + ms(100) + ms(EDGE_KEEP_MS))
  assert.ok(Math.abs(out[ms(EDGE_KEEP_MS)]) > 0.1, 'the tone starts right after the kept edge')
})

test('a short gap (a consonant closure) is left exactly as it was', () => {
  const input = clip(['tone', 100], ['quiet', 60], ['tone', 100])
  assert.equal(capSilence(input, RATE), input)
})

test('a clip that is silent throughout, or empty, comes back unchanged', () => {
  const silent = clip(['quiet', 500])
  assert.equal(capSilence(silent, RATE), silent)
  assert.equal(capSilence(new Float32Array(0), RATE).length, 0)
})

test('the text half drops pause punctuation and keeps decimals, names and the closing mark', () => {
  assert.equal(tightenPauseText('Charm broke, run'), 'Charm broke run')
  assert.equal(tightenPauseText('Root - break. Move; now: go!'), 'Root break Move now go!')
  assert.equal(tightenPauseText('wait... 1.5 seconds'), 'wait 1.5 seconds')
  assert.equal(tightenPauseText("Coercer T`vala's mez"), "Coercer T`vala's mez")
  assert.equal(tightenPauseText('Mote of Major Potential'), 'Mote of Major Potential')
  // Never returns nothing for something.
  assert.equal(tightenPauseText(', '), ', ')
})

test('the pref is stored only when on, and only a literal true turns it on', () => {
  assert.equal(normalizeVoicePrefs({ tightPauses: true }).tightPauses, true)
  assert.equal('tightPauses' in normalizeVoicePrefs({ tightPauses: false }), false)
  assert.equal('tightPauses' in normalizeVoicePrefs({ tightPauses: 'yes' }), false)
  assert.equal('tightPauses' in normalizeVoicePrefs({}), false)
})

test('the tight rendering has its own cache key, and plain keys did not move', () => {
  const plain = speechCacheKey('af_heart', 'Charm break')
  assert.equal(speechCacheKey('af_heart', 'Charm break', ''), plain)
  assert.notEqual(speechCacheKey('af_heart', 'Charm break', 'tight'), plain)
})
