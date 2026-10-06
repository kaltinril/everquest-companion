// slayerZoneOrder.test.mts — the zone list's Sort: by how many picked counters a zone serves, by
// spawn points, or by level (the counting mobs' lowest levels averaged over their spawn points).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MobEntry } from '../src/shared/mobTypes'
import { planZones, slayerMobs, slayerTarget, sortZones } from '../src/shared/slayer/slayerPlan'

const counter = (achievement: string, label: string): Parameters<typeof slayerTarget>[0] => ({
  group: 'Skill',
  achievement,
  label,
  have: 0,
  need: 100
})
const BATS = slayerTarget(counter('Bat Country!', 'Bats and Werebats.'))
const CROWS = slayerTarget(counter("You're Not Scaring Anyone", 'Scarecrows and Totems.'))

const mob = (page: string, zone: string, level: string, spawns: number): MobEntry => ({
  page,
  name: page.replace(/ \(.*\)$/, ''),
  level,
  zones: [zone],
  loc: Array.from({ length: spawns }, (_, i) => ({ ns: i * 500, ew: 0 }))
})

// Ocean of Tears serves both counters with few spawns; Qeynos Hills has many low bats; Befallen a
// few high ones.
const MOBS = slayerMobs(
  [
    mob('a giant bat (Ocean of Tears)', 'The Ocean of Tears', '30', 1),
    mob('a scarecrow (Ocean of Tears)', 'The Ocean of Tears', '20', 1),
    mob('a giant bat (Qeynos Hills)', 'Qeynos Hills', '2-4', 10),
    mob('a giant bat (Befallen)', 'Befallen', '8', 2),
    mob('a vampire bat (Befallen)', 'Befallen', '14', 2)
  ],
  (page) => (page.includes('bat') ? 'Giant Bat' : 'Scarecrow')
)
const ZONES = planZones(MOBS, [BATS, CROWS], { maxLevel: null, outOfEra: false, noFactionHits: false })
const names = (order: Parameters<typeof sortZones>[1]): string[] =>
  sortZones(ZONES, order).map((z) => z.key)

test('matches keeps the plan ranking, spawns puts the busiest first, level the lowest first', () => {
  assert.deepEqual(names('matches'), ['oot', 'qeytoqrg', 'befallen'])
  assert.deepEqual(names('spawns'), ['qeytoqrg', 'befallen', 'oot'])
  assert.deepEqual(names('level'), ['qeytoqrg', 'befallen', 'oot'])
})

test("a zone's level is its counting mobs' lowest levels averaged over their spawn points", () => {
  const level = new Map(ZONES.map((z) => [z.key, z.level]))
  assert.equal(level.get('oot'), 25)
  assert.equal(level.get('qeytoqrg'), 2)
  assert.equal(level.get('befallen'), 11)
})
