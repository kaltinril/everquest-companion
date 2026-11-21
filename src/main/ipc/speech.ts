// IPC: voice alerts / text-to-speech (docs/plans/voice-alerts.md §3).
//
// WAVE 3 FILLED THESE IN. The three engine channels were honest stubs through W1/W2 — the
// shapes below are byte-for-byte the ones they returned, so nothing the renderer was written
// against changed; only the bodies did:
//
//   speech:say      → {ok:true, url:'eqspeech://<sha256>'} once the wav exists,
//                     else {ok:false, reason} — and W2's renderer still degrades any
//                     {ok:false} to the system voice. THAT SEAM IS THE POINT: an alert is
//                     never silent because a model is missing, mid-download or broken.
//   speech:voices   → the voices the DOWNLOADED pack actually contains (see below).
//   speech:install  → runs the pinned provisioner, streaming progress on
//                     `speech:installProgress` while the one invoke is outstanding.
//
// THE VOICES-STATE DECISION (W2 flagged that "not installed" was being INFERRED from an empty
// list, and asked for a real state). Answer: the empty list IS the real state, and it is kept
// — `speech:voices` still returns `SpeechVoice[]`, and W2's `useVoices.ts` is untouched.
//
// The reasoning is that for this tier the two facts are the same fact, not an inference from
// one to the other. A Kokoro voice is not a capability the engine advertises; it is a style
// vector inside `voices-v1.0.bin`. No file ⇒ there are literally zero voices, and that is a
// complete and accurate inventory, not a proxy for one. (Contrast the SYSTEM tier, where an
// empty `getVoices()` genuinely IS ambiguous — "still loading" vs "none" — which is exactly
// why `lib/speech.ts` does the `voiceschanged` dance there and does not here.)
//
// The finer states a UI might still want — mid-download, download failed, model present but
// the worker won't start — are reported where they happen and can be distinguished:
// `speech:installProgress` carries phase + message for the first two, and `speech:say`'s
// `reason` for the third. A discriminated `{installed:false}` return would have had to change
// the shared type, the preload, `useVoices.ts` AND the preferences panel that renders from
// it — three of which are owned elsewhere this wave — to express something the existing
// channels already say. Documented here rather than done.
//
// PROVISIONING IS USER-INITIATED, ONCE AT A TIME, AND NEVER IN E2E. `speech:install` is the
// only path that downloads (~120 MB, plan decision D4). A second call while one is running
// joins the first rather than opening a second connection — the scraper-etiquette LAW's "one
// connection" applied to the door, not just to the fetcher behind it. In the e2e channel it
// refuses outright: that harness runs beside the user's game with a throwaway userData and
// would re-download the whole model every run.
//
// VALIDATED AT THE HANDLER (AGENTS.md trust boundary), unchanged from wave 1: every argument
// is a renderer value and is checked here, not trusted because today's only caller is the
// app's own UI. `speech:say`'s text becomes part of a cache key and hence a file name.

import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { E2E } from '../e2e'
import { IPC } from '../../shared/ipc'
import { MAX_SPEECH_CHARS, SPEECH_ENGINES, normalizeVoicePrefs } from '../../shared/speechText'
import { logError, logInfo } from '../errorLog'
import { createSpeechEngine } from '../speech/engine'
import { KOKORO_TOTAL_BYTES } from '../speech/pinned'
import { listKokoroVoices, provisionKokoro } from '../speech/provision'
import {
  ensureVcRuntimePlacement,
  findOnnxBindingDir,
  onnxBindingRoots,
  provisionVcRuntime
} from '../speech/vcRuntime'
import { getVoicePrefs, setVoicePrefs } from '../store'
import { sendToMain } from '../windows'
import type { SpeechInstallProgress } from '../../shared/alertTypes'
import type { SpeechEngine } from '../speech/engine'
import type {
  SpeechInstallResult,
  SpeechSayResult,
  SpeechVoice,
  VoicePrefs
} from '../../shared/types'

/** Longest voice id this app will accept from the renderer. SAPI voice URIs are the long ones
 *  (`urn:moz-tts:sapi:Microsoft David - English (United States)?en-US`) and sit far inside this. */
const MAX_VOICE_ID_CHARS = 256

