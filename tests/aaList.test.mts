// What `/alt list` and `You activate X.` say of the AAs held (src/shared/aaList.ts), and the order of
// proof they take in the ranks (src/shared/aaRanks.ts; owner, 2026-11-25): list, activation, pick,
// then purchase lines and grants; a purchase logged after the list raises it. The fixtures are the
// owner's own lines (docs/community/plans/2026-11-25-aa-window/): a maxed WAR/SHM/MNK, and a fresh
// level-1 ENC/WAR owning nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AA_SPELL_NAMES, aaBlockRank, aaListRead, aaRowListRank, type AaActivation, type AaListBlock, type AaListRun } from '../src/shared/aaList'
import { aaKey, aaPickHeard, rankAasFrom, type AaLogInput, type AaPicks, type AaRanked } from '../src/shared/aaRanks'
import { withGranted } from '../src/shared/aaGranted'
import { aaBoard, aaCantTell, aaLeft } from '../src/shared/aaBoard'
import { aaRecommend } from '../src/shared/aaRecommend'
import { AA_ROWS } from '../src/shared/aaOfficial'
import { mergeLeveling } from '../src/shared/logArchive/mergeLeveling'
import { aaFold } from '../src/shared/aaLogMatch'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { AASpendEvent, LevelingSnap } from '../src/shared/types'

const T = Date.parse('2026-11-25T16:02:11')

/** The blocks of a list as the engine's fold joins them (one run: the fixtures hold one each). */
function runOf(file: string, ts = T): AaListRun {
  const blocks: AaListBlock[] = []
  for (const raw of readFileSync(new URL(`./fixtures/aaList/${file}`, import.meta.url), 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/^\[[^\]]+\] /, '')
    const head = /^Ability #(\d+): (.+)$/.exec(line)
    const last = blocks.at(-1)
    if (head !== null) blocks.push({ id: Number(head[1]), name: head[2].trim(), description: '', cost: null })
    else if (line.startsWith('Description: ') && last !== undefined) last.description = line.slice('Description: '.length).trim()
    else if (line.startsWith('Cost per Level: ') && last !== undefined) last.cost = Number(line.slice('Cost per Level: '.length))
  }
  return { ts, blocks }
}

const OWNER = runOf('owner-maxed-war-shm-mnk.txt')
const FRESH = runOf('fresh-enc-war.txt')
const WSM: ClassAbbr[] = ['WAR', 'SHM', 'MNK']

const ranks = (input: Partial<AaLogInput>, picks: AaPicks = {}, classes: ClassAbbr[] = WSM): AaRanked[] =>
  withGranted(rankAasFrom({ spends: [], ...input }, picks), { level: 50, classes })
const row = (ranked: readonly AaRanked[], key: string): AaRanked => {
  const r = ranked.find((x) => x.key === key)
  assert.ok(r !== undefined, key)
  return r
}
const act = (name: string, ts = T + 1): AaActivation => ({ name, first: ts })
const spend = (ability: string, rank: number, ts: number, cost = 1): AASpendEvent => ({ ts, ability: `${ability} ${String(rank)}`, cost, rank })

test('the fixtures are the real runs: 118 blocks maxed, Combat Fury in both', () => {
  assert.equal(OWNER.blocks.length, 118)
  assert.ok(FRESH.blocks.some((b) => b.name === 'Combat Fury'))
})

test('a block reads its rank off the text, and off the cost when the text cannot', () => {
  const fury = AA_ROWS.find((r) => r.name === 'Combat Fury')
  assert.ok(fury !== undefined)
  assert.equal(aaBlockRank(fury, { id: 40, name: 'Combat Fury', description: 'with all skills by 5%.', cost: 4 }), 4)
  assert.equal(aaBlockRank(fury, { id: 40, name: 'Combat Fury', description: 'with all skills by 1%.', cost: 1 }), 1)
  assert.equal(aaBlockRank(fury, { id: 40, name: 'Combat Fury', description: 'no number', cost: 3 }), 3)
  // One block of rank 1 is unowned; a current-and-next pair is the current rank.
  const bane = AA_ROWS.find((r) => r.name === 'Banestrike')
  assert.ok(bane !== undefined)
  const b = (pct: number): AaListBlock => ({ id: 15073, name: 'Banestrike', description: `abilities by ${String(pct)}%.`, cost: 0 })
  assert.equal(aaRowListRank(bane, [b(2)]), 0)
  assert.equal(aaRowListRank(bane, [b(2), b(4)]), 1)
  assert.equal(aaRowListRank(bane, [b(10)]), 4)
})

