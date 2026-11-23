import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import { windowsApi } from './windows'
import { plannerApi } from './planner'
import { achievementsApi } from './achievements'
import { rosterApi } from './roster'
import { soundsBridge } from './sounds'
// "What IS this" — the spell/item/mob lookups, split out at the 400-line ceiling (preload/knowledge.ts).
import { knowledgeBridge } from './knowledge'
// The map viewer's calls, split out at the same ceiling for the same reason (owner ask 2026-09-11
// added a fifth and the file crossed 400 code lines).
import { mapsBridge } from './maps'
// The log-stream pushes — line / character rebuild / quiet-switch offer (preload/logStream.ts).
import { logStreamBridge } from './logStream'
import type {
  AlertDef,
  AlertPrefs,
  AppFocus,
  CharacterRef,
  EqConfig,
  EqConfigResult,
  FeedReport,
  FiredAlert,
  ItemKnowledge,
  LogLine,
  LogSwitchNudge,
  LootEvent,
  MobKnowledge,
  ModuleChanged,
  ModuleSnapshot,
  PackInstallProgress,
  PackMutationResult,
  PackPreviewList,
  ProgressState,
  RegistryListResult,
  SoundData,
  SoundPack,
  SpeechEngine,
  SpeechInstallProgress,
  SpeechInstallResult,
  SpeechSayRequest,
  SpeechSayResult,
  SpeechVoice,
  SpellCatalog,
  UpdateStatus,
  UserSound,
  UserSoundImportResult,
  UserSoundRemoveResult,
  VoicePrefs
} from '../shared/types'
import type { CombatSnapshot, FightSearchResult, SnapshotOpts } from '../shared/combat'
import type { ClassAbbr, ComboDelta, ComboSnap } from '../shared/classCombo'
// The level-unlock and planner types moved with their methods: knowledge.ts (JOS-293) carries
// the spell/item/mob/unlock lookups, planner.ts (JOS-285) the exaltation + gear reads.
import type { CharacterSheet } from '../shared/characterSheet'
// The `/outputfile` registry's one IPC shape (JOS-44) — command, why-clause, and the dump's own
// mtime, per kind. Every surface fed by an export command reads this and nothing else.
// The `/outputfile` registry's slice (status line + the Factions tab's log evidence) — split for
// file mass, planner.ts's arrangement.
import { outputsApi } from './outputs'
// Presence-driven prefs live beside their normalizers, not in shared/types.ts — see the note at
// the bottom of that file.
import type { CursorRingPrefs, OverlayAutoHidePrefs } from '../shared/presencePrefs'
import type { ShareApplyResult, SharePreview } from '../shared/profiles'
// Performance profiling (docs/plans/perf-profiling.md). Same arrangement as presencePrefs: the
// shapes live beside their pure helpers in shared/perf.ts, not in types.ts, because
// storeMigrations.ts must reach the prefs normalizer from module scope.
import type { PerfHudPrefs, PerfSample, StartupProfile } from '../shared/perf'
import { perfBridge } from './perf'
// The two graphics-compatibility switches (JOS-40), spread in below for the same file-size
// reason as perfBridge. Shapes live beside their normalizer in shared/graphicsPrefs.ts.
import { graphicsBridge } from './graphics'
// The buff externals allowlist (JOS-140), spread in below for the same file-size reason. Shape
// and normalizer live together in shared/buffTrust.ts.
import { buffTrustBridge } from './buffTrust'
import { logArchiveBridge } from './logArchive'
import { lootFrameBridge } from './lootFrame'
import { gapsCharactersBridge } from './gapsCharacters'
import { macrosBridge } from './macros'
import { presencePrefsBridge } from './presencePrefs'
import { respawnBridge } from './respawn'
import { alertFiresBridge } from './alertFires'
import { updatesBridge } from './updates'
// The main window's text size (JOS-123), split out for the same file-mass reason. Its shapes are
// a single number; the ladder and the normalizer live in shared/uiScale.ts.
import { uiScaleBridge } from './uiScale'
// …and the overlay-snapping preference (./overlaySnap.ts), likewise (JOS-217).
import { overlaySnapBridge } from './overlaySnap'
// The dev-only restart button's one method (JOS-61), split out for the same file-mass reason.
import { devBridge } from './dev'
// The data server's door (JOS-484): the `EQC_ENGINE` readout and the brokered byte channel this
// window's `EngineClient` runs over. Split out for the same file-mass reason; ./engine.ts carries
// the argument for why the PORT never crosses this bridge and the token does.
import { engineBridge } from './engine'
// What's new (JOS-73): the one store key behind the release-notes panel and its teaser strip.
// The NOTES are committed source the renderer imports directly — see ./releaseNotes.ts.
import { releaseNotesBridge } from './releaseNotes'
import type { SettingsRecoveryNotice } from '../shared/settingsRecovery'

