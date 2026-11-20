// The renderer's held pulls let go when their source moves (src/shared/heldPull.ts).
//
// THE DEFECT: the Spells and Leveling tabs pull the unlock dataset once per window and keep it.
// Main folds the player's own spells_us.txt into that dataset, so when the EverQuest folder was
// set after the first pull, every tab kept the dataset built without the game's file until
// restart. The pull is now dropped when main says the folder changed, and mounted views ask again.

import test from 'node:test'
import assert from 'node:assert/strict'
import { heldPull } from '../src/shared/heldPull'

/** A counting pull over answers handed out in order, and the stale signal the helper subscribed to. */
function rig(answers: (string | Error)[]): {
  held: ReturnType<typeof heldPull<string>>
  calls: () => number
  goStale: () => void
} {
  let calls = 0
  let signal: (() => void) | null = null
  const held = heldPull<string>({
    pull: () => {
      const next = answers[calls++]
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    },
    empty: 'empty',
    staleOn: (cb) => {
      signal = cb
    }
  })
  return { held, calls: () => calls, goStale: () => signal?.() }
}

test('one pull is shared, and its answer is held', async () => {
  const { held, calls } = rig(['X', 'Y'])
  assert.equal(held.landed(), null)
  const first = held.get()
  assert.equal(held.get(), first)
  assert.equal(await first, 'X')
  assert.equal(await held.get(), 'X')
  assert.equal(held.landed(), 'X')
  assert.equal(calls(), 1)
})

test('after the source says it changed, the next ask pulls again', async () => {
  const { held, calls, goStale } = rig(['X', 'Y'])
  assert.equal(await held.get(), 'X')
  goStale()
  assert.equal(held.landed(), 'X', 'the old answer stays on screen until the new one lands')
  assert.equal(await held.get(), 'Y')
  assert.equal(held.landed(), 'Y')
  assert.equal(calls(), 2)
})

test('a mounted reader is told, and can stop listening', async () => {
  const { held, goStale } = rig(['X', 'Y', 'Z'])
  await held.get()
  let told = 0
  const stop = held.onStale(() => told++)
  goStale()
  assert.equal(told, 1)
  stop()
  goStale()
  assert.equal(told, 1)
})

test('a pull overtaken by a change answers with the newer pull', async () => {
  const { held, calls, goStale } = rig(['X', 'Y'])
  const early = held.get()
  goStale()
  const late = held.get()
  assert.equal(await early, 'Y', 'no reader is left holding the answer from before the change')
  assert.equal(await late, 'Y')
  assert.equal(held.landed(), 'Y')
  assert.equal(calls(), 2)
})

test('a failed pull is the empty answer, never a throw', async () => {
  const { held, calls } = rig([new Error('ipc')])
  assert.equal(await held.get(), 'empty')
  assert.equal(await held.get(), 'empty')
  assert.equal(calls(), 1)
})
