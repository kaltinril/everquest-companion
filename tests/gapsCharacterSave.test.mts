// One save attempt of the attached character's Gaps inputs (src/main/gapsCharacterSave.ts): what it
// reads, when it writes, and that a save that did not land is owed again on the next tick.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapsSaver, type SaveDeps } from '../src/main/gapsCharacterSave'
import { noteModuleMoved, takeMoved } from '../src/main/gapSourceMoves'
import { GAP_SOURCE_MODULES, parseSavedGaps, type SavedGaps } from '../src/shared/gapsAllCharacters'

const KALT = { name: 'Kaltinril', server: 'oggok', logPath: 'C:/eq/Logs/eqlog_Kaltinril_oggok.txt' }

/** A saver over a stub engine and disk: what was read and written, and switches to make each step fail. */
function rig(over: Partial<SaveDeps> = {}) {
  const state = { seq: 1, reads: 0, written: [] as SavedGaps[], logged: [] as string[], engineDown: false, diskFull: false, headUnreadable: false }
  const deps: SaveDeps = {
    ready: () => true,
    active: () => KALT,
    idOf: (c) => `${c.name}_${c.server}`.toLowerCase(),
    readModule: (module) => {
      state.reads++
      return Promise.resolve(state.engineDown ? null : { seq: state.seq, state: { module } })
    },
    logIdentity: () => (state.headUnreadable ? null : { headBytes: 4, headSha256: 'abcd', firstStamp: '2026-11-19 10:00:00' }),
    write: (saved) => {
      if (state.diskFull) return Promise.reject(new Error('ENOSPC'))
      state.written.push(saved)
      return Promise.resolve()
    },
    log: (m) => state.logged.push(m),
    ...over
  }
  takeMoved(GAP_SOURCE_MODULES)
  return { state, save: gapsSaver(deps) }
}

/** The engine folded more lines: a new seq, and the cursor that says so. */
function play(state: { seq: number }): void {
  state.seq++
  noteModuleMoved('loot')
}

test('the first save writes the three modules under the character; nothing moved since is no engine read', async () => {
  const { state, save } = rig()
  await save()
  assert.equal(state.written.length, 1)
  const saved = parseSavedGaps(JSON.parse(JSON.stringify(state.written[0])))
  assert.equal(saved?.character, 'kaltinril_oggok')
  assert.deepEqual(Object.keys(saved?.modules ?? {}), [...GAP_SOURCE_MODULES])
  const reads = state.reads
  await save()
  assert.equal(state.reads, reads, 'no cursor moved: the engine is not asked')
  assert.equal(state.written.length, 1)
  play(state)
  await save()
  assert.equal(state.written.length, 2)
})

test('a cursor that moved without a new seq is read once and not written again', async () => {
  const { state, save } = rig()
  await save()
  noteModuleMoved('kills')
  await save()
  assert.equal(state.written.length, 1)
  const reads = state.reads
  await save()
  assert.equal(state.reads, reads, 'that look settled it: no read until a cursor moves again')
})

test('a save the engine did not answer is owed again on the next tick, with no new cursor move', async () => {
  const { state, save } = rig()
  await save()
  play(state)
  state.engineDown = true
  await save()
  assert.equal(state.written.length, 1)
  assert.equal(state.logged.length, 1, 'a skipped save is said in the log')
  // The player goes quiet: no cursor moves again. The next tick must still save what was played.
  state.engineDown = false
  await save()
  assert.equal(state.written.length, 2)
  assert.equal(state.written[1].modules.loot.seq, state.seq)
})

test('a save whose write failed, or whose log head could not be read, is owed again', async () => {
  const { state, save } = rig()
  await save()
  play(state)
  state.diskFull = true
  await save()
  state.diskFull = false
  state.headUnreadable = true
  await save()
  assert.equal(state.written.length, 1)
  assert.equal(state.logged.length, 2)
  state.headUnreadable = false
  await save()
  assert.equal(state.written.length, 2)
})

test('no character, an engine not live, or an unsafe id: no engine read and no write', async () => {
  for (const over of [{ active: () => null }, { ready: () => false }, { idOf: () => '../evil' }] satisfies Partial<SaveDeps>[]) {
    const { state, save } = rig(over)
    noteModuleMoved('gaps')
    await save()
    assert.equal(state.reads, 0)
    assert.equal(state.written.length, 0)
  }
})

test('a character switched away from during the read is not written under the old name', async () => {
  let active = KALT
  const { state, save } = rig({ active: () => active })
  const reading = save()
  active = { name: 'Drywrought', server: 'oggok', logPath: 'C:/eq/Logs/eqlog_Drywrought_oggok.txt' }
  await reading
  assert.equal(state.written.length, 0)
})
