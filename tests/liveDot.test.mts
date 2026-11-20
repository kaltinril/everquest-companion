// The title-bar dot (fork #9, phase R3). It was lit by ANY module frame, the world-changed frame
// included, so it went green the moment the engine went live or went away, and it stayed green
// over a read that had stopped. It means "the log moved, and the read is fine".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { dotAllowed, lightsDot, useDotLit, type LiveDotBridge } from '../src/renderer/src/lib/useLiveDot'
import { MODULE_WORLD_CHANGED, type ModuleChanged } from '../src/shared/types'
import { error, health, report } from './logReadFactsHarness.mts'

const LIVE = { readiness: 'ok', health: health('live') }

test('the world-changed frame does not light the dot; a module-s cursor does', () => {
  assert.equal(lightsDot(MODULE_WORLD_CHANGED), false)
  assert.equal(lightsDot('loot'), true)
})

test('THE DOT IS OFF WHENEVER THE STATUS WAIT IS NOT OK, and an unknown status does not turn it off', () => {
  assert.equal(dotAllowed(report(LIVE)), true)
  assert.equal(dotAllowed(null), true, 'a window with no status yet lost its dot')
  assert.equal(dotAllowed(report()), false)
  assert.equal(dotAllowed(report({ health: health('idle'), error: error('fold') })), false)
  assert.equal(dotAllowed(report({ supervisor: 'absent' })), false)
  // A slow panel is not "ok" either, shown yet or not.
  const slow = { key: 'fight', unserved: 'slow', why: 'timedOut', code: null, at: 1_800_000_000_000, since: 1_800_000_000_000 }
  assert.equal(dotAllowed(report({ ...LIVE, combatReads: [slow] })), false)
})

interface Rig {
  readonly bridge: LiveDotBridge
  changed(c: ModuleChanged): void
  character(): void
  readonly released: string[]
}

function rig(): Rig {
  let onChanged: (c: ModuleChanged) => void = () => undefined
  let onCharacter: () => void = () => undefined
  const released: string[] = []
  return {
    bridge: {
      onModuleChanged: (cb) => {
        onChanged = cb
        return () => released.push('changed')
      },
      onCharacter: (cb) => {
        onCharacter = () => {
          cb(null)
        }
        return () => released.push('character')
      }
    },
    changed: (c) => {
      onChanged(c)
    },
    character: () => {
      onCharacter()
    },
    released
  }
}

test('GOING LIVE DOES NOT LIGHT THE DOT; THE NEXT LINE OF THE LOG DOES', () => {
  const r = rig()
  const host = mountHook(() => useDotLit(r.bridge, true))
  assert.equal(host.value.live, false)
  host.act(() => {
    r.changed({ moduleId: MODULE_WORLD_CHANGED, seq: -1 })
  })
  assert.equal(host.value.live, false, 'the engine going live (or away) lit the dot')
  host.act(() => {
    r.changed({ moduleId: 'loot', seq: 4 })
  })
  assert.equal(host.value.live, true)
  // A rebuilt world has proven nothing yet.
  host.act(() => {
    r.character()
  })
  assert.equal(host.value.live, false)
  host.unmount()
  assert.deepEqual(r.released.sort(), ['changed', 'character'])
})

test('A READ THAT STOPS BEING FINE TURNS THE DOT OFF, and it needs a new line to come back', () => {
  const r = rig()
  let allowed = true
  const host = mountHook(() => useDotLit(r.bridge, allowed))
  host.act(() => {
    r.changed({ moduleId: 'loot', seq: 4 })
  })
  assert.equal(host.value.live, true)

  allowed = false
  assert.equal(host.render().live, false, 'the dot stayed green over a read that stopped')
  // Fine again: what was seen before the trouble says nothing about now.
  allowed = true
  assert.equal(host.render().live, false, 'the dot came back with no line of the log behind it')
  host.act(() => {
    r.changed({ moduleId: 'kills', seq: 9 })
  })
  assert.equal(host.value.live, true)
  host.unmount()
})

test('the title bar-s own switch clears it at once', () => {
  const r = rig()
  const host = mountHook(() => useDotLit(r.bridge, true))
  host.act(() => {
    r.changed({ moduleId: 'loot', seq: 4 })
  })
  host.act(() => {
    host.value.clear()
  })
  assert.equal(host.value.live, false)
  host.unmount()
})
