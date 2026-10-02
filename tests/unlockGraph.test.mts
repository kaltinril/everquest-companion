// ============================================================================
// THE UNLOCK GRAPH — the committed rulebook and what a faction, item, task or quest is on the way to.
// ============================================================================
//
// The rulebook is generated from the committed fixture (scripts/gen-unlock-rules.mts), and the
// first test below regenerates it in memory and demands equality, so a hand edit of the generated
// file, or a fixture that moved under it, fails here rather than drifting.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { achievementBook } from '../src/shared/outputs/achievementBook'
import { parseAchievementsDump } from '../src/shared/outputs/achievements'
import { factionNameKey, parseFactionsDump } from '../src/shared/outputs/factions'
import {
  TASK_PARTS,
  UNLOCK_TOKENS,
  distinctPaths,
  rulesOf,
  unlockAchievementName,
  unlockRule,
  unlocksNeedingFaction,
  unlocksNeedingItem,
  unlocksNeedingQuest,
  unlocksNeedingTask
} from '../src/shared/unlocks/unlockGraph'
import { UNLOCK_RULES } from '../src/shared/unlocks/unlockRules.generated'
import { unlockBook, unlocksFromRules } from '../src/shared/unlocks/unlocks'
import { achievementSpellings } from '../src/renderer/src/features/unlocks/itemSpellings'

const FIXTURES = join(import.meta.dirname, 'fixtures')

test('the rulebook is the fixture, line for line', () => {
  const dump = parseAchievementsDump(
    readFileSync(join(FIXTURES, 'Primitive_freeport-Achievements.txt'), 'utf8')
  )
  const book = unlockBook(achievementBook(dump))
  const regenerated = [...book.races, ...book.classes, ...book.deities].map((u) => ({
    kind: u.kind,
    name: u.name,
    needs: u.needs.map((n) => ({ kind: n.kind, subject: n.subject, text: n.text }))
  }))
  assert.deepEqual(UNLOCK_RULES, regenerated)
  assert.equal(rulesOf('race').length, 16)
  assert.equal(rulesOf('class').length, 16)
  assert.equal(rulesOf('deity').length, 17)
})

test('a faction is on the way to the races that want it at maximum', () => {
  const kaladim = unlocksNeedingFaction('merchants of kaladim')
  assert.deepEqual(
    kaladim.map((p) => [p.unlock.kind, p.unlock.name, p.need.kind]),
    [['race', 'Dwarf', 'faction']]
  )
  assert.equal(kaladim[0].need.text, 'Get maximum faction with Merchants of Kaladim.')
  assert.deepEqual(unlocksNeedingFaction('Kerra Isle'), [])
})

test('every faction the rulebook names finds its row in the real factions dump', () => {
  const dump = parseFactionsDump(readFileSync(join(FIXTURES, 'Drywrought_oggok-WAR-Factions.txt'), 'utf8'))
  const keys = new Set(dump.map((r) => factionNameKey(r.name)))
  const subjects = UNLOCK_RULES.flatMap((r) => r.needs.filter((n) => n.kind === 'faction').map((n) => n.subject))
  assert.equal(subjects.length, 40)
  assert.deepEqual(subjects.filter((s) => !keys.has(factionNameKey(s))), [])
  // The dump's own spelling of a faction the achievements dump spells differently finds the race.
  assert.deepEqual(unlocksNeedingFaction('DaBashers').map((p) => p.unlock.name), ['Troll'])
  assert.deepEqual(unlocksNeedingFaction('The Freeport Militia').map((p) => p.unlock.name), ['Human (Freeport)'])
})

test('a Sky reward is on the way to its class, by the dump\'s spelling', () => {
  assert.deepEqual(
    unlocksNeedingItem('Mask of Song').map((p) => p.unlock.name),
    ['Bard']
  )
  assert.deepEqual(
    unlocksNeedingItem('windhowl and spirit render').map((p) => p.unlock.name),
    ['Beastlord']
  )
  assert.deepEqual(unlocksNeedingItem('Windhowl'), [])
})

test('an item page finds its class through the Sky alias: either half of the Beastlord pair', () => {
  // What unlockJoins.ts itemUnlockPaths asks the graph: the page's name and its achievement spellings.
  const viaPage = (page: string): string[][] =>
    [page, ...achievementSpellings(page)].flatMap((n) => unlocksNeedingItem(n)).map((p) => [p.unlock.name, p.need.subject])
  for (const page of ['Windhowl', 'Spirit Render', 'spirit  render']) {
    assert.deepEqual(viaPage(page), [['Beastlord', 'Windhowl and Spirit Render']], page)
  }
  assert.deepEqual(achievementSpellings('Mask of Song'), [])
  assert.deepEqual(viaPage('Mask of Song'), [['Bard', 'Mask of Song']])
  assert.deepEqual(achievementSpellings('Spirit'), [])
})

test('a task is on the way to its unlock, and so is each quest the task is made of', () => {
  assert.deepEqual(
    unlocksNeedingTask('Renouncing Your Faith').map((p) => p.unlock.name),
    ['Agnostic']
  )
  assert.deepEqual(
    unlocksNeedingQuest('renouncing your faith').map((p) => p.unlock.name),
    ['Agnostic']
  )
  for (const part of TASK_PARTS['Aid the Kerrans of Kerra Isle']) {
    assert.deepEqual(
      unlocksNeedingQuest(part).map((p) => [p.unlock.name, p.need.subject]),
      [['Kerran', 'Aid the Kerrans of Kerra Isle']],
      part
    )
  }
  assert.deepEqual(unlocksNeedingQuest('Fish Dinner Deluxe'), [])
})

test('the same unlock and line once, whatever asked twice', () => {
  const twice = [...unlocksNeedingItem('Mask of Song'), ...unlocksNeedingItem('Mask of Song')]
  assert.equal(distinctPaths(twice).length, 1)
})

test('a rule is found by name across case, and named as the achievement is', () => {
  assert.equal(unlockRule('race', 'half elf')?.name, 'Half Elf')
  assert.equal(unlockRule('deity', 'Nobody'), undefined)
  assert.equal(unlockAchievementName({ kind: 'class', name: 'Shadowknight' }), 'Primary Class Unlock - Shadowknight')
  assert.equal(unlockAchievementName({ kind: 'deity', name: 'Cazic Thule' }), 'Deity Unlock - Cazic Thule')
})

test('the rulebook as a book claims nothing: every unlock closed, no line done, no way in', () => {
  const book = unlocksFromRules(UNLOCK_RULES)
  assert.equal(book.races.length + book.classes.length + book.deities.length, 49)
  const all = [...book.races, ...book.classes, ...book.deities]
  assert.equal(all.every((u) => !u.open && u.how === null && u.done === 0), true)
  assert.equal(all.every((u) => u.needs.every((n) => !n.done)), true)
  assert.deepEqual([book.deity, book.primaryClass, book.createdAs], [null, null, null])
  assert.deepEqual(Object.values(UNLOCK_TOKENS), [
    'Race Unlock Token',
    'Primary Class Unlock Token',
    'Deity Unlock Token'
  ])
})
