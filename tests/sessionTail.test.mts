// TAILING A CHARACTER WHEN THE SETTINGS FILE CANNOT BE WRITTEN (fork #9, phase R4):
// `src/main/sessionTail.ts`, the seam `session.ts tailCharacter` goes through.
//
// The settings write of an attach threw (disk full, config.json read-only or held by another
// program) and `tailCharacter` rejected before it signalled that the world was rebuilt. The engine
// attached anyway through its fallback target and went live; the app never learned its own world
// had landed, and no read was ever served. `session.ts` imports Electron, so the two halves are
// handed in here, and that `tailCharacter` uses the seam is read from its source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { storeThenSignal } from '../src/main/sessionTail'

test('A THROWING STORE WRITE STILL SENDS THE WORLD-REBUILT SIGNAL, and the error is said, not thrown', () => {
  const order: string[] = []
  const failures: unknown[] = []
  const diskFull = Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
  assert.doesNotThrow(() => {
    storeThenSignal({
      store: () => {
        order.push('store')
        throw diskFull
      },
      signal: () => order.push('signal'),
      failed: (err) => failures.push(err)
    })
  })
  assert.deepEqual(order, ['store', 'signal'])
  assert.deepEqual(failures, [diskFull])
})

test('a store that works is followed by one signal and says nothing', () => {
  const order: string[] = []
  storeThenSignal({
    store: () => order.push('store'),
    signal: () => order.push('signal'),
    failed: () => order.push('failed')
  })
  assert.deepEqual(order, ['store', 'signal'], 'the windows are told after the character is on record')
})

test('`tailCharacter` GOES THROUGH THE SEAM, and calls neither half beside it', () => {
  const source = readFileSync(new URL('../src/main/session.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const start = source.indexOf('export async function tailCharacter(ref: CharacterRef): Promise<boolean> {')
  assert.ok(start >= 0, 'tailCharacter is gone')
  const tail = source.slice(start, source.indexOf('\n}', start))
  assert.match(tail, /const store = \(\): void => \{\s*batchStore\(\(\) => \{\s*attachCharacter\(ref\)/)
  assert.match(tail, /const signal = \(\): void => \{\s*sendWorldRebuilt\(ref\)/)
  assert.match(tail, /storeThenSignal\(\{\s*store,\s*signal,\s*failed: \(err\) => \{\s*logError\('main:attachCharacter', err\)/)
  // A bare `batchStore` beside the seam would throw past the signal again.
  assert.equal((tail.match(/batchStore\(/g) ?? []).length, 1)
  assert.equal((tail.match(/sendWorldRebuilt\(ref\)/g) ?? []).length, 1)
})

test('a signal that throws is not swallowed: only the store is allowed to fail', () => {
  assert.throws(
    () => {
      storeThenSignal({
        store: () => undefined,
        signal: () => {
          throw new Error('the window is gone')
        },
        failed: () => undefined
      })
    },
    /the window is gone/
  )
})
