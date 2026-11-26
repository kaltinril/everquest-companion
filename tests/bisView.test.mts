// The Best in slot tab's logic without a window (src/renderer/src/features/gear/bisPrefs.ts, bisText.ts)
// and the Gear tab's BEST column reading the board (gearFilter.sortValue). The scoring itself is
// tests/tierWeights.test.mts; the sheet tests/bisSheet.test.mts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import { CHIP_KEYS, boardToText, uniformBoard, type TierChip } from '../src/shared/planner/tierChips'
import { defaultBoard } from '../src/shared/planner/tierDefaults'
import { conversionsFor, deriveChips, type TierModel } from '../src/shared/planner/tierWeights'
import { CAPPED_ATTRIBUTES, DEFAULT_BIS_PREFS, LEGENDS_STAT_CAP, activeSetup, tankResistTargets, withCaps, clampLevel, sanitizeBisPrefs, matchesSaved, sanitizeSaved, withCleared, withLoadedBoard, withPasted, withSavedBoard, withSplit } from '../src/renderer/src/features/gear/bisPrefs'
import { budgetText, chipHint, chipValueText, compareRows, hasteNote, loadoutTotals, ownedCopies, sourceText, termText, totalsRows } from '../src/renderer/src/features/gear/bisText'
import { maxCharacterLevel } from '../src/shared/planner/statCaps'
import { sortValue } from '../src/renderer/src/features/gear/gearFilter'
import type { GearOwnershipMap } from '../src/renderer/src/features/gear/gearOwnership'

function model(classes: GearRow['classes'] = []): TierModel {
  const conv = conversionsFor(classes, 60)
  return { conv, units: Object.fromEntries(CHIP_KEYS.map((c) => [c, 1])) as Record<TierChip, number>, typicalBudget: new Map(), valuesOf: (it) => deriveChips(it, conv) }
}

function row(name: string, over: Partial<GearRow> = {}): GearRow {
  return { key: name.toLowerCase(), name, searchKey: name.toLowerCase(), slots: ['HEAD'], classes: [], races: ['ALL'], flags: [], quest: false, playerCrafted: false, stats: {}, effects: [], ...over }
}

test('stored prefs: anything odd reads as its default; a board must name every chip', () => {
  assert.deepEqual(sanitizeBisPrefs(null), DEFAULT_BIS_PREFS)
  assert.deepEqual(sanitizeBisPrefs('nonsense'), DEFAULT_BIS_PREFS)
  const p = sanitizeBisPrefs({ preset: 'ranged', step: 25, split: true, level: 99, caps: { DEX: 510, RATIO_1H: 3, HP: 'x' }, era: false, owned: true, board: { AC: 'S' } })
  assert.equal(p.preset, 'ranged')
  assert.equal(p.step, 25)
  assert.equal(p.split, true)
  assert.equal(p.level, maxCharacterLevel(), 'clamped to the level cap')
  assert.deepEqual(p.caps, { DEX: 510 }, 'no cap on a ratio, none that is not a number')
  assert.equal(p.board, null, 'a partial board is not a board')
  assert.equal(p.era, false)
  assert.equal(p.owned, true)
  assert.equal(sanitizeBisPrefs({ step: 3 }).step, 4)
  assert.equal(clampLevel(Number.NaN), 50)
  assert.equal(DEFAULT_BIS_PREFS.level, 50, 'characters are level 50 at most (owner, 2026-11-25)')
  assert.equal(clampLevel(60, new Date(2026, 11, 7, 23, 59)), 50, 'a stored 60 comes down to 50 before Kunark')
  assert.equal(clampLevel(60, new Date(2026, 11, 8)), 55, 'and to 55 from its local launch day')
  assert.equal(clampLevel(53, new Date(2026, 11, 8)), 53)
  assert.equal(sanitizeBisPrefs({ level: 60 }).level, maxCharacterLevel(), 'clamped on load')
})

