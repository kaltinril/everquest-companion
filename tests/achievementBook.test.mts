// ============================================================================
// THE ACHIEVEMENTS TAB'S DATA LAYER — the dump as the game's tree, and the joins a line makes.
// ============================================================================
//
// TWO REAL DUMPS, the ones `slayer.test.mts` reads. `Primitive_freeport-Achievements.txt` is the
// committed fixture of 2026-08-20, in which a completed row is printed with a `C`.
// `slayer-open-Achievements.txt` is the four Slayer categories of the owner's dump of
// 2026-09-28, verbatim, in which completed rows are not printed at all. Every count below was
// read off those files before it was asserted.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVERYTHING,
  achievementPct,
  bookIndex,
  bookTally,
  counterIds,
  familyHasCounter,
  mobIndex,
  namedAchievement,
  namedMobs,
  namedZone,
  progressText,
  railFamilies,
  shownCount,
  visibleSections,
  type BookFilters,
  type Located
} from '../src/shared/achievements/bookRows'
import {
  achievementBook,
  componentSubject,
  componentText,
  isOptional,
  isOwnAchievementsDump,
  splitCategory,
  type BookComponent
} from '../src/shared/outputs/achievementBook'
import { parseAchievementsDump } from '../src/shared/outputs/achievements'
import { slayerRecord } from '../src/shared/outputs/slayer'
import { counterId } from '../src/shared/slayer/slayerPlan'
import type { MobEntry } from '../src/shared/mobTypes'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const dump = (name: string): ReturnType<typeof parseAchievementsDump> =>
  parseAchievementsDump(readFileSync(join(FIXTURES, name), 'utf8'))
const FULL_DUMP = dump('Primitive_freeport-Achievements.txt')
const FULL = achievementBook(FULL_DUMP)
const OPEN = achievementBook(dump('slayer-open-Achievements.txt'))
const INDEX = bookIndex(FULL)

const at = (name: string): Located => {
  const found = INDEX.get(name.toLowerCase())
  assert.ok(found, `${name} is in the fixture`)
  return found
}
const line = (text: string, more: Partial<BookComponent> = {}): BookComponent => ({
  line: text,
  done: false,
  ...more
})
const SHOW_ALL: BookFilters = {
  scope: EVERYTHING,
  query: '',
  open: true,
  complete: true,
  sort: 'game'
}

// ---------------------------------------------------------------------------
// THE TREE
// ---------------------------------------------------------------------------

test('the families are the five the window lists, in its order, each with its groups', () => {
  const families = railFamilies(FULL)
  assert.deepEqual(
    families.map((f) => [f.name, f.groups.map((g) => g.group.name)]),
    [
      ['Untapped Potential', ['Races', 'Classes', 'Deity']],
      ['General', ['Advancement', 'Keys', 'Level', 'Skills']],
      [
        'Tradeskill',
        [
          'Baking',
          'Blacksmithing',
          'Brewing',
          'Fishing',
          'Fletching',
          'Jewelcrafting',
          'Pottery',
          'Tailoring',
          'Special'
        ]
      ],
      ['Slayer', ['General', 'Conquest', 'Special', 'Skill']],
      ['EverQuest', ['General', 'Progression', 'Exploration', 'Keys', 'Raids', 'Hunter']]
    ]
  )
  assert.deepEqual(
    families.map((f) => f.tally),
    [
      { done: 4, total: 49 },
      { done: 21, total: 33 },
      { done: 0, total: 52 },
      { done: 19, total: 123 },
      { done: 76, total: 244 }
    ]
  )
})

test('every row of the dump is in the tree: nothing is projected away', () => {
  const achievements = FULL.groups.flatMap((g) => g.achievements)
  const lines = achievements.flatMap((a) => a.components)
  assert.equal(achievements.length, FULL_DUMP.rows.filter((r) => r.component === undefined).length)
  assert.equal(lines.length, FULL_DUMP.rows.filter((r) => r.component !== undefined).length)
  assert.equal(achievements.length, 501)
})

test('a header splits at its colon, and one without a colon is a family of its own', () => {
  assert.deepEqual(splitCategory('Slayer: Conquest'), { family: 'Slayer', name: 'Conquest' })
  assert.deepEqual(splitCategory('Untapped Potential: Deity'), {
    family: 'Untapped Potential',
    name: 'Deity'
  })
  assert.deepEqual(splitCategory('Seasonal'), { family: 'Seasonal', name: '' })
})

