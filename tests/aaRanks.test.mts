// The rank a character holds per AA row (src/shared/aaRanks.ts): the player's pick, else the log's
// top rank, else 0; the log wins over the wiki on the top rank and the name shown.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aaClassGroups,
  aaFold,
  aaKey,
  aaPointsSpent,
  aaRankCosts,
  aaRankOf,
  aaUnplaced,
  rankAas,
  sanitizeAaPicks,
  withAaPick
} from '../src/shared/aaRanks'
import { aaLogAas, editDistance } from '../src/shared/aaLogMatch'
import { AA_TABLE, type AaTableRow } from '../src/shared/aaTable.generated'
import type { AASpendEvent } from '../src/shared/types'

const T = Date.parse('2026-11-12T18:00:00')

const TABLE: AaTableRow[] = [
  { section: 'general', name: "Warrior's Endurance", ranks: 3, cost: '2/4/6', text: 'x' },
  { section: 'general', name: 'Packrat', ranks: 10, cost: '1 for all ranks', text: 'x' },
  { section: 'general', name: 'Turn Summoned', ranks: 3, cost: '3/6/?', text: 'x' },
  { section: 'class', class: 'Druid', name: 'Quick Evacuation', ranks: 3, cost: '3/6/9', text: 'x' },
  { section: 'class', class: 'Wizard', name: 'Quick Evacuation', ranks: 3, cost: '3/6/9', text: 'x' },
  { section: 'class', class: 'Warrior', name: 'Rampage', ranks: 1, cost: '5', text: 'x' },
  { section: 'special', name: 'Class Reincarnation: Monk', ranks: 3, cost: '', values: ['2', '4', '6'], text: 'x' },
  { section: 'special', name: 'Class Reincarnation: Human', ranks: 3, cost: '', values: ['5', '10', '15'], text: 'x' },
  { section: 'special', name: 'Class Reincarnation: Half Elf', ranks: 3, cost: '', values: ['3', '6', '9'], text: 'x' }
]

const spend = (ability: string, rank?: number, cost = 1): AASpendEvent =>
  rank === undefined ? { ts: T, ability, cost } : { ts: T + rank, ability: `${ability} ${String(rank)}`, cost, rank }

const SPENDS: AASpendEvent[] = [
  spend('Warriors Endurance'),
  spend('Warriors Endurance', 2),
  spend('Rampage'),
  spend('Rampage', 2),
  spend('Class Reincarnation: Monk', 2, 0),
  spend('Race Reincarnation: Half Elf', undefined, 0),
  spend('Unbound Strikethrough')
]

test('the log rank fills a row, matched without case or apostrophes', () => {
  const ranked = rankAas(SPENDS, {}, [], TABLE)
  const by = new Map(ranked.map((r) => [r.key, r]))
  assert.deepEqual([by.get("Warrior's Endurance")?.rank, by.get("Warrior's Endurance")?.source], [2, 'log'])
  assert.equal(by.get('Class Reincarnation: Monk')?.rank, 2)
  assert.deepEqual([by.get('Packrat')?.rank, by.get('Packrat')?.source, by.get('Packrat')?.logRank], [0, 'none', null])
})

test('THE LOG WINS: a log rank above the wiki count is held, and is the top of the picker', () => {
  const ranked = rankAas(SPENDS, {}, [], TABLE)
  const rampage = ranked.find((r) => r.key === 'Rampage')
  // The log says rank 2; the wiki lists one.
  assert.deepEqual([rampage?.rank, rampage?.max, rampage?.logRank], [2, 2, 2])
  assert.equal(ranked.find((r) => r.key === 'Packrat')?.max, 10)
  const picked = rankAas(SPENDS, { Rampage: 9 }, [], TABLE)
  assert.equal(aaRankOf(picked, 'Rampage'), 2, 'a pick is held to the larger of the two')
})

