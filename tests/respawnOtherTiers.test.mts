// respawnOtherTiers: the same zone's other instance tiers, for the Timers tab (owner, 2026-11-03).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { respawnInZone, respawnOtherTiers } from '../src/shared/respawn.ts'

const rows = [
  { id: '4', zone: 'Lake Nerius 4 (Refined)' },
  { id: '3', zone: 'Lake Nerius 3 (Fused)' },
  { id: '2', zone: 'Lake Nerius 2 (Adaptive)' },
  { id: 'open', zone: 'Lake Nerius' },
  { id: 'elsewhere', zone: 'Nektropos Castle 4 (Refined)' }
]

test('standing in the +4, the +3, +2 and open world are its other tiers; the +4 is not', () => {
  assert.deepEqual(respawnOtherTiers(rows, 'Lake Nerius 4 (Refined)').map((r) => r.id), ['3', '2', 'open'])
  assert.deepEqual(respawnInZone(rows, 'Lake Nerius 4 (Refined)').map((r) => r.id), ['4'])
})

test('another zone and the empty zone have no siblings here', () => {
  assert.deepEqual(respawnOtherTiers(rows, 'Nektropos Castle 3 (Fused)').map((r) => r.id), ['elsewhere'])
  assert.deepEqual(respawnOtherTiers(rows, ''), [])
})
