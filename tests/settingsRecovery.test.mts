// What the player is told when the settings file was damaged at launch
// (src/shared/settingsRecovery.ts). Until 2026-11-19 a recovery, a restore from an old backup and
// a reset to defaults all looked like nothing had happened, or like a fresh install.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { holdRecoveryNotice, settingsRecoveryNotice } from '../src/shared/settingsRecovery'
import { migrateStoreFile } from '../src/main/storeFile'

const KEPT = 'C:\\Users\\me\\AppData\\Roaming\\app\\progress.corrupt.json'
const onDay = (ms: number): string => `day ${String(ms)}`

test('a store that opened normally, or a fresh install, says nothing', () => {
  assert.equal(settingsRecoveryNotice({ wrote: false }), null)
  assert.equal(settingsRecoveryNotice({ wrote: true }), null)
  // A file that could not be read or moved aside was not recovered and not reset.
  assert.equal(settingsRecoveryNotice({ wrote: false, readError: 'EPERM' }), null)
})

test('settings read back out of the damaged file: the player is told nothing was lost', () => {
  const notice = settingsRecoveryNotice({ quarantinedPath: KEPT, salvagedFrom: 'torn-bytes', wrote: true })
  assert.equal(notice?.kind, 'recovered')
  assert.match(notice?.text ?? '', /All of your settings were recovered/)
  assert.doesNotMatch(notice?.text ?? '', /missing|default/)
})

test('settings restored from a backup: the player is told its date and that later changes are gone', () => {
  const notice = settingsRecoveryNotice(
    { quarantinedPath: KEPT, salvagedFrom: 'backup', salvagedBackup: { savedAtMs: 42 }, wrote: true },
    onDay
  )
  assert.equal(notice?.kind, 'restored-backup')
  assert.match(notice?.text ?? '', /a copy saved on day 42\./)
  assert.match(notice?.text ?? '', /Changes made after that are missing/)
  assert.ok(notice?.text.includes(KEPT), 'and where the damaged file is kept')

  // A backup whose date could not be read is still named as an older copy.
  const undated = settingsRecoveryNotice({ quarantinedPath: KEPT, salvagedFrom: 'backup', wrote: true }, onDay)
  assert.equal(undated?.kind, 'restored-backup')
  assert.match(undated?.text ?? '', /restored from an older copy\./)
})

test('nothing could be recovered: the player is told the settings were reset and where the file is', () => {
  const notice = settingsRecoveryNotice({ quarantinedPath: KEPT, wrote: false })
  assert.equal(notice?.kind, 'reset')
  assert.match(notice?.text ?? '', /started with default settings/)
  assert.ok(notice?.text.includes(KEPT))
})

test('a recovery that could not be written back is a reset, never "recovered"', () => {
  // The recovered settings never reached the live file, so the app is running on defaults.
  for (const salvagedFrom of ['torn-bytes', 'backup'] as const) {
    const notice = settingsRecoveryNotice({ quarantinedPath: KEPT, salvagedFrom, wrote: false })
    assert.equal(notice?.kind, 'reset')
  }
})

test('the real store-file outcomes map to the three notices', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-settings-recovery-'))
  const path = join(dir, 'everquest-companion-progress.json')
  const quiet = { error: () => undefined }
  const whole = '{"schemaVersion": 1, "byCharacter": {}}'
  try {
    writeFileSync(path, whole, 'utf8')
    assert.equal(settingsRecoveryNotice(migrateStoreFile(path, quiet)), null, 'a healthy store')

    writeFileSync(path, `${whole}\u0000\u0000\u0000`, 'utf8')
    assert.equal(settingsRecoveryNotice(migrateStoreFile(path, quiet))?.kind, 'recovered')

    // The healthy run above left a v1 backup, so a store cut off mid-object restores from it.
    writeFileSync(path, '{"byCharacter": {"a": 1', 'utf8')
    assert.equal(settingsRecoveryNotice(migrateStoreFile(path, quiet))?.kind, 'restored-backup')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const empty = mkdtempSync(join(tmpdir(), 'eqc-settings-recovery-'))
  try {
    const lone = join(empty, 'everquest-companion-progress.json')
    writeFileSync(lone, '{"byCharacter": {"a": 1', 'utf8')
    const notice = settingsRecoveryNotice(migrateStoreFile(lone, quiet))
    assert.equal(notice?.kind, 'reset')
    assert.ok(notice?.text.includes(join(empty, 'everquest-companion-progress.corrupt.json')))
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

// ---- the notice outlives a launch that never opened the window --------------------------------

const NOTICE = { kind: 'reset', title: 'Your settings were reset', text: `kept at ${KEPT}` } as const

/** A settings store of one key, as main hands the holder. */
function fakeNoticeStore(initial?: unknown): { value: unknown; ports: Parameters<typeof holdRecoveryNotice>[1] } {
  const box = {
    value: initial,
    ports: {
      load: (): unknown => box.value,
      save: (notice: unknown): void => {
        box.value = notice
      },
      clear: (): void => {
        box.value = undefined
      }
    }
  }
  return box
}

test('a notice no window showed is still there on the next launch', () => {
  const store = fakeNoticeStore()
  assert.deepEqual(holdRecoveryNotice(NOTICE, store.ports).get(), NOTICE)
  // Next launch: the file is healthy, so main has nothing fresh to say.
  assert.deepEqual(holdRecoveryNotice(null, store.ports).get(), NOTICE)
})

test('closing the notice ends it, on this launch and the next', () => {
  const store = fakeNoticeStore()
  const held = holdRecoveryNotice(NOTICE, store.ports)
  held.seen()
  assert.equal(held.get(), null)
  assert.equal(store.value, undefined)
  assert.equal(holdRecoveryNotice(null, store.ports).get(), null)
})

test('a newer recovery replaces a notice still waiting', () => {
  const store = fakeNoticeStore({ ...NOTICE, title: 'older' })
  assert.deepEqual(holdRecoveryNotice(NOTICE, store.ports).get(), NOTICE)
  assert.deepEqual(store.value, NOTICE)
})

test('a stored value that is not a notice shows nothing', () => {
  for (const bad of ['text', 7, {}, { kind: 'other', title: 't', text: 'x' }, { kind: 'reset', title: 1, text: 'x' }]) {
    assert.equal(holdRecoveryNotice(null, fakeNoticeStore(bad).ports).get(), null)
  }
})

test('a store that refuses the write still shows the notice this launch', () => {
  const refusing = {
    load: (): unknown => undefined,
    save: (): void => {
      throw new Error('ENOSPC')
    },
    clear: (): void => {
      throw new Error('ENOSPC')
    }
  }
  const held = holdRecoveryNotice(NOTICE, refusing)
  assert.deepEqual(held.get(), NOTICE)
  held.seen()
  assert.equal(held.get(), null)
})
