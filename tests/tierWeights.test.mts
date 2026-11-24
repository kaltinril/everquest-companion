// The Best in slot board's scoring model (src/shared/planner/tierWeights.ts, tierChips.ts;
// plans/2026-11-24-bis-sheet.md). Synthetic rows only: the corpus calibration is its own file
// (tierCalibration.test.mts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import {
  CHIP_KEYS,
  TIER_WEIGHT,
  boardFromText,
  boardToText,
  type Tier,
  type TierBoard,
  type TierChip
} from '../src/shared/planner/tierChips'
import {
  PRESET_ROLES,
  chipValue,
  defaultBoard,
  measureTierScale,
  presetBoard,
  tierScore,
  tierTerms,
  weaponKindOf,
  withLanes,
  type TierScale
} from '../src/shared/planner/tierWeights'

function row(name: string, over: Partial<GearRow> = {}): GearRow {
  return {
    key: name.toLowerCase(),
    name,
    searchKey: name.toLowerCase(),
    slots: ['FINGER'],
    classes: [],
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects: [],
    ...over
  }
}

/** Every chip in one lane. */
function flat(tier: Tier): TierBoard {
  return Object.fromEntries(CHIP_KEYS.map((c) => [c, tier])) as Record<TierChip, Tier>
}

/** A scale with every unit 1, so a score is weight x value and easy to read. */
const UNIT: TierScale = { units: Object.fromEntries(CHIP_KEYS.map((c) => [c, 1])) as Record<TierChip, number>, bonusRatioPerPoint: 0.01 }

const SWORD = row('Sword', { slots: ['PRIMARY', 'SECONDARY'], skill: '1H Slashing', stats: { DMG: 10, DELAY: 20, STR: 5 } })
const GREATAXE = row('Greataxe', { slots: ['PRIMARY'], skill: '2H Slashing', stats: { DMG: 30, DELAY: 40 } })
const BOW = row('Bow', { slots: ['RANGE'], skill: 'Archery', stats: { DMG: 8, DELAY: 30 } })

test('the chips: Malkil\'s excluded stats are absent and the three ratios are separate chips', () => {
  for (const banned of ['WEIGHT', 'DMG', 'DELAY', 'RANGE', 'SV_ALL']) assert.ok(!(CHIP_KEYS as readonly string[]).includes(banned), banned)
  for (const ratio of ['RATIO_1H', 'RATIO_2H', 'RATIO_RANGED']) assert.ok((CHIP_KEYS as readonly string[]).includes(ratio), ratio)
  assert.equal(new Set(CHIP_KEYS).size, CHIP_KEYS.length, 'no chip twice')
})

test('the lane weights: S 8 down to F 0.5, Off 0', () => {
  assert.deepEqual(TIER_WEIGHT, { S: 8, A: 5, B: 3, C: 2, D: 1, F: 0.5, Off: 0 })
})

test('a weapon reads only its own kind of ratio chip', () => {
  assert.equal(weaponKindOf('1H Slashing'), '1h')
  assert.equal(weaponKindOf('2H Blunt'), '2h')
  assert.equal(weaponKindOf('Archery'), 'ranged')
  assert.equal(weaponKindOf(undefined), null)
  assert.equal(chipValue('RATIO_1H', SWORD), 0.5)
  assert.equal(chipValue('RATIO_2H', SWORD), undefined)
  assert.equal(chipValue('RATIO_2H', GREATAXE), 0.75)
  assert.ok(chipValue('RATIO_RANGED', BOW) !== undefined)
  assert.equal(chipValue('RATIO_1H', row('Torch', { slots: ['PRIMARY'], stats: { DMG: 2, DELAY: 30 } })), undefined, 'no skill, no ratio')
})

test('all-resist saves count toward every resist chip; absent stays absent', () => {
  const ring = row('Ring', { stats: { SV_FIRE: 5, SV_ALL: 3 } })
  assert.equal(chipValue('SV_FIRE', ring), 8)
  assert.equal(chipValue('SV_COLD', ring), 3)
  assert.equal(chipValue('SV_FIRE', row('Plain')), undefined)
})

test('score = lane weight x value / unit; a penalty scores; Off scores nothing', () => {
  const board = withLanes(flat('Off'), { STR: 'S', DEX: 'C' })
  const item = row('Boots', { stats: { STR: 9, DEX: -4, AGI: 7 } })
  assert.equal(tierScore(item, board, { scale: UNIT }), 8 * 9 + 2 * -4)
  const halfUnits: TierScale = { ...UNIT, units: { ...UNIT.units, STR: 3 } }
  assert.equal(tierScore(item, board, { scale: halfUnits }), (8 * 9) / 3 + 2 * -4)
  assert.equal(tierScore(row('Nothing'), board, { scale: UNIT }), 0)
})

test('weapon ratios: never in an ANY cell or a non-weapon slot, whatever the lane (Malkil)', () => {
  const board = flat('S')
  const inAny = tierTerms(SWORD, board, { scale: UNIT, slot: 'ANY1' }).map((t) => t.chip)
  assert.ok(!inAny.includes('RATIO_1H'), 'ANY 1 reads no ratio')
  assert.ok(inAny.includes('STR'), 'but the stats still count there')
  assert.ok(!tierTerms(SWORD, board, { scale: UNIT, slot: 'ANY2' }).some((t) => t.chip === 'RATIO_1H'))
  assert.ok(!tierTerms(SWORD, board, { scale: UNIT, slot: 'EAR2' }).some((t) => t.chip === 'RATIO_1H'))
  assert.ok(tierTerms(SWORD, board, { scale: UNIT, slot: 'PRIMARY' }).some((t) => t.chip === 'RATIO_1H'))
  assert.ok(tierTerms(SWORD, board, { scale: UNIT }).some((t) => t.chip === 'RATIO_1H'), 'slot-free: counts')
  assert.ok(!tierTerms(BOW, board, { scale: UNIT, slot: 'PRIMARY' }).some((t) => t.chip === 'RATIO_RANGED'))
  assert.ok(tierTerms(BOW, board, { scale: UNIT, slot: 'RANGE' }).some((t) => t.chip === 'RATIO_RANGED'))
})