test('the board in force follows the classes until the player edits it', () => {
  assert.equal(activeSetup(DEFAULT_BIS_PREFS, ['RNG']).board.DEX, 'S')
  assert.equal(activeSetup(DEFAULT_BIS_PREFS, ['WAR']).board.MANA, 'Off')
  const own = { ...DEFAULT_BIS_PREFS, board: uniformBoard('C') }
  assert.equal(activeSetup(own, ['WAR']).board.MANA, 'C', 'an edited board is the player\'s')
})

test('split resists: the five take the RESISTS lane, joined RESISTS takes the best of the five', () => {
  const board = { ...uniformBoard('F'), RESISTS: 'B' as const }
  const split = withSplit({ ...DEFAULT_BIS_PREFS, board })
  assert.equal(split.split, true)
  assert.equal(split.board?.SV_FIRE, 'B')
  const joined = withSplit({ ...split, board: { ...uniformBoard('F'), SV_COLD: 'A', SV_FIRE: 'D' } })
  assert.equal(joined.board?.RESISTS, 'A')
  assert.equal(withSplit(DEFAULT_BIS_PREFS).board, null, 'a default board stays a default')
})

test('a pasted board is laid over the board in force; a foreign line is refused', () => {
  const line = boardToText({ board: defaultBoard('ranged', []), step: 2, split: false, caps: { DEX: 300 } })
  const next = withPasted(DEFAULT_BIS_PREFS, ['WAR'], line)
  assert.equal(next?.board?.DEX, 'S')
  assert.equal(next?.step, 2)
  assert.deepEqual(next?.caps, { DEX: 300 })
  assert.equal(withPasted(DEFAULT_BIS_PREFS, [], 'hello'), undefined)
})

test('words: values, reasons with STA/WIS/INT shown inside, hints, budget, source', () => {
  assert.equal(chipValueText('HASTE', 36), '36%')
  assert.equal(chipValueText('RATIO_RANGED', 0.2916), '0.29')
  assert.equal(chipValueText('RESISTS', 3), '+3.0 avg')
  assert.equal(chipValueText('DEX', -2), '-2')
  assert.equal(termText({ stats: { HP: 40, STA: 7 } }, { chip: 'HP', value: 82 }), 'HP +82 (STA 7)')
  assert.equal(termText({ stats: { WIS: 8, INT: 3 } }, { chip: 'MANA', value: 124 }), 'Mana +124 (WIS 8, INT 3)')
  assert.equal(termText({ stats: { DEX: 9 } }, { chip: 'DEX', value: 9 }), 'DEX +9')
  assert.match(chipHint('MANA', conversionsFor(['WAR'], 60), 60) ?? '', /No picked class/)
  assert.match(chipHint('HP', conversionsFor(['WAR'], 60), 60) ?? '', /1 STA is 6\.0 HP/)
  assert.match(chipHint('STR', conversionsFor([], 60), 60) ?? '', /nothing for a bow/)
  assert.deepEqual(budgetText({ ratio: 1.4, band: 'lvl 51+', slot: 'HEAD' }), { text: 'Stat budget estimate: 140% of a typical lvl 51+ head (our own estimate; it does not change the ranking)', tone: 'good' })
  assert.equal(budgetText({ ratio: 0.5, band: 'Legends revamp', slot: 'FEET' })?.tone, 'warn')
  assert.equal(budgetText(undefined), undefined)
  assert.equal(sourceText({ dropZones: ['', 'Lower Guk'], dropMobs: ['', 'the froglok king'], dropLevels: ['', '47'] }), 'Lower Guk · the froglok king (lvl 47)')
  assert.equal(sourceText({ playerCrafted: true }), 'Player crafted')
  assert.equal(sourceText({}), 'Source not stated')
})

test('owned copies count every wearable copy the dump names', () => {
  const map: GearOwnershipMap = new Map([
    ['ring', { facts: [{ place: 'bank' as never, count: 2 }, { place: 'equipped' as never, count: 1 }], exaltations: 0, owned: true, looted: false, lootedNotInDump: false }],
    ['gem', { facts: [], exaltations: 1, owned: false, looted: false, lootedNotInDump: false }]
  ])
  assert.deepEqual([...ownedCopies(map)], [['ring', 3]])
  assert.equal(ownedCopies(null).size, 0)
})

