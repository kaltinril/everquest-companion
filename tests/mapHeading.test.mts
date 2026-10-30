// The Maps tab's heading arrow (competitor-quick-wins, 2026-10-29): the bearing from the previous
// position to the current one, on the map's own axes (x right, y down); none without a move.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headingDeg, loggedLocsIn, newestTwo } from '../src/shared/mapHeading'
import { zoneShortName } from '../src/shared/zones'
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

// ---- the marker from typed and logged /locs (owner, 2026-10-29: "whichever is newer wins") ----

const at = (ns: number, t: number): { ns: number; ew: number; z: number; at: number } => ({ ns, ew: 0, z: 0, at: t })

test('the newest two positions, whatever their source, newest first', () => {
  const typed = at(1, 500)
  const logged = [at(2, 100), at(3, 900)]
  const [now, before] = newestTwo([typed, null, ...logged], -Infinity)
  assert.equal(now?.ns, 3, 'a later logged /loc outranks the typed one')
  assert.equal(before?.ns, 1, 'and the typed one is its tail')
  const [typedWins] = newestTwo([at(1, 1_000), ...logged], -Infinity)
  assert.equal(typedWins?.ns, 1, 'a later typed /loc outranks the log')
})

test('one position is a marker with no tail; Clear hides everything up to its time', () => {
  assert.deepEqual(newestTwo([at(1, 5)], -Infinity), [at(1, 5), null])
  assert.deepEqual(newestTwo([at(1, 5), at(2, 9)], 9), [null, null])
  assert.deepEqual(newestTwo([at(1, 5), at(2, 10)], 9), [at(2, 10), null], 'a /loc after the Clear is back')
})

test('logged /locs count only on the map of the zone the log has you in', () => {
  const snap = { zone: 'Crushbone', locs: [{ ns: 1, ew: 2, z: 3, ts: 40 }] }
  const here = zoneShortName('Crushbone')
  assert.deepEqual(loggedLocsIn(snap, here), [{ ns: 1, ew: 2, z: 3, at: 40 }])
  assert.deepEqual(loggedLocsIn(snap, zoneShortName('Greater Faydark')), [])
  assert.deepEqual(loggedLocsIn({ zone: 'Crushbone' }, here), [])
  assert.deepEqual(loggedLocsIn(null, here), [])
})
