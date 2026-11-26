// The Alt. Advancement tab for a class combination (src/shared/aaBoard.ts), what to buy next
// (aaRecommend.ts), what the AAs add up to (aaStats.ts) and where a row links (aaLinks.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withGranted } from '../src/shared/aaGranted'
import { rankAas, type AaPicks, type AaRanked } from '../src/shared/aaRanks'
import { AA_WIKI_ORDER, aaBoard, aaComboMax, aaFit, aaLeft, aaPlanDelta, aaSearchGroups, aaSortGroups, aaStartLevel, aaTabCount, aaTabGroups, aaWithinLevel, type AaBoardRow, type AaCombo } from '../src/shared/aaBoard'
import { aaNotForPoints, aaRecFit, aaRecommend } from '../src/shared/aaRecommend'
import { aaSigned, aaStatTotals } from '../src/shared/aaStats'
import { aaActivation, aaLinks } from '../src/shared/aaLinks'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { AASpendEvent } from '../src/shared/types'

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
  const general = aaTabCount(board, 'general', { scope: 'usable', query: '' })
  assert.equal(general.of - general.maxed, 1)
  assert.equal(general.points.total - general.points.spent, 15)
  assert.equal(aaTabCount(board, 'archetype', { scope: 'usable', query: 'crit' }).matches, 5)
  assert.ok((aaTabCount(board, 'archetype', { scope: 'all', query: 'crit' }).matches ?? 0) >= 5)
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

test('LEVEL FILTER: rank 1 by the wiki; a row whose level the text does not state clearly stays in', () => {
  const board = aaBoard(ranked(), own)
  assert.equal(aaStartLevel(find(board, 'Full Potential')), 50)
  assert.equal(aaStartLevel(find(board, 'Widened Perception')), 25)
  assert.equal(aaStartLevel(find(board, 'Mana Burn')), 45, 'not the 3 of "Mental Clarity at Level 3"')
  assert.equal(aaWithinLevel(find(board, 'Full Potential'), 10), false)
  assert.equal(aaWithinLevel(find(board, 'Full Potential'), null), true, 'no filter')
  const unread = board.find((b) => aaStartLevel(b) === null)
  if (unread !== undefined) assert.equal(aaWithinLevel(unread, 1), true)
  const general = aaTabGroups(board, 'general', OWN, { scope: 'usable', query: '', maxLevel: 10 }).flatMap((g) => g.rows.map((b) => b.r.key))
  assert.ok(general.includes('Packrat'))
  assert.ok(!general.includes('Full Potential') && !general.includes('Widened Perception'))
  const others = aaTabGroups(board, 'class', OWN, { scope: 'all', query: '', maxLevel: 9 })
  assert.ok(!others.some((g) => g.rows.some((b) => b.r.key === 'Mana Burn')))
  assert.ok(others.some((g) => g.title === 'Bard · not for WAR/SHM/MNK' && g.rows.some((b) => b.r.key === 'Scribble Notes')))
  const unfiltered = aaTabCount(board, 'general', { scope: 'usable', query: '' })
  const filtered = aaTabCount(board, 'general', { scope: 'usable', query: '', maxLevel: 10 })
  assert.equal(unfiltered.of - filtered.of, 2, 'Full Potential and Widened Perception drop out')
  assert.equal(aaSearchGroups(board, 'usable', 'loadout', 10).length, 0)
  assert.equal(aaSearchGroups(board, 'usable', 'loadout', 25).length, 1)
})

test('SORT: by level or name inside each group, groups kept in place; the wiki order by default', () => {
  const board = aaBoard(ranked(), own)
  const groups = aaTabGroups(board, 'class', OWN, { scope: 'usable', query: '' })
  assert.deepEqual(aaSortGroups(groups, AA_WIKI_ORDER), groups)
  const up = aaSortGroups(groups, { key: 'level', dir: 'asc' })
  assert.deepEqual(up.map((g) => g.title), groups.map((g) => g.title), 'a class stays a class')
  for (const g of up) {
    const levels = g.rows.map((b) => aaStartLevel(b)).filter((l): l is number => l !== null)
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b))
  }
  const down = aaSortGroups(groups, { key: 'level', dir: 'desc' })
  for (const g of down) {
    const levels = g.rows.map((b) => aaStartLevel(b)).filter((l): l is number => l !== null)
    assert.deepEqual(levels, [...levels].sort((a, b) => b - a))
  }
  const names = aaSortGroups(groups, { key: 'name', dir: 'asc' })[0].rows.map((b) => b.r.key)
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
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

