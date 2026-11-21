// Sending a set into a character file and putting a copy back, on a real folder under
// os.tmpdir() (fork #11, P2). Never the game's own folder.

import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type GameFileDeps,
  type GameFileIo,
  listBackups,
  nodeGameFileIo,
  restoreBackup,
  scratchPathFor,
  sendSet,
  stampOf
} from '../src/main/macros/gameFileSend'
import { gameInTaskList, isGameRunningNow } from '../src/main/macros/gameRunning'
import { parseSocials } from '../src/shared/macros/socials'
import type { GameMacro, GameWriteResult } from '../src/shared/macros/types'

const INI = 'Drywrought_oggok_LO1.ini'
const ORIGINAL = `${INI}.companion-original-2026-11-20.bak`
const LAST_1 = `${INI}.companion-last-2026-11-20_143015.bak`
const LAST_2 = `${INI}.companion-last-2026-11-21_080000.bak`

// A latin1 byte (\xe9) outside the section, a hotbar value with `=` and `,`, blank lines at the end.
const HEAD = '[Defaults]\r\nNote=caf\xe9 \xff\x80\r\n\r\n[HotButtons]\r\nPage1Button9=E13,@-1,0000000000000000,0,,\r\nPage1Button10=a=b,c\r\n'
const TAIL = '\r\n[HotButtons2]\r\nPage2Button1Name=NotAMacro\r\n\r\n\r\n'
const FIRST_TEXT = `${HEAD}[Socials]\r\nPage2Button1Name=NeckTurnin\r\nPage2Button1Color=0\r\nPage2Button1Line1=explore the island\r\n${TAIL}`

const SET_A: GameMacro[] = [{ page: 2, button: 2, name: 'Assist', color: 3, lines: ['/assist Brannoc', '', '/attack on'] }]
const SET_B: GameMacro[] = [...SET_A, { page: 3, button: 12, name: 'Café', color: 19, lines: ['/g a=b, c'] }]
const TEXT_A = `${HEAD}[Socials]\r\nPage2Button2Name=Assist\r\nPage2Button2Color=3\r\nPage2Button2Line1=/assist Brannoc\r\nPage2Button2Line3=/attack on\r\n${TAIL}`

/** Files a send must never touch: the UI file, another character, other people's backups. */
const BYSTANDERS: Record<string, string> = {
  'UI_Drywrought_oggok_LO1.ini': '[MainWindow]\r\nX=1\r\n',
  'Other_oggok_LO1.ini': '[Socials]\r\nPage2Button1Name=theirs\r\n',
  'eqclient.ini': '[Defaults]\r\n',
  [`${INI}.bak`]: 'someone else',
  [`${INI}.before-copy-2026-10-18`]: 'the game made this',
  'Drywrought_oggok_LO1_Backup_1.ini': 'and this'
}

interface Fixture {
  root: string
  folder: string
  deps: GameFileDeps
  /** Set the clock the copies are dated with: local time, as `2026-11-20T14:30:15`. */
  at: (when: string) => void
  bytes: (name: string) => Buffer
  stamp: () => string
  send: (macros: GameMacro[], extra?: Partial<GameFileDeps>) => Promise<GameWriteResult>
}

function fixture(t: TestContext, text = FIRST_TEXT): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'eqc-macro-send-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })
  const folder = join(root, 'game')
  mkdirSync(folder)
  writeFileSync(join(folder, INI), Buffer.from(text, 'latin1'))
  for (const [name, body] of Object.entries(BYSTANDERS)) writeFileSync(join(folder, name), body, 'latin1')
  let clock = new Date(2026, 10, 20, 9, 5, 3)
  const deps: GameFileDeps = { isGameRunning: () => Promise.resolve(false), now: () => clock }
  const bytes = (name: string): Buffer => readFileSync(join(folder, name))
  const stamp = (): string => stampOf(bytes(INI))
  return {
    root,
    folder,
    deps,
    at: (when) => {
      clock = new Date(when)
    },
    bytes,
    stamp,
    send: (macros, extra = {}) => sendSet({ folder, file: INI, macros, expect: stamp() }, { ...deps, ...extra })
  }
}