test("OWNER'S MAXED LIST: Combat Fury 4/4 from the list; Quick Buff and Improved Bash can't be told", () => {
  const ranked = ranks({ list: OWNER })
  assert.deepEqual([row(ranked, 'Combat Fury').rank, row(ranked, 'Combat Fury').source], [4, 'list'])
  for (const one of ['Quick Buff', 'Improved Bash']) {
    assert.equal(row(ranked, one).unknown, true, one)
    assert.equal(row(ranked, one).rank, 0, one)
  }
  assert.equal(row(ranked, 'Banestrike').rank, 1)
})

test("A SPECIAL ROW the list printed but cannot read is not sold for points: rank 0, never can't-tell", () => {
  const run: AaListRun = { ts: T, blocks: [{ id: 26124, name: 'Race Reincarnation: Troll', description: 'This passive ability increases your hitpoint regeneration by 3.', cost: 0 }] }
  const troll = ranks({ list: run }).find((r) => r.row.section === 'special' && /Troll/.test(r.key))
  assert.ok(troll !== undefined)
  assert.deepEqual([troll.rank, troll.unknown], [0, undefined])
})

test("A STALE LIST says nothing of the row it printed three times: the purchase line settles it", () => {
  // The owner's list was taken two minutes after buying Pottery Mastery 3 (15:42), before any zone or
  // swap: Pottery printed rank 2, rank 3 and an unsold "rank 4".
  const alone = ranks({ list: OWNER })
  assert.equal(row(alone, 'Pottery Mastery').unknown, true)
  const bought = [1, 2, 3].map((k) => spend('Pottery Mastery', k, T - 120_000 + k))
  const ranked = ranks({ list: OWNER, spends: bought })
  assert.deepEqual([row(ranked, 'Pottery Mastery').rank, row(ranked, 'Pottery Mastery').source], [3, 'log'])
})

test("OWNER'S MAXED LIST: nothing is left to buy and nothing is recommended", () => {
  const board = aaBoard(ranks({ list: OWNER }), { classes: WSM, own: true })
  const recs = aaRecommend(board, 20)
  assert.deepEqual(recs.items.map((i) => `${i.b.r.key} ${String(i.b.r.rank)}/${String(i.b.max)}`), [])
  assert.equal(aaLeft(board).count, 0)
  const unsure = aaCantTell(board).map((b) => b.r.key)
  assert.ok(unsure.includes('Quick Buff') && unsure.includes('Improved Bash'), unsure.join(', '))
})

test('FRESH CHARACTER: the list says Combat Fury 0, and it is for sale', () => {
  const ranked = ranks({ list: FRESH }, {}, ['ENC', 'WAR'])
  assert.deepEqual([row(ranked, 'Combat Fury').rank, row(ranked, 'Combat Fury').source], [0, 'list'])
  const board = aaBoard(ranked, { classes: ['ENC', 'WAR'], own: true })
  assert.ok(aaRecommend(board, 20).items.some((i) => i.b.r.key === 'Combat Fury'))
})

test('ACTIVATION: "You activate Quick Buff." holds it; "You activate Skull Bash." changes nothing', () => {
  const ranked = ranks({ list: OWNER, activations: [act('Quick Buff'), act('Skull Bash')] })
  const qb = row(ranked, 'Quick Buff')
  assert.deepEqual([qb.rank, qb.source, qb.unknown], [1, 'activated', undefined])
  assert.equal(row(ranked, 'Improved Bash').unknown, true)
  const without = ranks({ list: OWNER, activations: [act('Skull Bash')] })
  assert.deepEqual(
    without.map((r) => [r.key, r.rank, r.source]),
    ranks({ list: OWNER }).map((r) => [r.key, r.rank, r.source])
  )
})

