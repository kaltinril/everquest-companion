// ============================================================================
// THE SLAYER TAB'S DATA LAYER — the dump's Slayer half, the kinds table, the zone ranking.
// ============================================================================
//
// TWO REAL DUMPS. `Primitive_freeport-Achievements.txt` is the committed fixture of 2026-08-20,
// in which a completed row is printed with a `C`. `slayer-open-Achievements.txt` is the four
// Slayer categories of the owner's dump of 2026-09-28, verbatim, in which completed rows are not
// printed at all. Every count below was read off those files before it was asserted.
//
// THE RACE INDEX (`mobRaces.json`) is generated from cached wiki pages and will grow when more
// pages are cached, so the assertions about it are floors and named examples, never totals.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAchievementsDump } from '../src/shared/outputs/achievements'
import {
  achievementKey,
  requiredByGoal,
  requiredLeft,
  showsOpenRows,
  slayerRecord
} from '../src/shared/outputs/slayer'
import { SLAYER_TERMS, labelTerms, raceKey, resolveTerm } from '../src/shared/slayer/slayerKinds'
import {
  CLAIMED_RACES,
  labelMatcher,
  matchMob,
  mobFacts,
  nameTerm,
  strictMatcher,
  unknownTerms
} from '../src/shared/slayer/slayerMatch'
import {
  counterId,
  levelSpan,
  planZones,
  slayerMobs,
  slayerTarget,
  targetReach
} from '../src/shared/slayer/slayerPlan'
import type { MobEntry } from '../src/shared/mobTypes'
import { MIN_RADIUS, slayerAreas } from '../src/renderer/src/features/slayer/slayerAreas'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const OLD = slayerRecord(parseAchievementsDump(read('Primitive_freeport-Achievements.txt')))
const NEW = slayerRecord(parseAchievementsDump(read('slayer-open-Achievements.txt')))

const DATA = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'data', 'eqlegends')
const RACES = (
  JSON.parse(readFileSync(join(DATA, 'mobRaces.json'), 'utf8')) as {
    races: Record<string, string[]>
  }
).races

// ---------------------------------------------------------------------------
// THE DUMP'S SLAYER HALF
// ---------------------------------------------------------------------------

test('the open counters are read per group, and only the open ones', () => {
  const groups = (rec: typeof OLD): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const c of rec.counters) out[c.group] = (out[c.group] ?? 0) + 1
    return out
  }
  assert.deepEqual(groups(OLD), { Conquest: 22, Special: 31, Skill: 53 })
  assert.deepEqual(groups(NEW), { Conquest: 21, Special: 29, Skill: 37 })
  // The older dump prints completed components too, without a counter; none of them is here.
  assert.equal(
    OLD.counters.some((c) => c.achievement === 'Amphibicide'),
    false
  )
})

test('a dump with no open row at all (Show Open unticked) is no witness about Slayer', () => {
  const text = read('Primitive_freeport-Achievements.txt')
  assert.equal(showsOpenRows(parseAchievementsDump(text)), true)
  const doneOnly = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('I\t'))
    .join('\n')
  const dump = parseAchievementsDump(doneOnly)
  assert.ok(dump.rows.length > 0)
  assert.equal(showsOpenRows(dump), false)
})

test('a counter carries the numbers as numbers and the line verbatim', () => {
  const bats = NEW.counters.find((c) => c.achievement === 'Bat Country!')
  assert.deepEqual(bats, {
    group: 'Skill',
    achievement: 'Bat Country!',
    label: 'Bats and Werebats.',
    have: 99,
    need: 100
  })
})

test('one achievement can hold several counters, and each has its own id', () => {
  const people = NEW.counters.filter((c) => c.achievement === "I'm a People Person!")
  assert.deepEqual(
    people.map((c) => c.label),
    ['Barbarians', 'Wood Elves', 'High Elves', 'Dwarves', 'Halflings', 'Iksars']
  )
  assert.equal(new Set(NEW.counters.map(counterId)).size, NEW.counters.length)
})

test('the General achievements name what they still require, optional or not', () => {
  assert.deepEqual(
    NEW.goals.map((g) => [g.achievement, g.needs.length, requiredLeft(g)]),
    [
      ['Megadeath', 3, 3],
      ['A Force of Nature', 23, 21],
      ['Highly Decorated', 35, 24],
      ['Progressive', 82, 36]
    ]
  )
})