test('totals: summed, haste the best one, the best lane first, a reached cap marked', () => {
  const m = model(['WAR'])
  const rows = [{ stats: { DEX: 5, HASTE: 21 } }, { stats: { DEX: 7, HASTE: 36, AC: 10 } }]
  const totals = loadoutTotals(rows, m, false)
  assert.deepEqual(totals, { DEX: 12, HASTE: 36, AC: 10 })
  const setup = { board: { ...uniformBoard('Off'), DEX: 'S' as const, AC: 'C' as const, HASTE: 'A' as const }, step: 4 as const, split: false, caps: { DEX: 12 } }
  const out = totalsRows(totals, { DEX: 3 }, setup)
  assert.deepEqual(out.map((r) => r.chip), ['DEX', 'HASTE', 'AC'])
  assert.equal(out[0].cap, '12 capped')
  assert.equal(out[0].worn, '3')
  assert.equal(out[2].worn, '-')
  assert.equal(loadoutTotals(rows, m, false, 25).HASTE, 25, 'item haste down to the room left under the cap')
})

test('spell haste: 0 by default, stored whole between 0 and 100 (owner, 2026-11-25)', () => {
  assert.equal(DEFAULT_BIS_PREFS.spellHaste, 0)
  assert.equal(sanitizeBisPrefs({ spellHaste: 30.4 }).spellHaste, 30)
  assert.equal(sanitizeBisPrefs({ spellHaste: -5 }).spellHaste, 0)
  assert.equal(sanitizeBisPrefs({ spellHaste: 140 }).spellHaste, 100)
  assert.equal(sanitizeBisPrefs({ spellHaste: 'x' }).spellHaste, 0)
  const back = sanitizeBisPrefs(JSON.parse(JSON.stringify({ ...DEFAULT_BIS_PREFS, spellHaste: 45 })))
  assert.equal(back.spellHaste, 45, 'round-trips through the store')
})

test('the Gear tab BEST column reads the board when one is handed in, and the Ignore haste chip still drops haste', () => {
  const m = model()
  const setup = { board: { ...uniformBoard('Off'), DEX: 'S' as const, HASTE: 'C' as const }, step: 4 as const, split: false, caps: {} }
  const dexHelm = row('Dex Helm', { stats: { DEX: 9, AC: 5 } })
  assert.equal(sortValue(dexHelm, 'BIS', { tier: { model: m, setup } }), 64 * 9)
  const hasteHelm = row('Haste Helm', { stats: { HASTE: 20 } })
  assert.equal(sortValue(hasteHelm, 'BIS', { tier: { model: m, setup } }), 20)
  assert.equal(sortValue(hasteHelm, 'BIS', { tier: { model: m, setup }, ignoreHaste: true }), undefined, 'nothing left: blank, sorts last')
  assert.ok(sortValue(dexHelm, 'BIS', {}) !== undefined, 'without a board the old score still answers (the pure callers)')
})

test('Clear tiers drops every stat to Unassigned and clears the caps (owner R1)', () => {
  const cleared = withCleared({ ...DEFAULT_BIS_PREFS, caps: { DEX: 300 } })
  assert.ok(CHIP_KEYS.every((c) => cleared.board?.[c] === 'Off'))
  assert.deepEqual(cleared.caps, {})
})

