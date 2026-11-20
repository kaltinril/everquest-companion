// The one-time copy out of the original app's folder (src/main/userDataSeed.ts), run for real
// against temp folders. No Electron: the module takes its folders and its error sink as arguments.
//
// What it guards: a player who imported their own sounds in the original app ("My sounds") keeps
// them here. That folder is `my-sounds`, a sibling of `soundpacks`, and the copy used to leave it
// behind while still copying the alerts that point at it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { USER_SOUNDS_PACK_ID } from '../src/shared/userSounds'
import {
  LEGACY_STORE_FILE,
  SEED_ENTRIES,
  SEED_STAMP,
  type SeedOptions,
  seedFromLegacy,
  topUpSeed
} from '../src/main/userDataSeed'

const STORE_FILE = 'new-store.json'

/** A throwaway tree, removed when the process exits. */
function tempTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-seed-'))
  process.on('exit', () => {
    rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** Options that fail the test on any copy error. */
function options(errors: string[] = []): SeedOptions {
  return { storeFile: STORE_FILE, onError: (message) => errors.push(message) }
}

/** The original app's folder: a store, an installed pack, and the player's own imported sounds. */
function legacyTree(root: string): string {
  const legacy = join(root, 'legacy')
  put(join(legacy, LEGACY_STORE_FILE), '{"alerts":[]}')
  put(join(legacy, 'soundpacks', 'x', 'manifest.json'), '{"id":"x"}')
  put(join(legacy, USER_SOUNDS_PACK_ID, 'manifest.json'), '{"id":"my-sounds"}')
  put(join(legacy, USER_SOUNDS_PACK_ID, 'sounds', 'a.wav'), 'RIFF-a')
  return legacy
}

function stampOf(target: string): { copied: string[]; toppedUp?: string[] } {
  return JSON.parse(readFileSync(join(target, SEED_STAMP), 'utf8'))
}

test('the first-launch copy brings the imported sounds along with the settings', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = join(root, 'target')
  const errors: string[] = []

  const copied = seedFromLegacy(target, legacy, options(errors))

  assert.deepEqual(errors, [])
  assert.ok(existsSync(join(target, STORE_FILE)), 'the store is copied under its new name')
  assert.ok(existsSync(join(target, 'soundpacks', 'x', 'manifest.json')))
  assert.equal(readFileSync(join(target, USER_SOUNDS_PACK_ID, 'sounds', 'a.wav'), 'utf8'), 'RIFF-a')
  assert.ok(existsSync(join(target, USER_SOUNDS_PACK_ID, 'manifest.json')))
  assert.ok(copied.includes(USER_SOUNDS_PACK_ID))
  assert.ok(stampOf(target).copied.includes(USER_SOUNDS_PACK_ID), 'the stamp names it')
})

test('the copy list names the imported-sounds folder by the id the sound code uses', () => {
  assert.ok(SEED_ENTRIES.includes(USER_SOUNDS_PACK_ID))
})

test('the copy never runs into a folder that already exists', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = join(root, 'target')
  mkdirSync(target)
  assert.deepEqual(seedFromLegacy(target, legacy, options()), [])
  assert.ok(!existsSync(join(target, STORE_FILE)))
})

/** A folder seeded by a build from before the fix: settings copied, imported sounds left behind. */
function seededBeforeTheFix(root: string): string {
  const target = join(root, 'target')
  put(join(target, STORE_FILE), '{"alerts":["mine"]}')
  put(
    join(target, SEED_STAMP),
    JSON.stringify({ from: 'legacy', at: '2026-10-08T00:00:00.000Z', copied: [STORE_FILE] })
  )
  return target
}