test('a log name a couple of edits from one wiki row is that row, shown by the log name', () => {
  const table: AaTableRow[] = [
    { section: 'class', class: 'Ranger', name: 'Unbounded Strikethrough', ranks: 3, cost: '0', text: 'x' },
    { section: 'general', name: 'Fear Resistance', ranks: 4, cost: '2/4/6/9', text: 'x' }
  ]
  const ranked = rankAas([spend('Unbound Strikethrough'), spend('Unbound Strikethrough', 2)], {}, [], table)
  assert.equal(ranked.length, 2, 'no row of its own')
  assert.deepEqual(
    { key: ranked[0].key, wiki: ranked[0].wikiName, rank: ranked[0].rank, unlisted: ranked[0].unlisted },
    { key: 'Unbound Strikethrough', wiki: 'Unbounded Strikethrough', rank: 2, unlisted: false }
  )
  assert.equal(ranked[1].wikiName, null)
  assert.deepEqual(aaUnplaced([spend('Unbound Strikethrough')], table), [])
  assert.equal(editDistance(aaFold('Unbound Strikethrough'), aaFold('Unbounded Strikethrough')), 2)
})

test('a near name that ties between two rows, or is too far, matches neither', () => {
  const table: AaTableRow[] = [
    { section: 'general', name: 'Spell Mastery A', ranks: 1, cost: '1', text: 'x' },
    { section: 'general', name: 'Spell Mastery B', ranks: 1, cost: '1', text: 'x' }
  ]
  const tie = rankAas([spend('Spell Mastery C')], {}, [], table)
  assert.deepEqual(tie.map((r) => [r.key, r.rank, r.unlisted]), [['Spell Mastery A', 0, false], ['Spell Mastery B', 0, false], ['Spell Mastery C', 1, true]])
  assert.deepEqual(aaUnplaced([spend('Spell Mastery Zzz')], table), ['Spell Mastery Zzz'])
  // A row the log already names exactly is not taken again by a near name.
  const taken = rankAas([spend('Spell Mastery A'), spend('Spell Mastery Q')], {}, [], table.slice(0, 1))
  assert.deepEqual(taken.map((r) => [r.key, r.unlisted]), [['Spell Mastery A', false], ['Spell Mastery Q', true]])
})

test('a log AA the wiki lacks gets a General row of its own, rank from the log, and can be picked', () => {
  const ranked = rankAas(SPENDS, {}, [], TABLE)
  const own = ranked.filter((r) => r.unlisted)
  assert.deepEqual(own.map((r) => [r.key, r.row.section, r.rank, r.max, r.source, r.wikiName]), [['Unbound Strikethrough', 'general', 1, 1, 'log', null]])
  assert.equal(ranked[ranked.length - 1].key, 'Unbound Strikethrough', 'after the wiki rows')
  assert.equal(aaRankOf(rankAas(SPENDS, { 'Unbound Strikethrough': 0 }, [], TABLE), 'Unbound Strikethrough'), 0)
})

test('a race row is shown and stored as the log writes it, and answers to either spelling', () => {
  const human = TABLE[7]
  assert.equal(aaKey(human), 'Race Reincarnation: Human')
  assert.equal(aaKey(TABLE[6]), 'Class Reincarnation: Monk')
  const ranked = rankAas(SPENDS, {}, [], TABLE)
  assert.equal(aaRankOf(ranked, 'Race Reincarnation: Half Elf'), 1)
  const wikiSpelling = rankAas([spend('Class Reincarnation: Human', 2, 0)], {}, [], TABLE)
  assert.equal(aaRankOf(wikiSpelling, 'Race Reincarnation: Human'), 2)
})

test('a race line states no rank: each reincarnation into the race counts one', () => {
  assert.equal(aaLogAas(SPENDS, ['Half Elf', 'Iksar', 'Half Elf', null]).get('race reincarnation: half elf')?.rank, 2)
  const ranked = rankAas(SPENDS, {}, ['Half Elf', 'Half Elf', 'Half Elf', 'Half Elf'], TABLE)
  assert.equal(aaRankOf(ranked, 'Race Reincarnation: Half Elf'), 4, 'the log wins over the wiki count')
  const elf = ranked.find((r) => r.key === 'Race Reincarnation: Half Elf')
  assert.equal(elf?.wikiName, 'Class Reincarnation: Half Elf')
})

