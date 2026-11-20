import { app } from 'electron'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { E2E } from './e2e'
// Console-only sinks. `logError` is deliberately NOT used in this module (it writes into the
// userData dir this module is still deciding); these three just forward to `console.*`
// verbatim, resolve nothing, and have no module-scope side effects — so importing them here
// cannot disturb the first-import law that puts channel.ts ahead of electron-store.
import { logConsoleError, logInfo } from './errorLog'
// fs and path only, no module-scope side effect: safe ahead of electron-store for the same reason.
import { type SeedOptions, seedFromLegacy, topUpSeed } from './userDataSeed'

/**
 * CHANNEL ISOLATION (Task #58) — the FIRST module index.ts imports.
 *
 * Three builds of this app can be alive on one machine at the same time: the installed
 * release, the `npm run dev` watcher, and a headless `npm run test:e2e` run. They used to
 * share ONE `userData` dir (`%APPDATA%\eq-tools`), which meant they shared the store, the
 * learned message overlay, errors.log, the soundpacks dir — and, because Electron's
 * single-instance lock lives IN `userData`, they also fought over the lock: launching the
 * installed app while the dev app ran just focused the dev window.
 *
 * So `userData` is chosen here, per channel, BEFORE anything else runs (electron-store is
 * constructed at module scope, and `errorLogPath()`/soundpacks/caches all resolve through
 * `app.getPath('userData')` — nothing in the codebase hardcodes a path, so redirecting the
 * root redirects every consumer):
 *
 *   prod (app.isPackaged)  → %APPDATA%\everquest-companion
 *   dev  (!isPackaged)     → %APPDATA%\everquest-companion-dev
 *   e2e  (EQ_E2E=1)        → a throwaway temp dir (wiped per run by the harness)
 *
 * Distinct dirs ⇒ distinct single-instance locks (Chromium's ProcessSingleton keys its
 * lockfile + message window off the user-data dir), so dev and the installed app now run
 * side by side. Verified empirically: two Electron processes with different `userData`
 * both win `requestSingleInstanceLock()`; with the same dir the second one loses.
 *
 * ONE-TIME SEED (both non-e2e channels): the pre-rename dir `%APPDATA%\eq-tools` holds the
 * user's real state. The first launch on a channel whose dir does not exist yet COPIES an
 * allowlist of state out of it (never a move — the old dir is left untouched as a backup).
 * The allowlist is deliberate: Chromium's Cache/GPUCache/Local Storage/lockfile are
 * regenerable noise and a stale lockfile is actively harmful.
 */

export type AppChannel = 'prod' | 'dev' | 'e2e'

/**
 * TEST BUILD (local_all_changes_testing only — never merges to a PR branch). One flag, read
 * by updater.ts to keep a PACKAGED test build from touching the official update feed. The
 * identity changes ride in electron-builder.yml; the userData split rides in PROD_DIR_NAME
 * below; this constant is the one thing runtime code needs to know.
 */
export const TEST_BUILD = true

/** userData dir names, relative to `app.getPath('appData')` (%APPDATA% on Windows). */
// `-test`, NOT the official 'everquest-companion': a distinct dir is what gives the test
// install its own store, caches and — because Chromium keys the single-instance lock off
// the user-data dir — the ability to RUN BESIDE the official app instead of focusing it.
const PROD_DIR_NAME = 'everquest-companion-test'
const DEV_DIR_NAME = 'everquest-companion-dev'
/**
 * Source of the one-time seed: the OFFICIAL install's userData (upstream seeds from the
 * pre-rename 'eq-tools' here). First launch of the test build copies the user's real
 * settings, learned overlay and soundpacks out of it — copy, never move — so the two
 * installs start identical and then diverge freely.
 */
const LEGACY_DIR_NAME = 'everquest-companion'

/** electron-store file base name → `<userData>/everquest-companion-progress.json`. */
export const STORE_NAME = 'everquest-companion-progress'

export const CHANNEL: AppChannel = E2E ? 'e2e' : app.isPackaged ? 'prod' : 'dev'

/** What the copy (userDataSeed.ts) needs from here: the store's new name and the console sink. */
const SEED_OPTIONS: SeedOptions = { storeFile: `${STORE_NAME}.json`, onError: logConsoleError }

/** Resolve this channel's userData dir, seeding it from the legacy dir on first launch. */
function resolveUserData(): string {
  if (E2E) {
    // The harness passes EQ_E2E_USER_DATA (a fixed path it wipes per run, so runs don't
    // litter temp); a bare `EQ_E2E=1` launch gets its own throwaway dir. No seeding ever —
    // a test run must start from nothing and can never read the user's real state.
    const given = process.env.EQ_E2E_USER_DATA
    if (given) {
      mkdirSync(given, { recursive: true })
      return given
    }
    return mkdtempSync(join(tmpdir(), 'everquest-companion-e2e-'))
  }
  const base = app.getPath('appData')
  const target = join(base, CHANNEL === 'prod' ? PROD_DIR_NAME : DEV_DIR_NAME)
  const legacy = join(base, LEGACY_DIR_NAME)
  const copied = seedFromLegacy(target, legacy, SEED_OPTIONS)
  if (copied.length > 0) {
    logInfo(
      `[everquest-companion] First launch on the '${CHANNEL}' channel: copied ${copied.length} state entries from ${LEGACY_DIR_NAME}\\ → ${target} (${copied.join(', ')}). The old dir is left untouched as a backup.`
    )
  }
  // A folder seeded by an earlier build is missing what the list gained since (the imported sounds).
  const late = topUpSeed(target, legacy, SEED_OPTIONS)
  if (late.length > 0) {
    logInfo(`[everquest-companion] Copied ${late.join(', ')} from ${LEGACY_DIR_NAME}\\ → ${target}.`)
  }
  return target
}

/** This process's userData dir. Set before electron-store (or anything else) reads it. */
export const USER_DATA = resolveUserData()

app.setPath('userData', USER_DATA)
logInfo(`[everquest-companion] channel=${CHANNEL} userData=${USER_DATA}`)
