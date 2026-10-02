// ============================================================================
// THE UNLOCKS TAB'S DATA LAYER — the three unlock families read as what each still needs.
// ============================================================================
//
// The committed fixture (`Primitive_freeport-Achievements.txt`, 2026-08-20) prints every
// requirement line of the three `Untapped Potential` groups: 40 faction lines and one task
// under the races, 95 reward lines under the classes, one task and sixteen placeholders under
// the deities, and the created-as, confirm and token lines beside them. Every count below was
// read off that file before it was asserted; `unlocks.ts`'s header lists the line shapes.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { achievementBook } from '../src/shared/outputs/achievementBook'
import { parseAchievementsDump } from '../src/shared/outputs/achievements'
import {
  closedOf,
  countedNeeds,
  howText,
  isYours,
  openText,
  overlayUnlockBook,
  unlockBook,
  unlocksFromRules,
  type Unlock
} from '../src/shared/unlocks/unlocks'
import { UNLOCK_RULES } from '../src/shared/unlocks/unlockRules.generated'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const TEXT = readFileSync(join(FIXTURES, 'Primitive_freeport-Achievements.txt'), 'utf8')
const BOOK = unlockBook(achievementBook(parseAchievementsDump(TEXT)))
const by = (list: readonly Unlock[], name: string): Unlock => {
  const found = list.find((u) => u.name === name)
  assert.ok(found, `${name} is in the fixture`)
  return found
}

test('the three families are read whole, and every line is a requirement or a way in', () => {
  assert.equal(BOOK.races.length, 16)
  assert.equal(BOOK.classes.length, 16)
  assert.equal(BOOK.deities.length, 17)
  const kinds = (list: readonly Unlock[]): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const u of list) for (const n of u.needs) out[n.kind] = (out[n.kind] ?? 0) + 1
    return out
  }
  // Half Elf's one line: it opens with Human or Wood Elf, which is shown as what it needs.
  assert.deepEqual(kinds(BOOK.races), { faction: 40, task: 1, other: 1 })
  assert.deepEqual(kinds(BOOK.classes), { reward: 95 })
  assert.deepEqual(kinds(BOOK.deities), { task: 1, placeholder: 16 })
})

test('what the file says about the character: created as, confirmed class, confirmed deity', () => {
  assert.equal(BOOK.createdAs, 'Froglok')
  // The created-as line names the bare race; the Human unlocks carry a city.
  assert.equal(isYours('Froglok', BOOK.createdAs), true)
  assert.equal(isYours('Human (Freeport)', 'Human'), true)
  assert.equal(isYours('Human (Qeynos)', 'Human'), true)
  assert.equal(isYours('Half Elf', 'Human'), false)
  assert.equal(isYours('Humanoid', 'Human'), false)
  assert.equal(isYours('Froglok', null), false)
  assert.equal(BOOK.primaryClass, 'Paladin')
  assert.equal(BOOK.deity, 'Mithaniel Marr')
})

test('an open unlock says how it opened, in the file\'s own words', () => {
  assert.deepEqual(
    BOOK.races.filter((u) => u.open).map((u) => [u.name, u.how]),
    [
      ['Froglok', 'created'],
      ['Ogre', 'token']
    ]
  )
  assert.deepEqual(
    BOOK.classes.filter((u) => u.open).map((u) => [u.name, u.how]),
    [['Paladin', 'confirmed']]
  )
  assert.deepEqual(
    BOOK.deities.filter((u) => u.open).map((u) => [u.name, u.how]),
    [['Mithaniel Marr', 'confirmed']]
  )
  assert.equal(by(BOOK.races, 'Barbarian').how, null)
  assert.equal(by(BOOK.races, 'Half Elf').needs[0].kind, 'other')
})

test('a faction line carries the faction, and its status is the server\'s', () => {
  const barbarian = by(BOOK.races, 'Barbarian')
  assert.deepEqual(
    barbarian.needs.map((n) => [n.kind, n.subject, n.done]),
    [
      ['faction', 'Rogues of the White Rose', false],
      ['faction', 'Wolves of the North', false],
      ['faction', 'Merchants of Halas', false]
    ]
  )
  assert.equal(barbarian.done, 0)
  assert.equal(countedNeeds(barbarian), 3)
})

