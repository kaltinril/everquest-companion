// The Best in slot sheet (src/shared/planner/bisSheet.ts, bisSearch.ts, bisCaps.ts;
// plans/2026-11-24-bis-sheet.md, "The sheet" and "Version 2 design"). The plan's named cases on
// synthetic rows, then the committed corpus: timing, the lore rule, and Malkil's own ranger board.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import { eraHides } from '../src/renderer/src/features/planner/plannerData'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { GearRow } from '../src/shared/planner/gear'
import { DAMAGE_FIRST, alignPairsToWorn, bisAdmits, buildBisSheet, hasteCounted, isLoreRow, type BisOptions, type BisSheet } from '../src/shared/planner/bisSheet'
import { CHIP_KEYS, uniformBoard, type Tier, type TierChip, type TierSetup } from '../src/shared/planner/tierChips'
import { defaultBoard } from '../src/shared/planner/tierDefaults'
import { buildTierModel, conversionsFor, deriveChips, type TierModel } from '../src/shared/planner/tierWeights'
import type { PlanSlotId } from '../src/shared/planner/types'

function row(name: string, over: Partial<GearRow> = {}): GearRow {
  return { key: name.toLowerCase(), name, searchKey: name.toLowerCase(), slots: ['FINGER'], classes: [], races: ['ALL'], flags: [], quest: false, playerCrafted: false, stats: {}, effects: [], ...over }
}

function setup(lanes: Partial<Record<TierChip, Tier>>, over: Partial<TierSetup> = {}): TierSetup {
  return { board: { ...uniformBoard('Off'), ...lanes }, step: 4, split: false, caps: {}, ...over }
}

/** Units of 1, so points read as lane weight x value (S 64, C 1). */
function flatModel(classes: readonly ClassAbbr[] = []): TierModel {
  const conv = conversionsFor(classes, 60)
  return { conv, units: Object.fromEntries(CHIP_KEYS.map((c) => [c, 1])) as Record<TierChip, number>, typicalBudget: new Map(), valuesOf: (it) => deriveChips(it, conv) }
}

function pickOf(sheet: BisSheet, cell: PlanSlotId): string | undefined {
  return sheet.cells.find((c) => c.cell === cell)?.pick?.row.name
}

function sheet(rows: GearRow[], s: TierSetup, extra: Partial<BisOptions> = {}): BisSheet {
  const classes = extra.classes ?? []
  return buildBisSheet({ rows, setup: s, model: flatModel(classes), classes, ...extra })
}

const RINGS: PlanSlotId[] = ['FINGER', 'FINGER2', 'ANY1', 'ANY2']

test('two plain rings fill both fingers', () => {
  const s = sheet([row('Plain Ring', { stats: { STR: 10 } }), row('Lesser Ring', { stats: { STR: 2 } })], setup({ STR: 'S' }))
  assert.equal(pickOf(s, 'FINGER'), 'Plain Ring')
  assert.equal(pickOf(s, 'FINGER2'), 'Plain Ring')
})

test('a Lore Equipped ring is placed once across the sheet, ANY cells included (Malkil)', () => {
  const lore = row('Lore Ring', { flags: ['Magic Item', 'Lore Equipped'], stats: { STR: 20 } })
  const s = sheet([lore, row('Plain Ring', { stats: { STR: 5 } })], setup({ STR: 'S' }))
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Lore Ring').length, 1)
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Plain Ring').length, 3)
  assert.ok(isLoreRow(row('x', { flags: ['LORE EQUPPED'] })), "the wiki's misspelling is lore too")
  assert.ok(!isLoreRow(row('x', { flags: ['No Trade'] })))
})

test('a weapon in an ANY cell scores no ratio, whatever the ratio lane (Malkil)', () => {
  const sword = row('Big Sword', { slots: ['PRIMARY'], skill: '1H Slashing', stats: { DMG: 40, DELAY: 20, STR: 1 } })
  const swordOnly = sheet([sword], setup({ RATIO_1H: 'S', STR: 'C' }))
  assert.equal(pickOf(swordOnly, 'PRIMARY'), 'Big Sword')
  const any = swordOnly.cells.find((c) => c.cell === 'ANY1')?.pick
  assert.equal(any?.score, 1, 'in ANY the sword is its STR alone')
  assert.ok(!(any?.reasons ?? []).some((r) => r.chip === 'RATIO_1H'))
})

