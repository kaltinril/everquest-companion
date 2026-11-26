// The Alt. Advancement tab for a class combination (src/shared/aaBoard.ts), what to buy next
// (aaRecommend.ts), what the AAs add up to (aaStats.ts) and where a row links (aaLinks.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withGranted } from '../src/shared/aaGranted'
import { rankAas, type AaPicks, type AaRanked } from '../src/shared/aaRanks'
import { aaBoard, aaComboMax, aaFit, aaLeft, aaPlanDelta, aaSearchGroups, aaTabCount, aaTabGroups, type AaBoardRow, type AaCombo } from '../src/shared/aaBoard'
import { aaNotForPoints, aaRecFit, aaRecommend } from '../src/shared/aaRecommend'
import { aaSigned, aaStatTotals } from '../src/shared/aaStats'
import { aaActivation, aaLinks } from '../src/shared/aaLinks'
import type { ClassAbbr } from '../src/shared/classCombo'

const OWN: ClassAbbr[] = ['WAR', 'SHM', 'MNK']
const own: AaCombo = { classes: OWN, own: true }
const ranked = (picks: AaPicks = {}, classes: readonly ClassAbbr[] = OWN): AaRanked[] => withGranted(rankAas([], picks), { level: 50, classes })
const find = (board: readonly AaBoardRow[], key: string, cls?: string): AaBoardRow => {
  const b = board.find((x) => x.r.key === key && (cls === undefined || x.r.row.class === cls))
  assert.ok(b, key)
  return b
}

/** Every rank the owner's combo can buy, picked to the top: the owner's WAR/SHM/MNK, all maxed. */
function maxedPicks(): AaPicks {
  const out: Record<string, number> = {}
  for (const b of aaBoard(ranked(), own)) if (b.buyable) out[b.r.key] = b.max
  return out
}

test('USABLE: General and Special for everyone, Class by class, Archetype by the measured lists', () => {
  const board = aaBoard(ranked(), own)
  assert.equal(find(board, 'Packrat').usable, true)
  assert.equal(find(board, 'Banestrike').usable, true)
  assert.equal(find(board, 'Unbound Wrath').usable, true)
  assert.equal(find(board, 'Lay on Hands').fit, 'other')
  assert.equal(find(board, 'Exodus').fit, 'other')
  assert.equal(find(board, 'Rampage').usable, true, 'Warrior has it')
})

test('PLANNING: Point Blank Fire is only for RNG, ROG, MNK and BER (Daybreak 2026-09-22)', () => {
  for (const [classes, want] of [[['RNG'], 'mine'], [['ROG'], 'mine'], [['MNK'], 'mine'], [['BER'], 'mine'], [['SHM', 'CLR'], 'other'], [['WAR'], 'other']] as const) {
    const r = ranked({}, classes).find((x) => x.key === 'Point Blank Fire')!
    assert.equal(aaFit(r, { classes, own: false }), want, classes.join('/'))
  }
})

test('PLANNING: ranks carry over where the combo can use them; the rest are flagged and left out', () => {
  const picks = maxedPicks()
  const planned = aaBoard(ranked(picks, ['WAR', 'CLR', 'WIZ']), { classes: ['WAR', 'CLR', 'WIZ'], own: false })
  assert.equal(find(planned, 'Packrat').r.rank, 10, 'General carries')
  assert.equal(find(planned, 'Unbound Wrath').usable, true)
  assert.equal(find(planned, 'Unbound Alacrity').usable, false, 'a Monk AA is not a WAR/CLR/WIZ one')
  assert.equal(find(planned, 'Unbound Boon').r.rank, 3, 'a free Cleric AA is granted at the level')
  assert.equal(find(planned, 'Unbound Boon').r.source, 'granted')
  const delta = aaPlanDelta(planned, aaBoard(ranked(picks), own))
  assert.ok(delta.adds > 0 && delta.points > 0)
  assert.ok(delta.drops > 0)
})

test('TOP RANK by class: Steadfast Will 8 for tanks, 7 for Monks and Rangers, 6 for the rest; Rampage 2 for WAR and BER', () => {
  const r = ranked().find((x) => x.key === 'Steadfast Will')!
  assert.equal(aaComboMax(r, ['WAR']), 8)
  assert.equal(aaComboMax(r, ['MNK', 'SHM']), 7)
  assert.equal(aaComboMax(r, ['CLR', 'WIZ']), 6)
  const ramp = ranked().find((x) => x.key === 'Rampage')!
  assert.equal(aaComboMax(ramp, ['WAR']), 2)
  assert.equal(aaComboMax(ramp, ['SHM', 'CLR']), 1)
  assert.equal(aaComboMax({ ...r, rank: 8 }, ['CLR']), 8, 'a held rank is never cut')
})

test("THE OWNER'S WAR/SHM/MNK, all maxed: nothing left to buy, nothing recommended, Banestrike not bought with points", () => {
  const board = aaBoard(ranked(maxedPicks()), own)
  assert.deepEqual(aaLeft(board), { count: 0, points: 0, unknown: false })
  const recs = aaRecommend(board, 20)
  assert.equal(recs.items.length, 0)
  assert.equal(recs.used, 0)
  assert.equal(find(board, 'Pottery Mastery').max, 3)
  assert.deepEqual(aaNotForPoints(board).banestrike, { rank: 0, max: 4 })
})

