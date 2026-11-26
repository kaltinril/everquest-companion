// The Best in slot board's scoring model, version 2 (src/shared/planner/tierChips.ts, tierWeights.ts,
// tierDefaults.ts; plans/2026-11-24-bis-sheet.md "Version 2 design"). Nothing here reads the old BEST
// formula (owner, 2026-11-24: "this is a experiment to find the best in slot without my old
// calculations").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import {
  CHIP_KEYS,
  activeChips,
  boardFromText,
  boardToText,
  tierWeight,
  uniformBoard,
  type TierChip,
  type TierSetup
} from '../src/shared/planner/tierChips'
import { defaultBoard, TIER_PRESETS } from '../src/shared/planner/tierDefaults'
import {
  MIN_ENDGAME_SAMPLES,
  buildTierModel,
  chipUnit,
  conversionsFor,
  deriveChips,
  itemBudget,
  levelBand,
  ratioCounts,
  tierScore,
  tierTerms,
  type TierItem,
  type TierModel
} from '../src/shared/planner/tierWeights'

function setup(lanes: Partial<Record<TierChip, TierSetup['board'][TierChip]>>, over: Partial<TierSetup> = {}): TierSetup {
  return { board: { ...uniformBoard('Off'), ...lanes }, step: 4, split: false, caps: {}, ...over }
}

/** Units of 1 for every chip, so a score reads as lane weight x value. */
function flatModel(classes: GearRow['classes'] = [], level = 60): TierModel {
  const conv = conversionsFor(classes, level)
  return { conv, units: Object.fromEntries(CHIP_KEYS.map((c) => [c, 1])) as Record<TierChip, number>, typicalBudget: new Map(), valuesOf: (it) => deriveChips(it, conv) }
}

test('a lane weighs step times the next: C is 1, S is step cubed, Off is nothing', () => {
  assert.deepEqual(['S', 'A', 'B', 'C', 'D', 'F'].map((t) => tierWeight(t as never, 4)), [64, 16, 4, 1, 0.25, 0.0625])
  assert.equal(tierWeight('S', 2), 8)
  assert.equal(tierWeight('S', 25), 15625)
  assert.equal(tierWeight('Off', 4), 0)
})

test('one S stat beats four C stats of the same size (owner: S "is the most important period")', () => {
  const model = flatModel()
  const s = setup({ DEX: 'S', AC: 'C', AGI: 'C', STR: 'C', ATTACK: 'C' })
  for (const step of [2, 4, 25] as const) {
    const dex = tierScore({ stats: { DEX: 6 } }, { model, setup: { ...s, step } })
    const four = tierScore({ stats: { AC: 6, AGI: 6, STR: 6, ATTACK: 6 } }, { model, setup: { ...s, step } })
    assert.ok(dex > four, `step ${step}: ${dex} > ${four}`)
  }
})

test('STA is HP by the best HP factor of the picked classes, at the chosen level', () => {
  assert.equal(conversionsFor(['WAR'], 60).hpPerSta, 6)
  assert.equal(conversionsFor(['WIZ'], 60).hpPerSta, 2.4)
  assert.equal(conversionsFor(['WIZ', 'WAR'], 60).hpPerSta, 6, 'the best factor of the trio')
  assert.equal(deriveChips({ stats: { HP: 10, STA: 5 } }, conversionsFor(['WAR'], 60)).HP, 40)
  assert.equal(deriveChips({ stats: { STA: 5 } }, conversionsFor(['WAR'], 30)).HP, 15)
})

test('INT and WIS are mana only, and only for the classes that cast from them (owner)', () => {
  const int = { stats: { INT: 10 } }
  assert.equal(deriveChips(int, conversionsFor(['WAR'], 60)).MANA, undefined, 'a warrior gets nothing from INT')
  assert.equal(deriveChips(int, conversionsFor(['RNG'], 60)).MANA, undefined, 'a ranger casts from WIS')
  assert.equal(deriveChips(int, conversionsFor(['WIZ'], 60)).MANA, 112.5)
  assert.equal(deriveChips({ stats: { WIS: 10, MP: 20 } }, conversionsFor(['RNG'], 60)).MANA, 132.5)
  assert.equal(deriveChips({ stats: { STR: 10 } }, conversionsFor([], 60)).MANA, undefined, 'absent stays absent')
})