test('RUNG 1, the list, beats a pick and every purchase logged before the zone-in before it', () => {
  const before = [1, 2, 3, 4].map((k) => spend('Combat Fury', k, T - 1000 + k))
  // A zone (or a respec since, as in tests/fixtures/aa-mnemonic-respec.log) between them: the list is current.
  const list = { ...FRESH, zoneBefore: T - 500 }
  const ranked = ranks({ list, spends: before }, { 'Combat Fury': 3 }, ['ENC', 'WAR'])
  assert.deepEqual([row(ranked, 'Combat Fury').rank, row(ranked, 'Combat Fury').source], [0, 'list'])
})

test('THE POTTERY CASE: a purchase with no zone-in before the list beats it (purchase 15:42, list 15:44)', () => {
  const at = (hm: string): number => Date.parse(`2026-11-25T${hm}`)
  const list: AaListRun = { ...OWNER, ts: at('15:44:21'), zoneBefore: at('15:30:00') }
  const bought = [1, 2, 3].map((k) => spend('Pottery Mastery', k, at('15:42:00') + k))
  const ranked = ranks({ list, spends: bought })
  assert.deepEqual([row(ranked, 'Pottery Mastery').rank, row(ranked, 'Pottery Mastery').source], [3, 'log'])
  // The same shape where the list reads the row (current and next block): the purchase still wins.
  const fury = (pct: number, cost: number): AaListBlock => ({ id: 40, name: 'Combat Fury', description: `with all skills by ${String(pct)}%.`, cost })
  const stale: AaListRun = { ts: at('15:44:21'), zoneBefore: at('15:30:00'), blocks: [fury(2, 2), fury(3, 3)] }
  const furyBought = [1, 2, 3].map((k) => spend('Combat Fury', k, at('15:42:00') + k))
  const read = ranks({ list: stale, spends: furyBought })
  assert.deepEqual([row(read, 'Combat Fury').rank, row(read, 'Combat Fury').source], [3, 'log'])
  // A zone-in between the purchase and the list: the list is current and wins.
  const zoned = ranks({ list: { ...stale, zoneBefore: at('15:43:00') }, spends: furyBought })
  assert.deepEqual([row(zoned, 'Combat Fury').rank, row(zoned, 'Combat Fury').source], [2, 'list'])
})

test('RUNG 2: a ranked cast holds the AA at its numeral; a spell no AA row names changes nothing', () => {
  const ranked = ranks({ activations: [{ ...act('Rampage'), rank: 2 }, { ...act('Scorching Arrow'), rank: 4 }] })
  assert.deepEqual([row(ranked, 'Rampage').rank, row(ranked, 'Rampage').source], [2, 'activated'])
  assert.ok(row(ranked, 'Rampage').max >= 2)
  assert.deepEqual(
    ranks({ activations: [{ ...act('Scorching Arrow'), rank: 4 }] }).map((r) => [r.key, r.rank, r.source]),
    ranks({}).map((r) => [r.key, r.rank, r.source])
  )
  // The reuse timer, a toggle off, an interrupt and (Finishing Blow) reach here as a name alone.
  const named = ranks({ activations: [act('Heroic Leap'), act('Point Blank Fire'), act('Finishing Blow')] })
  for (const k of ['Heroic Leap', 'Point Blank Fire', 'Finishing Blow']) assert.ok(row(named, k).rank >= 1, k)
})

test('THE STALE-LIST EXCEPTION: a purchase logged after the list raises the rank above it', () => {
  const after = [spend('Combat Fury', 1, T + 60_000), spend('Combat Fury', 2, T + 61_000)]
  const ranked = ranks({ list: FRESH, spends: after }, {}, ['ENC', 'WAR'])
  assert.deepEqual([row(ranked, 'Combat Fury').rank, row(ranked, 'Combat Fury').source], [2, 'log'])
})

test('RUNG 2, an activation, beats a pick of 0 (a pick above it still counts on a multi-rank row)', () => {
  const zero = ranks({ activations: [act('Quick Buff')] }, { 'Quick Buff': 0 })
  assert.deepEqual([row(zero, 'Quick Buff').rank, row(zero, 'Quick Buff').source], [1, 'activated'])
})

