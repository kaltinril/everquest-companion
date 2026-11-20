// useHeldFor (fork #9, phase R3): a tab's status line is held back for a moment, timed from when
// its module began having no snapshot, so a rebuild that empties a tab for an instant shows nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useHeldFor } from '../src/renderer/src/lib/useHeldFor'

test('true only once the state has held for the whole time', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = mountHook(() => useHeldFor(true, 1_500))
  assert.equal(host.value, false)
  t.mock.timers.tick(1_499)
  assert.equal(host.render(), false)
  t.mock.timers.tick(1)
  assert.equal(host.render(), true)
  host.unmount()
})

test('A STATE THAT ENDS AND BEGINS AGAIN IS TIMED FROM ITS NEW BEGINNING', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let active = true
  const host = mountHook(() => useHeldFor(active, 1_500))
  t.mock.timers.tick(1_500)
  assert.equal(host.render(), true)

  // Served: the line goes at once.
  active = false
  assert.equal(host.render(), false)
  // No snapshot again (a rebuild): the wait starts over, it is not already spent.
  active = true
  assert.equal(host.render(), false, 'a rebuild flashed the line because an earlier wait had run out')
  t.mock.timers.tick(1_000)
  assert.equal(host.render(), false)
  t.mock.timers.tick(500)
  assert.equal(host.render(), true)
  host.unmount()
})

test('a state that never held leaves no timer behind, and nothing fires after unmount', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const idle = mountHook(() => useHeldFor(false, 1_500))
  t.mock.timers.tick(10_000)
  assert.equal(idle.render(), false)
  idle.unmount()

  const gone = mountHook(() => useHeldFor(true, 1_500))
  gone.unmount()
  assert.doesNotThrow(() => t.mock.timers.tick(5_000))
})