test('a two-hander closes the offhand, and is weighed against a one-hander plus the offhand', () => {
  const axe = row('Greataxe', { slots: ['PRIMARY'], skill: '2H Slashing', stats: { DMG: 60, DELAY: 40 } })
  const sword = row('Sword', { slots: ['PRIMARY', 'SECONDARY'], skill: '1H Slashing', stats: { DMG: 10, DELAY: 20 } })
  const shield = row('Tower Shield', { slots: ['SECONDARY'], stats: { AC: 4 } })
  const axeWins = sheet([axe, sword, shield], setup({ RATIO_2H: 'S', RATIO_1H: 'S', AC: 'F' }), { classes: ['CLR'] })
  assert.equal(pickOf(axeWins, 'PRIMARY'), 'Greataxe')
  assert.equal(pickOf(axeWins, 'SECONDARY'), undefined)
  assert.equal(axeWins.cells.find((c) => c.cell === 'SECONDARY')?.closedByTwoHander, true)
  assert.equal(pickOf(sheet([axe, sword, shield], setup({ RATIO_2H: 'S', RATIO_1H: 'S', AC: 'S' }), { classes: ['CLR'] }), 'PRIMARY'), 'Greataxe', 'ratios in S: damage first, the shield cannot buy it back')
  const shieldWins = sheet([axe, sword, shield], setup({ RATIO_2H: 'A', RATIO_1H: 'A', AC: 'S' }), { classes: ['CLR'] })
  assert.equal(pickOf(shieldWins, 'PRIMARY'), 'Sword')
  assert.equal(pickOf(shieldWins, 'SECONDARY'), 'Tower Shield')
})

test('the class picks limit the sheet; an item stating no classes is kept', () => {
  const cleric = row('Cleric Ring', { classes: ['CLR'], stats: { STR: 30 } })
  const unknown = row('Odd Ring', { classes: [], stats: { STR: 10 } })
  const s = sheet([cleric, unknown, row('Warrior Ring', { classes: ['WAR'], stats: { STR: 5 } })], setup({ STR: 'S' }), { classes: ['WAR', 'MNK'] })
  assert.ok(!s.cells.some((c) => c.pick?.row.name === 'Cleric Ring' || c.runnersUp.some((r) => r.row.name === 'Cleric Ring')))
  assert.equal(pickOf(s, 'FINGER'), 'Odd Ring')
})

test("INT counts only for INT classes: a warrior's INT ring earns nothing, a wizard's does", () => {
  const rows = [row('Int Ring', { stats: { INT: 15 } }), row('Str Ring', { stats: { STR: 3 } })]
  const lanes = setup({ MANA: 'S', STR: 'C' })
  assert.equal(pickOf(sheet(rows, lanes, { classes: ['WAR'] }), 'FINGER'), 'Str Ring')
  assert.equal(pickOf(sheet(rows, lanes, { classes: ['WIZ'] }), 'FINGER'), 'Int Ring')
  assert.equal(defaultBoard('classes', ['WAR']).MANA, 'Off', "and the warrior's board starts mana Off")
})

test('haste is counted once per loadout: a second haste item is worth only its other stats', () => {
  const belt = row('Haste Belt', { slots: ['WAIST'], stats: { HASTE: 30 } })
  const hasteCloak = row('Haste Cloak', { slots: ['BACK'], stats: { HASTE: 30, AC: 1 } })
  const acCloak = row('Plated Cloak', { slots: ['BACK'], stats: { AC: 5 } })
  const s = sheet([belt, hasteCloak, acCloak], setup({ HASTE: 'S', AC: 'C' }))
  assert.equal(pickOf(s, 'WAIST'), 'Haste Belt')
  assert.equal(pickOf(s, 'BACK'), 'Plated Cloak')
  assert.equal(s.total, 64 * 30 + 3 * 5, 'the belt once; the plated cloak in BACK and both ANY cells')
  assert.equal(s.totals.HASTE, 30)
})

