// An app-signal alert (Bazaar match, respawn ending, raid target, Sky quest) records its fires.
//
// Only the renderer can detect these signals and the engine has no command to take one, so the
// alert played and "Recent fires" had nothing to show. Main now holds them for the launch, and the
// Alerts tab reads them beside the engine's own history.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP_FIRE_CAP, createAppFireLog, withAppFires } from '../src/shared/alertAppFires'

const src = (rel: string): string => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8')

function log(known: string[] = ['respawn-soon']): { fires: ReturnType<typeof createAppFireLog>; at: { ms: number } } {
  const at = { ms: 1000 }
  return { fires: createAppFireLog((id) => known.includes(id), () => at.ms), at }
}

test('a fire is recorded with its time and its words, newest last', () => {
  const { fires, at } = log()
  assert.equal(fires.record({ alertId: 'respawn-soon', context: 'Enynti' }), true)
  at.ms = 2000
  fires.record({ alertId: 'respawn-soon', context: 'Gnasher' })
  assert.deepEqual(fires.history(), {
    'respawn-soon': [
      { ts: 1000, matchedText: 'Enynti' },
      { ts: 2000, matchedText: 'Gnasher' }
    ]
  })
})

test('the ring keeps the engine history length, dropping the oldest', () => {
  const { fires, at } = log()
  for (let i = 0; i < APP_FIRE_CAP + 5; i++) {
    at.ms = i
    fires.record({ alertId: 'respawn-soon', context: String(i) })
  }
  const ring = fires.history()['respawn-soon']
  assert.equal(ring.length, APP_FIRE_CAP)
  assert.equal(ring[0].matchedText, '5')
  assert.equal(ring[ring.length - 1].matchedText, String(APP_FIRE_CAP + 4))
})

test('what the renderer sends is checked: only a known alert, and text of a sane length', () => {
  const { fires } = log()
  for (const bad of [null, undefined, 'x', {}, { alertId: 7 }, { alertId: 'not-an-alert', context: 'x' }, { alertId: '__proto__' }]) {
    assert.equal(fires.record(bad), false)
  }
  assert.deepEqual(fires.history(), {})
  fires.record({ alertId: 'respawn-soon', context: 'y'.repeat(5000) })
  fires.record({ alertId: 'respawn-soon', context: 42 })
  const ring = fires.history()['respawn-soon']
  assert.ok(ring[0].matchedText.length <= 300)
  assert.equal(ring[1].matchedText, '')
})

test('an alert id named like an object key is a plain key', () => {
  const { fires } = log(['__proto__', 'constructor'])
  assert.equal(fires.record({ alertId: 'constructor', context: 'a' }), true)
  assert.equal(fires.record({ alertId: '__proto__', context: 'b' }), true)
  const held = fires.history()
  assert.equal(Object.getPrototypeOf(held), Object.prototype)
  assert.deepEqual(Object.keys(held).sort(), ['__proto__', 'constructor'])
})

test('the tab shows both histories in time order, capped', () => {
  const engine = { a: [{ ts: 2, matchedText: 'engine' }], b: [{ ts: 9, matchedText: 'log alert' }] }
  const merged = withAppFires(engine, { a: [{ ts: 1, matchedText: 'early' }, { ts: 3, matchedText: 'late' }] })
  assert.deepEqual(merged.a.map((f) => f.matchedText), ['early', 'engine', 'late'])
  assert.equal(merged.b, engine.b, 'an alert with no app fire is untouched')
  const many = Array.from({ length: APP_FIRE_CAP }, (_, i) => ({ ts: i + 100, matchedText: 'app' }))
  assert.equal(withAppFires({ a: [{ ts: 1, matchedText: 'old' }] }, { a: many }).a.length, APP_FIRE_CAP)
})

test('with no app fire the engine history is handed back as it came', () => {
  const engine = { a: [{ ts: 2, matchedText: 'x' }] }
  assert.equal(withAppFires(engine, {}), engine)
})

test('the channel records, tells the window, and the Alerts tab reads it', () => {
  const ipc = src('main/ipc/alerts.ts')
  const handler = ipc.slice(ipc.indexOf('ipcMain.on(IPC.appFired'), ipc.indexOf('IPC.feedReport'))
  assert.match(handler, /appFires\.record\(payload\)/)
  assert.match(handler, /sendToMain\(IPC\.onAppFires, appFires\.history\(\)\)/)
  assert.match(ipc, /ipcMain\.handle\(IPC\.getAppFires, \(\) => appFires\.history\(\)\)/)
  const store = src('renderer/src/features/alerts/useAlertsStore.ts')
  assert.match(store, /withAppFires\(snap\?\.history \?\? NO_HISTORY, appFires\)/)
  assert.match(store, /window\.eq\.getAppFires\(\)/)
  assert.match(store, /window\.eq\.onAppFires\(setAppFires\)/)
})
