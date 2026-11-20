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
import { labelMatcher, matchMob, mobFacts, raceYields } from '../src/shared/slayer/slayerMatch'
import { NO_CAP, estimateNote, planZones, slayerMobs, slayerTarget } from '../src/shared/slayer/slayerPlan'
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

// THE EST. CHIP SAYS WHY. The drake's own wiki page says Dragon, so a bare `est.` beside it reads
// as the app being wrong. The row carries the race that gave way, and the chip's tooltip names it.

test('a race gives way only to a name that states a kind it yields to', () => {
  assert.equal(raceYields('An Emerald Drake', 'Dragon'), true)
  assert.equal(raceYields('a lava wurm', 'Lava Dragon'), true)
  assert.equal(raceYields('Lord Nagafen', 'Lava Dragon'), false)
  assert.equal(raceYields('Trakanon', 'Dragon'), false)
  assert.equal(raceYields('a glimmering emerald drake', 'Drake'), false)
  assert.equal(raceYields('a gnoll pup', undefined), false)
})

test('the est. chip on a drake names the wiki race that was set aside and the kind its name states', () => {
  const [zone] = planZones(MOBS, [slayerTarget(counterOf('You Keep Dragon Me Into This'))], NO_CAP)
  const [drake] = zone.mobs
  assert.deepEqual(drake.yielded, { race: 'Dragon', kind: 'drakes' })
  assert.equal(estimateNote(drake), 'Read from its name: the wiki says Dragon, but the game counts drakes separately.')
})

test('the est. chip on a mob whose page states no race says only that its name was read', () => {
  const pup = slayerMobs([mob('a gnoll pup', 'Blackburrow', '1-3')], () => undefined)
  const [zone] = planZones(pup, [slayerTarget(counterOf('Gnolling is Half the Battle'))], NO_CAP)
  assert.equal(zone.mobs[0].basis, 'name')
  assert.equal(zone.mobs[0].yielded, undefined)
  assert.equal(estimateNote(zone.mobs[0]), 'Its kind is read from its name, not from a race on its wiki page.')
})

test('a mob counted by its wiki race has no est. chip and so no note', () => {
  const zones = planZones(MOBS, [slayerTarget(counterOf('Dragonbane'))], NO_CAP)
  for (const m of zones.flatMap((z) => z.mobs)) {
    assert.equal(m.yielded, undefined, m.name)
    assert.equal(estimateNote(m), null, m.name)
  }
})

test('every est. note is one sentence of 7 to 15 words with no long dash', () => {
  const notes = [
    estimateNote({ basis: 'name' }),
    estimateNote({ basis: 'name', yielded: { race: 'Dragon', kind: 'drakes' } }),
    estimateNote({ basis: 'name', yielded: { race: 'Lava Dragon', kind: 'wyverns' } })
  ]
  for (const note of notes) {
    assert.ok(note !== null)
    const words = note.split(/\s+/).length
    assert.ok(words >= 7 && words <= 15, `${String(words)} words: ${note}`)
    assert.match(note, /^[^.!?–—]+\.$/)
  }
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
