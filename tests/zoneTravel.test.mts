// THE ZONE GRAPH, read off the client's own map files (owner ask, kaltinril 2026-09-11).
//
// The ask was "show the closest druid, wizard, boat, or item port", and the first answer it got was
// that this repo has no zone graph and could not know that Befallen touches West Commons. The owner
// pushed back - *"i mean, the zones should know what they connect to do they not?"* - and he was
// right: the map files label their own zone lines, and this app already parses them into
// `MapData.points`.
//
//     P -31.9430, 75.5264, -0.8014, 150, 0, 200, 3, to_West_Commonlands     (befallen_1.txt)
//
// The fixtures below are label shapes taken verbatim from the default pack. The corpus half needs
// the player's own install and skips without it, exactly as `resistBaseline` and
// `stackGroundTruth` do - map files are Daybreak's and are never committed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { zoneExits } from '../src/shared/zoneTravel'
import { parseMapText } from '../src/main/maps/parseMap'
import { splitMapFileName } from '../src/main/maps/packs'
import type { MapPoint } from '../src/shared/maps'

function point(label: string): MapPoint {
  return { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 1, label, display: label.replace(/_/g, ' '), layer: 1 }
}

test('a to_ label is a walk, and it folds onto the catalog`s own zone', () => {
  // befallen_1.txt, verbatim - the owner's example.
  const exits = zoneExits([point('to_West_Commonlands')])
  assert.equal(exits.length, 1)
  assert.equal(exits[0].kind, 'walk')
  assert.equal(exits[0].name, 'West Commonlands')
  assert.equal(exits[0].label, 'to_West_Commonlands', 'the map`s own words survive for display')
})

test('the client names its own boats, and a destination the catalog lacks is still not invented', () => {
  const exits = zoneExits([point("to_Erud's_Crossing_or_Freeport_(boat_or_translocator)")])
  assert.equal(exits[0].kind, 'boat', 'the client says which crossings are not walks')
  assert.equal(exits[0].name, "Erud's Crossing")
  // AND ONLY ONE EXIT, because the catalog has no plain `Freeport` - it has East, West and North.
  // The boat really does land in East Freeport and mapping it there would be a GUESS (law 12), so
  // the half that resolves is kept and the half that does not is dropped. Nothing is lost to the
  // reader: `label` carries the client's own words, and the surface shows them.
  assert.equal(exits.length, 1)
  assert.match(exits[0].label, /Freeport/, 'the map`s own wording still reaches the surface')
})

test('a _Portal label is a portal, and an unknown destination is dropped rather than guessed', () => {
  assert.equal(zoneExits([point('Ak`Anon_Portal')])[0]?.kind, 'portal')
  // The packs carry guild halls, merchants and non-classic destinations under the same shapes.
  // A label the catalog cannot name yields NOTHING (law 12: no fuzzy joins).
  assert.deepEqual(zoneExits([point('to_The_Bazaar_Merchant')]), [])
  assert.deepEqual(zoneExits([point('Bank')]), [])
})

test('both ends of a seam are one exit, not two', () => {
  // Zone lines are labelled at both ends of the seam and often on two layers.
  const exits = zoneExits([point('to_West_Commonlands'), point('to_West_Commonlands')])
  assert.equal(exits.length, 1)
})

// ---- the real pack ---------------------------------------------------------------------------

const MAPS =
  process.env.EQ_MAPS ??
  'C:/Users/Public/Daybreak Game Company/Installed Games/EverQuest Legends/maps'
const skip = !existsSync(MAPS) && 'no client maps directory'

test('the default pack states a usable graph, and Befallen leads to West Commons', { skip }, () => {
  const byZone = new Map<string, ReturnType<typeof zoneExits>>()
  let files = 0
  for (const name of readdirSync(MAPS)) {
    const split = splitMapFileName(name)
    if (!split) continue
    files++
    const parsed = parseMapText(readFileSync(`${MAPS}/${name}`, 'latin1'), split.layer)
    const exits = zoneExits(parsed.points)
    if (exits.length === 0) continue
    const held = byZone.get(split.stem) ?? []
    for (const e of exits) {
      if (!held.some((h) => h.zone === e.zone && h.kind === e.kind)) held.push(e)
    }
    byZone.set(split.stem, held)
  }
  // The census, so a pack that changes shape is visible rather than silently thinner. Measured
  // 2026-09-11 on the owner's install: 213 files, 90 zones, 204 edges.
  assert.ok(files > 200, `expected the default pack, saw ${String(files)} files`)
  assert.ok(byZone.size >= 80, `expected a usable graph, saw ${String(byZone.size)} zones`)

  // The ask, verbatim.
  const befallen = byZone.get('befallen') ?? []
  assert.deepEqual(befallen.map((e) => e.name), ['West Commonlands'])

  // A zone with several exits, all of them true of the game.
  const faydark = new Set((byZone.get('gfaydark') ?? []).map((e) => e.name))
  for (const z of ['Butcherblock Mountains', 'Clan Crushbone', 'The Lesser Faydark', 'North Felwithe']) {
    assert.ok(faydark.has(z), `Greater Faydark should state ${z}`)
  }
})