test('a General row and the achievement it names join across case and a closing period', () => {
  // `Complete the achievement "Catnipped in the bud."` names `Catnipped In the Bud`.
  assert.equal(achievementKey('Catnipped in the bud.'), achievementKey('Catnipped In the Bud'))
  const required = requiredByGoal(NEW.goals)
  assert.equal(required.get(achievementKey('Bat Country!')), true)
  assert.equal(required.get(achievementKey('Icky!')), false, 'quoted only as (Optional)')
  // Every open counter's achievement is named by some General row.
  for (const c of NEW.counters) {
    assert.ok(required.has(achievementKey(c.achievement)), `${c.achievement} is named by no goal`)
  }
})

// ---------------------------------------------------------------------------
// THE KINDS TABLE
// ---------------------------------------------------------------------------

test('a requirement line splits into the terms the game listed', () => {
  assert.deepEqual(labelTerms('Bats and Werebats.'), ['bats', 'werebats'])
  assert.deepEqual(labelTerms('Kirins, Nightmares, Pegasus, and Unicorns.'), [
    'kirins',
    'nightmares',
    'pegasus',
    'unicorns'
  ])
  assert.deepEqual(
    labelTerms('Armadillos, Bats, Bubonians, Burynai, Molerats, Rabbits, Ratmen, Rats, Skunks and Werebats.').slice(-2),
    ['skunks', 'werebats']
  )
  assert.deepEqual(labelTerms('Iksars and Kylong Iksars of Veksar.'), [
    'iksars',
    'kylong iksars of veksar'
  ])
  assert.deepEqual(
    labelTerms(
      'Clockwork: Beetles, Boars, Dragons, Rats, Snakes, Spiders, Gnomeworks, Copters, and Tin Soldiers.'
    ),
    ['clockwork']
  )
})

test('EVERY TERM EITHER DUMP PRINTS HAS BEEN LOOKED AT', () => {
  for (const rec of [OLD, NEW]) {
    for (const c of rec.counters) {
      assert.deepEqual(unknownTerms(c.label), [], `${c.achievement}: ${c.label}`)
    }
  }
})

test('the table refers only to terms it has, and no wiki value is claimed by two families', () => {
  for (const [term, entry] of SLAYER_TERMS) {
    for (const part of entry.of ?? []) assert.ok(SLAYER_TERMS.has(part), `${term} -> ${part}`)
    for (const race of entry.races ?? []) assert.equal(race, raceKey(race), `${term}: ${race}`)
  }
  assert.deepEqual(resolveTerm('mystical horses'), [
    'mystical horses',
    'kirins',
    'nightmares',
    'pegasus',
    'unicorns'
  ])
  // The ghosts are the one deliberate overlap: a ghost dwarf is a Dwarf and a Ghost.
  const owners = new Map<string, string[]>()
  for (const [term, entry] of SLAYER_TERMS) {
    for (const race of entry.races ?? []) owners.set(race, [...(owners.get(race) ?? []), term])
  }
  const shared = [...owners].filter(([, terms]) => terms.length > 1).map(([race]) => race)
  assert.deepEqual(shared.sort(), ['erudite ghost', 'ghost dwarf'])
})

test('the wiki values the table claims exist in the index, most of them', () => {
  const stated = new Set(Object.keys(RACES).map(raceKey))
  const claimed = [...CLAIMED_RACES]
  const present = claimed.filter((r) => stated.has(r))
  // A claimed value the index lacks is a spelling the wiki used on a page not cached yet, or one
  // this table anticipated. It costs nothing; a table that matched almost nothing would.
  assert.ok(present.length >= claimed.length * 0.85, `${String(present.length)} of ${String(claimed.length)}`)
  for (const race of ['gargoyle', 'giant bat', 'scarecrow', 'ghost dwarf', 'fungusman']) {
    assert.ok(stated.has(race), race)
  }
})

// ---------------------------------------------------------------------------
// THE MATCH
// ---------------------------------------------------------------------------

test('a stated race decides, and the name is not read over it', () => {
  const skeletons = labelMatcher('Skeletons')
  const dwarves = labelMatcher('Dwarves')
  const mob = mobFacts('a dwarf skeleton', 'Skeleton New')
  assert.equal(matchMob(skeletons, mob), 'race')
  assert.equal(matchMob(dwarves, mob), null)
})

