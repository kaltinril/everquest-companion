// The Best in slot sheet (src/shared/planner/bisSheet.ts, bisSearch.ts, bisCaps.ts;
// plans/2026-11-24-bis-sheet.md, "The sheet" and "Version 2 design"). The plan's named cases on
// synthetic rows, then the committed corpus: timing, the lore rule, and Malkil's own ranger board.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import { eraHides, eraUnconfirmed } from '../src/renderer/src/features/planner/plannerData'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { GearRow } from '../src/shared/planner/gear'
import { DAMAGE_FIRST, alignPairsToWorn, bisAdmits, buildBisSheet, cellScore, defaultChipCaps, hasteCounted, isLoreRow, itemHasteCap, type BisOptions, type BisSheet } from '../src/shared/planner/bisSheet'
import { CHIP_KEYS, uniformBoard, type Tier, type TierChip, type TierSetup } from '../src/shared/planner/tierChips'
import { defaultBoard } from '../src/shared/planner/tierDefaults'
import { buildTierModel, conversionsFor, deriveChips, round3, type TierModel } from '../src/shared/planner/tierWeights'
import type { PlanSlotId } from '../src/shared/planner/types'
import { ARROW_ELEMENTAL_WEIGHT, arrowRank, isArrow } from '../src/shared/planner/bisArrows'
import { HARD_STAT_CAPS, countedAmount, hasteCapAt, itemHasteRoom } from '../src/shared/planner/statCaps'

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