test('RUNG 3, the pick, beats purchase lines when neither list nor activation says anything', () => {
  const spends = [1, 2].map((k) => spend('Combat Fury', k, T + k))
  const ranked = ranks({ spends }, { 'Combat Fury': 4 })
  assert.deepEqual([row(ranked, 'Combat Fury').rank, row(ranked, 'Combat Fury').source], [4, 'pick'])
  // "I have it" on a row the list cannot read is a pick, and it settles the row.
  const had = ranks({ list: OWNER }, { 'Improved Bash': 1 })
  assert.deepEqual([row(had, 'Improved Bash').rank, row(had, 'Improved Bash').source, row(had, 'Improved Bash').unknown], [1, 'pick', undefined])
})

test('RUNG 4, purchase lines, with no list read at all: today behaviour, nothing marked unknown', () => {
  const spends = [1, 2].map((k) => spend('Combat Fury', k, T + k))
  const ranked = ranks({ spends })
  assert.deepEqual([row(ranked, 'Combat Fury').rank, row(ranked, 'Combat Fury').source], [2, 'log'])
  assert.equal(row(ranked, 'Quick Buff').unknown, undefined)
  const board = aaBoard(ranked, { classes: WSM, own: true })
  assert.ok(aaRecommend(board, 20).items.some((i) => i.b.r.key === 'Quick Buff'))
})

test('the list maps its names onto the rows: apostrophes and race rows', () => {
  const read = aaListRead(OWNER, AA_ROWS, aaKey)
  // The game writes `Warriors Endurance`, the wiki `Warrior's Endurance`; the race lines `Race Reincarnation: Iksar`.
  assert.ok(read.printed.has('warriors endurance'))
  assert.ok([...read.printed].some((f) => f.endsWith('reincarnation: iksar')))
  assert.equal(read.ts, T)
})

test('mergeLeveling: the newer list run wins, activations join by name', () => {
  const base: LevelingSnap = { levels: [], aaGains: [], aaSpends: [], aaPotions: [] }
  const older: LevelingSnap = { ...base, aaList: { ts: 5, blocks: [] }, aaActivations: [{ name: 'Quick Buff', first: 1 }] }
  const newer: LevelingSnap = { ...base, aaList: null, aaActivations: [{ name: 'Quick Buff', first: 8 }, { ...act('Rampage', 7), rank: 2 }] }
  const m = mergeLeveling(older, newer)
  assert.ok(m !== null)
  assert.equal(m.aaList?.ts, 5)
  assert.deepEqual(m.aaActivations, [{ name: 'Quick Buff', first: 1 }, { name: 'Rampage', first: 7, rank: 2 }])
  const lower = mergeLeveling(newer, { ...base, aaActivations: [{ ...act('Rampage', 9), rank: 1 }] })
  assert.deepEqual(lower?.aaActivations?.find((a) => a.name === 'Rampage'), { name: 'Rampage', first: 7, rank: 2 })
  // A segment written before 2026-11-27 carries a `last` stamp; the merge drops it.
  const stamped = { ...base, aaActivations: [{ name: 'Quick Buff', first: 3, last: 4 }] }
  assert.deepEqual(mergeLeveling(stamped, stamped)?.aaActivations, [{ name: 'Quick Buff', first: 3 }])
  const later = mergeLeveling(older, { ...base, aaList: { ts: 9, blocks: [] } })
  assert.equal(later?.aaList?.ts, 9)
  // A segment written before the fields reads as one without them.
  assert.equal(mergeLeveling(base, base)?.aaActivations, undefined)
  assert.equal(mergeLeveling(base, older)?.aaList?.ts, 5)
})

test('AA_SPELL_NAMES is every AA table name that is also a spell name (spells.json)', () => {
  const spells = (JSON.parse(readFileSync(new URL('../src/main/data/spells.json', import.meta.url), 'utf8')) as { spells: { name: string }[] }).spells
  const names = new Set(spells.map((s) => aaFold(s.name)))
  const both = AA_ROWS.filter((r) => names.has(aaFold(r.name))).map((r) => aaFold(r.name))
  assert.deepEqual([...new Set(both)].sort(), [...AA_SPELL_NAMES].sort())
  assert.deepEqual([...AA_SPELL_NAMES].sort(), ['divine aura', 'rampage', 'stoicism'])
})