test("each card's score counts haste only above the other slots' best: haste does not stack (owner R1)", () => {
  const belt = row('Haste Belt', { slots: ['WAIST'], stats: { HASTE: 30 } })
  const gloves = row('Haste Gloves', { slots: ['HANDS'], stats: { HASTE: 21, AC: 2 } })
  const plainGloves = row('Plain Gloves', { slots: ['HANDS'], stats: { AC: 1 } })
  const s = sheet([belt, gloves, plainGloves], setup({ HASTE: 'S', AC: 'C' }))
  const hands = s.cells.find((c) => c.cell === 'HANDS')
  const waistPick = s.cells.find((c) => c.cell === 'WAIST')?.pick
  assert.ok(hands?.pick !== undefined && waistPick !== undefined)
  assert.equal(hands.pick.row.name, 'Haste Gloves', 'its AC still makes it the best gloves')
  assert.deepEqual([hands.pick.hasteCounted, hands.pick.score, hands.otherHaste], [0, 2, 30], 'the belt already gives more haste: its AC alone (C is 1 a point here)')
  assert.deepEqual([waistPick.hasteCounted, waistPick.score], [9, 64 * 9], 'the belt is credited only above the gloves: 30 - 21')
  assert.ok(!hands.pick.reasons.some((r) => r.chip === 'HASTE'), 'no haste in the why line')
  assert.deepEqual(hands.runnersUp.map((r) => [r.row.name, r.score]), [['Plain Gloves', 1]], 'runners-up scored the same way')
})

test('a pair is laid on the side the player wears it: same scores, only the side moves (owner: earring on the other ear)', () => {
  const bigRing = row('Big Ring', { stats: { STR: 20 } })
  const s = sheet([row('Bashing Earring', { slots: ['EAR'], flags: ['Lore Item'], stats: { STR: 9 } }), row('Checkmate', { slots: ['EAR'], flags: ['Lore Item'], stats: { STR: 5 } }), bigRing], setup({ STR: 'S' }))
  const ear = (sh: BisSheet, c: PlanSlotId): string | undefined => sh.cells.find((x) => x.cell === c)?.pick?.row.name
  const where: PlanSlotId = ear(s, 'EAR') === 'Bashing Earring' ? 'EAR' : 'EAR2'
  const other: PlanSlotId = where === 'EAR' ? 'EAR2' : 'EAR'
  const laid = alignPairsToWorn(s, (c) => (c === other ? 'bashing earring' : undefined))
  assert.equal(ear(laid, other), 'Bashing Earring', 'moved to the ear it is worn in')
  assert.equal(ear(laid, where), 'Checkmate')
  assert.equal(laid.total, s.total)
  assert.deepEqual(laid.cells.map((c) => c.cell), s.cells.map((c) => c.cell), 'the cells keep their order')
  assert.equal(ear(alignPairsToWorn(s, (c) => (c === where ? 'bashing earring' : undefined)), where), 'Bashing Earring', 'already on its side: nothing moves')
})

test('damage first: with the 1H ratio in S, the best ratio wins the hands over a weapon full of stats (owner: Wu\'s Fist)', () => {
  const wu = row("Wu's Fist", { slots: ['PRIMARY', 'SECONDARY'], skill: 'Hand to Hand', stats: { DMG: 16, DELAY: 22 } })
  const blood = row("Blood's Unity", { slots: ['PRIMARY'], skill: '1H Slashing', stats: { DMG: 11, DELAY: 20, STR: 15, STA: 15, AGI: 15 } })
  const lanes = { RATIO_1H: 'S' as const, STR: 'S' as const, AGI: 'S' as const }
  const s = sheet([wu, blood], setup(lanes), { classes: ['MNK'] })
  assert.equal(pickOf(s, 'PRIMARY'), "Wu's Fist")
  assert.equal(pickOf(s, 'SECONDARY'), "Wu's Fist", 'a monk dual wields it')
  const primary = s.cells.find((c) => c.cell === 'PRIMARY')
  assert.equal(primary?.pick?.damageFirst, 0.73)
  assert.ok(s.total < DAMAGE_FIRST, 'the ranking weight is not in the total')
  assert.equal(primary?.runnersUp[0]?.row.name, "Blood's Unity", 'runners-up in damage order too')
  const notS = sheet([wu, blood], setup({ ...lanes, RATIO_1H: 'A' }), { classes: ['MNK'] })
  assert.equal(pickOf(notS, 'PRIMARY'), "Blood's Unity", 'below S the ratio is an ordinary stat again')
  assert.equal(notS.cells.find((c) => c.cell === 'ANY1')?.pick?.damageFirst, undefined, 'never in an Any slot')
})