test('a 1H ratio counts in SECONDARY only for a class that dual wields', () => {
  const board = flat('S')
  const has = (classes: GearRow['classes']): boolean =>
    tierTerms(SWORD, board, { scale: UNIT, slot: 'SECONDARY', classes }).some((t) => t.chip === 'RATIO_1H')
  assert.equal(has(['WAR']), true)
  assert.equal(has(['CLR']), false)
  assert.equal(has(['CLR', 'MNK']), true, 'any picked class')
  assert.equal(has([]), true, 'no class picked is unknown, not nobody')
})

test('haste: credited only while none is worn, and dropped when the sheet prices it per loadout', () => {
  const board = withLanes(flat('Off'), { HASTE: 'S' })
  const belt = row('Belt', { slots: ['WAIST'], stats: { HASTE: 21 } })
  assert.equal(tierScore(belt, board, { scale: UNIT }), 8 * 21)
  assert.equal(tierScore(belt, board, { scale: UNIT, ownedHaste: 5 }), 0)
  assert.equal(tierScore(belt, board, { scale: UNIT, skipHaste: true }), 0)
})

test('the scale: medians of the positive stated values, a fallback for a resist nobody states', () => {
  const rows = [
    row('a', { stats: { STR: 2, SV_FIRE: 10 } }),
    row('b', { stats: { STR: 6, SV_COLD: 4 } }),
    row('c', { stats: { STR: 10, HP: -5 } }),
    row('w', { slots: ['PRIMARY'], skill: '2H Slashing', stats: { DMG: 34, DELAY: 40, DMG_BONUS: 17 } })
  ]
  const scale = measureTierScale(rows)
  assert.equal(scale.units.STR, 6)
  assert.equal(scale.units.HP, 1, 'only a penalty stated: the fallback 1')
  assert.equal(scale.units.SV_CORRUPTION, 10, 'nobody states it: the median of the resist units (4, 10)')
  assert.equal(scale.units.RATIO_2H, 34 / 40)
  assert.ok(scale.bonusRatioPerPoint > 0, 'a DMG bonus buys some ratio')
})

test('the default board: the class gate decides Off, the rest land in ranked lanes', () => {
  const scale = measureTierScale([
    row('a', { stats: { STR: 5, INT: 5, WIS: 5, AC: 10, HP: 30, MP: 30, CHA: 5, SV_FIRE: 5, HASTE: 20 } }),
    row('w', { slots: ['PRIMARY'], skill: '1H Slashing', stats: { DMG: 10, DELAY: 25 } })
  ])
  const warrior = defaultBoard(['WAR'], scale)
  assert.equal(warrior.INT, 'Off', 'a warrior has no mana bar: INT starts Off')
  assert.equal(warrior.WIS, 'Off')
  assert.equal(warrior.MP, 'Off')
  assert.equal(warrior.CHA, 'Off')
  assert.notEqual(warrior.STR, 'Off')
  assert.notEqual(warrior.AC, 'Off')
  const shaman = defaultBoard(['WAR', 'SHM'], scale)
  assert.notEqual(shaman.WIS, 'Off', 'a shaman in the trio casts from WIS')
  assert.equal(shaman.INT, 'Off')
  const nobody = defaultBoard([], scale)
  assert.notEqual(nobody.INT, 'Off', 'no class picked gates nothing')
})

test('every preset is a full board, and a tank prices AC above a nuker', () => {
  const scale = measureTierScale([row('a', { stats: { AC: 10, STR: 5, INT: 5, MP: 30, HP: 30 } })])
  const rank = (t: Tier): number => ['S', 'A', 'B', 'C', 'D', 'F', 'Off'].indexOf(t)
  for (const role of PRESET_ROLES) {
    const board = presetBoard(role, [], scale)
    assert.equal(Object.keys(board).length, CHIP_KEYS.length, role)
  }
  assert.ok(rank(presetBoard('tank', [], scale).AC) <= rank(presetBoard('dd', [], scale).AC))
})

test('a board round-trips through text, and a short or foreign line reads safely', () => {
  const board = withLanes(flat('C'), { STR: 'S', INT: 'Off', HASTE: 'F' })
  const text = boardToText(board)
  assert.ok(text.startsWith('bis1:'))
  assert.equal(text.length, 'bis1:'.length + CHIP_KEYS.length)
  assert.deepEqual(withLanes(flat('D'), boardFromText(text) ?? {}), board)
  assert.deepEqual(boardFromText('  BIS1:sa  '), { AC: 'S', HP: 'A' }, 'a shorter, older line states fewer chips')
  assert.equal(boardFromText('hello'), undefined)
  assert.equal(boardFromText('bis1:'), undefined)
  assert.equal(boardFromText('bis1:SQ'), undefined, 'an unknown lane letter')
  assert.ok(boardFromText(`bis1:${'C'.repeat(CHIP_KEYS.length + 3)}`) !== undefined, 'a newer build\'s extra chips are ignored')
})