test('A SPELL CAST with no numeral does not prove the AA of the same name; an activation, reuse line or ranked cast still does', () => {
  // The engine marks a name seen only in `You begin casting X.` with no numeral (castOnly).
  const cast = (name: string): AaActivation => ({ ...act(name), castOnly: true })
  const casts = ranks({ activations: [cast('Divine Aura'), cast('Stoicism'), cast('Rampage')] }, {}, ['CLR', 'SHM', 'ENC'])
  for (const key of ['Divine Aura', 'Stoicism', 'Rampage']) assert.deepEqual([key, row(casts, key).source], [key, 'none'])
  // `You activate Divine Aura.` (no castOnly) and `You begin casting Rampage II.` keep counting.
  const used = ranks({ activations: [act('Divine Aura'), { ...act('Rampage'), rank: 2 }] }, {}, ['CLR', 'ENC'])
  assert.deepEqual([row(used, 'Divine Aura').rank, row(used, 'Divine Aura').source], [1, 'activated'])
  assert.deepEqual([row(used, 'Rampage').rank, row(used, 'Rampage').source], [2, 'activated'])
  // A numeral-less cast of an AA no spell shares a name with keeps counting (the engine keeps `Origin`).
  assert.equal(row(ranks({ activations: [cast('Quick Buff')] }), 'Quick Buff').source, 'activated')
})

test('mergeLeveling: a name stays castOnly only when every segment saw it only as a bare cast', () => {
  const base: LevelingSnap = { levels: [], aaGains: [], aaSpends: [], aaPotions: [] }
  const bare: LevelingSnap = { ...base, aaActivations: [{ name: 'Divine Aura', first: 1, castOnly: true }] }
  const proved: LevelingSnap = { ...base, aaActivations: [{ name: 'Divine Aura', first: 5 }] }
  assert.deepEqual(mergeLeveling(bare, bare)?.aaActivations, [{ name: 'Divine Aura', first: 1, castOnly: true }])
  assert.deepEqual(mergeLeveling(bare, proved)?.aaActivations, [{ name: 'Divine Aura', first: 1 }])
  assert.deepEqual(mergeLeveling(proved, bare)?.aaActivations, [{ name: 'Divine Aura', first: 1 }])
})

test('THE RANK PICKER offers only the picks the order of proof reads: none under a list a purchase beat, none below a use line', () => {
  const at = (hm: string): number => Date.parse(`2026-11-25T${hm}`)
  const fury = (pct: number, cost: number): AaListBlock => ({ id: 40, name: 'Combat Fury', description: `with all skills by ${String(pct)}%.`, cost })
  const stale: AaListRun = { ts: at('15:44:21'), zoneBefore: at('15:30:00'), blocks: [fury(2, 2), fury(3, 3)] }
  const bought = [1, 2, 3].map((k) => spend('Combat Fury', k, at('15:42:00') + k))
  const cases: [string, Partial<AaLogInput>, AaPicks][] = [
    ['list 2/4 beaten by a later purchase of rank 3', { list: stale, spends: bought }, {}],
    ['the list alone', { list: FRESH }, {}],
    ['seen used at rank 2 of 4', { activations: [{ ...act('Combat Fury'), rank: 2 }] }, {}],
    ['a pick of 3 above a use at rank 2', { activations: [{ ...act('Combat Fury'), rank: 2 }] }, { 'Combat Fury': 3 }],
    ['purchase lines only', { spends: bought }, {}]
  ]
  for (const [name, input, picks] of cases) {
    const shown = row(ranks(input, picks, ['ENC', 'WAR']), 'Combat Fury')
    for (let n = 0; n <= shown.max; n++) {
      const after = row(ranks(input, { ...picks, 'Combat Fury': n }, ['ENC', 'WAR']), 'Combat Fury')
      assert.equal(aaPickHeard(shown, n), after.source === 'pick' && after.rank === n, `${name}: pick ${String(n)}`)
    }
  }
  assert.equal(row(ranks({ list: stale, spends: bought }), 'Combat Fury').source, 'log')
})
