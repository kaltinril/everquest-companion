// ============================================================================
// A MOB NAMED DRAKE, WURM OR WYVERN IS NEVER A TRUE DRAGON (fork #5)
// ============================================================================
//
// The wiki page of An Emerald Drake states race `Dragon`, so Dragonbane (`True Dragons`) listed it
// beside Lord Nagafen and Lady Vox, and a player's kills of it did not move the counter. The game
// counts Drakes, Wurms and Wyverns on lines of their own, so the `true dragons` race claim yields
// to those names (`SlayerTerm.yieldsTo`) and the mob is read by its name, as an estimate.
// The catalog here is hand-made; the counters are the dump's own lines.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAchievementsDump } from '../src/shared/outputs/achievements'
import { slayerRecord, type SlayerCounter } from '../src/shared/outputs/slayer'
import { SLAYER_TERMS } from '../src/shared/slayer/slayerKinds'
import { labelMatcher, matchMob, mobFacts } from '../src/shared/slayer/slayerMatch'
import { NO_CAP, planZones, slayerMobs, slayerTarget } from '../src/shared/slayer/slayerPlan'
import type { MobEntry } from '../src/shared/mobTypes'

const DUMP = readFileSync(join(import.meta.dirname, 'fixtures', 'slayer-open-Achievements.txt'), 'utf8')
const RECORD = slayerRecord(parseAchievementsDump(DUMP))

const counterOf = (achievement: string): SlayerCounter => {
  const found = RECORD.counters.find((c) => c.achievement === achievement)
  assert.ok(found, achievement)
  return found
}

const TRUE_DRAGONS = labelMatcher(counterOf('Dragonbane').label)
const LESSER = labelMatcher(counterOf('You Call That a Dragon?').label)
const DRAKES = labelMatcher(counterOf('You Keep Dragon Me Into This').label)
const ALL_DRAGONS = labelMatcher(counterOf('Here Be Dragons!').label)

test('a drake filed as Dragon is not a true dragon, and is an estimate where it lands', () => {
  const drake = mobFacts('An Emerald Drake', 'Dragon')
  assert.deepEqual(drake, { race: '', nameTerm: 'drakes', always: [] })
  assert.equal(matchMob(TRUE_DRAGONS, drake), null)
  assert.equal(matchMob(LESSER, drake), 'name')
  assert.equal(matchMob(DRAKES, drake), 'name')
  assert.equal(matchMob(ALL_DRAGONS, drake), 'name')
})

test('a wurm or a wyvern under any true-dragon race yields the same way', () => {
  assert.equal(matchMob(TRUE_DRAGONS, mobFacts('a lava wurm', 'Lava Dragon')), null)
  assert.equal(matchMob(LESSER, mobFacts('a lava wurm', 'Lava Dragon')), 'name')
  assert.equal(matchMob(TRUE_DRAGONS, mobFacts('an ice wyvern', 'Ice Dragon')), null)
  assert.equal(matchMob(LESSER, mobFacts('an ice wyvern', 'Ice Dragon')), 'name')
})

test('a true dragon whose name states no lesser kind still counts by race', () => {
  assert.equal(matchMob(TRUE_DRAGONS, mobFacts('Lord Nagafen', 'Lava Dragon')), 'race')
  assert.equal(matchMob(TRUE_DRAGONS, mobFacts('Lady Vox', 'Lava Dragon')), 'race')
  assert.equal(matchMob(TRUE_DRAGONS, mobFacts('Trakanon', 'Dragon')), 'race')
  assert.equal(matchMob(ALL_DRAGONS, mobFacts('Trakanon', 'Dragon')), 'race')
  // Only the yielded-to kinds outrank the race: another kind word in the name does not.
  assert.equal(matchMob(TRUE_DRAGONS, mobFacts('the gargoyle dragon', 'Dragon')), 'race')
})

test('a drake whose page says Drake is untouched: it counts by race', () => {
  const drake = mobFacts('a glimmering emerald drake', 'Drake')
  assert.equal(matchMob(DRAKES, drake), 'race')
  assert.equal(matchMob(TRUE_DRAGONS, drake), null)
})

const mob = (name: string, zone: string, level: string): MobEntry => ({
  page: name,
  name,
  level,
  zones: [zone]
})

const CATALOG: MobEntry[] = [
  mob('An Emerald Drake', 'Butcherblock Mountains', '8 ~ 14'),
  mob('Lord Nagafen', "Nagafen's Lair", '55'),
  mob('Lady Vox', 'Permafrost', '55')
]
const RACE_OF: Record<string, string> = {
  'An Emerald Drake': 'Dragon',
  'Lord Nagafen': 'Lava Dragon',
  'Lady Vox': 'Lava Dragon'
}
const MOBS = slayerMobs(CATALOG, (page) => RACE_OF[page])

test("Dragonbane's Where to go lists the two dragons and not the drake's zone", () => {
  const zones = planZones(MOBS, [slayerTarget(counterOf('Dragonbane'))], NO_CAP)
  assert.deepEqual(
    zones.flatMap((z) => z.mobs.map((m) => [m.name, m.basis])).sort(),
    [
      ['Lady Vox', 'race'],
      ['Lord Nagafen', 'race']
    ]
  )
  assert.equal(zones.length, 2)
  assert.equal(
    zones.some((z) => z.name.includes('Butcherblock')),
    false
  )
})

test('the drake is listed under the drake achievement, marked as read off its name', () => {
  const zones = planZones(MOBS, [slayerTarget(counterOf('You Keep Dragon Me Into This'))], NO_CAP)
  assert.deepEqual(
    zones.map((z) => z.mobs.map((m) => [m.name, m.basis])),
    [[['An Emerald Drake', 'name']]]
  )
  assert.ok(zones[0].name.includes('Butcherblock'), zones[0].name)
})

test('the table yields only to terms with a name word, and only races it alone claims', () => {
  const yielding = [...SLAYER_TERMS].filter(([, entry]) => entry.yieldsTo !== undefined)
  assert.ok(yielding.some(([term]) => term === 'true dragons'))
  for (const [term, entry] of yielding) {
    for (const to of entry.yieldsTo ?? []) {
      assert.ok((SLAYER_TERMS.get(to)?.names?.length ?? 0) > 0, `${term} -> ${to}`)
    }
    // Dropping a yielded race must not cost another kind its claim on it.
    for (const race of entry.races ?? []) {
      const owners = [...SLAYER_TERMS].filter(([, e]) => e.races?.includes(race)).map(([t]) => t)
      assert.deepEqual(owners, [term], race)
    }
  }
})