test('RECOMMENDATIONS: cheapest next rank first; the plan says how far the points go', () => {
  const picks = { ...maxedPicks(), 'Innate Regeneration': 3, Packrat: 8 }
  const board = aaBoard(ranked(picks), own)
  const recs = aaRecommend(board, 5)
  assert.deepEqual(recs.items.map((i) => [i.b.r.key, i.next, i.toMax]), [['Packrat', 1, 2], ['Innate Regeneration', 2, 15]])
  // 5 points: Packrat 9 (1), Packrat 10 (1), Regen 4 (2); Regen 5 costs 3, more than the 1 left.
  assert.equal(recs.used, 4)
  assert.equal(aaRecFit(recs.items[0], 5), 'fits your 5 points')
  assert.equal(aaRecFit(recs.items[1], 5), 'fits to rank 4')
  assert.equal(recs.items[1].gives, '+4')
  assert.equal(recs.total, 17)
})

test('TAB COUNTS: maxed of usable and their points; a search counts its matches', () => {
  const board = aaBoard(ranked({ ...maxedPicks(), 'Innate Regeneration': 3 }), own)
  const general = aaTabCount(board, 'general', 'usable', '')
  assert.equal(general.of - general.maxed, 1)
  assert.equal(general.points.total - general.points.spent, 15)
  assert.equal(aaTabCount(board, 'archetype', 'usable', 'crit').matches, 5)
  assert.ok((aaTabCount(board, 'archetype', 'all', 'crit').matches ?? 0) >= 5)
})

test('LISTS: Archetype splits mine and, with All, the rest; Class groups by class; search spans every tab', () => {
  const board = aaBoard(ranked(), own)
  const usable = aaTabGroups(board, 'archetype', OWN, { scope: 'usable', query: '' })
  assert.deepEqual(usable.map((g) => g.kind), ['mine'])
  const all = aaTabGroups(board, 'archetype', OWN, { scope: 'all', query: '' })
  assert.deepEqual(all.map((g) => g.kind), ['mine', 'other'])
  assert.ok(all[1].rows.some((b) => b.r.key === 'Exodus'))
  const classes = aaTabGroups(board, 'class', OWN, { scope: 'usable', query: '' })
  assert.deepEqual(classes.map((g) => g.title), ['Warrior', 'Shaman', 'Monk'])
  const allClasses = aaTabGroups(board, 'class', OWN, { scope: 'all', query: '' })
  assert.ok(allClasses.some((g) => g.title === 'Bard · not for WAR/SHM/MNK' && g.kind === 'other'))
  const search = aaSearchGroups(board, 'usable', 'pottery')
  assert.deepEqual(search.map((g) => [g.title, g.rows.map((b) => b.r.key)]), [['General', ['Crafting Mastery', 'Pottery Mastery']]])
  assert.equal(aaSearchGroups(board, 'usable', 'evac').length, 0, 'Exodus is not usable')
  assert.equal(aaSearchGroups(board, 'all', 'group evac')[0].rows[0].r.key, 'Exodus', 'the effect label is searched')
})

test('WHAT YOUR AAS GIVE YOU: totals from held usable ranks, race and class lines included', () => {
  const picks = { 'Innate Eminence': 5, 'Combat Stability': 3, 'Physical Enhancement': 1, 'Race Reincarnation: Half Elf': 1, 'Race Reincarnation: Iksar': 1, 'Class Reincarnation: Warrior': 2, 'Innate Spell Resistance': 5 }
  const groups = aaStatTotals(aaBoard(ranked(picks), own))
  const line = (stat: string) => groups.flatMap((g) => g.lines).find((l) => l.stat === stat)
  assert.equal(line('All 7 attributes')?.total, 10)
  assert.equal(line('Stat cap')?.total, 3)
  assert.equal(line('Cold, disease, fire, magic, poison')?.total, 13)
  assert.equal(line('AC soft cap')?.total, 12)
  assert.equal(line('Base AC')?.total, 5)
  assert.equal(line('HP regen')?.total, 2)
  // Innate Fighters Tenacity is granted at 50: -5, the Warrior line -4.
  assert.equal(line('Melee damage taken')?.total, -9)
  assert.deepEqual(line('Melee damage taken')?.from.map((f) => f.name), ['Warrior line', 'Innate Fighters Tenacity'])
  assert.equal(aaSigned(-9, '%'), '-9%')
  assert.equal(groups[0].group, 'Attributes')
})

test('WHAT YOUR AAS GIVE YOU: another combo shows the change; an unusable AA drops out of the total', () => {
  const picks = maxedPicks()
  const base = aaBoard(ranked(picks), own)
  const planned = aaBoard(ranked(picks, ['WAR', 'CLR', 'WIZ']), { classes: ['WAR', 'CLR', 'WIZ'], own: false })
  const haste = aaStatTotals(planned, base).flatMap((g) => g.lines).find((l) => l.stat === 'Haste')
  assert.equal(haste?.total, 0)
  assert.equal(haste?.diff, -10)
  assert.deepEqual(haste?.gone, ['Unbound Alacrity'])
})

test('LINKS: masteries to their workbench, stat AAs to Best in slot, activated AAs to Timers, corrections to Wiki Gaps', () => {
  const board = aaBoard(ranked(), own)
  const labels = (key: string): string[] => aaLinks(find(board, key).r.row, key).map((l) => l.label)
  assert.deepEqual(labels('Pottery Mastery'), ['Pottery'])
  assert.deepEqual(labels('Innate Eminence'), ['Best in slot'])
  assert.deepEqual(labels('Mnemonic Retention'), ['Spells'])
  assert.deepEqual(labels('Gather Party'), ['Timers · 6 h'])
  assert.ok(labels('Rampage').includes('Wiki Gaps · AAs'))
  assert.ok(labels('Race Reincarnation: Half Elf').includes('Leveling · reincarnations'))
  assert.deepEqual(labels('Banestrike'), ['Slayer achievements'])
  assert.deepEqual(aaActivation('Ability Activation ID: 109 - Refresh Time: 0:10:00 - Ability Timer(s): 81. x'), { refresh: '10 min', timer: 81 })
})