/** Every name under a folder with its bytes: what "nothing was touched" is compared on. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      for (const [inner, body] of Object.entries(snapshot(path))) out[`${name}/${inner}`] = body
      out[`${name}/`] = 'folder'
    } else {
      out[name] = readFileSync(path).toString('base64')
    }
  }
  return out
}

function copies(folder: string): string[] {
  return readdirSync(folder)
    .filter((name) => name.includes('.companion-'))
    .sort()
}

function assertBystanders(f: Fixture): void {
  for (const [name, body] of Object.entries(BYSTANDERS)) assert.equal(f.bytes(name).toString('latin1'), body, name)
}

test('first send: the original copy only, the section replaced, every other byte kept', async (t) => {
  const f = fixture(t)
  const first = f.bytes(INI)
  const result = await f.send(SET_A)
  assert.deepEqual(result, { ok: true, backup: ORIGINAL, removed: [] })
  assert.deepEqual(copies(f.folder), [ORIGINAL])
  assert.equal(f.bytes(ORIGINAL).equals(first), true)
  assert.equal(f.bytes(INI).equals(Buffer.from(TEXT_A, 'latin1')), true)
  assert.deepEqual(parseSocials(f.bytes(INI).toString('latin1')), SET_A)
  assert.deepEqual(readdirSync(f.folder).sort(), [...Object.keys(BYSTANDERS), INI, ORIGINAL].sort())
  assertBystanders(f)
})

test('second send makes a last copy; the third replaces it; the original stays the first file', async (t) => {
  const f = fixture(t)
  const first = f.bytes(INI)
  await f.send(SET_A)
  const afterFirst = f.bytes(INI)

  f.at('2026-11-20T14:30:15')
  assert.deepEqual(await f.send(SET_B), { ok: true, backup: LAST_1, removed: [] })
  assert.deepEqual(copies(f.folder), [LAST_1, ORIGINAL])
  assert.equal(f.bytes(LAST_1).equals(afterFirst), true)
  const afterSecond = f.bytes(INI)
  assert.deepEqual(parseSocials(afterSecond.toString('latin1')), SET_B)

  f.at('2026-11-21T08:00:00')
  assert.deepEqual(await f.send([]), { ok: true, backup: LAST_2, removed: [LAST_1] })
  assert.deepEqual(copies(f.folder), [LAST_2, ORIGINAL])
  assert.equal(f.bytes(LAST_2).equals(afterSecond), true)
  assert.equal(f.bytes(ORIGINAL).equals(first), true)
  assert.equal(f.bytes(INI).toString('latin1'), `${HEAD}[Socials]\r\n${TAIL}`)
  assert.deepEqual(await listBackups({ folder: f.folder, file: INI }), {
    original: { name: ORIGINAL, file: INI, kind: 'original', date: '2026-11-20', time: null },
    last: { name: LAST_2, file: INI, kind: 'last', date: '2026-11-21', time: '08:00:00' }
  })
  assertBystanders(f)
})

test('an LF file with no section and page 1 kept: bytes outside the section survive the disk', async (t) => {
  const every = Buffer.from(Array.from({ length: 256 }, (_, i) => i).filter((b) => b !== 10 && b !== 13 && b !== 91)).toString('latin1')
  const text = `[Odd]\nAll=${every}\n[Socials]\nPage1Button1Name=Built in\nPage2Button1Name=old\n[End]\nx=1`
  const f = fixture(t, text)
  assert.equal((await f.send(SET_A)).ok, true)
  assert.equal(
    f.bytes(INI).toString('latin1'),
    `[Odd]\nAll=${every}\n[Socials]\nPage1Button1Name=Built in\nPage2Button2Name=Assist\nPage2Button2Color=3\nPage2Button2Line1=/assist Brannoc\nPage2Button2Line3=/attack on\n[End]\nx=1`
  )
  const bare = fixture(t, '[HotButtons]\nPage1Button9=E13')
  assert.equal((await bare.send(SET_A)).ok, true)
  assert.equal(bare.bytes(INI).toString('latin1').startsWith('[HotButtons]\nPage1Button9=E13\n[Socials]\nPage2Button2Name=Assist\n'), true)
})

test('refused, and the folder is byte for byte as it was', async (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'Evil_oggok_LO1.ini'), '[Socials]\r\n')
  mkdirSync(join(f.folder, 'sub'))
  writeFileSync(join(f.folder, 'sub', 'Deep_oggok_LO1.ini'), '[Socials]\r\n')
  mkdirSync(join(f.folder, 'Folder_oggok_LO1.ini'))
  await f.send(SET_A)
  const before = snapshot(f.root)
  const expect = f.stamp()
  const reason = async (req: Partial<Parameters<typeof sendSet>[0]>, extra: Partial<GameFileDeps> = {}): Promise<string> => {
    const result = await sendSet({ folder: f.folder, file: INI, macros: SET_B, expect, ...req }, { ...f.deps, ...extra })
    assert.deepEqual(snapshot(f.root), before)
    return result.ok ? 'ok' : result.reason
  }

  assert.equal(await reason({}, { isGameRunning: () => Promise.resolve(true) }), 'game-running')
  assert.equal(await reason({}, { isGameRunning: () => Promise.reject(new Error('no list')) }), 'game-unknown')
  assert.equal(await reason({ expect: 'what the screen showed before' }), 'changed-since-read')
  assert.equal(await reason({ macros: [{ ...SET_A[0], name: 'curly ’' }] }), 'unsavable')
  assert.equal(await reason({ macros: [{ ...SET_A[0], page: 1 }] }), 'unsavable')
  const notCharacterFiles = [
    'UI_Drywrought_oggok_LO1.ini',
    'UI_x_y_LO1.ini',
    '..\\Evil_oggok_LO1.ini',
    '../Evil_oggok_LO1.ini',
    'sub\\Deep_oggok_LO1.ini',
    'sub/Deep_oggok_LO1.ini',
    join(f.folder, INI),
    ORIGINAL,
    `${INI}.bak`,
    'eqclient.ini',
    'Drywrought_oggok_LO1_Backup_1.ini',
    'Missing_oggok_LO1.ini',
    'Folder_oggok_LO1.ini',
    'drywrought_oggok_lo1.ini',
    ''
  ]
  for (const file of notCharacterFiles) assert.equal(await reason({ file }), 'not-a-character-file', file)
  assert.equal(await reason({ file: 7 as unknown as string }), 'not-a-character-file')
  assert.equal(await reason({ folder: join(f.root, 'no-such-folder') }), 'not-a-character-file')
  // The order: an unsavable set is named before the game is asked about.
  assert.equal(await reason({ macros: [{ ...SET_A[0], name: '' }] }, { isGameRunning: () => Promise.reject(new Error('never asked')) }), 'unsavable')
})

test('no copy, no write: a copy that cannot be made or read back stops the send', async (t) => {
  const taken = fixture(t)
  mkdirSync(join(taken.folder, ORIGINAL))
  const before = snapshot(taken.root)
  assert.deepEqual(await taken.send(SET_A), { ok: false, reason: 'backup-failed' })
  assert.deepEqual(snapshot(taken.root), before)

  const failing = fixture(t)
  const clean = snapshot(failing.root)
  const noCopy: GameFileIo = { ...nodeGameFileIo, createNew: () => Promise.reject(new Error('ENOSPC')) }
  assert.deepEqual(await failing.send(SET_A, { io: noCopy }), { ok: false, reason: 'backup-failed' })
  assert.deepEqual(snapshot(failing.root), clean)

  // A copy that lands short is removed again, and nothing is written.
  const short: GameFileIo = { ...nodeGameFileIo, createNew: (path, bytes) => nodeGameFileIo.createNew(path, bytes.subarray(0, bytes.length - 1)) }
  assert.deepEqual(await failing.send(SET_A, { io: short }), { ok: false, reason: 'backup-failed' })
  assert.deepEqual(snapshot(failing.root), clean)

  // Two sends inside one second: the second last copy's name is taken, so it is refused.
  await failing.send(SET_A)
  failing.at('2026-11-20T14:30:15')
  await failing.send(SET_B)
  const twice = snapshot(failing.root)
  assert.deepEqual(await failing.send(SET_A), { ok: false, reason: 'backup-failed' })
  assert.deepEqual(snapshot(failing.root), twice)
})

test('a write that fails leaves the file as it was and no scratch file', async (t) => {
  const f = fixture(t)
  const first = f.bytes(INI)
  // The scratch file's name held by a folder: the real write fails before the rename.
  mkdirSync(scratchPathFor(join(f.folder, INI)))
  assert.deepEqual(await f.send(SET_A), { ok: false, reason: 'write-failed', backup: ORIGINAL })
  assert.equal(f.bytes(INI).equals(first), true)
  assert.equal(f.bytes(ORIGINAL).equals(first), true)
  rmSync(scratchPathFor(join(f.folder, INI)), { recursive: true })

  f.at('2026-11-20T14:30:15')
  assert.deepEqual(await f.send(SET_A), { ok: true, backup: LAST_1, removed: [] })
  assert.equal(readdirSync(f.folder).some((name) => name.endsWith('.tmp')), false)
})

test('the file changing between the read and the write stops the send', async (t) => {
  const f = fixture(t)
  const expect = f.stamp()
  const changed = Buffer.from(FIRST_TEXT.replace('E13', 'E14'), 'latin1')
  const io: GameFileIo = {
    ...nodeGameFileIo,
    createNew: async (path, bytes) => {
      await nodeGameFileIo.createNew(path, bytes)
      writeFileSync(join(f.folder, INI), changed)
    }
  }
  assert.deepEqual(await sendSet({ folder: f.folder, file: INI, macros: SET_A, expect }, { ...f.deps, io }), { ok: false, reason: 'changed-since-read' })
  assert.equal(f.bytes(INI).equals(changed), true)
})

test('a write that does not read back right is put back from the copy', async (t) => {
  const f = fixture(t)
  const first = f.bytes(INI)
  let calls = 0
  const garbles: GameFileIo = {
    ...nodeGameFileIo,
    replace: (path, bytes) => nodeGameFileIo.replace(path, ++calls === 1 ? Buffer.from(bytes.toString('latin1').replace('E13', 'E99'), 'latin1') : bytes)
  }
  assert.deepEqual(await f.send(SET_A, { io: garbles }), { ok: false, reason: 'verify-failed', putBack: true, backup: ORIGINAL })
  assert.equal(calls, 2)
  assert.equal(f.bytes(INI).equals(first), true)
  assert.equal(f.bytes(ORIGINAL).equals(first), true)

  // The put-back fails too: the answer names the copy that holds the good file.
  const g = fixture(t)
  const good = g.bytes(INI)
  let tries = 0
  const stuck: GameFileIo = {
    ...nodeGameFileIo,
    replace: (path) => (++tries === 1 ? nodeGameFileIo.replace(path, Buffer.from('torn')) : Promise.reject(new Error('EPERM')))
  }
  assert.deepEqual(await g.send(SET_A, { io: stuck }), { ok: false, reason: 'verify-failed', putBack: false, backup: ORIGINAL })
  assert.equal(g.bytes(ORIGINAL).equals(good), true)
})

test('an older copy that will not delete is a note, not a failed send', async (t) => {
  const f = fixture(t)
  await f.send(SET_A)
  f.at('2026-11-20T14:30:15')
  await f.send(SET_B)
  f.at('2026-11-21T08:00:00')
  const locked: GameFileIo = { ...nodeGameFileIo, remove: () => Promise.reject(new Error('EBUSY')) }
  assert.deepEqual(await f.send(SET_A, { io: locked }), { ok: true, backup: LAST_2, removed: [], note: `An older copy could not be removed: ${LAST_1}` })
  assert.deepEqual(copies(f.folder), [LAST_1, LAST_2, ORIGINAL])
  assert.equal((await listBackups({ folder: f.folder, file: INI })).last?.name, LAST_2)
})

test('restore the original: the whole first file is back, and the restore can be undone', async (t) => {
  const f = fixture(t)
  const first = f.bytes(INI)
  await f.send(SET_A)
  f.at('2026-11-20T14:30:15')
  // A change outside the section, as the game would make: a restore puts the whole file back.
  writeFileSync(join(f.folder, INI), Buffer.from(TEXT_A.replace('E13', 'E14'), 'latin1'))
  const edited = f.bytes(INI)

  assert.deepEqual(await restoreBackup({ folder: f.folder, file: INI, which: 'original' }, f.deps), { ok: true, backup: LAST_1, removed: [] })
  assert.equal(f.bytes(INI).equals(first), true)
  assert.equal(f.bytes(LAST_1).equals(edited), true)
  assert.equal(f.bytes(ORIGINAL).equals(first), true)

  f.at('2026-11-21T08:00:00')
  assert.deepEqual(await restoreBackup({ folder: f.folder, file: INI, which: 'last' }, f.deps), { ok: true, backup: LAST_2, removed: [LAST_1] })
  assert.equal(f.bytes(INI).equals(edited), true)
  assert.equal(f.bytes(LAST_2).equals(first), true)
  assert.deepEqual(copies(f.folder), [LAST_2, ORIGINAL])
  assert.equal(f.bytes(ORIGINAL).equals(first), true)
  assertBystanders(f)
})

test('restore the last copy: the send before it is undone, then redone', async (t) => {
  const f = fixture(t)
  await f.send(SET_A)
  const withA = f.bytes(INI)
  f.at('2026-11-20T14:30:15')
  await f.send(SET_B)
  const withB = f.bytes(INI)

  f.at('2026-11-21T08:00:00')
  assert.deepEqual(await restoreBackup({ folder: f.folder, file: INI, which: 'last' }, f.deps), { ok: true, backup: LAST_2, removed: [LAST_1] })
  assert.equal(f.bytes(INI).equals(withA), true)
  f.at('2026-11-21T08:00:01')
  assert.equal((await restoreBackup({ folder: f.folder, file: INI, which: 'last' }, f.deps)).ok, true)
  assert.equal(f.bytes(INI).equals(withB), true)
  assert.equal(copies(f.folder).length, 2)
})

test('a restore that fails its check keeps the copy it was restoring from', async (t) => {
  const f = fixture(t)
  await f.send(SET_A)
  const withA = f.bytes(INI)
  f.at('2026-11-20T14:30:15')
  await f.send(SET_B)
  const withB = f.bytes(INI)
  f.at('2026-11-21T08:00:00')
  let calls = 0
  const garbles: GameFileIo = { ...nodeGameFileIo, replace: (path, bytes) => nodeGameFileIo.replace(path, ++calls === 1 ? Buffer.from('torn') : bytes) }
  const result = await restoreBackup({ folder: f.folder, file: INI, which: 'last' }, { ...f.deps, io: garbles })
  assert.deepEqual(result, { ok: false, reason: 'verify-failed', putBack: true, backup: LAST_2 })
  assert.equal(f.bytes(INI).equals(withB), true)
  assert.equal(f.bytes(LAST_1).equals(withA), true)
  assert.deepEqual(copies(f.folder), [LAST_1, LAST_2, ORIGINAL])
})

test('restore refused, and the folder is byte for byte as it was', async (t) => {
  const f = fixture(t)
  const none = snapshot(f.root)
  assert.deepEqual(await restoreBackup({ folder: f.folder, file: INI, which: 'original' }, f.deps), { ok: false, reason: 'no-backup' })
  assert.deepEqual(snapshot(f.root), none)

  await f.send(SET_A)
  const before = snapshot(f.root)
  const reason = async (req: Partial<Parameters<typeof restoreBackup>[0]>, extra: Partial<GameFileDeps> = {}): Promise<string> => {
    const result = await restoreBackup({ folder: f.folder, file: INI, which: 'original', ...req }, { ...f.deps, ...extra })
    assert.deepEqual(snapshot(f.root), before)
    return result.ok ? 'ok' : result.reason
  }
  assert.equal(await reason({}, { isGameRunning: () => Promise.resolve(true) }), 'game-running')
  assert.equal(await reason({}, { isGameRunning: () => Promise.reject(new Error('no list')) }), 'game-unknown')
  assert.equal(await reason({ which: 'last' }), 'no-backup')
  for (const file of ['UI_Drywrought_oggok_LO1.ini', '..\\Evil_oggok_LO1.ini', ORIGINAL, 'Other_oggok_LO1.ini.companion-original-2026-01-01.bak']) {
    assert.equal(await reason({ file }), 'not-a-character-file', file)
  }
  // Another character's file has no copy of its own: this file's copies are not offered to it.
  assert.equal(await reason({ file: 'Other_oggok_LO1.ini' }), 'no-backup')
  const noCopy: GameFileIo = { ...nodeGameFileIo, createNew: () => Promise.reject(new Error('ENOSPC')) }
  assert.equal(await reason({}, { io: noCopy }), 'backup-failed')

  // Already the copy: nothing to do, nothing written.
  writeFileSync(join(f.folder, INI), f.bytes(ORIGINAL))
  const same = snapshot(f.root)
  assert.deepEqual(await restoreBackup({ folder: f.folder, file: INI, which: 'original' }, f.deps), { ok: false, reason: 'already-same' })
  assert.deepEqual(snapshot(f.root), same)
})

test('the process list: the game by its image name, and no answer from a list without this process', () => {
  const rows = ['"System Idle Process","0","Services","0","8 K"', '"node.exe","4242","Console","1","61,000 K"', '']
  assert.equal(gameInTaskList(rows.join('\r\n'), 4242), false)
  assert.equal(gameInTaskList(['"EQGame.exe","9000","Console","1","900,000 K"', ...rows].join('\r\n'), 4242), true)
  assert.equal(gameInTaskList([...rows, '"eqgame.exe","9000","Console","1","900,000 K"'].join('\n'), 1), true)
  assert.equal(gameInTaskList('"not eqgame.exe","9000","Console","1","1 K"\r\n"node.exe","4242","Console","1","1 K"', 4242), false)
  assert.equal(gameInTaskList(rows.join('\r\n'), 1), null)
  assert.equal(gameInTaskList('', 4242), null)
  assert.equal(gameInTaskList('INFO: No tasks are running which match the specified criteria.', 4242), null)
  assert.equal(gameInTaskList('ERROR: The RPC server is unavailable.', 4242), null)
})

test('the process list on this machine holds this process', { skip: process.platform !== 'win32' }, async () => {
  assert.equal(typeof (await isGameRunningNow(60_000)), 'boolean')
})
