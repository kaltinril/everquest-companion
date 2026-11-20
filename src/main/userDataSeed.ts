// userDataSeed.ts: the one-time copy of the player's state out of the original app's folder.
//
// Split out of channel.ts so the copy can be driven by a node test against temp folders. It
// imports only fs and path, and has no module-scope side effect, so channel.ts's place as the
// first import is unchanged. channel.ts hands in the folders and its console-only error sink.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/** The original install's store file. The seed renames it to this build's store name. */
export const LEGACY_STORE_FILE = 'everquest-companion-progress.json'

/**
 * The player's own imported sounds ("My sounds"). A sibling of `soundpacks`, not inside it
 * (sounds.ts `userSoundsRoot`), so copying `soundpacks` never carried it.
 */
const MY_SOUNDS = 'my-sounds'

/**
 * State worth carrying across a rename, in copy order. Everything else in a userData dir
 * (Cache, GPUCache, Code Cache, Local/Session Storage, Preferences, lockfile, errors.log)
 * is regenerated on first launch and is intentionally NOT copied.
 */
export const SEED_ENTRIES = [
  LEGACY_STORE_FILE, // → `${STORE_NAME}.json` (renamed with the product)
  'message-overlay.json', // learned cast-message overlay (expensive to relearn)
  'item-knowledge-cache.json', // wiki item cache (incl. negative caching)
  'registry-cache.json', // sound-pack registry index
  'soundpacks', // installed packs, incl. the provisioned alan-rickman default
  MY_SOUNDS, // the copied alerts point at these sounds
  // TEST BUILD: two more, so a player moving over from the official app keeps everything they
  // set up. The resist ledger holds other characters' learned resists, which no log re-derives;
  // Local Storage holds the renderer's own choices (hidden raid targets, picks and filters).
  'resist-ledger.json',
  'Local Storage'
]

/** Marker written into a seeded dir: what came from where, and when. */
export const SEED_STAMP = 'migrated-from.json'

/** What the copy needs from its caller. */
export interface SeedOptions {
  /** This build's store file name, which the legacy store file is copied to. */
  storeFile: string
  /** Console-only: errorLog's file sink resolves userData, which is still being decided. */
  onError: (message: string, err: unknown) => void
  /** The late copy's folder copy. Only a test passes one, to make it fail part way. */
  copyDir?: (src: string, dest: string) => void
}

/**
 * Copy the allowlisted state from `legacy` into `target`, exactly once (guard: `target`
 * must not exist yet — we create it here, and Electron would otherwise create it at ready).
 * Best-effort: a failure logs and startup continues with an empty dir rather than dying.
 * Returns the entries actually copied (empty ⇒ nothing to do).
 */
export function seedFromLegacy(target: string, legacy: string, opts: SeedOptions): string[] {
  if (legacy === target || !existsSync(legacy) || existsSync(target)) return []
  const copied: string[] = []
  try {
    mkdirSync(target, { recursive: true })
    for (const entry of SEED_ENTRIES) {
      const src = join(legacy, entry)
      if (!existsSync(src)) continue
      const destName = entry === LEGACY_STORE_FILE ? opts.storeFile : entry
      // One entry at a time (TEST BUILD): Local Storage is a live database while the official app
      // runs, and a locked file in it must cost that entry only, never the rest or the stamp.
      try {
        cpSync(src, join(target, destName), { recursive: true })
        copied.push(destName)
      } catch (err) {
        opts.onError(`[everquest-companion] userData seed: ${entry} was not copied:`, err)
      }
    }
    writeFileSync(
      join(target, SEED_STAMP),
      // `toppedUp`: this seed already had the late entries in its list, so `topUpSeed` has
      // nothing left to settle here.
      JSON.stringify(
        { from: legacy, at: new Date().toISOString(), copied, toppedUp: [MY_SOUNDS] },
        null,
        2
      )
    )
  } catch (err) {
    // errorLog.ts's FILE sink can't be used here (it resolves userData, which we're still
    // deciding) — only its console passthrough.
    opts.onError(`[everquest-companion] userData seed from ${legacy} failed:`, err)
  }
  return copied
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Copy the imported sounds unless this build already has its own. A copy that dies part way is
 * removed, so a half-copied pack is never left behind. The folder did not exist before the copy,
 * so removing it can only remove what the copy wrote.
 */
function copyMySounds(target: string, legacy: string, opts: SeedOptions): boolean {
  const src = join(legacy, MY_SOUNDS)
  const dest = join(target, MY_SOUNDS)
  if (existsSync(dest) || !existsSync(join(src, 'manifest.json'))) return false
  try {
    if (opts.copyDir) opts.copyDir(src, dest)
    else cpSync(src, dest, { recursive: true })
    return true
  } catch (err) {
    rmSync(dest, { recursive: true, force: true })
    throw err
  }
}

/**
 * THE LATE COPY, for a folder that an earlier build seeded before `my-sounds` was in the list.
 * That seed copied the alerts but not the sounds they point at, and it never runs twice.
 *
 * Runs on every launch and settles once: the stamp gains `toppedUp`, after which this returns at
 * the first check. A folder with no stamp was never seeded and is left alone. Sounds the player
 * imported in this build win, and so does removing them later. A failure marks nothing, so the
 * next launch tries again. Returns the entries copied.
 */
export function topUpSeed(target: string, legacy: string, opts: SeedOptions): string[] {
  const stampPath = join(target, SEED_STAMP)
  if (legacy === target || !existsSync(stampPath)) return []
  const copied: string[] = []
  try {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8')) as Record<string, unknown>
    const settled = strings(stamp.toppedUp)
    if (settled.includes(MY_SOUNDS)) return []
    if (copyMySounds(target, legacy, opts)) copied.push(MY_SOUNDS)
    const next = {
      ...stamp,
      copied: [...strings(stamp.copied), ...copied],
      toppedUp: [...settled, MY_SOUNDS]
    }
    writeFileSync(stampPath, JSON.stringify(next, null, 2))
  } catch (err) {
    opts.onError(`[everquest-companion] userData seed: the late copy from ${legacy} failed:`, err)
  }
  return copied
}
