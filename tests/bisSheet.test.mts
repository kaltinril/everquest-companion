// The Best in slot sheet (src/shared/planner/bisSheet.ts, bisSearch.ts; plans/2026-11-24-bis-sheet.md,
// phase 2). The plan's named cases on synthetic rows, then one run over the committed corpus for the
// timing and the lore rule.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import type { GearRow } from '../src/shared/planner/gear'
import { buildBisSheet, isLoreRow, type BisSheet } from '../src/shared/planner/bisSheet'
import { CHIP_KEYS, type Tier, type TierBoard, type TierChip } from '../src/shared/planner/tierChips'
import { defaultBoard, measureTierScale, withLanes, type TierScale } from '../src/shared/planner/tierWeights'
import type { PlanSlotId } from '../src/shared/planner/types'

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

function lanes(set: Partial<Record<TierChip, Tier>>): TierBoard {
  return withLanes(Object.fromEntries(CHIP_KEYS.map((c) => [c, 'Off'])) as Record<TierChip, Tier>, set)
}

const UNIT: TierScale = { units: Object.fromEntries(CHIP_KEYS.map((c) => [c, 1])) as Record<TierChip, number>, bonusRatioPerPoint: 0 }

function pickOf(sheet: BisSheet, cell: PlanSlotId): string | undefined {
  return sheet.cells.find((c) => c.cell === cell)?.pick?.row.name
}

function sheet(rows: GearRow[], board: TierBoard, extra: Partial<Parameters<typeof buildBisSheet>[0]> = {}): BisSheet {
  return buildBisSheet({ rows, board, scale: UNIT, classes: [], ...extra })
}

test('two plain rings fill both fingers', () => {
  const s = sheet([row('Plain Ring', { stats: { STR: 10 } }), row('Lesser Ring', { stats: { STR: 2 } })], lanes({ STR: 'S' }))
  assert.equal(pickOf(s, 'FINGER'), 'Plain Ring')
  assert.equal(pickOf(s, 'FINGER2'), 'Plain Ring')
})

test('a Lore Equipped ring is placed once across the sheet, ANY cells included (Malkil)', () => {
  const lore = row('Lore Ring', { flags: ['Magic Item', 'Lore Equipped'], stats: { STR: 20 } })
  const plain = row('Plain Ring', { stats: { STR: 5 } })
  const s = sheet([lore, plain], lanes({ STR: 'S' }))
  const cells: PlanSlotId[] = ['FINGER', 'FINGER2', 'ANY1', 'ANY2']
  assert.equal(cells.filter((c) => pickOf(s, c) === 'Lore Ring').length, 1)
  assert.equal(cells.filter((c) => pickOf(s, c) === 'Plain Ring').length, 3)
  assert.ok(isLoreRow(row('x', { flags: ['LORE EQUPPED'] })), 'the wiki\'s misspelling is lore too')
  assert.ok(isLoreRow(row('x', { flags: ['Lore Item'] })))
  assert.ok(!isLoreRow(row('x', { flags: ['No Trade'] })))
})

test('a weapon in an ANY cell scores no ratio, whatever the ratio lane (Malkil)', () => {
  const sword = row('Big Sword', { slots: ['PRIMARY'], skill: '1H Slashing', stats: { DMG: 40, DELAY: 20, STR: 1 } })
  const charm = row('Charm', { slots: ['CHARM' as never, 'NECK'], stats: { STR: 5 } })
  const s = sheet([sword, charm], lanes({ RATIO_1H: 'S', STR: 'C' }))
  assert.equal(pickOf(s, 'PRIMARY'), 'Big Sword')
  assert.equal(pickOf(s, 'ANY1'), 'Charm', 'the ratio does not carry the sword into ANY')
  assert.equal(pickOf(s, 'ANY2'), 'Charm')
  const swordOnly = sheet([sword], lanes({ RATIO_1H: 'S', STR: 'C' }))
  const any = swordOnly.cells.find((c) => c.cell === 'ANY1')?.pick
  assert.equal(any?.score, 2, 'in ANY the sword is its STR alone')
  assert.ok(!(any?.reasons ?? []).some((r) => r.chip === 'RATIO_1H'))
})

test('a two-hander closes the offhand, and is weighed against a one-hander plus the offhand', () => {
  const axe = row('Greataxe', { slots: ['PRIMARY'], skill: '2H Slashing', stats: { DMG: 60, DELAY: 40 } })
  const sword = row('Sword', { slots: ['PRIMARY', 'SECONDARY'], skill: '1H Slashing', stats: { DMG: 10, DELAY: 20 } })
  const shield = row('Tower Shield', { slots: ['SECONDARY'], stats: { AC: 4 } })
  const axeWins = sheet([axe, sword, shield], lanes({ RATIO_2H: 'S', RATIO_1H: 'S', AC: 'F' }), { classes: ['CLR'] })
  assert.equal(pickOf(axeWins, 'PRIMARY'), 'Greataxe')
  assert.equal(pickOf(axeWins, 'SECONDARY'), undefined)
  assert.equal(axeWins.cells.find((c) => c.cell === 'SECONDARY')?.closedByTwoHander, true)
  const shieldWins = sheet([axe, sword, shield], lanes({ RATIO_2H: 'S', RATIO_1H: 'S', AC: 'S' }), { classes: ['CLR'] })
  assert.equal(pickOf(shieldWins, 'PRIMARY'), 'Sword')
  assert.equal(pickOf(shieldWins, 'SECONDARY'), 'Tower Shield')
})