test("the Kerran unlock's task line is a task, capital T and all", () => {
  const kerran = by(BOOK.races, 'Kerran')
  const task = kerran.needs.find((n) => n.kind === 'task')
  assert.equal(task?.subject, 'Aid the Kerrans of Kerra Isle')
})

test('a reward line carries the item without its period, and a granted class shows the cascade', () => {
  const paladin = by(BOOK.classes, 'Paladin')
  assert.equal(paladin.needs[0].subject, 'Girdle of Faith')
  assert.equal(paladin.needs.every((n) => n.done), true)
  const bard = by(BOOK.classes, 'Bard')
  assert.equal(bard.needs.some((n) => n.subject === 'Mask of Song'), true)
  assert.equal(bard.open, false)
})

test('a deity has a task or a placeholder, and a placeholder is not counted as work', () => {
  const agnostic = by(BOOK.deities, 'Agnostic')
  assert.deepEqual(
    agnostic.needs.map((n) => [n.kind, n.subject]),
    [['task', 'Renouncing Your Faith']]
  )
  const brell = by(BOOK.deities, 'Brell Serilis')
  assert.equal(brell.needs[0].kind, 'placeholder')
  assert.equal(countedNeeds(brell), 0)
})

test('the headings and the words', () => {
  assert.equal(openText(BOOK.races), '2 of 16 open')
  assert.equal(closedOf(BOOK.deities).length, 16)
  assert.equal(howText('created'), 'created as')
  assert.equal(howText('other-unlock'), 'with another race')
  assert.equal(howText(null), '')
})

test('the two spellings of the token line are both a way in, and a closed one names no way', () => {
  // `can by bypassed` is printed twice in the fixture, under the races.
  const closed = achievementBook({
    rows: [
      { category: 'Untapped Potential: Races', achievement: 'Race Unlock - Troll', status: 'incomplete' },
      {
        category: 'Untapped Potential: Races',
        achievement: 'Race Unlock - Troll',
        component: 'Get maximum faction with Grobb Merchants.',
        status: 'complete'
      },
      {
        category: 'Untapped Potential: Races',
        achievement: 'Race Unlock - Troll',
        component: 'This achievement can by bypassed using a Race Unlock Token.',
        status: 'incomplete'
      }
    ]
  })
  const [troll] = unlockBook(closed).races
  assert.equal(troll.open, false)
  assert.equal(troll.how, null)
  assert.deepEqual(troll.needs.map((n) => n.kind), ['faction'])
  assert.equal(troll.done, 1)
})

test('a dump the window filtered is overlaid on the rulebook: what it leaves out stays, unclaimed', () => {
  // The game's Show checkboxes decide what the file prints; a real dump came with no `C` row.
  const incomplete = TEXT.split('\n').filter((line) => !line.startsWith('C\t')).join('\n')
  const book = overlayUnlockBook(unlocksFromRules(UNLOCK_RULES), unlockBook(achievementBook(parseAchievementsDump(incomplete))))
  assert.equal(book.races.length, 16)
  assert.equal(book.classes.length, 16)
  assert.equal(book.deities.length, 17)
  // Froglok and Human (Freeport) were the open races; the filtered file never names them.
  const froglok = by(book.races, 'Froglok')
  assert.equal(froglok.known, false)
  assert.equal(froglok.needs.length, by(BOOK.races, 'Froglok').needs.length, 'the rulebook keeps its lines')
  assert.equal(openText(book.races), '0 of 16 open, 2 not in the dump')
  // A closed race the file does print is the dump's row, and a `C` line it dropped is counted out.
  const troll = by(book.races, 'Troll')
  assert.equal(troll.known, true)
  assert.equal(troll.needs.length, by(BOOK.races, 'Troll').needs.length)
  assert.equal(troll.unstated, by(BOOK.races, 'Troll').done)
  // The unfiltered file overlaid is the file: every row known, nothing unstated.
  const whole = overlayUnlockBook(unlocksFromRules(UNLOCK_RULES), BOOK)
  assert.deepEqual(whole.races, BOOK.races)
  assert.equal([...whole.classes, ...whole.deities].every((u) => u.known && u.unstated === 0), true)
})