test('hasteCounted: the part above the other haste, both under the cap; a penalty in full', () => {
  assert.equal(hasteCounted(30, 36, undefined), 0)
  assert.equal(hasteCounted(41, 36, 40), 4, 'both sides under the cap')
  assert.equal(hasteCounted(-5, 36, undefined), -5, 'a penalty always counts')
})

test('a cap stops a stat counting above it, and the loadout fills with other stats instead (owner)', () => {
  const dex = row('Dex Ring', { stats: { DEX: 10 } })
  const ac = row('Plated Ring', { stats: { AC: 10 } })
  const free = sheet([dex, ac], setup({ DEX: 'S', AC: 'C' }))
  assert.equal(RINGS.filter((c) => pickOf(free, c) === 'Dex Ring').length, 4)
  const capped = sheet([dex, ac], setup({ DEX: 'S', AC: 'C' }, { caps: { DEX: 10 } }))
  assert.equal(RINGS.filter((c) => pickOf(capped, c) === 'Dex Ring').length, 1)
  assert.equal(RINGS.filter((c) => pickOf(capped, c) === 'Plated Ring').length, 3)
  assert.equal(capped.totals.DEX, 10)
  assert.equal(capped.total, 64 * 10 + 3 * 10)
})

test('owned-only: an item fills no more cells than copies owned', () => {
  const s = sheet([row('Plain Ring', { stats: { STR: 10 } }), row('Other Ring', { stats: { STR: 1 } })], setup({ STR: 'S' }), {
    owned: new Map([['plain ring', 1], ['other ring', 4]])
  })
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Plain Ring').length, 1)
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Other Ring').length, 3)
})

test("the caller's gate (era) is honoured", () => {
  const s = sheet([row('Old Ring', { eraTag: 'Kunark', stats: { STR: 20 } }), row('Ring', { stats: { STR: 1 } })], setup({ STR: 'S' }), { admit: (r) => r.eraTag !== 'Kunark' })
  assert.equal(pickOf(s, 'FINGER'), 'Ring')
})

const corpus = buildGearIndex(itemsJson as unknown as ItemDbFile).rows
const inEra = corpus.filter((r) => !eraHides(r as never, true))

test("Malkil's ranger board puts a DEX helm on HEAD, not the Wizard cap (his first report)", () => {
  const classes: ClassAbbr[] = ['RNG', 'MAG', 'WIZ']
  const board = { ...uniformBoard('Off'), DEX: 'S', ATTACK: 'S', HASTE: 'S', RATIO_RANGED: 'S', AGI: 'B', HP_REGEN: 'B', AC: 'C', HP: 'C', MANA: 'C', MANA_REGEN: 'C', END_REGEN: 'C', RESISTS: 'C', SV_VOID: 'C', DMG_BONUS: 'F' } as const
  const model = buildTierModel(inEra, classes, 60)
  const s = buildBisSheet({ rows: inEra, setup: { board, step: 4, split: false, caps: {} }, model, classes })
  assert.equal(pickOf(s, 'HEAD'), 'Executioners Hood')
})