test('the Keys are printed under two groups and counted once', () => {
  const keys = FULL.groups.filter((g) => g.name === 'Keys')
  assert.deepEqual(
    keys.map((g) => g.category),
    ['General: Keys', 'EverQuest: Keys']
  )
  assert.deepEqual(
    keys[0].achievements.map((a) => a.name),
    keys[1].achievements.map((a) => a.name)
  )
  // 501 printed less the four printed twice; 120 complete less the two complete keys.
  assert.deepEqual(bookTally(INDEX), { done: 118, total: 497 })
  assert.equal(at('Hole Key').group.category, 'General: Keys')
})

test('a file of open achievements says nothing is done, and holds only what it printed', () => {
  assert.deepEqual(bookTally(bookIndex(OPEN)), { done: 0, total: 86 })
  assert.deepEqual(
    OPEN.groups.map((g) => g.category),
    ['Slayer: General', 'Slayer: Conquest', 'Slayer: Special', 'Slayer: Skill']
  )
})

test("an achievement's status is its own row's, whatever its lines say", () => {
  // The confirmed class: complete, with its token line still open (achievements.ts).
  const paladin = at('Primary Class Unlock - Paladin').achievement
  assert.equal(paladin.done, true)
  assert.equal(
    paladin.components.some((c) => !c.done),
    true
  )
  assert.equal(achievementPct(paladin, INDEX), 100)
  assert.equal(progressText(paladin), 'Complete')
})

// ---------------------------------------------------------------------------
// WHAT A LINE SAYS
// ---------------------------------------------------------------------------

test('a line is shown without its (Optional), and keeps it in the record', () => {
  const optional = line('(Optional) Hunter of The Planes')
  assert.equal(isOptional(optional), true)
  assert.equal(componentText(optional), 'Hunter of The Planes')
  assert.equal(optional.line, '(Optional) Hunter of The Planes')
  assert.equal(isOptional(line('Hunter of Odus')), false)
  const printed = FULL.groups.flatMap((g) => g.achievements.flatMap((a) => a.components))
  assert.equal(printed.filter(isOptional).length, 7)
})

test('a line names an achievement quoted, bare, or after (Optional)', () => {
  assert.equal(componentSubject(line('Complete the achievement "Bat Country!"')), 'Bat Country!')
  assert.equal(
    componentSubject(line('(Optional) Complete the achievement "Bunnyslayer"')),
    'Bunnyslayer'
  )
  assert.equal(componentSubject(line('Hunter of Crushbone')), 'Hunter of Crushbone')
})

test('a line that names another achievement joins to it, across case and a closing period', () => {
  const force = at('A Force of Nature').achievement
  const named = (text: string): string | undefined =>
    namedAchievement(line(text), force, INDEX)?.achievement.name
  assert.equal(named('Complete the achievement "Pesticide"'), 'Pesticide')
  assert.equal(named('Complete the achievement "We are the dead!"'), 'We Are the Dead!')
  assert.equal(named('Hunter of Crushbone'), 'Hunter of Crushbone')
  assert.equal(named('Complete the achievement "No Such Achievement"'), undefined)
})

test("a line that repeats its achievement's own name names nothing further", () => {
  const { achievement } = at('Arcane Scientists')
  assert.equal(achievement.components.length, 1)
  assert.equal(namedAchievement(achievement.components[0], achievement, INDEX), null)
})

test('Megadeath is a tree: every line of it opens into an achievement with lines of its own', () => {
  const mega = at('Megadeath').achievement
  const below = mega.components.map((c) => namedAchievement(c, mega, INDEX))
  assert.deepEqual(
    below.map((l) => l?.achievement.name),
    ['A Force of Nature', 'Highly Decorated', 'Progressive']
  )
  const force = at('A Force of Nature').achievement
  const pesticide = force.components
    .map((c) => namedAchievement(c, force, INDEX))
    .find((l) => l?.achievement.name === 'Pesticide')
  assert.equal(pesticide?.group.category, 'Slayer: Conquest')
  assert.equal(pesticide?.achievement.components[0].need, 5000)
})

// ---------------------------------------------------------------------------
// HOW FAR ALONG
// ---------------------------------------------------------------------------