test('a mob with no usable race is read off its name, and says so', () => {
  const darkElves = labelMatcher('Dark Elves')
  assert.equal(matchMob(darkElves, mobFacts('a teir`dal rogue', undefined)), 'name')
  assert.equal(matchMob(labelMatcher('Gnolls'), mobFacts('a gnoll pup', undefined)), 'name')
  // `Undead` is a value the wiki states and no term claims: the name is what is left.
  assert.equal(matchMob(labelMatcher('Skeletons'), mobFacts('A Decaying Skeleton', 'Undead')), 'name')
  assert.equal(matchMob(darkElves, mobFacts('Guard Polzdurn', undefined)), null)
})

test('a name states ONE kind, the last one in it, as whole words', () => {
  assert.equal(nameTerm('a dwarf skeleton'), 'skeletons')
  assert.equal(nameTerm('a vampire bat'), 'bats')
  assert.equal(nameTerm('a kerra lion'), 'lions')
  assert.equal(nameTerm('a giant rat'), 'rats', 'giant is an adjective here')
  assert.equal(nameTerm('a hill giant'), 'giants')
  assert.equal(nameTerm('a ratman warrior'), 'ratmen', 'not rats')
  assert.equal(nameTerm('orc pawns'), 'orcs')
  assert.equal(nameTerm('A Dervish Cutthroat'), null, 'a bandit, not a dervish')
  assert.equal(nameTerm('Guard Polzdurn'), null)
})

test('the clockworks are read by name whatever their page states (measured, 4 of 4)', () => {
  const clockwork = labelMatcher(
    'Clockwork: Beetles, Boars, Dragons, Rats, Snakes, Spiders, Gnomeworks, Copters, and Tin Soldiers.'
  )
  assert.equal(matchMob(clockwork, mobFacts('rogue clockwork', 'Giant Spider')), 'name')
  assert.equal(matchMob(clockwork, mobFacts('runaway clockwork', 'Clockwork Gnome')), 'race')
})

test('a ghost is its race, except where the game counts the race itself', () => {
  const ghost = mobFacts('Garanel Rucksif', 'Ghost Dwarf')
  assert.equal(matchMob(labelMatcher('Dwarves'), ghost), 'race')
  assert.equal(matchMob(strictMatcher('Dwarves'), ghost), null)
  assert.equal(matchMob(strictMatcher('Dwarves'), mobFacts('Key Master', 'Dwarf')), 'race')
  const people = NEW.counters.find((c) => c.label === 'Dwarves' && c.group === 'Special')
  assert.ok(people)
  assert.equal(matchMob(slayerTarget(people).matcher, ghost), null)
})

test('a strict term that only names another counts what that one counts (`Kerran`)', () => {
  assert.equal(SLAYER_TERMS.get('kerran')?.races, undefined)
  const kerran = OLD.counters.find((c) => c.label === 'Kerran' && c.group === 'Special')
  assert.ok(kerran)
  const strict = slayerTarget(kerran).matcher
  assert.equal(matchMob(strict, mobFacts('a kerran warrior', 'Kerra')), 'race')
})

// ---------------------------------------------------------------------------
// THE PLAN
// ---------------------------------------------------------------------------

const mob = (name: string, zones: string[], level: string, locs = 0): MobEntry => ({
  page: name,
  name,
  level,
  zones,
  ...(locs === 0 ? {} : { loc: Array.from({ length: locs }, (_, i) => ({ ns: i, ew: i })) })
})

const CATALOG: MobEntry[] = [
  mob('a gargoyle', ['The Ocean of Tears'], '30-34', 8),
  mob('a scarecrow', ['Western Plains of Karana'], '10-14', 3),
  mob('a giant bat', ['Western Plains of Karana'], '4-6', 5),
  mob('a jack o lantern', ['The Estate of Unrest'], '20', 1),
  mob('a dusty werebat', ['The Estate of Unrest'], '22', 1),
  mob('a gnoll pup', ['Blackburrow', 'Qeynos Hills'], '1-3', 6),
  mob('a wandering bat', ['Various'], '5'),
  mob('a velium gargoyle', ["Sleeper's Tomb"], '55', 4)
]
const RACE_OF: Record<string, string> = {
  'a gargoyle': 'Gargoyle',
  'a scarecrow': 'Scarecrow',
  'a giant bat': 'Giant Bat',
  'a jack o lantern': 'Scarecrow',
  'a velium gargoyle': 'Gargoyle'
}
const MOBS = slayerMobs(CATALOG, (page) => RACE_OF[page])

