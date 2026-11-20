// The spell table follows the EverQuest folder (src/main/resist/spellTableMemo.ts).
//
// THE DEFECT: the table loaded once per app run. A player whose EverQuest folder was not found at
// launch opened a Spells tab (the load ran and found no spells_us.txt), then picked the folder in
// Preferences or typed /log on. The log attached, and the table stayed "missing" until restart:
// no durations, no stacking rows, and a note that said there was no file at the folder they had
// just picked.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spellTableIsStale, spellTableMemo, type SpellTableLoad } from '../src/main/resist/spellTableMemo'

type Table = Record<string, number>

const OLD = 'C:/Default/spells_us.txt'
const NEW = 'D:/EQ/spells_us.txt'

/** A memo over a fake disk: `files` is what exists, `root.path` is where the app is pointed. */
function rig(files: Record<string, Table>): {
  memo: ReturnType<typeof spellTableMemo<Table>>
  root: { path: string }
  loads: string[]
} {
  const root = { path: OLD }
  const loads: string[] = []
  const load = (path: string): Promise<SpellTableLoad<Table>> => {
    loads.push(path)
    return Promise.resolve(
      path in files ? { table: files[path], state: 'ok', mtimeMs: 7 } : { table: null, state: 'missing', mtimeMs: null }
    )
  }
  return { memo: spellTableMemo<Table>(() => root.path, load), root, loads }
}

test('a table that was missing is loaded once the folder is set', async () => {
  const { memo, root, loads } = rig({ [NEW]: { odium: 1 } })
  assert.equal(await memo.table(), null)
  assert.deepEqual(memo.status(), { state: 'missing', path: OLD })

  root.path = NEW
  assert.deepEqual(await memo.table(), { odium: 1 })
  assert.deepEqual(memo.status(), { state: 'ok', path: NEW })
  assert.deepEqual(memo.now(), { odium: 1 })
  assert.equal(memo.mtime(), 7)
  assert.deepEqual(loads, [OLD, NEW])
})

test('the same folder loads once, however often the table is asked for', async () => {
  const { memo, loads } = rig({ [OLD]: { odium: 1 } })
  const first = memo.table()
  assert.equal(memo.table(), first, 'a second ask while loading shares the first load')
  await first
  assert.equal(memo.table(), first)
  assert.deepEqual(loads, [OLD])
})

test('the status never pairs the old verdict with the new folder', async () => {
  const { memo, root } = rig({ [NEW]: { odium: 1 } })
  await memo.table()
  root.path = NEW
  // Nobody has asked for the table yet: "no file at D:/EQ" would be false.
  assert.deepEqual(memo.status(), { state: 'loading', path: NEW })
})

test('a move to a folder with no client file drops the old table', async () => {
  const { memo, root } = rig({ [OLD]: { odium: 1 } })
  assert.deepEqual(await memo.table(), { odium: 1 })
  root.path = NEW
  const reload = memo.table()
  assert.deepEqual(memo.now(), { odium: 1 }, 'readers keep the old table until the new load settles')
  assert.equal(await reload, null)
  assert.equal(memo.now(), null)
  assert.equal(memo.mtime(), null)
  assert.deepEqual(memo.status(), { state: 'missing', path: NEW })
})

test('a folder change during a load waits for that load, then loads again', async () => {
  const { memo, root, loads } = rig({ [NEW]: { odium: 1 } })
  const first = memo.table()
  root.path = NEW
  assert.equal(memo.table(), first, 'never two loads at once')
  assert.equal(await first, null)
  assert.deepEqual(await memo.table(), { odium: 1 })
  assert.deepEqual(loads, [OLD, NEW])
})

test('a load in flight is not restarted by a folder change, and an installed table never is', async () => {
  assert.equal(spellTableIsStale('missing', OLD, NEW), true)
  assert.equal(spellTableIsStale('ok', OLD, NEW), true)
  assert.equal(spellTableIsStale('unloadable', OLD, NEW), true)
  assert.equal(spellTableIsStale('missing', OLD, OLD), false)
  assert.equal(spellTableIsStale('loading', OLD, NEW), false)
  assert.equal(spellTableIsStale('ok', null, NEW), false)

  const { memo, root, loads } = rig({})
  memo.install({ odium: 2 }, 'unloadable')
  root.path = NEW
  assert.deepEqual(await memo.table(), { odium: 2 })
  assert.deepEqual(loads, [])
})