test('named tier lists: saved resolved, same name replaced, sorted, sanitized, loaded (owner R1)', () => {
  const ranged = { board: defaultBoard('ranged', []), step: 2 as const, split: true, caps: { DEX: 300 } }
  let list = withSavedBoard([], '  Malkil ranger ', ranged)
  assert.equal(list[0].name, 'Malkil ranger')
  list = withSavedBoard(list, 'Alt tank', { board: defaultBoard('tank', []), step: 4, split: false, caps: {} })
  list = withSavedBoard(list, 'MALKIL RANGER', { ...ranged, step: 25 })
  assert.deepEqual(list.map((s) => s.name), ['Alt tank', 'MALKIL RANGER'], 'same name in any case replaces')
  assert.equal(withSavedBoard(list, '   ', ranged).length, 2, 'a blank name saves nothing')
  const back = sanitizeSaved(JSON.parse(JSON.stringify(list)))
  assert.deepEqual(back, list)
  assert.deepEqual(sanitizeSaved([{ name: 'x', board: { AC: 'S' } }, 'junk', { board: list[0].board }]), [], 'partial boards and nameless entries are dropped')
  const loaded = withLoadedBoard(DEFAULT_BIS_PREFS, list[1])
  assert.equal(loaded.step, 25)
  assert.equal(loaded.split, true)
  assert.equal(loaded.board?.DEX, 'S')
  assert.deepEqual(loaded.caps, { DEX: 300 })
  assert.equal(loaded.list, 'MALKIL RANGER', 'the Start from menu shows the list in force')
  assert.ok(matchesSaved(list[1], activeSetup(loaded, [])), 'untouched: not edited')
  assert.ok(!matchesSaved(list[1], { ...activeSetup(loaded, []), caps: {} }), 'a cap removed: edited')
  assert.equal(sanitizeBisPrefs({ list: 'Alt tank' }).list, 'Alt tank')
  assert.equal(sanitizeBisPrefs({ list: 3 }).list, null)
})

test('the hover compare: board stats either item states, best lane first, ratios only where they swing', () => {
  const setup = { board: { ...uniformBoard('Off'), DEX: 'S' as const, AC: 'C' as const, RATIO_1H: 'A' as const }, step: 4 as const, split: false, caps: {} }
  const rows = compareRows({ DEX: 9, AC: 5, STR: 4, RATIO_1H: 0.4 }, { DEX: 9, AC: 8 }, setup, () => false)
  assert.deepEqual(rows.map((r) => [r.chip, r.best, r.worn, r.ahead]), [['DEX', '+9', '+9', 'same'], ['AC', '+5', '+8', 'worn']], 'STR is Unassigned, the ratio does not swing here')
  assert.equal(compareRows({ RATIO_1H: 0.4 }, {}, setup, () => true)[0].worn, '-')
})

test('the haste note says why haste counted less: it does not stack', () => {
  assert.equal(hasteNote(36, 36, 21), undefined)
  assert.equal(hasteNote(undefined, 0, 30), undefined)
  assert.match(hasteNote(30, 0, 36) ?? '', /does not count, another slot gives 36%/)
  assert.match(hasteNote(41, 5, 36) ?? '', /only 5% counts/)
})
test("targets are the board's caps: set several, clear one, tanking resists, the stat cap kept (owner)", () => {
  const setup = activeSetup(DEFAULT_BIS_PREFS, ['WAR'])
  const p = withCaps({ ...DEFAULT_BIS_PREFS, caps: { DEX: 300 } }, setup, { ...tankResistTargets(false), STR: 510, DEX: undefined, RATIO_1H: 2 })
  assert.deepEqual(p.caps, { RESISTS: 200, STR: 510 }, 'DEX cleared, no target on a ratio')
  assert.notEqual(p.board, null, "the board becomes the player's own, as a single cap does")
  assert.deepEqual(Object.keys(tankResistTargets(true)).sort(), ['SV_COLD', 'SV_DISEASE', 'SV_FIRE', 'SV_MAGIC', 'SV_POISON'])
  assert.ok(!CAPPED_ATTRIBUTES.includes('STA'), 'STA lives inside HP')
  assert.equal(DEFAULT_BIS_PREFS.targets, false, 'off by default')
  assert.equal(sanitizeBisPrefs({ targets: true, statCap: 540.4 }).statCap, 540)
  assert.equal(sanitizeBisPrefs({ statCap: -3 }).statCap, LEGENDS_STAT_CAP)
  const rows = totalsRows({ STR: 400 }, { STR: 520 }, { ...setup, caps: { STR: 510, RESISTS: 200 } })
  const res = rows.find((r) => r.chip === 'RESISTS')
  assert.equal(res?.capValue, 200, 'a target shows even when neither loadout states the stat')
  assert.equal(rows.find((r) => r.chip === 'STR')?.wornReached, true)
})