test('the five classic resists count as their average; SV Void is its own; all-resist lines add to each', () => {
  const conv = conversionsFor([], 60)
  const five = deriveChips({ stats: { SV_FIRE: 10, SV_COLD: 10, SV_MAGIC: 10, SV_DISEASE: 10, SV_POISON: 10 } }, conv)
  assert.equal(five.RESISTS, 10)
  assert.equal(deriveChips({ stats: { SV_FIRE: 10 } }, conv).RESISTS, 2)
  const all = deriveChips({ stats: { SV_ALL: 5, SV_VOID: 3 } }, conv)
  assert.equal(all.RESISTS, 5)
  assert.equal(all.SV_FIRE, 5)
  assert.equal(all.SV_VOID, 3)
  assert.ok(activeChips(false).includes('RESISTS') && !activeChips(false).includes('SV_FIRE'))
  assert.ok(activeChips(true).includes('SV_FIRE') && !activeChips(true).includes('RESISTS'))
})

test('a weapon reads only its own ratio chip, and a ratio never counts in an ANY cell (Malkil)', () => {
  const conv = conversionsFor([], 60)
  const sword = deriveChips({ stats: { DMG: 10, DELAY: 20 }, skill: '1H Slashing' }, conv)
  assert.ok(sword.RATIO_1H !== undefined && sword.RATIO_2H === undefined && sword.RATIO_RANGED === undefined)
  assert.ok(deriveChips({ stats: { DMG: 8, DELAY: 30 }, skill: 'Archery' }, conv).RATIO_RANGED !== undefined)
  assert.equal(ratioCounts('RATIO_1H', 'ANY1', []), false)
  assert.equal(ratioCounts('RATIO_1H', 'EAR', []), false)
  assert.equal(ratioCounts('RATIO_1H', 'PRIMARY', []), true)
  assert.equal(ratioCounts('RATIO_1H', 'SECONDARY', ['CLR']), false, 'a cleric does not dual wield')
  assert.equal(ratioCounts('RATIO_1H', 'SECONDARY', ['WAR']), true)
  assert.equal(ratioCounts('RATIO_RANGED', 'RANGE', []), true)
  assert.equal(ratioCounts('RATIO_1H', undefined, []), true, 'slot-free (the Gear table): wherever stated')
})

test('score = lane weight x value / unit; a penalty scores; Off scores nothing; haste credit as ever', () => {
  const model = flatModel()
  const s = setup({ STR: 'C', DEX: 'S', HASTE: 'C' })
  assert.equal(tierScore({ stats: { STR: 5, DEX: -1 } }, { model, setup: s }), 5 - 64)
  assert.equal(tierScore({ stats: { AGI: 50 } }, { model, setup: s }), 0)
  assert.equal(tierScore({ stats: { HASTE: 30 } }, { model, setup: s, ownedHaste: 20 }), 0, 'haste is credited only while none is worn')
  assert.equal(tierScore({ stats: { HASTE: 30 } }, { model, setup: s, skipHaste: true }), 0)
  assert.deepEqual(tierTerms({ stats: { STR: 5 } }, { model, setup: s }).map((t) => t.chip), ['STR'])
})

function endgame(name: string, stats: GearRow['stats'], dl = '55'): TierItem {
  return { stats, dropLevels: [dl], slots: ['HEAD'], ...({ name } as object) }
}

test('split resists in one lane score exactly what the one Resists chip scores (owner, 2026-11-25)', () => {
  const rows: TierItem[] = []
  for (let i = 0; i < MIN_ENDGAME_SAMPLES; i++) rows.push(endgame(`e${i}`, { SV_FIRE: 8, SV_ALL: 2 }), endgame(`m${i}`, { SV_MAGIC: 15 }))
  const model = buildTierModel(rows, [], 60)
  assert.notEqual(model.units.SV_FIRE, model.units.RESISTS, 'the measured units differ, so the fifth rides on the Resists unit')
  const item = { stats: { SV_FIRE: 12, SV_COLD: 12, SV_MAGIC: 12, SV_DISEASE: 12, SV_POISON: 12 } }
  const joined = tierScore(item, { model, setup: setup({ RESISTS: 'A' }) })
  const split = tierScore(item, { model, setup: setup({ SV_FIRE: 'A', SV_COLD: 'A', SV_MAGIC: 'A', SV_DISEASE: 'A', SV_POISON: 'A' }, { split: true }) })
  assert.ok(joined > 0)
  assert.equal(split, joined)
  const fireOnly = { stats: { SV_FIRE: 20 } }
  assert.equal(tierScore(fireOnly, { model, setup: setup({ SV_FIRE: 'A' }, { split: true }) }), tierScore(fireOnly, { model, setup: setup({ RESISTS: 'A' }) }), 'one resist too')
  assert.equal(chipUnit(model.units, 'SV_COLD'), model.units.RESISTS * 5)
})

