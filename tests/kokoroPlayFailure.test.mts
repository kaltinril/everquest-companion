// A KOKORO PLAYBACK THAT FAILS SAYS SO, through the alert sounds' own door (JOS-442).
//
// `sayThroughEngine` (renderer/src/lib/speech.ts) hands the engine's cached url to a fresh
// `Audio` and used to end in `play().catch(() => undefined)`, the same empty catch `playSound`
// once had: a voice alert that the audio stack refused to play left nothing in errors.log. It now
// reports the rejection through `reportAudioFailure`, and the tier's answer is unchanged — the
// engine did answer, so the system voice must not speak the line a second time.
//
// Driven on the real module with the same three globals tests/soundCacheRetry.test.mts uses.
//
// Run: `npm test`.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { speak } from '../src/renderer/src/lib/speech'
import { resetAudioHealth } from '../src/renderer/src/features/alerts/audioHealth'
import { DEFAULT_VOICE_PREFS } from '../src/shared/speechText'

interface ErrorReport {
  source: string
  message: string
  name?: string
}

let reports: ErrorReport[] = []
let systemSpoken = 0
let playError: Error | undefined

class StubAudio {
  playbackRate = 1
  volume = 1
  constructor(readonly src: string) {}
  play(): Promise<void> {
    return playError ? Promise.reject(playError) : Promise.resolve()
  }
}

beforeEach(() => {
  reports = []
  systemSpoken = 0
  playError = undefined
  resetAudioHealth()
  const win = {
    eq: {
      isE2E: false,
      speechSay: (): Promise<{ ok: true; url: string }> =>
        Promise.resolve({ ok: true, url: 'eq-speech://cached.wav' }),
      reportError: (r: ErrorReport): void => {
        reports.push(r)
      }
    },
    speechSynthesis: {
      getVoices: () => [],
      speak: (): void => {
        systemSpoken += 1
      }
    }
  }
  Object.assign(globalThis, { window: win, Audio: StubAudio })
})

/** Let the fire-and-forget `play()` settle before reading what it reported. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r))

test('a rejected Kokoro play writes one audio-failure line, and no second voice speaks', async () => {
  const err = new Error('autoplay refused')
  err.name = 'NotAllowedError'
  playError = err
  await speak('Charm break', { ...DEFAULT_VOICE_PREFS, engine: 'kokoro' })
  await settle()
  assert.equal(reports.length, 1)
  assert.equal(reports[0].source, 'renderer:alertAudio')
  assert.equal(reports[0].name, 'NotAllowedError')
  assert.match(reports[0].message, /speech:kokoro.*failed to play/)
  assert.equal(systemSpoken, 0, 'the engine answered, so the system tier stays quiet')
})

test('a Kokoro play that starts reports nothing', async () => {
  await speak('Charm break', { ...DEFAULT_VOICE_PREFS, engine: 'kokoro' })
  await settle()
  assert.deepEqual(reports, [])
})