/** Reply of share:saveFile — the OS save dialog either wrote a file or was cancelled. */
export interface ShareSaveResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
}

export type { CharacterRef, EqConfig, EqConfigResult, LogLine, LogSwitchNudge, LootEvent, ProgressState }
export type { ModuleChanged, ModuleSnapshot }
export type { AlertDef, AlertPrefs, SoundData, SoundPack, SpellCatalog, ItemKnowledge, MobKnowledge }
export type { UserSound, UserSoundImportResult, UserSoundRemoveResult }
export type {
  SpeechEngine,
  SpeechInstallProgress,
  SpeechInstallResult,
  SpeechSayRequest,
  SpeechSayResult,
  SpeechVoice,
  VoicePrefs
}
export type { PackInstallProgress, PackMutationResult, PackPreviewList, RegistryListResult }
export type { AppFocus, UpdateStatus }
// The brokered byte channel (JOS-484), re-exported for the same reason every payload shape here is:
// so a renderer surface can name it without reaching across the tsconfig boundary into src/shared.
export type { EngineConnection } from './engine'
export type { CursorRingPrefs, OverlayAutoHidePrefs }
export type { ShareApplyResult, SharePreview }
export type { PerfHudPrefs, PerfSample, StartupProfile }
// The combo module rides the generic transport, so the renderer never names these on an API
// method — re-exported here for the same reason every other module payload is: so a view can
// say `useModule<ComboSnap, ComboDelta>('combo', …)` without reaching across the tsconfig
// boundary into src/shared itself.
export type { ClassAbbr, ComboDelta, ComboSnap }

export interface ReloadInventoryResult {
  ok: boolean
  error?: string
  path?: string
  loadedAt?: string
  progress?: ProgressState
}

export interface SetCharacterResult {
  ok: boolean
  error?: string
  character?: CharacterRef
}

/** Payload of the inventory auto-reload push. */
export interface InventoryReloadEvent {
  path: string
  loadedAt: string
}

/** A combo interval's time span. `endTs: null` = the open (current) interval. */
export interface ComboRange {
  startTs: number
  endTs: number | null
}

/** What the user says the loadout was over `[startTs, endTs]`. Re-validated in main. */
export interface ComboCorrectionInput extends ComboRange {
  classes: ClassAbbr[]
}

/** Both correction writes answer the same way; `error` is prose for the UI, never a code. */
export interface ComboWriteResult {
  ok: boolean
  error?: string
}

/** Payload the renderer sends over `error:report` (fire-and-forget). */
export interface RendererErrorReport {
  message: string
  stack?: string
  source: string
  /**
   * The error's own NAME (`TypeError`, `RangeError`), when the thrown value had one (JOS-100).
   *
   * It used to be folded into `message` and lost, which cost the error its most useful
   * grouping input — `errorFingerprint` is `hash(name + top frames)`, and every renderer error
   * arriving as `Error` would have collapsed distinct bugs in one function into one issue.
   */
  name?: string
}

