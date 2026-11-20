// Which entries of a Logs folder are character logs (fork #9, phase R3), over real temp folders.
// The listing kept every NAME that looked like a log, so a folder called eqlog_A_server.txt was
// listed as a character and, when it was the newest thing in the folder, picked at launch: the
// engine could not open it and the read ended at once. Files only, as the engine's own lister
// reads it; and a log that is a symbolic link must not be lost by that rule.

import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { characterLogNames, charactersIn, isLogFileEntry, newestCharacterIn } from '../src/main/log/characterLogs'
import { readLogsDir, rootHasLogs } from '../src/main/log/discovery'

/** A temp `<root>/Logs`, removed when the test ends. */
function logsDir(t: TestContext): { root: string; logs: string } {
  const root = mkdtempSync(join(tmpdir(), 'eq-logs-'))
  const logs = join(root, 'Logs')
  mkdirSync(logs)
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })
  return { root, logs }
}

/** Write a file (or make a folder) and stamp it `ageSec` seconds old. */
function stamp(path: string, ageSec: number, folder = false): void {
  if (folder) mkdirSync(path)
  else writeFileSync(path, '[Mon Jan 01 00:00:00 2026] Welcome to EverQuest!\n')
  const at = new Date(Date.now() - ageSec * 1000)
  utimesSync(path, at, at)
}

test('A FOLDER NAMED LIKE A LOG IS NOT LISTED AND NOT CHOSEN AT LAUNCH, even as the newest entry', (t) => {
  const { root, logs } = logsDir(t)
  stamp(join(logs, 'eqlog_Real_freeport.txt'), 3_600)
  // The newest thing in the folder: by name and mtime alone it was the launch character.
  stamp(join(logs, 'eqlog_A_server.txt'), 1, true)

  assert.deepEqual(characterLogNames(logs), ['eqlog_Real_freeport.txt'])
  assert.deepEqual(charactersIn(logs).map((c) => c.name), ['Real'], 'a folder was listed as a character')
  assert.equal(newestCharacterIn(logs)?.name, 'Real', 'a folder was picked as the launch character')
  // The count Preferences and the no-logs screen print agrees with the list.
  assert.deepEqual(readLogsDir(logs), { ok: true, count: 1 })
  assert.equal(rootHasLogs(root), true)
})

test('a Logs folder holding ONLY a folder named like a log has no character logs', (t) => {
  const { root, logs } = logsDir(t)
  stamp(join(logs, 'eqlog_A_server.txt'), 1, true)
  assert.deepEqual(charactersIn(logs), [])
  assert.equal(newestCharacterIn(logs), null)
  assert.deepEqual(readLogsDir(logs), { ok: true, count: 0 })
  assert.equal(rootHasLogs(root), false, 'discovery took a folder with no log in it for an install')
})

test('the list is newest first, and other files in the folder are not characters', (t) => {
  const { logs } = logsDir(t)
  stamp(join(logs, 'eqlog_Old_freeport.txt'), 7_200)
  stamp(join(logs, 'eqlog_New_freeport.txt'), 60)
  stamp(join(logs, 'dbg.txt'), 1)
  stamp(join(logs, 'eqlog_New_freeport.txt.bak'), 1)
  assert.deepEqual(charactersIn(logs).map((c) => c.name), ['New', 'Old'])
  const newest = newestCharacterIn(logs)
  assert.equal(newest?.logPath, join(logs, 'eqlog_New_freeport.txt'))
  assert.equal(newest?.server, 'freeport')
})

test('a folder that cannot be listed has no characters, and says so without throwing', (t) => {
  const { root } = logsDir(t)
  const missing = join(root, 'Nowhere')
  assert.deepEqual(charactersIn(missing), [])
  assert.equal(newestCharacterIn(missing), null)
  assert.deepEqual(readLogsDir(missing), { ok: false, reason: 'missing' })
})

// ---- links: Dirent.isFile() is false for a symbolic link ----------------------------------------

const entry = (kind: 'file' | 'folder' | 'link'): { isFile(): boolean; isDirectory(): boolean } => ({
  isFile: () => kind === 'file',
  isDirectory: () => kind === 'folder'
})

test('A LOG THAT IS A LINK IS KEPT: a link is followed, and dropped only when it leads to a folder', () => {
  const never = (): boolean => {
    throw new Error('a plain file or folder was stat-ed again')
  }
  assert.equal(isLogFileEntry(entry('file'), never), true)
  assert.equal(isLogFileEntry(entry('folder'), never), false)
  // The listing says "link" (isFile false, isDirectory false): what it leads to decides.
  assert.equal(isLogFileEntry(entry('link'), () => true), true, 'a player whose log is a link lost it')
  assert.equal(isLogFileEntry(entry('link'), () => false), false)
  // It cannot be followed right now (the target is away): kept, as the engine keeps such a row.
  assert.equal(isLogFileEntry(entry('link'), () => null), true)
})

test('on disk: a link to a log file is listed and can be the launch character', (t) => {
  const { logs, root } = logsDir(t)
  const target = join(root, 'elsewhere.txt')
  stamp(target, 30)
  stamp(join(logs, 'eqlog_Real_freeport.txt'), 3_600)
  try {
    symlinkSync(target, join(logs, 'eqlog_Linked_freeport.txt'), 'file')
  } catch (err) {
    t.skip(`this machine will not let the test make a file link (${String((err as NodeJS.ErrnoException).code)})`)
    return
  }
  assert.deepEqual(characterLogNames(logs).sort(), ['eqlog_Linked_freeport.txt', 'eqlog_Real_freeport.txt'])
  assert.equal(newestCharacterIn(logs)?.name, 'Linked', 'the link-s own target is the newest log')
})

test('on disk: a link that leads to a FOLDER is not a log', (t) => {
  const { logs, root } = logsDir(t)
  const folder = join(root, 'SomeFolder')
  mkdirSync(folder)
  stamp(join(logs, 'eqlog_Real_freeport.txt'), 3_600)
  try {
    // A junction needs no privilege on Windows; elsewhere it is an ordinary directory link.
    symlinkSync(folder, join(logs, 'eqlog_Junction_freeport.txt'), 'junction')
  } catch (err) {
    t.skip(`this machine will not let the test make a folder link (${String((err as NodeJS.ErrnoException).code)})`)
    return
  }
  assert.deepEqual(characterLogNames(logs), ['eqlog_Real_freeport.txt'])
  assert.equal(newestCharacterIn(logs)?.name, 'Real')
})
