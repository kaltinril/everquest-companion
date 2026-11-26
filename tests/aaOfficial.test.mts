// The game's corrections over the wiki's AA table (src/shared/aaOfficial.ts): Daybreak's notes and
// the game's AA window win; the generated table stays the wiki cache's mirror.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AA_CORRECTIONS, AA_ROWS, aaMarkTip, aaMarks, applyAaCorrections, type AaRow } from '../src/shared/aaOfficial'
import { aaKey, aaPointsSpent, aaRankOf, rankAas } from '../src/shared/aaRanks'
import { AA_TABLE, type AaTableRow } from '../src/shared/aaTable.generated'
import type { AASpendEvent } from '../src/shared/types'

const T = Date.parse('2026-11-12T18:00:00')
const spend = (ability: string, rank?: number, cost = 1): AASpendEvent =>
  rank === undefined ? { ts: T, ability, cost } : { ts: T + rank, ability: `${ability} ${String(rank)}`, cost, rank }
const row = (name: string, cls?: string): AaRow => {
  const hit = AA_ROWS.find((r) => r.name === name && (cls === undefined || r.class === cls))
  assert.ok(hit, name)
  return hit
}
const fields = (r: AaRow): string[] => (r.marks ?? []).map((m) => m.field)

test('the generated table is untouched: the wiki cache still says what it said', () => {
  assert.equal(AA_TABLE.find((r) => r.name === 'Rampage')?.ranks, 1)
  assert.ok(AA_TABLE.some((r) => r.name === 'Unbounded Strikethrough'))
  assert.ok(!AA_TABLE.some((r) => r.name === 'Strike As One'))
})

test('Strike As One: a new Beastlord row, cost 6, in the class table in name order', () => {
  const r = row('Strike As One', 'Beastlord')
  assert.deepEqual([r.section, r.ranks, r.cost, fields(r)], ['class', 1, '6', ['row']])
  assert.equal(r.text, "This passive ability grants the Beastlord a chance on hit to increase their Warder's chance to flurry by 30% for 12 seconds. Requirements: Level 35.")
  const beast = AA_ROWS.filter((x) => x.class === 'Beastlord').map((x) => x.name)
  assert.deepEqual(beast.slice(-3), ['Playing Possum', 'Strike As One', 'Unbound Ferocity'])
})

test('Rampage: 2 ranks (notes), rank 2 costs 4 (the game window), rank 2 at level 40', () => {
  const r = row('Rampage')
  assert.deepEqual([r.ranks, r.cost], [2, '5/4'])
  assert.match(r.text, /Rank 2: Level 40, Warriors and Berserkers\. Requirements: Level 30\.$/)
  assert.deepEqual(fields(r), ['ranks', 'text', 'cost'])
  assert.equal(aaMarkTip(aaMarks(r, 'ranks')), "Daybreak's 2026-10-22 notes: rank 2 at level 40 for Warriors and Berserkers.")
  assert.equal(aaPointsSpent(rankAas([spend('Rampage'), spend('Rampage', 2, 4)], {})).unknown, 0, 'rank 2 is priced')
})

test('Valiant and Abyssal Steed: removed, out of the points and the pickers; a log rank still shows', () => {
  for (const [name, cls] of [['Valiant Steed', 'Paladin'], ['Abyssal Steed', 'Shadow Knight']]) {
    assert.equal(row(name, cls).removed, '2026-09-01')
  }
  const picked = rankAas([], { 'Valiant Steed': 1 })
  assert.equal(aaRankOf(picked, 'Valiant Steed'), 0, 'a pick is not taken')
  const logged = rankAas([spend('Valiant Steed', undefined, 9), spend('Holy Steed', undefined, 5)], {})
  const steed = logged.find((r) => r.key === 'Valiant Steed')
  assert.deepEqual([steed?.rank, steed?.source], [1, 'log'], 'the log wins')
  const paladin = logged.filter((r) => r.row.class === 'Paladin')
  assert.equal(aaPointsSpent(paladin).points, 5, 'Holy Steed only: the 9 were refunded')
})