test("the player's pick wins over the log, 0 included, and is capped", () => {
  const ranked = rankAas(SPENDS, { "Warrior's Endurance": 0, Packrat: 99, 'Race Reincarnation: Human': 2 }, [], TABLE)
  const by = new Map(ranked.map((r) => [r.key, r]))
  assert.deepEqual([by.get("Warrior's Endurance")?.rank, by.get("Warrior's Endurance")?.source, by.get("Warrior's Endurance")?.logRank], [0, 'pick', 2])
  assert.equal(by.get('Packrat')?.rank, 10)
  assert.equal(aaRankOf(ranked, 'Race Reincarnation: Human'), 2)
  assert.equal(aaRankOf(ranked, 'No Such AA'), 0)
})

test('log names no row answers to are listed', () => {
  assert.deepEqual(aaUnplaced(SPENDS, TABLE), ['Unbound Strikethrough'])
})

test('rank costs read the Cost cell; points count an AA in two class tables once', () => {
  assert.deepEqual(aaRankCosts(TABLE[0]), [2, 4, 6])
  assert.deepEqual(aaRankCosts(TABLE[1]).slice(0, 3), [1, 1, 1])
  assert.deepEqual(aaRankCosts(TABLE[2]), [3, 6, null])
  assert.deepEqual(aaRankCosts({ ...TABLE[0], ranks: 3, cost: '0' }), [0, 0, 0])
  const ranked = rankAas(SPENDS, { 'Quick Evacuation': 2, Packrat: 4, 'Turn Summoned': 3 }, [], TABLE)
  // 2+4 (Endurance) + 4 (Packrat) + 3+6 (Turn Summoned, rank 3 unpriced) + 3+6 (Quick Evacuation once)
  // + 5 (Rampage; its log rank 2 has no wiki price) + Unbound Strikethrough (not on the wiki, unpriced)
  assert.deepEqual(aaPointsSpent(ranked), { points: 33, unknown: 3 })
})

test('the class tables: mine first, the rest only with all', () => {
  const ranked = rankAas([], {}, [], TABLE)
  assert.deepEqual(aaClassGroups(ranked, ['WIZ'], false).map((g) => g.cls), ['Wizard'])
  assert.deepEqual(aaClassGroups(ranked, ['WIZ'], true).map((g) => [g.cls, g.mine]), [['Wizard', true], ['Druid', false], ['Warrior', false]])
})

test('picks are stored per character and cleared back to the log', () => {
  let all = withAaPick({}, 'Drywrought', 'Packrat', 3)
  all = withAaPick(all, 'Malkil', 'Packrat', 1)
  assert.deepEqual(all, { Drywrought: { Packrat: 3 }, Malkil: { Packrat: 1 } })
  all = withAaPick(all, 'Malkil', 'Packrat', null)
  assert.deepEqual(all, { Drywrought: { Packrat: 3 } })
  assert.deepEqual(sanitizeAaPicks({ A: { x: 2, y: -1, z: 1.5, w: 'no' }, B: [], C: null }), { A: { x: 2 } })
  assert.deepEqual(sanitizeAaPicks('junk'), {})
})

test('on the committed table every race row has the log spelling and Human and Half Elf exist', () => {
  const keys = new Set(rankAas([], {}).map((r) => r.key))
  assert.ok(keys.has('Race Reincarnation: Human') && keys.has('Race Reincarnation: Half Elf'))
  assert.ok(keys.has('Class Reincarnation: Shadow Knight'))
  assert.ok(!keys.has('Class Reincarnation: Human'))
  assert.ok(AA_TABLE.filter((r) => aaKey(r).startsWith('Race Reincarnation:')).length >= 16, 'the 16 race rows of the 2026-11-25 cache')
})

test('on the committed table the log name Unbound Strikethrough is the Ranger row', () => {
  const r = rankAas([spend('Unbound Strikethrough')], {}).find((x) => x.wikiName === 'Unbounded Strikethrough')
  assert.deepEqual([r?.key, r?.row.class, r?.rank, r?.unlisted], ['Unbound Strikethrough', 'Ranger', 1, false])
})