test('WHAT YOUR AAS GIVE YOU: another combo shows only what its AAs add, no change against your own', () => {
  const picks = maxedPicks()
  const planned = aaBoard(ranked(picks, ['WAR', 'CLR', 'WIZ']), { classes: ['WAR', 'CLR', 'WIZ'], own: false })
  const lines = aaStatTotals(planned).flatMap((g) => g.lines)
  assert.equal(lines.find((l) => l.stat === 'Haste'), undefined, 'a Monk AA adds nothing to WAR/CLR/WIZ')
  assert.ok(lines.every((l) => !('diff' in l) && !('gone' in l)))
  assert.equal(lines.find((l) => l.stat === 'Mana cost')?.total, -10, 'a reduction keeps its minus')
})

const T = Date.parse('2026-11-12T18:00:00')
const spend = (ability: string, rank: number): AASpendEvent =>
  rank === 1 ? { ts: T, ability, cost: 1 } : { ts: T + rank, ability: `${ability} ${String(rank)}`, cost: 1, rank }
const climb = (ability: string, top: number): AASpendEvent[] => Array.from({ length: top }, (_, i) => spend(ability, i + 1))
/** The owner's own purchases, then ones from loadouts played before (a Ranger's, a Paladin's, a Bard's, a Berserker's). */
const MINE = [...climb('Combat Fury', 3), ...climb('Unbound Alacrity', 3)]
const BEFORE = [...climb("Hunter's Attack Power", 13), ...climb('Lay on Hands', 8), ...climb('Unbound Versatility', 1), ...climb('Unbound Fury', 2)]
const FOREIGN = ["Hunter's Attack Power", 'Lay on Hands', 'Unbound Versatility', 'Unbound Fury']
const logBoard = (spends: AASpendEvent[], combo: AaCombo = own): AaBoardRow[] => aaBoard(withGranted(rankAas(spends, {}), { level: 50, classes: combo.classes }), combo)

test("ANOTHER LOADOUT'S AAS: kept, marked, shown only with All, and out of every count, stat and recommendation", () => {
  const board = logBoard([...MINE, ...BEFORE])
  const clean = logBoard(MINE)
  for (const key of FOREIGN) {
    const b = find(board, key)
    assert.equal(b.usable, false, key)
    assert.equal(b.elsewhere, true, key)
  }
  assert.equal(find(board, "Hunter's Attack Power").r.rank, 13, 'the log wins for what was bought')
  assert.deepEqual(aaTabCount(board, 'class', { scope: 'usable', query: '' }), aaTabCount(clean, 'class', { scope: 'usable', query: '' }))
  assert.deepEqual(aaLeft(board), aaLeft(clean))
  assert.deepEqual(aaRecommend(board, 20).items.map((i) => i.b.r.key), aaRecommend(clean, 20).items.map((i) => i.b.r.key))
  assert.deepEqual(aaStatTotals(board), aaStatTotals(clean))
  assert.ok(aaStatTotals(board).flatMap((g) => g.lines).every((l) => l.from.every((f) => !FOREIGN.includes(f.key))))
  const usable = aaTabGroups(board, 'class', OWN, { scope: 'usable', query: '' })
  assert.deepEqual(usable.map((g) => g.title), ['Warrior', 'Shaman', 'Monk'])
  const ranger = aaTabGroups(board, 'class', OWN, { scope: 'all', query: '' }).find((g) => g.title === 'Ranger · not for WAR/SHM/MNK')
  assert.equal(ranger?.kind, 'other')
  assert.ok(ranger?.rows.some((b) => b.r.key === "Hunter's Attack Power" && b.elsewhere))
  assert.equal(aaSearchGroups(board, 'usable', 'lay on hands').length, 0)
  assert.equal(aaSearchGroups(board, 'all', 'lay on hands')[0].rows[0].elsewhere, true)
  // The owner's own rows are unchanged.
  assert.deepEqual([find(board, 'Unbound Alacrity').r.rank, find(board, 'Unbound Alacrity').usable], [3, true])
  assert.deepEqual([find(board, 'Combat Fury').r.rank, find(board, 'Combat Fury').elsewhere], [3, false])
})

test("ANOTHER LOADOUT'S AAS: a planned combo that has them counts them, unmarked; with no classes known the log's ranks count", () => {
  const planned = logBoard([...MINE, ...BEFORE], { classes: ['RNG', 'PAL', 'BRD'], own: false })
  assert.deepEqual([find(planned, "Hunter's Attack Power").usable, find(planned, "Hunter's Attack Power").elsewhere], [true, false])
  assert.equal(find(planned, 'Unbound Fury').elsewhere, false, 'planning marks nothing as another loadout')
  const unknown = logBoard([...MINE, ...BEFORE], { classes: [], own: true })
  assert.equal(find(unknown, 'Lay on Hands').usable, true)
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