const counter = (achievement: string, label: string): (typeof NEW.counters)[number] => ({
  group: 'Skill',
  achievement,
  label,
  have: 0,
  need: 100
})
const BATS = slayerTarget(counter('Bat Country!', 'Bats and Werebats.'))
const CROWS = slayerTarget(counter("You're Not Scaring Anyone", 'Scarecrows and Totems.'))
const ALIVE = slayerTarget(
  counter(
    "It's Alive!",
    'Brellian Constructs, Gargoyles, Gingerbread Men, Golems, Marionettes, Muddites, and Scarecrows.'
  )
)
const ANY = { maxLevel: null, outOfEra: false }

test("THE OWNER'S QUESTION: the zone that has both comes first", () => {
  const zones = planZones(MOBS, [BATS, CROWS], ANY)
  assert.deepEqual(
    zones.map((z) => [z.name, z.targets.length, z.spawns]),
    [
      ['The Western Plains of Karana', 2, 8],
      ['The Estate of Unrest', 2, 2]
    ]
  )
  assert.equal(zones[0].short, 'qey2hh1')
})

test('a mob that moves two picked counters is two ticks a spawn', () => {
  const zones = planZones(MOBS, [CROWS, ALIVE], ANY)
  const karana = zones.find((z) => z.key === 'qey2hh1')
  assert.ok(karana)
  assert.equal(karana.spawns, 3)
  assert.equal(karana.advances, 6)
  assert.deepEqual(karana.mobs[0].targets, [CROWS.id, ALIVE.id])
})

test('a name-read mob is in the plan and carries its basis', () => {
  const unrest = planZones(MOBS, [BATS], ANY).find((z) => z.name === 'The Estate of Unrest')
  assert.ok(unrest)
  assert.deepEqual(
    unrest.mobs.map((m) => [m.name, m.basis]),
    [['a dusty werebat', 'name']]
  )
})

test('a placeholder is not a zone, and a several-zone mob is one spawn in each', () => {
  const bats = planZones(MOBS, [BATS], ANY)
  assert.equal(
    bats.some((z) => z.key === 'various'),
    false
  )
  const gnolls = planZones(MOBS, [slayerTarget(counter('The More You Gnoll!', 'Gnolls'))], ANY)
  assert.deepEqual(
    gnolls.map((z) => [z.name, z.spawns]),
    [
      ['Blackburrow', 1],
      ['Qeynos Hills', 1]
    ]
  )
})

test('a guess, a various and a closing period are read as the catalog writes them', () => {
  const odd = slayerMobs(
    [
      mob('a gnoll scout', ['Various Starter Zones', 'Warsliks?', 'Lake of Ill Omen.'], '10', 2),
      mob('a gnoll guard', ['various (Qeynos Hills)', 'also in Chardok?'], '10', 2)
    ],
    () => 'Gnoll'
  )
  const every = { maxLevel: null, outOfEra: true }
  const gnolls = planZones(odd, [slayerTarget(counter('The More You Gnoll!', 'Gnolls'))], every)
  assert.deepEqual(
    gnolls.map((z) => [z.key, z.name]),
    [['lakeofillomen', 'Lake of Ill Omen']]
  )
})

test('the level cap reads the LOWEST stated level, and an unopened zone is a switch', () => {
  const capped = planZones(MOBS, [ALIVE], { maxLevel: 20, outOfEra: false })
  assert.deepEqual(
    capped.map((z) => z.name),
    ['The Western Plains of Karana', 'The Estate of Unrest']
  )
  const open = planZones(MOBS, [ALIVE], ANY).map((z) => z.name)
  assert.equal(open.includes("Sleeper's Tomb"), false)
  const every = planZones(MOBS, [ALIVE], { maxLevel: null, outOfEra: true }).map((z) => z.name)
  assert.equal(every.includes("Sleeper's Tomb"), true)
})

test('reach counts zones and spawn points per counter', () => {
  const reach = targetReach(planZones(MOBS, [BATS, CROWS, ALIVE], ANY))
  assert.deepEqual(reach.get(BATS.id), { zones: 2, spawns: 6 })
  assert.deepEqual(reach.get(CROWS.id), { zones: 2, spawns: 4 })
  assert.deepEqual(reach.get(ALIVE.id), { zones: 3, spawns: 12 })
})