test('units: the median over endgame rows, every row when endgame rows are too few', () => {
  const rows: TierItem[] = []
  for (let i = 0; i < MIN_ENDGAME_SAMPLES; i++) rows.push(endgame(`e${i}`, { STR: 6, AC: 14 }))
  for (let i = 0; i < 40; i++) rows.push(endgame(`l${i}`, { STR: 2, DEX: 3 }, '20'))
  const model = buildTierModel(rows, [], 60)
  assert.equal(model.units.STR, 6, 'enough endgame STR: the endgame median')
  assert.equal(model.units.DEX, 3, 'no endgame DEX: every row')
  assert.equal(model.units.SV_VOID, 1, 'nothing states it: 1, so every score stays finite')
})

test('item budget: against the typical item of its slot and level band; revamp gear is its own band', () => {
  assert.equal(levelBand({ stats: {}, dropLevels: ['47'] }), 'lvl 36-50')
  assert.equal(levelBand({ stats: {}, dropLevels: ['63+', '55'] }), 'lvl 51+')
  assert.equal(levelBand({ stats: {}, eraTag: 'Chardok Revamp', dropLevels: ['30'] }), 'Legends revamp')
  assert.equal(levelBand({ stats: {} }), undefined)
  const rows: TierItem[] = []
  for (let i = 0; i < 20; i++) rows.push(endgame(`h${i}`, { STR: 6 }))
  const big = endgame('big', { STR: 12 })
  const model = buildTierModel([...rows, big], [], 60)
  assert.equal(itemBudget(big, model)?.ratio, 2)
  assert.equal(itemBudget({ stats: { STR: 6 } }, model), undefined, 'no drop level, nothing to compare')
})

test('defaults come from class guides: a ranger leads with DEX and the bow, a warrior has no mana', () => {
  const rng = defaultBoard('classes', ['RNG'])
  assert.equal(rng.DEX, 'S')
  assert.equal(rng.RATIO_RANGED, 'S')
  assert.equal(rng.HASTE, 'S')
  assert.equal(rng.MANA, 'B')
  const war = defaultBoard('classes', ['WAR'])
  assert.equal(war.MANA, 'Off')
  assert.equal(war.BACKSTAB, 'Off')
  assert.equal(war.AC, 'S')
  assert.equal(defaultBoard('classes', ['RNG', 'WIZ']).MANA, 'S', 'the best lane any picked class gives')
  const none = defaultBoard('classes', [])
  assert.equal(none.AC, 'B')
  assert.equal(none.STR, 'C')
  assert.equal(defaultBoard('classes', ['RNG']).SV_FIRE, defaultBoard('classes', ['RNG']).RESISTS, 'split resists start in the RESISTS lane')
  for (const preset of TIER_PRESETS) assert.equal(Object.keys(defaultBoard(preset, ['WAR'])).length, CHIP_KEYS.length)
})

test('a board round-trips through text with its step, split and caps; a foreign line reads as nothing', () => {
  const s: TierSetup = { board: defaultBoard('classes', ['RNG']), step: 25, split: true, caps: { DEX: 510, HASTE: 70 } }
  const back = boardFromText(boardToText(s))
  assert.deepEqual(back?.lanes, s.board)
  assert.equal(back?.step, 25)
  assert.equal(back?.split, true)
  assert.deepEqual(back?.caps, { DEX: 510, HASTE: 70 })
  assert.equal(boardFromText('hello'), undefined)
  assert.equal(boardFromText('bis2:4:SQ'), undefined)
  assert.equal(boardFromText('bis2:4:SS;NOPE=3'), undefined)
  assert.deepEqual(boardFromText('bis2:2:SA')?.lanes, { AC: 'S', HP: 'A' }, 'a short line is partial')
})