test('Unbound Strikethrough: renamed by the notes, so the log matches it exactly, not as a near name', () => {
  const r = row('Unbound Strikethrough', 'Ranger')
  assert.deepEqual(fields(r), ['name'])
  assert.ok(!AA_ROWS.some((x) => x.name === 'Unbounded Strikethrough'))
  const ranked = rankAas([spend('Unbound Strikethrough'), spend('Unbound Strikethrough', 2)], {})
  const hit = ranked.find((x) => x.key === 'Unbound Strikethrough')
  assert.deepEqual([hit?.rank, hit?.wikiName, hit?.unlisted], [2, null, false])
  assert.equal(ranked.filter((x) => x.unlisted).length, 0)
})

test('Quick Buff: the four rules, before Requirements, one mark tooltip for the span', () => {
  const r = row('Quick Buff')
  assert.match(r.text, /left\. It cannot be used in combat\. It turns off any invocation and restores it after\. It does not cast lull or pacify spells\. Its timer resets on death\. Requirements: Level 1\.$/)
  const marks = aaMarks(r, 'text')
  assert.equal(marks.length, 4)
  assert.equal(aaMarkTip(marks), "Daybreak's notes from 2026-05-28 to 2026-09-15 changed this, 4 times.")
})

test('Point Blank Fire names its classes; Pottery Mastery has its fourth rank at 20', () => {
  assert.match(row('Point Blank Fire').text, /Rangers, Rogues, Monks and Berserkers get it automatically\. Requirements: Level 1$/)
  const pot = row('Pottery Mastery')
  assert.deepEqual([pot.ranks, pot.cost], [4, '2/4/6/20'])
  assert.match(pot.text, /Rank 4: .*by 5 points by learning more recipes\. Requirements: Level 1\.$/)
})

test('race rows take the game name; Drakkin is added; Race 18 (a placeholder) stays off the tab', () => {
  assert.ok(AA_ROWS.some((r) => r.name === 'Race Reincarnation: Half Elf'))
  assert.ok(!AA_ROWS.some((r) => r.name === 'Class Reincarnation: Half Elf'))
  assert.ok(AA_ROWS.some((r) => r.name === 'Class Reincarnation: Monk'), 'a class row keeps its name')
  const drakkin = row('Race Reincarnation: Drakkin')
  assert.deepEqual([drakkin.section, drakkin.ranks, drakkin.values], ['special', 3, ['?', '?', '?']])
  assert.equal(aaKey(drakkin), 'Race Reincarnation: Drakkin')
  assert.ok(!AA_ROWS.some((r) => r.name.endsWith('Race 18')))
  assert.equal(aaRankOf(rankAas([], {}, ['Human', 'Human']), 'Race Reincarnation: Human'), 2, 'the cap still reads it')
})

test('Turn Summoned is left as the wiki has it', () => {
  const r = row('Turn Summoned')
  assert.deepEqual([r.ranks, r.cost, r.marks], [3, '3/6/?', undefined])
})

test('a correction the page already holds changes nothing (the wiki caught up)', () => {
  const table: AaTableRow[] = [{ section: 'archetype', name: 'Rampage', ranks: 2, cost: '5/4', text: 'x. Rank 2: Level 40. Requirements: Level 30.' }]
  assert.deepEqual(applyAaCorrections(table)[0], table[0])
})

test('each correction names its source and date; each tooltip is one sentence of 7-15 words', () => {
  for (const c of AA_CORRECTIONS) {
    assert.match(c.source.date, /^2026-\d\d-\d\d$/, c.name)
    assert.ok(c.source.by === 'game' || c.source.where.startsWith('https://'), c.name)
    const words = c.tip.split(/\s+/).length
    assert.ok(words >= 7 && words <= 15, `${c.name}: ${String(words)} words`)
  }
})

test("class reincarnation rows: the game's hotkey note (refresh 2:00, shared timer 90); race rows none", () => {
  const war = row('Class Reincarnation: Warrior')
  assert.equal(war.hk, 'Thrash: 4 primary-hand combat rounds on everything within 40 ft. Refresh 2:00, shared timer 90; rank 3 keeps its passive.')
  assert.deepEqual(fields(war), ['hk'])
  assert.equal(row('Race Reincarnation: Half Elf').hk?.includes('2:00') ?? false, false)
})