test('the class picks limit the sheet; an item stating no classes is kept and flagged', () => {
  const cleric = row('Cleric Ring', { classes: ['CLR'], stats: { STR: 30 } })
  const unknown = row('Odd Ring', { classes: [], stats: { STR: 10 } })
  const warrior = row('Warrior Ring', { classes: ['WAR'], stats: { STR: 5 } })
  const s = sheet([cleric, unknown, warrior], lanes({ STR: 'S' }), { classes: ['WAR', 'MNK'] })
  assert.ok(!s.cells.some((c) => c.pick?.row.name === 'Cleric Ring' || c.runnersUp.some((r) => r.row.name === 'Cleric Ring')))
  assert.equal(pickOf(s, 'FINGER'), 'Odd Ring')
  assert.ok(s.unknownClasses.has('odd ring'))
  assert.ok(!s.unknownClasses.has('warrior ring'))
})

test('a warrior\'s default board starts INT Off, so a caster ring earns nothing', () => {
  const rows = [row('Int Ring', { stats: { INT: 15 } }), row('Str Ring', { stats: { STR: 3 } })]
  const scale = measureTierScale(rows)
  const board = defaultBoard(['WAR'], scale)
  assert.equal(board.INT, 'Off')
  const s = buildBisSheet({ rows, board, scale, classes: ['WAR'] })
  assert.equal(pickOf(s, 'FINGER'), 'Str Ring')
})

test('haste is counted once per loadout: a second haste item is worth only its other stats', () => {
  const belt = row('Haste Belt', { slots: ['WAIST'], stats: { HASTE: 30 } })
  const hasteCloak = row('Haste Cloak', { slots: ['BACK'], stats: { HASTE: 30, AC: 1 } })
  const acCloak = row('Plated Cloak', { slots: ['BACK'], stats: { AC: 5 } })
  const s = sheet([belt, hasteCloak, acCloak], lanes({ HASTE: 'S', AC: 'C' }))
  assert.equal(pickOf(s, 'WAIST'), 'Haste Belt')
  assert.equal(pickOf(s, 'BACK'), 'Plated Cloak')
  // the belt once, and the plated cloak three times: BACK and both ANY cells (it is not lore)
  assert.equal(s.total, 8 * 30 + 3 * 2 * 5)
  assert.equal(s.totals.HASTE, 30)
})

test('owned-only: an item fills no more cells than copies owned', () => {
  const ring = row('Plain Ring', { stats: { STR: 10 } })
  const other = row('Other Ring', { stats: { STR: 1 } })
  const s = sheet([ring, other], lanes({ STR: 'S' }), { owned: new Map([['plain ring', 1], ['other ring', 4]]) })
  const cells: PlanSlotId[] = ['FINGER', 'FINGER2', 'ANY1', 'ANY2']
  assert.equal(cells.filter((c) => pickOf(s, c) === 'Plain Ring').length, 1)
  assert.equal(cells.filter((c) => pickOf(s, c) === 'Other Ring').length, 3)
  const none = sheet([ring], lanes({ STR: 'S' }), { owned: new Map() })
  assert.equal(pickOf(none, 'FINGER'), undefined, 'nothing owned, nothing picked')
})

test('the caller\'s gate (era, level) is honoured', () => {
  const s = sheet([row('Old Ring', { eraTag: 'Kunark', stats: { STR: 20 } }), row('Ring', { stats: { STR: 1 } })], lanes({ STR: 'S' }), {
    admit: (r) => r.eraTag !== 'Kunark'
  })
  assert.equal(pickOf(s, 'FINGER'), 'Ring')
})

test('over the corpus: every cell read, and fast', () => {
  const rows = buildGearIndex(itemsJson as unknown as ItemDbFile).rows
  const scale = measureTierScale(rows)
  for (const classes of [[], ['WAR', 'MNK', 'SHM']] as const) {
    const board = defaultBoard(classes, scale)
    const t0 = performance.now()
    const s = buildBisSheet({ rows, board, scale, classes })
    const ms = performance.now() - t0
    console.log(`sheet, classes [${classes.join(' ')}]: ${ms.toFixed(0)} ms, total ${String(s.total)}`)
    assert.equal(s.cells.length, 23)
    assert.ok(s.cells.filter((c) => c.pick !== undefined).length >= 20, 'nearly every cell has an item')
    assert.ok(ms < 3000, `${ms.toFixed(0)} ms`)
    const lorePicks = s.cells.flatMap((c) => (c.pick !== undefined && isLoreRow(c.pick.row) ? [c.pick.row.key] : []))
    assert.equal(new Set(lorePicks).size, lorePicks.length, 'no lore item twice')
  }
})