test('a counter is its fraction, and the text is the counter', () => {
  const bats = at('Bat Country!').achievement
  assert.equal(achievementPct(bats, INDEX), 43)
  assert.equal(progressText(bats), '43 of 100')
  assert.equal(progressText(at('Pesticide').achievement), '257 of 5,000')
})

test('several lines are counted, and one plain line has nothing to count', () => {
  assert.equal(progressText(at('Faydwer Explorer').achievement), '13 of 15')
  assert.equal(progressText(at("Conqueror of Nagafen's Lair").achievement), '')
})

test('a line naming an achievement is as far along as that achievement is', () => {
  // None of Megadeath's three lines is done, and the counters under them have moved.
  const mega = at('Megadeath').achievement
  assert.equal(progressText(mega), '0 of 3')
  const pct = achievementPct(mega, INDEX)
  assert.ok(pct > 0 && pct < 100, `Megadeath at ${String(pct)}`)
  const parts = mega.components.map((c) => {
    const named = namedAchievement(c, mega, INDEX)
    assert.ok(named)
    return achievementPct(named.achievement, INDEX)
  })
  assert.ok(Math.abs(pct - (parts[0] + parts[1] + parts[2]) / 3) < 1e-9)
})

test('an optional line is left out of the figure unless every line is optional', () => {
  const index = bookIndex({ groups: [] })
  const a = {
    name: 'A',
    done: false,
    components: [line('One', { done: true }), line('(Optional) Two')]
  }
  assert.equal(achievementPct(a, index), 100)
  assert.equal(progressText(a), '')
  const b = { name: 'B', done: false, components: [line('(Optional) One'), line('(Optional) Two')] }
  assert.equal(achievementPct(b, index), 0)
  assert.equal(progressText(b), '0 of 2')
})

test('achievements that name each other in a circle still answer', () => {
  const circle = achievementBook({
    rows: [
      { category: 'X: Y', achievement: 'Ouro', status: 'incomplete' },
      { category: 'X: Y', achievement: 'Ouro', component: 'Boros', status: 'incomplete' },
      { category: 'X: Y', achievement: 'Boros', status: 'incomplete' },
      { category: 'X: Y', achievement: 'Boros', component: 'Ouro', status: 'incomplete' }
    ]
  })
  assert.equal(achievementPct(circle.groups[0].achievements[0], bookIndex(circle)), 0)
})

// ---------------------------------------------------------------------------
// THE KILL COUNTERS, MOBS AND ZONES
// ---------------------------------------------------------------------------

test('the open counters carry the ids the Slayer plan knows them by', () => {
  for (const [book, rows] of [
    [FULL, FULL_DUMP],
    [OPEN, dump('slayer-open-Achievements.txt')]
  ] as const) {
    const plan = slayerRecord(rows).counters.map(counterId).sort()
    const here = book.groups
      .flatMap((g) => g.achievements.flatMap((a) => counterIds(g, a)))
      .sort()
    assert.deepEqual(here, plan)
  }
  const people = at("I'm a People Person!")
  assert.equal(counterIds(people.group, people.achievement).length, 7)
  const nagafen = at("Conqueror of Nagafen's Lair")
  assert.deepEqual(counterIds(nagafen.group, nagafen.achievement), [])
})

test("a line that is a mob's whole name finds the catalog's mobs of that name", () => {
  const mob = (name: string, page: string): MobEntry => ({ name, page })
  const mobs = mobIndex([
    mob('Lord Nagafen', 'Lord Nagafen'),
    mob('orc warlord', 'Orc warlord'),
    mob('a bandit', 'A bandit (West Karana)'),
    mob('a bandit', 'A bandit (Lake Rathetear)')
  ])
  assert.deepEqual(
    namedMobs(line('Lord Nagafen'), mobs).map((m) => m.page),
    ['Lord Nagafen']
  )
  assert.equal(namedMobs(line('(Optional) Orc Warlord'), mobs).length, 1)
  assert.equal(namedMobs(line('a bandit'), mobs).length, 2)
  assert.equal(namedMobs(line('Lord Nagafen the Second'), mobs).length, 0)
})

test("an achievement's name points at a map when it names a zone the table knows", () => {
  assert.equal(namedZone('Hunter of Crushbone'), 'crushbone')
  assert.equal(namedZone('Crushbone Traveler'), 'crushbone')
  assert.equal(namedZone("Conqueror of Nagafen's Lair"), 'soldungb')
  // A continent is not a zone, and most names are not shaped like one at all.
  assert.equal(namedZone('Hunter of Faydwer'), null)
  assert.equal(namedZone('Bat Country!'), null)
})

