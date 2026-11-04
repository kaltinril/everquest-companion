// A private instance's stay is tagged `[instance N]` by the respawn fold (owner, 2026-11-03); the
// zone lookups read through the tag, and the respawn scoping keeps it apart from the open world.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoneKey, zoneShortName } from '../src/shared/zones.ts'
import { respawnInZone } from '../src/shared/respawn.ts'

test('the instance tag is not part of the zone', () => {
  assert.equal(zoneKey('Lake Nerius 4 (Refined) [instance 17]'), zoneKey('Lake Nerius'))
  assert.equal(zoneShortName('Lake Nerius 4 (Refined) [instance 17]'), zoneShortName('Lake Nerius 4 (Refined)'))
})

test('the Timers scope keeps the instance and the open world apart', () => {
  const rows = [{ zone: 'Lake Nerius 4 (Refined)' }, { zone: 'Lake Nerius 4 (Refined) [instance 17]' }]
  assert.deepEqual(respawnInZone(rows, 'Lake Nerius 4 (Refined) [instance 17]'), [rows[1]])
  assert.deepEqual(respawnInZone(rows, 'Lake Nerius 4 (Refined)'), [rows[0]])
})