/** The `speech:say` payload, once it has been proven to be one. */
interface ValidSayRequest {
  text: string
  voiceId?: string
  /** Shorter pauses. Only a literal `true` turns it on. */
  tight: boolean
}

/** Narrow an arbitrary renderer value to a say request, or null when it is not one. */
function validateSayRequest(raw: unknown): ValidSayRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { text, voiceId, tightPauses } = raw as { text?: unknown; voiceId?: unknown; tightPauses?: unknown }
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_SPEECH_CHARS) return null
  const tight = tightPauses === true
  if (voiceId === undefined) return { text: trimmed, tight }
  if (typeof voiceId !== 'string' || voiceId.length > MAX_VOICE_ID_CHARS) return null
  return { text: trimmed, voiceId, tight }
}

/**
 * The engine, built on first use and kept for the app's lifetime. Constructing it costs
 * nothing (no worker, no model — see speech/engine.ts); it is lazy only so that `app` is
 * ready by the time `getPath('userData')` is asked for.
 */
let engine: SpeechEngine | null = null

/**
 * Where `onnxruntime_binding.node` is on THIS install — dev checkout, packaged asar, or
 * unpacked-beside-the-asar. Resolved once: the three inputs cannot change while the app runs,
 * and every caller of it (placement, provisioning) wants the same answer.
 */
let bindingDir: string | null | undefined

function onnxBindingDir(): string | null {
  // `undefined` means "not asked yet"; `null` is a real answer and must STICK, which `??=`
  // would not do — it would re-probe the filesystem on every call for the one install that
  // cannot find its binding.
  if (bindingDir === undefined) {
    bindingDir = findOnnxBindingDir(onnxBindingRoots({ appPath: app.getAppPath(), cwd: process.cwd() }))
  }
  return bindingDir
}

function speechEngine(): SpeechEngine {
  const existing = engine
  if (existing) return existing
  // ONCE, BEFORE THE FIRST WORKER CAN SPAWN: re-derive the app-local Visual C++ runtime from
  // the cache if an app update wiped the placement out of the install directory (JOS-274). No
  // network, and a no-op on every machine that never needed it. Fire-and-forget on purpose —
  // this is a repair for a fault that has not happened yet, and making the first `speech:say`
  // wait on a filesystem copy to serve a CACHED wav would be the wrong trade. It sits here
  // rather than in the engine so that file stays Electron-free.
  void ensureVcRuntimePlacement(app.getPath('userData'), onnxBindingDir()).catch((err: unknown) => {
    logError('main:speech', { message: 'vc runtime placement failed', err })
  })
  engine = createSpeechEngine({
    userData: app.getPath('userData'),
    // The worker is a SECOND main-process bundle (electron.vite.config.ts emits
    // out/main/speechWorker.js beside out/main/index.js), so it sits next to this code in
    // both dev and a packaged build.
    workerPath: join(__dirname, 'speechWorker.js'),
    onError: (message, err) => logError('main:speech', { message, err }),
    onInfo: (message) => logInfo(message)
  })
  return engine
}

/** The single in-flight install, if any — a second caller joins it (see the header). */
let installing: Promise<SpeechInstallResult> | null = null

/**
 * THE RUNTIME RIDES THE DOWNLOAD (JOS-274, owner ruling 2026-08-13: a voice that downloads is a
 * voice that plays).
 *
 * It runs FIRST and it is SILENT — 3 MB against the model's 115, so putting it ahead of the long
 * download costs the progress bar nothing and means a user who abandons the model download still
 * ends up with a machine that could have run it. Every outcome is non-fatal: `provisionVcRuntime`
 * never throws, and a failure here is logged and left behind, because the JOS-247 sentence in the
 * Voice panel is still the honest thing to show a machine we could not repair.
 *
 * Placing files is also the ONLY thing that unlatches the engine's fault. That is the
 * without-a-restart half of the ruling: a user whose first alert failed with ERR_DLOPEN_FAILED
 * this session gets a live engine on their next alert rather than after a relaunch. `placed === 0`
 * deliberately does NOT unlatch — nothing about the machine changed, and a speculative respawn of
 * a known-dead worker is exactly the retry storm the latch exists to prevent.
 */