test('over the corpus: every cell read, no lore item twice, and fast', () => {
  for (const classes of [[], ['WAR', 'MNK', 'SHM'], ['RNG']] as ClassAbbr[][]) {
    const model = buildTierModel(inEra, classes, 60)
    const t0 = performance.now()
    const s = buildBisSheet({ rows: inEra, setup: { board: defaultBoard('classes', classes), step: 4, split: false, caps: { HP: 2000 } }, model, classes })
    const ms = performance.now() - t0
    console.log(`sheet, classes [${classes.join(' ')}]: ${ms.toFixed(0)} ms, total ${String(s.total)}`)
    assert.equal(s.cells.length, 23)
    assert.ok(s.cells.filter((c) => c.pick !== undefined).length >= 20, 'nearly every cell has an item')
    assert.ok(ms < 4000, `${ms.toFixed(0)} ms`)
    const lorePicks = s.cells.flatMap((c) => (c.pick !== undefined && isLoreRow(c.pick.row) ? [c.pick.row.key] : []))
    assert.equal(new Set(lorePicks).size, lorePicks.length, 'no lore item twice')
  }
})

// Oakwynd as the gear index builds it (a GM-event bow whose page carries the Does Not Exist banner),
// beside a bow a ranger can get (owner, 2026-11-25: "Oakwynd is not obtainable in EverQuest Legends").
const OAKWYND = row('Oakwynd', { slots: ['RANGE'], classes: ['RNG'], skill: 'Archery', flags: ['Magic Item', 'Lore Item'], stats: { DMG: 175, DELAY: 20 }, unobtainable: true })
const WAR_BOW = row('War Bow', { slots: ['RANGE'], classes: ['RNG'], skill: 'Archery', stats: { DMG: 24, DELAY: 25 } })

test('an item no player can obtain is dropped before the sheet scores: Oakwynd is not the ranger RANGE pick (owner)', () => {
  const s = sheet([OAKWYND, WAR_BOW], setup({ RATIO_RANGED: 'S' }), { classes: ['RNG'] })
  const range = s.cells.find((c) => c.cell === 'RANGE')
  assert.equal(range?.pick?.row.name, 'War Bow')
  assert.ok(!s.cells.some((c) => c.pick?.row.key === 'oakwynd' || c.runnersUp.some((r) => r.row.key === 'oakwynd')), 'nowhere, runners-up included')
  assert.equal(bisAdmits(OAKWYND, { classes: ['RNG'] }), false, 'the gate the tab\'s other walk (useStated) asks')
  assert.equal(bisAdmits(WAR_BOW, { classes: ['RNG'] }), true)
})

test('owned-only keeps an unobtainable item the character owns: owning it proves it can be had', () => {
  const owned = sheet([OAKWYND, WAR_BOW], setup({ RATIO_RANGED: 'S' }), { classes: ['RNG'], owned: new Map([['oakwynd', 1], ['war bow', 1]]) })
  assert.equal(pickOf(owned, 'RANGE'), 'Oakwynd')
  assert.equal(bisAdmits(OAKWYND, { classes: ['RNG'], owned: new Map([['oakwynd', 1]]) }), true)
  const notOwned = sheet([OAKWYND, WAR_BOW], setup({ RATIO_RANGED: 'S' }), { classes: ['RNG'], owned: new Map([['war bow', 1]]) })
  assert.equal(pickOf(notOwned, 'RANGE'), 'War Bow')
  // Best overall ignores ownership altogether, as it always has: the row stays out.
  assert.equal(bisAdmits(OAKWYND, { classes: ['RNG'] }), false)
})

test('over the corpus: the ranger sheet never offers Oakwynd (the 2026-11-25 report)', () => {
  const classes: ClassAbbr[] = ['RNG']
  assert.equal(inEra.find((r) => r.key === 'oakwynd')?.unobtainable, true, 'in the rows Current era admits, flagged')
  const s = buildBisSheet({ rows: inEra, setup: { board: defaultBoard('classes', classes), step: 4, split: false, caps: {} }, model: buildTierModel(inEra, classes, 60), classes })
  const range = s.cells.find((c) => c.cell === 'RANGE')
  assert.ok(range?.pick !== undefined && range.pick.row.key !== 'oakwynd', range?.pick?.row.name)
  assert.ok(!s.cells.some((c) => c.pick?.row.unobtainable === true || c.runnersUp.some((r) => r.row.unobtainable === true)))
})