const api = {
  // The performance HUD's five methods (./perf.ts). Spread rather than inlined for file size
  // alone; on `window.eq` they are indistinguishable from every method written out below.
  ...perfBridge,
  // …and the two graphics-compatibility switches (./graphics.ts), for the same reason.
  ...graphicsBridge,
  // …and the buff externals allowlist (./buffTrust.ts), likewise.
  ...buffTrustBridge,
  ...logArchiveBridge,
  ...lootFrameBridge,
  ...gapsCharactersBridge,
  ...macrosBridge,
  ...respawnBridge,
  ...alertFiresBridge,
  // …and the main window's text size (./uiScale.ts), likewise.
  ...uiScaleBridge,
  // …and the overlay-snapping switch (./overlaySnap.ts), likewise.
  ...overlaySnapBridge,
  // …and `restartApp` (./dev.ts), whose handler refuses in a packaged build.
  ...devBridge,
  // …and the data server's two members (./engine.ts): the `EQC_ENGINE` readout and `engineConnect`,
  // which answers null on every launch that has no engine — which is nearly all of them.
  ...engineBridge,
  // …and the two what's-new methods (./releaseNotes.ts), for the same file-size reason.
  ...releaseNotesBridge,
  /** What happened to a damaged settings file at this launch; null when it opened normally. */
  getSettingsRecoveryNotice: (): Promise<SettingsRecoveryNotice | null> =>
    ipcRenderer.invoke(IPC.settingsRecoveryGet),
  /** The player closed that notice: main stops answering with it for this run. */
  settingsRecoverySeen: (): void => {
    ipcRenderer.send(IPC.settingsRecoverySeen)
  },

  /**
   * Is this the headless integration-test channel (`EQ_E2E=1`, src/main/e2e.ts)?
   *
   * A STATIC boolean, not a channel: the env var is decided before the process starts and can
   * never change, so an IPC round-trip would buy nothing and every consumer would have to be
   * async. The renderer has no `process` (nodeIntegration is off) — this is its only door to
   * the flag, and it exists because some renderer behavior is genuinely too intrusive for a
   * test that runs BESIDE the user's game: `lib/speech.ts` must not speak out loud during
   * `npm run test:e2e`. Read-only, and never a trust decision (main enforces its own e2e
   * behavior in main).
   */
  isE2E: process.env.EQ_E2E === '1',

  getCharacter: (): Promise<CharacterRef | null> => ipcRenderer.invoke(IPC.getCharacter),
  listCharacters: (): Promise<CharacterRef[]> => ipcRenderer.invoke(IPC.listCharacters),
  setCharacter: (logPath: string): Promise<SetCharacterResult> =>
    ipcRenderer.invoke(IPC.setCharacter, logPath),

  // ---- EQ install-dir discovery + override (Settings gear) ----
  /** Read the effective EQ config: install root, how it resolved, log count. */
  getEqConfig: (): Promise<EqConfig> => ipcRenderer.invoke(IPC.getEqConfig),
  /** Open the OS folder-picker; on a pick, persist the override + re-scan. */
  pickEqDir: (): Promise<EqConfigResult> => ipcRenderer.invoke(IPC.pickEqDir),
  /**
   * Open the OS FILE-picker on the logs dir; on a pick, persist + re-scan (JOS-82).
   * Windows' folder dialog shows no files, so this is the only way to point at the
   * `eqlog_*.txt` the user can see in Explorer.
   */
  pickEqLogFile: (): Promise<EqConfigResult> => ipcRenderer.invoke(IPC.pickEqLogFile),
  /** Set the override to an explicit dir (undefined/'' reverts to auto-detect). */
  setEqDir: (dir: string | undefined): Promise<EqConfig> =>
    ipcRenderer.invoke(IPC.setEqDir, dir),
  /** Clear the override → revert to auto-discovery. Returns the re-resolved config. */
  resetEqDir: (): Promise<EqConfig> => ipcRenderer.invoke(IPC.resetEqDir),
  /** Subscribe to "effective EQ config changed" pushes (override applied/cleared). */
  onEqConfigChanged: (cb: (c: EqConfig) => void): (() => void) => {
    const listener = (_e: unknown, c: EqConfig): void => cb(c)
    ipcRenderer.on(IPC.onEqConfigChanged, listener)
    return () => ipcRenderer.removeListener(IPC.onEqConfigChanged, listener)
  },
  getProgress: (): Promise<ProgressState> => ipcRenderer.invoke(IPC.getProgress),
  reloadInventory: (): Promise<ReloadInventoryResult> => ipcRenderer.invoke(IPC.reloadInventory),
  // ---- the `/outputfile` registry's slice, in its own file (src/preload/outputs.ts) ----
  ...outputsApi,
  /**
   * State this quest's turn-ins: the epoch-ms instants it was handed in, ascending (JOS-131).
   * An empty list means "never turned in" and clears a pre-JOS-131 completion too. Main
   * sanitizes the list before it is persisted. `rejected`, when given, restates the log-detected
   * instants this quest must not re-assert (upstream issue #72); omitted, they are left alone.
   */
  setQuestTurnIns: (questKey: string, instants: number[], rejected?: number[]): Promise<ProgressState> =>
    ipcRenderer.invoke(IPC.setQuestTurnIns, questKey, instants, rejected),
  /**
   * State ONE item's held count by hand, or take the statement back with `count: null` (JOS-186).
   * `key` is the normalized counting key; `name` is only ever a spelling. Main dates the statement
   * and sanitizes it (shared/itemOverrides.ts owns both rules).
   */
  setItemOverride: (key: string, name: string, count: number | null): Promise<ProgressState> =>
    ipcRenderer.invoke(IPC.setItemOverride, key, name, count),
  getCombatSnapshot: (opts: SnapshotOpts): Promise<CombatSnapshot> =>
    ipcRenderer.invoke(IPC.getCombatSnapshot, opts),
  /** Fuzzy-search the whole fight history + the live fight by name/zone (Task #61). An
   *  empty/whitespace query resolves to no hits (the UI shows its browse list instead). */
  searchFights: (text: string, limit?: number): Promise<FightSearchResult> =>
    ipcRenderer.invoke(IPC.searchFights, text, limit),

  // ---- alerts extension (Task #18) ----
  listAlerts: (): Promise<AlertDef[]> => ipcRenderer.invoke(IPC.listAlerts),
  saveAlert: (def: AlertDef): Promise<AlertDef[]> => ipcRenderer.invoke(IPC.saveAlert, def),
  deleteAlert: (id: string): Promise<AlertDef[]> => ipcRenderer.invoke(IPC.deleteAlert, id),
  testAlert: (id: string): Promise<AlertDef | null> => ipcRenderer.invoke(IPC.testAlert, id),
  resetAlerts: (): Promise<AlertDef[]> => ipcRenderer.invoke(IPC.resetAlerts),
  /** Report a renderer-evaluated 'app' fire so main records it in history (fire-and-forget). */
  appFired: (alertId: string, context: string): void => {
    try {
      ipcRenderer.send(IPC.appFired, { alertId, context })
    } catch {
      // history is best-effort; a failed report just omits one recent-fire row.
    }
  },
  getAlertPrefs: (): Promise<AlertPrefs> => ipcRenderer.invoke(IPC.getAlertPrefs),
  setAlertPrefs: (prefs: AlertPrefs): Promise<AlertPrefs> =>
    ipcRenderer.invoke(IPC.setAlertPrefs, prefs),
  /** Sound packs, the openpeon registry and the user's own imports — preload/sounds.ts. */
  ...soundsBridge,
  /** "What IS this" — spell / item / mob lookups, and the spell catalog: preload/knowledge.ts. */
  ...knowledgeBridge,

  // ---- voice alerts / TTS (docs/plans/voice-alerts.md §3) ----
  // The 'system' tier needs NOTHING here: Chromium's `speechSynthesis` is already in the
  // renderer, so the free tier speaks without crossing this boundary at all. The three engine
  // calls below serve the DOWNLOADED (Kokoro) tier, whose model and wav cache live in main —
  // and every failure answers with a STATE ('engine-not-installed' / 'not-implemented' /
  // 'disabled') rather than throwing — which is what lets the renderer degrade any {ok:false}
  // to the system voice instead of going silent.
  /** Synthesize + cache one utterance; resolves to a playable url once an engine exists.
   *  Both fields are re-validated at the handler (they reach a cache key and a file name). */
  speechSay: (request: SpeechSayRequest): Promise<SpeechSayResult> =>
    ipcRenderer.invoke(IPC.speechSay, request),
  /** Voices the DOWNLOADED tier can speak with — empty until it is installed. System-tier
   *  voices come from the renderer's own `speechSynthesis.getVoices()`, never from here. */
  speechVoices: (): Promise<SpeechVoice[]> => ipcRenderer.invoke(IPC.speechVoices),
  /** Provision an engine tier (pinned release, sha256-verified, atomic, resumable). Resolves
   *  only when the ~120 MB download has FINISHED — subscribe below to render it meanwhile. */
  speechInstall: (engine: SpeechEngine): Promise<SpeechInstallResult> =>
    ipcRenderer.invoke(IPC.speechInstall, engine),
  /** Bytes `speechInstall` would download for a tier (0 for one that downloads nothing). Read
   *  from main's pinned asset table so the UI states the real price, never a copied number. */
  speechInstallSize: (engine: SpeechEngine): Promise<number> =>
    ipcRenderer.invoke(IPC.speechInstallSize, engine),
  /** Subscribe to install progress while `speechInstall` is outstanding. The terminal
   *  'done'/'failed' phase always matches the verdict that invoke resolves with. */
  onSpeechInstallProgress: (cb: (progress: SpeechInstallProgress) => void): (() => void) => {
    const listener = (_e: unknown, progress: SpeechInstallProgress): void => cb(progress)
    ipcRenderer.on(IPC.onSpeechInstallProgress, listener)
    return () => ipcRenderer.removeListener(IPC.onSpeechInstallProgress, listener)
  },
  /** Read the global voice prefs blob. REAL from day one — the store is main-owned. */
  getVoicePrefs: (): Promise<VoicePrefs> => ipcRenderer.invoke(IPC.voicePrefsGet),
  /** Persist the global voice prefs; resolves to what was actually stored (every field is
   *  re-clamped at the handler, so the reply may differ from what was sent). */
  setVoicePrefs: (prefs: VoicePrefs): Promise<VoicePrefs> =>
    ipcRenderer.invoke(IPC.voicePrefsSet, prefs),

  // ---- the planner's slice, in its own file (src/preload/planner.ts) ----
  // The exaltation planner's four reads + one write and the Gear tab's two reads plus its own
  // set read/write pair (JOS-286). Split out
  // under the same rule roster.ts/windows.ts/perf.ts state: this file is AT the measured
  // 400-code-line ceiling, and phase 4 (JOS-285) needed one more method than it had room for.
  // (The item/mob lookups live in knowledge.ts beside the spell lookups — JOS-293's split.)
  ...plannerApi,
  // The read of the achievements dump (preload/achievements.ts), split out under the same
  // rule: the Achievements tab's.
  ...achievementsApi,

  // ---- character sheet (JOS-45) ----
  /** The armory grid, the gear sum and the carry-all ledger for the active character, from their
   *  newest `/outputfile inventory` dump; `null` when no dump exists.
   *
   *  IT USED TO BE THE ONE METHOD HERE THAT COULD REJECT, and JOS-327 ended that: the handler was
   *  registered only when the old `UNRELEASED` review gate was true, so a packaged build had
   *  nothing on the other side and the invoke failed with Electron's own "No handler registered
   *  for 'character:sheet'". The owner released the tab; the handler is unconditional. The
   *  renderer's read still tolerates a rejection (features/character/useCharacterSheet.ts) — a
   *  transport that answers `null` for "no dump" has no business turning anything into a red box —
   *  but nothing is expected to produce one now. */
  characterSheet: (): Promise<CharacterSheet | null> => ipcRenderer.invoke(IPC.characterSheet),

  /** Report a renderer-detected event into the live event feed (Task #59) — today only quest
   *  completions, which only the renderer's posky/turn-in detector can see. Fire-and-forget;
   *  main owns the capped ring and pushes it on to the 'events' overlay. */
  reportFeedEvent: (report: FeedReport): void => ipcRenderer.send(IPC.feedReport, report),

  /** The map viewer's five calls, split out at the 400-line ceiling: preload/maps.ts. */
  ...mapsBridge,

  // ---- settings / alert sharing ("profiles" — src/shared/profiles.ts) ----
  // The renderer owns the localStorage half of a bundle, so it passes its whitelisted
  // pref map (`ui`) into every call and writes back whatever apply returns.
  /** Encode the GLOBAL settings bundle (whitelisted keys only) as one paste-safe line. */
  exportSettingsShare: (ui: Record<string, string>): Promise<string> =>
    ipcRenderer.invoke(IPC.shareExportSettings, ui),
  /** Encode one alert (`ids:[id]`) or every alert (`ids` omitted) as one paste-safe line. */
  exportAlertsShare: (ids?: string[]): Promise<string> =>
    ipcRenderer.invoke(IPC.shareExportAlerts, ids),
  /** Save an already-encoded share string to disk via the OS save dialog. */
  saveShareFile: (text: string, suggestedName: string): Promise<ShareSaveResult> =>
    ipcRenderer.invoke(IPC.shareSaveFile, text, suggestedName),
  /** Open a share file via the OS picker and preview it (null when the user cancels). */
  openShareFile: (ui: Record<string, string>): Promise<SharePreview | null> =>
    ipcRenderer.invoke(IPC.shareOpenFile, ui),
  /** Decode + plan a pasted string WITHOUT writing anything. Failures come back as prose. */
  previewShare: (text: string, ui: Record<string, string>): Promise<SharePreview> =>
    ipcRenderer.invoke(IPC.sharePreview, text, ui),
  /** Apply a previewed string additively; returns the localStorage writes to perform. */
  applyShare: (
    text: string,
    ui: Record<string, string>,
    selection?: { alertIds?: string[]; scalarIds?: string[] }
  ): Promise<ShareApplyResult> => ipcRenderer.invoke(IPC.shareApply, text, ui, selection),

  // ---- generic module transport ----
  /** Full hydration snapshot for a module (null if the id is unknown). */
  getModuleSnapshot: <Snap>(moduleId: string): Promise<ModuleSnapshot<Snap> | null> =>
    ipcRenderer.invoke(IPC.getModuleSnapshot, moduleId),
  /**
   * Subscribe to alert FIRES (JOS-499 item 7) — one `FiredAlert` per firing, played by the
   * always-mounted `AlertPlayer`.
   *
   * IT IS ITS OWN DOOR BECAUSE A FIRE IS AN EVENT, NOT STATE. It used to ride `module:delta`
   * alongside the alerts module's state, which worked only because this process had a fold to put
   * it on; with the fold deleted the two are separated by what they are. `module:changed` — the
   * channel that replaced the delta — is a dirty bit that deliberately carries no payload, and a
   * fire is nothing BUT payload: miss it and the sound never happens, where a missed cursor is
   * repaired by the next read.
   */
  onAlertFired: (cb: (f: FiredAlert) => void): (() => void) => {
    const listener = (_e: unknown, f: FiredAlert): void => cb(f)
    ipcRenderer.on(IPC.onAlertFired, listener)
    return () => ipcRenderer.removeListener(IPC.onAlertFired, listener)
  },
  /**
   * Subscribe to every `module:changed` — the SERVED world's dirty bit (JOS-493); the hook filters
   * by moduleId. The SAME member under the SAME name is on the overlay bridge, for the reason
   * `onCharacter` is duplicated there: one transport, one spelling, or the two windows end up
   * disagreeing about which world they are folding.
   */
  onModuleChanged: (cb: (c: ModuleChanged) => void): (() => void) => {
    const listener = (_e: unknown, c: ModuleChanged): void => cb(c)
    ipcRenderer.on(IPC.onModuleChanged, listener)
    return () => ipcRenderer.removeListener(IPC.onModuleChanged, listener)
  },

  // ---- class-combo corrections (docs/plans/class-combo-inference.md § 5.3) ----
  // The combo READ path is the generic transport above — `useModule<ComboSnap, ComboDelta>`.
  // These two are the writes, and they are keyed by TIME because interval ids are
  // recompute-unstable: a correction has to survive the very recompute it triggers.
  /** "That span was these classes." 1–3 classes; every field re-validated in main. */
  setComboCorrection: (correction: ComboCorrectionInput): Promise<ComboWriteResult> =>
    ipcRenderer.invoke(IPC.comboSetCorrection, correction),
  /** "Reset to detected" — drop every correction overlapping this span. */
  clearComboCorrection: (range: ComboRange): Promise<ComboWriteResult> =>
    ipcRenderer.invoke(IPC.comboClearCorrection, range),

  onProgress: (cb: (p: ProgressState) => void): (() => void) => {
    const listener = (_e: unknown, p: ProgressState): void => cb(p)
    ipcRenderer.on(IPC.onProgress, listener)
    return () => ipcRenderer.removeListener(IPC.onProgress, listener)
  },
  onInventoryReload: (cb: (e: InventoryReloadEvent) => void): (() => void) => {
    const listener = (_e: unknown, ev: InventoryReloadEvent): void => cb(ev)
    ipcRenderer.on(IPC.onInventoryReload, listener)
    return () => ipcRenderer.removeListener(IPC.onInventoryReload, listener)
  },
  // The three log-stream pushes — each parsed line, the character rebuild, and the quiet-switch
  // offer (./logStream.ts). Spread rather than inlined for file size alone, exactly like the
  // bridges above; on `window.eq` they are indistinguishable from the methods written out here.
  ...logStreamBridge,
  onCombatActivity: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.onCombatActivity, listener)
    return () => ipcRenderer.removeListener(IPC.onCombatActivity, listener)
  },
  /**
   * Deep link from another window (Task #64): an overlay row was clicked and main has already
   * raised + focused this window. App.tsx switches to the named view and hands the target down
   * (today: the mob to open). Main validates the `view` before forwarding.
   */
  onFocusView: (cb: (focus: AppFocus) => void): (() => void) => {
    const listener = (_e: unknown, focus: AppFocus): void => cb(focus)
    ipcRenderer.on(IPC.onFocusView, listener)
    return () => ipcRenderer.removeListener(IPC.onFocusView, listener)
  },
  /**
   * The mouse's Back button was pressed in THIS window (JOS-201). No payload — the message is the
   * press; what "back" means is the renderer's own question (src/renderer/src/appBack.tsx). Main
   * only forwards a `browser-backward` app-command that arrived on the focused main window
   * (src/main/appBack.ts), so nothing global and nothing from the game reaches here.
   */
  onAppBack: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.onAppBack, listener)
    return () => ipcRenderer.removeListener(IPC.onAppBack, listener)
  },

  // ---- auto-update (Task #27; reworked in Task #55): preload/updates.ts (moved for the 400-line ceiling) ----
  ...updatesBridge,
  /** The running app's version (app.getVersion()). */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.getAppVersion),

  // ---- the app's OTHER WINDOWS: the floating overlays' open-state (Task #52; per-kind in
  // Task #54) and the celebration toast (docs/plans/celebration-toasts.md). Written next door
  // for file mass only — see preload/windows.ts, the same split perf.ts uses.
  ...windowsApi,
  // The group roster's WRITES (docs/plans/group-model.md §3); the read rides the combat
  // snapshot. See roster.ts for why only one direction needs a channel.
  ...rosterApi,

  // ---- cursor ring + overlay auto-hide: preload/presencePrefs.ts (moved for the 400-line ceiling) ----
  ...presencePrefsBridge,


  // ---- clipboard ----
  /**
   * Put plain text on the OS clipboard; resolves to whether it was written.
   *
   * The renderer's own `navigator.clipboard.writeText` CANNOT do this here: it is gated on
   * Chromium's 'clipboard-sanitized-write' permission and this app denies every web permission
   * wholesale, so it rejects with `NotAllowedError: Write permission denied.` in every window.
   * Main's `clipboard` module is not a web API and needs no permission — see ipc/clipboard.ts,
   * which also validates the text (non-empty string, length cap).
   */
  writeClipboard: (text: string): Promise<boolean> => ipcRenderer.invoke(IPC.clipboardWrite, text),

  // ---- performance HUD + startup profile (docs/plans/perf-profiling.md) -------------------
  // Its five methods live in ./perf.ts and are spread in below — this file is at the 400-line
  // factoring ceiling, and a split is the answer to that rather than a widened threshold.

  // ---- frameless window controls (Task #23) ----
  // Moved to ./windows.ts (spread in above) — this file is at the 400-code-line ceiling, and
  // the file about windows is where the window controls belong.

  /**
   * Fire-and-forget error report from the renderer (window.onerror,
   * unhandledrejection, React ErrorBoundary) → main → errors.log + dev stdout.
   * Never throws so a broken UI can always report why it broke.
   */
  reportError: (report: RendererErrorReport): void => {
    try {
      ipcRenderer.send(IPC.reportError, report)
    } catch {
      // If IPC itself is unavailable, the renderer console handler still logged.
    }
  }
}

export type EqApi = typeof api

contextBridge.exposeInMainWorld('eq', api)
