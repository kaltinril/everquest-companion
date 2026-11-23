// One save attempt of the attached character's Gaps inputs (src/main/gapsCharacterSave.ts): what it
// reads, when it writes, and that a save that did not land is owed again on the next tick.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapsSaver, type SaveDeps } from '../src/main/gapsCharacterSave'
import { noteModuleMoved, takeMoved } from '../src/main/gapSourceMoves'
import { beginSwitch, leaveLog, setBeforeSwitch, type SwitchTurn } from '../src/main/switchController'
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

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined)
const turnOf = (superseded: Promise<void> = never()): SwitchTurn => ({ gen: 1, owns: () => true, superseded })

test('LEAVING saves what is owed, and a character never saved before is saved with no cursor moved', async () => {
  const { state, save } = rig()
  await save.leaving(1_000)
  assert.equal(state.written.length, 1)
  await save.leaving(1_000)
  assert.equal(state.written.length, 1, 'nothing moved since: no second write')
  play(state)
  await save.leaving(1_000)
  assert.equal(state.written.length, 2)
})

test('LEAVING waits out a tick already saving, then saves what moved during it', async () => {
  let release = (): void => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = true
  const { state, save } = rig({
    readModule: async (module) => {
      if (held) await gate
      return { seq: state.seq, state: { module } }
    }
  })
  const tick = save()
  play(state)
  const out = save.leaving(1_000)
  held = false
  release()
  await Promise.all([tick, out])
  assert.equal(state.written.at(-1)?.modules.loot.seq, state.seq, 'the last write holds the newest seq')
})

test('LEAVING NEVER HOLDS THE WAY OUT: a hung engine ends at the limit, writes nothing late, and is owed again', async () => {
  let hung = true
  let release: (v: { seq: number; state: unknown }) => void = () => undefined
  const late = new Promise<{ seq: number; state: unknown }>((resolve) => {
    release = resolve
  })
  const { state, save } = rig({
    readModule: (module) => (hung ? late : Promise.resolve({ seq: state.seq, state: { module } }))
  })
  const t0 = Date.now()
  await save.leaving(30)
  assert.ok(Date.now() - t0 < 1_000, 'it returned at the limit')
  assert.equal(state.written.length, 0)
  assert.match(state.logged.join('\n'), /no answer within 30 ms/)
  // The answer arrives after the switch, when the engine may be another character's: not written.
  release({ seq: 99, state: {} })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state.written.length, 0)
  // The hung attempt no longer blocks saves, and what it took is owed.
  hung = false
  await save()
  assert.equal(state.written.length, 1)
})

test('LEAVING NEVER REJECTS when the save itself throws', async () => {
  const { state, save } = rig({
    ready: () => {
      throw new Error('no engine host')
    }
  })
  await save.leaving(1_000)
  assert.match(state.logged.join('\n'), /save before leaving failed: no engine host/)
})

test('THE SWITCH SLOT runs only when a log is really left', async (t) => {
  t.after(() => setBeforeSwitch(null))
  let runs = 0
  setBeforeSwitch(() => {
    runs++
    return Promise.resolve()
  })
  const failed = (): void => assert.fail('nothing failed')
  await leaveLog(turnOf(), { from: null, to: 'b.txt' }, failed)
  await leaveLog(turnOf(), { from: 'a.txt', to: 'a.txt' }, failed)
  assert.equal(runs, 0, 'no character to leave, or the same log again')
  await leaveLog(turnOf(), { from: 'a.txt', to: 'b.txt' }, failed)
  await leaveLog(turnOf(), { from: 'a.txt', to: null }, failed)
  assert.equal(runs, 2)
})

test('THE SWITCH SLOT cannot break a switch, and a superseded pick does not wait for it', async (t) => {
  t.after(() => setBeforeSwitch(null))
  const errors: unknown[] = []
  setBeforeSwitch(() => Promise.reject(new Error('disk full')))
  await leaveLog(turnOf(), { from: 'a.txt', to: 'b.txt' }, (e) => errors.push(e))
  assert.equal(errors.length, 1)
  setBeforeSwitch(() => {
    throw new Error('threw before its promise')
  })
  await leaveLog(turnOf(), { from: 'a.txt', to: 'b.txt' }, (e) => errors.push(e))
  assert.equal(errors.length, 2)

  setBeforeSwitch(never)
  const first = beginSwitch()
  const waiting = leaveLog(first, { from: 'a.txt', to: 'b.txt' }, (e) => errors.push(e))
  const second = beginSwitch()
  await waiting
  assert.equal(first.owns(), false)
  assert.equal(second.owns(), true)
  assert.equal(errors.length, 2)
})

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
