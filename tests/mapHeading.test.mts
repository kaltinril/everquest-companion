// The Maps tab's heading arrow (competitor-quick-wins, 2026-10-29): the bearing from the previous
// position to the current one, on the map's own axes (x right, y down); none without a move.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headingDeg } from '../src/shared/mapHeading'
import { mapFromLoc } from '../src/renderer/src/features/maps/mapGeometry'

const o = { x: 0, y: 0 }

test('the four ways on the drawn map read clockwise from its top', () => {
  assert.equal(headingDeg(o, { x: 0, y: -5 }), 0)
  assert.equal(headingDeg(o, { x: 5, y: 0 }), 90)
  assert.equal(headingDeg(o, { x: 0, y: 5 }), 180)
  assert.equal(headingDeg(o, { x: -5, y: 0 }), 270)
  assert.equal(headingDeg(o, { x: 3, y: -3 }), 45)
})

test('one position, or the same spot twice, gives no arrow', () => {
  assert.equal(headingDeg(null, o), null)
  assert.equal(headingDeg(o, null), null)
  assert.equal(headingDeg({ x: 12.34, y: -5.6 }, { x: 12.34, y: -5.6 }), null)
})

test('a /loc that grows north/south points to the top of the map', () => {
  // /loc's first number growing is north; mapFromLoc negates it, so the map's y shrinks.
  const from = mapFromLoc({ ns: 100, ew: 50, z: 0 })
  const to = mapFromLoc({ ns: 200, ew: 50, z: 0 })
  assert.equal(headingDeg(from, to), 0)
})
