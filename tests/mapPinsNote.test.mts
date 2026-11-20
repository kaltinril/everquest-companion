// The Map pins overlay on a zone change (bug hunt, 2026-11-19): the map it holds is the answer for
// ONE zone, and until the new zone's answer lands it draws no other zone's map and says nothing
// about a missing one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { MapData } from '../src/shared/maps'
import { emptyNote, heldMapFor, mapLoading } from '../src/renderer/src/overlay/mapPinsNote'

const QEYNOS = { zone: 'qeynos' } as unknown as MapData
const NO_MAP = 'No map for this zone - install a map pack, or open it on the Maps tab.'

test('the held map is drawn only in the zone it was asked for', () => {
  const held = { zone: 'qeynos', data: QEYNOS }
  assert.equal(heldMapFor(held, 'qeynos'), QEYNOS)
  // Zoned to North Qeynos and its answer has not landed: South Qeynos's lines are not its map.
  assert.equal(heldMapFor(held, 'qeynos2'), null)
  assert.equal(heldMapFor(held, null), null)
  assert.equal(heldMapFor(null, 'qeynos'), null)
})

test('the map is loading until an answer for this zone is held, a no-map answer included', () => {
  assert.equal(mapLoading(null, 'qeynos'), true)
  assert.equal(mapLoading({ zone: 'qeynos', data: QEYNOS }, 'qeynos2'), true)
  assert.equal(mapLoading({ zone: 'qeynos', data: QEYNOS }, 'qeynos'), false)
  assert.equal(mapLoading({ zone: 'qeynos2', data: null }, 'qeynos2'), false)
  assert.equal(mapLoading(null, null), false, 'no zone, nothing asked')
})

test('the overlay does not say "No map" while the map is still loading', () => {
  assert.equal(emptyNote('qeynos2', undefined, true), null)
  assert.equal(emptyNote('qeynos2', undefined, false), NO_MAP)
  assert.equal(emptyNote(null, undefined, false), 'Waiting for the log to name your zone.')
  assert.equal(emptyNote(null, undefined, true), 'Waiting for the log to name your zone.')
  const ext = { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  assert.equal(emptyNote('qeynos', ext, false), null)
  assert.equal(emptyNote('qeynos', ext, true), null)
})

test('the overlay`s map hook answers through these rules', () => {
  const src = readFileSync(new URL('../src/renderer/src/overlay/useMapPinsData.ts', import.meta.url), 'utf8')
  assert.match(src, /data: heldMapFor\(held, zone\), loading: mapLoading\(held, zone\)/)
})