async function installVcRuntime(): Promise<void> {
  const result = await provisionVcRuntime({
    userData: app.getPath('userData'),
    bindingDir: onnxBindingDir()
  })
  if (result.message !== undefined) {
    logError('main:speech', { message: `vc runtime provisioning: ${result.message}` })
    return
  }
  if (result.placed > 0) {
    logInfo(
      `[everquest-companion] Speech: installed the Microsoft Visual C++ runtime beside the ` +
        `engine (${result.placed} files)`
    )
    speechEngine().retryAfterRepair()
  }
}

function startInstall(): Promise<SpeechInstallResult> {
  const run = installVcRuntime()
    .catch((err: unknown) => {
      // Belt: provisionVcRuntime is written not to reject, and the model download must not be
      // cancelled by the runtime step under any circumstances.
      logError('main:speech', { message: 'vc runtime provisioning threw', err })
    })
    .then(() =>
      provisionKokoro({
        userData: app.getPath('userData'),
        onProgress: (progress: SpeechInstallProgress) =>
          sendToMain(IPC.onSpeechInstallProgress, progress)
      })
    )
    .catch((err: unknown): SpeechInstallResult => {
      // provisionKokoro is written not to reject; this is the belt, so one unexpected throw
      // cannot leave the panel's spinner running forever.
      logError('main:speech', { message: 'kokoro provisioning threw', err })
      return { ok: false, reason: 'engine-not-installed', message: String(err) }
    })
    .finally(() => {
      installing = null
    })
  installing = run
  return run
}

export function registerSpeechIpc(): void {
  ipcMain.handle(IPC.speechSay, async (_e, raw: unknown): Promise<SpeechSayResult> => {
    const request = validateSayRequest(raw)
    if (!request) return { ok: false, reason: 'invalid-request' }
    // The voice a request gets when it names none: the user's global default. Resolving it
    // here (rather than in the engine) keeps the store as main's single source for prefs and
    // leaves the engine electron-free.
    const voiceId = request.voiceId ?? getVoicePrefs().voiceId
    return speechEngine().say(request.text, voiceId, request.tight)
  })

  ipcMain.handle(IPC.speechVoices, (): Promise<SpeechVoice[]> => {
    // Read from the installed pack itself — see the voices-state note in the header. Not
    // installed ⇒ [], which is the accurate inventory rather than a stand-in for one.
    return listKokoroVoices(app.getPath('userData'))
  })

  ipcMain.handle(IPC.speechInstall, async (_e, engineId: unknown): Promise<SpeechInstallResult> => {
    if (typeof engineId !== 'string' || !(SPEECH_ENGINES as readonly string[]).includes(engineId)) {
      return { ok: false, reason: 'invalid-request' }
    }
    // The system tier is the renderer's own `speechSynthesis`; there is nothing to provision,
    // and it is always there. Answering ok keeps the caller from special-casing it.
    if (engineId === 'system') return { ok: true }
    if (E2E) return { ok: false, reason: 'not-implemented', message: 'downloads are disabled in e2e' }
    return installing ?? startInstall()
  })

  ipcMain.handle(IPC.speechInstallSize, (_e, engineId: unknown): number => {
    // The price of the download, read from the same pinned table the downloader uses — so the
    // "~115 MB" the button promises is the sum of the two assets it will actually fetch. The
    // system tier downloads nothing, and so does an engine id we do not recognize.
    if (typeof engineId !== 'string' || !(SPEECH_ENGINES as readonly string[]).includes(engineId)) return 0
    return engineId === 'kokoro' ? KOKORO_TOTAL_BYTES : 0
  })

  ipcMain.handle(IPC.voicePrefsGet, (): VoicePrefs => getVoicePrefs())

  ipcMain.handle(IPC.voicePrefsSet, (_e, prefs: unknown): VoicePrefs => {
    // Normalized HERE (the trust boundary) so `setVoicePrefs` keeps a typed signature for
    // main-side callers, and again inside it — the function is idempotent, and an unparseable
    // payload writes the documented defaults rather than rejecting. The setter's contract is
    // "the store now holds something legal", which is always satisfiable.
    return setVoicePrefs(normalizeVoicePrefs(prefs))
  })
}