test('the haste cap by level less spell haste: item haste counts only up to the room left (owner, 2026-11-25)', () => {
  assert.deepEqual([hasteCapAt(20), hasteCapAt(50), hasteCapAt(55), hasteCapAt(60)], [45, 75, 85, 100], 'level+25 to 50, 85 at 51-59, 100 from 60')
  assert.equal(itemHasteRoom(50, 30), 45)
  assert.equal(itemHasteRoom(50, 90), 0, 'never below 0')
  const fast = row('Fast Belt', { slots: ['WAIST'], stats: { HASTE: 40 } })
  const plated = row('Plated Belt', { slots: ['WAIST'], stats: { HASTE: 25, AC: 2 } })
  const lanes = setup({ HASTE: 'S', AC: 'C' })
  assert.equal(pickOf(sheet([fast, plated], lanes), 'WAIST'), 'Fast Belt', 'no spell haste field: all 40% counts')
  const room = itemHasteRoom(50, 50)
  const s = sheet([fast, plated], lanes, { hasteRoom: room })
  assert.equal(room, 25)
  assert.equal(pickOf(s, 'WAIST'), 'Plated Belt', 'only 25% can count, so its AC decides')
  assert.equal(s.total, 64 * 25 + 3 * 2, 'haste once, at the room; the AC in WAIST and both ANY cells')
  assert.equal(s.totals.HASTE, 25, 'the totals read the room')
  const lone = sheet([{ ...fast, flags: ['Lore Item'] }], lanes, { hasteRoom: room }).cells.find((c) => c.cell === 'WAIST')?.pick
  assert.deepEqual([lone?.hasteCounted, lone?.score], [25, 64 * 25], 'the card scores read the same room')
  assert.equal(cellScore(fast, 'WAIST', 0, { model: flatModel(), setup: lanes, classes: [], hasteRoom: room }).hasteCounted, 25)
  assert.equal(sheet([fast], lanes, { hasteRoom: 0 }).totals.HASTE ?? 0, 0, 'spell haste at the cap: item haste counts nothing')
  assert.equal(itemHasteCap({ setup: setup({}, { caps: { HASTE: 20 } }), hasteRoom: 25 }), 20, "the player's own cap when lower")
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

test('a bow in Range puts the best arrow in Ammo: damage first, elemental at half, stats break a tie (owner, 2026-11-25)', () => {
  const bow = row('Plain Bow', { slots: ['RANGE'], skill: 'Archery', stats: { DMG: 10, DELAY: 30 } })
  const charm = row('Agile Charm', { slots: ['AMMO'], stats: { AGI: 5 } })
  const shard = row('Shardwing Arrow', { slots: ['AMMO'], stats: { DMG: 12 } })
  const blessed = row('Blessed Champion Arrows', { slots: ['AMMO'], skill: 'Archery', elementalDmg: 4, stats: { DMG: 11 } })
  const frost = row('Frost Arrow', { slots: ['AMMO'], skill: 'Archery', elementalDmg: 3, stats: { DMG: 10 } })
  const dex = row('Dex Arrow', { slots: ['AMMO'], skill: 'Archery', stats: { DMG: 12, AGI: 1 } })
  const lanes = setup({ RATIO_RANGED: 'S', AGI: 'C' })
  const s = sheet([bow, charm, shard, blessed, frost], lanes, { classes: ['RNG'] })
  assert.equal(pickOf(s, 'RANGE'), 'Plain Bow')
  const ammo = s.cells.find((c) => c.cell === 'AMMO')
  assert.equal(ammo?.pick?.row.name, 'Blessed Champion Arrows', 'DMG 11 + 4 elemental at half (13) beats DMG 12, and beats the AGI charm')
  assert.equal(ammo?.arrowForBow, true)
  assert.deepEqual(ammo?.runnersUp.map((r) => r.row.name), ['Shardwing Arrow', 'Frost Arrow'], 'the next arrows, by damage: 12 beats 10 + 3 at half')
  assert.equal(pickOf(sheet([bow, shard, dex], lanes, { classes: ['RNG'] }), 'AMMO'), 'Dex Arrow', 'same damage: the stats break the tie')
  const noBow = sheet([charm, shard, blessed], lanes, { classes: ['RNG'] })
  assert.equal(pickOf(noBow, 'AMMO'), 'Agile Charm', 'no bow: Ammo is scored as before')
  assert.equal(noBow.cells.find((c) => c.cell === 'AMMO')?.arrowForBow, undefined)
  assert.ok(isArrow(shard) && !isArrow(charm) && !isArrow(row('Velium Bolt', { slots: ['AMMO'], stats: { DMG: 5 } })))
  assert.equal(arrowRank(blessed), 11 + ARROW_ELEMENTAL_WEIGHT * 4)
})

test('a bow in Range with no arrow to fire: the Ammo item the total counts is shown on the Ammo card (audit 2026-11-27 gear-1)', () => {
  const bow = row('Dex Bow', { slots: ['RANGE'], skill: 'Archery', stats: { DEX: 5 } })
  const stone = row('Dex Stone', { slots: ['AMMO'], stats: { DEX: 4 } })
  const ring = row('Dex Ring', { stats: { DEX: 10 } })
  const s = sheet([bow, stone, ring], setup({ DEX: 'S' }), { owned: new Map([['dex bow', 1], ['dex stone', 1], ['dex ring', 4]]) })
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Dex Ring').length, 4, 'the rings take the fingers and the ANY cells')
  assert.equal(pickOf(s, 'RANGE'), 'Dex Bow')
  const ammo = s.cells.find((c) => c.cell === 'AMMO')
  assert.equal(ammo?.pick?.row.name, 'Dex Stone', 'no arrow is held, so the stone the search placed is what Ammo shows')
  assert.equal(ammo?.arrowForBow, undefined, 'it is not an arrow for the bow')
  assert.equal(s.total, 64 * (40 + 5 + 4))
  assert.equal(s.totals.DEX, 49, 'the totals table counts the stone the total counts')
  assert.equal(s.filled, 6)
})

test("attributes stop at eqlwiki's hard cap, 510, with no click; a cap the player sets wins (owner, 2026-11-25)", () => {
  const str = row('Str Ring', { stats: { STR: 300 } })
  const ac = row('Plated Ring', { stats: { AC: 10 } })
  const lanes = setup({ STR: 'S', AC: 'C' })
  const byDefault = sheet([str, ac], lanes)
  assert.equal(RINGS.filter((c) => pickOf(byDefault, c) === 'Str Ring').length, 2, 'a third 300 STR ring would be past 510')
  assert.equal(byDefault.total, 64 * 510 + 2 * 10)
  assert.equal(byDefault.totals.STR, 600, 'the totals stay what the gear gives')
  const own = sheet([str, ac], setup({ STR: 'S', AC: 'C' }, { caps: { STR: 1000 } }))
  assert.equal(RINGS.filter((c) => pickOf(own, c) === 'Str Ring').length, 4, "the player's 1000 replaces the 510")
  assert.equal(own.total, 64 * 1000)
  assert.deepEqual(defaultChipCaps(), { STR: 510, AGI: 510, DEX: 510, CHA: 510 })
})

test('a soft cap counts each point above it at its rate: the seam for reincarnation and AA bonuses', () => {
  assert.equal(countedAmount(600, { value: 510, over: 0.2 }), 528)
  assert.equal(countedAmount(600, { value: 510, over: 0 }), 510, 'hard')
  assert.equal(countedAmount(400, { value: 510, over: 0 }), 400)
  assert.equal(HARD_STAT_CAPS.WIS?.value, 510)
  const str = row('Str Ring', { stats: { STR: 300 } })
  const s = sheet([str, row('Plated Ring', { stats: { AC: 10 } })], setup({ STR: 'S', AC: 'C' }), { statCaps: { STR: { value: 510, over: 0.2 } } })
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Str Ring').length, 4)
  assert.equal(s.total, round3(64 * (510 + 690 * 0.2)), 'above 510 a point counts a fifth')
})

test('STA, INT and WIS are capped inside HP and Mana: STA above 510 adds no HP', () => {
  const sta = row('Sta Ring', { stats: { STA: 300 } })
  const s = sheet([sta, row('Plated Ring', { stats: { AC: 10 } })], setup({ HP: 'S', AC: 'C' }), { classes: ['WAR'] })
  assert.equal(RINGS.filter((c) => pickOf(s, c) === 'Sta Ring').length, 2)
  assert.equal(s.total, 64 * 510 * 6 + 2 * 10, 'a warrior at 60: 6 HP a point of STA, 510 of them')
})

test('under a binding cap the weapon is still ranked damage first', () => {
  const wu = row("Wu's Fist", { slots: ['PRIMARY', 'SECONDARY'], skill: 'Hand to Hand', stats: { DMG: 16, DELAY: 22 } })
  const blood = row("Blood's Unity", { slots: ['PRIMARY'], skill: '1H Slashing', stats: { DMG: 11, DELAY: 20, STR: 15, AGI: 15 } })
  const s = sheet([wu, blood], setup({ RATIO_1H: 'S', STR: 'S', AGI: 'S' }), { classes: ['MNK'], statCaps: { STR: { value: 20, over: 0 } } })
  assert.equal(pickOf(s, 'PRIMARY'), "Wu's Fist")
  assert.ok(s.total > 0 && s.total < DAMAGE_FIRST, 'the ranking weight is taken back out of a capped total too')
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
  assert.equal(bisAdmits(OAKWYND, { classes: ['RNG'] }), false, 'held by nobody: out')
})

test('best overall keeps an unobtainable item the character holds, one cell per copy held (owner, 2026-11-25)', () => {
  const held = sheet([OAKWYND, WAR_BOW], setup({ RATIO_RANGED: 'S' }), { classes: ['RNG'], held: new Map([['oakwynd', 1]]) })
  assert.equal(pickOf(held, 'RANGE'), 'Oakwynd')
  assert.equal(bisAdmits(OAKWYND, { classes: ['RNG'], held: new Map([['oakwynd', 1]]) }), true)
  assert.equal(bisAdmits(OAKWYND, { classes: ['RNG'], held: new Map([['war bow', 1]]) }), false)
  // a held map never gates an obtainable row: best overall still offers what the character lacks
  assert.equal(bisAdmits(WAR_BOW, { classes: ['RNG'], held: new Map() }), true)
})

test('over the corpus: the ranger sheet never offers Oakwynd (the 2026-11-25 report)', () => {
  const classes: ClassAbbr[] = ['RNG']
  assert.equal(inEra.find((r) => r.key === 'oakwynd')?.unobtainable, true, 'in the rows Current era admits, flagged')
  const s = buildBisSheet({ rows: inEra, setup: { board: defaultBoard('classes', classes), step: 4, split: false, caps: {} }, model: buildTierModel(inEra, classes, 60), classes })
  const range = s.cells.find((c) => c.cell === 'RANGE')
  assert.ok(range?.pick !== undefined && range.pick.row.key !== 'oakwynd', range?.pick?.row.name)
  assert.ok(!s.cells.some((c) => c.pick?.row.unobtainable === true || c.runnersUp.some((r) => r.row.unobtainable === true)))
})

// A mage's summoned item and a Temporary NPC drop: gone at the next camp, never a recommendation,
// held or not (owner, 2026-11-25, on Summoned: Coldstone in Ammo).
const COLDSTONE = row('Summoned: Coldstone', { slots: ['NECK', 'PRIMARY', 'SECONDARY', 'AMMO'], flags: ['Magic Item', 'Temporary'], stats: { AC: 15 } })
const SHADOWED = row('Shadowed Ring', { flags: ['Magic Item', 'Temporary'], stats: { AC: 40 } })
const PLAIN_AMMO = row('Plain Stone', { slots: ['AMMO'], stats: { AC: 1 } })

test('a summoned or Temporary item is dropped before scoring, even held, even in owned-only mode (owner)', () => {
  const held = new Map([['summoned: coldstone', 1], ['shadowed ring', 1], ['plain stone', 1]])
  for (const extra of [{}, { held }, { owned: held }] as Partial<BisOptions>[]) {
    const s = sheet([COLDSTONE, SHADOWED, PLAIN_AMMO], setup({ AC: 'S' }), extra)
    // one owned copy may sit in an ANY cell instead; what matters is the summoned stone never does
    assert.ok(s.cells.some((c) => c.pick?.row.name === 'Plain Stone'), JSON.stringify(s.cells.map((c) => [c.cell, c.pick?.row.name])))
    assert.ok(!s.cells.some((c) => c.pick?.row.flags.includes('Temporary') || c.runnersUp.some((r) => r.row.flags.includes('Temporary'))))
  }
  assert.equal(bisAdmits(row('Summoned: Bread'), { classes: [] }), false, 'the name prefix alone is enough')
})

test("the caller's era gate refuses a row, but a copy the character holds passes it (an owned item is owned)", () => {
  const undated = row('Undated Ring', { stats: { AC: 30 } })
  const admit = (r: GearRow): boolean => r.key !== 'undated ring'
  assert.equal(bisAdmits(undated, { classes: [], admit }), false)
  assert.equal(bisAdmits(undated, { classes: [], admit, held: new Map([['undated ring', 1]]) }), true)
  assert.equal(pickOf(sheet([undated, row('Plain Ring', { stats: { AC: 1 } })], setup({ AC: 'S' }), { admit }), 'FINGER'), 'Plain Ring')
})

test('over the corpus under the recommenders\' era gate: the WAR/MNK/SHM sheet takes no summoned item and no undated one (the 2026-11-25 screenshot)', () => {
  const classes: ClassAbbr[] = ['WAR', 'MNK', 'SHM']
  const admit = (r: GearRow): boolean => !eraUnconfirmed(r as never, true)
  assert.equal(admit(corpus.find((r) => r.key === 'dwarven plate boots (enchanted imbued)') as GearRow), false, 'no page dates it')
  assert.equal(admit(corpus.find((r) => r.key === 'golden efreeti turban') as GearRow), true, 'a Plane of Sky drop is in era')
  const s = buildBisSheet({ rows: corpus, setup: { board: defaultBoard('classes', classes), step: 4, split: false, caps: {} }, model: buildTierModel(inEra, classes, 50), classes, admit })
  const picks = s.cells.flatMap((c) => (c.pick === undefined ? [] : [c.pick.row]))
  assert.ok(picks.length > 15, `${String(picks.length)} cells filled`)
  assert.ok(!picks.some((r) => /^summoned:/i.test(r.name) || r.flags.includes('Temporary')), picks.map((r) => r.name).join(', '))
  assert.ok(!picks.some((r) => admit(r) === false), 'every pick is positively in era')
})

// `Class: NONE`: no player wears it, e.g. the pet-illusion form an item converts to (owner, 2026-11-25).
test('a Class: NONE item is never a pick, held or not; the wearable form it converts from is', () => {
  const collar = row('Collar of Necropotence', { slots: ['NECK'], classes: [], noClass: true, stats: { AC: 50 } })
  const amulet = row('Amulet of Necropotence', { slots: ['NECK'], classes: [], stats: { AC: 5 } })
  for (const extra of [{}, { held: new Map([['collar of necropotence', 1]]) }] as Partial<BisOptions>[]) {
    assert.equal(pickOf(sheet([collar, amulet], setup({ AC: 'S' }), extra), 'NECK'), 'Amulet of Necropotence')
  }
  assert.equal(bisAdmits(collar, { classes: ['WAR'] }), false)
  const flagged = corpus.filter((r) => r.noClass === true).map((r) => r.key)
  assert.ok(flagged.includes('collar of necropotence') && flagged.includes('guise of the deceived'), flagged.join(', '))
  assert.ok(!flagged.includes('amulet of necropotence') && !flagged.includes('guise of the deceiver'))
  assert.ok((corpus.find((r) => r.key === 'amulet of necropotence')?.classes.length ?? 0) > 0, 'the wearable form states classes')
})
