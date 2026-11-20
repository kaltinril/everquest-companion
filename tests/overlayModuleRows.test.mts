// useOverlayModule, across a world change and a character switch (fork #9, phase R3). An overlay
// outlives a character switch, and a re-ask that came back with no snapshot used to leave the
// previous character's rows on screen. The hook runs for real on `hookHost`, over a fake bridge.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook, type HookHost } from './hookHost.mjs'
import { useOverlayModule } from '../src/renderer/src/overlay/useOverlayModule'
import { MODULE_WORLD_CHANGED, type CharacterRef, type ModuleChanged } from '../src/shared/types'

type Rows = readonly string[]
const EMPTY: Rows = []
const LOG_A = 'C:\\EQ\\Logs\\eqlog_Aye_freeport.txt'
const LOG_B = 'C:\\EQ\\Logs\\eqlog_Bee_freeport.txt'

function who(logPath: string): CharacterRef {
  return { name: 'x', server: 'freeport', logPath }
}

/** Let every settled promise run its continuations. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

interface Rig {
  readonly host: HookHost<Rows>
  /** Every snapshot ask still unanswered, oldest first. */
  readonly asks: ((snap: { seq: number; state: Rows } | null) => Promise<void>)[]
  changed(c: ModuleChanged): void
  character(c: CharacterRef | null): void
  rows(): Rows
}

/** Mount the hook for `rows` over a bridge that says the active log is `logFile` (null: no answer). */
function rig(logFile: string | null): Rig {
  const asks: Rig['asks'] = []
  let onChanged: (c: ModuleChanged) => void = () => undefined
  let onCharacter: (c: CharacterRef | null) => void = () => undefined
  const eqOverlay = {
    getModuleSnapshot: () =>
      new Promise((resolve) => {
        asks.push(async (snap) => {
          resolve(snap)
          await settle()
        })
      }),
    onModuleChanged: (cb: (c: ModuleChanged) => void) => {
      onChanged = cb
      return () => undefined
    },
    onCharacter: (cb: (c: CharacterRef | null) => void) => {
      onCharacter = cb
      return () => undefined
    },
    logReadReport: () => (logFile === null ? Promise.reject(new Error('no handler')) : Promise.resolve({ logFile }))
  }
  ;(globalThis as { window?: unknown }).window = { eqOverlay }
  const host = mountHook(() => useOverlayModule<Rows>('rows', EMPTY))
  return {
    host,
    asks,
    changed: (c) => {
      onChanged(c)
    },
    character: (c) => {
      onCharacter(c)
    },
    rows: () => host.render()
  }
}

/** Answer the oldest unanswered ask. */
async function answer(r: Rig, snap: { seq: number; state: Rows } | null): Promise<void> {
  const next = r.asks.shift()
  assert.ok(next, 'nothing was asked')
  await next(snap)
}

async function mounted(logFile: string | null, state: Rows): Promise<Rig> {
  const r = rig(logFile)
  await settle()
  await answer(r, { seq: 5, state })
  assert.deepEqual(r.rows(), state)
  return r
}

test('ANOTHER CHARACTER-S ROWS COME DOWN AT ONCE, before the re-ask is answered', async () => {
  const r = await mounted('eqlog_Aye_freeport.txt', ['a1', 'a2'])
  r.character(who(LOG_B))
  assert.deepEqual(r.rows(), EMPTY, 'the previous character-s rows stayed up while the new log was asked for')
  // The new log is still being read: no snapshot, and still nothing of the last character.
  await answer(r, null)
  assert.deepEqual(r.rows(), EMPTY)
  // It went live: the world-changed frame brings the new character's rows.
  r.changed({ moduleId: MODULE_WORLD_CHANGED, seq: -1 })
  await answer(r, { seq: 1, state: ['b1'] })
  assert.deepEqual(r.rows(), ['b1'])
  r.host.unmount()
})

test('no character at all takes the rows down too', async () => {
  const r = await mounted('eqlog_Aye_freeport.txt', ['a1'])
  r.character(null)
  assert.deepEqual(r.rows(), EMPTY)
  r.host.unmount()
})

test('A REPLY ASKED BEFORE THE SWITCH IS DROPPED: it is of the character this window has left', async () => {
  const r = await mounted('eqlog_Aye_freeport.txt', ['a1'])
  // A cursor re-ask is out when the switch lands.
  r.changed({ moduleId: 'rows', seq: 6 })
  r.character(who(LOG_B))
  assert.equal(r.asks.length, 2)
  await answer(r, { seq: 6, state: ['a1', 'a2'] })
  assert.deepEqual(r.rows(), EMPTY, 'a late reply put the previous character-s rows back')
  await answer(r, { seq: 1, state: ['b1'] })
  assert.deepEqual(r.rows(), ['b1'])
  // The new world's cursors start over: one below the old world's is still news.
  r.changed({ moduleId: 'rows', seq: 2 })
  await answer(r, { seq: 2, state: ['b1', 'b2'] })
  assert.deepEqual(r.rows(), ['b1', 'b2'])
  r.host.unmount()
})

test('A REBUILD OF THE SAME LOG KEEPS THE ROWS: no flash of an empty overlay', async () => {
  const r = await mounted('eqlog_Aye_freeport.txt', ['a1', 'a2'])
  r.character(who(LOG_A))
  assert.deepEqual(r.rows(), ['a1', 'a2'])
  // The engine is "not live" for the instant of the rebuild: no snapshot, and the rows stay.
  await answer(r, null)
  assert.deepEqual(r.rows(), ['a1', 'a2'], 'an ordinary rebuild emptied the overlay')
  r.changed({ moduleId: MODULE_WORLD_CHANGED, seq: -1 })
  await answer(r, { seq: 9, state: ['a1', 'a2', 'a3'] })
  assert.deepEqual(r.rows(), ['a1', 'a2', 'a3'])
  // A second rebuild is known to be the same log from the first frame, with no ask of main.
  r.character(who(LOG_A))
  await answer(r, null)
  assert.deepEqual(r.rows(), ['a1', 'a2', 'a3'])
  r.host.unmount()
})

test('THE WORLD CHANGED AND THERE IS NO SNAPSHOT: the rows go, the engine that held them is gone', async () => {
  const r = await mounted('eqlog_Aye_freeport.txt', ['a1'])
  r.changed({ moduleId: MODULE_WORLD_CHANGED, seq: -1 })
  assert.deepEqual(r.rows(), ['a1'], 'held until the answer: an engine that went live answers with rows')
  await answer(r, null)
  assert.deepEqual(r.rows(), EMPTY, 'rows nobody is serving stayed up with nothing saying so')
  r.host.unmount()
})

test('a window that was never told which log is active treats the first frame as a switch', async () => {
  const r = await mounted(null, ['a1'])
  r.character(who(LOG_B))
  // Not known to be another log, so nothing is taken down before the answer...
  assert.deepEqual(r.rows(), ['a1'])
  // ...but no snapshot is not allowed to leave rows that may be the last character's.
  await answer(r, null)
  assert.deepEqual(r.rows(), EMPTY)
  r.host.unmount()
})

test('a cursor re-ask that comes back with no snapshot changes nothing', async () => {
  const r = await mounted('eqlog_Aye_freeport.txt', ['a1'])
  r.changed({ moduleId: 'rows', seq: 6 })
  await answer(r, null)
  assert.deepEqual(r.rows(), ['a1'])
  r.host.unmount()
})