// ---------------------------------------------------------------------------
// THE LIST
// ---------------------------------------------------------------------------

test('the scope is everything, a family, or one group of it', () => {
  const shown = (scope: BookFilters['scope']): number =>
    shownCount(visibleSections(FULL, INDEX, { ...SHOW_ALL, scope }))
  assert.equal(shown(EVERYTHING), 501)
  assert.equal(shown({ family: 'Slayer', category: null }), 123)
  assert.equal(shown({ family: 'Slayer', category: 'Slayer: Skill' }), 70)
})

test('the two Show switches are the window\'s, and both off shows nothing', () => {
  const scope = { family: 'Slayer', category: 'Slayer: Skill' }
  const shown = (open: boolean, complete: boolean): number =>
    shownCount(visibleSections(FULL, INDEX, { ...SHOW_ALL, scope, open, complete }))
  assert.equal(shown(true, false), 53)
  assert.equal(shown(false, true), 17)
  assert.equal(shown(false, false), 0)
})

test('a search reads names and requirement lines, in every group, and keeps the headings', () => {
  const sections = visibleSections(FULL, INDEX, { ...SHOW_ALL, query: ' Nagafen ' })
  assert.deepEqual(
    sections.map((s) => [s.group.category, s.achievements.map((a) => a.name)]),
    [
      ['EverQuest: General', ['Conqueror of Norrath']],
      ['EverQuest: Exploration', ['Northeast Antonica Explorer', "Nagafen's Lair Traveler"]],
      ['EverQuest: Raids', ["Conqueror of Nagafen's Lair"]],
      ['EverQuest: Hunter', ['Hunter of Northeast Antonica', "Hunter of Nagafen's Lair"]]
    ]
  )
  assert.equal(shownCount(visibleSections(FULL, INDEX, { ...SHOW_ALL, query: 'bats skill' })), 1)
})

test('closest first puts the nearest to done on top, inside its own group', () => {
  const open: BookFilters = {
    ...SHOW_ALL,
    scope: { family: 'Slayer', category: 'Slayer: Skill' },
    complete: false
  }
  const [skill] = visibleSections(FULL, INDEX, { ...open, sort: 'closest' })
  assert.deepEqual(
    skill.achievements.slice(0, 3).map((a) => a.name),
    ['Oh the Humanity!', 'Round of Applause', 'Denizens of Fear']
  )
  // The file's own order is left as it was, and is what the other order shows.
  const [game] = visibleSections(FULL, INDEX, open)
  assert.deepEqual(
    game.achievements,
    skill.group.achievements.filter((a) => !a.done)
  )
  assert.notDeepEqual(game.achievements, skill.achievements)
  // What is finished is shown after what is still work.
  const [both] = visibleSections(FULL, INDEX, { ...open, complete: true, sort: 'closest' })
  assert.equal(both.achievements[0].name, 'Oh the Humanity!')
  assert.deepEqual(
    both.achievements.map((a) => a.done),
    [...Array<boolean>(53).fill(false), ...Array<boolean>(17).fill(true)]
  )
})

test('the plan is offered in a family that holds a counter, and nowhere else', () => {
  assert.equal(familyHasCounter(FULL, 'Slayer'), true)
  assert.equal(familyHasCounter(OPEN, 'Slayer'), true)
  assert.equal(familyHasCounter(FULL, 'EverQuest'), false)
  assert.equal(familyHasCounter(FULL, 'Tradeskill'), false)
  assert.equal(familyHasCounter(FULL, null), false)
})

test("another character's dump is not this character's, whatever discovery fell back to", () => {
  const own = 'C:\\EQ\\Primitive_freeport-Achievements.txt'
  assert.equal(isOwnAchievementsDump(own, 'Primitive', 'freeport'), true)
  assert.equal(isOwnAchievementsDump(own, 'primitive', 'Freeport'), true)
  assert.equal(isOwnAchievementsDump('/eq/Primitive-Achievements.txt', 'Primitive'), true)
  assert.equal(isOwnAchievementsDump(own, 'Garrett', 'freeport'), false)
  // A character whose name is not known owns whatever was found: the one-character machine.
  assert.equal(isOwnAchievementsDump(own, undefined), true)
})
