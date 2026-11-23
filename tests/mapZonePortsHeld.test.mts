// The Closest-port card's port table lets go when the EverQuest folder changes
// (src/renderer/src/features/maps/zonePortsPull.ts).
//
// Main filters the ports by the client's own spell table (`portsInClient`) and rereads that table
// after a folder change, but the card kept its first answer for the life of the window.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ZonePort } from '../src/shared/zoneTravel'

const port = (spell: string): ZonePort => ({ spell, zone: 'commons' }) as unknown as ZonePort
const OLD = [port('Circle of Commons')]
const NEW = [port('Circle of Commons'), port('Portal to Commons')]

const answers = [OLD, NEW]
let asked = 0
let folderChanged: () => void = () => undefined
;(globalThis as { window?: unknown }).window = {
  eq: {
    getZonePorts: () => Promise.resolve(answers[asked++] ?? []),
    onEqConfigChanged: (cb: () => void) => {
      folderChanged = cb
      return () => undefined
    }
  }
}

const { watchZonePorts } = await import('../src/renderer/src/features/maps/zonePortsPull')

const settled = (): Promise<void> => new Promise((r) => setImmediate(r))

test('one ask serves every card, a folder change asks again, and an unmounted card hears nothing', async () => {
  const shown: ZonePort[][] = []
  const stop = watchZonePorts((rows) => shown.push(rows))
  await settled()
  assert.deepEqual(shown, [OLD])

  const later: ZonePort[][] = []
  const stopLater = watchZonePorts((rows) => later.push(rows))
  await settled()
  assert.deepEqual(later, [OLD])
  assert.equal(asked, 1, 'a second card costs no second ask')
  stopLater()

  folderChanged()
  await settled()
  assert.equal(asked, 2, 'the folder changed, so the table is asked for again')
  assert.deepEqual(shown, [OLD, NEW], 'the mounted card takes the new answer')
  assert.deepEqual(later, [OLD], 'the unmounted one does not')
  stop()
})

test('the card reads the port table through the held pull', () => {
  const hook = readFileSync(new URL('../src/renderer/src/features/maps/useZoneTravel.ts', import.meta.url), 'utf8')
  assert.match(hook, /watchZonePorts\(setPorts\)/)
  assert.doesNotMatch(hook, /getZonePorts\(\)/)
})