// ---------------------------------------------------------------------------
// THE MAP AREAS
// ---------------------------------------------------------------------------

test('a level is read off the opening of the text, never out of the prose after it', () => {
  assert.deepEqual(levelSpan('36-40'), { low: 36, high: 40 })
  assert.deepEqual(levelSpan('2 - 4'), { low: 2, high: 4 })
  assert.deepEqual(levelSpan('50+'), { low: 50, high: 50 })
  assert.deepEqual(levelSpan('6 (strangely cons dark blue to me at lvl 42, at night)'), {
    low: 6,
    high: 6
  })
  assert.deepEqual(levelSpan('Varies'), { low: null, high: null })
  assert.deepEqual(levelSpan(undefined), { low: null, high: null })
})

const at = (name: string, zone: string, locs: [number, number][]): MobEntry => ({
  page: name,
  name,
  zones: [zone],
  loc: locs.map(([ns, ew]) => ({ ns, ew }))
})

const FIELD: MobEntry[] = [
  at('a scarecrow', 'Western Plains of Karana', [
    [100, 100],
    [150, 200]
  ]),
  at('a giant bat', 'Western Plains of Karana', [[200, 150]]),
  at('an animated scarecrow', 'Western Plains of Karana', [[-3000, 4000]]),
  at('a gargoyle', 'The Ocean of Tears', [[0, 0]]),
  { ...at('a cave bat', 'Western Plains of Karana', [[120, 120]]), zones: ['Western Plains of Karana', 'Qeynos Hills'] }
]
const FIELD_MOBS = slayerMobs(FIELD, (page) =>
  page.includes('scarecrow') ? 'Scarecrow' : page.includes('bat') ? 'Giant Bat' : 'Gargoyle'
)

test('spawn points that stand together are one area, and it names what it serves', () => {
  const areas = slayerAreas('qey2hh1', FIELD_MOBS, [BATS, CROWS], null)
  assert.equal(areas.length, 2)
  const [camp, lone] = areas
  assert.equal(camp.spawns, 3)
  assert.deepEqual(camp.targets, [BATS.id, CROWS.id])
  assert.deepEqual(camp.mobs.sort(), ['a giant bat', 'a scarecrow'])
  // The circle holds every point it was made from.
  for (const [ns, ew] of [
    [100, 100],
    [150, 200],
    [200, 150]
  ]) {
    assert.ok(Math.hypot(-ew - camp.x, -ns - camp.y) <= camp.r)
  }
  assert.equal(lone.spawns, 1)
  assert.equal(lone.r, MIN_RADIUS)
  assert.deepEqual(lone.targets, [CROWS.id])
})

test('an area is drawn only for this map, only for picks, only for one-zone pages', () => {
  assert.deepEqual(slayerAreas('qey2hh1', FIELD_MOBS, [], null), [])
  assert.deepEqual(slayerAreas('befallen', FIELD_MOBS, [BATS, CROWS], null), [])
  const bats = slayerAreas('qey2hh1', FIELD_MOBS, [BATS], null)
  assert.deepEqual(
    bats.map((a) => a.mobs),
    [['a giant bat']],
    'the two-zone cave bat states a location nobody can place'
  )
})

test('the map leaves out what the level cap leaves out of the zone list', () => {
  const high = { ...at('a scarecrow', 'Western Plains of Karana', [[100, 100]]), level: '30' }
  const low = { ...at('a giant bat', 'Western Plains of Karana', [[150, 150]]), level: '4-6' }
  const field = slayerMobs([high, low], (page) =>
    page.includes('bat') ? 'Giant Bat' : 'Scarecrow'
  )
  const cap = { maxLevel: 20, outOfEra: false }
  const listed = planZones(field, [BATS, CROWS], cap).flatMap((z) => z.mobs.map((m) => m.name))
  const shaded = slayerAreas('qey2hh1', field, [BATS, CROWS], cap.maxLevel).flatMap((a) => a.mobs)
  assert.deepEqual(listed, ['a giant bat'])
  assert.deepEqual(shaded, listed)
  assert.equal(slayerAreas('qey2hh1', field, [BATS, CROWS], null)[0].mobs.length, 2)
})