test('an install seeded before the fix gets its imported sounds on the next launch, once', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = seededBeforeTheFix(root)
  const errors: string[] = []

  assert.deepEqual(topUpSeed(target, legacy, options(errors)), [USER_SOUNDS_PACK_ID])
  assert.deepEqual(errors, [])
  assert.equal(readFileSync(join(target, USER_SOUNDS_PACK_ID, 'sounds', 'a.wav'), 'utf8'), 'RIFF-a')
  const stamp = stampOf(target)
  assert.ok(stamp.copied.includes(USER_SOUNDS_PACK_ID))
  assert.ok(stamp.copied.includes(STORE_FILE), 'what the stamp already said is kept')

  // The player then removes their sounds here. That choice stands: the copy does not come back.
  rmSync(join(target, USER_SOUNDS_PACK_ID), { recursive: true, force: true })
  assert.deepEqual(topUpSeed(target, legacy, options(errors)), [])
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID)))
})

test('sounds imported in this build are never overwritten by the late copy', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = seededBeforeTheFix(root)
  put(join(target, USER_SOUNDS_PACK_ID, 'manifest.json'), '{"id":"my-sounds","mine":true}')

  assert.deepEqual(topUpSeed(target, legacy, options()), [])
  assert.equal(
    readFileSync(join(target, USER_SOUNDS_PACK_ID, 'manifest.json'), 'utf8'),
    '{"id":"my-sounds","mine":true}'
  )
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID, 'sounds', 'a.wav')))
})

test('the late copy is settled once, so sounds imported in the original app later stay there', () => {
  const root = tempTree()
  const legacy = join(root, 'legacy')
  put(join(legacy, LEGACY_STORE_FILE), '{}')
  const target = seededBeforeTheFix(root)

  assert.deepEqual(topUpSeed(target, legacy, options()), [])
  put(join(legacy, USER_SOUNDS_PACK_ID, 'manifest.json'), '{"id":"my-sounds"}')
  assert.deepEqual(topUpSeed(target, legacy, options()), [])
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID)))
})

test('a fresh copy settles the late copy too, even when there were no imported sounds', () => {
  const root = tempTree()
  const legacy = join(root, 'legacy')
  put(join(legacy, LEGACY_STORE_FILE), '{}')
  const target = join(root, 'target')
  seedFromLegacy(target, legacy, options())

  put(join(legacy, USER_SOUNDS_PACK_ID, 'manifest.json'), '{"id":"my-sounds"}')
  assert.deepEqual(topUpSeed(target, legacy, options()), [])
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID)))
})

test('a folder that was never seeded is left alone', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = join(root, 'target')
  put(join(target, STORE_FILE), '{}')

  assert.deepEqual(topUpSeed(target, legacy, options()), [])
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID)))
  assert.ok(!existsSync(join(target, SEED_STAMP)))
})

test('an unreadable stamp copies nothing and reports it, without throwing', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = seededBeforeTheFix(root)
  writeFileSync(join(target, SEED_STAMP), 'not json')
  const errors: string[] = []

  assert.deepEqual(topUpSeed(target, legacy, options(errors)), [])
  assert.equal(errors.length, 1)
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID)))
})

test('a late copy that dies part way leaves no half pack and tries again next launch', () => {
  const root = tempTree()
  const legacy = legacyTree(root)
  const target = seededBeforeTheFix(root)
  const errors: string[] = []
  // A copy that writes the manifest and then hits a locked file.
  const failing: SeedOptions = {
    ...options(errors),
    copyDir: (_src, dest) => {
      put(join(dest, 'manifest.json'), '{"half":true}')
      throw new Error('EBUSY')
    }
  }

  assert.deepEqual(topUpSeed(target, legacy, failing), [])
  assert.equal(errors.length, 1)
  assert.ok(!existsSync(join(target, USER_SOUNDS_PACK_ID)), 'the half copy is removed')
  assert.equal(stampOf(target).toppedUp, undefined, 'nothing is marked settled')

  assert.deepEqual(topUpSeed(target, legacy, options(errors)), [USER_SOUNDS_PACK_ID])
})

test('channel.ts runs the first-launch copy and then the late copy', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'main', 'channel.ts'), 'utf8')
  assert.match(src, /seedFromLegacy\(target, legacy, SEED_OPTIONS\)/)
  assert.match(src, /topUpSeed\(target, legacy, SEED_OPTIONS\)/)
})
